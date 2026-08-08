from django.core.management.base import BaseCommand
from accounts.models import User
from tickets.categories import CATEGORY_NAMES
import secrets


def random_password():
    return secrets.token_urlsafe(12)


class Command(BaseCommand):
    help = "Seed the database with initial data"

    def handle(self, *args, **options):
        from django.contrib.auth import get_user_model
        User = get_user_model()

        credentials = []

        if not User.objects.filter(username='admin').exists():
            admin_pw = random_password()
            User.objects.create_superuser('admin', 'admin@pulchowk.edu', admin_pw)
            credentials.append(("admin", admin_pw))
        admin = User.objects.get(username='admin')
        admin.role = User.Role.CAMPUS_ADMIN
        admin.save()

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
            if role == User.Role.STAFF:
                u.level = 1 if u.level not in (1, 2) else u.level
            elif role == User.Role.DEPT_ADMIN:
                u.level = 3
            password = random_password()
            u.set_password(password)
            u.save()
            credentials.append((uname, password))

        self.stdout.write(self.style.SUCCESS("Seed complete!"))
        self.stdout.write(f"Users: {User.objects.count()}")
        self.stdout.write(f"Hardcoded categories: {len(CATEGORY_NAMES)}")
        self.stdout.write("")
        self.stdout.write(self.style.WARNING("Generated credentials (save these):"))
        for username, password in credentials:
            self.stdout.write(f"  {username}: {password}")
