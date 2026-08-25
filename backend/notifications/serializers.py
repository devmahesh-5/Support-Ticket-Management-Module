from rest_framework import serializers
from .models import Notification


class NotificationSerializer(serializers.ModelSerializer):
    ticket_id_display = serializers.CharField(source="ticket.ticket_id", read_only=True, default=None)

    class Meta:
        model = Notification
        fields = "__all__"
        read_only_fields = ["user", "created_at"]
