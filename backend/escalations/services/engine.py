"""Configuration-driven SLA evaluation + escalation engine.

This is the heart of the module: every behavior (deadlines, thresholds,
pause rules, auto escalation, priority mapping, IF/THEN rules) is driven by
EscalationPolicy / EscalationRule configuration. No hardcoded SLA values.
"""

from datetime import timedelta

from django.utils import timezone

from tickets.models import StatusLog, Ticket, get_category_sla

from notifications.services import notify_user

from ..models import EscalationHistory, EscalationPolicy, EscalationRule
from . import assign as assign_svc
from .audit import already_logged, log
from .policies import attach_policy

ACTIVE_STATUSES = [
    Ticket.Status.OPEN,
    Ticket.Status.IN_PROGRESS,
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
        "escalation_policy", "assigned_to", "created_by"
    )
    if ticket_ids:
        qs = qs.filter(id__in=list(ticket_ids))
    processed = 0
    for ticket in qs.iterator(chunk_size=200):
        evaluate_ticket(ticket, now)
        processed += 1
    return processed


def evaluate_ticket(ticket, now=None):
    """Evaluate a single ticket against its policy and rules.

    SLA monitoring (deadlines, breach detection, threshold warnings) runs for
    EVERY active ticket from its category's SLA hours - a governing policy is
    only required for the escalation actions (auto escalate, rules, priority
    bump). Breached tickets without a policy are parked in the escalation
    queue so the HOD/admin can act on them.
    """
    now = now or timezone.now()

    policy = attach_policy(ticket, now=now)

    ensure_deadlines(ticket, now=now)

    resp_breached, res_breached, res_pct = _sla_progress(ticket, now)
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
    elif not breached:
        # Only recompute the status when the SLA is no longer breached; a
        # breached ticket stays BREACHED until it is resolved/closed.
        approaching_pct = _approaching_threshold()
        if res_pct is not None and res_pct >= approaching_pct:
            ticket.sla_status = TicketSLAStatus.APPROACHING
        else:
            ticket.sla_status = TicketSLAStatus.OK
    ticket.save(update_fields=[
        "sla_status", "sla_breached_at",
        "response_deadline", "sla_deadline",
        "escalation_policy", "last_activity_at", "updated_at",
    ])

    _notify_thresholds(ticket, res_pct)

    if policy is None:
        # No escalation policy governs this ticket: SLA monitoring above
        # still ran. On breach the only sensible action is to park the
        # ticket in the escalation queue for manual handling.
        if breached:
            _auto_step_when_breached(ticket, now)
        return

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

    _auto_escalate(ticket, policy, now, breached)


def _auto_step_when_breached(ticket, now):
    """Breached ticket with no governing policy at its current level: park
    it (unassigned) in the escalation queue so the HOD/admin can reassign it.
    Also the destination for breached tickets already at the top of the chain."""
    if ticket.status in (Ticket.Status.RESOLVED, Ticket.Status.CLOSED):
        return
    if not ticket.sla_breached_at:
        return

    key = f"auto:queued:{ticket.escalation_level or 0}"
    if already_logged(ticket, key):
        return

    log(ticket=ticket, action=EscalationHistory.Action.SYSTEM,
        message="SLA still breached and no policy governs this level; moved to the escalation queue",
        key=key)
    assign_svc.add_to_escalation_queue(ticket, actor=None, now=now)


def _category_sla_hours(ticket):
    """SLA targets come from the ticket's category (admin-overridable), not the policy."""
    if not ticket.category:
        return None, None
    return get_category_sla(ticket.category)


def ensure_deadlines(ticket, now=None):
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


def _sla_progress(ticket, now):
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


def _approaching_threshold():
    """SLA progress at which a ticket is flagged APPROACHING (first warning)."""
    return 50


