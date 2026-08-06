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

## User Stories — SLA & Escalation Walkthrough

This section walks through the system from each user's point of view: what happens, when it happens, and how. It covers every case a ticket can go through — creation, working, SLA breach, escalation, and resolution.

### The building blocks

**Support levels** — every ticket has an escalation level `0 → 1 → 2 → 3`:

| Level | Status shown | Who | How a ticket gets here |
| ----- | ------------ | --- | ---------------------- |
| 0 | *Open* | L1 staff | New ticket routing |
| 1 | *Escalated L1* | L1 staff | Manual escalation |
| 2 | *Escalated L2* | L2 staff | SLA breach (auto) or manual |
| 3 | *Admin Review* | Department HOD | Manual escalation, or fallback from lower levels |

**The SLA clock** — every category has *response* and *resolution* hours. The clock **starts the moment a ticket is created** and **stops when the assigned staff clicks "Start Working"** (status becomes *In Progress*), which also records the first response. While a ticket is *In Progress* it is no longer tracked by the SLA engine.

**Who can do what**

| Action | Student / CR | Staff | HOD | Campus Admin |
| ------ | :---: | :---: | :---: | :---: |
| Create ticket | Yes | Yes | Yes | Yes |
| Reply on thread | Yes | Yes | Yes | Yes |
| Start Working | — | Yes | Yes | Yes |
| Manually escalate | Yes | Yes | Yes | Yes |
| De-escalate | — | — | Yes (if enabled) | Yes (if enabled) |
| Assign / reassign | — | — | Yes | Yes |
| Configure policies & routing | — | — | Yes | Yes |

---

### Student (and CR)

**Case 1 — I create a ticket**

- I pick a **category** (e.g. *Lab Equipment*, *Classroom*, *Financial*), a **priority**, and write my description.
- The system looks up the category's routing rule: which **department** owns it and which **specialty** it needs (a *lab staff* member for Lab Equipment, a *teacher* for Classroom, etc.).
- It assigns the ticket to the **least-busy available L1 staff member in that department with that specialty** (fewest active tickets).
- My SLA clock starts immediately and I get a confirmation with the assigned staff member's name.

**Case 2 — No matching specialty exists when my ticket is created**

- The system **does not** fall back to "any random staff member". It skips straight to my **department HOD**, who assigns the right person manually. (Final fallback: Campus Admin.)

**Case 3 — The assigned staff starts working**

- The ticket shows *In Progress*. The staff member's first reply is recorded as the **first response** (my SLA response deadline is considered met), and the SLA clock stops while they work.

**Case 4 — I feel my ticket is stuck**

- I can click **Escalate** on the ticket. Each click raises the level one step: `0 → 1 → 2 → 3`. At each hop the ticket is reassigned — same specialty where possible, ending at the HOD at level 3. I cannot escalate a *Resolved* or *Closed* ticket.

**CR note** — a CR's tickets are automatically set to their **class department**, so class-wide issues go to the right department's queue from the start. Everything else works the same as a student.

---

### Staff (L1)

**Case 1 — A new ticket is routed to me**

- I see it in my **Assigned** list with a countdown to the SLA deadlines.
- At **50%** and **75%** of the SLA time, warning notifications are sent to me **and** my manager, so it doesn't silently slip.

**Case 2 — I start working on it**

- I click **Start Working**. The status becomes *In Progress* and my reply is stamped as the **first response**.
- From this moment the SLA engine leaves the ticket alone — I'm actively handling it, so it can't be auto-escalated out from under me.

**Case 3 — I miss the response or resolution deadline**

- The ticket's policy triggers. With **auto-escalate ON**, the ticket is raised to the policy's `to_level` (e.g. level 2) and reassigned — the notification tells me it left my queue.
- With **auto-escalate OFF**, the ticket is moved to the **Escalation Queue** but stays assigned to me until the HOD reassigns it.

---

### Staff (L2)

**Case 1 — An escalated ticket lands on me**

- I only receive tickets whose **specialty matches the category** — a lab ticket goes to an L2 *lab* staff member, never to a teacher. This holds for both automatic (SLA breach) and manual escalation.
- The same SLA warnings apply to me, and the same "Start Working" behavior stops the clock.

