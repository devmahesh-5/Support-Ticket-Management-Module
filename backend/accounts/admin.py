from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from .models import User


@admin.register(User)
class CustomUserAdmin(UserAdmin):

    fieldsets = UserAdmin.fieldsets + (
        ("Ticket System Information", {
            "fields": (
                "role",
                "department",
                "staff_type",
                "section",
                "batch",
                "phone",
                "is_available",
                "level",
            )
        }),
    )