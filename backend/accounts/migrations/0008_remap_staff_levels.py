from django.db import migrations


def remap_levels(apps, schema_editor):
    """Shift to the flattened hierarchy: all staff are level 0, team leads
    are 1 and HODs move from the old fixed level 3 down to 2."""
    User = apps.get_model("accounts", "User")
    User.objects.filter(role="STAFF", level__in=(1, 2)).update(level=0)
    User.objects.filter(role="DEPT_ADMIN", level=3).update(level=2)


def restore_levels(apps, schema_editor):
    User = apps.get_model("accounts", "User")
    # Best-effort reverse: staff back at level 1, HODs back at level 3.
    User.objects.filter(role="STAFF", level=0).update(level=1)
    User.objects.filter(role="DEPT_ADMIN", level=2).update(level=3)


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0007_alter_user_level_alter_user_role_and_more"),
    ]

    operations = [
        migrations.RunPython(remap_levels, restore_levels),
    ]
