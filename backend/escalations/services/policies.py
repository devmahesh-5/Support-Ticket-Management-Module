"""Policy matching: resolve the most specific enabled policy for a ticket."""

from ..models import EscalationPolicy


def match_policy(ticket, policy_id=None):
    """Pick the best matching enabled policy for a ticket.

    Specificity scoring: department (4) > category (3) > priority (2).
    Returns None when no enabled policy matches.
    """
    if policy_id:
        try:
            return EscalationPolicy.objects.get(id=policy_id, is_enabled=True)
        except EscalationPolicy.DoesNotExist:
            return None

    candidates = []
    ticket_level = (ticket.escalation_level or 0) + 1
    for policy in EscalationPolicy.objects.filter(is_enabled=True):
        if policy.department and policy.department != ticket.department:
            continue
        if policy.category_id and policy.category_id != ticket.category_id:
            continue
        if policy.priority and policy.priority != ticket.priority:
            continue
        if policy.from_level and policy.from_level != ticket_level:
            continue
        score = 0
        if policy.department:
            score += 4
        if policy.category_id:
            score += 3
        if policy.priority:
            score += 2
        if policy.from_level:
            score += 1
        candidates.append((score, policy))

    if not candidates:
        return None
    candidates.sort(key=lambda item: -item[0])
    return candidates[0][1]


def attach_policy(ticket, now=None):
    """Attach the matching policy to a ticket and log it. Returns the policy."""
    from .audit import log
    from ..models import EscalationHistory

    policy = match_policy(ticket)
    if policy and ticket.escalation_policy_id != policy.id:
        ticket.escalation_policy = policy
        ticket.save(update_fields=["escalation_policy", "updated_at"])
        log(
            ticket=ticket, action=EscalationHistory.Action.POLICY_APPLIED,
            policy=policy, message=f"Escalation policy '{policy.name}' applied",
            details={"policy_id": policy.id},
        )
    return policy
