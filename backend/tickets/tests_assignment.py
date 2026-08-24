"""Tests for team-lead-mediated assignment and reassignment permissions."""

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


class ReassignPermissionTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.campus_admin = make_user("campus", User.Role.CAMPUS_ADMIN)
        cls.hod = make_user("hod", User.Role.DEPT_ADMIN, "COM")

        cls.lab = SubDepartment.objects.create(department="COM", name="Lab")
        cls.academic = SubDepartment.objects.create(department="COM", name="Academic")
        cls.ele_lab = SubDepartment.objects.create(department="ELE", name="Lab")

        cls.tl_lab = make_user("tl.lab", User.Role.TEAM_LEAD, "COM", cls.lab)
        cls.lab.lead = cls.tl_lab
        cls.lab.save()

        cls.member1 = make_user("s1", User.Role.STAFF, "COM", cls.lab)
        cls.member2 = make_user("s2", User.Role.STAFF, "COM", cls.lab)
        cls.other_team_staff = make_user("s3", User.Role.STAFF, "COM", cls.academic)
        cls.other_dept_staff = make_user("s4", User.Role.STAFF, "ELE", cls.ele_lab)
        cls.student = make_user("student", User.Role.STUDENT, "COM")

        # Ticket held by the Lab team lead (as routing would leave it).
        cls.ticket = Ticket.objects.create(
            title="t", description="d", category="Lab Equipment",
            created_by=cls.student, department="COM",
            assigned_to=cls.tl_lab, sub_department=cls.lab,
            escalation_level=1,
        )

    def setUp(self):
        self.client = APIClient()
        self.ticket.refresh_from_db()

    def reassign_as(self, user, assignee):
        self.client.force_authenticate(user)
        return self.client.post(
            f"/api/tickets/{self.ticket.id}/reassign/",
            {"assigned_to": assignee.id},
            format="json",
        )

    def test_team_lead_assigns_to_own_team_member(self):
        resp = self.reassign_as(self.tl_lab, self.member1)
        self.assertEqual(resp.status_code, 200, resp.content)
        self.ticket.refresh_from_db()
        self.assertEqual(self.ticket.assigned_to, self.member1)
        self.assertEqual(self.ticket.escalation_level, 0)
        self.assertEqual(self.ticket.status, Ticket.Status.IN_PROGRESS)

    def test_team_lead_cannot_assign_to_other_team(self):
        resp = self.reassign_as(self.tl_lab, self.other_team_staff)
        self.assertEqual(resp.status_code, 403)
        self.ticket.refresh_from_db()
        self.assertEqual(self.ticket.assigned_to, self.tl_lab)

    def test_team_lead_cannot_assign_to_other_department(self):
        resp = self.reassign_as(self.tl_lab, self.other_dept_staff)
        self.assertEqual(resp.status_code, 403)

    def test_regular_staff_cannot_reassign(self):
        resp = self.reassign_as(self.member1, self.member2)
        # Staff cannot see tickets not assigned to them (404) and may not
        # reassign regardless.
        self.assertIn(resp.status_code, (403, 404))
        self.ticket.refresh_from_db()
        self.assertEqual(self.ticket.assigned_to, self.tl_lab)

    def test_student_cannot_reassign(self):
        resp = self.reassign_as(self.student, self.member1)
        self.assertEqual(resp.status_code, 403)
        self.ticket.refresh_from_db()
        self.assertEqual(self.ticket.assigned_to, self.tl_lab)

    def test_hod_can_reassign_within_own_department(self):
        resp = self.reassign_as(self.hod, self.member2)
        self.assertEqual(resp.status_code, 200, resp.content)
        self.ticket.refresh_from_db()
        self.assertEqual(self.ticket.assigned_to, self.member2)

    def test_hod_cannot_reassign_to_other_department(self):
        resp = self.reassign_as(self.hod, self.other_dept_staff)
        self.assertEqual(resp.status_code, 403)

    def test_campus_admin_can_reassign_anywhere(self):
        resp = self.reassign_as(self.campus_admin, self.other_dept_staff)
        self.assertEqual(resp.status_code, 200, resp.content)
        self.ticket.refresh_from_db()
        self.assertEqual(self.ticket.assigned_to, self.other_dept_staff)

    def test_cannot_assign_student_as_assignee(self):
        resp = self.reassign_as(self.campus_admin, self.student)
        self.assertEqual(resp.status_code, 403)


class TeamMembersEndpointTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.lab = SubDepartment.objects.create(department="COM", name="Lab")
        cls.academic = SubDepartment.objects.create(department="COM", name="Academic")
        cls.tl = make_user("tl", User.Role.TEAM_LEAD, "COM", cls.lab)
        cls.lab.lead = cls.tl
        cls.lab.save()
        cls.member = make_user("m1", User.Role.STAFF, "COM", cls.lab)
        cls.outsider = make_user("m2", User.Role.STAFF, "COM", cls.academic)
        cls.student = make_user("student", User.Role.STUDENT, "COM")

    def test_lead_sees_only_their_team_members(self):
        client = APIClient()
        client.force_authenticate(self.tl)
        resp = client.get("/api/auth/users/team_members/")
        self.assertEqual(resp.status_code, 200)
        ids = [u["id"] for u in resp.data]
        self.assertIn(self.member.id, ids)
        self.assertNotIn(self.outsider.id, ids)

    def test_student_forbidden(self):
        client = APIClient()
        client.force_authenticate(self.student)
        resp = client.get("/api/auth/users/team_members/")
        self.assertEqual(resp.status_code, 403)


class TeamLeadMembershipVisibilityTests(TestCase):
    """A team lead also sees tickets of the sub-department they belong to,
    not just the teams they lead."""

    @classmethod
    def setUpTestData(cls):
        cls.student = make_user("student", User.Role.STUDENT, "COM")
        cls.lab = SubDepartment.objects.create(department="COM", name="Lab")
        cls.academic = SubDepartment.objects.create(department="COM", name="Academic")

    def test_lead_sees_membership_team_tickets(self):
        # Dual is a member of Academic but leads neither team;
        # Lab has a completely different lead.
        dual = make_user("dual.lead", User.Role.TEAM_LEAD, "COM", self.academic)
        lab_lead = make_user("real.lab.lead", User.Role.TEAM_LEAD, "COM", self.lab)
        self.lab.lead = lab_lead
        self.academic.lead = lab_lead
        self.academic.save()
        self.lab.save()

        academic_ticket = Ticket.objects.create(
            title="academic ticket", description="d", category="Classroom",
            created_by=self.student, department="COM",
            assigned_to=dual, sub_department=self.academic, escalation_level=1,
        )
        member = make_user("acad.s1", User.Role.STAFF, "COM", self.academic)
        held_ticket = Ticket.objects.create(
            title="held by member", description="d", category="Classroom",
            created_by=self.student, department="COM",
            assigned_to=member, sub_department=self.academic,
        )
        other = make_user("other.s", User.Role.STAFF, "COM", self.lab)
        lab_held = Ticket.objects.create(
            title="lab held", description="d", category="Lab Equipment",
            created_by=self.student, department="COM",
            assigned_to=other, sub_department=self.lab,
        )

        client = APIClient()
        client.force_authenticate(dual)
        resp = client.get("/api/tickets/")
        rows = resp.data["results"] if isinstance(resp.data, dict) else resp.data
        ids = {t["id"] for t in rows}
        self.assertIn(academic_ticket.id, ids)   # led team
        self.assertIn(held_ticket.id, ids)       # membership team
        self.assertNotIn(lab_held.id, ids)       # lab ticket held elsewhere

        # mine=team filter includes both teams.
        resp = client.get("/api/tickets/?mine=team")
        rows = resp.data["results"] if isinstance(resp.data, dict) else resp.data
        ids = {t["id"] for t in rows}
        self.assertIn(academic_ticket.id, ids)
        self.assertIn(held_ticket.id, ids)
