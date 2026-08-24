from rest_framework import serializers
from .models import Ticket, TicketCategory, TicketMessage, StatusLog, Attachment, SystemSetting
from accounts.serializers import UserSerializer
from accounts.models import Department, SubDepartment, User


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = TicketCategory
        fields = [
            "id", "name", "description",
            "sla_response_hours", "sla_resolution_hours", "is_active",
        ]

    def validate_name(self, value):
        return value.strip()


ALLOWED_ATTACHMENT_EXTENSIONS = {
    "jpg", "jpeg", "png", "gif", "bmp", "webp", "svg",
    "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx",
    "txt", "csv", "md", "zip",
}

MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024  # 10 MB


class SystemSettingSerializer(serializers.ModelSerializer):
    class Meta:
        model = SystemSetting
        fields = "__all__"



class AttachmentSerializer(serializers.ModelSerializer):
    file_url = serializers.SerializerMethodField()
    file_size = serializers.SerializerMethodField()
    uploaded_by_name = serializers.SerializerMethodField()

    class Meta:
        model = Attachment
        fields = [
            "id", "ticket", "message", "file", "filename", "file_url",
            "file_size", "uploaded_by", "uploaded_by_name", "uploaded_at",
        ]
        read_only_fields = ["id", "filename", "uploaded_by", "uploaded_at"]

    def get_file_url(self, obj):
        request = self.context.get("request")
        url = obj.file.url
        return request.build_absolute_uri(url) if request else url

    def get_file_size(self, obj):
        try:
            return obj.file.size
        except Exception:
            return None

    def get_uploaded_by_name(self, obj):
        if obj.uploaded_by:
            return obj.uploaded_by.get_full_name() or obj.uploaded_by.username
        return None

    def validate_file(self, value):
        ext = value.name.rsplit(".", 1)[-1].lower() if "." in value.name else ""
        if ext not in ALLOWED_ATTACHMENT_EXTENSIONS:
            raise serializers.ValidationError(
                "File type not allowed. Allowed types: "
                + ", ".join(sorted(ALLOWED_ATTACHMENT_EXTENSIONS))
            )
        if value.size > MAX_ATTACHMENT_SIZE:
            raise serializers.ValidationError(
                "File size exceeds the "
                f"{MAX_ATTACHMENT_SIZE // (1024 * 1024)} MB limit."
            )
        return value

    def create(self, validated_data):
        validated_data["uploaded_by"] = self.context["request"].user
        validated_data["filename"] = validated_data["file"].name
        return super().create(validated_data)


class TicketMessageSerializer(serializers.ModelSerializer):
    author_name = serializers.SerializerMethodField()
    author_role = serializers.CharField(source="author.role", read_only=True)
    attachments = AttachmentSerializer(many=True, read_only=True)

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


class TicketListSerializer(serializers.ModelSerializer):
    created_by_name = serializers.SerializerMethodField()
    assigned_to_name = serializers.SerializerMethodField()
    category_name = serializers.SerializerMethodField()
    message_count = serializers.SerializerMethodField()

    class Meta:
        model = Ticket
        fields = [
            "id", "ticket_id", "title", "category_name", "status", "priority",
            "created_by_name", "assigned_to_name", "department",
            "is_class_level", "sla_deadline", "sla_status", "sla_breached_at",
            "escalation_level", "created_at", "updated_at", "message_count",
        ]

    def get_category_name(self, obj):
        return obj.category or "Uncategorized"

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
    category_name = serializers.SerializerMethodField()
    messages = TicketMessageSerializer(many=True, read_only=True)
    status_logs = StatusLogSerializer(many=True, read_only=True)
    attachments = AttachmentSerializer(many=True, read_only=True)
    target_department = serializers.SerializerMethodField()
    sub_department_detail = serializers.SerializerMethodField()

    class Meta:
        model = Ticket
        fields = "__all__"

    def get_category_name(self, obj):
        return obj.category or "Uncategorized"

    def get_target_department(self, obj):
        return obj.department

    def get_sub_department_detail(self, obj):
        if not obj.sub_department_id:
            return None
        return {
            "id": obj.sub_department_id,
            "name": obj.sub_department.name,
            "department": obj.sub_department.department,
        }


class TicketCreateSerializer(serializers.ModelSerializer):
    category = serializers.CharField(
        required=False, allow_blank=True, allow_null=True,
        help_text="Dynamic category name (decides SLA hours only)",
    )
    sub_department = serializers.PrimaryKeyRelatedField(
        queryset=SubDepartment.objects.all(), required=False, allow_null=True,
        help_text="Team the ticket belongs to - routes to this team's lead",
    )

    class Meta:
        model = Ticket
        fields = [
            "id", "ticket_id", "title", "description", "category", "priority",
            "department", "sub_department", "is_class_level", "class_section",
            "student_names",
        ]
        read_only_fields = ["id", "ticket_id"]

    def validate_category(self, value):
        if value in (None, ""):
            return value
        value = value.strip()
        if not TicketCategory.objects.filter(name=value, is_active=True).exists():
            raise serializers.ValidationError("Unknown category.")
        return value

    def validate_department(self, value):
        if value in (None, ""):
            return None
        value = value.strip().upper()
        from accounts.models import Department
        if not Department.objects.filter(code=value, is_active=True).exists():
            raise serializers.ValidationError("Unknown department.")
        return value

    def validate(self, attrs):
        # No direct assignment at creation for anyone: tickets always route
        # to the responsible team lead (see routing.assign_ticket).
        attrs.pop("assigned_to", None)
        # Priority is never settable at creation - staff raise it afterwards.
        attrs["priority"] = Ticket.Priority.MEDIUM

        user = self.context["request"].user
        department = attrs.get("department") or user.department
        if not attrs.get("department") and department:
            attrs["department"] = department
        sub_department = attrs.get("sub_department")

        if sub_department and department and str(sub_department.department) != str(department):
            raise serializers.ValidationError(
                {"sub_department": "Team must belong to the selected department."}
            )
        return attrs

    def create(self, validated_data):
        validated_data["created_by"] = self.context["request"].user
        return super().create(validated_data)
