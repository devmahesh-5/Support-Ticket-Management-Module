#!/usr/bin/env python
"""Standalone test: SLA-breach automatic escalation.

Verifies the escalation engine detects a breached SLA and automatically
escalates the ticket to the next support level.

It runs against the real database but wraps everything in a transaction that
is ROLLED BACK at the end, so:

  * no tickets are created or deleted,
  * no users are created or changed,
  * no notifications / history rows are persisted,
  * no emails are sent (email backend is forced to in-memory).

It uses only existing users and an existing active ticket.

Run from the backend directory:

    ../venv/bin/python test.py
"""

import os
import sys
import django

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

# Never dispatch real emails during the test.
from django.conf import settings as dj_settings
dj_settings.EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"

from django.db import transaction
from django.utils import timezone
from datetime import timedelta

from tickets.models import Ticket
from escalations.models import EscalationHistory, EscalationPolicy
from escalations.services.engine import run_engine, ACTIVE_STATUSES
from escalations.services.policies import match_policy

PASSED = []
FAILED = []


def check(name, condition, extra=""):
    label = "PASS" if condition else "FAIL"
    (PASSED if condition else FAILED).append(name)
    print(f"  [{label}] {name}{(' - ' + extra) if extra else ''}")


def main():
    print("=" * 68)
    print("SLA-breach automatic escalation test (rolled back, nothing saved)")
    print("=" * 68)

    policy = EscalationPolicy.objects.filter(is_enabled=True).order_by("id").first()
    if policy is None:
        print("\nSKIP: no enabled EscalationPolicy exists in the database.")
        print("Create/enable a policy first (Admin -> Escalation Policies).")
        return 0

    # Prefer an IN_PROGRESS ticket so the test also proves run_engine picks
    # up in-progress tickets (it used to skip them); fall back to OPEN/REOPENED.
    base = Ticket.objects.filter(
        status__in=["OPEN", "IN_PROGRESS", "REOPENED"],
        escalation_level=0,
    )
    ticket = (
        base.filter(status="IN_PROGRESS").order_by("id").first()
        or base.order_by("id").first()
    )
    if ticket is None:
        print("\nSKIP: no existing active level-0 ticket found to test with.")
        print("Create a ticket first (or open/reopen one).")
        return 0

    print(f"\nTicket under test : {ticket.ticket_id} (pk={ticket.id})")
    print(f"  status={ticket.status}  level={ticket.escalation_level}  "
          f"category={ticket.category}  dept={ticket.department}")
    print(f"  assignee={ticket.assigned_to}  creator={ticket.created_by}")
    print(f"  governor policy: {policy.name} (auto_escalate={policy.auto_escalate}, "
          f"delay={policy.escalation_delay_minutes}min)")

    with transaction.atomic():
        try:
            now = timezone.now()
            before_ids = set(Ticket.objects.values_list("id", flat=True))
            before_breached = set(
                Ticket.objects.filter(sla_status="BREACHED").values_list("id", flat=True)
            )
            original = {
                "status": ticket.status,
                "escalation_level": ticket.escalation_level,
                "assigned_to": ticket.assigned_to,
                "queue": ticket.queue,
                "sla_deadline": ticket.sla_deadline,
                "response_deadline": ticket.response_deadline,
                "sla_breached_at": ticket.sla_breached_at,
                "sla_status": ticket.sla_status,
                "priority": ticket.priority,
                "escalation_policy": ticket.escalation_policy,
            }

            # --- Ensure a policy governs the ticket so the engine has a target.
            governing = match_policy(ticket)
            if governing is None:
                print(f"\n  NOTE: no policy currently matches the ticket; "
                      f"temporarily broadening '{policy.name}' for the test.")
                for field in ("department", "category", "priority"):
                    setattr(policy, field, None)
                policy.from_level = 1
            else:
                policy = governing
                print(f"\n  matched policy: {policy.name}")

            # Auto-escalation must be ON for the breach action to reassign.
            policy.auto_escalate = True
            policy.notify_email = False
            policy.notify_sms = False
            policy.save(update_fields=[
                "auto_escalate", "notify_email", "notify_sms",
                "department", "category", "priority", "from_level",
            ])

            # --- Force an SLA breach on the existing ticket.
            ticket.sla_deadline = now - timedelta(hours=1)
            ticket.response_deadline = now - timedelta(hours=1)
            ticket.first_response_at = None
            ticket.save(update_fields=[
                "sla_deadline", "response_deadline", "first_response_at",
            ])

            # --- Pass 1: the engine detects the breach.
            processed = run_engine(ticket_ids=[ticket.id], now=now)
            ticket.refresh_from_db()
            check("engine evaluated the ticket (pass 1)",
                  processed == 1, f"processed={processed}")
            check("IN_PROGRESS ticket is picked up by run_engine",
                  Ticket.Status.IN_PROGRESS in ACTIVE_STATUSES)
            check("ticket flagged as SLA breached",
                  ticket.sla_breached_at is not None and ticket.sla_status == "BREACHED",
                  f"sla_status={ticket.sla_status}")
            check("not escalated on the first pass (delay applies)",
                  ticket.escalation_level == 0,
                  f"level={ticket.escalation_level}")

            # --- Pass 2: past the delay, the engine auto-escalates.
            delay = timedelta(minutes=policy.escalation_delay_minutes + 1)
            processed2 = run_engine(ticket_ids=[ticket.id], now=now + delay)
            ticket.refresh_from_db()
            check("engine evaluated the ticket (pass 2)", processed2 == 1)
            check("ticket auto-escalated to the next level",
                  ticket.escalation_level > 0,
                  f"level={ticket.escalation_level}")
            check("status moved into the escalation chain",
                  ticket.status in [
                      Ticket.Status.ESCALATED_L1,
                      Ticket.Status.ESCALATED_L2,
                      Ticket.Status.ADMIN_REVIEW,
                  ],
                  f"status={ticket.status}")
            check("ticket reassigned (or at least kept an owner)",
                  ticket.assigned_to is not None,
                  f"assignee={ticket.assigned_to}")
            check("sla_status stays BREACHED after escalation",
                  ticket.sla_status == "BREACHED",
                  f"sla_status={ticket.sla_status}")
            check("escalation recorded in history",
                  EscalationHistory.objects.filter(
                      ticket=ticket, action=EscalationHistory.Action.ESCALATED
                  ).exists())

            # --- The engine must never create or delete tickets.
            after_ids = set(Ticket.objects.values_list("id", flat=True))
            check("no tickets were created by the engine",
                  after_ids == before_ids,
                  f"before={len(before_ids)} after={len(after_ids)}")
            check("no tickets were deleted by the engine",
                  before_ids <= after_ids and len(before_ids) == len(after_ids))
            check("breached tickets are NOT removed by escalation",
                  set(Ticket.objects.filter(sla_status="BREACHED").values_list("id", flat=True))
                  >= before_breached,
                  f"breached before={sorted(before_breached)}")

            print(f"\n  After auto-escalation:")
            print(f"    status: {original['status']} -> {ticket.status}")
            print(f"    level : {original['escalation_level']} -> {ticket.escalation_level}")
            print(f"    owner : {original['assigned_to']} -> {ticket.assigned_to}")
            for h in EscalationHistory.objects.filter(ticket=ticket).order_by("id")[:5]:
                print(f"    history: {h.action} | {h.message}")

        finally:
            # Roll everything back - nothing is persisted.
            transaction.set_rollback(True)

    print("\n" + "-" * 68)
    print(f"RESULT: {len(PASSED)} passed, {len(FAILED)} failed")
    for name in FAILED:
        print(f"  FAILED: {name}")
    print("NOTE: the test ran inside a rolled-back transaction, so no data was changed.")
    print("For fully automatic escalation, schedule the engine periodically, e.g.:")
    print("    */2 * * * * cd <repo>/backend && <venv>/bin/python manage.py run_sla_engine")
    return 1 if FAILED else 0


if __name__ == "__main__":
    sys.exit(main())
