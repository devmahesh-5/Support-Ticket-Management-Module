import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent.parent

SECRET_KEY = os.getenv("DJANGO_SECRET_KEY")
if not SECRET_KEY:
    raise RuntimeError("DJANGO_SECRET_KEY environment variable is not set")
DEBUG = os.getenv("DEBUG", "False").lower() == "true"
_ALLOWED_HOSTS_RAW = os.getenv("ALLOWED_HOSTS") or os.getenv("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1")
ALLOWED_HOSTS = [h.strip() for h in _ALLOWED_HOSTS_RAW.split(",") if h.strip()]

# Trust the HTTPS protocol forwarded by Traefik -> Nginx -> Gunicorn.
# When DEBUG=False the app runs behind HTTPS, so Django must honour the
# X-Forwarded-Proto: https header sent by the reverse proxies.
# Only trust the header when the reverse proxy actually sets it; this is what
# makes the Django admin usable behind Coolify/Traefik over HTTPS without
# CSRF 403 errors.
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
if DEBUG:
    SECURE_SSL_REDIRECT = False

# Cookies over HTTPS. In production (DEBUG=False) require a secure
# connection for the session and CSRF cookies. Allow opting out via
# environment for local HTTPS-proxied setups if ever needed.
CSRF_COOKIE_SECURE = os.getenv("CSRF_COOKIE_SECURE", str(not DEBUG).lower()) == "true"
SESSION_COOKIE_SECURE = os.getenv("SESSION_COOKIE_SECURE", str(not DEBUG).lower()) == "true"

# --- CSRF / Origin handling ---------------------------------------------
# This is the critical setting for Django admin behind a reverse proxy.
# Django's CSRF middleware rejects a POST when the request's Origin/Referer
# header does not match an entry in CSRF_TRUSTED_ORIGINS. Behind Coolify the
# browser sends "https://<your-domain>", so that origin MUST be listed here
# or every login POST (and any form submit) fails with
# "CSRF verification failed (403)".
#
# It can be set explicitly via the CSRF_TRUSTED_ORIGINS env var (comma
# separated, e.g. "https://tickets.example.com,https://staging.example.com").
# As a convenience fallback we auto-derive "https://<host>" for every host in
# ALLOWED_HOSTS (excluding "*"), so a plain Coolify deployment with a real
# domain works out of the box.
_CSRF_TRUSTED_ORIGINS = [
    o.strip() for o in os.getenv("CSRF_TRUSTED_ORIGINS", "").split(",") if o.strip()
]
if not _CSRF_TRUSTED_ORIGINS:
    # Derive "https://<host>" (and "http://<host>" for plain-HTTP setups)
    # from every explicit host in ALLOWED_HOSTS. The "*" wildcard can't be
    # trusted, so it is skipped - in that case set CSRF_TRUSTED_ORIGINS
    # explicitly in your Coolify environment.
    for host in ALLOWED_HOSTS:
        if host and host != "*":
            _CSRF_TRUSTED_ORIGINS.append(f"https://{host}")
            _CSRF_TRUSTED_ORIGINS.append(f"http://{host}")
CSRF_TRUSTED_ORIGINS = _CSRF_TRUSTED_ORIGINS

if not CSRF_TRUSTED_ORIGINS:
    import warnings
    warnings.warn(
        "No CSRF trusted origins configured. The Django admin login/form "
        "POSTs will return 403. Set CSRF_TRUSTED_ORIGINS (e.g. "
        "'https://tickets.example.com') in your environment, or set "
        "ALLOWED_HOSTS to your actual domain instead of '*'.",
        stacklevel=2,
    )

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "corsheaders",
    "django_filters",
    "django_apscheduler",
    "accounts",
    "tickets",
    "notifications",
    "escalations",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": os.getenv("DB_NAME"),
        "USER": os.getenv("DB_USER"),
        "PASSWORD": os.getenv("DB_PASSWORD"),
        "HOST": os.getenv("DB_HOST", "localhost"),
        "PORT": os.getenv("DB_PORT", "5432"),
        "OPTIONS": {"options": "-c search_path=ticket_system,public"},
    }
}

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = "Asia/Kathmandu"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
MEDIA_URL = "media/"
MEDIA_ROOT = BASE_DIR / "media"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

CORS_ALLOW_ALL_ORIGINS = DEBUG
CORS_ALLOWED_ORIGINS = os.getenv("CORS_ALLOWED_ORIGINS", "http://localhost:3000").split(",")

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "config.auth.CsrfExemptSessionAuthentication",
        "rest_framework.authentication.BasicAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    "DEFAULT_PAGINATION_CLASS": "config.pagination.StandardPagination",
    "PAGE_SIZE": 20,
    "DEFAULT_FILTER_BACKENDS": [
        "django_filters.rest_framework.DjangoFilterBackend",
        "rest_framework.filters.SearchFilter",
        "rest_framework.filters.OrderingFilter",
    ],
}

AUTH_USER_MODEL = "accounts.User"

EMAIL_BACKEND = os.getenv(
    "EMAIL_BACKEND", "django.core.mail.backends.console.EmailBackend"
)
EMAIL_HOST = os.getenv("EMAIL_HOST", "localhost")
EMAIL_PORT = int(os.getenv("EMAIL_PORT", "25"))
EMAIL_HOST_USER = os.getenv("EMAIL_HOST_USER", "")
EMAIL_HOST_PASSWORD = os.getenv("EMAIL_HOST_PASSWORD", "")
EMAIL_USE_TLS = os.getenv("EMAIL_USE_TLS", "False").lower() == "true"
DEFAULT_FROM_EMAIL = os.getenv("DEFAULT_FROM_EMAIL", "noreply@ticket.pulchowk.edu")

# --- SLA engine scheduler (django-apscheduler) ---
# The scheduler runs as its own process: python manage.py run_sla_scheduler
SLA_ENGINE_INTERVAL_SECONDS = int(os.getenv("SLA_ENGINE_INTERVAL_SECONDS", "60"))
DJANGO_APSCHEDULER = {
    # Keep at most one week of job execution history in django_apscheduler tables.
    "DJANGO_APSCHEDULER_MAX_JOB_RUNS": 500,
}
