from django.db import migrations, models


def seed_escalation_queue(apps, schema_editor):
    """Ensure exactly one escalation queue exists (idempotent)."""
    SupportQueue = apps.get_model("escalations", "SupportQueue")
    if SupportQueue.objects.filter(is_escalation_queue=True).exists():
        return
    SupportQueue.objects.get_or_create(
        name="Escalation Queue",
        defaults={
            "description": "Fixed escalation queue; tickets land here after an SLA breach when auto-escalation is off.",
            "is_escalation_queue": True,
            "is_active": True,
        },
    )


class Migration(migrations.Migration):

    dependencies = [
        ("escalations", "0009_alter_escalationpolicy_category"),
    ]

    operations = [
        migrations.RunPython(seed_escalation_queue, migrations.RunPython.noop),
        migrations.AddConstraint(
            model_name="supportqueue",
            constraint=models.UniqueConstraint(
                fields=["is_escalation_queue"],
                name="single_escalation_queue",
                condition=models.Q(("is_escalation_queue", True)),
            ),
        ),
    ]
