from datetime import timedelta
from django.utils import timezone
from accounts.models import User
from .models import Ticket


def assign_ticket(ticket):
    category_name = ticket.category.name.lower() if ticket.category else ""

    dept_mapping = {
        "internet": "CIT", "network": "CIT", "technical": "CIT",
        "hardware": "CIT", "lab": "CIT",
        "academic": "ACADEMIC", "grade": "ACADEMIC", "registration": "ACADEMIC", "exam": "ACADEMIC",
        "financial": "FINANCE", "fee": "FINANCE", "payment": "FINANCE", "scholarship": "FINANCE",
        "library": "LIBRARY",
        "hostel": "FACILITIES", "facility": "FACILITIES",
    }

    target_dept = None
    for keyword, dept in dept_mapping.items():
        if keyword in category_name:
            target_dept = dept
            break

    if not target_dept and ticket.department:
        target_dept = "HOD"

    if not target_dept:
        ticket.assigned_to = User.objects.filter(role=User.Role.CAMPUS_ADMIN).first()
        ticket.save()
        return

    if target_dept in dept_mapping.values():
        if ticket.department:
            available_staff = User.objects.filter(
                role=User.Role.STAFF, department=ticket.department,
                is_available=True,
            ).order_by("id")
            if available_staff.exists():
                ticket.assigned_to = available_staff.first()
            else:
                hod = User.objects.filter(
                    role=User.Role.DEPT_ADMIN, department=ticket.department,
                ).first()
                ticket.assigned_to = hod
        else:
            available_staff = User.objects.filter(
                role=User.Role.STAFF, is_available=True,
            ).order_by("id")
            if available_staff.exists():
                ticket.assigned_to = available_staff.first()
            else:
                admins = User.objects.filter(
                    role__in=[User.Role.DEPT_ADMIN, User.Role.CAMPUS_ADMIN]
                ).first()
                ticket.assigned_to = admins
    else:
        if ticket.department:
            hod = User.objects.filter(
                role=User.Role.DEPT_ADMIN, department=ticket.department,
            ).first()
            ticket.assigned_to = hod

    sla_hours = 24
    if ticket.priority == Ticket.Priority.CRITICAL:
        sla_hours = 4
    elif ticket.priority == Ticket.Priority.HIGH:
        sla_hours = 8
    elif ticket.category and ticket.category.sla_response_hours:
        sla_hours = ticket.category.sla_response_hours

    ticket.sla_deadline = timezone.now() + timedelta(hours=sla_hours)
    ticket.save()
