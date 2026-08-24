from django.db import migrations

# Old staff-level scale (1 = L1 staff, 2 = L2 staff, 3 = HOD) mapped onto the
# new handler-level scale (0 = staff, 1 = team lead, 2 = HOD, 3 = campus
# admin). A legacy L1->L2 policy therefore becomes staff->team lead and a
# legacy L2->HOD policy becomes team lead->HOD.
LEVEL_MAP = {1: 0, 2: 1, 3: 2}


def remap_policy_levels(apps, schema_editor):
    EscalationPolicy = apps.get_model("escalations", "EscalationPolicy")
    TicketAssignmentStage = apps.get_model("escalations", "TicketAssignmentStage")
    for old, new in LEVEL_MAP.items():
        EscalationPolicy.objects.filter(from_level=old).update(from_level=new)
        EscalationPolicy.objects.filter(to_level=old).update(to_level=new)
        TicketAssignmentStage.objects.filter(level=old).update(level=new)


def restore_policy_levels(apps, schema_editor):
    reverse = {v: k for k, v in LEVEL_MAP.items()}
    EscalationPolicy = apps.get_model("escalations", "EscalationPolicy")
    TicketAssignmentStage = apps.get_model("escalations", "TicketAssignmentStage")
    for old, old_value in reverse.items():
        EscalationPolicy.objects.filter(from_level=old).update(from_level=old_value)
        EscalationPolicy.objects.filter(to_level=old).update(to_level=old_value)
        TicketAssignmentStage.objects.filter(level=old).update(level=old_value)


class Migration(migrations.Migration):

    dependencies = [
        ("escalations", "0011_alter_escalationpolicy_from_level_and_more"),
    ]

    operations = [
        migrations.RunPython(remap_policy_levels, restore_policy_levels),
    ]
