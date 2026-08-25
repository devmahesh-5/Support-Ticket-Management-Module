# syntax=docker/dockerfile:1

############################
# Stage 1: build React frontend
############################
FROM node:20-alpine AS frontend-build

WORKDIR /app

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ .

# Same-origin default: nginx below proxies /api -> local gunicorn,
# so no cross-origin config needed. Override only if you split deployments.
ARG REACT_APP_API_URL=/api
ENV REACT_APP_API_URL=$REACT_APP_API_URL

RUN npm run build


############################
# Stage 2: Django backend + nginx serving the frontend
############################
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# nginx + libpq (psycopg2) + curl (healthcheck)
RUN apt-get update && apt-get install -y --no-install-recommends \
        nginx \
        libpq5 \
        curl \
    && rm -rf /var/lib/apt/lists/* \
    && rm -f /etc/nginx/sites-enabled/default \
    && ln -sf /dev/stdout /var/log/nginx/access.log \
    && ln -sf /dev/stderr /var/log/nginx/error.log

# --- backend deps ---
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# --- backend code ---
COPY backend/ .

# --- frontend build output ---
COPY --from=frontend-build /app/build /var/www/html

# --- nginx site config (inline, no extra files) ---
COPY <<'EOF' /etc/nginx/conf.d/app.conf
server {
    listen 80;
    server_name _;

    root /var/www/html;
    index index.html;

    client_max_body_size 25M;

    gzip on;
    gzip_types text/css application/javascript application/json image/svg+xml;
    gzip_min_length 1024;

    # React SPA routing
    location / {
        try_files $uri $uri/ /index.html;
    }

    # React build assets
    location /static/ {
        alias /var/www/html/static/;
        expires 30d;
        add_header Cache-Control "public, immutable";
        try_files $uri =404;
    }

    # Django admin + DRF browsable API static
    location /static/admin/ {
        alias /app/staticfiles/admin/;
        expires 30d;
    }

    location /static/rest_framework/ {
        alias /app/staticfiles/rest_framework/;
        expires 30d;
    }

    # Uploaded media
    location /media/ {
        alias /app/media/;
        expires 7d;
    }

    # API -> gunicorn
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

    # Django admin -> gunicorn
    location /admin/ {
        proxy_pass http://127.0.0.1:8000;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Simple liveness endpoint
    location = /healthz {
        access_log off;
        default_type text/plain;
        return 200 "ok\n";
    }
}
EOF

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=3 \
    CMD curl -sfL http://localhost/admin/login/ >/dev/null || exit 1

# Django startup:
# 1. Run migrations
# 2. Collect static files
# 3. Create superuser if it doesn't already exist
# 4. Start Gunicorn
# 5. Start nginx in foreground
CMD ["sh", "-c", "set -e; \
python manage.py migrate --noinput; \
python manage.py collectstatic --noinput; \
python manage.py createsuperuser --noinput || true; \
gunicorn config.wsgi:application \
    --bind 127.0.0.1:8000 \
    --workers ${GUNICORN_WORKERS:-3} \
    --threads ${GUNICORN_THREADS:-2} \
    --timeout ${GUNICORN_TIMEOUT:-120} \
    --access-logfile - \
    --error-logfile - & \
exec nginx -g 'daemon off;'"]