"""Tests for account management permissions (campus admin / HOD)."""

from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import SubDepartment, User


def make_user(username, role, department=None, team=None):
    return User.objects.create_user(
        username=username,
        password="pass",
        role=role,
        department=department,
        sub_department=team,
    )


class HodUserManagementTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = make_user("root", User.Role.CAMPUS_ADMIN)
        cls.hod = make_user("hod", User.Role.DEPT_ADMIN, "COM")
        cls.other_hod = make_user("hod.ele", User.Role.DEPT_ADMIN, "ELE")

    def setUp(self):
        self.client = APIClient()

    # --- CREATE ---------------------------------------------------------
    def test_hod_can_create_team_lead_in_own_dept(self):
        self.client.force_authenticate(self.hod)
        resp = self.client.post("/api/auth/users/", {
            "username": "new.tl", "password": "pass@123",
            "first_name": "New", "last_name": "Lead",
            "role": User.Role.TEAM_LEAD, "department": "COM",
        }, format="json")
        self.assertEqual(resp.status_code, 201, resp.content)
        user = User.objects.get(username="new.tl")
        self.assertEqual(user.role, User.Role.TEAM_LEAD)
        self.assertEqual(user.level, 1)

    def test_hod_can_create_staff_in_own_dept(self):
        self.client.force_authenticate(self.hod)
        resp = self.client.post("/api/auth/users/", {
            "username": "new.staff", "password": "pass@123",
            "role": User.Role.STAFF, "department": "COM",
        }, format="json")
        self.assertEqual(resp.status_code, 201, resp.content)

    def test_hod_cannot_create_student_or_admin(self):
        self.client.force_authenticate(self.hod)
        for role in (User.Role.STUDENT, User.Role.CAMPUS_ADMIN, User.Role.DEPT_ADMIN):
            resp = self.client.post("/api/auth/users/", {
                "username": f"x-{role}", "password": "pass@123",
                "role": role, "department": "COM",
            }, format="json")
            self.assertEqual(resp.status_code, 400, (role, resp.content))

    def test_hod_cannot_create_user_in_other_department(self):
        self.client.force_authenticate(self.hod)
        resp = self.client.post("/api/auth/users/", {
            "username": "ele.guy", "password": "pass@123",
            "role": User.Role.STAFF, "department": "ELE",
        }, format="json")
        self.assertEqual(resp.status_code, 400)

    def test_student_cannot_create_users(self):
        student = make_user("stud", User.Role.STUDENT, "COM")
        self.client.force_authenticate(student)
        resp = self.client.post("/api/auth/users/", {
            "username": "nope", "password": "pass@123",
            "role": User.Role.STAFF, "department": "COM",
        }, format="json")
        self.assertEqual(resp.status_code, 403)

    # --- READ -----------------------------------------------------------
    def test_hod_sees_team_leads_and_staff_of_own_dept(self):
        lab = SubDepartment.objects.create(department="COM", name="Lab")
        tl = make_user("com.tl", User.Role.TEAM_LEAD, "COM", lab)
        staff = make_user("com.s1", User.Role.STAFF, "COM", lab)
        make_user("ele.s1", User.Role.STAFF, "ELE")  # other dept

        self.client.force_authenticate(self.hod)
        resp = self.client.get("/api/auth/users/")
        self.assertEqual(resp.status_code, 200)
        rows = resp.data["results"] if isinstance(resp.data, dict) else resp.data
        ids = {u["id"] for u in rows}
        self.assertIn(tl.id, ids)
        self.assertIn(staff.id, ids)
        self.assertNotIn(self.other_hod.id, ids)

    # --- UPDATE ---------------------------------------------------------
    def test_hod_can_update_team_lead(self):
        lab = SubDepartment.objects.create(department="COM", name="Lab")
        tl = make_user("tl.x", User.Role.TEAM_LEAD, "COM", lab)
        academic = SubDepartment.objects.create(department="COM", name="Academic")
        self.client.force_authenticate(self.hod)
        resp = self.client.patch(f"/api/auth/users/{tl.id}/", {
            "sub_department": academic.id,
            "is_available": False,
        }, format="json")
        self.assertEqual(resp.status_code, 200, resp.content)
        tl.refresh_from_db()
        self.assertEqual(tl.sub_department_id, academic.id)
        self.assertFalse(tl.is_available)

    def test_hod_can_promote_staff_to_team_lead(self):
        staff = make_user("s.promote", User.Role.STAFF, "COM")
        self.client.force_authenticate(self.hod)
        resp = self.client.patch(f"/api/auth/users/{staff.id}/", {
            "role": User.Role.TEAM_LEAD,
        }, format="json")
        self.assertEqual(resp.status_code, 200, resp.content)
        staff.refresh_from_db()
        self.assertEqual(staff.role, User.Role.TEAM_LEAD)
        self.assertEqual(staff.level, 1)

    def test_hod_cannot_update_other_department_users(self):
        ele_staff = make_user("ele.s2", User.Role.STAFF, "ELE")
        self.client.force_authenticate(self.hod)
        resp = self.client.patch(
            f"/api/auth/users/{ele_staff.id}/", {"first_name": "Nope"}, format="json"
        )
        self.assertIn(resp.status_code, (403, 404))

    def test_hod_cannot_update_another_hod(self):
        self.client.force_authenticate(self.hod)
        resp = self.client.patch(
            f"/api/auth/users/{self.other_hod.id}/", {"first_name": "Nope"}, format="json"
        )
        self.assertIn(resp.status_code, (403, 404))

    def test_regular_staff_cannot_update_others(self):
        member = make_user("m1", User.Role.STAFF, "COM")
        other = make_user("m2", User.Role.STAFF, "COM")
        self.client.force_authenticate(member)
        resp = self.client.patch(
            f"/api/auth/users/{other.id}/", {"first_name": "Nope"}, format="json"
        )
        self.assertEqual(resp.status_code, 403)

    # --- DELETE ---------------------------------------------------------
    def test_hod_can_delete_own_dept_staff(self):
        staff = make_user("del.me", User.Role.STAFF, "COM")
        self.client.force_authenticate(self.hod)
        resp = self.client.delete(f"/api/auth/users/{staff.id}/")
        self.assertEqual(resp.status_code, 204)
        self.assertFalse(User.objects.filter(id=staff.id).exists())

    def test_hod_cannot_delete_other_dept_staff(self):
        ele_staff = make_user("keep.me", User.Role.STAFF, "ELE")
        self.client.force_authenticate(self.hod)
        resp = self.client.delete(f"/api/auth/users/{ele_staff.id}/")
        self.assertIn(resp.status_code, (403, 404))
        self.assertTrue(User.objects.filter(id=ele_staff.id).exists())


