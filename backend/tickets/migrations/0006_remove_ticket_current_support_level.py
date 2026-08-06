from django.db import migrations


def copy_current_level_to_escalation_level(apps, schema_editor):
    Ticket = apps.get_model("tickets", "Ticket")
    for ticket in Ticket.objects.select_related("current_support_level").all():
        if not ticket.escalation_level and ticket.current_support_level_id:
            ticket.escalation_level = ticket.current_support_level.order
            ticket.save(update_fields=["escalation_level"])


class Migration(migrations.Migration):
    dependencies = [
        ("tickets", "0005_ticket_current_support_level_and_more"),
    ]

    operations = [
        migrations.RunPython(copy_current_level_to_escalation_level, migrations.RunPython.noop),
        migrations.RemoveField(model_name="ticket", name="current_support_level"),
    ]
