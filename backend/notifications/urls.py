from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    NotificationViewSet,
    NotificationTemplateViewSet,
    NotificationSettingViewSet,
    notification_stream,
)

router = DefaultRouter()
router.register(r"settings", NotificationSettingViewSet)
router.register(r"templates", NotificationTemplateViewSet)
router.register(r"", NotificationViewSet, basename="notification")

urlpatterns = [
    path("stream/", notification_stream, name="notification-stream"),
    path("", include(router.urls)),
]
