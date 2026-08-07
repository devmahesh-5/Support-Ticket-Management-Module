"""Configuration-driven SLA evaluation + escalation engine.

This is the heart of the module: every behavior (deadlines, thresholds,
pause rules, auto escalation, priority mapping, IF/THEN rules) is driven by
EscalationPolicy / EscalationRule configuration. No hardcoded SLA values.
"""

from datetime import timedelta

from django.utils import timezone

from tickets.models import StatusLog, Ticket

from ..models import EscalationHistory, EscalationPolicy, EscalationRule
from . import assign as assign_svc
from .audit import already_logged, log
from .notify import notify_user, policy_methods
from .policies import attach_policy

ACTIVE_STATUSES = [
    Ticket.Status.OPEN,
    Ticket.Status.REOPENED,
    Ticket.Status.ESCALATED_L1,
    Ticket.Status.ESCALATED_L2,
    Ticket.Status.ADMIN_REVIEW,
]

RULE_ACTIONS = {
    "escalate_now",
    "increase_priority",
    "notify",
    "assign_user",
    "assign_level",
    "add_to_escalation_queue",
}

PRIORITY_CHOICES = {p[0] for p in Ticket.Priority.choices}


def run_engine(ticket_ids=None, now=None):
    """Run a full evaluation pass over active tickets."""
    now = now or timezone.now()
    qs = Ticket.objects.filter(status__in=ACTIVE_STATUSES).select_related(
        "escalation_policy", "category", "assigned_to", "created_by"
    )
    if ticket_ids:
        qs = qs.filter(id__in=list(ticket_ids))
    processed = 0
    for ticket in qs.iterator(chunk_size=200):
        evaluate_ticket(ticket, now)
        processed += 1
    return processed


def evaluate_ticket(ticket, now=None):
    """Evaluate a single ticket against its policy and rules."""
    now = now or timezone.now()

    policy = attach_policy(ticket, now=now)
    if policy is None:
        # No policy governs the current staff level. If the ticket already
        # entered the escalation chain and the SLA is still breached, keep
        # stepping upward (e.g. HOD -> campus admin) until the chain ends.
        _auto_step_when_breached(ticket, now)
        return

    ensure_deadlines(ticket, policy, now)

    resp_breached, res_breached, res_pct = _sla_progress(ticket, policy, now)
    breached = resp_breached or res_breached

    if breached and not ticket.sla_breached_at:
        ticket.sla_breached_at = now
        ticket.sla_status = TicketSLAStatus.BREACHED
        log(
            ticket=ticket, action=EscalationHistory.Action.SLA_BREACHED,
            policy=policy,
            message=f"SLA breached (response={resp_breached}, resolution={res_breached})",
            details={"response_breached": resp_breached, "resolution_breached": res_breached},
            key=f"breached:{ticket.sla_breached_at.timestamp():.0f}",
        )
    else:
        approaching_pct = _approaching_threshold(policy)
        if res_pct is not None and res_pct >= approaching_pct:
            ticket.sla_status = TicketSLAStatus.APPROACHING
        else:
            ticket.sla_status = TicketSLAStatus.OK
    ticket.save(update_fields=[
        "sla_status", "sla_breached_at",
        "response_deadline", "sla_deadline",
        "escalation_policy", "last_activity_at", "updated_at",
    ])

    _notify_thresholds(ticket, policy, now, res_pct)

    if policy.escalate_critical_immediately and ticket.priority == Ticket.Priority.CRITICAL:
        if ticket.escalation_level == 0 and not already_logged(ticket, "critical:immediate"):
            log(ticket=ticket, action=EscalationHistory.Action.ESCALATED, policy=policy,
                message="Critical priority ticket escalated immediately per policy",
                key="critical:immediate")
            assign_svc.escalate_ticket(
                ticket, policy=policy, actor=None,
                note="Auto-escalated immediately (critical priority)",
            )

    _evaluate_rules(ticket, policy, now)

    if breached and policy.increase_priority_on_breach and not already_logged(ticket, "priority:breach"):
        _apply_priority_mapping(ticket, policy)

    _auto_escalate(ticket, policy, now, res_breached)


