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
        if role in (User.Role.STUDENT, User.Role.CR):
            # Students and CRs never carry a staff escalation level or staff type.
            attrs.pop("level", None)
            attrs.pop("staff_type", None)
        return attrs

    def create(self, validated_data):
        password = validated_data.pop("password")
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        return user


class BulkImportSerializer(serializers.Serializer):
    file = serializers.FileField()
