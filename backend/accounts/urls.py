from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import AuthViewSet, DepartmentViewSet, SubDepartmentViewSet, UserViewSet

router = DefaultRouter()
router.register(r"users", UserViewSet)
router.register(r"teams", SubDepartmentViewSet)
router.register(r"departments", DepartmentViewSet)

urlpatterns = [
    path("", include(router.urls)),
    path("login/", AuthViewSet.as_view({"post": "login"}), name="auth-login"),
    path("logout/", AuthViewSet.as_view({"post": "logout"}), name="auth-logout"),
    path("me/", AuthViewSet.as_view({"get": "me"}), name="auth-me"),
]
