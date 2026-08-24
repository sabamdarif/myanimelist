# Backend: Django + gunicorn
FROM ghcr.io/astral-sh/uv:python3.14-alpine AS builder
ENV UV_LINK_MODE=copy
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

FROM python:3.14-alpine
WORKDIR /app
ENV PATH="/app/.venv/bin:$PATH" PYTHONUNBUFFERED=1
COPY --from=builder /app/.venv /app/.venv
COPY manage.py ./
COPY AniListShare AniListShare
COPY accounts accounts
COPY api api
COPY core core
# manifest storage needs a settings load; the real secret isn't known at build
RUN DJANGO_SECRET_KEY=build-only python manage.py collectstatic --noinput \
    && adduser -S app
USER app
EXPOSE 8000
CMD ["sh", "-c", "python manage.py migrate --noinput && exec gunicorn AniListShare.wsgi:application --bind 0.0.0.0:8000 --workers ${GUNICORN_WORKERS:-3}"]
