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
            'Lab Equipment': 'Lab hardware, equipment, projector issues',
            'Classroom': 'Classroom, teaching aid, whiteboard issues',
            'Network / Internet': 'Campus internet, WiFi, network issues',
            'Academic': 'Grades, registration, transcripts, exams',
            'Financial / Fees': 'Payments, scholarships, refunds, fees',
            'Library': 'Library services, book issues',
            'Hostel / Facilities': 'Hostel, accommodation, maintenance',
            'General / Other': 'Other issues',
        }
        cat_objs = {}
        for name, desc in categories.items():
            c, _ = Category.objects.get_or_create(name=name, defaults={'description': desc})
            cat_objs[name] = c

        users = [
            ('080bct045', 'Mahesh', 'Bhandari', User.Role.STUDENT, 'COM', 'BCT', None),
            ('080bct001', 'Kushal', 'Gautam', User.Role.STUDENT, 'COM', 'BCT', None),
            ('080bct010', 'Lav Raj', 'Karn', User.Role.CR, 'COM', 'BCT', None),
            ('080bct020', 'Mission', 'Baraily', User.Role.STUDENT, 'COM', 'BCT', None),
            ('080bel001', 'Alisha', 'Rai', User.Role.STUDENT, 'ELE', 'BEL', None),
            ('hod.computer', 'Dr. Hari', 'Sharma', User.Role.DEPT_ADMIN, 'COM', '', None),
            ('hod.electrical', 'Dr. Rajesh', 'KC', User.Role.DEPT_ADMIN, 'ELE', '', None),
            ('hod.cit', 'Sujan', 'Shrestha', User.Role.DEPT_ADMIN, 'CIT', '', None),
            ('hod.finance', 'Ramesh', 'Adhikari', User.Role.DEPT_ADMIN, 'FIN', '', None),
            ('hod.academic', 'Prakash', 'Neupane', User.Role.DEPT_ADMIN, 'ACA', '', None),
            ('hod.library', 'Gita', 'Sharma', User.Role.DEPT_ADMIN, 'LIB', '', None),
            ('hod.facilities', 'Krishna', 'Thapa', User.Role.DEPT_ADMIN, 'FAC', '', None),
            ('staff.cit1', 'Ram', 'Thapa', User.Role.STAFF, 'CIT', '', User.StaffType.IT),
            ('staff.cit2', 'Sita', 'Poudel', User.Role.STAFF, 'CIT', '', User.StaffType.IT),
            ('staff.com1', 'Anil', 'Gurung', User.Role.STAFF, 'COM', '', User.StaffType.LAB),
            ('staff.com2', 'Binita', 'Khadka', User.Role.STAFF, 'COM', '', User.StaffType.TEACHER),
            ('staff.ele1', 'Deepak', 'Rai', User.Role.STAFF, 'ELE', '', User.StaffType.LAB),
            ('z', 'Nita', 'Sharma', User.Role.STAFF, 'FIN', '', User.StaffType.FINANCE),
            ('staff.aca1', 'Sagar', 'Bhandari', User.Role.STAFF, 'ACA', '', User.StaffType.ACADEMIC),
            ('staff.lib1', 'Mina', 'Poudel', User.Role.STAFF, 'LIB', '', User.StaffType.LIBRARY),
            ('staff.fac1', 'Bikram', 'Singh', User.Role.STAFF, 'FAC', '', User.StaffType.FACILITIES),
        ]

        for uname, first, last, role, dept, section, staff_type in users:
            u, created = User.objects.get_or_create(username=uname)
            u.first_name = first
            u.last_name = last
            u.role = role
            u.department = dept
            u.staff_type = staff_type
            u.section = section or None
            u.set_password('pass@123')
            u.save()

        rules = [
            (cat_objs['Lab Equipment'],       'SELF', 1),
            (cat_objs['Classroom'],           'SELF', 2),
            (cat_objs['Network / Internet'],  'CIT',  3),
            (cat_objs['Financial / Fees'],    'FIN',  4),
            (cat_objs['Academic'],            'ACA',  5),
            (cat_objs['Library'],             'LIB',  6),
            (cat_objs['Hostel / Facilities'], 'FAC',  7),
            (cat_objs['General / Other'],     'HOD',  8),
        ]
        for category, target_dept, priority in rules:
            rule, _ = RoutingRule.objects.get_or_create(
                category=category,
                defaults={
                    'target_department': target_dept,
                    'priority': priority,
                    'is_active': True,
                }
            )
            rule.target_department = target_dept
            rule.priority = priority
            rule.is_active = True
            rule.save()

        self.stdout.write(self.style.SUCCESS("Seed complete!"))
        self.stdout.write(f"Users: {User.objects.count()}")
        self.stdout.write(f"Categories: {Category.objects.count()}")
        self.stdout.write(f"Routing rules: {RoutingRule.objects.count()}")
