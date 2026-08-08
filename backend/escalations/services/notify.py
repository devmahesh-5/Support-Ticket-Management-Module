"""Notification dispatch for the escalation engine (delegates to notifications.services).

Channels come from the governing escalation policy (in-app / email / SMS
toggles); when no policy governs the hop we fall back to in-app only.
"""

from notifications.services import (
    METHOD_EMAIL,
    METHOD_IN_APP,
    METHOD_SMS,
    notify_user,
)


def policy_methods(policy):
    methods = []
    if policy.notify_in_app:
        methods.append(METHOD_IN_APP)
    if policy.notify_email:
        methods.append(METHOD_EMAIL)
    if policy.notify_sms:
        methods.append(METHOD_SMS)
    return methods or [METHOD_IN_APP]
