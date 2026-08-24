# Support Ticket Management Module

Web-based support ticket system for **Pulchowk Engineering Campus** built with **Django REST Framework** + **React** + **PostgreSQL**.

SRS Reference: `SRS_Support_Ticket_System_v1.2.pdf`

## Features

- Ticket creation with categories, priority, file attachments
- Team-lead routing: every ticket goes to the responsible **team lead** (sub-department), who assigns it to their staff
- Role-based access: Student, CR, Staff, **Team Lead**, HOD, Campus Admin
- Chat-like thread view with internal notes for staff
- In-app + email notifications
- Multi-level escalation: Staff → Team Lead → HOD → Campus Admin
- Config-driven SLA engine (**django-apscheduler**) with admin-editable escalation policies & rules
- Dashboard with stats, SLA deadlines, staff metrics
- Admin panel: users, teams, categories, escalation rules
- Full-text search, filtering, sorting
- CR class-level tickets

---

## User Stories — SLA & Escalation Walkthrough

This section walks through the system from each user's point of view: what happens, when it happens, and how. It covers every case a ticket can go through — creation, working, SLA breach, escalation, and resolution.

### The building blocks

**Hierarchy & support levels** — departments contain **teams (sub-departments)** such as *Lab* or *Academic*, each headed by a **team lead**. Every ticket carries an escalation level `0 → 1 → 2 → 3`:

| Level | Status shown | Who | How a ticket gets here |
| ----- | ------------ | --- | ---------------------- |
| 0 | *In Progress* | Staff member | Assigned by their team lead |
| 1 | *Escalated L1* ("With Team Lead") | Team Lead | New-ticket routing, or escalation |
| 2 | *Escalated L2* ("With HOD") | Department HOD | Escalation policy — manual, or auto on SLA breach |
| 3 | *Admin Review* | Campus Admin | Final hop past the configured policies — auto on continued breach, or manual |

**Routing rule** — the category maps to a team (e.g. *Lab Equipment* → the department's **Lab** team; *Network / Internet* → CIT's **IT** team). The ticket lands on that team's **lead**, who assigns it to one of their staff members. There is **no automatic staff assignment anywhere**: not for students, and not even for admins creating tickets.

**The SLA clock** — every category has *response* and *resolution* hours. The clock **starts the moment a ticket is created** and **stops when the assigned handler clicks "Start Working"** (status becomes *In Progress*), which also records the first response. While a ticket is *In Progress* it is no longer tracked by the SLA engine.

**Who can do what**

| Action | Student / CR | Staff | Team Lead | HOD | Campus Admin |
| ------ | :---: | :---: | :---: | :---: | :---: |
| Create ticket | Yes | Yes | Yes | Yes | Yes |
| Reply on thread | Yes | Yes | Yes | Yes | Yes |
| Start Working | — | Yes | Yes | Yes | Yes |
| Manually escalate | — | — | Yes | Yes | Yes |
| De-escalate | — | — | — | Yes (if enabled) | Yes (if enabled) |
| Assign within own team | — | — | Yes | Yes | Yes |
| Reassign in own department | — | — | — | Yes | Yes |
| Reassign anywhere | — | — | — | — | Yes |
| Configure policies & rules | — | — | — | Read-only | Yes |

---

### Student (and CR)

**Case 1 — I create a ticket**

- I pick a **category** (e.g. *Lab Equipment*, *Classroom*, *Financial*), a **priority**, and write my description.
- The system resolves the category's **team** inside my department and assigns the ticket to that team's **team lead** — never directly to a staff member. Even admins who create tickets go through this same route.
- My SLA clock starts immediately and I get a confirmation.

**Case 2 — No team / no team lead exists for my category**

- The system skips straight to my **department HOD**, who handles or forwards it. (Final fallback: Campus Admin.)

**Case 3 — The assigned staff starts working**

- The ticket shows *In Progress*. The first reply is recorded as the **first response** (my SLA response deadline is considered met), and the SLA clock stops while they work.

**Case 4 — I feel my ticket is stuck**

- Support roles can escalate on my behalf. Each click raises the level one step: `0 → 1 → 2 → 3` — staff → team lead → HOD → **Campus Admin** (*Admin Review*).

**CR note** — a CR's tickets are automatically set to their **class department**, so class-wide issues go to the right department's queue from the start. Everything else works the same as a student.

---

### Staff

**Case 1 — A ticket is assigned to me**

- My **team lead** hands me the ticket; I see it in my **Assigned** list with a countdown to the SLA deadlines.
- At **50%** and **75%** of the SLA time, warning notifications are sent to me **and** my manager, so it doesn't silently slip.

**Case 2 — I start working on it**

- I click **Start Working**. The status becomes *In Progress* and my reply is stamped as the **first response**.
- From this moment the SLA engine leaves the ticket alone — I'm actively handling it, so it can't be auto-escalated out from under me.

