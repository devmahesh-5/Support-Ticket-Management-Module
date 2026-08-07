from rest_framework import serializers
from .models import Category, RoutingRule, Ticket, TicketMessage, StatusLog, Attachment, SystemSetting
from accounts.serializers import UserSerializer
from accounts.models import User
from .routing import get_category_route


class SystemSettingSerializer(serializers.ModelSerializer):
    class Meta:
        model = SystemSetting
        fields = "__all__"



class CategorySerializer(serializers.ModelSerializer):
    target_department = serializers.SerializerMethodField()

    class Meta:
        model = Category
        fields = "__all__"

    def get_target_department(self, obj):
        route = get_category_route(obj)
        return route["target_dept"] if route else None


class RoutingRuleSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source="category.name", read_only=True)

    class Meta:
        model = RoutingRule
        fields = "__all__"


class TicketMessageSerializer(serializers.ModelSerializer):
    author_name = serializers.SerializerMethodField()
    author_role = serializers.CharField(source="author.role", read_only=True)

    class Meta:
        model = TicketMessage
        fields = "__all__"
        read_only_fields = ["author", "created_at"]

    def get_author_name(self, obj):
        return obj.author.get_full_name() or obj.author.username

    def create(self, validated_data):
        validated_data["author"] = self.context["request"].user
        return super().create(validated_data)


class StatusLogSerializer(serializers.ModelSerializer):
    changed_by_name = serializers.SerializerMethodField()

    class Meta:
        model = StatusLog
        fields = "__all__"

    def get_changed_by_name(self, obj):
        if obj.changed_by:
            return obj.changed_by.get_full_name() or obj.changed_by.username
        return "System"


class AttachmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Attachment
        fields = "__all__"


class TicketListSerializer(serializers.ModelSerializer):
    created_by_name = serializers.SerializerMethodField()
    assigned_to_name = serializers.SerializerMethodField()
    category_name = serializers.CharField(source="category.name", read_only=True, default="Uncategorized")
    message_count = serializers.SerializerMethodField()

    class Meta:
        model = Ticket
        fields = [
            "id", "ticket_id", "title", "category_name", "status", "priority",
            "created_by_name", "assigned_to_name", "department",
            "is_class_level", "sla_deadline", "sla_status", "sla_breached_at",
            "escalation_level", "created_at", "updated_at", "message_count",
        ]

    def get_created_by_name(self, obj):
        return obj.created_by.get_full_name() or obj.created_by.username

    def get_assigned_to_name(self, obj):
        if obj.assigned_to:
            return obj.assigned_to.get_full_name() or obj.assigned_to.username
        return None

    def get_message_count(self, obj):
        return obj.messages.count()


class TicketDetailSerializer(serializers.ModelSerializer):
    created_by = UserSerializer(read_only=True)
    assigned_to = UserSerializer(read_only=True)
    category = CategorySerializer(read_only=True)
    messages = TicketMessageSerializer(many=True, read_only=True)
    status_logs = StatusLogSerializer(many=True, read_only=True)
    attachments = AttachmentSerializer(many=True, read_only=True)
    target_department = serializers.SerializerMethodField()

    class Meta:
        model = Ticket
        fields = "__all__"

    def get_target_department(self, obj):
        route = get_category_route(obj.category)
        if route and route["target_dept"] and route["target_dept"] != "HOD":
            return route["target_dept"]
        return obj.department


class TicketCreateSerializer(serializers.ModelSerializer):
    assigned_to = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.all(),
        required=False,
        allow_null=True,
        help_text="Optional assignee (staff/admin only). Ignored for non-staff creators.",
    )

    class Meta:
        model = Ticket
        fields = [
            "id", "ticket_id", "title", "description", "category", "priority",
            "department", "is_class_level", "class_section", "student_names",
            "assigned_to",
        ]
        read_only_fields = ["id", "ticket_id"]

    def validate_assigned_to(self, value):
        if value is None:
            return value
        if value.role not in [
            "STAFF", "DEPT_ADMIN", "CAMPUS_ADMIN",
        ]:
            raise serializers.ValidationError("Assignee must be a staff member or admin")
        return value

    def create(self, validated_data):
        user = self.context["request"].user
        if user.role not in [
            "STAFF", "DEPT_ADMIN", "CAMPUS_ADMIN",
        ]:
            validated_data.pop("assigned_to", None)
            validated_data["priority"] = Ticket.Priority.MEDIUM
        validated_data["created_by"] = user
        return super().create(validated_data)
