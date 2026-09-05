# Support Ticket System 
## Live : `https://support-ticket-management-module.itclub.asmitphuyal.com.np/`
Support Ticket System is a web application for submitting, assigning, tracking,
and escalating support requests at Pulchowk Engineering Campus. It has a Django
REST API and admin site, a React web interface, PostgreSQL storage, and an SLA
engine for deadline monitoring and escalation.

## What the system does

- Students and class representatives submit support tickets with a category,
  priority, description, and optional attachments.
- Support staff communicate with requesters through a ticket conversation.
- Team leads assign work to staff in their own team.
- HODs manage support work in their department.
- Campus administrators manage the whole system and its configuration.
- Tickets have an audit trail, notifications, status history, and SLA dates.
- Tickets can be searched, filtered, sorted, reported on, and exported by
  authorized users.

## Roles

| Role | Main responsibilities |
| --- | --- |
| Student | Create tickets, follow replies, add information, and close own tickets. |
| CR (Class Representative) | Do everything a student can do, including class-level requests. |
| Staff | Work assigned tickets, reply, change status, and escalate when permitted. |
| Team Lead | Triage the team queue and assign tickets to members of the same team. |
| HOD / Department Admin | Manage department work, users, teams, and department assignments. |
| Campus Admin | Manage all users, departments, teams, categories, policies, rules, and reports. |

## How routing works

Routing is based on the requester's department and the selected team
(sub-department). The category controls the type of request and its SLA, but it
does not select the team.

1. A requester selects a team while creating a ticket.
2. The ticket is initially assigned to that team's lead.
3. The team lead assigns it to a member of the same team.
4. If the team or team lead is unavailable, the ticket falls back to the
   department HOD and, finally, the Campus Admin.

## Ticket lifecycle

The normal workflow is:

1. **Open** - the requester has submitted the ticket and it is waiting for
   handling.
2. **In Progress** - the assigned handler has started work.
3. **Resolved** - the handler has completed the work.
4. **Closed** - the requester or an authorized support user has finished the
   ticket.

Tickets can also be reopened when more work is needed. Support users may see
additional escalation states such as **Escalated L1**, **Escalated L2**, and
**Admin Review**.

## SLA and escalation

Each category has response and resolution hours. The SLA engine monitors active
tickets and records warnings, breaches, and escalation history. The scheduler
must be running for automatic monitoring.

The escalation levels are:

| Level | Handler |
| --- | --- |
| 0 | Staff member |
| 1 | Team Lead |
| 2 | Department HOD |
| 3 | Campus Admin |

When a policy matches a breached ticket, it either moves the ticket to the
configured next level or places it in the fixed Escalation Queue when automatic
escalation is disabled. Manual escalation follows the same support hierarchy.
Authorized HODs and Campus Admins can de-escalate when the configured workflow
allows it.

## Using the web application

Open the frontend at `http://localhost:3000` during local development and `https://support-ticket-management-module.itclub.asmitphuyal.com.np/`. After
login, the main navigation contains the following areas:

| Screen | Use |
| --- | --- |
| Dashboard | View ticket counts, workload, and SLA information available to your role. |
| Tickets | Search, filter, sort, and open tickets visible to you. |
| New Ticket | Submit a request and add an attachment. |
| Ticket details | Read the conversation, reply, update status, assign, or escalate when allowed. |
| Notifications | Read system notifications and jump to related tickets. |
| Admin | Manage users and organizational data when authorized. |
| Escalation Dashboard | Review SLA status, breaches, and the escalation queue. |
| Escalation Policies | Configure policies and rules as Campus Admin. |

### Requester workflow

1. Sign in.
2. Select **New Ticket**.
3. Choose the department/team, category, priority, and write a useful title
   and description.
4. Add an attachment if it helps explain the issue.
5. Submit the ticket and use its detail page to follow replies and status
   changes.
6. Reply with additional information when requested. Close the ticket when the
   issue is resolved.

### Staff workflow

1. Open the assigned ticket from **Tickets**.
2. Select **Start Working** or change the status to begin handling it.
3. Reply in the conversation and record meaningful progress.
4. Resolve or reopen the ticket as appropriate.
5. Escalate it when it needs a higher support level and your role has access.

### Team lead workflow

1. Review new tickets assigned to your team.
2. Check the category, priority, description, and requester details.
3. Assign the ticket to an available member of your own team.
4. Monitor team workload and take ownership of tickets that need lead-level
   attention.

### HOD and Campus Admin workflow

HODs can manage the users, teams, assignments, and escalated work in their own
department. Campus Admins can manage all departments and users, configure
categories and SLAs, review reports and exports, and maintain escalation
policies and rules.

## Local development setup

### Prerequisites

- Python 3.10 or newer
- Node.js 18 or newer
- PostgreSQL 14 or newer
- npm

### 1. Create a PostgreSQL database

Create a database and, if required by your PostgreSQL setup, the schema used by
the application:

