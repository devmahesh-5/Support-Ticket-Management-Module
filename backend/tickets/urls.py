from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import CategoryViewSet, RoutingRuleViewSet, TicketViewSet, SystemSettingViewSet

router = DefaultRouter()
router.register(r"categories", CategoryViewSet)
router.register(r"routing-rules", RoutingRuleViewSet)
router.register(r"settings", SystemSettingViewSet, basename="system-settings")
router.register(r"", TicketViewSet, basename="ticket")

urlpatterns = [
    path("", include(router.urls)),
]
