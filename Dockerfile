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
# Stage 2: Django + Nginx
############################
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    DEBIAN_FRONTEND=noninteractive

WORKDIR /app


############################
# System dependencies
############################
RUN apt-get update && apt-get install -y --no-install-recommends \
        nginx \
        libpq-dev \
        gcc \
        curl \
    && rm -rf /var/lib/apt/lists/* \
    && rm -f /etc/nginx/sites-enabled/default \
    && ln -sf /dev/stdout /var/log/nginx/access.log \
    && ln -sf /dev/stderr /var/log/nginx/error.log


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
# React frontend
############################
COPY --from=frontend-build /app/build /var/www/html


############################
# Nginx configuration
############################
COPY <<'EOF' /etc/nginx/conf.d/app.conf

server {
    listen 80;
    server_name _;

    root /var/www/html;
    index index.html;

    client_max_body_size 25M;

    gzip on;
    gzip_types
        text/css
        application/javascript
        application/json
        image/svg+xml;

    gzip_min_length 1024;


    ############################
    # React frontend
    ############################

    location / {
        try_files $uri $uri/ /index.html;
    }


    ############################
    # React static assets
    ############################

    location /static/ {
        alias /var/www/html/static/;
        expires 30d;
        add_header Cache-Control "public, immutable";
        try_files $uri =404;
    }


    ############################
    # Django static files
    ############################

    location /static/admin/ {
        alias /app/staticfiles/admin/;
        expires 30d;
    }

    location /static/rest_framework/ {
        alias /app/staticfiles/rest_framework/;
        expires 30d;
    }


    ############################
    # Django media/uploads
    ############################

    location /media/ {
        alias /app/media/;
        expires 7d;
    }


    ############################
    # Django API
    ############################

    location /api/ {

        proxy_pass http://127.0.0.1:8000;

        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_set_header Connection "";

        # SSE
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 3600s;
    }


    ############################
    # Django Admin
    ############################

    location /admin/ {

        proxy_pass http://127.0.0.1:8000;

        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }


    ############################
    # Health check
    ############################

    location = /healthz {

        access_log off;

        default_type text/plain;

        return 200 "ok\n";
    }
}

EOF


############################
# Port
############################

EXPOSE 80


############################
# Health check
############################

HEALTHCHECK \
    --interval=30s \
    --timeout=5s \
    --start-period=90s \
    --retries=3 \
    CMD curl -sf http://localhost/healthz || exit 1


############################
# Startup
############################

CMD ["sh", "-c", "\
set -e; \
echo 'Running migrations...'; \
python manage.py migrate --noinput; \
echo 'Collecting static files...'; \
python manage.py collectstatic --noinput; \
echo 'Creating superuser if needed...'; \
python manage.py createsuperuser --noinput || true; \
echo 'Starting Gunicorn...'; \
gunicorn config.wsgi:application \
    --bind 127.0.0.1:8000 \
    --workers ${GUNICORN_WORKERS:-3} \
    --threads ${GUNICORN_THREADS:-2} \
    --timeout ${GUNICORN_TIMEOUT:-120} \
    --access-logfile - \
    --error-logfile - & \
echo 'Starting Nginx...'; \
exec nginx -g 'daemon off;' \
"]