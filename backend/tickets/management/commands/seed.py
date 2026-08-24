from django.core.management.base import BaseCommand
from accounts.models import Department, SubDepartment, User
from tickets.models import TicketCategory

# Legacy default departments (now DB rows - admin can add more).
DEPARTMENTS = [
    ("CIV", "Civil Engineering"),
    ("ELE", "Electrical Engineering"),
    ("COM", "Computer Engineering"),
    ("MEC", "Mechanical Engineering"),
    ("ARC", "Architecture"),
    ("APP", "Applied Sciences"),
    ("CIT", "IT Support"),
    ("FIN", "Finance"),
    ("ACA", "Academic Affairs"),
    ("LIB", "Library"),
    ("FAC", "Facilities"),
]

# Default categories (SLA hours only - routing is department/team driven).
CATEGORIES = [
    {"name": "Lab Equipment", "description": "Lab hardware, equipment, projector issues"},
    {"name": "Classroom", "description": "Classroom, teaching aid, whiteboard issues"},
    {"name": "Network / Internet", "description": "Campus internet, WiFi, network issues"},
    {"name": "Financial / Fees", "description": "Payments, scholarships, refunds, fees"},
    {"name": "Academic", "description": "Grades, registration, transcripts, exams"},
    {"name": "Library", "description": "Library services, book issues"},
    {"name": "Hostel / Facilities", "description": "Hostel, accommodation, maintenance"},
    {"name": "General / Other", "description": "Other issues"},
]


class Command(BaseCommand):
    help = "Seed the database with initial data"

    def add_arguments(self, parser):
        parser.add_argument(
            "--password",
            default="pass@123",
            help="Password assigned to every seeded user (default: pass@123)",
        )

    def handle(self, *args, **options):
        from django.contrib.auth import get_user_model

        password = options["password"]
        User = get_user_model()

        credentials = []

        # Departments + categories are dynamic now: seed sensible defaults.
        for code, name in DEPARTMENTS:
            Department.objects.get_or_create(code=code, defaults={"name": name})
        for cat in CATEGORIES:
            TicketCategory.objects.get_or_create(name=cat["name"], defaults=cat)

        # Teams (sub-departments) must exist before users can join them:
        # Lab / Academic inside academic departments, a single specialty
        # team inside the routed departments.
        teams = [
            ("Lab", "COM"), ("Academic", "COM"),
            ("Lab", "ELE"), ("Academic", "ELE"),
            ("IT", "CIT"), ("Finance", "FIN"),
            ("Academic Affairs", "ACA"), ("Library", "LIB"),
            ("Facilities", "FAC"),
        ]
        for name, dept in teams:
            SubDepartment.objects.get_or_create(
                department=dept, name=name,
                defaults={"description": f"{name} team of {dept}"},
            )

        if not User.objects.filter(username='admin').exists():
            User.objects.create_superuser('admin', 'admin@pulchowk.edu', password)
            credentials.append(("admin", password))
        admin = User.objects.get(username='admin')
        admin.role = User.Role.CAMPUS_ADMIN
        # Keep the seeded admin's password in sync on every run so the
        # documented credentials always work.
        admin.set_password(password)
        admin.save()

        # (username, first, last, role, department, section, team)
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
            # Team leads (level 1) - one per routed team
            ('lead.com.lab', 'Sanjay', 'Karki', User.Role.TEAM_LEAD, 'COM', '', 'Lab'),
            ('lead.com.academic', 'Sunita', 'Basnet', User.Role.TEAM_LEAD, 'COM', '', 'Academic'),
            ('lead.ele.lab', 'Dipesh', 'Tamang', User.Role.TEAM_LEAD, 'ELE', '', 'Lab'),
            ('lead.ele.academic', 'Rekha', 'Sah', User.Role.TEAM_LEAD, 'ELE', '', 'Academic'),
            ('lead.cit.it', 'Nabin', 'Chaudhary', User.Role.TEAM_LEAD, 'CIT', '', 'IT'),
            ('lead.fin.finance', 'Sabita', 'Acharya', User.Role.TEAM_LEAD, 'FIN', '', 'Finance'),
            ('lead.aca.affairs', 'Deepak', 'Joshi', User.Role.TEAM_LEAD, 'ACA', '', 'Academic Affairs'),
            ('lead.lib.library', 'Sarita', 'Rana', User.Role.TEAM_LEAD, 'LIB', '', 'Library'),
            ('lead.fac.facilities', 'Manoj', 'Dahal', User.Role.TEAM_LEAD, 'FAC', '', 'Facilities'),
            # Staff (all level 0) - assigned into their teams
            ('staff.cit1', 'Ram', 'Thapa', User.Role.STAFF, 'CIT', '', 'IT'),
            ('staff.cit2', 'Sita', 'Poudel', User.Role.STAFF, 'CIT', '', 'IT'),
            ('staff.com1', 'Anil', 'Gurung', User.Role.STAFF, 'COM', '', 'Lab'),
            ('staff.com2', 'Binita', 'Khadka', User.Role.STAFF, 'COM', '', 'Academic'),
            ('staff.ele1', 'Deepak', 'Rai', User.Role.STAFF, 'ELE', '', 'Lab'),
            ('z', 'Nita', 'Sharma', User.Role.STAFF, 'FIN', '', 'Finance'),
            ('staff.aca1', 'Sagar', 'Bhandari', User.Role.STAFF, 'ACA', '', 'Academic Affairs'),
            ('staff.lib1', 'Mina', 'Poudel', User.Role.STAFF, 'LIB', '', 'Library'),
            ('staff.fac1', 'Bikram', 'Singh', User.Role.STAFF, 'FAC', '', 'Facilities'),
        ]

        for uname, first, last, role, dept, section, team in users:
            u, created = User.objects.get_or_create(username=uname)
            u.first_name = first
            u.last_name = last
            u.role = role
            u.department = dept
            u.section = section or None
            if team:
                u.sub_department = SubDepartment.objects.get(department=dept, name=team)
            else:
                u.sub_department = None
            if created:
                credentials.append((uname, password))
            u.set_password(password)
            u.save()

        # Assign team leads to their teams.
        lead_lookup = {
            ("COM", "Lab"): "lead.com.lab",
            ("COM", "Academic"): "lead.com.academic",
            ("ELE", "Lab"): "lead.ele.lab",
            ("ELE", "Academic"): "lead.ele.academic",
            ("CIT", "IT"): "lead.cit.it",
            ("FIN", "Finance"): "lead.fin.finance",
            ("ACA", "Academic Affairs"): "lead.aca.affairs",
            ("LIB", "Library"): "lead.lib.library",
            ("FAC", "Facilities"): "lead.fac.facilities",
        }
        for (dept, name), lead_username in lead_lookup.items():
            team_obj = SubDepartment.objects.filter(department=dept, name=name).first()
            if not team_obj:
                continue
            team_obj.lead = User.objects.filter(username=lead_username).first()
            team_obj.save()

        self.stdout.write(self.style.SUCCESS("Seed complete!"))
        self.stdout.write(f"Users: {User.objects.count()}")
        self.stdout.write(f"Departments: {Department.objects.count()}\nTeams: {SubDepartment.objects.count()}")
        self.stdout.write(f"Categories: {TicketCategory.objects.count()}")
        self.stdout.write("")
        self.stdout.write(f"All users share the password: {password}")
        if credentials:
            self.stdout.write(self.style.WARNING("Newly created users:"))
            for username, pwd in credentials:
                self.stdout.write(f"  {username}: {pwd}")
