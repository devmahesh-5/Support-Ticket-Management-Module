from rest_framework import serializers

from .models import (
    EscalationHistory,
    EscalationPolicy,
    EscalationRule,
    SupportQueue,
    TicketAssignmentStage,
)
from accounts.serializers import UserSerializer
from accounts.models import User
from .services.engine import RULE_ACTIONS

RULE_FIELDS = {
    "priority", "status", "sla_status", "department", "category",
    "escalation_level",
    "no_activity_hours", "sla_resolution_pct", "sla_response_pct",
}
RULE_OPS = {"eq", "neq", "gt", "gte", "lt", "lte", "in", "contains"}


LEVEL_LABELS = {
    1: "Level 1 (Staff)",
    2: "Level 2 (Staff)",
    3: "Level 3 (HOD)",
}


def validate_conditions(conditions):
    if not isinstance(conditions, list):
        raise serializers.ValidationError("conditions must be a list")
    for cond in conditions:
        if not isinstance(cond, dict) or "field" not in cond or "op" not in cond:
            raise serializers.ValidationError("Each condition requires field and op")
        if cond["field"] not in RULE_FIELDS:
            raise serializers.ValidationError(f"Unknown rule field: {cond['field']}")
        if cond["op"] not in RULE_OPS:
            raise serializers.ValidationError(f"Unknown rule operator: {cond['op']}")
        if "value" not in cond:
            raise serializers.ValidationError("Each condition requires a value")
    return conditions


def validate_actions(actions):
    if not isinstance(actions, list):
        raise serializers.ValidationError("actions must be a list")
    for action in actions:
        if not isinstance(action, dict) or action.get("action") not in RULE_ACTIONS:
            raise serializers.ValidationError(
                f"Unknown rule action: {action.get('action') if isinstance(action, dict) else action}"
            )
    return actions


class SupportQueueSerializer(serializers.ModelSerializer):
    member_ids = serializers.PrimaryKeyRelatedField(
        many=True, source="members", queryset=User.objects.all(), required=False,
    )
    members_detail = UserSerializer(many=True, source="members", read_only=True)

    class Meta:
        model = SupportQueue
        fields = "__all__"


class EscalationPolicySerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source="category.name", read_only=True)
    from_level_name = serializers.SerializerMethodField()
    to_level_name = serializers.SerializerMethodField()
    rules = serializers.SerializerMethodField()

    class Meta:
        model = EscalationPolicy
        fields = "__all__"

    def get_from_level_name(self, obj):
        return LEVEL_LABELS.get(obj.from_level) if obj.from_level else None

    def get_to_level_name(self, obj):
        return LEVEL_LABELS.get(obj.to_level) if obj.to_level else None

    def get_rules(self, obj):
        return EscalationRuleSerializer(obj.rules.all(), many=True).data

    def validate(self, attrs):
        instance = self.instance
        from_level = attrs.get("from_level", getattr(instance, "from_level", None))
        to_level = attrs.get("to_level", getattr(instance, "to_level", None))

        if from_level is not None and to_level is not None and from_level > to_level:
            raise serializers.ValidationError(
                "From level cannot be higher than the To level."
            )

        queryset = EscalationPolicy.objects.all()
        if instance:
            queryset = queryset.exclude(pk=instance.pk)

        if from_level is not None and queryset.filter(from_level=from_level).exists():
            raise serializers.ValidationError(
                f"A policy already escalates from Level {from_level}."
            )

        if queryset.count() >= 2:
            raise serializers.ValidationError(
                "Only 2 escalation policies are allowed (one per level transition)."
            )

        return attrs


class EscalationRuleSerializer(serializers.ModelSerializer):
    class Meta:
        model = EscalationRule
        fields = "__all__"

    def validate_conditions(self, value):
        return validate_conditions(value)

    def validate_actions(self, value):
        return validate_actions(value)


class EscalationHistorySerializer(serializers.ModelSerializer):
    policy_name = serializers.CharField(source="policy.name", read_only=True, default=None)
    actor_name = serializers.SerializerMethodField()

    class Meta:
        model = EscalationHistory
        fields = "__all__"
        read_only_fields = ["ticket", "created_at"]

    def get_actor_name(self, obj):
        if obj.actor:
            return obj.actor.get_full_name() or obj.actor.username
        return "System"


class TicketAssignmentStageSerializer(serializers.ModelSerializer):
    level_label = serializers.SerializerMethodField()
    queue_name = serializers.CharField(source="queue.name", read_only=True, default=None)
    assigned_user_name = serializers.SerializerMethodField()

    class Meta:
        model = TicketAssignmentStage
        fields = "__all__"

    def get_level_label(self, obj):
        return LEVEL_LABELS.get(obj.level) if obj.level else None

    def get_assigned_user_name(self, obj):
        if obj.assigned_user:
            return obj.assigned_user.get_full_name() or obj.assigned_user.username
        return None
