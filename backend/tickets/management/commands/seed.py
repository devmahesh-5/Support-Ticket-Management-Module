from django.core.management.base import BaseCommand
from accounts.models import User
from tickets.models import Category, RoutingRule


class Command(BaseCommand):
    help = "Seed the database with initial data"

    def handle(self, *args, **options):
        from django.contrib.auth import get_user_model
        User = get_user_model()

        if not User.objects.filter(username='admin').exists():
            User.objects.create_superuser('admin', 'admin@pulchowk.edu', 'pass@123')
        admin = User.objects.get(username='admin')
        admin.role = User.Role.CAMPUS_ADMIN
        admin.save()

        categories = {
            'Internet / Network': 'Campus internet, WiFi, network issues',
            'Hardware / Lab Equipment': 'Lab hardware, projector, printer issues',
            'Academic': 'Grades, registration, transcripts, exams',
            'Financial / Fees': 'Payments, scholarships, refunds, fees',
            'Department-specific': 'Department-related issues',
            'Library': 'Library services, book issues',
            'Hostel / Facilities': 'Hostel, accommodation, maintenance',
            'General / Other': 'Other issues',
        }
        for name, desc in categories.items():
            Category.objects.get_or_create(name=name, defaults={'description': desc})

        users = [
            ('080bct045', 'Mahesh', 'Bhandari', User.Role.STUDENT, 'COM', 'BCT'),
            ('080bct001', 'Kushal', 'Gautam', User.Role.STUDENT, 'COM', 'BCT'),
            ('080bct010', 'Lav Raj', 'Karn', User.Role.CR, 'COM', 'BCT'),
            ('080bct020', 'Mission', 'Baraily', User.Role.STUDENT, 'COM', 'BCT'),
            ('hod.computer', 'Dr. Hari', 'Sharma', User.Role.DEPT_ADMIN, 'COM', ''),
            ('hod.electrical', 'Dr. Rajesh', 'KC', User.Role.DEPT_ADMIN, 'ELE', ''),
            ('staff.cit1', 'Ram', 'Thapa', User.Role.STAFF, 'COM', ''),
            ('staff.cit2', 'Sita', 'Poudel', User.Role.STAFF, 'COM', ''),
            ('staff.ele1', 'Anil', 'Gurung', User.Role.STAFF, 'ELE', ''),
            ('080bel001', 'Alisha', 'Rai', User.Role.STUDENT, 'ELE', 'BEL'),
        ]

        for uname, first, last, role, dept, section in users:
            u, created = User.objects.get_or_create(username=uname)
            u.first_name = first
            u.last_name = last
            u.role = role
            u.department = dept
            u.section = section or None
            u.set_password('pass@123')
            u.save()

        internet = Category.objects.get(name='Internet / Network')
        academic = Category.objects.get(name='Academic')
        finance = Category.objects.get(name='Financial / Fees')
        RoutingRule.objects.get_or_create(category=internet, defaults={
            'target_department': 'CIT', 'priority': 1, 'is_active': True
        })
        RoutingRule.objects.get_or_create(category=academic, defaults={
            'target_department': 'ACADEMIC', 'priority': 2, 'is_active': True
        })
        RoutingRule.objects.get_or_create(category=finance, defaults={
            'target_department': 'FINANCE', 'priority': 3, 'is_active': True
        })

        self.stdout.write(self.style.SUCCESS("Seed complete!"))
        self.stdout.write(f"Users: {User.objects.count()}")
        self.stdout.write(f"Categories: {Category.objects.count()}")
        self.stdout.write(f"Routing rules: {RoutingRule.objects.count()}")
