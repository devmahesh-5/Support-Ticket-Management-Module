"""django-apscheduler based scheduling for the SLA deadline check engine.

The engine tick (``escalations.services.engine.run_engine``) is executed on a
fixed interval by a dedicated scheduler process started with:

    python manage.py run_sla_scheduler

Running the scheduler as its own process (instead of inside the web process)
keeps it safe from gunicorn multi-worker duplication and from runserver's
autoreload.
"""

import logging

from apscheduler.schedulers.base import BaseScheduler
from django.conf import settings
from django_apscheduler.jobstores import DjangoJobStore

logger = logging.getLogger(__name__)

SLA_ENGINE_JOB_ID = "sla_engine_tick"


def run_sla_engine_job():
    """One SLA engine tick. Never raises: failures are logged so the
    scheduler keeps ticking."""
    from .services.engine import run_engine

    try:
        processed = run_engine()
        logger.info("SLA engine tick complete: %s ticket(s) evaluated", processed)
    except Exception:
        logger.exception("SLA engine tick failed")


def configure_scheduler(scheduler: BaseScheduler) -> BaseScheduler:
    """Attach the django-apscheduler jobstore and register the engine job.

    ``coalesce`` + ``max_instances=1`` guarantee that a slow pass never runs
    concurrently with the next one.
    """
    scheduler.add_jobstore(DjangoJobStore(), "default")
    scheduler.add_job(
        run_sla_engine_job,
        trigger="interval",
        seconds=getattr(settings, "SLA_ENGINE_INTERVAL_SECONDS", 60),
        id=SLA_ENGINE_JOB_ID,
        coalesce=True,
        max_instances=1,
        misfire_grace_time=30,
        replace_existing=True,
    )
    return scheduler