def _auto_step_when_breached(ticket, now):
    """Escalate beyond the configured policy chain when the SLA stays
    breached and no policy governs the current level. One hop per pass, up
    to the campus admin (Admin Review)."""
    if ticket.status in (Ticket.Status.RESOLVED, Ticket.Status.CLOSED):
        return
    if (ticket.escalation_level or 0) >= assign_svc.MAX_LEVEL:
        return
    if not ticket.sla_deadline or now < ticket.sla_deadline:
        return
    if not ticket.sla_breached_at:
        return

    key = f"auto:stepped:{ticket.escalation_level or 0}"
    if already_logged(ticket, key):
        return

    log(ticket=ticket, action=EscalationHistory.Action.SYSTEM,
        message="SLA still breached; auto-escalating to the next support level",
        key=key)
    assign_svc.escalate_ticket(
        ticket, actor=None,
        note="Auto-escalated to the next support level after SLA breach",
    )


def _category_sla_hours(ticket):
    """SLA targets come from the ticket's category, not the policy."""
    if not ticket.category_id:
        return None, None
    return ticket.category.sla_response_hours, ticket.category.sla_resolution_hours


def ensure_deadlines(ticket, policy, now=None):
    """Compute response/resolution deadlines from the category if not yet set."""
    now = now or timezone.now()
    resp_hours, res_hours = _category_sla_hours(ticket)
    changed = False
    if not ticket.response_deadline:
        ticket.response_deadline = _deadline_from(ticket, resp_hours, now)
        changed = True
    if not ticket.sla_deadline:
        ticket.sla_deadline = _deadline_from(ticket, res_hours, now)
        changed = True
    if not ticket.last_activity_at:
        ticket.last_activity_at = ticket.created_at
        changed = True
    if changed:
        ticket.save(update_fields=["response_deadline", "sla_deadline", "last_activity_at", "updated_at"])


def _deadline_from(ticket, hours, now):
    if not hours:
        return None
    return ticket.created_at + timedelta(hours=hours)


class TicketSLAStatus:
    OK = "OK"
    APPROACHING = "APPROACHING"
    BREACHED = "BREACHED"


def _sla_progress(ticket, policy, now):
    """Return (response_breached, resolution_breached, resolution_pct)."""

    resp_breached = bool(
        ticket.response_deadline
        and ticket.first_response_at is None
        and now >= ticket.response_deadline
    )

    _, res_hours = _category_sla_hours(ticket)
    if not res_hours or not ticket.sla_deadline:
        return resp_breached, False, None

    res_breached = now >= ticket.sla_deadline

    elapsed = max(0, (now - ticket.created_at).total_seconds() / 60.0)
    total = res_hours * 60
    res_pct = min(100, int(round(elapsed / total * 100))) if total else 100
    return resp_breached, res_breached, res_pct


def _approaching_threshold(policy):
    thresholds = []
    for enabled, pct in [
        (policy.notify_assigned_50, 50),
        (policy.notify_assigned_75, 75),
        (policy.notify_assigned_custom, policy.notify_assigned_custom_pct),
        (policy.notify_manager_50, 50),
        (policy.notify_manager_75, 75),
        (policy.notify_manager_90, 90),
        (policy.notify_manager_100, 100),
        (policy.notify_manager_custom, policy.notify_manager_custom_pct),
    ]:
        if enabled and pct and pct < 100:
            thresholds.append(pct)
    return min(thresholds) if thresholds else 80


def _notify_thresholds(ticket, policy, now, res_pct):
    if res_pct is None:
        return
    methods = policy_methods(policy)

    assigned_thresholds = []
    for enabled, pct in [
        (policy.notify_assigned_50, 50),
        (policy.notify_assigned_75, 75),
        (policy.notify_assigned_custom, policy.notify_assigned_custom_pct),
    ]:
        if enabled and pct:
            assigned_thresholds.append(pct)

    manager_thresholds = []
    for enabled, pct in [
        (policy.notify_manager_50, 50),
        (policy.notify_manager_75, 75),
        (policy.notify_manager_90, 90),
        (policy.notify_manager_100, 100),
        (policy.notify_manager_custom, policy.notify_manager_custom_pct),
    ]:
        if enabled and pct:
            manager_thresholds.append(pct)

    if ticket.assigned_to:
        for pct in sorted(assigned_thresholds):
            key = f"notify:assigned:{pct}"
            if res_pct >= pct and not already_logged(ticket, key):
                _send_threshold_notification(
                    ticket, policy, ticket.assigned_to, pct, "assigned", key, methods
                )

    manager = _manager_for(ticket)
    if manager:
        for pct in sorted(manager_thresholds):
            key = f"notify:manager:{pct}"
            if res_pct >= pct and not already_logged(ticket, key):
                _send_threshold_notification(
                    ticket, policy, manager, pct, "manager", key, methods
                )


