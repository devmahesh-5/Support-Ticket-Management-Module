from datetime import timedelta
from django.db.models import Count, Q
from django.utils import timezone
from accounts.models import User
from .models import Ticket, RoutingRule


MAX_ACTIVE_TICKETS = 5

ACTIVE_STATUSES = [
    Ticket.Status.OPEN,
    Ticket.Status.IN_PROGRESS,
    Ticket.Status.REOPENED,
    Ticket.Status.ESCALATED_L1,
    Ticket.Status.ESCALATED_L2,
    Ticket.Status.ADMIN_REVIEW,
]


def least_loaded_staff(filters):
    """Pick the available staff member with the fewest active tickets (under the cap)."""
    candidates = User.objects.filter(**filters).annotate(
        active_count=Count(
            "assigned_tickets",
            filter=Q(assigned_tickets__status__in=ACTIVE_STATUSES),
        )
    ).order_by("active_count", "id")
    return candidates.filter(active_count__lt=MAX_ACTIVE_TICKETS).first()


CATEGORY_ROUTES = {
    "Lab Equipment":    {"target_dept": None,   "staff_type": User.StaffType.LAB},
    "Classroom":        {"target_dept": None,   "staff_type": User.StaffType.TEACHER},
    "Network / Internet": {"target_dept": "CIT", "staff_type": User.StaffType.IT},
    "Financial / Fees": {"target_dept": "FIN",  "staff_type": User.StaffType.FINANCE},
    "Academic":         {"target_dept": "ACA",  "staff_type": User.StaffType.ACADEMIC},
    "Library":          {"target_dept": "LIB",  "staff_type": User.StaffType.LIBRARY},
    "Hostel / Facilities": {"target_dept": "FAC", "staff_type": User.StaffType.FACILITIES},
    "General / Other":  {"target_dept": "HOD",  "staff_type": None},
}


def get_category_route(category):
    """Resolve a category to its routing target.

    Active RoutingRule wins; falls back to the hardcoded CATEGORY_ROUTES.
    Returns {"target_dept": <dept code or None>, "staff_type": ...} or None.
    """
    if not category:
        return None

    rule = RoutingRule.objects.filter(
        category=category, is_active=True
    ).order_by("priority").first()

    if rule:
        base = CATEGORY_ROUTES.get(category.name, {})
        return {
            "target_dept": None if rule.target_department == "SELF" else rule.target_department,
            "staff_type": base.get("staff_type"),
        }

    return CATEGORY_ROUTES.get(category.name)


def assign_ticket(ticket):
    if not ticket.department and not ticket.category:
        ticket.assigned_to = User.objects.filter(role=User.Role.CAMPUS_ADMIN).first()
        ticket.save()
        return

    route = get_category_route(ticket.category)

    if route and route["target_dept"] == "HOD":
        ticket.assigned_to = User.objects.filter(
            role=User.Role.DEPT_ADMIN, department=ticket.department,
        ).first()
        if not ticket.assigned_to:
            ticket.assigned_to = User.objects.filter(role=User.Role.CAMPUS_ADMIN).first()
        ticket.sla_deadline = timezone.now() + timedelta(hours=24)
        ticket.save()
        return

    target_dept = ticket.department
    target_staff_type = None

    if route:
        if route["target_dept"]:
            target_dept = route["target_dept"]
        target_staff_type = route["staff_type"]

    if not target_dept:
        ticket.assigned_to = User.objects.filter(role=User.Role.CAMPUS_ADMIN).first()
        ticket.save()
        return

    filters = {
        "role": User.Role.STAFF,
        "department": target_dept,
        "is_available": True,
    }
    if target_staff_type:
        filters["staff_type"] = target_staff_type

    assigned = least_loaded_staff(filters)

    if not assigned and target_staff_type:
        del filters["staff_type"]
        assigned = least_loaded_staff(filters)

    if not assigned:
        assigned = User.objects.filter(
            role=User.Role.DEPT_ADMIN, department=target_dept,
        ).first()

    if not assigned:
        assigned = User.objects.filter(role=User.Role.CAMPUS_ADMIN).first()

    ticket.assigned_to = assigned

    sla_hours = 24
    if ticket.priority == Ticket.Priority.CRITICAL:
        sla_hours = 4
    elif ticket.priority == Ticket.Priority.HIGH:
        sla_hours = 8
    elif ticket.category and ticket.category.sla_response_hours:
        sla_hours = ticket.category.sla_response_hours

    ticket.sla_deadline = timezone.now() + timedelta(hours=sla_hours)
    ticket.save()
