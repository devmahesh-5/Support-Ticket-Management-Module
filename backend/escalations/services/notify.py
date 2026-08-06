"""Notification dispatch: in-app, email, SMS (future ready)."""

from django.conf import settings

from notifications.models import Notification

METHOD_IN_APP = "in_app"
METHOD_EMAIL = "email"
METHOD_SMS = "sms"


def notify_user(user, title, message, ticket, notification_type="SYSTEM", methods=None):
    """Send a notification through all requested channels. Returns channel names used."""
    if methods is None:
        methods = [METHOD_IN_APP]
    dispatched = []

    if METHOD_IN_APP in methods:
        Notification.objects.create(
            user=user,
            title=title,
            message=message,
            notification_type=notification_type,
            ticket=ticket,
        )
        dispatched.append(METHOD_IN_APP)

    if METHOD_EMAIL in methods and user.email:
        from django.core.mail import send_mail

        send_mail(
            title,
            message,
            settings.DEFAULT_FROM_EMAIL,
            [user.email],
            fail_silently=True,
        )
        dispatched.append(METHOD_EMAIL)

    if METHOD_SMS in methods:
        # Future-ready: plug an SMS gateway here (Twilio, etc.).
        dispatched.append(METHOD_SMS)

    return dispatched


def policy_methods(policy):
    methods = []
    if policy.notify_in_app:
        methods.append(METHOD_IN_APP)
    if policy.notify_email:
        methods.append(METHOD_EMAIL)
    if policy.notify_sms:
        methods.append(METHOD_SMS)
    return methods or [METHOD_IN_APP]
