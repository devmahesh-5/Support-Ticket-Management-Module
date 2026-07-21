from django.contrib import admin
from .models import Category, RoutingRule, Ticket, TicketMessage, StatusLog, Attachment

admin.site.register(Category)
admin.site.register(RoutingRule)
admin.site.register(Ticket)
admin.site.register(TicketMessage)
admin.site.register(StatusLog)
admin.site.register(Attachment)
