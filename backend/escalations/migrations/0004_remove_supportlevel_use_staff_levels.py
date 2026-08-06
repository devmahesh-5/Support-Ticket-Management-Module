from django.db import migrations, models

LEVEL_CHOICES = [
    (1, "Level 1 (Staff)"),
    (2, "Level 2 (Staff)"),
    (3, "Level 3 (Department HOD)"),
]


def copy_level_data(apps, schema_editor):
    EscalationPolicy = apps.get_model("escalations", "EscalationPolicy")
    TicketAssignmentStage = apps.get_model("escalations", "TicketAssignmentStage")

    for policy in EscalationPolicy.objects.all():
        policy.from_level_order = policy.from_level.order if policy.from_level_id else None
        policy.to_level_order = policy.to_level.order if policy.to_level_id else None
        policy.save(update_fields=["from_level_order", "to_level_order"])

    for stage in TicketAssignmentStage.objects.all():
        stage.level = stage.support_level.order if stage.support_level_id else None
        stage.save(update_fields=["level"])


class Migration(migrations.Migration):
    dependencies = [
        ("tickets", "0006_remove_ticket_current_support_level"),
        ("escalations", "0003_remove_escalationpolicy_auto_assign_level_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="escalationpolicy",
            name="from_level_order",
            field=models.PositiveSmallIntegerField(
                choices=LEVEL_CHOICES, blank=True, null=True
            ),
        ),
        migrations.AddField(
            model_name="escalationpolicy",
            name="to_level_order",
            field=models.PositiveSmallIntegerField(
                choices=LEVEL_CHOICES, blank=True, null=True
            ),
        ),
        migrations.AddField(
            model_name="ticketassignmentstage",
            name="level",
            field=models.PositiveSmallIntegerField(
                choices=LEVEL_CHOICES, blank=True, null=True,
                help_text="Staff escalation level the ticket moved to",
            ),
        ),
        migrations.RunPython(copy_level_data, migrations.RunPython.noop),
        migrations.RemoveField(model_name="escalationpolicy", name="from_level"),
        migrations.RemoveField(model_name="escalationpolicy", name="to_level"),
        migrations.RemoveField(model_name="ticketassignmentstage", name="support_level"),
        migrations.RenameField(
            model_name="escalationpolicy", old_name="from_level_order", new_name="from_level"
        ),
        migrations.RenameField(
            model_name="escalationpolicy", old_name="to_level_order", new_name="to_level"
        ),
        migrations.DeleteModel(name="SupportLevel"),
    ]
