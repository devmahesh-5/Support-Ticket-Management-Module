"""Assignment actions executed by the escalation engine.

Escalation ladder: Level 0 = staff, Level 1 = team lead, Level 2 = department
HOD, Level 3 = campus admin. ``ticket.escalation_level`` stores the current
handler's hierarchy level directly (0 while owned by a staff member).
"""

from django.utils import timezone

from accounts.models import User
from tickets.models import StatusLog, Ticket
from tickets.routing import least_loaded_staff

from ..models import EscalationHistory, EscalationPolicy, SupportQueue, TicketAssignmentStage
from notifications.services import notify_user

ESCALATED_STATUSES = [
    Ticket.Status.ESCALATED_L1,
    Ticket.Status.ESCALATED_L2,
    Ticket.Status.ADMIN_REVIEW,
]

STAFF_LEVEL = 0
TEAM_LEAD_LEVEL = 1
HOD_LEVEL = 2
MAX_LEVEL = 3
CAMPUS_ADMIN_LEVEL = MAX_LEVEL  # top of the chain (Admin Review)


def escalation_level_for_assignee(assignee):
    """Map an assigned user onto the ticket escalation_level chain.

    escalation_level equals the assignee's hierarchy level: 0 = staff,
    1 = team lead, 2 = department HOD, 3 = campus admin. Explicitly-assigned
    tickets keep the chain position of their assignee so later hops move
    correctly up/down the ladder.
    """
    if not assignee:
        return STAFF_LEVEL
    if assignee.role == User.Role.CAMPUS_ADMIN:
        return MAX_LEVEL
    if assignee.role == User.Role.DEPT_ADMIN:
        return HOD_LEVEL
    if assignee.role == User.Role.TEAM_LEAD:
        return TEAM_LEAD_LEVEL
    if assignee.role == User.Role.STAFF:
        return max(int(assignee.level or 0), STAFF_LEVEL)
    return STAFF_LEVEL


def status_for_level(level):
    """Map an escalation chain position onto existing ticket statuses."""
    if level <= 0:
        return Ticket.Status.IN_PROGRESS
    if level == 1:
        return Ticket.Status.ESCALATED_L1
    if level == 2:
        return Ticket.Status.ESCALATED_L2
    return Ticket.Status.ADMIN_REVIEW


def next_support_level(ticket, preferred=None, policy=None):
    """Resolve the target handler level (0-3) for an escalation hop.

    An explicit preferred level wins. Otherwise the matching policy's
    ``to_level`` drives the hop, falling back to one level up. Never returns
    the current level or below, and never exceeds ``CAMPUS_ADMIN_LEVEL``.
    """
    current = ticket.escalation_level or 0
    if preferred is not None:
        target = int(preferred)
    elif policy is not None and policy.to_level is not None:
        target = int(policy.to_level)
    else:
        target = current + 1
    if target <= current:
        target = current + 1
    return min(target, CAMPUS_ADMIN_LEVEL)


def resolve_assignee(level=None, queue=None, department=None, user=None, ticket=None):
    """Pick an assignee user from a handler level, queue, department or explicit user.

    Handler levels map onto roles/teams:
      - Level 0       -> least-loaded member of the ticket's team.
      - Level 1       -> the team lead of the ticket's team.
      - Level 2       -> the department HOD (DEPT_ADMIN).
      - Level 3       -> the campus admin (top of the chain, Admin Review).
    """
    if user:
        return user
    if level is not None:
        level = int(level)
        assignee = None
        if level >= CAMPUS_ADMIN_LEVEL:
            assignee = User.objects.filter(role=User.Role.CAMPUS_ADMIN).first()
        elif level >= HOD_LEVEL:
            assignee = department_hod_for_ticket(ticket)
        elif level >= TEAM_LEAD_LEVEL:
            assignee = team_lead_for_ticket(ticket)
            if assignee is None:
                assignee = department_hod_for_ticket(ticket)
        else:
            assignee = _team_member(ticket)
            if assignee is None:
                assignee = team_lead_for_ticket(ticket)
        if assignee:
            return assignee
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
    dept = _target_department(ticket)
    if dept:
        hod = User.objects.filter(
            role=User.Role.DEPT_ADMIN, department=dept
        ).first()
        if hod:
            return hod
    return User.objects.filter(role=User.Role.CAMPUS_ADMIN).first()


def _target_department(ticket):
    """The department handling the ticket (set explicitly at creation)."""
    if ticket is None:
        return None
    return ticket.department


