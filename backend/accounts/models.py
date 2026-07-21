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

    role = models.CharField(max_length=20, choices=Role.choices, default=Role.STUDENT)
    department = models.CharField(max_length=3, choices=Department.choices, blank=True, null=True)
    section = models.CharField(max_length=10, blank=True, null=True)
    batch = models.CharField(max_length=10, blank=True, null=True)
    phone = models.CharField(max_length=15, blank=True, null=True)
    is_available = models.BooleanField(default=True, help_text="For staff: whether available for assignment")

    class Meta:
        verbose_name = "User"
        verbose_name_plural = "Users"

    def __str__(self):
        return f"{self.get_full_name() or self.username} ({self.get_role_display()})"
