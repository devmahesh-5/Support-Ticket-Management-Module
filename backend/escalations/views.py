from django.db.models import Avg, F, Q
from django.utils import timezone
from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response

from accounts.models import User
from tickets.models import StatusLog, Ticket
from tickets.serializers import TicketListSerializer
from tickets.views import IsStaffOrAdmin

from .models import (
    EscalationHistory,
    EscalationPolicy,
    EscalationRule,
    SupportQueue,
    TicketAssignmentStage,
)
from .serializers import (
    EscalationHistorySerializer,
    EscalationPolicySerializer,
    EscalationRuleSerializer,
    SupportQueueSerializer,
    TicketAssignmentStageSerializer,
)

ACTIVE = ["OPEN", "IN_PROGRESS", "REOPENED", "ESCALATED_L1", "ESCALATED_L2", "ADMIN_REVIEW"]


def _visible_tickets(user):
    qs = Ticket.objects.all()
    if user.role == User.Role.CAMPUS_ADMIN:
        return qs
    if user.role == User.Role.DEPT_ADMIN:
        return qs.filter(department=user.department)
    if user.role == User.Role.STAFF:
        return qs.filter(Q(assigned_to=user) | Q(created_by=user))
    return qs.filter(created_by=user)


class SupportQueueViewSet(viewsets.ModelViewSet):
    queryset = SupportQueue.objects.all()
    serializer_class = SupportQueueSerializer
    permission_classes = [permissions.IsAuthenticated, IsStaffOrAdmin]


class EscalationPolicyViewSet(viewsets.ModelViewSet):
    queryset = EscalationPolicy.objects.select_related("category").prefetch_related("rules")
    serializer_class = EscalationPolicySerializer
    permission_classes = [permissions.IsAuthenticated, IsStaffOrAdmin]
    filterset_fields = ["is_enabled", "department", "priority"]


class EscalationRuleViewSet(viewsets.ModelViewSet):
    serializer_class = EscalationRuleSerializer
    permission_classes = [permissions.IsAuthenticated, IsStaffOrAdmin]

    def get_queryset(self):
        qs = EscalationRule.objects.select_related("policy")
        policy = self.request.query_params.get("policy")
        if policy:
            qs = qs.filter(policy_id=policy)
        return qs


class EscalationHistoryViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = EscalationHistorySerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        qs = EscalationHistory.objects.select_related("policy", "actor", "ticket")
        user = self.request.user
        visible = _visible_tickets(user)
        qs = qs.filter(ticket__in=visible)
        ticket = self.request.query_params.get("ticket")
        if ticket:
            qs = qs.filter(ticket_id=ticket)
        action = self.request.query_params.get("action")
        if action:
            qs = qs.filter(action=action)
        return qs


class TicketAssignmentStageViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = TicketAssignmentStageSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        qs = TicketAssignmentStage.objects.select_related("ticket", "queue", "assigned_user")
        user = self.request.user
        visible = _visible_tickets(user)
        qs = qs.filter(ticket__in=visible)
        ticket = self.request.query_params.get("ticket")
        if ticket:
            qs = qs.filter(ticket_id=ticket)
        return qs


