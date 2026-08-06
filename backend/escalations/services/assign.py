"""Assignment actions executed by the escalation engine.

Reuses the existing least-loaded staff routing from tickets.routing so the
policy engine stays consistent with the rest of the system.
"""

from django.utils import timezone

from accounts.models import User
from tickets.models import StatusLog, Ticket
from tickets.routing import least_loaded_staff

from ..models import EscalationHistory, SupportQueue, TicketAssignmentStage

ESCALATED_STATUSES = [
    Ticket.Status.ESCALATED_L1,
    Ticket.Status.ESCALATED_L2,
    Ticket.Status.ADMIN_REVIEW,
]

MAX_LEVEL = 3


def status_for_level(level):
    """Map a staff escalation level onto existing ticket statuses."""
    if level <= 1:
        return Ticket.Status.ESCALATED_L1
    if level == 2:
        return Ticket.Status.ESCALATED_L2
    return Ticket.Status.ADMIN_REVIEW


def next_support_level(ticket, preferred=None):
    """Resolve the target staff level: preferred (policy) or next level after current."""
    if preferred:
        return int(preferred)
    nxt = (ticket.escalation_level or 0) + 1
    return min(nxt, MAX_LEVEL)


def resolve_assignee(level=None, queue=None, department=None, user=None, ticket=None):
    """Pick an assignee user from a staff level, queue, department or explicit user.

    Staff levels map onto User.level:
      - Level 1 and 2 -> least-loaded available staff whose User.level matches.
      - Level 3       -> the department HOD (DEPT_ADMIN), the top of the chain.
    """
    if user:
        return user
    if level:
        level = int(level)
        if level >= 3:
            hod = _department_hod(ticket)
            if hod:
                return hod
        staff = _level_staff(level, ticket)
        if staff:
            return staff
        hod = _department_hod(ticket)
        if hod:
            return hod
    if queue:
        member = queue.members.filter(is_available=True).first()
        if member:
            return member
    if department:
        staff = least_loaded_staff({
            "role": User.Role.STAFF,
            "department": department,
            "is_available": True,
        })
        if staff:
            return staff
        dept_admin = User.objects.filter(
            role=User.Role.DEPT_ADMIN, department=department
        ).first()
        if dept_admin:
            return dept_admin
    if ticket and ticket.department:
        return User.objects.filter(
            role=User.Role.DEPT_ADMIN, department=ticket.department
        ).first()
    return User.objects.filter(role=User.Role.CAMPUS_ADMIN).first()


def _department_hod(ticket):
    """The HOD (DEPT_ADMIN) for the ticket's department, else a campus admin."""
    if ticket and ticket.department:
        hod = User.objects.filter(
            role=User.Role.DEPT_ADMIN, department=ticket.department
        ).first()
        if hod:
            return hod
    return User.objects.filter(role=User.Role.CAMPUS_ADMIN).first()


def _category_staff_type(ticket):
    """The staff specialty implied by the ticket's category (same rule as routing)."""
    from tickets.routing import get_category_route
    if not ticket or not ticket.category_id:
        return None
    route = get_category_route(ticket.category)
    return route.get("staff_type") if route else None


def _level_staff(level, ticket):
    """Least-loaded available STAFF at the target level who also matches the
    ticket's category staff type. Returns None so resolve_assignee can fall
    back to the HOD when no suitable upper-level staff exists."""
    filters = {
        "role": User.Role.STAFF,
        "level": level,
        "is_available": True,
    }
    if ticket and ticket.department:
        filters["department"] = ticket.department
    staff_type = _category_staff_type(ticket)
    if staff_type:
        filters["staff_type"] = staff_type
    return least_loaded_staff(filters)


def escalate_ticket(ticket, policy=None, level=None, queue=None, user=None, department=None,
                    actor=None, note="", now=None):
    """Escalate a ticket to the target level/queue/user and record everything."""
    from .audit import log

    now = now or timezone.now()
    if ticket.status in (Ticket.Status.RESOLVED, Ticket.Status.CLOSED):
        return None
    level = next_support_level(ticket, preferred=level)

    assignee = resolve_assignee(
        level=level, queue=queue, department=department, user=user, ticket=ticket
    )

    previous_level = ticket.escalation_level or 0
    ticket.escalation_level = level
    if queue:
        ticket.queue = queue
    if assignee:
        ticket.assigned_to = assignee
    ticket.status = status_for_level(ticket.escalation_level)
    ticket.last_activity_at = now
    ticket.save()

    TicketAssignmentStage.objects.update(ticket=ticket, is_current=False)
    TicketAssignmentStage.objects.create(
        ticket=ticket, level=level, queue=queue,
        assigned_user=assignee, is_current=True, notes=note,
    )

    StatusLog.objects.create(
        ticket=ticket, from_status="", to_status=ticket.status,
        changed_by=actor, note=note or f"Escalated to level {ticket.escalation_level}",
    )

    log(
        ticket=ticket, action=EscalationHistory.Action.ESCALATED,
        policy=policy, actor=actor,
        message=note or f"Escalated to level {ticket.escalation_level}",
        details={
            "level": level,
            "queue": queue.name if queue else None,
            "assignee": getattr(assignee, "username", None),
            "previous_level": previous_level,
        },
    )
    if queue:
        log(
            ticket=ticket, action=EscalationHistory.Action.QUEUE_CHANGED,
            policy=policy, actor=actor,
            message=f"Added to queue '{queue.name}'",
            details={"queue": queue.name},
        )
    if assignee:
        log(
            ticket=ticket, action=EscalationHistory.Action.ASSIGNMENT_CHANGED,
            policy=policy, actor=actor,
            message=f"Assigned to {assignee.get_full_name() or assignee.username}",
            details={"assignee": assignee.username},
        )
    return assignee


def add_to_escalation_queue(ticket, policy=None, actor=None, now=None):
    from .audit import log

    now = now or timezone.now()
    queue = SupportQueue.objects.filter(
        is_escalation_queue=True, is_active=True
    ).first()
    if queue is None:
        queue = SupportQueue.objects.filter(name__icontains="escalation").first()

    ticket.queue = queue
    ticket.last_activity_at = now
    ticket.save()

    TicketAssignmentStage.objects.update(ticket=ticket, is_current=False)
    TicketAssignmentStage.objects.create(
        ticket=ticket, queue=queue, assigned_user=None,
        is_current=True, notes="Added to escalation queue",
    )

    log(
        ticket=ticket, action=EscalationHistory.Action.QUEUE_CHANGED,
        policy=policy, actor=actor,
        message=f"Added to escalation queue '{queue.name}'" if queue else "Added to escalation queue (no queue configured)",
        details={"queue": queue.name if queue else None},
    )
    return queue
