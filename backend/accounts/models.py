from django.conf import settings
from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    class Role(models.TextChoices):
        STUDENT = "STUDENT", "Student"
        CR = "CR", "Class Representative"
        STAFF = "STAFF", "Staff"
        TEAM_LEAD = "TEAM_LEAD", "Team Lead"
        DEPT_ADMIN = "DEPT_ADMIN", "Dept Admin (HOD)"
        CAMPUS_ADMIN = "CAMPUS_ADMIN", "Campus Admin"

    @classmethod
    def support_roles(cls):
        """Roles that participate in ticket handling (staff-level features)."""
        return [
            cls.Role.STAFF,
            cls.Role.TEAM_LEAD,
            cls.Role.DEPT_ADMIN,
            cls.Role.CAMPUS_ADMIN,
        ]

    # Legacy department code constants (kept as seed defaults); departments
    # themselves are DB-managed via the Department model.
    class Department(models.TextChoices):
        CIVIL = "CIV", "Civil Engineering"
        ELECTRICAL = "ELE", "Electrical Engineering"
        COMPUTER = "COM", "Computer Engineering"
        MECHANICAL = "MEC", "Mechanical Engineering"
        ARCHITECTURE = "ARC", "Architecture"
        APPLIED_SCIENCES = "APP", "Applied Sciences"
        CIT = "CIT", "IT Support"
        FINANCE = "FIN", "Finance"
        ACADEMIC = "ACA", "Academic Affairs"
        LIBRARY = "LIB", "Library"
        FACILITIES = "FAC", "Facilities"

    role = models.CharField(max_length=20, choices=Role.choices, default=Role.STUDENT)
    department = models.CharField(max_length=10, blank=True, null=True)
    sub_department = models.ForeignKey(
        "SubDepartment", null=True, blank=True, on_delete=models.SET_NULL,
        related_name="members", help_text="Team/sub-department this staff member belongs to",
    )
    section = models.CharField(max_length=10, blank=True, null=True)
    batch = models.CharField(max_length=10, blank=True, null=True)
    phone = models.CharField(max_length=15, blank=True, null=True)
    is_available = models.BooleanField(default=True, help_text="For staff: whether available for assignment")
    level = models.IntegerField(
        null=True, blank=True,
        help_text=(
            "Escalation hierarchy level (auto-derived from role): "
            "0 = staff, 1 = team lead, 2 = department HOD; campus admins sit above the chain."
        ),
    )

    class Meta:
        verbose_name = "User"
        verbose_name_plural = "Users"

    def save(self, *args, **kwargs):
        # Level hierarchy: all staff are Level 0 (assignment is done by their
        # team lead), team leads are Level 1, HODs are fixed at Level 2 and
        # the campus admin sits above the chain (no level). Students/CRs
        # carry no escalation level.
        if self.role in (self.Role.STUDENT, self.Role.CR):
            self.level = None
        elif self.role == self.Role.CAMPUS_ADMIN:
            self.level = None
        elif self.role == self.Role.DEPT_ADMIN:
            self.level = 2
        elif self.role == self.Role.TEAM_LEAD:
            self.level = 1
        elif self.role == self.Role.STAFF:
            self.level = 0
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.get_full_name() or self.username} ({self.get_role_display()})"


class Department(models.Model):
    """A campus department, fully managed by the admin (dynamic).

    Referenced by its short ``code`` from users, tickets and teams so the
    rest of the system stays decoupled from the department table.
    """

    code = models.CharField(max_length=10, unique=True)
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        verbose_name = "Department"
        verbose_name_plural = "Departments"
        ordering = ["name"]

    def __str__(self):
        return f"{self.name} ({self.code})"


class SubDepartment(models.Model):
    """A team / sub-department inside a department (e.g. Lab, Academic).

    Tickets routed to a team land on its team lead, who then assigns them to
    the staff members of the team. Staff users point at their team via
    ``User.sub_department``.
    """

    name = models.CharField(max_length=100)
    department = models.CharField(max_length=10)
    lead = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True,
        on_delete=models.SET_NULL, related_name="led_teams",
        help_text="Team lead this team's tickets are routed to",
    )
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        verbose_name = "Sub-department (Team)"
        verbose_name_plural = "Sub-departments (Teams)"
        ordering = ["department", "name"]
        constraints = [
            models.UniqueConstraint(fields=["department", "name"], name="unique_team_per_department"),
        ]

    def __str__(self):
        return f"{self.name} ({self.get_department_display()})"
