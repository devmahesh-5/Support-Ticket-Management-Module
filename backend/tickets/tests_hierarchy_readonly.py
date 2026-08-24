"""Hierarchy read-only rules:

- Team leads only see/handle tickets held by them or lower staff; tickets
  escalated to the HOD or campus admin disappear from their scope.
- HODs keep visibility of department tickets that reached the campus admin,
  but those tickets are read-only for them.
"""

from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import SubDepartment, User
from .models import Ticket


def make_user(username, role, department=None, team=None):
    return User.objects.create_user(
        username=username,
        password="pass",
        role=role,
        department=department,
        sub_department=team,
    )


class HierarchyReadOnlyTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.student = make_user("student", User.Role.STUDENT, "COM")
        cls.campus_admin = make_user("root", User.Role.CAMPUS_ADMIN)
        cls.hod = make_user("hod", User.Role.DEPT_ADMIN, "COM")
        cls.lab = SubDepartment.objects.create(department="COM", name="Lab")
        cls.lead = make_user("lead", User.Role.TEAM_LEAD, "COM", cls.lab)
        cls.lab.lead = cls.lead
        cls.lab.save()
        cls.member = make_user("member", User.Role.STAFF, "COM", cls.lab)

    def setUp(self):
        self.ticket = Ticket.objects.create(
            title="hierarchy test", description="d", category="Lab Equipment",
            created_by=self.student, department="COM",
            assigned_to=self.member, sub_department=self.lab,
            status=Ticket.Status.IN_PROGRESS,
        )
        self.client = APIClient()

    # --- TEAM LEAD ------------------------------------------------------
    def test_tl_hides_tickets_escalated_to_hod(self):
        self.ticket.escalation_level = 2
        self.ticket.status = Ticket.Status.ESCALATED_L2
        self.ticket.assigned_to = self.hod
        self.ticket.save()

        self.client.force_authenticate(self.lead)
        resp = self.client.get("/api/tickets/")
        rows = resp.data["results"] if isinstance(resp.data, dict) else resp.data
        ids = {t["id"] for t in rows}
        self.assertNotIn(self.ticket.id, ids)

        detail = self.client.get(f"/api/tickets/{self.ticket.id}/")
        self.assertEqual(detail.status_code, 404)

        reassign = self.client.post(
            f"/api/tickets/{self.ticket.id}/reassign/",
            {"assigned_to": self.member.id}, format="json",
        )
        self.assertIn(reassign.status_code, (403, 404))

    def test_tl_still_sees_own_and_lower_level_tickets(self):
        # With him (level 1)
        self.ticket.escalation_level = 1
        self.ticket.status = Ticket.Status.ESCALATED_L1
        self.ticket.assigned_to = self.lead
        self.ticket.save()
        self.client.force_authenticate(self.lead)
        rows = self.client.get("/api/tickets/?mine=team").data
        rows = rows["results"] if isinstance(rows, dict) else rows
        self.assertIn(self.ticket.id, {t["id"] for t in rows})

        # With his staff (level 0)
        self.ticket.escalation_level = 0
        self.ticket.status = Ticket.Status.IN_PROGRESS
        self.ticket.assigned_to = self.member
        self.ticket.save()
        rows = self.client.get("/api/tickets/?mine=team").data
        rows = rows["results"] if isinstance(rows, dict) else rows
        self.assertIn(self.ticket.id, {t["id"] for t in rows})

    # --- HOD vs CAMPUS ADMIN --------------------------------------------
    def make_ticket_with_admin(self):
        self.ticket.escalation_level = 3
        self.ticket.status = Ticket.Status.ADMIN_REVIEW
        self.ticket.assigned_to = self.campus_admin
        self.ticket.save()

    def test_hod_still_sees_admin_held_ticket(self):
        self.make_ticket_with_admin()
        self.client.force_authenticate(self.hod)
        rows = self.client.get("/api/tickets/").data
        rows = rows["results"] if isinstance(rows, dict) else rows
        self.assertIn(self.ticket.id, {t["id"] for t in rows})
        self.assertEqual(self.client.get(f"/api/tickets/{self.ticket.id}/").status_code, 200)

    def test_hod_cannot_reassign_admin_held_ticket(self):
        self.make_ticket_with_admin()
        self.client.force_authenticate(self.hod)
        resp = self.client.post(
            f"/api/tickets/{self.ticket.id}/reassign/",
            {"assigned_to": self.member.id}, format="json",
        )
        self.assertEqual(resp.status_code, 403)
        self.ticket.refresh_from_db()
        self.assertEqual(self.ticket.assigned_to, self.campus_admin)

    def test_hod_cannot_change_status_of_admin_held_ticket(self):
        self.make_ticket_with_admin()
        self.client.force_authenticate(self.hod)
        resp = self.client.post(
            f"/api/tickets/{self.ticket.id}/change_status/",
            {"status": "RESOLVED"}, format="json",
        )
        self.assertEqual(resp.status_code, 403)
        self.ticket.refresh_from_db()
        self.assertEqual(self.ticket.status, Ticket.Status.ADMIN_REVIEW)

    def test_hod_cannot_change_priority_or_deescalate_admin_held_ticket(self):
        self.make_ticket_with_admin()
        self.client.force_authenticate(self.hod)
        r1 = self.client.post(
            f"/api/tickets/{self.ticket.id}/change_priority/",
            {"priority": "CRITICAL"}, format="json",
        )
        r2 = self.client.post(f"/api/tickets/{self.ticket.id}/deescalate/")
        self.assertEqual(r1.status_code, 403)
        self.assertEqual(r2.status_code, 403)

    def test_hod_can_still_follow_the_thread(self):
        """Read-only means handling actions are blocked; following the ticket
        (viewing / replying on the public thread) stays possible."""
        self.make_ticket_with_admin()
        self.client.force_authenticate(self.hod)
        resp = self.client.post(
            f"/api/tickets/{self.ticket.id}/add_message/",
            {"content": "Following up from the department"}, format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.content)

    def test_campus_admin_can_still_reassign_admin_held_ticket(self):
        self.make_ticket_with_admin()
        self.client.force_authenticate(self.campus_admin)
        resp = self.client.post(
            f"/api/tickets/{self.ticket.id}/reassign/",
            {"assigned_to": self.member.id}, format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.content)