def _handling_team(ticket):
    """The team (sub-department) stamped on the ticket at creation."""
    if ticket is None:
        return None
    return ticket.sub_department


def department_hod_for_ticket(ticket):
    """The HOD (DEPT_ADMIN) for the department handling the ticket, else a
    campus admin."""
    dept = _target_department(ticket)
    if dept:
        hod = User.objects.filter(
            role=User.Role.DEPT_ADMIN, department=dept
        ).first()
        if hod:
            return hod
    return User.objects.filter(role=User.Role.CAMPUS_ADMIN).first()


def team_lead_for_ticket(ticket):
    """The team lead of the ticket's handling team. Returns None when there is
    no team, no lead or the lead is inactive/unavailable so callers can fall
    through to the HOD."""
    team = _handling_team(ticket)
    if team is None:
        return None
    lead = team.lead
    if lead and lead.is_active and lead.is_available:
        return lead
    return None


def _team_member(ticket):
    """Least-loaded available member of the ticket's team (used when handing
    a ticket down to staff, e.g. on de-escalation)."""
    team = _handling_team(ticket)
    if team is None:
        return None
    return least_loaded_staff({
        "role": User.Role.STAFF,
        "sub_department": team,
        "is_available": True,
    })


def escalate_ticket(ticket, policy=None, level=None, queue=None, user=None, department=None,
                    actor=None, note="", now=None):
    """Escalate a ticket to the target level/queue/user and record everything."""
    from .audit import log

    now = now or timezone.now()
    if ticket.status in (Ticket.Status.RESOLVED, Ticket.Status.CLOSED):
        return None

    if policy is None:
        from .policies import attach_policy
        policy = attach_policy(ticket)

    level = next_support_level(ticket, preferred=level, policy=policy)

    assignee = resolve_assignee(
        level=level, queue=queue, department=department, user=user, ticket=ticket
    )

    previous_level = ticket.escalation_level or 0
    previous_assignee = ticket.assigned_to
    ticket.escalation_level = min(max(level, previous_level + 1), MAX_LEVEL)
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
    _notify_escalation(
        ticket, assignee=assignee, previous_assignee=previous_assignee,
        message=note or f"Escalated to level {ticket.escalation_level}",
    )
    return assignee


def _deescalation_target(ticket, policy=None):
    """Reverse of the escalation policy: the escalation level a ticket returns to.

    For a ticket currently handled at escalation level N, find the enabled
    policy that escalates INTO that level (``to_level == N``); de-escalating
    returns it to that policy's ``from_level``. Falls back to one level down
    when no policy governs the current level.
    """
    current = ticket.escalation_level or 0
    if current <= 0:
        return 0

    policies = []
    if policy is not None and policy.to_level == current:
        policies.append(policy)
    policies.extend(EscalationPolicy.objects.filter(is_enabled=True, to_level=current))

    target_level = current - 1
    for p in policies:
        if p.department and p.department != ticket.department:
            continue
        if p.category and p.category != ticket.category:
            continue
        if p.priority and p.priority != ticket.priority:
            continue
        if p.from_level is not None:
            target_level = min(p.from_level, current - 1)
        break
    return max(0, target_level)


def deescalate_ticket(ticket, policy=None, level=None, actor=None, note="", now=None):
    """De-escalate a ticket back to the level below its current escalation
    policy, reassigning to matching staff at that level. Returns None when the
    ticket is already at the lowest level."""
    from .audit import log

    now = now or timezone.now()
    if ticket.status in (Ticket.Status.RESOLVED, Ticket.Status.CLOSED):
        return None

    current = ticket.escalation_level or 0
    if current < 1:
        return None

    target_level = int(level) if level is not None else _deescalation_target(ticket, policy)
    if target_level >= current:
        return None

    if target_level == 0:
        assignee = resolve_assignee(level=target_level, ticket=ticket)
        ticket.status = Ticket.Status.IN_PROGRESS
    else:
        assignee = resolve_assignee(level=target_level, ticket=ticket)
        ticket.status = status_for_level(target_level)

    previous_level = current
    ticket.escalation_level = target_level
    if assignee:
        ticket.assigned_to = assignee
    ticket.last_activity_at = now
    ticket.save()

    TicketAssignmentStage.objects.update(ticket=ticket, is_current=False)
    TicketAssignmentStage.objects.create(
        ticket=ticket, level=target_level, queue=ticket.queue,
        assigned_user=assignee, is_current=True, notes=note,
    )

    StatusLog.objects.create(
        ticket=ticket, from_status="", to_status=ticket.status,
        changed_by=actor, note=note or f"De-escalated to level {ticket.escalation_level}",
    )

    log(
        ticket=ticket, action=EscalationHistory.Action.DE_ESCALATED,
        policy=policy, actor=actor,
        message=note or f"De-escalated to level {ticket.escalation_level}",
        details={
            "level": target_level,
            "assignee": getattr(assignee, "username", None),
            "previous_level": previous_level,
        },
    )
    if assignee:
        log(
            ticket=ticket, action=EscalationHistory.Action.ASSIGNMENT_CHANGED,
            policy=policy, actor=actor,
            message=f"Assigned to {assignee.get_full_name() or assignee.username}",
            details={"assignee": assignee.username},
        )
    _notify_escalation(
        ticket, assignee=assignee,
        message=note or f"De-escalated to level {ticket.escalation_level}",
        title="Ticket de-escalated to you",
    )
    return assignee


