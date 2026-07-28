from django.contrib import admin
from .models import Notification, NotificationTemplate

admin.site.register(Notification)
admin.site.register(NotificationTemplate)
