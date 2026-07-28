from rest_framework import viewsets, permissions, status, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from django.db.models import Q, Count
from django.utils import timezone
from datetime import timedelta

from .models import Category, RoutingRule, Ticket, TicketMessage, StatusLog
from .serializers import (
    CategorySerializer, RoutingRuleSerializer,
    TicketListSerializer, TicketDetailSerializer, TicketCreateSerializer,
    TicketMessageSerializer, StatusLogSerializer,
)
from .routing import assign_ticket
from accounts.models import User
from notifications.models import Notification


class IsStaffOrAdmin(permissions.BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role in [
            User.Role.STAFF, User.Role.DEPT_ADMIN, User.Role.CAMPUS_ADMIN
        ]


class CategoryViewSet(viewsets.ModelViewSet):
    queryset = Category.objects.all()
    serializer_class = CategorySerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_permissions(self):
        if self.action in ["create", "update", "partial_update", "destroy"]:
            return [permissions.IsAuthenticated(), IsStaffOrAdmin()]
        return [permissions.IsAuthenticated()]


class RoutingRuleViewSet(viewsets.ModelViewSet):
    queryset = RoutingRule.objects.all().order_by("priority")
    serializer_class = RoutingRuleSerializer
    permission_classes = [permissions.IsAuthenticated, IsStaffOrAdmin]


class TicketViewSet(viewsets.ModelViewSet):
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["status", "priority", "category", "department", "is_class_level"]
    search_fields = ["ticket_id", "title", "description"]
    ordering_fields = ["created_at", "updated_at", "priority", "status"]

    def get_serializer_class(self):
        if self.action == "create":
            return TicketCreateSerializer
        elif self.action in ["list", "my_tickets", "department_tickets"]:
            return TicketListSerializer
        return TicketDetailSerializer

    def get_queryset(self):
        user = self.request.user
        qs = Ticket.objects.select_related(
            "category", "created_by", "assigned_to"
        ).prefetch_related("messages", "status_logs")

        if user.role == User.Role.CAMPUS_ADMIN:
            return qs
        elif user.role == User.Role.DEPT_ADMIN:
            return qs.filter(
                Q(department=user.department) |
                Q(assigned_to__department=user.department)
            )
        elif user.role == User.Role.STAFF:
            return qs.filter(
                Q(assigned_to=user) |
                Q(department=user.department)
            )
        else:
            return qs.filter(created_by=user)

    def perform_create(self, serializer):
        ticket = serializer.save(created_by=self.request.user)
        if not ticket.department and self.request.user.role in [User.Role.CR, User.Role.STUDENT]:
            ticket.department = self.request.user.department
        ticket.save()
        assign_ticket(ticket)
        StatusLog.objects.create(
            ticket=ticket, to_status="OPEN", changed_by=self.request.user,
            note="Ticket created"
        )
        if ticket.assigned_to:
            Notification.objects.create(
                user=ticket.assigned_to,
                title="New Ticket Assigned",
                message=f"Ticket {ticket.ticket_id}: {ticket.title} has been assigned to you.",
                notification_type="ASSIGNMENT",
                ticket=ticket,
            )

    @action(detail=True, methods=["post"])
    def add_message(self, request, pk=None):
        ticket = self.get_object()
        content = request.data.get("content")
        is_internal = request.data.get("is_internal_note", "false") in ["true", "True", True]

        if not content:
            return Response({"error": "Content is required"}, status=status.HTTP_400_BAD_REQUEST)

        if is_internal and request.user.role not in [
            User.Role.STAFF, User.Role.DEPT_ADMIN, User.Role.CAMPUS_ADMIN
        ]:
            return Response({"error": "Only staff can add internal notes"}, status=status.HTTP_403_FORBIDDEN)

        message = TicketMessage.objects.create(
            ticket=ticket,
            author=request.user,
            content=content,
            is_internal_note=is_internal,
        )

        if request.FILES.get("file"):
            message.file = request.FILES["file"]
            message.save()

        if not is_internal:
            recipients = User.objects.filter(
                Q(id=ticket.created_by_id) | Q(id=ticket.assigned_to_id)
            ).exclude(id=request.user.id).distinct()
            for recipient in recipients:
                Notification.objects.create(
                    user=recipient,
                    title="New Reply",
                    message=f"New reply on {ticket.ticket_id} by {request.user.get_full_name() or request.user.username}",
                    notification_type="REPLY",
                    ticket=ticket,
                )

        return Response(TicketMessageSerializer(message, context={"request": request}).data)

    @action(detail=True, methods=["post"])
    def change_status(self, request, pk=None):
        ticket = self.get_object()
        new_status = request.data.get("status")
        user = request.user
        is_creator = user.id == ticket.created_by_id
        is_staff = user.role in [User.Role.STAFF, User.Role.DEPT_ADMIN, User.Role.CAMPUS_ADMIN]

        if new_status not in [s.value for s in Ticket.Status]:
            return Response({"error": f"Invalid status: {new_status}"}, status=status.HTTP_400_BAD_REQUEST)

        valid_transition = False
        old_status = ticket.status

        if old_status == Ticket.Status.OPEN and new_status == Ticket.Status.IN_PROGRESS and is_staff:
            valid_transition = True
        elif old_status == Ticket.Status.IN_PROGRESS and new_status == Ticket.Status.RESOLVED and is_staff:
            valid_transition = True
        elif new_status == Ticket.Status.CLOSED and is_creator:
            valid_transition = True
        elif old_status == Ticket.Status.CLOSED and new_status == Ticket.Status.REOPENED and is_creator:
            if ticket.closed_at and (timezone.now() - ticket.closed_at).days > 30:
                return Response({"error": "Cannot reopen ticket after 30 days"}, status=status.HTTP_400_BAD_REQUEST)
            valid_transition = True
        elif old_status == Ticket.Status.REOPENED and new_status == Ticket.Status.IN_PROGRESS and is_staff:
            valid_transition = True
        elif old_status in [Ticket.Status.ESCALATED_L1, Ticket.Status.ESCALATED_L2, Ticket.Status.ADMIN_REVIEW] and is_staff:
            valid_transition = True
        elif user.role == User.Role.CAMPUS_ADMIN:
            valid_transition = True

        if not valid_transition:
            return Response({"error": "Status transition not allowed"}, status=status.HTTP_403_FORBIDDEN)

        ticket.status = new_status
        note = request.data.get("note", "")

        if new_status in [Ticket.Status.IN_PROGRESS, Ticket.Status.RESOLVED]:
            ticket.escalation_level = 0
        if new_status == Ticket.Status.CLOSED:
            ticket.closed_at = timezone.now()
        elif new_status == Ticket.Status.REOPENED:
            ticket.reopened_at = timezone.now()
            ticket.closed_at = None

        ticket.save()

        StatusLog.objects.create(
            ticket=ticket, from_status=old_status, to_status=new_status,
            changed_by=request.user, note=note
        )

        Notification.objects.create(
            user=ticket.created_by,
            title=f"Ticket {new_status}",
            message=f"Ticket {ticket.ticket_id} status changed to {new_status}.",
            notification_type="STATUS_CHANGE",
            ticket=ticket,
        )

        return Response(TicketDetailSerializer(ticket, context={"request": request}).data)

    @action(detail=True, methods=["post"])
    def reassign(self, request, pk=None):
        ticket = self.get_object()
        user_id = request.data.get("assigned_to")

        if not user_id:
            return Response({"error": "assigned_to is required"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            new_assignee = User.objects.get(id=user_id)
        except User.DoesNotExist:
            return Response({"error": "User not found"}, status=status.HTTP_404_NOT_FOUND)

        old_assignee = ticket.assigned_to
        ticket.assigned_to = new_assignee
        ticket.save()

        StatusLog.objects.create(
            ticket=ticket, from_status=ticket.status, to_status=ticket.status,
            changed_by=request.user,
            note=f"Reassigned from {old_assignee} to {new_assignee}"
        )

        Notification.objects.create(
            user=new_assignee,
            title="Ticket Reassigned",
            message=f"Ticket {ticket.ticket_id} has been reassigned to you.",
            notification_type="REASSIGNMENT",
            ticket=ticket,
        )

        return Response(TicketDetailSerializer(ticket, context={"request": request}).data)

    @action(detail=True, methods=["post"])
    def escalate(self, request, pk=None):
        ticket = self.get_object()
        user = request.user
        level = ticket.escalation_level + 1

        if level == 1:
            ticket.status = Ticket.Status.ESCALATED_L1
            dept_admin = User.objects.filter(
                role=User.Role.DEPT_ADMIN,
                department=ticket.department or user.department,
            ).first()
            if dept_admin:
                ticket.assigned_to = dept_admin
        elif level == 2:
            ticket.status = Ticket.Status.ESCALATED_L2
            campus_admin = User.objects.filter(role=User.Role.CAMPUS_ADMIN).first()
            if campus_admin:
                ticket.assigned_to = campus_admin

        ticket.escalation_level = level
        ticket.save()

        StatusLog.objects.create(
            ticket=ticket, from_status="", to_status=ticket.status,
            changed_by=user, note=f"Escalated to level {level}"
        )

        if ticket.assigned_to:
            Notification.objects.create(
                user=ticket.assigned_to,
                title=f"Ticket Escalated (Level {level})",
                message=f"Ticket {ticket.ticket_id} has been escalated to you.",
                notification_type="ESCALATION",
                ticket=ticket,
            )

        return Response(TicketDetailSerializer(ticket, context={"request": request}).data)

    @action(detail=False, methods=["get"])
    def my_tickets(self, request):
        tickets = Ticket.objects.filter(created_by=request.user).order_by("-created_at")
        page = self.paginate_queryset(tickets)
        if page is not None:
            serializer = TicketListSerializer(page, many=True, context={"request": request})
            return self.get_paginated_response(serializer.data)
        serializer = TicketListSerializer(tickets, many=True, context={"request": request})
        return Response(serializer.data)

    @action(detail=False, methods=["get"])
    def department_tickets(self, request):
        user = request.user
        if user.department:
            tickets = Ticket.objects.filter(
                Q(department=user.department) |
                Q(assigned_to__department=user.department)
            ).order_by("-created_at")
        else:
            tickets = Ticket.objects.none()
        page = self.paginate_queryset(tickets)
        if page is not None:
            serializer = TicketListSerializer(page, many=True, context={"request": request})
            return self.get_paginated_response(serializer.data)
        serializer = TicketListSerializer(tickets, many=True, context={"request": request})
        return Response(serializer.data)

    @action(detail=False, methods=["get"])
    def stats(self, request):
        user = request.user
        qs = self.get_queryset()
        total = qs.count()
        by_status = qs.values("status").annotate(count=Count("id"))
        by_priority = qs.values("priority").annotate(count=Count("id"))
        by_category = qs.values("category__name").annotate(count=Count("id"))
        overdue = qs.filter(
            sla_deadline__lt=timezone.now(),
            status__in=["OPEN", "IN_PROGRESS", "REOPENED"]
        ).count()
        avg_resolution = qs.filter(
            status__in=["RESOLVED", "CLOSED"], closed_at__isnull=False
        ).extra(
            select={"avg_hours": "EXTRACT(EPOCH FROM AVG(closed_at - created_at))/3600"}
        ).values("avg_hours").first()

        return Response({
            "total": total,
            "by_status": {s["status"]: s["count"] for s in by_status},
            "by_priority": {p["priority"]: p["count"] for p in by_priority},
            "by_category": {c["category__name"] or "Uncategorized": c["count"] for c in by_category},
            "overdue": overdue,
            "avg_resolution_hours": round(avg_resolution["avg_hours"], 1) if avg_resolution and avg_resolution.get("avg_hours") else None,
        })

    @action(detail=False, methods=["get"])
    def dashboard(self, request):
        user = request.user
        qs = self.get_queryset()

        open_count = qs.filter(status__in=["OPEN", "IN_PROGRESS", "REOPENED"]).count()
        closed_count = qs.filter(status__in=["RESOLVED", "CLOSED"]).count()
        escalated_count = qs.filter(
            status__in=["ESCALATED_L1", "ESCALATED_L2", "ADMIN_REVIEW"]
        ).count()
        my_tickets = qs.filter(assigned_to=user).count() if user.role in [
            User.Role.STAFF, User.Role.DEPT_ADMIN, User.Role.CAMPUS_ADMIN
        ] else 0
        recent = qs.order_by("-updated_at")[:10]
        recent_serializer = TicketListSerializer(recent, many=True, context={"request": request})

        staff_metrics = []
        if user.role in [User.Role.CAMPUS_ADMIN, User.Role.DEPT_ADMIN]:
            staff_qs = User.objects.filter(
                role=User.Role.STAFF,
                department=user.department if user.role == User.Role.DEPT_ADMIN else None,
            )
            for staff in staff_qs:
                handled = Ticket.objects.filter(assigned_to=staff).count()
                staff_metrics.append({
                    "name": staff.get_full_name() or staff.username,
                    "tickets_handled": handled,
                })

        return Response({
            "open": open_count,
            "closed": closed_count,
            "escalated": escalated_count,
            "my_tickets": my_tickets,
            "recent": recent_serializer.data,
            "staff_metrics": staff_metrics,
        })
