from django.db import models
from django.conf import settings
from django.utils import timezone
import uuid


class Category(models.Model):
    name = models.CharField(max_length=100, unique=True)
    description = models.TextField(blank=True, null=True)
    sla_response_hours = models.IntegerField(default=24, help_text="Target response time in hours")
    sla_resolution_hours = models.IntegerField(default=72, help_text="Target resolution time in hours")

    class Meta:
        verbose_name_plural = "Categories"
        ordering = ["name"]

    def __str__(self):
        return self.name


class RoutingRule(models.Model):
    category = models.ForeignKey(Category, on_delete=models.CASCADE, related_name="routing_rules")
    target_department = models.CharField(max_length=20, choices=[
        ("SELF", "Ticket's Own Department"),
        ("CIT", "CIT (IT Support)"),
        ("FIN", "Finance"),
        ("ACA", "Academic Affairs"),
        ("LIB", "Library"),
        ("FAC", "Facilities"),
        ("HOD", "Respective HOD"),
        ("CAMPUS_ADMIN", "Campus Admin"),
    ], default="SELF")
    keyword_match = models.CharField(max_length=200, blank=True, null=True, help_text="Optional keyword for title/desc matching")
    priority = models.IntegerField(default=0, help_text="Lower number = higher priority")
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["priority"]

    def __str__(self):
        return f"{self.category.name} -> {self.target_department}"


class Ticket(models.Model):
    class Status(models.TextChoices):
        OPEN = "OPEN", "Open"
        IN_PROGRESS = "IN_PROGRESS", "In Progress"
        RESOLVED = "RESOLVED", "Resolved"
        CLOSED = "CLOSED", "Closed"
        REOPENED = "REOPENED", "Reopened"
        ESCALATED_L1 = "ESCALATED_L1", "Escalated - Level 1"
        ESCALATED_L2 = "ESCALATED_L2", "Escalated - Level 2"
        ADMIN_REVIEW = "ADMIN_REVIEW", "Admin Review"

    class Priority(models.TextChoices):
        LOW = "LOW", "Low"
        MEDIUM = "MEDIUM", "Medium"
        HIGH = "HIGH", "High"
        CRITICAL = "CRITICAL", "Critical"

    ticket_id = models.CharField(max_length=20, unique=True, editable=False)
    title = models.CharField(max_length=200)
    description = models.TextField()
    category = models.ForeignKey(Category, on_delete=models.SET_NULL, null=True, related_name="tickets")
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.OPEN)
    priority = models.CharField(max_length=10, choices=Priority.choices, default=Priority.MEDIUM)

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
        related_name="created_tickets"
    )
    assigned_to = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, blank=True, related_name="assigned_tickets"
    )
    department = models.CharField(max_length=3, blank=True, null=True)

    is_class_level = models.BooleanField(default=False)
    class_section = models.CharField(max_length=10, blank=True, null=True)
    student_names = models.TextField(blank=True, null=True, help_text="Comma-separated student names for CR tickets")

    closed_at = models.DateTimeField(null=True, blank=True)
    reopened_at = models.DateTimeField(null=True, blank=True)
    sla_deadline = models.DateTimeField(null=True, blank=True)
    escalation_level = models.IntegerField(default=0)

    # --- SLA Escalation Policy Engine fields ---
    escalation_policy = models.ForeignKey(
        "escalations.EscalationPolicy", null=True, blank=True,
        on_delete=models.SET_NULL, related_name="tickets",
    )
    queue = models.ForeignKey(
        "escalations.SupportQueue", null=True, blank=True,
        on_delete=models.SET_NULL, related_name="tickets",
    )
    sla_status = models.CharField(
        max_length=20, default="OK",
        choices=[("OK", "OK"), ("APPROACHING", "Approaching SLA"), ("BREACHED", "SLA Breached")],
    )
    response_deadline = models.DateTimeField(null=True, blank=True)
    sla_breached_at = models.DateTimeField(null=True, blank=True)
    first_response_at = models.DateTimeField(null=True, blank=True)
    last_activity_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["sla_status"]),
            models.Index(fields=["sla_deadline"]),
        ]

    def save(self, *args, **kwargs):
        if not self.ticket_id:
            self.ticket_id = f"TKT-{uuid.uuid4().hex[:5].upper()}"
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.ticket_id} - {self.title[:50]}"


class TicketMessage(models.Model):
    ticket = models.ForeignKey(Ticket, on_delete=models.CASCADE, related_name="messages")
    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    content = models.TextField()
    is_internal_note = models.BooleanField(default=False)
    file = models.FileField(upload_to="tickets/", null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]

    def __str__(self):
        return f"Message by {self.author} on {self.ticket.ticket_id}"


class StatusLog(models.Model):
    ticket = models.ForeignKey(Ticket, on_delete=models.CASCADE, related_name="status_logs")
    from_status = models.CharField(max_length=20, null=True, blank=True)
    to_status = models.CharField(max_length=20)
    changed_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True)
    note = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]

    def __str__(self):
        return f"{self.ticket.ticket_id}: {self.from_status} -> {self.to_status}"


class Attachment(models.Model):
    ticket = models.ForeignKey(Ticket, on_delete=models.CASCADE, related_name="attachments")
    file = models.FileField(upload_to="tickets/attachments/")
    filename = models.CharField(max_length=255)
    uploaded_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True)
    uploaded_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.filename


class SystemSetting(models.Model):
    allow_two_way_escalation = models.BooleanField(default=True, help_text="Allow de-escalation/handback of escalated tickets")
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "System Setting"

    def __str__(self):
        return f"System Setting (2-Way Escalation: {self.allow_two_way_escalation})"

