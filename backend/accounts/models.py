from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    class Role(models.TextChoices):
        STUDENT = "STUDENT", "Student"
        CR = "CR", "Class Representative"
        STAFF = "STAFF", "Staff"
        DEPT_ADMIN = "DEPT_ADMIN", "Dept Admin (HOD)"
        CAMPUS_ADMIN = "CAMPUS_ADMIN", "Campus Admin"

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

    class StaffType(models.TextChoices):
        LAB = "LAB", "Lab Technician"
        TEACHER = "TEACHER", "Teacher / Professor"
        IT = "IT", "IT Support"
        FINANCE = "FINANCE", "Finance Staff"
        ACADEMIC = "ACADEMIC", "Academic Staff"
        LIBRARY = "LIBRARY", "Library Staff"
        FACILITIES = "FACILITIES", "Facilities Staff"

    # Staff types each department may carry, driven by category routing.
    # Academic departments handle their own Lab Equipment / Classroom tickets
    # so they need LAB and TEACHER; the routed departments (CIT/FIN/ACA/LIB/FAC)
    # each carry their single specialty. There is no GENERAL staff type - the
    # "General / Other" category routes straight to the department HOD.
    STAFF_TYPE_BY_DEPARTMENT = {
        Department.CIVIL: [StaffType.LAB, StaffType.TEACHER],
        Department.ELECTRICAL: [StaffType.LAB, StaffType.TEACHER],
        Department.COMPUTER: [StaffType.LAB, StaffType.TEACHER],
        Department.MECHANICAL: [StaffType.LAB, StaffType.TEACHER],
        Department.ARCHITECTURE: [StaffType.LAB, StaffType.TEACHER],
        Department.APPLIED_SCIENCES: [StaffType.LAB, StaffType.TEACHER],
        Department.CIT: [StaffType.IT],
        Department.FINANCE: [StaffType.FINANCE],
        Department.ACADEMIC: [StaffType.ACADEMIC],
        Department.LIBRARY: [StaffType.LIBRARY],
        Department.FACILITIES: [StaffType.FACILITIES],
    }

    @classmethod
    def allowed_staff_types(cls, department):
        if not department:
            return []
        return cls.STAFF_TYPE_BY_DEPARTMENT.get(department, [])

    role = models.CharField(max_length=20, choices=Role.choices, default=Role.STUDENT)
    department = models.CharField(max_length=3, choices=Department.choices, blank=True, null=True)
    staff_type = models.CharField(max_length=20, choices=StaffType.choices, blank=True, null=True, help_text="For staff: specialization for routing")
    section = models.CharField(max_length=10, blank=True, null=True)
    batch = models.CharField(max_length=10, blank=True, null=True)
    phone = models.CharField(max_length=15, blank=True, null=True)
    is_available = models.BooleanField(default=True, help_text="For staff: whether available for assignment")
    level = models.IntegerField(
        null=True, blank=True, default=1,
        help_text="Staff escalation level (Level 1, 2, 3). Only applies to staff and administrator roles.",
    )

    class Meta:
        verbose_name = "User"
        verbose_name_plural = "Users"

    def save(self, *args, **kwargs):
        # Level hierarchy: staff have Level 1/2, HODs are fixed at Level 3,
        # the campus admin is above the chain (no level), and students/CRs
        # carry no escalation level or staff type.
        if self.role in (self.Role.STUDENT, self.Role.CR):
            self.level = None
            self.staff_type = None
        elif self.role == self.Role.CAMPUS_ADMIN:
            self.level = None
            self.staff_type = None
        elif self.role == self.Role.DEPT_ADMIN:
            self.level = 3
        elif self.role == self.Role.STAFF:
            if self.level not in (1, 2):
                self.level = 1
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.get_full_name() or self.username} ({self.get_role_display()})"
