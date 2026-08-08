from django.db import models
from django.conf import settings


class Notification(models.Model):
    class Type(models.TextChoices):
        ASSIGNMENT = "ASSIGNMENT", "Assignment"
        REPLY = "REPLY", "Reply"
        STATUS_CHANGE = "STATUS_CHANGE", "Status Change"
        ESCALATION = "ESCALATION", "Escalation"
        REASSIGNMENT = "REASSIGNMENT", "Reassignment"
        DEADLINE_WARNING = "DEADLINE_WARNING", "Deadline Warning"
        SYSTEM = "SYSTEM", "System"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
        related_name="notifications"
    )
    title = models.CharField(max_length=200)
    message = models.TextField()
    notification_type = models.CharField(max_length=30, choices=Type.choices, default=Type.SYSTEM)
    ticket = models.ForeignKey(
        "tickets.Ticket", on_delete=models.SET_NULL,
        null=True, blank=True, related_name="notifications"
    )
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"[{self.notification_type}] {self.title} - {self.user}"


class NotificationSetting(models.Model):
    """Per-notification-type channel controls.

    In-App notifications are always on (``in_app`` is forced True and cannot
    be disabled). Email delivery for each type can be toggled by an admin;
    the escalation notify dispatcher consults these settings before sending.
    """

    notification_type = models.CharField(
        max_length=30, choices=Notification.Type.choices, unique=True
    )
    in_app = models.BooleanField(default=True)
    email = models.BooleanField(default=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["notification_type"]

    def __str__(self):
        return f"{self.notification_type} (in-app: {'on' if self.in_app else 'off'}, email: {'on' if self.email else 'off'})"


class NotificationTemplate(models.Model):
    name = models.CharField(max_length=100, unique=True)
    subject = models.CharField(max_length=200)
    body = models.TextField(help_text="Use placeholders: {ticket_id}, {title}, {status}, {assignee}")
    notification_type = models.CharField(
        max_length=30, choices=Notification.Type.choices, default=Notification.Type.SYSTEM
    )
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name
