from datetime import timedelta

from django.db.models import Count, Q
from django.utils import timezone

from accounts.models import User
from .models import Ticket, get_category_sla


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
    """Route a freshly created ticket to the responsible TEAM LEAD.

    Routing is driven purely by the ticket's department + sub-department:
    the sub-department's lead receives the ticket and assigns it to one of
    their staff. Fallbacks: department HOD -> campus admin. The category is
    never consulted for routing (it only defines the SLA clock).
    """
    if not ticket.department and not ticket.sub_department_id:
        ticket.assigned_to = User.objects.filter(role=User.Role.CAMPUS_ADMIN).first()
        ticket.save()
        return

    assigned = None
    team = ticket.sub_department
    if team:
        lead = team.lead
        if lead and lead.is_active and lead.is_available:
            assigned = lead

    if assigned is None:
        # No team / no lead configured: go to the department HOD, else the
        # campus admin.
        assigned = User.objects.filter(
            role=User.Role.DEPT_ADMIN, department=ticket.department,
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
