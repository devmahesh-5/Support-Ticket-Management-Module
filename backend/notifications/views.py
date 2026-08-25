import json
import time

from django.db import close_old_connections
from django.http import StreamingHttpResponse
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from .models import Notification
from .serializers import NotificationSerializer


def notification_stream(request):
    """Server-Sent Events endpoint: streams new notifications to the logged-in
    user in near-real-time.

    The generator polls the database for rows newer than the last seen id and
    yields them as SSE ``data:`` frames, so it needs no message broker. Each
    connected client holds a worker thread while streaming.
    """
    if not request.user.is_authenticated:
        return StreamingHttpResponse(
            iter(['event: error\ndata: {"message":"unauthorized"}\n\n']),
            content_type="text/event-stream",
        )

    user = request.user

    def event_stream():
        last_id = (
            Notification.objects.filter(user=user)
            .order_by("-id")
            .values_list("id", flat=True)
            .first()
            or 0
        )
        try:
            while True:
                # Never hold the DB connection during the idle sleep: release
                # it at the top and bottom of each poll so a connected client
                # only borrows a connection for the brief query. Otherwise a
                # long-lived EventSource keeps one slot open forever and the
                # reconnect watchdog can exhaust max_connections.
                close_old_connections()
                new = Notification.objects.filter(user=user, id__gt=last_id).order_by("id")
                for notif in new.iterator(chunk_size=20):
                    payload = NotificationSerializer(notif).data
                    yield f"data: {json.dumps(payload)}\n\n"
                    last_id = notif.id
                close_old_connections()
                yield 'data: {"id":0,"type":"heartbeat"}\n\n'
                time.sleep(4)
        except GeneratorExit:
            close_old_connections()
            return

    return StreamingHttpResponse(event_stream(), content_type="text/event-stream")


class NotificationViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = NotificationSerializer

    def get_queryset(self):
        return Notification.objects.filter(user=self.request.user).order_by("-created_at")

    @action(detail=True, methods=["post"])
    def mark_read(self, request, pk=None):
        notification = self.get_object()
        notification.is_read = True
        notification.save()
        return Response({"success": True})

    @action(detail=False, methods=["post"])
    def mark_all_read(self, request):
        Notification.objects.filter(user=request.user, is_read=False).update(is_read=True)
        return Response({"success": True})

    @action(detail=False, methods=["get"])
    def unread_count(self, request):
        count = Notification.objects.filter(user=request.user, is_read=False).count()
        return Response({"unread_count": count})
