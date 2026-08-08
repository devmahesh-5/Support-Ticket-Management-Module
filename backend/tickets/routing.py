from datetime import timedelta
from django.db.models import Count, Q
from django.utils import timezone
from accounts.models import User
from .models import Ticket
from .categories import get_category_route, get_category_sla


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
        "level": 1,
        "is_available": True,
    }
    if target_staff_type:
        filters["staff_type"] = target_staff_type

    assigned = least_loaded_staff(filters)

    if not assigned:
        filters.pop("level", None)
        assigned = least_loaded_staff(filters)

    if not assigned:
        assigned = User.objects.filter(
            role=User.Role.DEPT_ADMIN, department=target_dept,
        ).first()

    if not assigned:
        assigned = User.objects.filter(role=User.Role.CAMPUS_ADMIN).first()

    ticket.assigned_to = assigned

    sla_hours = 24
    if ticket.category:
        resp_hours, res_hours = get_category_sla(ticket.category)
        sla_hours = res_hours or resp_hours or 24

    ticket.sla_deadline = timezone.now() + timedelta(hours=sla_hours)
    ticket.save()
