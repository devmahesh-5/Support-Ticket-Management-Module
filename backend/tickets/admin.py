from django.contrib import admin
from .models import Ticket, TicketCategory, TicketMessage, StatusLog, Attachment

admin.site.register(Ticket)
admin.site.register(TicketMessage)
admin.site.register(StatusLog)
admin.site.register(Attachment)
admin.site.register(TicketCategory)
