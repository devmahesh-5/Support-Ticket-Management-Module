from rest_framework import viewsets, permissions, status, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from django_filters.rest_framework import DjangoFilterBackend
from django_filters.rest_framework import FilterSet, DateFromToRangeFilter
from django.db.models import Q, Count, Prefetch, F, Avg, Min
from django.db.models.functions import TruncWeek
from django.utils import timezone
from datetime import timedelta

from .models import Ticket, TicketMessage, StatusLog, Attachment, SystemSetting, CategorySla
from .serializers import (
    TicketListSerializer, TicketDetailSerializer, TicketCreateSerializer,
    TicketMessageSerializer, StatusLogSerializer, AttachmentSerializer,
    SystemSettingSerializer,
)
from .routing import assign_ticket, ACTIVE_STATUSES
from .categories import CATEGORY_NAMES, CATEGORY_BY_SLUG, category_dict
from escalations.services.assign import escalation_level_for_assignee
from accounts.models import User
from notifications.models import Notification
from notifications.services import METHOD_EMAIL, METHOD_IN_APP, notify_user


class TicketFilter(FilterSet):
    created_at = DateFromToRangeFilter()

    class Meta:
        model = Ticket
        fields = ["status", "priority", "category", "department", "is_class_level"]


class IsStaffOrAdmin(permissions.BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role in [
            User.Role.STAFF, User.Role.DEPT_ADMIN, User.Role.CAMPUS_ADMIN
        ]


class CategoryListView(APIView):
    """Read-only list of the hardcoded ticket categories."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        return Response([category_dict(name) for name in CATEGORY_NAMES])


class CategorySlaDetailView(APIView):
    """Update the admin-configurable SLA target hours for a hardcoded category."""

    permission_classes = [permissions.IsAuthenticated, IsStaffOrAdmin]

    def patch(self, request, slug):
        name = CATEGORY_BY_SLUG.get(slug)
        if name is None:
            return Response({"detail": "Unknown category."}, status=status.HTTP_404_NOT_FOUND)
        row, _ = CategorySla.objects.get_or_create(category=name)
        for field in ("sla_response_hours", "sla_resolution_hours"):
            if field in request.data:
                try:
                    value = int(request.data[field])
                except (TypeError, ValueError):
                    return Response({field: ["Must be an integer."]}, status=status.HTTP_400_BAD_REQUEST)
                if value < 1 or value > 720:
                    return Response({field: ["Must be between 1 and 720 hours."]}, status=status.HTTP_400_BAD_REQUEST)
                setattr(row, field, value)
        row.save()
        return Response(category_dict(name))


class TicketViewSet(viewsets.ModelViewSet):
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_class = TicketFilter
    search_fields = ["ticket_id", "title", "description"]
    ordering_fields = ["created_at", "updated_at", "priority", "status", "ticket_id", "title"]

    def get_serializer_class(self):
        if self.action == "create":
            return TicketCreateSerializer
        elif self.action in ["list", "my_tickets", "department_tickets"]:
            return TicketListSerializer
        return TicketDetailSerializer

    def get_queryset(self):
        user = self.request.user
        qs = self._base_queryset()

        if user.role == User.Role.CAMPUS_ADMIN:
            pass
        elif user.role == User.Role.DEPT_ADMIN:
            qs = qs.filter(
                Q(department=user.department) |
                Q(assigned_to__department=user.department) |
                Q(created_by=user)
            )
        elif user.role == User.Role.STAFF:
            qs = qs.filter(Q(assigned_to=user) | Q(created_by=user))
        else:
            qs = qs.filter(created_by=user)

        mine = self.request.query_params.get("mine")
        if user.role in [User.Role.STAFF, User.Role.DEPT_ADMIN, User.Role.CAMPUS_ADMIN]:
            if mine == "assigned":
                qs = qs.filter(assigned_to=user)
            elif mine == "created":
                qs = qs.filter(created_by=user)
        return qs

    def _visible_messages(self):
        user = getattr(self.request, "user", None)
        if user and user.is_authenticated and user.role in [
            User.Role.STAFF, User.Role.DEPT_ADMIN, User.Role.CAMPUS_ADMIN
        ]:
            return TicketMessage.objects.all()
        return TicketMessage.objects.filter(is_internal_note=False)

    def _base_queryset(self):
        return Ticket.objects.select_related(
            "created_by", "assigned_to"
        ).prefetch_related(
            Prefetch(
                "messages",
                queryset=self._visible_messages().prefetch_related("attachments__uploaded_by"),
            ),
            "status_logs",
            "attachments__uploaded_by",
        )

    def perform_create(self, serializer):
        user = self.request.user
        ticket = serializer.save(created_by=user)
        if not ticket.department and user.role in [User.Role.CR, User.Role.STUDENT]:
            ticket.department = user.department
        explicit = (
            user.role in [User.Role.STAFF, User.Role.DEPT_ADMIN, User.Role.CAMPUS_ADMIN]
            and ticket.assigned_to_id
        )
        ticket.escalation_level = (
            escalation_level_for_assignee(ticket.assigned_to) if explicit else 0
        )
        ticket.last_activity_at = timezone.now()
        ticket.save(update_fields=["department", "escalation_level", "last_activity_at", "updated_at"])

        if not explicit:
            assign_ticket(ticket)
            ticket.refresh_from_db()
            ticket.escalation_level = escalation_level_for_assignee(ticket.assigned_to)
            ticket.save(update_fields=["escalation_level", "updated_at"])
        else:
            ticket.refresh_from_db()

        from escalations.services.engine import evaluate_ticket
        evaluate_ticket(ticket)

        StatusLog.objects.create(
            ticket=ticket, to_status="OPEN", changed_by=user,
            note="Ticket created"
        )
        if ticket.assigned_to:
            notify_user(
                user=ticket.assigned_to,
                title="New Ticket Assigned",
                message=f"Ticket '{ticket.title}' has been assigned to you.",
                ticket=ticket,
                notification_type="ASSIGNMENT",
                methods=[METHOD_IN_APP, METHOD_EMAIL],
            )

    @action(detail=True, methods=["post"])
    def add_message(self, request, pk=None):
        ticket = self.get_object()
        content = request.data.get("content", "")
        is_internal = request.data.get("is_internal_note", "false") in ["true", "True", True]
        files = request.FILES.getlist("file")

        if not content and not files:
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

        if files:
            attachment_serializer = AttachmentSerializer(
                data=[{"ticket": ticket.id, "message": message.id, "file": f} for f in files],
                many=True,
                context={"request": request},
            )
            if not attachment_serializer.is_valid():
                message.delete()
                return Response(
                    attachment_serializer.errors,
                    status=status.HTTP_400_BAD_REQUEST,
                )
            attachment_serializer.save()

        ticket.last_activity_at = timezone.now()
        ticket.save(update_fields=["last_activity_at", "updated_at"])

        if not is_internal:
            recipients = User.objects.filter(
                Q(id=ticket.created_by_id) | Q(id=ticket.assigned_to_id)
            ).exclude(id=request.user.id).distinct()
            author_name = request.user.get_full_name() or request.user.username
            excerpt = content if len(content) <= 500 else content[:500] + "..."
            for recipient in recipients:
                notify_user(
                    user=recipient,
                    title="New Reply",
                    message=f"Reply on '{ticket.title}' from {author_name}: {excerpt}",
                    ticket=ticket,
                    notification_type="REPLY",
                    methods=[METHOD_IN_APP, METHOD_EMAIL],
                )

        return Response(TicketMessageSerializer(message, context={"request": request}).data)

    @action(detail=True, methods=["post"])
    def upload_attachment(self, request, pk=None):
        ticket = self.get_object()
        files = request.FILES.getlist("file")

        if not files:
            return Response(
                {"error": "No file provided. Use the 'file' form field."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = AttachmentSerializer(
            data=[{"ticket": ticket.id, "file": f} for f in files],
            many=True,
            context={"request": request},
        )
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        serializer.save()

        ticket.last_activity_at = timezone.now()
        ticket.save(update_fields=["last_activity_at", "updated_at"])

        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["delete"])
    def delete_attachment(self, request, pk=None):
        ticket = self.get_object()
        attachment_id = request.data.get("attachment_id") or request.query_params.get("attachment_id")

        if not attachment_id:
            return Response(
                {"error": "attachment_id is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            attachment = Attachment.objects.get(id=attachment_id, ticket=ticket)
        except Attachment.DoesNotExist:
            return Response(
                {"error": "Attachment not found on this ticket"},
                status=status.HTTP_404_NOT_FOUND,
            )

        is_uploader = attachment.uploaded_by_id == request.user.id
        if not is_uploader:
            return Response(
                {"error": "Only the user who uploaded this attachment can delete it"},
                status=status.HTTP_403_FORBIDDEN,
            )

        attachment.file.delete(save=False)
        attachment.delete()

        ticket.last_activity_at = timezone.now()
        ticket.save(update_fields=["last_activity_at", "updated_at"])

        return Response(status=status.HTTP_204_NO_CONTENT)

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
        ticket.last_activity_at = timezone.now()

        if new_status == Ticket.Status.IN_PROGRESS:
            # Taking the ticket = the first response; the SLA is considered met.
            if ticket.first_response_at is None:
                ticket.first_response_at = timezone.now()
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

        notify_user(
            user=ticket.created_by,
            title=f"Ticket {new_status}",
            message=f"Ticket '{ticket.title}' status changed to {new_status}.",
            ticket=ticket,
            notification_type="STATUS_CHANGE",
            methods=[METHOD_IN_APP, METHOD_EMAIL],
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
        ticket.last_activity_at = timezone.now()
        ticket.save()

        StatusLog.objects.create(
            ticket=ticket, from_status=ticket.status, to_status=ticket.status,
            changed_by=request.user,
            note=f"Reassigned from {old_assignee} to {new_assignee}"
        )

        notify_user(
            user=new_assignee,
            title="Ticket Reassigned",
            message=f"Ticket '{ticket.title}' has been reassigned to you.",
            ticket=ticket,
            notification_type="REASSIGNMENT",
            methods=[METHOD_IN_APP, METHOD_EMAIL],
        )

        return Response(TicketDetailSerializer(ticket, context={"request": request}).data)

    @action(detail=True, methods=["post"])
    def escalate(self, request, pk=None):
        from escalations.services import assign as assign_svc
        ticket = self.get_object()
        user = request.user
        if ticket.status in (Ticket.Status.RESOLVED, Ticket.Status.CLOSED):
            return Response({"error": "Cannot escalate a resolved or closed ticket"}, status=status.HTTP_400_BAD_REQUEST)
        if ticket.escalation_level >= 3:
            return Response({"error": "Ticket is already at the highest escalation level"}, status=status.HTTP_400_BAD_REQUEST)

        assignee = assign_svc.escalate_ticket(
            ticket, actor=user, note="Manually escalated",
        )

        return Response(TicketDetailSerializer(ticket, context={"request": request}).data)

    @action(detail=True, methods=["post"])
    def deescalate(self, request, pk=None):
        from escalations.services import assign as assign_svc
        setting, _ = SystemSetting.objects.get_or_create(id=1)
        if not setting.allow_two_way_escalation:
            return Response({"error": "Two-way escalation is disabled by administrator policy"}, status=status.HTTP_403_FORBIDDEN)

        ticket = self.get_object()
        if ticket.status in (Ticket.Status.RESOLVED, Ticket.Status.CLOSED):
            return Response({"error": "Cannot de-escalate a resolved or closed ticket"}, status=status.HTTP_400_BAD_REQUEST)
        if ticket.escalation_level <= 0:
            return Response({"error": "Ticket is already at the lowest escalation level"}, status=status.HTTP_400_BAD_REQUEST)

        assignee = assign_svc.deescalate_ticket(
            ticket, policy=ticket.escalation_policy,
            actor=request.user, note="Manually de-escalated",
        )

        return Response(TicketDetailSerializer(ticket, context={"request": request}).data)

    @action(detail=True, methods=["post"])
    def change_priority(self, request, pk=None):
        ticket = self.get_object()
        if request.user.role not in [
            User.Role.STAFF, User.Role.DEPT_ADMIN, User.Role.CAMPUS_ADMIN
        ]:
            return Response(
                {"error": "Only staff or administrators can set ticket priority"},
                status=status.HTTP_403_FORBIDDEN,
            )
        new_priority = request.data.get("priority")
        if new_priority in [Ticket.Priority.LOW, Ticket.Priority.MEDIUM, Ticket.Priority.HIGH, Ticket.Priority.CRITICAL]:
            old = ticket.priority
            ticket.priority = new_priority
            ticket.save()
            StatusLog.objects.create(
                ticket=ticket, from_status=ticket.status, to_status=ticket.status,
                changed_by=request.user, note=f"Priority changed from {old} to {new_priority}"
            )
            return Response(TicketDetailSerializer(ticket, context={"request": request}).data)
        return Response({"error": "Invalid priority level"}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=["get"])
    def my_tickets(self, request):
        tickets = self._base_queryset().filter(created_by=request.user).order_by("-created_at")
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
            tickets = self._base_queryset().filter(
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
        by_category = qs.values("category").annotate(count=Count("id"))
        overdue = qs.filter(
            sla_deadline__lt=timezone.now(),
            status__in=["OPEN", "IN_PROGRESS", "REOPENED"]
        ).count()

        resolved = qs.filter(status__in=["RESOLVED", "CLOSED"], closed_at__isnull=False)
        avg_resolution_hours = None
        duration = resolved.annotate(
            duration=F("closed_at") - F("created_at")
        ).aggregate(avg=Avg("duration"))
        if duration["avg"]:
            avg_resolution_hours = round(duration["avg"].total_seconds() / 3600, 1)

        deadline_tracked = resolved.filter(sla_deadline__isnull=False)
        missed_count = deadline_tracked.filter(closed_at__gt=F("sla_deadline")).count()
        missed_deadline_pct = round(missed_count / deadline_tracked.count() * 100, 1) if deadline_tracked.count() else None

        return Response({
            "total": total,
            "by_status": {s["status"]: s["count"] for s in by_status},
            "by_priority": {p["priority"]: p["count"] for p in by_priority},
            "by_category": {c["category"] or "Uncategorized": c["count"] for c in by_category},
            "overdue": overdue,
            "avg_resolution_hours": avg_resolution_hours,
            "missed_deadline_pct": missed_deadline_pct,
        })

    @action(detail=False, methods=["get"])
    def dashboard(self, request):
        user = request.user
        qs = self.get_queryset()

        mine = request.query_params.get("mine")
        if user.role in [User.Role.STAFF, User.Role.DEPT_ADMIN, User.Role.CAMPUS_ADMIN]:
            if mine == "assigned":
                qs = qs.filter(assigned_to=user)
            elif mine == "created":
                qs = qs.filter(created_by=user)

        open_count = qs.filter(status__in=["OPEN", "IN_PROGRESS", "REOPENED"]).count()
        closed_count = qs.filter(status__in=["RESOLVED", "CLOSED"]).count()
        escalated_count = qs.filter(
            status__in=["ESCALATED_L1", "ESCALATED_L2", "ADMIN_REVIEW"]
        ).count()
        my_tickets = qs.filter(assigned_to=user).count() if user.role in [
            User.Role.STAFF, User.Role.DEPT_ADMIN, User.Role.CAMPUS_ADMIN
        ] else 0

        # Real Overdue & Compliance
        overdue_count = qs.filter(
            sla_deadline__lt=timezone.now(),
            status__in=["OPEN", "IN_PROGRESS", "REOPENED"]
        ).count()

        resolved = qs.filter(status__in=["RESOLVED", "CLOSED"], closed_at__isnull=False)
        deadline_tracked = resolved.filter(sla_deadline__isnull=False)
        missed_count = deadline_tracked.filter(closed_at__gt=F("sla_deadline")).count()
        total_tracked = deadline_tracked.count()
        estimated_compliance_pct = round(((total_tracked - missed_count) / total_tracked) * 100) if total_tracked > 0 else 95

        # Real 7-day daily timeline
        now = timezone.now()
        timeline = []
        for i in range(6, -1, -1):
            day_date = (now - timedelta(days=i)).date()
            day_label = day_date.strftime("%a")
            created = qs.filter(created_at__date=day_date).count()
            res = qs.filter(closed_at__date=day_date).count()
            timeline.append({"day": day_label, "created": created, "resolved": res})

        # Real Priority & Category breakdowns
        by_priority = {p["priority"]: p["count"] for p in qs.values("priority").annotate(count=Count("id"))}
        by_category = {c["category"] or "General": c["count"] for c in qs.values("category").annotate(count=Count("id"))}

        # Real Activity Feed from StatusLog & TicketMessage
        activity_logs = StatusLog.objects.select_related("ticket", "changed_by").order_by("-created_at")[:8]
        activity_feed = []
        for log in activity_logs:
            activity_feed.append({
                "id": log.id,
                "type": "STATUS_CHANGE" if log.to_status in ["CLOSED", "RESOLVED"] else "ESCALATED" if "ESCALATED" in log.to_status else "CREATED",
                "user_name": log.changed_by.get_full_name() or log.changed_by.username if log.changed_by else "System",
                "description": f"Ticket #{log.ticket.ticket_id} status updated to {log.to_status.replace('_', ' ')}",
                "ticket_id": log.ticket.ticket_id,
                "ticket_pk": log.ticket.id,
                "timestamp": log.created_at.isoformat(),
            })

        recent = qs.order_by("-updated_at")[:4]
        recent_serializer = TicketListSerializer(recent, many=True, context={"request": request})

        return Response({
            "open": open_count,
            "closed": closed_count,
            "escalated": escalated_count,
            "my_tickets": my_tickets,
            "overdue": overdue_count,
            "estimated_compliance_pct": estimated_compliance_pct,
            "timeline": timeline,
            "by_priority": by_priority,
            "by_category": by_category,
            "activity_feed": activity_feed,
            "recent": recent_serializer.data,
        })

    @staticmethod
    def _apply_date_range(qs, request):
        start = request.query_params.get("start")
        end = request.query_params.get("end")
        if start:
            qs = qs.filter(created_at__date__gte=start)
        if end:
            qs = qs.filter(created_at__date__lte=end)
        return qs

    def _staff_metrics(self, qs):
        user = self.request.user
        staff_qs = User.objects.filter(role=User.Role.STAFF)
        if user.role == User.Role.DEPT_ADMIN:
            staff_qs = staff_qs.filter(department=user.department)

        metrics = []
        for staff in staff_qs:
            sqs = qs.filter(assigned_to=staff)
            handled = sqs.count()
            open_count = sqs.filter(status__in=ACTIVE_STATUSES).count()

            avg_resp = None
            resps = sqs.filter(
                messages__is_internal_note=False,
            ).exclude(
                messages__author__role__in=[User.Role.STUDENT, User.Role.CR],
            ).values("id", "created_at").annotate(fr=Min("messages__created_at"))
            if resps:
                secs = sum((r["fr"] - r["created_at"]).total_seconds() for r in resps)
                avg_resp = round(secs / len(resps) / 3600, 1)

            metrics.append({
                "name": staff.get_full_name() or staff.username,
                "department": staff.department,
                "tickets_handled": handled,
                "open_tickets": open_count,
                "avg_response_hours": avg_resp,
            })
        return metrics

    @action(detail=False, methods=["get"])
    def report(self, request):
        qs = self._apply_date_range(self.get_queryset(), request)

        by_status = {s["status"]: s["count"] for s in qs.values("status").annotate(count=Count("id"))}
        by_priority = {p["priority"]: p["count"] for p in qs.values("priority").annotate(count=Count("id"))}
        by_category = {c["category"] or "Uncategorized": c["count"] for c in qs.values("category").annotate(count=Count("id"))}
        by_department = {d["department"] or "None": d["count"] for d in qs.values("department").annotate(count=Count("id"))}

        resolved = qs.filter(status__in=["RESOLVED", "CLOSED"], closed_at__isnull=False)
        overdue = qs.filter(
            sla_deadline__lt=timezone.now(),
            status__in=["OPEN", "IN_PROGRESS", "REOPENED"],
        ).count()

        avg_resolution_hours = None
        duration = resolved.annotate(
            duration=F("closed_at") - F("created_at")
        ).aggregate(avg=Avg("duration"))
        if duration["avg"]:
            avg_resolution_hours = round(duration["avg"].total_seconds() / 3600, 1)

        deadline_tracked = resolved.filter(sla_deadline__isnull=False)
        missed_count = deadline_tracked.filter(closed_at__gt=F("sla_deadline")).count()
        missed_deadline_pct = round(missed_count / deadline_tracked.count() * 100, 1) if deadline_tracked.count() else None

        weekly = qs.filter(assigned_to__isnull=False).annotate(
            week=TruncWeek("created_at")
        ).values("week").annotate(n=Count("id")).order_by("week")
        weekly = [{"week": str(w["week"].date()), "tickets": w["n"]} for w in weekly]

        return Response({
            "total": qs.count(),
            "by_status": by_status,
            "by_priority": by_priority,
            "by_category": by_category,
            "by_department": by_department,
            "overdue": overdue,
            "avg_resolution_hours": avg_resolution_hours,
            "missed_deadline_pct": missed_deadline_pct,
            "weekly_trend": weekly,
            "staff_metrics": self._staff_metrics(qs),
            "start": request.query_params.get("start"),
            "end": request.query_params.get("end"),
        })

    @action(detail=False, methods=["get"])
    def export(self, request):
        import io
        from openpyxl import Workbook
        from django.http import HttpResponse

        qs = self._apply_date_range(self.get_queryset(), request)
        qs = qs.select_related("created_by", "assigned_to").order_by("-created_at")

        columns = request.query_params.get("columns")
        all_columns = [
            "ticket_id", "title", "category", "status", "priority",
            "department", "created_by", "assigned_to",
            "created_at", "updated_at", "sla_deadline", "closed_at",
        ]
        selected = [c.strip() for c in columns.split(",") if c.strip() in all_columns] if columns else all_columns
        headers = {
            "ticket_id": "Ticket ID", "title": "Title", "category": "Category",
            "status": "Status", "priority": "Priority", "department": "Department",
            "created_by": "Created By", "assigned_to": "Assigned To",
            "created_at": "Created At", "updated_at": "Updated At",
            "sla_deadline": "SLA Deadline", "closed_at": "Closed At",
        }

        wb = Workbook()
        ws = wb.active
        ws.title = "Tickets"
        ws.append([headers[c] for c in selected])

        for t in qs.iterator(chunk_size=500):
            row = []
            for c in selected:
                if c == "category":
                    row.append(t.category or "")
                elif c == "created_by":
                    row.append(t.created_by.get_full_name() or t.created_by.username)
                elif c == "assigned_to":
                    row.append(t.assigned_to.get_full_name() if t.assigned_to else "")
                elif c in ("created_at", "updated_at", "sla_deadline", "closed_at"):
                    val = getattr(t, c)
                    row.append(val.strftime("%Y-%m-%d %H:%M") if val else "")
                else:
                    row.append(getattr(t, c))
            ws.append(row)

        buf = io.BytesIO()
        wb.save(buf)
        buf.seek(0)

        filename = f"tickets_report_{timezone.now().strftime('%Y%m%d')}.xlsx"
        resp = HttpResponse(
            buf,
            content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        resp["Content-Disposition"] = 'attachment; filename="' + filename + '"'
        return resp


class SystemSettingViewSet(viewsets.ModelViewSet):
    queryset = SystemSetting.objects.all()
    serializer_class = SystemSettingSerializer
    permission_classes = [permissions.IsAuthenticated]

    @action(detail=False, methods=["get", "post"])
    def policy(self, request):
        setting, _ = SystemSetting.objects.get_or_create(id=1)
        if request.method == "POST":
            if request.user.role not in [User.Role.CAMPUS_ADMIN, User.Role.DEPT_ADMIN]:
                return Response({"error": "Admin clearance required"}, status=status.HTTP_403_FORBIDDEN)
            allow = request.data.get("allow_two_way_escalation")
            if isinstance(allow, bool):
                setting.allow_two_way_escalation = allow
                setting.save()
            elif isinstance(allow, str):
                setting.allow_two_way_escalation = allow.lower() in ["true", "1", "yes"]
                setting.save()
        return Response({"allow_two_way_escalation": setting.allow_two_way_escalation})