**Case 3 — I miss the response or resolution deadline**

- The ticket's policy triggers. With **auto-escalate ON**, the ticket moves up to the next level (my **team lead**, then beyond) and is reassigned — the notification tells me it left my queue.
- With **auto-escalate OFF**, the ticket is moved to the **Escalation Queue** until the team lead/HOD reassigns it.

---

### Team Lead

**Case 1 — New tickets arrive in my queue**

- Tickets whose category maps to my team land **assigned to me** first. I triage them and use **Assign** to hand each one to a member of **my own team** — the system blocks me from assigning outside my team.
- My "My team" filter shows everything currently held by my members so I keep oversight.

**Case 2 — A ticket escalates to me**

- Breached tickets owned by my staff come back to me automatically (status *With Team Lead*). If I can't fix it either, escalating raises it to the **HOD**.

---

### HOD (Department Head)

**Case 1 — The Escalation Queue has breached tickets (auto-escalate OFF)**

- Breached tickets whose policy has **auto-escalate OFF** land in the **Escalation Queue** inbox on the SLA Dashboard.
- I open each one and **assign it to the right person** in my department.

**Case 2 — A ticket escalates to me**

- The ticket comes to me directly from a team lead (level raised, status *With HOD*). I see it in my Assigned list and handle it or reassign within my department.

**Case 3 — Someone escalates a ticket all the way to the top**

- At level 3 the ticket becomes *Admin Review* and is assigned to the **Campus Admin**.

**Case 4 — I want to send a ticket back down**

- I can **de-escalate** (if two-way escalation is enabled): the level drops by one — back to the team lead, then to a team member.

---

### Campus Admin

**Case 1 — Final fallback**

- If a ticket has no team, no lead **and** no department HOD (e.g. an unstaffed department), routed and breached tickets land with me.

**Case 2 — Configuration**

- I manage everything behind the scenes: users, teams and their **team leads**, categories and their SLA hours, and **escalation policies/rules** (only the campus admin can change these — see below).

---

### What happens in each case — quick reference

| Case | What happens | How |
| ---- | ------------ | --- |
| New ticket | Routed to the team lead | Category → team → lead (never direct-to-staff) |
| No team / no lead at creation | Goes to HOD | HOD → Campus Admin |
| Team lead assigns | Ticket handed down to level 0 | Only to members of their own team |
| Handler starts working | SLA stopped, first response recorded | Status → *In Progress* |
| 50% / 75% SLA time | Warnings sent | In-app/email to assigned handler + manager |
| Breach + policy **auto ON** | Auto-escalate | Level → policy's `to_level`, reassigned at that level; if none, HOD |
| Breach + policy **auto OFF** | Pushed to Escalation Queue | Lead/HOD assigns from SLA Dashboard |
| Breach persists past the last policy | Keeps auto-escalating | One hop per engine pass: team lead → HOD → Campus Admin (*Admin Review*) |
| Manual escalation | Level +1 each click | `0 → 1 → 2 → 3`, ends at Campus Admin |
| De-escalation | Level −1 | HOD/admin only, back down the chain |

### The full journey of a breached ticket (step by step)

1. Student creates a ticket → routed to the **Lab team lead**, SLA clock starts.
2. The lead assigns it to a lab staff member; warnings at 50% and 75% go to them and the manager.
3. Deadline passes with no first response → the policy matches (department/category/priority):
   - **auto ON** → ticket raised to the policy's target level (assigned there; fallback HOD).
   - **auto OFF** → ticket moved to the Escalation Queue.
4. If the SLA **stays** breached, every engine pass advances the ticket one more hop up the chain — team lead → HOD → Campus Admin — until *Admin Review* (level 3). Each step is logged once (`auto:escalated:N`) so the engine never double-fires on the same level.
5. Every action (policy applied, warning sent, breach, escalation, reassignment) is written to the ticket's **audit trail**, so the full history is visible.
6. Whoever ends up with the ticket clicks **Start Working**, replies (first response recorded), and works it to resolution.

### How escalation is configured (admin)

Escalation is **policy-driven**, not hardcoded. Each **Escalation Policy** sets:

- **Scope** — which department / category / priority it applies to (the most specific match wins)
- **From level → to level** — handler levels `0=Staff, 1=Team Lead, 2=HOD, 3=Campus Admin`; create any chain you need (e.g. `0→1`, `1→2`, `2→3`)
- **Auto-escalate** — ON: auto-assign on breach; OFF: push to the Escalation Queue
- **Delay** — how long after the breach before it triggers (`escalation_delay_minutes`)
- **Warnings** — 50% / 75% (or custom) thresholds for the assigned handler and manager

