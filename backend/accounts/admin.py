from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from .models import SubDepartment, User


@admin.register(User)
class CustomUserAdmin(UserAdmin):

    fieldsets = UserAdmin.fieldsets + (
        ("Ticket System Information", {
            "fields": (
                "role",
                "department",
                "sub_department",
                "section",
                "batch",
                "phone",
                "is_available",
                "level",
            )
        }),
    )


@admin.register(SubDepartment)
class SubDepartmentAdmin(admin.ModelAdmin):
    list_display = ("name", "department", "lead", "is_active")
    list_filter = ("department", "is_active")
    search_fields = ("name", "lead__username", "lead__first_name", "lead__last_name")
