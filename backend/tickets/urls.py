from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import CategoryListView, CategorySlaDetailView, TicketViewSet, SystemSettingViewSet

router = DefaultRouter()
router.register(r"settings", SystemSettingViewSet, basename="system-settings")
router.register(r"", TicketViewSet, basename="ticket")

urlpatterns = [
    path("categories/<str:slug>/", CategorySlaDetailView.as_view(), name="category-sla"),
    path("categories/", CategoryListView.as_view(), name="categories"),
    path("", include(router.urls)),
]
