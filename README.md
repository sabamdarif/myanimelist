## A fun way to store your anime watchlist

### Self-hosting (Docker)

```sh
cp .env.example .env   # then edit: at minimum DJANGO_SECRET_KEY, POSTGRES_PASSWORD,
                       # and SECURE_SSL_REDIRECT=False if you serve plain HTTP
docker compose up -d --build
```

The app is served on `http://localhost:8080` (change with `HTTP_PORT`). nginx is
the single entry point: `/api`, `/accounts` and `/django-static` go to Django
(gunicorn), everything else to the Next.js frontend. Migrations run
automatically on backend start.

**External Postgres** (Neon, RDS, …): set `DATABASE_URL` (and
`DB_SSL_REQUIRE=True`) in `.env`, then start without the bundled database:

```sh
docker compose up -d --build backend frontend nginx
```

**HTTPS**: put your own TLS proxy (Caddy, Traefik, a cloud LB) in front of the
nginx port and set `SECURE_SSL_REDIRECT=True`.

Every variable is documented in [`.env.example`](.env.example).

### Development

```sh
uv sync                                  # backend deps
uv run python manage.py migrate
uv run python manage.py runserver        # Django on :8000
cd frontend && npm install && npm run dev  # Next.js on :3000 (proxies /api to Django)
```

Tests: `uv run pytest` (backend) · `cd frontend && npm test` (frontend).