Optional **Escalation Rules** (IF conditions / THEN actions) add extra triggers, e.g. escalate on no-activity hours, bump priority, notify, or assign a specific user or level. There is no cap on the number of policies — build the exact chain your organization needs.

Only the **Campus Admin** can create/edit/delete policies and rules (HODs and staff have read access).

The only hardcoded behavior is *who* receives the ticket at each level: the team's lead (level 1), least-busy member of the ticket's team (level 0), the department HOD (level 2), then the Campus Admin (level 3) — and the one hardcoded escalation step: once a ticket has exhausted its configured policies, a still-breached ticket keeps stepping up automatically until it reaches the **Campus Admin** (*Admin Review*).

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

Run this to create the admin, HODs, **team leads + teams**, staff members, and students:

```bash
python manage.py seed
```

Every seeded user gets the password **`pass@123`** (override with `python manage.py seed --password <pw>`).

The seed creates teams (Lab / Academic per academic department, plus specialty teams for CIT/FIN/ACA/LIB/FAC) with a team lead on each.

### Step 4: Run Backend Server

```bash
cd backend
source ../venv/bin/activate
python manage.py runserver 0.0.0.0:8000
```

Backend API will be available at **http://localhost:8000/api/**

### Step 5: Run the SLA Engine Scheduler (separate terminal)

The SLA deadline check engine runs on **django-apscheduler** in its own process:

```bash
cd backend
source ../venv/bin/activate
python manage.py run_sla_scheduler
```

- The tick interval is configurable via `SLA_ENGINE_INTERVAL_SECONDS` (default 60s).
- Jobs are persisted in the DB (django_apscheduler tables); a slow pass never overlaps the next one (`max_instances=1`, `coalesce=True`).
- For one-off/debug passes you can still run `python manage.py run_sla_engine --ticket <pk>` or use cron with that command.

> Run the scheduler as its own process (not inside gunicorn workers) so multiple web workers can't double-fire the engine.

### Step 6: Run Frontend (separate terminal)

```bash
cd frontend
npm install
npm start
```

Frontend UI will be available at **http://localhost:3000**

---

## Running Tests

```bash
# From the project root - uses a throwaway SQLite DB (no CREATEDB privilege needed)
./venv/bin/python backend/manage.py test tickets escalations accounts --settings=config.test_settings
```

---

## Credentials

All seeded users share the password **`pass@123`** (configurable via `--password`).

| Role          | Username         | Department |
| ------------- | ---------------- | ---------- |
| Campus Admin  | `admin`          | -          |
| HOD           | `hod.computer`   | Computer   |
| Team Lead     | `lead.com.lab`   | Computer   |
| Team Lead     | `lead.com.academic` | Computer |
| Team Lead     | `lead.cit.it`    | IT Support |
| Staff         | `staff.com1`     | Computer   |
| Staff         | `staff.cit1`     | IT Support |
| CR            | `080bct010`      | Computer   |
| Student       | `080bct045`      | Computer   |

---

## Key API Endpoints

| Method | Endpoint                             | Description        |
| ------ | ------------------------------------ | ------------------ |
| POST   | `/api/auth/login/`                   | Login              |
| GET    | `/api/auth/me/`                      | Current user       |
| GET    | `/api/auth/users/team_members/`      | Members of my team(s) |
| GET/POST | `/api/auth/teams/`                 | Manage teams (sub-departments) |
| GET    | `/api/tickets/`                      | List tickets       |
| POST   | `/api/tickets/`                      | Create ticket (routes to team lead) |
| GET    | `/api/tickets/{id}/`                 | Ticket detail      |
| POST   | `/api/tickets/{id}/add_message/`     | Add reply/note     |
| POST   | `/api/tickets/{id}/change_status/`   | Change status      |
| POST   | `/api/tickets/{id}/reassign/`        | Reassign (role-scoped) |
| POST   | `/api/tickets/{id}/escalate/`        | Escalate           |
| GET    | `/api/tickets/dashboard/`            | Dashboard          |
| GET    | `/api/tickets/stats/`                | Statistics         |
| GET    | `/api/notifications/`                | Notifications      |
| GET/POST | `/api/escalations/policies/`       | Escalation policies (campus admin writes) |

---

## Project Structure

```
├── backend/
│   ├── config/           # Django settings, urls, wsgi, test settings
│   ├── accounts/         # Custom User model, teams (sub-departments), auth
│   ├── tickets/          # Core: models, views, routing, serializers
│   ├── notifications/    # Notifications & templates
│   ├── escalations/      # SLA engine, policies, apscheduler scheduler
│   └── manage.py
├── frontend/
│   ├── src/
│   │   ├── api/          # Axios API client
│   │   ├── components/   # Dashboard, TicketList, TicketDetail, escalations UI
│   │   └── contexts/     # Auth context
│   └── public/
├── venv/                 # Python virtual environment
└── README.md
```
