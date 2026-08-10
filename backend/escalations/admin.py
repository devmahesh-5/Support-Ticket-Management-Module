from django.contrib import admin

from .models import (
    EscalationHistory,
    EscalationPolicy,
    EscalationRule,
    SupportQueue,
    TicketAssignmentStage,
)


class EscalationRuleInline(admin.TabularInline):
    model = EscalationRule
    extra = 0


@admin.register(SupportQueue)
class SupportQueueAdmin(admin.ModelAdmin):
    list_display = ["name", "department", "is_escalation_queue", "is_active"]
    list_filter = ["department", "is_escalation_queue", "is_active"]
    filter_horizontal = ["members"]
    readonly_fields = [f.name for f in SupportQueue._meta.fields] + ["members"]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(EscalationPolicy)
class EscalationPolicyAdmin(admin.ModelAdmin):
    list_display = [
        "name", "department", "category", "priority", "is_enabled",
        "auto_escalate",
    ]
    list_filter = ["is_enabled", "department", "priority", "auto_escalate"]
    inlines = [EscalationRuleInline]


@admin.register(EscalationRule)
class EscalationRuleAdmin(admin.ModelAdmin):
    list_display = ["name", "policy", "order", "is_active"]
    list_filter = ["is_active", "policy"]


@admin.register(EscalationHistory)
class EscalationHistoryAdmin(admin.ModelAdmin):
    list_display = ["ticket", "action", "policy", "message", "created_at"]
    list_filter = ["action", "policy"]
    search_fields = ["ticket__ticket_id", "message"]
    readonly_fields = [f.name for f in EscalationHistory._meta.fields]


@admin.register(TicketAssignmentStage)
class TicketAssignmentStageAdmin(admin.ModelAdmin):
    list_display = ["ticket", "level", "queue", "assigned_user", "is_current"]
    list_filter = ["is_current", "level", "queue"]
