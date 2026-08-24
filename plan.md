# AniListShare Frontend Refactor Plan — Django API + Next.js

> **Progress tracking:** real-time progress lives in [`tasks.md`](tasks.md). Every task there maps to a phase here. Update `tasks.md` (checkboxes + status column) as work happens — that file is the single source of truth for "how much is done", this file is the source of truth for "what and why".

## Goal

Replace the Jinja + vanilla-JS frontend (~8k lines) with a production-ready Next.js app. Identical UI/UX (same colors, layout, animations, mobile behavior). Django stays as the backend: allauth (server-rendered) for login/signup/MFA/social, DRF + JWT for data. Backend gets hardened for load. Docker for self-hosting, CI for every commit/PR.

## Architecture

```
Browser
  │
  ▼
Next.js (port 3000) ── serves app shell + static assets (instant load)
  │  rewrites /api/*  and /accounts/*  ─────►  Django (port 8000)
  │                                              ├─ DRF API (JWT)
  │                                              ├─ allauth pages (session)
  │                                              └─ Postgres (or SQLite dev)
  └─ Jikan API (client-side, unchanged)
```

- **Same-origin deployment** (Next.js rewrites in dev, nginx in Docker prod routes `/api` + `/accounts` + `/django-static` to Django, everything else to Next). This keeps the session cookie working for the existing `POST /api/v1/token/session/` session→JWT bridge — allauth is untouched, zero auth rewrite.
- **GitHub-style loading:** the app shell (header, tabs bar, table chrome) is a static prerender — paints instantly on refresh. Data streams in client-side via TanStack Query with skeletons identical to the real UI. `loading.tsx` per route for navigation.
- **State:** TanStack Query is the only data store. Query keys: `['categories']`, `['animes', categoryId]`, `['search', q]`, `['share']`, `['shareData', token]`. No Redux/Zustand — server state is the only state.

## Frontend stack (minimal, well-maintained)

| Package | Why |
|---|---|
| `next` (15.x) + `react` 19 | framework |
| `@tanstack/react-query` v5 | caching, optimistic updates, request dedup |
| `@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities` | drag reorder (rows, cards, tabs) — accessible, touch support, maintained |
| `xlsx` (SheetJS, lazy `import()`) | ODS import/export, loaded only when used |

That's it. No UI library — the existing CSS (colors.css variables, per-component CSS) ports as CSS Modules / global CSS nearly verbatim, which guarantees pixel parity including dark mode (`prefers-color-scheme`). Nerd-font icon subset (`NerdFontsSubset.woff2` + generated CSS) copies over as-is.

## Key design decisions

### 1. Search — server-side, no "load everything" hack
Current: first focus loads ALL anime of ALL categories client-side, then substring-filters.
New: `GET /api/v1/animes/search/?q=<term>&limit=15` — DB `icontains` on name, `prefetch_related("seasons")` (fixes the existing N+1), returns ≤15 rows with `category_id`. Client: 200ms debounce, TanStack Query caches per term (`staleTime` 30s), so retyping/backspacing costs nothing. Zero requests until the user actually types. Active filters still apply client-side to the ≤15 results (same behavior as today).

### 2. Search result navigation (switch tab → scroll → highlight)
On click: set active category, `queryClient.ensureQueryData(['animes', catId])` (cached = instant, else fetch), then after render scroll the row into view (accounting for sticky header, same −20px offset) and add `search_highlight` class — same 1.8s accent box-shadow pulse keyframes. React makes the old 100ms-poll hack unnecessary: a `highlightAnimeId` state + `ref` callback on the matching row does it deterministically.

### 3. Category data — lazy per-tab with real caching
Per-tab lazy load stays (no wasted requests), but TanStack Query caches each visited tab (`staleTime` 60s) — tab switching is instant after first visit, unlike today's refetch-every-switch. Prefetch on tab hover (desktop) for perceived-zero latency.

### 4. Drag reorder — dnd-kit replaces ~600 lines of custom drag code
- Anime rows (desktop table) + mobile cards: `SortableContext` + `useSortable`, `PointerSensor` (with distance constraint ≈ 4px dead zone) + `TouchSensor` (250ms hold) + `KeyboardSensor`. Drag handle = the `#` cell, same as today.
- Category tabs: horizontal `SortableContext`. Persist via existing `PATCH .../order/` endpoints with optimistic update + rollback on error (no more `location.reload()`).

