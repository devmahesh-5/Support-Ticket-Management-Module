"""Idempotently create/update the production Django superuser.

Reads the admin identity and password from the environment and ensures a
matching superuser exists for the custom AUTH_USER_MODEL ("accounts.User").

Supported environment variables (in priority order):

    ADMIN_EMAIL      / ADMIN_PASSWORD      (primary - used by the entrypoint)
    ADMIN_USERNAME   (optional username; falls back to the email local part)
    DJANGO_SUPERUSER_EMAIL / DJANGO_SUPERUSER_USERNAME / DJANGO_SUPERUSER_PASSWORD

This is safer than ``createsuperuser --noinput`` because it works predictably
with the custom user model, updates the email, and never recreates the account
on every container restart. The password is set via ``set_password`` and is
never printed to logs. The user is looked up by email (and backwards by
username), so the same account is never duplicated.
"""

import os
import re

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class Command(BaseCommand):
    help = "Create or update the production superuser from environment variables."

    def _derive_username(self, email):
        """Turn 'admin@gmail.com' into 'admin' for a usable login username."""
        local = email.split("@", 1)[0]
        return local.strip() or "admin"

    def handle(self, *args, **options):
        # Priority order: ADMIN_* (entrypoint) then legacy DJANGO_SUPERUSER_*.
        email = os.getenv("ADMIN_EMAIL") or os.getenv("DJANGO_SUPERUSER_EMAIL")
        username = os.getenv("ADMIN_USERNAME") or os.getenv("DJANGO_SUPERUSER_USERNAME")
        password = os.getenv("ADMIN_PASSWORD") or os.getenv("DJANGO_SUPERUSER_PASSWORD")

        # If only ADMIN_EMAIL was given, derive the username from it.
        if email and not username:
            username = self._derive_username(email)

        if not email or not username:
            self.stdout.write(self.style.WARNING(
                "ADMIN_EMAIL / ADMIN_USERNAME not set - skipping superuser creation"
            ))
            return

        if not _EMAIL_RE.match(email):
            self.stdout.write(self.style.ERROR(
                f"Invalid admin email '{email}' - skipping superuser creation"
            ))
            return

        User = get_user_model()

        # Look up by email first, then fall back to username (in case a
        # previous version created the account keyed on a username).
        user = User.objects.filter(email__iexact=email).first()
        if user is None:
            user = User.objects.filter(username=username).first()

        is_new = False
        if user is None:
            user = User.objects.create(
                username=username,
                email=email,
                is_staff=True,
                is_superuser=True,
                is_active=True,
            )
            is_new = True
            self.stdout.write(self.style.SUCCESS(
                f"Superuser '{username}' <{email}> created"
            ))
        else:
            # Keep the account/username, just make sure it's a matching admin.
            needs_save = False
            if not user.is_staff:
                user.is_staff = True
                needs_save = True
            if not user.is_superuser:
                user.is_superuser = True
                needs_save = True
            if email and user.email.lower() != email.lower():
                user.email = email
                needs_save = True
            if needs_save:
                user.save()
            self.stdout.write(
                f"Superuser '{user.username}' already exists - updated flags"
            )

        if not password:
            if is_new:
                self.stdout.write(self.style.ERROR(
                    "No ADMIN_PASSWORD set - created superuser cannot log in"
                ))
            else:
                self.stdout.write(self.style.WARNING(
                    "ADMIN_PASSWORD not set - leaving password unchanged"
                ))
            return

        user.set_password(password)
        user.save(update_fields=["password"])
        self.stdout.write(self.style.SUCCESS(
            f"Password set for superuser '{user.username}'"
        ))
