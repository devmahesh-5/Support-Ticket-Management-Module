import io
import tempfile

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from accounts.models import User
from .models import Attachment, Category, Ticket
from .serializers import MAX_ATTACHMENT_SIZE


@override_settings(MEDIA_ROOT=tempfile.mkdtemp(prefix="stm_test_media_"))
class AttachmentAPITests(TestCase):
    def setUp(self):
        self.student = User.objects.create_user(
            username="student1", password="pass", role=User.Role.STUDENT,
            department=User.Department.COMPUTER,
        )
        self.other_student = User.objects.create_user(
            username="student2", password="pass", role=User.Role.STUDENT,
            department=User.Department.COMPUTER,
        )
        self.staff = User.objects.create_user(
            username="staff1", password="pass", role=User.Role.STAFF,
            department=User.Department.COMPUTER,
        )
        self.campus_admin = User.objects.create_user(
            username="admin1", password="pass", role=User.Role.CAMPUS_ADMIN,
        )
        self.category = Category.objects.create(name="Network / Internet")

        self.ticket = Ticket.objects.create(
            title="Test ticket",
            description="Description",
            category=self.category,
            created_by=self.student,
            department=User.Department.COMPUTER,
        )

        self.client = APIClient()
        self.client.force_authenticate(self.student)

    def upload(self, filename, content=b"attachment-content", as_user=None):
        client = APIClient()
        client.force_authenticate(as_user or self.student)
        return client.post(
            f"/api/tickets/{self.ticket.id}/upload_attachment/",
            {"file": SimpleUploadedFile(filename, content)},
            format="multipart",
        )

    def test_upload_creates_attachment(self):
        resp = self.upload("note.txt", b"hello")
        self.assertEqual(resp.status_code, 201, resp.content)
        self.assertEqual(len(resp.data), 1)
        data = resp.data[0]
        self.assertEqual(data["filename"], "note.txt")
        self.assertEqual(data["uploaded_by"], self.student.id)
        self.assertTrue(data["file_url"])
        self.assertEqual(data["file_size"], 5)
        self.assertEqual(Attachment.objects.count(), 1)
        self.assertEqual(Attachment.objects.first().ticket, self.ticket)

    def test_upload_invalid_extension_rejected(self):
        resp = self.upload("malware.exe", b"boom")
        self.assertEqual(resp.status_code, 400)
        self.assertIn("File type not allowed", str(resp.content))
        self.assertEqual(Attachment.objects.count(), 0)

    def test_upload_oversized_file_rejected(self):
        resp = self.upload("big.pdf", b"x" * (MAX_ATTACHMENT_SIZE + 1))
        self.assertEqual(resp.status_code, 400)
        self.assertIn("MB limit", str(resp.content))
        self.assertEqual(Attachment.objects.count(), 0)

    def test_upload_without_file_rejected(self):
        resp = self.client.post(
            f"/api/tickets/{self.ticket.id}/upload_attachment/", {}, format="multipart"
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn("No file provided", str(resp.content))

    def test_unauthenticated_upload_rejected(self):
        client = APIClient()
        resp = client.post(
            f"/api/tickets/{self.ticket.id}/upload_attachment/",
            {"file": SimpleUploadedFile("a.txt", b"x")},
            format="multipart",
        )
        self.assertEqual(resp.status_code, 403)

    def test_unauthorized_user_cannot_upload_to_other_ticket(self):
        resp = self.upload("a.txt", b"x", as_user=self.other_student)
        self.assertEqual(resp.status_code, 404)
        self.assertEqual(Attachment.objects.count(), 0)

    def test_attachment_listed_in_ticket_detail(self):
        self.upload("note.txt", b"hello")
        resp = self.client.get(f"/api/tickets/{self.ticket.id}/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data["attachments"]), 1)
        self.assertEqual(resp.data["attachments"][0]["filename"], "note.txt")
        self.assertTrue(resp.data["attachments"][0]["file_url"])

    def test_delete_by_uploader(self):
        self.upload("note.txt", b"hello")
        attachment = Attachment.objects.get()
        resp = self.client.delete(
            f"/api/tickets/{self.ticket.id}/delete_attachment/",
            {"attachment_id": attachment.id},
        )
        self.assertEqual(resp.status_code, 204)
        self.assertEqual(self.ticket.attachments.count(), 0)

    def test_delete_by_non_uploader_student_forbidden(self):
        self.ticket.assigned_to = self.staff
        self.ticket.save()
        self.upload("note.txt", b"hello", as_user=self.staff)
        attachment = Attachment.objects.get()
        resp = self.client.delete(
            f"/api/tickets/{self.ticket.id}/delete_attachment/",
            {"attachment_id": attachment.id},
        )
        self.assertEqual(resp.status_code, 403)
        self.assertEqual(self.ticket.attachments.count(), 1)

    def test_delete_missing_attachment_id(self):
        resp = self.client.delete(
            f"/api/tickets/{self.ticket.id}/delete_attachment/", {}
        )
        self.assertEqual(resp.status_code, 400)

    def test_upload_multiple_attachments(self):
        resp = self.client.post(
            f"/api/tickets/{self.ticket.id}/upload_attachment/",
            {"file": [
                SimpleUploadedFile("a.txt", b"aaa"),
                SimpleUploadedFile("b.png", b"bbb"),
                SimpleUploadedFile("c.pdf", b"ccc"),
            ]},
            format="multipart",
        )
        self.assertEqual(resp.status_code, 201, resp.content)
        self.assertEqual(len(resp.data), 3)
        self.assertEqual(self.ticket.attachments.count(), 3)
        self.assertEqual(
            {a["filename"] for a in resp.data}, {"a.txt", "b.png", "c.pdf"}
        )

    def test_upload_multiple_rejects_all_if_one_invalid(self):
        resp = self.client.post(
            f"/api/tickets/{self.ticket.id}/upload_attachment/",
            {"file": [
                SimpleUploadedFile("ok.txt", b"aaa"),
                SimpleUploadedFile("bad.exe", b"bbb"),
            ]},
            format="multipart",
        )
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(self.ticket.attachments.count(), 0)

    def test_attachment_metadata_and_storage(self):
        resp = self.upload("report.pdf", b"%PDF-1.4 fake pdf")
        self.assertEqual(resp.status_code, 201, resp.content)
        att = Attachment.objects.get()
        self.assertEqual(att.ticket, self.ticket)
        self.assertEqual(att.filename, "report.pdf")
        self.assertEqual(att.uploaded_by, self.student)
        self.assertIsNotNone(att.uploaded_at)
        self.assertTrue(att.file.name.startswith("tickets/attachments/"))
        self.assertTrue(att.file.storage.exists(att.file.name))
        self.assertEqual(att.file.read(), b"%PDF-1.4 fake pdf")
        self.assertEqual(att.file.size, len(b"%PDF-1.4 fake pdf"))

    def test_existing_ticket_update_still_works(self):
        resp = self.client.patch(
            f"/api/tickets/{self.ticket.id}/",
            {"title": "Updated title"},
            format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        self.ticket.refresh_from_db()
        self.assertEqual(self.ticket.title, "Updated title")

    def test_escalation_and_notification_still_work(self):
        from notifications.models import Notification

        resp = self.client.post(f"/api/tickets/{self.ticket.id}/escalate/")
        self.assertEqual(resp.status_code, 200, resp.content)
        self.ticket.refresh_from_db()
        self.assertGreaterEqual(self.ticket.escalation_level, 1)
        self.assertEqual(self.ticket.status, Ticket.Status.ESCALATED_L1)
        self.assertGreaterEqual(
            Notification.objects.filter(
                ticket=self.ticket, notification_type="ESCALATION"
            ).count(),
            1,
        )

