"""Notification dispatch: every notification goes out via In-App AND Email.

Single source of truth for how notifications leave the system. An in-app row
is always created; email is sent to the recipient's address when they have
one. Errors on the email path never affect the in-app record.
"""

import threading

from django.conf import settings

from .models import Notification

METHOD_IN_APP = "in_app"
METHOD_EMAIL = "email"


def notify_user(user, title, message, ticket=None, notification_type="SYSTEM"):
    """Dispatch a notification through all channels (in-app + email).

    Returns the list of channel names actually dispatched.
    """
    dispatched = [METHOD_IN_APP]

    Notification.objects.create(
        user=user,
        title=title,
        message=message,
        notification_type=notification_type,
        ticket=ticket,
    )

    if user.email:
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
