from rest_framework import serializers
from .models import User


class UserSerializer(serializers.ModelSerializer):
    full_name = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id", "username", "email", "full_name", "first_name", "last_name",
            "role", "department", "staff_type", "section", "batch", "phone", "is_available", "level",
            "is_active", "date_joined",
        ]
        read_only_fields = ["id", "date_joined"]

    def get_full_name(self, obj):
        return obj.get_full_name() or obj.username

    def validate(self, attrs):
        instance = self.instance
        request = self.context.get("request")
        requester = getattr(request, "user", None) if request else None

        if instance is not None and requester and "level" in attrs and attrs.get("level") != instance.level:
            if instance.role != User.Role.STAFF:
                raise serializers.ValidationError(
                    {"level": "Only staff levels can be changed. HODs are fixed at Level 3 and campus admins have no level."}
                )
            if requester.role not in (User.Role.CAMPUS_ADMIN, User.Role.DEPT_ADMIN):
                raise serializers.ValidationError(
                    {"level": "Only the campus admin or a HOD can change staff levels."}
                )
            if requester.role == User.Role.DEPT_ADMIN and instance.department != requester.department:
                raise serializers.ValidationError(
                    {"level": "HODs can only change levels of staff in their own department."}
                )

        # Staff type must be within the department's allowed set. No GENERAL
        # staff type exists (the General / Other category routes to the HOD).
        effective_role = attrs.get("role", getattr(instance, "role", None))
        if effective_role == User.Role.STAFF:
            dept = attrs.get("department", getattr(instance, "department", None))
            staff_type = attrs.get("staff_type", getattr(instance, "staff_type", None))
            if staff_type:
                allowed = User.allowed_staff_types(dept)
                if staff_type not in allowed:
                    raise serializers.ValidationError({
                        "staff_type": (
                            f"Staff type '{staff_type}' is not valid for department "
                            f"'{dept or 'none'}'. Allowed: {', '.join(allowed) or 'none'}."
                        )
                    })
        return attrs


class UserCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = [
            "username", "email", "password", "first_name", "last_name",
            "role", "department", "section", "batch", "phone",
            "staff_type", "level",
        ]
        extra_kwargs = {
            "password": {"write_only": True},
            "staff_type": {"required": False, "allow_null": True},
            "level": {"required": False, "allow_null": True},
        }

    def validate(self, attrs):
        role = attrs.get("role", User.Role.STUDENT)
        request = self.context.get("request")
        requester = getattr(request, "user", None) if request else None

        if requester and requester.role == User.Role.DEPT_ADMIN:
            if role != User.Role.STAFF:
                raise serializers.ValidationError(
                    "HODs can only create staff accounts in their own department."
                )
            if attrs.get("department") != requester.department:
                raise serializers.ValidationError(
                    "HODs can only create users in their own department."
                )

        if role in (User.Role.STUDENT, User.Role.CR):
            # Students and CRs never carry a staff escalation level or staff type.
            attrs.pop("level", None)
            attrs.pop("staff_type", None)
        elif role == User.Role.CAMPUS_ADMIN:
            attrs["level"] = None
            attrs["staff_type"] = None
        elif role == User.Role.DEPT_ADMIN:
            attrs["level"] = 3
        elif role == User.Role.STAFF:
            level = attrs.get("level")
            attrs["level"] = level if level in (1, 2) else 1
            staff_type = attrs.get("staff_type")
            if staff_type:
                dept = attrs.get("department")
                allowed = User.allowed_staff_types(dept)
                if staff_type not in allowed:
                    raise serializers.ValidationError({
                        "staff_type": (
                            f"Staff type '{staff_type}' is not valid for department "
                            f"'{dept or 'none'}'. Allowed: {', '.join(allowed) or 'none'}."
                        )
                    })
        return attrs

    def create(self, validated_data):
        password = validated_data.pop("password")
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        return user


class BulkImportSerializer(serializers.Serializer):
    file = serializers.FileField()
