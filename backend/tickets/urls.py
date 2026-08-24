from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import CategoryViewSet, TicketViewSet, SystemSettingViewSet

router = DefaultRouter()
router.register(r"settings", SystemSettingViewSet, basename="system-settings")
router.register(r"categories", CategoryViewSet, basename="category")
router.register(r"", TicketViewSet, basename="ticket")

urlpatterns = [
    path("", include(router.urls)),
]
