"""Long-running SLA deadline check engine powered by django-apscheduler.

Runs as its own process alongside the web server:

    python manage.py run_sla_scheduler

Every tick evaluates all active tickets (deadlines, threshold notifications,
breach detection, policy evaluation, auto-escalation). The interval is
configurable via the SLA_ENGINE_INTERVAL_SECONDS environment variable
(default: 60 seconds).
"""

from apscheduler.schedulers.blocking import BlockingScheduler

from escalations.scheduling import configure_scheduler

from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = (
        "Start the SLA engine scheduler (django-apscheduler). "
        "Runs until interrupted; schedule one-off passes with run_sla_engine instead."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--once",
            action="store_true",
            help="Run a single engine tick immediately, then start scheduling.",
        )

    def handle(self, *args, **options):
        if options["once"]:
            from escalations.scheduling import run_sla_engine_job

            run_sla_engine_job()

        scheduler: BlockingScheduler = configure_scheduler(BlockingScheduler())
        self.stdout.write(
            self.style.SUCCESS("SLA scheduler started (Ctrl+C to stop)")
        )
        try:
            scheduler.start()
        except (KeyboardInterrupt, SystemExit):
            self.stdout.write("SLA scheduler stopped")
