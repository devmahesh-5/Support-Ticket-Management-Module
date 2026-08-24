from rest_framework import serializers
from .models import Department, SubDepartment, User


class DepartmentSerializer(serializers.ModelSerializer):
    department_label = serializers.SerializerMethodField()

    class Meta:
        model = Department
        fields = ["id", "code", "name", "description", "is_active", "department_label"]

    def get_department_label(self, obj):
        return f"{obj.name} ({obj.code})"

    def validate_code(self, value):
        return value.strip().upper()

    def validate(self, attrs):
        instance = self.instance
        code = attrs.get("code", getattr(instance, "code", None))
        qs = Department.objects.exclude(pk=getattr(instance, "pk", None))
        if code and qs.filter(code=code).exists():
            raise serializers.ValidationError({"code": "A department with this code already exists."})
        return attrs


class SubDepartmentSerializer(serializers.ModelSerializer):
    """Teams are created WITHOUT a lead (name + department only). The lead
    emerges from the roster: whichever user has role TEAM_LEAD and belongs to
    this team becomes its lead (synced by the user serializers)."""

    lead = serializers.PrimaryKeyRelatedField(read_only=True)
    lead_detail = serializers.SerializerMethodField()
    member_count = serializers.SerializerMethodField()

    class Meta:
        model = SubDepartment
        fields = [
            "id", "name", "department", "lead", "lead_detail",
            "description", "is_active", "member_count",
        ]

    def get_lead_detail(self, obj):
        if not obj.lead_id:
            return None
        return {
            "id": obj.lead_id,
            "username": obj.lead.username,
            "full_name": obj.lead.get_full_name() or obj.lead.username,
        }

    def get_member_count(self, obj):
        return obj.members.filter(role=User.Role.STAFF, is_active=True).count()

    def validate(self, attrs):
        instance = self.instance
        department = attrs.get("department", getattr(instance, "department", None))
        requester = getattr(self.context.get("request"), "user", None)
        if (
            requester is not None
            and requester.role == User.Role.DEPT_ADMIN
            and department != requester.department
        ):
            raise serializers.ValidationError(
                {"department": "HODs can only manage teams in their own department."}
            )
        return attrs


class UserSerializer(serializers.ModelSerializer):
    full_name = serializers.SerializerMethodField()
    sub_department_detail = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id", "username", "email", "full_name", "first_name", "last_name",
            "role", "department", "sub_department", "sub_department_detail",
            "section", "batch", "phone", "is_available", "level",
            "is_active", "date_joined",
        ]
        read_only_fields = ["id", "level", "date_joined"]

    def get_full_name(self, obj):
        return obj.get_full_name() or obj.username

    def get_sub_department_detail(self, obj):
        if not obj.sub_department_id:
            return None
        return {
            "id": obj.sub_department_id,
            "name": obj.sub_department.name,
            "department": obj.sub_department.department,
        }

    def validate(self, attrs):
        instance = self.instance
        request = self.context.get("request")
        requester = getattr(request, "user", None) if request else None

        # Levels are derived from the role automatically (0 staff / 1 team
        # lead / 2 HOD) and are read-only on this serializer.

        # HODs may only manage staff/team-lead accounts inside their own
        # department (and cannot promote anyone above team lead).
        effective_role = attrs.get("role", getattr(instance, "role", None))
        if requester is not None and requester.role == User.Role.DEPT_ADMIN:
            if instance is not None and instance.department != requester.department:
                raise serializers.ValidationError(
                    {"detail": "HODs can only manage users in their own department."}
                )
            if effective_role not in (User.Role.STAFF, User.Role.TEAM_LEAD):
                raise serializers.ValidationError(
                    {"role": "HODs can only manage staff and team lead accounts."}
                )
            if "department" in attrs and attrs["department"] != requester.department:
                raise serializers.ValidationError(
                    {"department": "HODs can only manage users in their own department."}
                )

        # Team membership: only staff/team leads carry a sub-department.
        sub_department = attrs.get("sub_department", getattr(instance, "sub_department", None))
        if effective_role not in (User.Role.STAFF, User.Role.TEAM_LEAD) and sub_department:
            raise serializers.ValidationError(
                {"sub_department": "Only staff members and team leads belong to a team."}
            )
        if sub_department:
            if (
                requester is not None
                and requester.role == User.Role.DEPT_ADMIN
                and getattr(sub_department, "department", None) != requester.department
            ):
                raise serializers.ValidationError(
                    {"sub_department": "HODs can only manage teams in their own department."}
                )
            target_dept = attrs.get("department", getattr(instance, "department", None))
            if target_dept and getattr(sub_department, "department", None) != target_dept:
                raise serializers.ValidationError(
                    {"sub_department": "Team must belong to the user's department."}
                )

        return attrs

    def create(self, validated_data):
        user = super().create(validated_data)
        sync_team_lead(user)
        return user

    def update(self, instance, validated_data):
        user = super().update(instance, validated_data)
        sync_team_lead(user)
        return user


def sync_team_lead(user):
    """Keep SubDepartment.lead aligned with TEAM_LEAD users.

    Whichever user has role TEAM_LEAD and belongs to a team becomes that
    team's lead (teams are created without leads). Demoting or moving a lead
    releases the old team automatically.
    """
    if user.role == User.Role.TEAM_LEAD:
        team = user.sub_department
        if team is not None and team.lead_id != user.id:
            team.lead = user
            team.save(update_fields=["lead"])
        # Release any other teams still pointing at this user.
        user.led_teams.exclude(id=user.sub_department_id).update(lead=None)
    else:
        user.led_teams.update(lead=None)


class UserCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = [
            "username", "email", "password", "first_name", "last_name",
            "role", "department", "sub_department", "section", "batch", "phone",
        ]
        extra_kwargs = {
            "password": {"write_only": True},
            "sub_department": {"required": False, "allow_null": True},
        }

    def validate(self, attrs):
        role = attrs.get("role", User.Role.STUDENT)
        request = self.context.get("request")
        requester = getattr(request, "user", None) if request else None

        if requester and requester.role == User.Role.DEPT_ADMIN:
            if role not in (User.Role.STAFF, User.Role.TEAM_LEAD):
                raise serializers.ValidationError(
                    "HODs can only create staff or team lead accounts in their own department."
                )
            if attrs.get("department") != requester.department:
                raise serializers.ValidationError(
                    "HODs can only create users in their own department."
                )

        if role in (User.Role.STUDENT, User.Role.CR):
            # Students and CRs never carry a staff escalation level.
            attrs.pop("level", None)
            attrs.pop("sub_department", None)
        elif role == User.Role.CAMPUS_ADMIN:
            attrs["level"] = None
        elif role == User.Role.DEPT_ADMIN:
            attrs["level"] = 2
        elif role == User.Role.TEAM_LEAD:
            attrs["level"] = 1
        elif role == User.Role.STAFF:
            attrs["level"] = 0
        return attrs

    def create(self, validated_data):
        password = validated_data.pop("password")
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        sync_team_lead(user)
        return user


class BulkImportSerializer(serializers.Serializer):
    file = serializers.FileField()