**Case 2 — No L2 staff with my specialty exists when a ticket escalates**

- The system **never** assigns the ticket to a wrong-specialty L2 colleague. It escalates the ticket (level is raised, status becomes *Escalated L2*) and hands it to the **department HOD** to assign.

---

### HOD (Department Head)

**Case 1 — The Escalation Queue has breached tickets (auto-escalate OFF)**

- Breached tickets whose policy has **auto-escalate OFF** land in the **Escalation Queue** inbox on the SLA Dashboard.
- I open each one and **assign it to the right staff member**; the ticket is then raised to level 3 (*Admin Review*) under my name.

**Case 2 — A ticket escalated but no matching staff was found**

- The ticket comes to me directly (level raised, status *Escalated L2*). I see it in my Assigned list and hand it to the correct person.

**Case 3 — Someone escalates a ticket all the way to me**

- At level 3 the ticket becomes *Admin Review* and is assigned to me (or the Campus Admin if my department has no HOD).

**Case 4 — I want to send a ticket back down**

- I can **de-escalate** (if two-way escalation is enabled): the level drops by one and the status goes back to *Escalated L1* (level 1) or *In Progress* (level 0).

---

### Campus Admin

**Case 1 — Final fallback**

- If a ticket has no matching staff **and** no department HOD (e.g. an unstaffed department), routed and breached tickets land with me.

**Case 2 — Configuration**

- I manage everything behind the scenes: users and their roles/levels, categories and their SLA hours, routing rules (department + specialty per category), and **escalation policies** (see below).

---

### What happens in each case — quick reference

| Case | What happens | How |
| ---- | ------------ | --- |
| New ticket | Routed & assigned | Category → dept + specialty → least-busy available L1 staff |
| No matching staff at creation | Goes to HOD | HOD → Campus Admin (never "any staff") |
| Staff starts working | SLA stopped, first response recorded | Status → *In Progress* |
| 50% / 75% SLA time | Warnings sent | In-app/email to assigned staff + manager |
| Breach + policy **auto ON** | Auto-escalate | Level → policy's `to_level`, reassigned to same-specialty staff at that level; if none, HOD |
| Breach + policy **auto OFF** | Pushed to Escalation Queue | HOD assigns from SLA Dashboard |
| Manual escalation | Level +1 each click | `0 → 1 → 2 → 3`, same specialty per hop, ends at HOD |
| De-escalation | Level −1 | HOD/admin only, status back to *Escalated L1* / *In Progress* |
| Resolve / close | Ticket leaves SLA tracking | SLA engine no longer touches it |

### The full journey of a breached ticket (step by step)

1. Student creates a ticket → routed to L1 lab staff, SLA clock starts.
2. Warnings at 50% and 75% go to the staff member and the manager.
3. Deadline passes with no first response → the policy matches (department/category/priority):
   - **auto ON** → ticket raised to the policy's target level, assigned to the same-specialty staff at that level. If none exists, the HOD gets it.
   - **auto OFF** → ticket moved to the Escalation Queue.
4. Every action (policy applied, warning sent, breach, escalation, reassignment) is written to the ticket's **audit trail**, so the full history is visible.
5. Whoever ends up with the ticket clicks **Start Working**, replies (first response recorded), and works it to resolution.

### How escalation is configured (admin)

Escalation is **policy-driven**, not hardcoded. Each **Escalation Policy** sets:

- **Scope** — which department / category / priority it applies to (the most specific match wins)
- **From level → to level** — e.g. L1 → L2, or all the way to level 3
- **Auto-escalate** — ON: auto-assign on breach; OFF: push to the Escalation Queue for the HOD
- **Delay** — how long after the breach before it triggers (`escalation_delay_minutes`)
- **Warnings** — 50% / 75% (or custom) thresholds for the assigned staff and manager

Optional **Escalation Rules** (IF conditions / THEN actions) add extra triggers, e.g. escalate on no-activity hours, bump priority, notify, or assign a specific user or level.

The only hardcoded behavior is *who* receives the ticket: least-busy available staff at the target level **matching the category's specialty**, then the department HOD, then the Campus Admin.

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