def _send_threshold_notification(ticket, policy, user, pct, role, key, methods):
    from accounts.models import User
    dispatched = notify_user(
        user=user,
        title=f"SLA {pct}% reached - {ticket.ticket_id}",
        message=(
            f"Ticket {ticket.ticket_id} ('{ticket.title}') has reached {pct}% of its "
            f"resolution SLA (deadline {ticket.sla_deadline:%Y-%m-%d %H:%M}). "
            f"Current status: {ticket.get_status_display()}."
        ),
        ticket=ticket,
        notification_type="DEADLINE_WARNING",
        methods=methods,
    )
    log(
        ticket=ticket, action=EscalationHistory.Action.NOTIFICATION_SENT,
        policy=policy,
        message=f"SLA {pct}% notification sent to {role} ({user.get_full_name() or user.username})",
        details={"role": role, "pct": pct, "user": user.username, "methods": dispatched},
        key=key,
    )


def _manager_for(ticket):
    from accounts.models import User
    dept = ticket.department
    if dept:
        manager = User.objects.filter(
            role=User.Role.DEPT_ADMIN, department=dept
        ).first()
        if manager:
            return manager
    return User.objects.filter(role=User.Role.CAMPUS_ADMIN).first()


def _apply_priority_mapping(ticket, policy):
    mapping = policy.priority_mapping or {}
    current = ticket.priority
    target = mapping.get(current)
    if target in PRIORITY_CHOICES and target != current:
        old = ticket.priority
        ticket.priority = target
        ticket.save(update_fields=["priority", "updated_at"])
        StatusLog.objects.create(
            ticket=ticket, from_status=ticket.status, to_status=ticket.status,
            changed_by=None, note=f"Priority auto-raised from {old} to {target} on SLA breach",
        )
        log(
            ticket=ticket, action=EscalationHistory.Action.PRIORITY_CHANGED,
            policy=policy, message=f"Priority changed {old} -> {target} on SLA breach",
            details={"from": old, "to": target}, key="priority:breach",
        )


def _auto_escalate(ticket, policy, now, res_breached):
    """Handle a breached SLA: auto-escalate to `to_level` staff when the
    policy toggle is ON, otherwise push the ticket to the escalation queue
    where the HOD/admin sees it and assigns it."""
    if ticket.status in (Ticket.Status.RESOLVED, Ticket.Status.CLOSED):
        return
    if not res_breached:
        return
    if not ticket.sla_breached_at:
        return

    delay = timedelta(minutes=policy.escalation_delay_minutes)
    if policy.escalation_delay_minutes > 0 and now < ticket.sla_breached_at + delay:
        return

    key = f"auto:escalated:{ticket.escalation_level or 0}"
    if already_logged(ticket, key):
        return

    log(ticket=ticket, action=EscalationHistory.Action.SYSTEM, policy=policy,
        message="SLA breach action triggered; executing configured action",
        key=key)
    if policy.auto_escalate:
        assign_svc.escalate_ticket(
            ticket, policy=policy, level=policy.to_level,
            actor=None, note="Auto-assigned to support level after SLA breach",
        )
    else:
        assign_svc.add_to_escalation_queue(ticket, policy=policy, actor=None, now=now)


def _evaluate_rules(ticket, policy, now):
    rules = policy.rules.filter(is_active=True).order_by("order", "id")
    for rule in rules:
        if not _rule_matches(rule, ticket, now):
            continue
        log(
            ticket=ticket, action=EscalationHistory.Action.RULE_APPLIED,
            policy=policy, message=f"Rule '{rule.name}' matched",
            details={"rule": rule.name, "rule_id": rule.id},
            key=f"rule:{rule.id}:{now.timestamp():.0f}",
        )
        _execute_rule_actions(rule, ticket, now)


def _context(ticket, now):
    last_activity = ticket.last_activity_at or ticket.created_at
    return {
        "priority": ticket.priority,
        "status": ticket.status,
        "sla_status": ticket.sla_status,
        "department": ticket.department,
        "category": ticket.category_id,
        "escalation_level": ticket.escalation_level,
        "no_activity_hours": round(max(0, (now - last_activity).total_seconds() / 3600), 2),
        "sla_resolution_pct": _pct_now(ticket, now),
        "sla_response_pct": _response_pct_now(ticket, now),
    }


