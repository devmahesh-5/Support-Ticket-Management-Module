# Support Ticket Management Module

Web-based support ticket system for **Pulchowk Engineering Campus** built with **Django REST Framework** + **React** + **PostgreSQL**.

SRS Reference: `SRS_Support_Ticket_System_v1.2.pdf`

## Features

- Ticket creation with categories, priority, file attachments
- Auto-routing based on category rules
- Role-based access: Student, CR, Staff, HOD, Campus Admin
- Chat-like thread view with internal notes for staff
- In-app + email notifications
- Multi-level escalation: Staff → HOD → Campus Admin
- Dashboard with stats, SLA deadlines, staff metrics
- Admin panel: users, categories, routing rules
- Full-text search, filtering, sorting
- CR class-level tickets

---

## Step-by-Step Setup

### Prerequisites

- Python 3.10+
- Node.js 18+
- PostgreSQL running (verify: `pg_isready`)

### Step 1: Database Setup

PostgreSQL is already running. Create the schema:

```bash
psql -U mahes -d minor_project -c "CREATE SCHEMA IF NOT EXISTS ticket_system;"
```

### Step 2: Backend Setup

```bash
cd backend
```

Activate virtual environment (choose one):

```bash
# If venv already exists:
source ../venv/bin/activate

# Or create new one:
python -m venv venv
source venv/bin/activate
```

Install dependencies:

```bash
pip install -r requirements.txt
```

Run database migrations:

```bash
python manage.py migrate
```

### Step 3: Seed Data

Run this to create admin, staff, students, categories, and routing rules:

```bash
python manage.py seed
```

Or do it manually:

```bash
DJANGO_SUPERUSER_PASSWORD=pass@123 python manage.py createsuperuser \
  --username admin --email admin@pulchowk.edu --noinput
```

Then run the Python seed script from the project root:

```bash
cd ..
python -c "
import django, os
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
import sys; sys.path.insert(0, 'backend')
django.setup()
from accounts.models import User
from tickets.models import Category, RoutingRule

admin = User.objects.get(username='admin')
admin.role = User.Role.CAMPUS_ADMIN; admin.save()

for name, desc in {
    'Internet / Network': 'Campus internet, WiFi, network issues',
    'Hardware / Lab Equipment': 'Lab hardware, projector, printer issues',
    'Academic': 'Grades, registration, transcripts, exams',
    'Financial / Fees': 'Payments, scholarships, refunds, fees',
    'Department-specific': 'Department-related issues',
    'Library': 'Library services, book issues',
    'Hostel / Facilities': 'Hostel, accommodation, maintenance',
    'General / Other': 'Other issues',
}.items():
    Category.objects.get_or_create(name=name, defaults={'description': desc})

users = [
    ('080bct045', 'Mahesh', 'Bhandari', User.Role.STUDENT, 'COM', 'BCT'),
    ('080bct001', 'Kushal', 'Gautam', User.Role.STUDENT, 'COM', 'BCT'),
    ('080bct010', 'Lav Raj', 'Karn', User.Role.CR, 'COM', 'BCT'),
    ('080bct020', 'Mission', 'Baraily', User.Role.STUDENT, 'COM', 'BCT'),
    ('hod.computer', 'Dr. Hari', 'Sharma', User.Role.DEPT_ADMIN, 'COM', ''),
    ('staff.cit1', 'Ram', 'Thapa', User.Role.STAFF, 'COM', ''),
    ('staff.cit2', 'Sita', 'Poudel', User.Role.STAFF, 'COM', ''),
    ('hod.electrical', 'Dr. Rajesh', 'KC', User.Role.DEPT_ADMIN, 'ELE', ''),
    ('080bel001', 'Alisha', 'Rai', User.Role.STUDENT, 'ELE', 'BEL'),
]

for uname, first, last, role, dept, section in users:
    u, _ = User.objects.get_or_create(username=uname)
    u.first_name = first; u.last_name = last; u.role = role
    u.department = dept; u.section = section or None
    u.set_password('pass@123'); u.save()

internet = Category.objects.get(name='Internet / Network')
academic = Category.objects.get(name='Academic')
finance = Category.objects.get(name='Financial / Fees')
RoutingRule.objects.get_or_create(category=internet, defaults={'target_department': 'CIT', 'priority': 1, 'is_active': True})
RoutingRule.objects.get_or_create(category=academic, defaults={'target_department': 'ACADEMIC', 'priority': 2, 'is_active': True})
RoutingRule.objects.get_or_create(category=finance, defaults={'target_department': 'FINANCE', 'priority': 3, 'is_active': True})
print('Seed complete')
"
```

### Step 4: Run Backend Server

```bash
cd backend
source ../venv/bin/activate
python manage.py runserver 0.0.0.0:8000
```

Backend API will be available at **http://localhost:8000/api/**

### Step 5: Run Frontend (separate terminal)

```bash
cd frontend
npm install
npm start
```

Frontend UI will be available at **http://localhost:3000**

---

## Credentials

All passwords: **`pass@123`**

| Role          | Username         | Department |
| ------------- | ---------------- | ---------- |
| Campus Admin  | `admin`          | -          |
| HOD           | `hod.computer`   | Computer   |
| HOD           | `hod.electrical` | Electrical |
| Staff         | `staff.cit1`     | Computer   |
| Staff         | `staff.cit2`     | Computer   |
| CR            | `080bct010`      | Computer   |
| Student       | `080bct045`      | Computer   |
| Student       | `080bct001`      | Computer   |
| Student       | `080bct020`      | Computer   |
| Student       | `080bel001`      | Electrical |

---

## Key API Endpoints

| Method | Endpoint                             | Description        |
| ------ | ------------------------------------ | ------------------ |
| POST   | `/api/auth/login/`                   | Login              |
| GET    | `/api/auth/me/`                      | Current user       |
| GET    | `/api/tickets/`                      | List tickets       |
| POST   | `/api/tickets/`                      | Create ticket      |
| GET    | `/api/tickets/{id}/`                 | Ticket detail      |
| POST   | `/api/tickets/{id}/add_message/`     | Add reply/note     |
| POST   | `/api/tickets/{id}/change_status/`   | Change status      |
| POST   | `/api/tickets/{id}/reassign/`        | Reassign           |
| POST   | `/api/tickets/{id}/escalate/`        | Escalate           |
| GET    | `/api/tickets/dashboard/`            | Dashboard          |
| GET    | `/api/tickets/stats/`                | Statistics         |
| GET    | `/api/notifications/`                | Notifications      |

---

## Project Structure

```
├── backend/
│   ├── config/           # Django settings, urls, wsgi
│   ├── accounts/         # Custom User model, auth views
│   ├── tickets/          # Core: models, views, routing, serializers
│   ├── notifications/    # Notifications & templates
│   └── manage.py
├── frontend/
│   ├── src/
│   │   ├── api/          # Axios API client
│   │   ├── components/   # Dashboard, TicketList, TicketDetail, etc.
│   │   └── contexts/     # Auth context
│   └── public/
├── venv/                 # Python virtual environment
└── README.md
```
