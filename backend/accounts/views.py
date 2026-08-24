from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.contrib.auth import authenticate, login, logout
from django.db.models import Q
import openpyxl
import secrets

from .models import Department, SubDepartment, User
from .serializers import (
    DepartmentSerializer,
    SubDepartmentSerializer,
    UserSerializer,
    UserCreateSerializer,
    BulkImportSerializer,
)


class IsCampusAdmin(permissions.BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == User.Role.CAMPUS_ADMIN


class IsCampusAdminOrHod(permissions.BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role in [
            User.Role.CAMPUS_ADMIN, User.Role.DEPT_ADMIN
        ]


class CanManageUser(permissions.BasePermission):
    """Object-level write access to user accounts.

    - Campus admin: anyone.
    - HOD: staff and team leads within their own department.
    """

    def has_object_permission(self, request, view, obj):
        user = request.user
        if not user.is_authenticated:
            return False
        if user.role == User.Role.CAMPUS_ADMIN:
            return True
        if user.role == User.Role.DEPT_ADMIN:
            return (
                obj.role in (User.Role.STAFF, User.Role.TEAM_LEAD)
                and obj.department == user.department
            )
        return False


class IsCampusAdminWrite(permissions.BasePermission):
    """Read for any authenticated user; create/update/delete campus admin only."""

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if request.method in permissions.SAFE_METHODS:
            return True
        return user.role == User.Role.CAMPUS_ADMIN


class DepartmentViewSet(viewsets.ModelViewSet):
    """Dynamic department management (admin-created, admin-updated)."""

    queryset = Department.objects.all()
    serializer_class = DepartmentSerializer
    permission_classes = [permissions.IsAuthenticated, IsCampusAdminWrite]
    filterset_fields = ["is_active"]

    def get_queryset(self):
        qs = Department.objects.all()
        if self.request.query_params.get("include_inactive") != "1":
            qs = qs.filter(is_active=True)
        return qs

    def perform_destroy(self, instance):
        # Soft-delete: keep historical tickets/users referencing the code.
        instance.is_active = False
        instance.save()


class TeamWritePermission(permissions.BasePermission):
    """Read: any authenticated user (needed for the ticket-creation form).
    Write: campus admin anywhere, HOD in their own department."""

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if request.method in permissions.SAFE_METHODS:
            return True
        return user.role in [User.Role.CAMPUS_ADMIN, User.Role.DEPT_ADMIN]


class SubDepartmentViewSet(viewsets.ModelViewSet):
    """Team (sub-department) management.

    Read: any support role. Write: campus admin anywhere, HOD within their
    own department.
    """

    queryset = SubDepartment.objects.all()
    serializer_class = SubDepartmentSerializer
    permission_classes = [permissions.IsAuthenticated, TeamWritePermission]

    def get_queryset(self):
        qs = SubDepartment.objects.select_related("lead").prefetch_related("members")
        user = self.request.user
        department = self.request.query_params.get("department")
        if user.role == User.Role.DEPT_ADMIN:
            qs = qs.filter(department=user.department)
        elif user.role == User.Role.TEAM_LEAD:
            qs = qs.filter(
                Q(lead=user) | Q(department=user.department)
            ).distinct()
        if department:
            qs = qs.filter(department=department)
        return qs

    def perform_create(self, serializer):
        user = self.request.user
        department = serializer.validated_data.get("department")
        if user.role == User.Role.DEPT_ADMIN and department != user.department:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("HODs can only create teams in their own department.")
        serializer.save()

    def perform_update(self, serializer):
        user = self.request.user
        instance = serializer.instance
        if (
            user.role == User.Role.DEPT_ADMIN
            and instance.department != user.department
        ):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("HODs can only manage teams in their own department.")
        serializer.save()


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
        if self.action == "create":
            return [IsCampusAdminOrHod()]
        if self.action in ["update", "partial_update", "destroy"]:
            return [permissions.IsAuthenticated(), CanManageUser()]
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
        # Optional role filter: single or comma-separated (e.g.
        # ?role=TEAM_LEAD / ?role=STUDENT,CR). "HOD" alias supported.
        role_param = self.request.query_params.get("role")
        if role_param:
            aliases = {"HOD": User.Role.DEPT_ADMIN, "ADMIN": User.Role.CAMPUS_ADMIN}
            roles = [
                aliases.get(r.strip().upper(), r.strip().upper())
                for r in role_param.split(",") if r.strip()
            ]
            qs = qs.filter(role__in=roles)
        if user.role == User.Role.CAMPUS_ADMIN:
            # Campus admin sees everyone; honour the department filter.
            if target_dept:
                qs = qs.filter(department=target_dept)
        elif user.role == User.Role.DEPT_ADMIN:
            # HODs can only manage staff and team leads within their own
            # department.
            qs = qs.filter(
                department=(target_dept or user.department),
                role__in=[User.Role.STAFF, User.Role.TEAM_LEAD],
            )
        elif user.role == User.Role.TEAM_LEAD:
            # Team members they lead plus the team they belong to themselves.
            led_team_ids = list(user.led_teams.filter(is_active=True).values_list("id", flat=True))
            if user.sub_department_id and user.sub_department_id not in led_team_ids:
                led_team_ids.append(user.sub_department_id)
            qs = qs.filter(
                Q(department=user.department) &
                (Q(sub_department_id__in=led_team_ids) | Q(id=user.id))
            )
        elif user.role == User.Role.STAFF:
            qs = qs.filter(department=(target_dept or user.department))
        elif user.role in [User.Role.STUDENT, User.Role.CR]:
            qs = qs.filter(id=user.id)
        return qs

    def perform_destroy(self, instance):
        if instance.id == self.request.user.id:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("You cannot delete your own account.")
        super().perform_destroy(instance)

    @action(detail=False, methods=["post"])
    def set_availability(self, request):
        user = request.user
        if user.role not in User.support_roles():
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

    @action(detail=False, methods=["get"])
    def team_members(self, request):
        """Members of the requester's team(s).

        Team leads get the staff of the team(s) they lead; HODs/admins may
        pass ?team=<id> (or see all teams of their department scope).
        """
        user = request.user
        if user.role == User.Role.TEAM_LEAD:
            teams = user.led_teams.filter(is_active=True)
        elif user.role == User.Role.DEPT_ADMIN:
            teams = SubDepartment.objects.filter(department=user.department, is_active=True)
            team_id = request.query_params.get("team")
            if team_id:
                teams = teams.filter(id=team_id)
        elif user.role == User.Role.CAMPUS_ADMIN:
            teams = SubDepartment.objects.filter(is_active=True)
            team_id = request.query_params.get("team")
            if team_id:
                teams = teams.filter(id=team_id)
        else:
            return Response(
                {"error": "Only team leads and admins can list team members"},
                status=status.HTTP_403_FORBIDDEN,
            )
        members = User.objects.filter(
            sub_department__in=teams, role=User.Role.STAFF, is_active=True
        ).order_by("sub_department__name", "username")
        return Response(UserSerializer(members, many=True).data)

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
