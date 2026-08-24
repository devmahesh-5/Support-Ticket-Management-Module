"""Settings used ONLY by the automated test suite.

The dev/prod database user may lack CREATEDB privileges, so tests run
against a throwaway SQLite database instead of PostgreSQL. Behaviour under
test (models, services, APIs) is database-agnostic.

Usage:
    python manage.py test --settings=config.test_settings
"""

from .settings import *  # noqa: F401,F403

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        # In-memory by default; set TEST_DB_PATH to persist to a file
        # (e.g. for shell-based smoke runs against a disposable database).
        "NAME": os.getenv("TEST_DB_PATH", ":memory:"),
    }
}

EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"

# Faster password hashing during tests.
PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]

LOGGING_CONFIG = None