def _pct_now(ticket, now):
    _, res_hours = _category_sla_hours(ticket)
    if not res_hours:
        return 0
    elapsed = max(0, (now - ticket.created_at).total_seconds() / 60.0)
    return min(100, int(round(elapsed / (res_hours * 60) * 100)))


def _response_pct_now(ticket, now):
    resp_hours, _ = _category_sla_hours(ticket)
    if not resp_hours or not ticket.response_deadline:
        return 0
    elapsed = max(0, (now - ticket.created_at).total_seconds() / 60.0)
    return min(100, int(round(elapsed / (resp_hours * 60) * 100)))


def _rule_matches(rule, ticket, now):
    ctx = _context(ticket, now)
    conditions = rule.conditions or []
    if not conditions:
        return False
    for cond in conditions:
        field = cond.get("field")
        op = cond.get("op")
        value = cond.get("value")
        if field not in ctx:
            return False
        actual = ctx[field]
        if not _apply_op(actual, op, value):
            return False
    return True


def _apply_op(actual, op, value):
    if op in ("eq", "="):
        return actual == value
    if op in ("neq", "!="):
        return actual != value
    if op in ("gt", ">"):
        return actual is not None and actual > value
    if op in ("gte", ">="):
        return actual is not None and actual >= value
    if op in ("lt", "<"):
        return actual is not None and actual < value
    if op in ("lte", "<="):
        return actual is not None and actual <= value
    if op == "in":
        return actual in (value or [])
    if op in ("contains",):
        return value in str(actual)
    return False


def _execute_rule_actions(rule, ticket, now):
    for action in rule.actions or []:
        name = action.get("action")
        if name not in RULE_ACTIONS:
            continue
        if name == "escalate_now":
            assign_svc.escalate_ticket(
                ticket, policy=ticket.escalation_policy, actor=None,
                note=f"Rule '{rule.name}': escalate now",
            )
        elif name == "increase_priority":
            target = action.get("value") or action.get("priority")
            if target in PRIORITY_CHOICES and target != ticket.priority:
                old = ticket.priority
                ticket.priority = target
                ticket.save(update_fields=["priority", "updated_at"])
                StatusLog.objects.create(
                    ticket=ticket, from_status=ticket.status, to_status=ticket.status,
                    changed_by=None,
                    note=f"Priority changed {old} -> {target} by rule '{rule.name}'",
                )
                log(
                    ticket=ticket, action=EscalationHistory.Action.PRIORITY_CHANGED,
                    policy=ticket.escalation_policy,
                    message=f"Priority changed {old} -> {target} by rule '{rule.name}'",
                    details={"from": old, "to": target},
                )
        elif name == "notify":
            _rule_notify(rule, ticket, action)
        elif name == "assign_user":
            assign_svc.escalate_ticket(
                ticket, policy=ticket.escalation_policy, user=action.get("user_id"),
                actor=None, note=f"Rule '{rule.name}': assign user",
            )
        elif name == "assign_level":
            assign_svc.escalate_ticket(
                ticket, policy=ticket.escalation_policy, level=action.get("level_id"),
                actor=None, note=f"Rule '{rule.name}': assign level",
            )
        elif name == "add_to_escalation_queue":
            assign_svc.add_to_escalation_queue(ticket, policy=ticket.escalation_policy)


def _rule_notify(rule, ticket, action):
    from .notify import METHOD_IN_APP
    from accounts.models import User

    target = action.get("target", "assigned")
    message = action.get("message") or f"Rule '{rule.name}' triggered on {ticket.ticket_id}"
    policy = ticket.escalation_policy
    methods = policy_methods(policy) if policy else [METHOD_IN_APP]

    user = None
    if target == "assigned":
        user = ticket.assigned_to
    elif target == "creator":
        user = ticket.created_by
    elif target == "manager":
        user = _manager_for(ticket)

    if user:
        notify_user(
            user=user, title=f"Rule triggered - {ticket.ticket_id}",
            message=message, ticket=ticket,
            notification_type="ESCALATION", methods=methods,
        )
        log(
            ticket=ticket, action=EscalationHistory.Action.NOTIFICATION_SENT,
            policy=policy, message=f"Rule '{rule.name}' notification to {user.username}",
            details={"target": target}, key=f"rule:{rule.id}:{ticket.id}:notify:{target}",
        )
