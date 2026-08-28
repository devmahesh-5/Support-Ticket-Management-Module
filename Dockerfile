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
# Deployment assets
############################
COPY deploy/nginx.conf /etc/nginx/conf.d/app.conf
COPY deploy/entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh


############################
# Directories expected by Nginx/Django (must exist for static/media collection)
############################
RUN mkdir -p /app/media /app/staticfiles


############################
# Port
############################
# Only Nginx is public; Gunicorn stays bound to 127.0.0.1:8000 and is not exposed.
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
ENTRYPOINT ["/app/entrypoint.sh"]
