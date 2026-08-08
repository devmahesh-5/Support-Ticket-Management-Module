from django.db import migrations

DEFAULT_TYPES = [
    "ASSIGNMENT",
    "REPLY",
    "STATUS_CHANGE",
    "REASSIGNMENT",
    "ESCALATION",
    "DEADLINE_WARNING",
]


def seed_settings(apps, schema_editor):
    NotificationSetting = apps.get_model("notifications", "NotificationSetting")
    for index, ntype in enumerate(DEFAULT_TYPES, start=1):
        NotificationSetting.objects.get_or_create(
            notification_type=ntype,
            defaults={"in_app": True, "email": False},
        )


def unseed_settings(apps, schema_editor):
    NotificationSetting = apps.get_model("notifications", "NotificationSetting")
    NotificationSetting.objects.filter(notification_type__in=DEFAULT_TYPES).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("notifications", "0002_notificationsetting"),
    ]

    operations = [
        migrations.RunPython(seed_settings, unseed_settings),
    ]
