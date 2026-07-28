from datetime import timedelta
from django.utils import timezone
from accounts.models import User
from .models import Ticket


CATEGORY_ROUTES = {
    "Lab Equipment":    {"target_dept": None,   "staff_type": User.StaffType.LAB},
    "Classroom":        {"target_dept": None,   "staff_type": User.StaffType.TEACHER},
    "Network / Internet": {"target_dept": "CIT", "staff_type": User.StaffType.IT},
    "Financial / Fees": {"target_dept": "FIN",  "staff_type": User.StaffType.FINANCE},
    "Academic":         {"target_dept": "ACA",  "staff_type": User.StaffType.ACADEMIC},
    "Library":          {"target_dept": "LIB",  "staff_type": User.StaffType.LIBRARY},
    "Hostel / Facilities": {"target_dept": "FAC", "staff_type": User.StaffType.FACILITIES},
    "General / Other":  {"target_dept": None,   "staff_type": None},
}


def assign_ticket(ticket):
    if not ticket.department and not ticket.category:
        ticket.assigned_to = User.objects.filter(role=User.Role.CAMPUS_ADMIN).first()
        ticket.save()
        return

    route = None
    if ticket.category:
        route = CATEGORY_ROUTES.get(ticket.category.name)

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

    assigned = User.objects.filter(**filters).order_by("id").first()

    if not assigned and target_staff_type:
        del filters["staff_type"]
        assigned = User.objects.filter(**filters).order_by("id").first()

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
