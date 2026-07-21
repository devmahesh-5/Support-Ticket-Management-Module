from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.contrib.auth import authenticate, login, logout
import openpyxl

from .models import User
from .serializers import UserSerializer, UserCreateSerializer, BulkImportSerializer


class IsCampusAdmin(permissions.BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == User.Role.CAMPUS_ADMIN


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
        if self.action in ["create", "bulk_import", "destroy"]:
            return [IsCampusAdmin()]
        return [permissions.IsAuthenticated()]

    def get_serializer_class(self):
        if self.action == "create":
            return UserCreateSerializer
        return UserSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        if user.role == User.Role.DEPT_ADMIN:
            qs = qs.filter(department=user.department)
        elif user.role == User.Role.STAFF:
            qs = qs.filter(department=user.department)
        elif user.role in [User.Role.STUDENT, User.Role.CR]:
            qs = qs.filter(id=user.id)
        return qs

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
            user.set_password("default123")
            user.save()
            created.append(user.username)
        return Response({"created": created, "errors": errors})
