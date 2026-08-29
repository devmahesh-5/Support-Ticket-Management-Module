from django.contrib import admin
from django.urls import path, include, re_path
from django.conf import settings
from django.conf.urls.static import static

from config.views import frontend_index, healthz

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/auth/", include("accounts.urls")),
    path("api/tickets/", include("tickets.urls")),
    path("api/notifications/", include("notifications.urls")),
    path("api/escalations/", include("escalations.urls")),
]

# Health check for Coolify / Docker HEALTHCHECK (accepts optional trailing slash)
urlpatterns += [
    re_path(r"^healthz/?$", healthz),
]

# Media uploads are served directly by Django (there is no Nginx anymore)
urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

# SPA fallback: any non-API/admin/static/media route returns the React index.html
urlpatterns += [
    re_path(r"^(?!api/|admin/|static/|media/).*$", frontend_index),
]