def _notify_escalation(ticket, assignee, previous_assignee=None, message="", title="Ticket escalated to you"):
    """Dispatch real-time escalation notifications.

    Every notification goes out via in-app + email. Recipients: the new
    assignee, the previous assignee (if any) and the ticket creator."""
    notified = set()
    if assignee:
        notified.add(assignee.id)
        notify_user(
            user=assignee,
            title=title,
            message=f"Ticket '{ticket.title}' - {message}",
            ticket=ticket,
            notification_type="ESCALATION",
        )
    if previous_assignee and previous_assignee.id not in notified:
        notified.add(previous_assignee.id)
        notify_user(
            user=previous_assignee,
            title="Ticket escalated away from you",
            message=f"Ticket '{ticket.title}' - {message}",
            ticket=ticket,
            notification_type="ESCALATION",
        )
    creator = ticket.created_by
    if creator and creator.id not in notified and creator != previous_assignee:
        notify_user(
            user=creator,
            title="Ticket escalated",
            message=f"Ticket '{ticket.title}' - {message}",
            ticket=ticket,
            notification_type="ESCALATION",
        )


def get_escalation_queue():
    """Return the fixed escalation queue, creating it if missing.

    There is exactly one escalation queue in the system; tickets are moved
    into it by the engine. Never creates more than one.
    """
    queue = SupportQueue.objects.filter(is_escalation_queue=True).first()
    if queue is not None:
        return queue
    queue, _ = SupportQueue.objects.get_or_create(
        name="Escalation Queue",
        defaults={
            "description": "Fixed escalation queue; tickets land here after an SLA breach when auto-escalation is off.",
            "is_escalation_queue": True,
            "is_active": True,
        },
    )
    if not queue.is_escalation_queue:
        queue.is_escalation_queue = True
        queue.save(update_fields=["is_escalation_queue"])
    return queue


def add_to_escalation_queue(ticket, policy=None, actor=None, now=None):
    from .audit import log

    now = now or timezone.now()
    queue = get_escalation_queue()

    if ticket.queue_id == queue.id and ticket.assigned_to_id is None:
        return queue

    ticket.queue = queue
    ticket.assigned_to = None
    ticket.last_activity_at = now
    ticket.save()

    TicketAssignmentStage.objects.update(ticket=ticket, is_current=False)
    TicketAssignmentStage.objects.create(
        ticket=ticket, queue=queue, assigned_user=None,
        is_current=True, notes="Added to escalation queue (unassigned)",
    )

    log(
        ticket=ticket, action=EscalationHistory.Action.QUEUE_CHANGED,
        policy=policy, actor=actor,
        message=f"Added to escalation queue '{queue.name}'",
        details={"queue": queue.name},
    )
    log(
        ticket=ticket, action=EscalationHistory.Action.ASSIGNMENT_CHANGED,
        policy=policy, actor=actor,
        message="Unassigned; awaiting assignment from the escalation queue",
        details={"assignee": None},
    )

    recipients = set()
    manager = department_hod_for_ticket(ticket)
    if manager:
        recipients.add(manager)
    if ticket.created_by:
        recipients.add(ticket.created_by)
    for recipient in recipients:
        notify_user(
            user=recipient,
            title="Ticket added to escalation queue",
            message=f"Ticket '{ticket.title}' breached its SLA and needs attention in the escalation queue.",
            ticket=ticket,
            notification_type="ESCALATION",
        )
    return queue