```bash
createdb support_ticket
psql -d support_ticket -c "CREATE SCHEMA IF NOT EXISTS ticket_system;"
```

Set the connection values before starting Django. The application reads these
variables from the environment or a `.env` file in `backend/`:

```bash
export DJANGO_SECRET_KEY='replace-with-a-long-random-value'
export DB_NAME='support_ticket'
export DB_USER='postgres'
export DB_PASSWORD='your-local-password'
export DB_HOST='localhost'
export DB_PORT='5432'
export DEBUG='true'
```

### 2. Install and migrate the backend

From the repository root:

```bash
python -m venv venv
source venv/bin/activate
pip install -r backend/requirements.txt
cd backend
python manage.py migrate
```

### 3. Seed development data

The seed command creates departments, teams, categories, a campus admin, HODs,
team leads, staff, students, and a CR. It is safe to run again when setting up
an existing development database.

```bash
python manage.py seed --password 'choose-a-development-password'
```

The seeded non-admin users use the password passed to `--password`. For a
campus admin, set credentials explicitly instead of relying on a shared demo
password:

```bash
export ADMIN_USERNAME='admin'
export ADMIN_EMAIL='admin@example.test'
export ADMIN_PASSWORD='choose-a-strong-password'
python manage.py seed --password 'choose-a-development-password'
```

Do not use development credentials in a production deployment.

### 4. Start the backend

In the `backend/` directory:

```bash
python manage.py runserver 0.0.0.0:8000
```

The API is available at `http://localhost:8000/api/` and Django Admin is at
`http://localhost:8000/admin/`.

### 5. Start the SLA scheduler

Run this in a second terminal with the virtual environment active:

```bash
cd backend
source ../venv/bin/activate
python manage.py run_sla_scheduler
```

The default interval is 60 seconds. Change it with
`SLA_ENGINE_INTERVAL_SECONDS`. For a one-off evaluation pass, use:

```bash
python manage.py run_sla_engine
python manage.py run_sla_engine --ticket 123
```

### 6. Start the frontend

In a third terminal:

```bash
cd frontend
npm install
npm start
```

The React application opens at `http://localhost:3000`. Its development proxy
forwards API requests to `http://localhost:8000`.

## Production deployment with Docker

The root `Dockerfile` builds the React application and runs it with Django and
Gunicorn in one container on port `8000`. Configure these values in the
deployment environment:

```bash
DJANGO_SECRET_KEY=long-random-production-secret
DEBUG=false
ALLOWED_HOSTS=tickets.example.com
CSRF_TRUSTED_ORIGINS=https://tickets.example.com
DB_NAME=support_ticket
DB_USER=your-db-user
DB_PASSWORD=your-db-password
DB_HOST=your-postgres-host
DB_PORT=5432
ADMIN_USERNAME=admin
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=strong-production-password
SEED_PASSWORD=strong-seed-password
```

The container startup performs migrations, collects static files, ensures the
superuser exists, seeds the base data, starts the SLA scheduler, and starts
Gunicorn. Use a managed PostgreSQL database and persistent storage for media
uploads. Set `ALLOWED_HOSTS` to the real domain; do not use `*` in production.

The health check endpoint is `GET /healthz/` and returns `ok` when the service
is running.

## API overview

The API is session-authenticated. The main route groups are:

| Route | Purpose |
| --- | --- |
| `/api/auth/` | Login, logout, current user, users, departments, and teams. |
| `/api/tickets/` | Ticket creation, lists, details, messages, attachments, status, assignment, and escalation. |
| `/api/notifications/` | Notifications, unread counts, and the notification stream. |
| `/api/escalations/` | Policies, rules, SLA dashboard, and escalation data. |

Useful endpoints include:

```text
POST /api/auth/login/
GET  /api/auth/me/
GET  /api/tickets/
POST /api/tickets/
GET  /api/tickets/{id}/
POST /api/tickets/{id}/add_message/
POST /api/tickets/{id}/upload_attachment/
POST /api/tickets/{id}/change_status/
POST /api/tickets/{id}/reassign/
POST /api/tickets/{id}/escalate/
GET  /api/tickets/dashboard/
GET  /api/notifications/
GET  /api/escalations/dashboard/dashboard/
```

Permissions are enforced by the backend, so a user only sees and changes data
allowed by their role and department.

## Testing

The test settings use a throwaway SQLite database, so local tests do not need a
separate test PostgreSQL database:

```bash
python backend/manage.py test accounts tickets escalations \
  --settings=config.test_settings
```

## Project structure

```text
backend/
  accounts/       Users, roles, departments, teams, and authentication
  tickets/        Tickets, messages, attachments, routing, and reporting
  notifications/  In-app notifications and streaming
  escalations/    SLA policies, scheduler, escalation services, and history
  config/         Django settings, URLs, authentication, and deployment config
frontend/
  src/            React application, pages, components, API client, and auth
Dockerfile        Production image for the frontend and backend
README.md         Project documentation and user manual
```