### 5. Optimistic writes — TanStack mutations replace SyncQueue
Add/edit/delete anime: `useMutation` with `onMutate` cache update, rollback `onError`, invalidate `onSettled`. Debounced bulk_sync (1.5s) is kept for rapid successive edits via a thin queue that flushes to the existing `POST /api/v1/animes/bulk_sync/`; `keepalive` flush on `pagehide`. localStorage persistence of the queue stays (same key) so offline edits survive reload.

### 6. Auth on the frontend
`apiFetch` port: in-memory access/refresh JWT, session→JWT mint on first API call (`/api/v1/token/session/` with CSRF cookie), proactive refresh, single-flight, 401-retry-once. Middleware-free: the shell is public; data queries fail → redirect to `/accounts/login/`. Auth state (name, email, avatar) comes from a tiny new `GET /api/v1/me/` endpoint (replaces the Jinja-injected `__USER_IS_AUTHENTICATED__` globals).

### 7. Pages
| Route | Notes |
|---|---|
| `/` | landing (Jikan schedules/trending/upcoming, hover popup, add-to-list) — client components, sessionStorage cache kept |
| `/list` | the main app (tabs, table/cards, search, filters, modals, FAB, import/export, share modal) |
| `/share/[token]` | public read-only list, reuses table components with `readOnly` prop |
| `/accounts/*` | **stays Django/allauth** (proxied) — login, signup, MFA, settings, email mgmt |

Skeletons: componentized (`<AnimeTableSkeleton rows={4}/>` etc.) living next to the real components so UI changes force skeleton changes in the same file.

## Backend hardening (Django)

1. **Fix search N+1**: add `prefetch_related("seasons")` + `icontains` filter + limit to `SearchAnimeApiView`.
2. **Race-safe ID assignment**: `select_for_update` (or `F`-based insert) for `user_category_id` / `order` max+1 in category create + bulk_sync.
3. **Set-based re-index**: replace per-row `.update()` loops (category delete, share copy) with `bulk_update`.
4. **`GET /api/v1/me/`**: `{username, name, email, avatar_url, email_verified}` for the shell header.
5. **Caching**: Redis cache backend when `REDIS_URL` set (LocMem fallback) — makes DRF throttles actually work across workers. Public share data: `ETag`/`Cache-Control: max-age=60` (biggest anon-traffic surface).
6. **Throttling**: keep anon 100/day for share data but scope a separate, higher `ScopedRateThrottle` so a popular share link doesn't die; user throttle unchanged.
7. **bulk_sync error reporting**: return per-action errors instead of silently skipping.
8. **Serving**: gunicorn with sane worker count; sessions stay DB-backed (fine at this scale — ponytail: cached_db if profiling ever says otherwise).

## Tests + CI

- **Backend**: pytest + pytest-django — API contract tests (auth, categories CRUD/order, animes, bulk_sync incl. temp-id resolution + error reporting, search, share flow, throttle).
- **Frontend**: vitest + React Testing Library — filter logic, search navigation/highlight, optimistic mutation rollback, reorder handler; Playwright is **not** added (YAGNI until the app stabilizes).
- **CI** (`.github/workflows/ci.yml`, on push + PR): backend job (ruff + pytest, Postgres service), frontend job (eslint + tsc + vitest + `next build`). CodeQL workflow stays.

## Docker (private self-hosting)

`docker-compose.yml`: `postgres:17-alpine` (with volume) + `backend` (gunicorn) + `frontend` (Next standalone) + `nginx` (single entry port, routes as above). `DATABASE_URL` env override lets users point at Neon/Prisma Postgres/etc. instead of the bundled postgres (just don't start the `db` service). `.env.example` documents every var. Multi-stage Dockerfiles, non-root users.

## Phases (tracked in tasks.md)

1. **Backend prep** — API fixes/hardening + `/me` + tests
2. **Next.js scaffold** — app shell, CSS port, auth plumbing, rewrites
3. **List page core** — tabs, table, mobile cards, skeletons, filters
4. **Search** — server-side search + navigate/highlight
5. **Drag reorder** — rows, cards, tabs (dnd-kit)
6. **Modals & writes** — add/edit anime, categories, sync queue, toasts
7. **Secondary pages** — landing, share modal + public page, import/export
8. **Tests + CI**
9. **Docker + deployment docs**
10. **Cleanup** — delete replaced Jinja templates/JS/CSS from Django, final parity pass

Old frontend keeps working until phase 10 — Django templates aren't touched before the Next app reaches parity.
