"""One-shot / manual SLA / escalation engine pass.

Runs a full evaluation pass over active tickets:

- computes/refreshes SLA deadlines
- detects pauses and breaches
- sends threshold notifications
- evaluates policy rules
- performs auto escalation

Continuous scheduling is handled by django-apscheduler:

    python manage.py run_sla_scheduler

This command remains for cron setups, debugging and one-off passes:

    */2 * * * * cd /path/to/backend && ./venv/bin/python manage.py run_sla_engine

For development, use --watch N to run every N seconds in a loop.
"""

import time

from django.core.management.base import BaseCommand

from escalations.services.engine import run_engine


class Command(BaseCommand):
    help = "Run the SLA escalation engine evaluation pass"

    def add_arguments(self, parser):
        parser.add_argument(
            "--watch", type=int, default=0,
            help="Run continuously every N seconds (0 = single pass)",
        )
        parser.add_argument(
            "--ticket", type=int, nargs="*", default=None,
            help="Only evaluate the given ticket primary keys",
        )

    def handle(self, *args, **options):
        watch = options["watch"]
        ticket_ids = options["ticket"]

        while True:
            processed = run_engine(ticket_ids=ticket_ids)
            self.stdout.write(
                self.style.SUCCESS(f"SLA engine pass complete - {processed} ticket(s) evaluated")
            )
            if watch <= 0:
                break
            time.sleep(watch)