def _notify_thresholds(ticket, res_pct):
    """Fixed SLA warnings: assignee at 50/75/90%; on breach (100%) the
    assignee plus the team lead and department HOD are notified."""
    if res_pct is None:
        return

    for pct in (50, 75, 90, 100):
        if ticket.assigned_to and res_pct >= pct:
            key = f"notify:assigned:{pct}"
            if not already_logged(ticket, key):
                _send_threshold_notification(
                    ticket, ticket.assigned_to, pct, "assigned", key
                )

    if res_pct >= 100:
        recipients = (
            (assign_svc.team_lead_for_ticket(ticket), "team_lead"),
            (assign_svc.department_hod_for_ticket(ticket), "hod"),
        )
        for user, role in recipients:
            if not user:
                continue
            key = f"notify:{role}:100"
            if not already_logged(ticket, key):
                _send_threshold_notification(ticket, user, 100, role, key)


def _send_threshold_notification(ticket, user, pct, role, key):
    dispatched = notify_user(
        user=user,
        title=f"SLA {pct}% reached - {ticket.ticket_id}",
        message=(
            f"Ticket '{ticket.title}' has reached {pct}% of its "
            f"resolution SLA (deadline {ticket.sla_deadline:%Y-%m-%d %H:%M}). "
            f"Current status: {ticket.get_status_display()}."
        ),
        ticket=ticket,
        notification_type="DEADLINE_WARNING",
    )
    log(
        ticket=ticket, action=EscalationHistory.Action.NOTIFICATION_SENT,
        policy=ticket.escalation_policy,
        message=f"SLA {pct}% notification sent to {role} ({user.get_full_name() or user.username})",
        details={"role": role, "pct": pct, "user": user.username, "methods": dispatched},
        key=key,
    )


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


def _auto_escalate(ticket, policy, now, breached):
    """Handle a breached SLA: auto-escalate to `to_level` staff when the
    policy toggle is ON, otherwise park the ticket (unassigned) in the
    escalation queue so the HOD/admin can reassign it."""
    if ticket.status in (Ticket.Status.RESOLVED, Ticket.Status.CLOSED):
        return
    if not breached:
        return
    if not ticket.sla_breached_at:
        return

    if policy.auto_escalate:
        delay = timedelta(minutes=policy.escalation_delay_minutes)
        if policy.escalation_delay_minutes > 0 and now < ticket.sla_breached_at + delay:
            return
        key = f"auto:escalated:{ticket.escalation_level or 0}"
        if already_logged(ticket, key):
            return
        log(ticket=ticket, action=EscalationHistory.Action.SYSTEM, policy=policy,
            message="SLA breach action triggered; executing configured action",
            key=key)
        assign_svc.escalate_ticket(
            ticket, policy=policy, level=policy.to_level,
            actor=None, note="Auto-assigned to support level after SLA breach",
        )
    else:
        key = f"auto:queued:{ticket.escalation_level or 0}"
        if already_logged(ticket, key):
            return
        log(ticket=ticket, action=EscalationHistory.Action.SYSTEM, policy=policy,
            message="SLA breach and auto-escalation is OFF; moved to the escalation queue for reassignment",
            key=key)
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
        "category": ticket.category,
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
    target = action.get("target", "assigned")
    message = action.get("message") or f"Rule '{rule.name}' triggered on {ticket.ticket_id}"
    policy = ticket.escalation_policy

    user = None
    if target == "assigned":
        user = ticket.assigned_to
    elif target == "creator":
        user = ticket.created_by
    elif target == "manager":
        user = assign_svc.department_hod_for_ticket(ticket)

    if user:
        notify_user(
            user=user, title=f"Rule triggered - {ticket.ticket_id}",
            message=message, ticket=ticket,
            notification_type="ESCALATION",
        )
        log(
            ticket=ticket, action=EscalationHistory.Action.NOTIFICATION_SENT,
            policy=policy, message=f"Rule '{rule.name}' notification to {user.username}",
            details={"target": target}, key=f"rule:{rule.id}:{ticket.id}:notify:{target}",
        )
