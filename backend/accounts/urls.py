from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import AuthViewSet, UserViewSet

router = DefaultRouter()
router.register(r"users", UserViewSet)

urlpatterns = [
    path("", include(router.urls)),
    path("login/", AuthViewSet.as_view({"post": "login"}), name="auth-login"),
    path("logout/", AuthViewSet.as_view({"post": "logout"}), name="auth-logout"),
    path("me/", AuthViewSet.as_view({"get": "me"}), name="auth-me"),
]
