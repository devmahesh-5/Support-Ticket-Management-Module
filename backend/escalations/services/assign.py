"""Assignment actions executed by the escalation engine.

Reuses the existing least-loaded staff routing from tickets.routing so the
policy engine stays consistent with the rest of the system.
"""

from django.utils import timezone

from accounts.models import User
from tickets.models import StatusLog, Ticket
from tickets.routing import least_loaded_staff

from ..models import EscalationHistory, EscalationPolicy, SupportQueue, TicketAssignmentStage
from .notify import METHOD_IN_APP, notify_user, policy_methods

ESCALATED_STATUSES = [
    Ticket.Status.ESCALATED_L1,
    Ticket.Status.ESCALATED_L2,
    Ticket.Status.ADMIN_REVIEW,
]

MAX_LEVEL = 3
CAMPUS_ADMIN_LEVEL = 4  # sentinel staff level: the campus admin (Admin Review)


def escalation_level_for_assignee(assignee):
    """Map an assigned user onto the ticket escalation_level chain.

    escalation_level is the chain position (0 = L1 staff, 1 = L2 staff,
    2 = department HOD, 3 = campus admin). Explicitly-assigned tickets keep
    the chain position of their assignee so later escalation hops correctly
    from L2 -> HOD -> admin instead of re-starting at L1.
    """
    if not assignee:
        return 0
    if assignee.role == User.Role.CAMPUS_ADMIN:
        return MAX_LEVEL
    if assignee.role == User.Role.DEPT_ADMIN:
        return 2
    if assignee.role == User.Role.STAFF:
        return max(int(assignee.level or 1) - 1, 0)
    return 0


def status_for_level(level):
    """Map a staff escalation level onto existing ticket statuses."""
    if level <= 0:
        return Ticket.Status.IN_PROGRESS
    if level == 1:
        return Ticket.Status.ESCALATED_L1
    if level == 2:
        return Ticket.Status.ESCALATED_L2
    return Ticket.Status.ADMIN_REVIEW


def next_support_level(ticket, preferred=None, policy=None):
    """Resolve the target staff level for the assignee (1-4, User.level).

    Levels 1-2 are L1/L2 staff, 3 is the department HOD and 4 (the
    ``CAMPUS_ADMIN_LEVEL`` sentinel) is the campus admin. An explicit
    preferred level wins. Otherwise the matching policy's ``to_level`` drives
    the hop, falling back to one staff level up. Never returns the current
    staff level.
    """
    current_staff = (ticket.escalation_level or 0) + 1
    if preferred:
        return min(int(preferred), CAMPUS_ADMIN_LEVEL)
    if policy and policy.to_level:
        target = int(policy.to_level)
    else:
        target = current_staff + 1
    if target <= current_staff:
        target = current_staff + 1
    return min(target, CAMPUS_ADMIN_LEVEL)


def resolve_assignee(level=None, queue=None, department=None, user=None, ticket=None):
    """Pick an assignee user from a staff level, queue, department or explicit user.

    Staff levels map onto User.level:
      - Level 1 and 2 -> least-loaded available staff whose User.level matches.
      - Level 3       -> the department HOD (DEPT_ADMIN).
      - Level 4       -> the campus admin (top of the chain, Admin Review).
    """
    if user:
        return user
    if level:
        level = int(level)
        if level >= CAMPUS_ADMIN_LEVEL:
            return User.objects.filter(role=User.Role.CAMPUS_ADMIN).first()
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
    dept = _target_department(ticket)
    if dept:
        return User.objects.filter(
            role=User.Role.DEPT_ADMIN, department=dept
        ).first()
    return User.objects.filter(role=User.Role.CAMPUS_ADMIN).first()


def _category_route(ticket):
    """The routing target for the ticket's category (same rule as routing)."""
    from tickets.routing import get_category_route
    if not ticket or not ticket.category:
        return None
    return get_category_route(ticket.category)


def _target_department(ticket):
    """The department actually handling the ticket: the category's routed
    department when one is set (e.g. Network -> CIT), else the ticket's own
    department."""
    route = _category_route(ticket)
    if route and route.get("target_dept") and route["target_dept"] != "HOD":
        return route["target_dept"]
    if ticket:
        return ticket.department
    return None


def _department_hod(ticket):
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


def _category_staff_type(ticket):
    """The staff specialty implied by the ticket's category (same rule as routing)."""
    route = _category_route(ticket)
    return route.get("staff_type") if route else None


