from django.conf import settings
from django.db import models

from tickets.models import Ticket


class TimeStampedModel(models.Model):
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


SUPPORT_LEVEL_CHOICES = [
    (0, "Level 0 (Staff)"),
    (1, "Level 1 (Team Lead)"),
    (2, "Level 2 (Department HOD)"),
    (3, "Level 3 (Campus Admin)"),
]


class SupportQueue(TimeStampedModel):
    """The fixed escalation queue.

    Not configurable: exactly one escalation queue always exists and tickets
    are moved into it by the escalation engine. Nothing else should ever be
    created here (API and admin are read-only).
    """

    name = models.CharField(max_length=100, unique=True)
    description = models.TextField(blank=True)
    department = models.CharField(max_length=10, blank=True, null=True)
    members = models.ManyToManyField(
        settings.AUTH_USER_MODEL, blank=True, related_name="queues"
    )
    is_escalation_queue = models.BooleanField(default=False, help_text="Designates the escalation queue used by auto-escalation")
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(
                fields=["is_escalation_queue"],
                name="single_escalation_queue",
                condition=models.Q(is_escalation_queue=True),
            ),
        ]

    def __str__(self):
        return self.name


class EscalationPolicy(TimeStampedModel):
    """Configuration-driven escalation policy.

    Applies to ALL tickets that match its scope (department / category /
    priority). SLA deadlines are taken from the ticket's category - this
    policy only defines when and where to escalate on breach.
    """

    # General
    name = models.CharField(max_length=120, unique=True)
    description = models.TextField(blank=True)
    is_enabled = models.BooleanField(default=True)
    department = models.CharField(max_length=10, blank=True, null=True, help_text="Restrict policy to a department code (blank = all tickets)")
    category = models.CharField(
        max_length=100, blank=True, null=True,
        help_text="Restrict policy to a hardcoded category name (blank = all tickets)",
    )
    priority = models.CharField(
        max_length=10, blank=True, null=True,
        choices=Ticket.Priority.choices,
        help_text="Restrict policy to a priority (blank = all tickets)",
    )

    # Levels (staff escalation levels: 1 = first-line staff, 2 = second-line
    # staff, 3 = department HOD). Matches User.level on staff accounts.
    from_level = models.PositiveSmallIntegerField(
        choices=SUPPORT_LEVEL_CHOICES, null=True, blank=True,
        help_text="Escalate tickets currently at this staff level (blank = any level)",
    )
    to_level = models.PositiveSmallIntegerField(
        choices=SUPPORT_LEVEL_CHOICES, null=True, blank=True,
        help_text="Escalate tickets to this staff level (blank = next level after current)",
    )

    # Notifications are not configurable: every SLA warning and escalation
    # notice always goes out via in-app + email. Warnings fire to the assignee
    # at 50/75/90% of the resolution SLA and, on breach (100%), also to the
    # team lead and the department HOD.

    # Auto escalation on SLA breach: if ON the ticket escalates to the
    # `to_level` staff; if OFF it is pushed to the escalation queue for the
    # HOD/admin to see and assign.
    auto_escalate = models.BooleanField(default=False)
    escalation_delay_minutes = models.PositiveIntegerField(default=60, help_text="0 = immediately after breach")

    # Priority rules
    increase_priority_on_breach = models.BooleanField(default=False)
    priority_mapping = models.JSONField(default=dict, blank=True, help_text='e.g. {"LOW": "MEDIUM", "MEDIUM": "HIGH", "HIGH": "CRITICAL", "CRITICAL": "CRITICAL"}')

    # Special rules
    escalate_critical_immediately = models.BooleanField(default=False)

    class Meta:
        ordering = ["name"]

    def clean(self):
        if (
            self.from_level is not None and self.to_level is not None
            and self.from_level >= self.to_level
        ):
            from django.core.exceptions import ValidationError
            raise ValidationError("From level must be lower than the To level.")

    def __str__(self):
        return self.name


class EscalationRule(TimeStampedModel):
    """Config-driven IF/THEN rule evaluated by the rule engine.

    conditions: [{field, op, value}]  (all must match - AND)
    actions:    [{action, ...params}]
    """

    name = models.CharField(max_length=120)
    policy = models.ForeignKey(EscalationPolicy, on_delete=models.CASCADE, related_name="rules")
    order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    conditions = models.JSONField(default=list, blank=True)
    actions = models.JSONField(default=list, blank=True)

    class Meta:
        ordering = ["policy", "order", "id"]

    def __str__(self):
        return f"{self.policy.name} / {self.name}"


class EscalationHistory(TimeStampedModel):
    """Audit log for every SLA/escalation action."""

    class Action(models.TextChoices):
        POLICY_APPLIED = "POLICY_APPLIED", "Policy Applied"
        NOTIFICATION_SENT = "NOTIFICATION_SENT", "Notification Sent"
        ESCALATED = "ESCALATED", "Escalated"
        DE_ESCALATED = "DE_ESCALATED", "De-Escalated"
        PRIORITY_CHANGED = "PRIORITY_CHANGED", "Priority Changed"
        QUEUE_CHANGED = "QUEUE_CHANGED", "Queue Changed"
        ASSIGNMENT_CHANGED = "ASSIGNMENT_CHANGED", "Assignment Changed"
        SLA_BREACHED = "SLA_BREACHED", "SLA Breached"
        RULE_APPLIED = "RULE_APPLIED", "Rule Applied"
        SYSTEM = "SYSTEM", "System"

    ticket = models.ForeignKey(
        "tickets.Ticket", on_delete=models.CASCADE, related_name="escalation_history"
    )
    policy = models.ForeignKey(
        EscalationPolicy, null=True, blank=True, on_delete=models.SET_NULL,
        related_name="history",
    )
    action = models.CharField(max_length=30, choices=Action.choices, default=Action.SYSTEM)
    key = models.CharField(max_length=120, blank=True, null=True, help_text="Deduplication key (e.g. notify:assigned:50)")
    message = models.TextField(blank=True)
    details = models.JSONField(default=dict, blank=True)
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
    )

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["ticket", "action"]),
            models.Index(fields=["key"]),
        ]

    def __str__(self):
        return f"{self.ticket.ticket_id} - {self.action}"


class TicketAssignmentStage(TimeStampedModel):
    """Where a ticket currently sits in the support level / queue hierarchy."""

    ticket = models.ForeignKey(
        "tickets.Ticket", on_delete=models.CASCADE, related_name="assignment_stages"
    )
    level = models.PositiveSmallIntegerField(
        choices=SUPPORT_LEVEL_CHOICES, null=True, blank=True,
        help_text="Staff escalation level the ticket moved to",
    )
    queue = models.ForeignKey(
        SupportQueue, null=True, blank=True, on_delete=models.SET_NULL,
        related_name="assignment_stages",
    )
    assigned_user = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
    )
    is_current = models.BooleanField(default=True)
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.ticket.ticket_id} @ L{self.level if self.level else '-'} {self.queue or ''}".strip()
