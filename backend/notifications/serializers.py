from rest_framework import serializers
from .models import Notification, NotificationSetting, NotificationTemplate


class NotificationSerializer(serializers.ModelSerializer):
    ticket_id_display = serializers.CharField(source="ticket.ticket_id", read_only=True, default=None)

    class Meta:
        model = Notification
        fields = "__all__"
        read_only_fields = ["user", "created_at"]


class NotificationSettingSerializer(serializers.ModelSerializer):
    type_label = serializers.CharField(source="get_notification_type_display", read_only=True)
    in_app = serializers.BooleanField(read_only=True, default=True)

    class Meta:
        model = NotificationSetting
        fields = ["id", "notification_type", "type_label", "in_app", "email"]
        read_only_fields = ["id", "notification_type", "type_label", "in_app"]


class NotificationTemplateSerializer(serializers.ModelSerializer):
    class Meta:
        model = NotificationTemplate
        fields = "__all__"
