from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.contrib.auth import authenticate, login, logout
import openpyxl
import secrets

from .models import User
from .serializers import UserSerializer, UserCreateSerializer, BulkImportSerializer


class IsCampusAdmin(permissions.BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == User.Role.CAMPUS_ADMIN


class IsCampusAdminOrHod(permissions.BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role in [
            User.Role.CAMPUS_ADMIN, User.Role.DEPT_ADMIN
        ]


class AuthViewSet(viewsets.ViewSet):
    permission_classes = [permissions.AllowAny]

    @action(detail=False, methods=["post"])
    def login(self, request):
        username = request.data.get("username")
        password = request.data.get("password")
        user = authenticate(request, username=username, password=password)
        if user:
            login(request, user)
            return Response(UserSerializer(user).data)
        return Response({"error": "Invalid credentials"}, status=status.HTTP_401_UNAUTHORIZED)

    @action(detail=False, methods=["post"])
    def logout(self, request):
        logout(request)
        return Response({"success": True})

    @action(detail=False, methods=["get"])
    def me(self, request):
        if request.user.is_authenticated:
            return Response(UserSerializer(request.user).data)
        return Response({"error": "Not authenticated"}, status=status.HTTP_401_UNAUTHORIZED)


class UserViewSet(viewsets.ModelViewSet):
    queryset = User.objects.all().order_by("username")
    serializer_class = UserSerializer

    def get_permissions(self):
        if self.action in ["create", "destroy"]:
            return [IsCampusAdminOrHod()]
        if self.action == "bulk_import":
            return [IsCampusAdmin()]
        return [permissions.IsAuthenticated()]

    def get_serializer_class(self):
        if self.action == "create":
            return UserCreateSerializer
        return UserSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        target_dept = self.request.query_params.get("department")
        if user.role == User.Role.CAMPUS_ADMIN:
            pass
        elif user.role == User.Role.DEPT_ADMIN:
            # HODs can only manage staff within their own department.
            qs = qs.filter(department=(target_dept or user.department), role=User.Role.STAFF)
        elif user.role == User.Role.STAFF:
            qs = qs.filter(department=(target_dept or user.department))
        elif user.role in [User.Role.STUDENT, User.Role.CR]:
            qs = qs.filter(id=user.id)
        if target_dept:
            qs = qs.filter(role__in=[
                User.Role.STAFF, User.Role.DEPT_ADMIN, User.Role.CAMPUS_ADMIN
            ])
        return qs

    def perform_destroy(self, instance):
        if instance.id == self.request.user.id:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("You cannot delete your own account.")
        super().perform_destroy(instance)

    @action(detail=False, methods=["post"])
    def set_availability(self, request):
        user = request.user
        if user.role not in [
            User.Role.STAFF,
            User.Role.DEPT_ADMIN,
            User.Role.CAMPUS_ADMIN,
        ]:
            return Response(
                {"error": "Only staff and admins can update availability"},
                status=status.HTTP_403_FORBIDDEN,
            )
        is_available = request.data.get("is_available")
        if isinstance(is_available, str):
            is_available = is_available.strip().lower() in ["true", "1", "yes"]
        if not isinstance(is_available, bool):
            return Response(
                {"error": "is_available (true/false) is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        user.is_available = is_available
        user.save()
        return Response(UserSerializer(user).data)

    @action(detail=False, methods=["post"])
    def bulk_import(self, request):
        serializer = BulkImportSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        file = request.FILES["file"]
        wb = openpyxl.load_workbook(file)
        ws = wb.active
        created = []
        errors = []
        for row in ws.iter_rows(min_row=2, values_only=True):
            username, email, first_name, last_name, role, dept, section = row[:7]
            if not username:
                continue
            if User.objects.filter(username=username).exists():
                errors.append(f"User {username} already exists")
                continue
            user = User(
                username=str(username),
                email=str(email or ""),
                first_name=str(first_name or ""),
                last_name=str(last_name or ""),
                role=str(role or User.Role.STUDENT),
                department=str(dept or "") if dept else None,
                section=str(section or "") if section else None,
            )
            password = secrets.token_urlsafe(12)
            user.set_password(password)
            user.save()
            created.append({"username": user.username, "password": password})
        return Response({"created": created, "errors": errors})
