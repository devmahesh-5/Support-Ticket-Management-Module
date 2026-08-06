"""Audit logging for SLA/escalation actions."""

from ..models import EscalationHistory


def log(ticket, action, message="", actor=None, policy=None, details=None, key=None):
    return EscalationHistory.objects.create(
        ticket=ticket,
        action=action,
        message=message,
        actor=actor,
        policy=policy,
        details=details or {},
        key=key,
    )


def already_logged(ticket, key):
    return EscalationHistory.objects.filter(ticket=ticket, key=key).exists()