def _level_staff(level, ticket):
    """Least-loaded available STAFF at the target level who also matches the
    ticket's category staff type, scoped to the routed department. Returns
    None so resolve_assignee can fall back to the HOD when no suitable
    upper-level staff exists."""
    route = _category_route(ticket)
    if route and route.get("target_dept") == "HOD":
        # Categories that route to the department HOD (e.g. General / Other)
        # have no staff chain - escalate straight to the HOD.
        return None
    filters = {
        "role": User.Role.STAFF,
        "level": level,
        "is_available": True,
    }
    dept = _target_department(ticket)
    if dept:
        filters["department"] = dept
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

    if policy is None:
        from .policies import attach_policy
        policy = attach_policy(ticket)

    level = next_support_level(ticket, preferred=level, policy=policy)

    assignee = resolve_assignee(
        level=level, queue=queue, department=department, user=user, ticket=ticket
    )

    previous_level = ticket.escalation_level or 0
    previous_assignee = ticket.assigned_to
    ticket.escalation_level = min(max(level - 1, previous_level + 1), MAX_LEVEL)
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
        methods=policy_methods(policy) if policy else [METHOD_IN_APP],
        message=note or f"Escalated to level {ticket.escalation_level}",
    )
    return assignee


def _deescalation_target(ticket, policy=None):
    """Reverse of the escalation policy: the escalation level a ticket returns to.

    For a ticket currently at escalation level N (assigned staff level N+1),
    find the enabled policy that escalated INTO that staff level
    (``to_level == N+1``); de-escalating returns it to that policy's
    ``from_level`` staff, i.e. escalation level ``from_level - 1`` (an
    L1 -> L2 policy reverses to L2 -> L1, level 1 -> 0). Falls back to one
    level down when no policy governs the current level.
    """
    current = ticket.escalation_level or 0
    if current <= 1:
        return 0

    current_staff = current + 1
    policies = []
    if policy and policy.to_level == current_staff:
        policies.append(policy)
    policies.extend(EscalationPolicy.objects.filter(is_enabled=True, to_level=current_staff))

    target_staff = current_staff - 1
    for p in policies:
        if p.department and p.department != ticket.department:
            continue
        if p.category and p.category != ticket.category:
            continue
        if p.priority and p.priority != ticket.priority:
            continue
        if p.from_level:
            target_staff = p.from_level
        break
    return max(0, target_staff - 1)


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

    target_staff = target_level + 1
    if target_level == 0:
        assignee = resolve_assignee(level=target_staff, ticket=ticket)
        ticket.status = Ticket.Status.IN_PROGRESS
    else:
        assignee = resolve_assignee(level=target_staff, ticket=ticket)
        ticket.status = status_for_level(target_level)

    previous_level = current
    ticket.escalation_level = target_level
    if assignee:
        ticket.assigned_to = assignee
    ticket.last_activity_at = now
    ticket.save()

    TicketAssignmentStage.objects.update(ticket=ticket, is_current=False)
    TicketAssignmentStage.objects.create(
        ticket=ticket, level=target_staff, queue=ticket.queue,
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
        methods=policy_methods(policy) if policy else [METHOD_IN_APP],
        message=note or f"De-escalated to level {ticket.escalation_level}",
        title="Ticket de-escalated to you",
    )
    return assignee


def _notify_escalation(ticket, assignee, previous_assignee=None, methods=None, message="", title="Ticket escalated to you"):
    """Dispatch real-time escalation notifications.

    Channels come from the governing escalation policy (in-app / email / SMS
    toggles); when no policy governs the hop we fall back to in-app only (the
    previous default behaviour). Recipients: the new assignee, the previous
    assignee (if any) and the ticket creator."""
    methods = methods or [METHOD_IN_APP]

    notified = set()
    if assignee:
        notified.add(assignee.id)
        notify_user(
            user=assignee,
            title=title,
            message=f"Ticket '{ticket.title}' - {message}",
            ticket=ticket,
            notification_type="ESCALATION",
            methods=methods,
        )
    if previous_assignee and previous_assignee.id not in notified:
        notified.add(previous_assignee.id)
        notify_user(
            user=previous_assignee,
            title="Ticket escalated away from you",
            message=f"Ticket '{ticket.title}' - {message}",
            ticket=ticket,
            notification_type="ESCALATION",
            methods=methods,
        )
    creator = ticket.created_by
    if creator and creator.id not in notified and creator != previous_assignee:
        notify_user(
            user=creator,
            title="Ticket escalated",
            message=f"Ticket '{ticket.title}' - {message}",
            ticket=ticket,
            notification_type="ESCALATION",
            methods=methods,
        )


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

    methods = policy_methods(policy) if policy else [METHOD_IN_APP]
    recipients = set()
    manager = _department_hod(ticket)
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
            methods=methods,
        )
    return queue
