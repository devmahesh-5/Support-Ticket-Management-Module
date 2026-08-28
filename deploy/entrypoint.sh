#!/usr/bin/env bash
set -euo pipefail

# Ensure Python buffering/immediate output for logs
export PYTHONUNBUFFERED=1

echo "[entrypoint] Running database migrations..."
python manage.py migrate --noinput

echo "[entrypoint] Collecting static files..."
python manage.py collectstatic --noinput

echo "[entrypoint] Ensuring superuser exists..."
python manage.py ensure_superuser

echo "[entrypoint] Starting SLA scheduler..."
python manage.py run_sla_scheduler &
SLA_PID=$!

echo "[entrypoint] Starting Gunicorn on 127.0.0.1:8000..."
gunicorn config.wsgi:application \
    --bind 127.0.0.1:8000 \
    --workers "${GUNICORN_WORKERS:-3}" \
    --threads "${GUNICORN_THREADS:-2}" \
    --timeout "${GUNICORN_TIMEOUT:-120}" \
    --access-logfile - \
    --error-logfile - &
GUNICORN_PID=$!

# Forward termination signals to the background processes so they shut down
# cleanly when Coolify/Traefik stops the container.
cleanup() {
    echo "[entrypoint] Shutting down..."
    kill -TERM "$GUNICORN_PID" 2>/dev/null || true
    kill -TERM "$SLA_PID" 2>/dev/null || true
    wait "$GUNICORN_PID" 2>/dev/null || true
    wait "$SLA_PID" 2>/dev/null || true
}
trap cleanup TERM INT

echo "[entrypoint] Starting Nginx (foreground)..."
exec nginx -g 'daemon off;'