class TeamLeadRosterSyncTests(TestCase):
    """Teams are created WITHOUT a lead. The lead emerges from the roster:
    setting a user's role to TEAM_LEAD with a sub_department makes them the
    team's lead automatically (and demotion releases it)."""

    @classmethod
    def setUpTestData(cls):
        cls.admin = make_user("root2", User.Role.CAMPUS_ADMIN)
        cls.staff = make_user("future.lead", User.Role.STAFF, "COM")

    def test_team_creation_ignores_lead_field(self):
        client = APIClient()
        client.force_authenticate(self.admin)
        resp = client.post("/api/auth/teams/", {
            "name": "Plain Team", "department": "COM", "lead": self.staff.id,
        }, format="json")
        self.assertEqual(resp.status_code, 201, resp.content)
        self.assertIsNone(resp.data["lead"])
        from accounts.models import SubDepartment
        self.assertIsNone(SubDepartment.objects.get(name="Plain Team").lead)

    def test_promoting_user_to_team_lead_sets_team_lead(self):
        from accounts.models import SubDepartment
        team = SubDepartment.objects.create(department="COM", name="Sync Lab")
        client = APIClient()
        client.force_authenticate(self.admin)
        resp = client.patch(f"/api/auth/users/{self.staff.id}/", {
            "role": User.Role.TEAM_LEAD,
            "sub_department": team.id,
        }, format="json")
        self.assertEqual(resp.status_code, 200, resp.content)
        team.refresh_from_db()
        self.staff.refresh_from_db()
        self.assertEqual(team.lead_id, self.staff.id)
        self.assertEqual(self.staff.level, 1)

    def test_demoting_lead_releases_team(self):
        from accounts.models import SubDepartment
        team = SubDepartment.objects.create(department="COM", name="Release Lab", lead=self.staff)
        client = APIClient()
        client.force_authenticate(self.admin)
        resp = client.patch(f"/api/auth/users/{self.staff.id}/", {
            "role": User.Role.STAFF,
            "sub_department": None,
        }, format="json")
        self.assertEqual(resp.status_code, 200, resp.content)
        team.refresh_from_db()
        self.assertIsNone(team.lead)

    def test_moving_lead_to_another_team_transfers_leadership(self):
        from accounts.models import SubDepartment
        team_a = SubDepartment.objects.create(department="COM", name="A", lead=self.staff)
        team_b = SubDepartment.objects.create(department="COM", name="B")
        # Promote to lead first.
        self.staff.role = User.Role.TEAM_LEAD
        self.staff.save()
        client = APIClient()
        client.force_authenticate(self.admin)
        resp = client.patch(f"/api/auth/users/{self.staff.id}/", {
            "sub_department": team_b.id,
        }, format="json")
        self.assertEqual(resp.status_code, 200, resp.content)
        team_a.refresh_from_db()
        team_b.refresh_from_db()
        self.assertIsNone(team_a.lead)
        self.assertEqual(team_b.lead_id, self.staff.id)


class TeamVisibilityTests(TestCase):
    """Every authenticated user (incl. students) can list teams - the
    ticket-creation form needs them to pick a sub-department."""

    @classmethod
    def setUpTestData(cls):
        cls.student = make_user("stud", User.Role.STUDENT, "COM")
        SubDepartment.objects.create(department="COM", name="Lab")

    def test_student_can_list_teams(self):
        client = APIClient()
        client.force_authenticate(self.student)
        resp = client.get("/api/auth/teams/")
        self.assertEqual(resp.status_code, 200, resp.content)

    def test_student_cannot_create_team(self):
        client = APIClient()
        client.force_authenticate(self.student)
        resp = client.post("/api/auth/teams/", {"name": "X", "department": "COM"}, format="json")
        self.assertEqual(resp.status_code, 403)
