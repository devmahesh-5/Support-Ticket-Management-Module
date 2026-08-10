"""Notification dispatch: in-app always on, email gated per notification type.

Single source of truth for how notifications leave the system. In-app rows
are always created; email is only sent when the requested channel includes
``email`` AND the per-type ``NotificationSetting`` allows it. SMS is
future-ready (stub).
"""

import threading

from django.conf import settings

from .models import Notification, NotificationSetting

METHOD_IN_APP = "in_app"
METHOD_EMAIL = "email"
METHOD_SMS = "sms"


def email_enabled_for(notification_type):
    """Whether email delivery is enabled for a notification type.

    Types with no explicit setting (or unknown types) fall back to enabled so
    nothing is silently dropped when a type is added later.
    """
    if not notification_type:
        return True
    setting = NotificationSetting.objects.filter(
        notification_type=notification_type
    ).only("email").first()
    if setting is None:
        return True
    return setting.email


def notify_user(user, title, message, ticket=None, notification_type="SYSTEM", methods=None):
    """Dispatch a notification through all requested channels.

    In-App is always sent. Email is gated by the per-type NotificationSetting.
    Returns the list of channel names actually dispatched.
    """
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

    if METHOD_EMAIL in methods and user.email and email_enabled_for(notification_type):
        threading.Thread(
            target=_send_email,
            args=(title, message, user.email),
            name="email-send",
            daemon=True,
        ).start()
        dispatched.append(METHOD_EMAIL)

    return dispatched


def _send_email(title, message, to_email):
    """Send email off the request thread; errors are swallowed."""
    from django.core.mail import send_mail
    from django.db import connections

    try:
        send_mail(
            title,
            message,
            settings.DEFAULT_FROM_EMAIL,
            [to_email],
            fail_silently=True,
        )
    finally:
        connections.close_all()
