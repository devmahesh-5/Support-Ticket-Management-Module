"""Tests for the dynamic department/sub-department routing pipeline.

Routing is driven purely by the ticket's department + sub-department: the
sub-department's team lead receives the ticket. Categories carry no routing
information (SLA only).
"""

from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import Department, SubDepartment, User
from tickets.models import Ticket, TicketCategory


def make_user(username, role, department=None, team=None):
    return User.objects.create_user(
        username=username,
        password="pass",
        role=role,
        department=department,
        sub_department=team,
    )


class RoutingTestBase(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.dept_com, _ = Department.objects.get_or_create(
            code="COM", defaults={"name": "Computer Engineering"}
        )
        cls.campus_admin = make_user("campus", User.Role.CAMPUS_ADMIN)
        cls.student = make_user("student1", User.Role.STUDENT, department="COM")
        TicketCategory.objects.get_or_create(
            name="Lab Equipment",
            defaults={"sla_response_hours": 24, "sla_resolution_hours": 72},
        )

    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(self.student)

    def create_ticket(self, title="Need help", **extra):
        payload = {"title": title, "description": "desc", "department": "COM", **extra}
        resp = self.client.post("/api/tickets/", payload, format="json")
        self.assertEqual(resp.status_code, 201, resp.content)
        return Ticket.objects.get(id=resp.data["id"])


class TeamLeadRoutingTests(RoutingTestBase):
    """Tickets land on the responsible team lead - never directly on staff."""

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.lab, _ = SubDepartment.objects.get_or_create(department="COM", name="Lab")
        cls.lab_lead = make_user("lead.lab", User.Role.TEAM_LEAD, "COM", cls.lab)
        cls.lab.lead = cls.lab_lead
        cls.lab.save()

    def test_team_subdepartment_routes_to_its_lead(self):
        ticket = self.create_ticket(
            sub_department=self.lab.id,
            category="Lab Equipment",
        )
        self.assertEqual(ticket.assigned_to, self.lab_lead)
        self.assertEqual(ticket.sub_department, self.lab)
        self.assertEqual(ticket.status, Ticket.Status.OPEN)
        self.assertIsNotNone(ticket.sla_deadline)

    def test_category_does_not_influence_routing(self):
        # Even a 'random' category routes purely by department + team.
        TicketCategory.objects.create(name="Whatever")
        ticket = self.create_ticket(sub_department=self.lab.id, category="Whatever")
        self.assertEqual(ticket.assigned_to, self.lab_lead)

    def test_other_department_team_routes_to_that_teams_lead(self):
        ele, _ = Department.objects.get_or_create(code="ELE", defaults={"name": "Electrical"})
        ele_lab, _ = SubDepartment.objects.get_or_create(department="ELE", name="Lab")
        ele_lead = make_user("lead.ele", User.Role.TEAM_LEAD, "ELE", ele_lab)
        ele_lab.lead = ele_lead
        ele_lab.save()
        # Student belongs to COM but explicitly files under ELE/Lab.
        ticket = self.create_ticket(department="ELE", sub_department=ele_lab.id)
        self.assertEqual(ticket.assigned_to, ele_lead)
        self.assertEqual(ticket.sub_department, ele_lab)

    def test_mismatched_team_and_department_rejected(self):
        SubDepartment.objects.create(department="ELE", name="Academic")
        academic_ele = SubDepartment.objects.get(department="ELE", name="Academic")
        resp = self.client.post("/api/tickets/", {
            "title": "x", "description": "d",
            "department": "COM", "sub_department": academic_ele.id,
        }, format="json")
        self.assertEqual(resp.status_code, 400)

    def test_unknown_category_rejected(self):
        resp = self.client.post("/api/tickets/", {
            "title": "x", "description": "d", "department": "COM",
            "category": "Nonexistent",
        }, format="json")
        self.assertEqual(resp.status_code, 400)

    def test_admin_created_ticket_also_routes_to_team_lead(self):
        admin = make_user("hodcom", User.Role.DEPT_ADMIN, "COM")
        client = APIClient()
        client.force_authenticate(admin)
        resp = client.post("/api/tickets/", {
            "title": "Admin ticket", "description": "desc",
            "department": "COM", "sub_department": self.lab.id,
            "category": "Lab Equipment",
        }, format="json")
        self.assertEqual(resp.status_code, 201, resp.content)
        ticket = Ticket.objects.get(id=resp.data["id"])
        self.assertEqual(ticket.assigned_to, self.lab_lead)


class RoutingFallbackTests(RoutingTestBase):
    def test_no_team_falls_back_to_hod(self):
        hod = make_user("hod.com", User.Role.DEPT_ADMIN, "COM")
        ticket = self.create_ticket()
        self.assertEqual(ticket.assigned_to, hod)
        self.assertIsNone(ticket.sub_department_id)

    def test_team_without_lead_falls_back_to_hod(self):
        hod = make_user("hod.com2", User.Role.DEPT_ADMIN, "COM")
        team = SubDepartment.objects.create(department="COM", name="Orphan")
        ticket = self.create_ticket(sub_department=team.id)
        self.assertEqual(ticket.assigned_to, hod)

    def test_no_hod_anywhere_falls_back_to_campus_admin(self):
        ticket = self.create_ticket(title="orphan")
        self.assertEqual(ticket.assigned_to, self.campus_admin)

    def test_no_dept_no_team_goes_to_campus_admin(self):
        payload = {"title": "bare", "description": "d"}
        resp = self.client.post("/api/tickets/", payload, format="json")
        self.assertEqual(resp.status_code, 201, resp.content)
        ticket = Ticket.objects.get(id=resp.data["id"])
        self.assertEqual(ticket.assigned_to, self.campus_admin)


class DynamicCatalogTests(RoutingTestBase):
    def test_departments_listed_for_all_authenticated_users(self):
        resp = self.client.get("/api/auth/departments/")
        self.assertEqual(resp.status_code, 200)
        codes = {d["code"] for d in resp.data["results"] if isinstance(resp.data, dict)} \
            if isinstance(resp.data, dict) else {d["code"] for d in resp.data}
        self.assertIn("COM", codes)

    def test_student_cannot_create_department(self):
        resp = self.client.post("/api/auth/departments/", {
            "code": "XYZ", "name": "New Dept",
        }, format="json")
        self.assertEqual(resp.status_code, 403)

    def test_admin_creates_and_updates_department(self):
        client = APIClient()
        client.force_authenticate(self.campus_admin)
        resp = client.post("/api/auth/departments/", {
            "code": "xyz", "name": "X-ray Yard",
        }, format="json")
        self.assertEqual(resp.status_code, 201, resp.content)
        self.assertEqual(resp.data["code"], "XYZ")  # upper-cased
        dep_id = resp.data["id"]
        resp = client.patch(f"/api/auth/departments/{dep_id}/", {"name": "Renamed"}, format="json")
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(Department.objects.filter(code="XYZ", name="Renamed").exists())

    def test_categories_crud_by_admin_only(self):
        client = APIClient()
        client.force_authenticate(self.campus_admin)
        resp = client.post("/api/tickets/categories/", {
            "name": "Sports", "sla_response_hours": 12, "sla_resolution_hours": 48,
        }, format="json")
        self.assertEqual(resp.status_code, 201, resp.content)
        cat_id = resp.data["id"]
        resp = client.patch(f"/api/tickets/categories/{cat_id}/", {"sla_resolution_hours": 96}, format="json")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(TicketCategory.objects.get(id=cat_id).sla_resolution_hours, 96)

        student_client = self.client
        r = student_client.post("/api/tickets/categories/", {"name": "Nope"}, format="json")
        self.assertEqual(r.status_code, 403)
        r = student_client.delete(f"/api/tickets/categories/{cat_id}/")
        self.assertEqual(r.status_code, 403)
