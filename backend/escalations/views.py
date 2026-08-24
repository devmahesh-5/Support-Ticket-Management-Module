from django.db.models import Avg, F, Q
from django.utils import timezone
from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response

from accounts.models import User
from tickets.models import StatusLog, Ticket
from tickets.serializers import TicketListSerializer
from tickets.views import IsStaffOrAdmin
from .services.assign import CAMPUS_ADMIN_LEVEL, HOD_LEVEL

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


def _mutation_blocker(user, ticket):
    """Return an error message when `user` may not mutate this ticket's
    handling state, else None. Enforces the hierarchy read-only rules:
    team leads stop at HOD level, HODs stop at campus-admin level."""
    level = ticket.escalation_level or 0
    if user.role == User.Role.TEAM_LEAD and level >= HOD_LEVEL:
        return "Read-only: this ticket has been escalated beyond your level"
    if user.role == User.Role.DEPT_ADMIN and level >= CAMPUS_ADMIN_LEVEL:
        return "Read-only: this ticket is with the campus admin"
    return None


def _visible_tickets(user):
    qs = Ticket.objects.all()
    if user.role == User.Role.CAMPUS_ADMIN:
        return qs
    if user.role == User.Role.DEPT_ADMIN:
        return qs.filter(department=user.department)
    if user.role == User.Role.TEAM_LEAD:
        # Teams the lead manages plus their own sub-department membership,
        # and tickets currently held by a member of those teams. Tickets
        # handled at HOD level or above are out of the lead's scope.
        led_team_ids = list(user.led_teams.filter(is_active=True).values_list("id", flat=True))
        if user.sub_department_id and user.sub_department_id not in led_team_ids:
            led_team_ids.append(user.sub_department_id)
        return qs.filter(
            Q(assigned_to=user) |
            Q(created_by=user) |
            Q(sub_department_id__in=led_team_ids) |
            Q(assigned_to__sub_department_id__in=led_team_ids)
        ).exclude(escalation_level__gte=HOD_LEVEL)
    if user.role == User.Role.STAFF:
        return qs.filter(Q(assigned_to=user) | Q(created_by=user))
    return qs.filter(created_by=user)


class IsCampusAdminWrite(permissions.BasePermission):
    """Read for support roles; create/update/delete only for the campus admin."""

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if request.method in permissions.SAFE_METHODS:
            return user.role in User.support_roles()
        return user.role == User.Role.CAMPUS_ADMIN


class SupportQueueViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = SupportQueue.objects.all()
    serializer_class = SupportQueueSerializer
    permission_classes = [permissions.IsAuthenticated, IsStaffOrAdmin]


class EscalationPolicyViewSet(viewsets.ModelViewSet):
    queryset = EscalationPolicy.objects.prefetch_related("rules")
    serializer_class = EscalationPolicySerializer
    permission_classes = [permissions.IsAuthenticated, IsCampusAdminWrite]
    filterset_fields = ["is_enabled", "department", "priority"]


class EscalationRuleViewSet(viewsets.ModelViewSet):
    serializer_class = EscalationRuleSerializer
    permission_classes = [permissions.IsAuthenticated, IsCampusAdminWrite]

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
        qs = self._qs(request).select_related("assigned_to", "created_by")

        approaching = qs.filter(sla_status="APPROACHING", status__in=ACTIVE).order_by("sla_deadline")
        breached = qs.filter(sla_status="BREACHED", status__in=ACTIVE)
        escalation_q = qs.filter(queue__is_escalation_queue=True, status__in=ACTIVE)
        waiting = qs.filter(assigned_to__isnull=True, queue__isnull=True, status__in=ACTIVE).order_by("created_at")
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
        blocked = _mutation_blocker(request.user, ticket)
        if blocked:
            return Response({"error": blocked}, status=status.HTTP_403_FORBIDDEN)
        user_id = request.data.get("assigned_to")
        from accounts.models import User as AuthUser
        from .services.assign import escalation_level_for_assignee, status_for_level
        from tickets.views import TicketViewSet
        try:
            assignee = AuthUser.objects.get(id=user_id)
        except AuthUser.DoesNotExist:
            return Response({"error": "User not found"}, status=status.HTTP_404_NOT_FOUND)
        error = TicketViewSet._check_reassign_permission(request.user, ticket, assignee)
        if error:
            return Response({"error": error}, status=status.HTTP_403_FORBIDDEN)
        ticket.assigned_to = assignee
        ticket.queue = None
        ticket.escalation_level = escalation_level_for_assignee(assignee)
        if ticket.status in ACTIVE and ticket.escalation_level > 0:
            ticket.status = status_for_level(ticket.escalation_level)
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
        blocked = _mutation_blocker(request.user, ticket)
        if blocked:
            return Response({"error": blocked}, status=status.HTTP_403_FORBIDDEN)
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
        blocked = _mutation_blocker(request.user, ticket)
        if blocked:
            return Response({"error": blocked}, status=status.HTTP_403_FORBIDDEN)
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
        blocked = _mutation_blocker(request.user, ticket)
        if blocked:
            return Response({"error": blocked}, status=status.HTTP_403_FORBIDDEN)
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
