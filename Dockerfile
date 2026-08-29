# syntax=docker/dockerfile:1

############################
# Stage 1: Build React frontend
############################
FROM node:20-alpine AS frontend-build

WORKDIR /app

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ .

ARG REACT_APP_API_URL=/api
ENV REACT_APP_API_URL=$REACT_APP_API_URL

RUN npm run build


############################
# Stage 2: Django + React (single container, no Nginx)
############################
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    DEBIAN_FRONTEND=noninteractive

WORKDIR /app

############################
# Python dependencies
############################
COPY backend/requirements.txt .
RUN pip install --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt

############################
# Django backend
############################
COPY backend/ .

############################
# React frontend build
############################
COPY --from=frontend-build /app/build /app/frontend_build

############################
# Directories for Django static/media collection
############################
RUN mkdir -p /app/media /app/staticfiles

############################
# Port
############################
# Gunicorn serves Django (API, admin) and the React build. Expose 8000.
EXPOSE 8000

############################
# Health check
############################
HEALTHCHECK \
    --interval=30s \
    --timeout=5s \
    --start-period=90s \
    --retries=3 \
    CMD ["python", "-c", "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/healthz/', timeout=5).status==200 else 1)"]

############################
# Startup: migrate, collect static, seed, then Gunicorn
############################
CMD ["sh", "-c", "python manage.py migrate --noinput && python manage.py collectstatic --noinput && python manage.py ensure_superuser && python manage.py seed --password \"${SEED_PASSWORD:-pass@123}\" && (python manage.py run_sla_scheduler &) && exec gunicorn config.wsgi:application --bind 0.0.0.0:8000 --workers \"${GUNICORN_WORKERS:-3}\" --threads \"${GUNICORN_THREADS:-2}\" --timeout \"${GUNICORN_TIMEOUT:-120}\" --access-logfile - --error-logfile -"]