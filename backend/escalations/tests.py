"""Tests for the flattened escalation ladder:

staff (0) -> team lead (1) -> department HOD (2) -> campus admin (3).
"""

from django.test import TestCase

from accounts.models import SubDepartment, User
from tickets.models import Ticket

from .services import assign as assign_svc


def make_user(username, role, department=None, team=None):
    return User.objects.create_user(
        username=username,
        password="pass",
        role=role,
        department=department,
        sub_department=team,
    )


class EscalationLadderTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.campus_admin = make_user("campus", User.Role.CAMPUS_ADMIN)
        cls.hod = make_user("hod", User.Role.DEPT_ADMIN, "COM")
        cls.lab = SubDepartment.objects.create(department="COM", name="Lab")
        cls.lead = make_user("lead", User.Role.TEAM_LEAD, "COM", cls.lab)
        cls.lab.lead = cls.lead
        cls.lab.save()
        cls.member = make_user("member", User.Role.STAFF, "COM", cls.lab)
        cls.student = make_user("student", User.Role.STUDENT, "COM")

        cls.ticket = Ticket.objects.create(
            title="ladder", description="d", category="Lab Equipment",
            created_by=cls.student, department="COM",
            assigned_to=cls.member, sub_department=cls.lab,
            status=Ticket.Status.IN_PROGRESS,
        )

    def test_level_mapping(self):
        self.assertEqual(assign_svc.escalation_level_for_assignee(self.member), 0)
        self.assertEqual(assign_svc.escalation_level_for_assignee(self.lead), 1)
        self.assertEqual(assign_svc.escalation_level_for_assignee(self.hod), 2)
        self.assertEqual(assign_svc.escalation_level_for_assignee(self.campus_admin), 3)

    def test_full_escalation_walk(self):
        t = self.ticket

        # staff (0) -> team lead (1)
        a = assign_svc.escalate_ticket(t, note="step1")
        t.refresh_from_db()
        self.assertEqual(a, self.lead)
        self.assertEqual(t.escalation_level, 1)
        self.assertEqual(t.status, Ticket.Status.ESCALATED_L1)

        # team lead (1) -> HOD (2)
        a = assign_svc.escalate_ticket(t, note="step2")
        t.refresh_from_db()
        self.assertEqual(a, self.hod)
        self.assertEqual(t.escalation_level, 2)
        self.assertEqual(t.status, Ticket.Status.ESCALATED_L2)

        # HOD (2) -> campus admin (3)
        a = assign_svc.escalate_ticket(t, note="step3")
        t.refresh_from_db()
        self.assertEqual(a, self.campus_admin)
        self.assertEqual(t.escalation_level, 3)
        self.assertEqual(t.status, Ticket.Status.ADMIN_REVIEW)

        # already at the top: stays put
        assign_svc.escalate_ticket(t, note="step4")
        t.refresh_from_db()
        self.assertEqual(t.escalation_level, 3)
        self.assertEqual(t.assigned_to, self.campus_admin)

    def test_deescalation_walk_returns_down_the_chain(self):
        t = self.ticket
        t.escalation_level = 2
        t.status = Ticket.Status.ESCALATED_L2
        t.assigned_to = self.hod
        t.save()

        # HOD (2) -> team lead (1)
        a = assign_svc.deescalate_ticket(t, note="down1")
        t.refresh_from_db()
        self.assertEqual(a, self.lead)
        self.assertEqual(t.escalation_level, 1)
        self.assertEqual(t.status, Ticket.Status.ESCALATED_L1)

        # team lead (1) -> staff member of the team (0)
        a = assign_svc.deescalate_ticket(t, note="down2")
        t.refresh_from_db()
        self.assertEqual(a, self.member)
        self.assertEqual(t.escalation_level, 0)
        self.assertEqual(t.status, Ticket.Status.IN_PROGRESS)

    def test_resolve_assignee_levels(self):
        self.assertEqual(
            assign_svc.resolve_assignee(level=0, ticket=self.ticket), self.member
        )
        self.assertEqual(
            assign_svc.resolve_assignee(level=1, ticket=self.ticket), self.lead
        )
        self.assertEqual(
            assign_svc.resolve_assignee(level=2, ticket=self.ticket), self.hod
        )
        self.assertEqual(
            assign_svc.resolve_assignee(level=3, ticket=self.ticket),
            self.campus_admin,
        )

    def test_manual_escalate_api_blocks_at_top(self):
        from rest_framework.test import APIClient

        client = APIClient()
        client.force_authenticate(self.hod)
        self.ticket.escalation_level = 3
        self.ticket.status = Ticket.Status.ADMIN_REVIEW
        self.ticket.save()
        resp = client.post(f"/api/tickets/{self.ticket.id}/escalate/")
        self.assertEqual(resp.status_code, 400)


class PolicyLevelSemanticsTests(TestCase):
    """Policy to_level now refers to handler levels directly."""

    @classmethod
    def setUpTestData(cls):
        cls.campus_admin = make_user("campus2", User.Role.CAMPUS_ADMIN)
        cls.hod = make_user("hod2", User.Role.DEPT_ADMIN, "COM")
        cls.lab = SubDepartment.objects.create(department="COM", name="Lab")
        cls.lead = make_user("lead2", User.Role.TEAM_LEAD, "COM", cls.lab)
        cls.lab.lead = cls.lead
        cls.lab.save()
        cls.student = make_user("student2", User.Role.STUDENT, "COM")

    def test_policy_to_level_drives_hop(self):
        from escalations.models import EscalationPolicy

        policy = EscalationPolicy.objects.create(
            name="staff->TL", is_enabled=True, auto_escalate=True,
            from_level=0, to_level=1,
        )
        ticket = Ticket.objects.create(
            title="p", description="d", category="Lab Equipment",
            created_by=self.student, department="COM",
            sub_department=self.lab, escalation_level=0,
            escalation_policy=policy,
        )
        assignee = assign_svc.escalate_ticket(ticket, level=1, note="policy hop")
        self.assertEqual(assignee, self.lead)
        ticket.refresh_from_db()
        self.assertEqual(ticket.escalation_level, 1)
