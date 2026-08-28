"""Idempotently create/update the production Django superuser.

Reads DJANGO_SUPERUSER_USERNAME / DJANGO_SUPERUSER_EMAIL / DJANGO_SUPERUSER_PASSWORD
from the environment and ensures a matching superuser exists for the custom
AUTH_USER_MODEL ("accounts.User").

This is safer than ``createsuperuser --noinput`` because it works predictably
with the custom user model, updates the email, and never recreates the account
on every container restart. The password is set via ``set_password`` and is
never printed to logs.
"""

import os

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Create or update the production superuser from environment variables."

    def handle(self, *args, **options):
        username = os.getenv("DJANGO_SUPERUSER_USERNAME")
        email = os.getenv("DJANGO_SUPERUSER_EMAIL", "")
        password = os.getenv("DJANGO_SUPERUSER_PASSWORD")

        if not username:
            self.stdout.write(self.style.WARNING(
                "DJANGO_SUPERUSER_USERNAME not set - skipping superuser creation"
            ))
            return

        User = get_user_model()
        user = User.objects.filter(username=username).first()

        if user is None:
            user = User.objects.create(
                username=username,
                email=email,
                is_staff=True,
                is_superuser=True,
                is_active=True,
            )
            self.stdout.write(self.style.SUCCESS(
                f"Superuser '{username}' created"
            ))
        else:
            # Existing account: keep it as a superuser without recreating it.
            self.stdout.write(
                f"Superuser '{username}' already exists - updating"
            )
            needs_save = False
            if not user.is_staff:
                user.is_staff = True
                needs_save = True
            if not user.is_superuser:
                user.is_superuser = True
                needs_save = True
            if email and user.email != email:
                user.email = email
                needs_save = True
            if needs_save:
                user.save()

        if password:
            user.set_password(password)
            user.save(update_fields=["password"])
            self.stdout.write(self.style.SUCCESS(
                f"Password set for superuser '{username}'"
            ))
        else:
            self.stdout.write(self.style.WARNING(
                "DJANGO_SUPERUSER_PASSWORD not set - leaving password unchanged"
            ))
