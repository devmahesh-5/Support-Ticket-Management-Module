from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    EscalationDashboardViewSet,
    EscalationHistoryViewSet,
    EscalationPolicyViewSet,
    EscalationRuleViewSet,
    SupportQueueViewSet,
    TicketAssignmentStageViewSet,
)

router = DefaultRouter()
router.register(r"queues", SupportQueueViewSet)
router.register(r"policies", EscalationPolicyViewSet)
router.register(r"rules", EscalationRuleViewSet, basename="rules")
router.register(r"history", EscalationHistoryViewSet, basename="history")
router.register(r"stages", TicketAssignmentStageViewSet, basename="stages")
router.register(r"dashboard", EscalationDashboardViewSet, basename="escalation-dashboard")

urlpatterns = [
    path("", include(router.urls)),
]