class EscalationDashboardViewSet(viewsets.ViewSet):
    permission_classes = [permissions.IsAuthenticated, IsStaffOrAdmin]

    def _qs(self, request):
        return _visible_tickets(request.user)

    def _rows(self, tickets):
        from tickets.serializers import TicketListSerializer
        data = TicketListSerializer(tickets, many=True, context={"request": None}).data
        return data

    @action(detail=False, methods=["get"])
    def dashboard(self, request):
        now = timezone.now()
        qs = self._qs(request).select_related("category", "assigned_to", "created_by")

        approaching = qs.filter(sla_status="APPROACHING", status__in=ACTIVE).order_by("sla_deadline")
        breached = qs.filter(sla_status="BREACHED", status__in=ACTIVE)
        escalation_q = qs.filter(queue__is_escalation_queue=True, status__in=ACTIVE)
        waiting = qs.filter(assigned_to__isnull=True, status__in=ACTIVE).order_by("created_at")
        longest_breached = breached.filter(sla_breached_at__isnull=False).order_by("sla_breached_at")[:10]

        breach_ages = breached.filter(sla_breached_at__isnull=False)
        avg = breach_ages.annotate(
            age=F("sla_breached_at")
        ).values_list("id", "sla_breached_at")

        avg_breach_seconds = 0
        count = 0
        for _, breached_at in avg:
            avg_breach_seconds += (now - breached_at).total_seconds()
            count += 1
        average_breach_hours = round(avg_breach_seconds / count / 3600, 1) if count else None

        return Response({
            "counts": {
                "approaching": approaching.count(),
                "breached": breached.count(),
                "escalation_queue": escalation_q.count(),
                "waiting_assignment": waiting.count(),
            },
            "approaching": self._rows(approaching[:20]),
            "breached": self._rows(breached[:20]),
            "escalation_queue": self._rows(escalation_q[:20]),
            "waiting_assignment": self._rows(waiting[:20]),
            "longest_breached": self._rows(longest_breached),
            "average_breach_hours": average_breach_hours,
        })

    @action(detail=True, methods=["post"])
    def assign(self, request, pk=None):
        ticket = self.get_object(pk)
        user_id = request.data.get("assigned_to")
        from accounts.models import User as AuthUser
        try:
            assignee = AuthUser.objects.get(id=user_id)
        except AuthUser.DoesNotExist:
            return Response({"error": "User not found"}, status=status.HTTP_404_NOT_FOUND)
        ticket.assigned_to = assignee
        ticket.save()
        from .services.audit import log
        from .models import EscalationHistory
        log(
            ticket=ticket, action=EscalationHistory.Action.ASSIGNMENT_CHANGED,
            actor=request.user,
            message=f"Assigned to {assignee.get_full_name() or assignee.username} from escalation dashboard",
            details={"assignee": assignee.username},
        )
        return Response(self._rows([ticket])[0])

    @action(detail=True, methods=["post"])
    def keep_owner(self, request, pk=None):
        ticket = self.get_object(pk)
        ticket.queue = None
        ticket.save()
        from .services.audit import log
        from .models import EscalationHistory
        log(
            ticket=ticket, action=EscalationHistory.Action.QUEUE_CHANGED,
            actor=request.user,
            message="Kept current owner; removed from escalation queue",
            details={"queue": None},
        )
        return Response(self._rows([ticket])[0])

    @action(detail=True, methods=["post"])
    def increase_priority(self, request, pk=None):
        ticket = self.get_object(pk)
        new_priority = request.data.get("priority")
        valid = [p[0] for p in Ticket.Priority.choices]
        if new_priority not in valid:
            return Response({"error": "Invalid priority"}, status=status.HTTP_400_BAD_REQUEST)
        old = ticket.priority
        ticket.priority = new_priority
        ticket.save()
        StatusLog.objects.create(
            ticket=ticket, from_status=ticket.status, to_status=ticket.status,
            changed_by=request.user,
            note=f"Priority changed from {old} to {new_priority} (escalation dashboard)",
        )
        from .services.audit import log
        from .models import EscalationHistory
        log(
            ticket=ticket, action=EscalationHistory.Action.PRIORITY_CHANGED,
            actor=request.user, message=f"Priority changed {old} -> {new_priority}",
            details={"from": old, "to": new_priority},
        )
        return Response(self._rows([ticket])[0])

    @action(detail=True, methods=["post"])
    def resolve(self, request, pk=None):
        ticket = self.get_object(pk)
        ticket.status = Ticket.Status.RESOLVED
        ticket.escalation_level = 0
        ticket.queue = None
        ticket.save()
        StatusLog.objects.create(
            ticket=ticket, from_status="", to_status=ticket.status,
            changed_by=request.user, note="Resolved from escalation dashboard",
        )
        from .services.audit import log
        from .models import EscalationHistory
        log(
            ticket=ticket, action=EscalationHistory.Action.SYSTEM,
            actor=request.user, message="Resolved from escalation dashboard",
        )
        return Response(self._rows([ticket])[0])

    def get_object(self, pk):
        from rest_framework.exceptions import NotFound
        try:
            return self._qs(self.request).get(pk=pk)
        except Ticket.DoesNotExist:
            raise NotFound("Ticket not found")
