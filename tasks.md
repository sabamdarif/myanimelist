# Tasks — real-time progress

> Companion to [`plan.md`](plan.md). Check items off as they complete. Status: ⬜ todo · 🔄 in progress · ✅ done.

## Phase 1 — Backend prep ✅
- [x] Fix search endpoint: `?q=` filter, `prefetch_related("seasons")`, limit 15
- [x] `GET /api/v1/me/` endpoint
- [x] Race-safe `user_category_id` / `order` assignment (select_for_update)
- [x] Set-based re-index on category delete / share copy
- [x] bulk_sync per-action error reporting
- [x] Redis cache backend (env-gated) + share-data ETag/max-age + scoped share throttle
- [x] pytest setup + API contract tests

## Phase 2 — Next.js scaffold ✅
- [x] `frontend/` Next 15 app, TypeScript, ESLint
- [x] Port colors.css / base.css / fonts / nerd-icon subset
- [x] Dev rewrites to Django (`/api`, `/accounts`, `/django-static`)
- [x] `apiFetch` (session→JWT mint, refresh, single-flight, 401 retry)
- [x] TanStack Query provider + query key conventions
- [x] App shell: sticky header, avatar dropdown, static prerender

## Phase 3 — List page core ✅
- [x] Category tabs (load, active state, localStorage persistence)
- [x] Anime table (desktop) — all columns, season pills/progress, comment tooltips
- [x] Mobile card list (≤768px) + FAB
- [x] Skeletons (table rows + mobile cards + tabs) matching real UI
- [x] Filters (sort/status/attr/lang pills, cookie persistence, mobile embed in search sheet)
- [x] Scroll position persistence per tab
- [x] Thumbnail lazy-load + "Load" button + autofetch banner (Jikan)

## Phase 4 — Search ✅
- [x] Backend `?q=` live (phase 1) → client debounced search query
- [x] Desktop dropdown (keyboard nav, mark highlight, loader bar)
- [x] Mobile bottom sheet
- [x] Navigate to result: tab switch → scroll → 1.8s highlight pulse

## Phase 5 — Drag reorder ✅
- [x] dnd-kit rows (desktop, handle = # cell) + mobile cards (long-press)
- [x] Category tabs reorder (no reload, optimistic)
- [x] Persist via order endpoints, rollback on error

## Phase 6 — Modals & writes ✅
- [x] Add/Edit anime modal (Jikan autocomplete, seasons/OVA rows, stars, language chips, thumbnail editor)
- [x] Add/Edit/Delete category modals (no reload)
- [x] Optimistic mutations + debounced bulk_sync queue (localStorage, keepalive flush)
- [x] Toasts

## Phase 7 — Secondary pages ✅
- [x] Landing page (schedules/trending/upcoming, hover popup, add-to-list)
- [x] Share modal (enable/disable, copy link)
- [x] Public share page `/share/[token]` (read-only table, copy-list flow)
- [x] ODS import/export (lazy SheetJS, export ring, import modal)

## Phase 8 — Tests + CI ✅
- [x] Backend pytest suite green
- [x] Frontend vitest suite (filters, search nav, mutations, reorder)
- [x] `.github/workflows/ci.yml` (backend + frontend jobs, push + PR)

## Phase 9 — Docker ✅
- [x] Backend Dockerfile (gunicorn, non-root, multi-stage)
- [x] Frontend Dockerfile (Next standalone)
- [x] docker-compose (postgres + backend + frontend + nginx), external-DB mode
- [x] .env.example updated, self-host docs in README

## Phase 10 — Cleanup 🔄
- [x] Delete replaced Jinja templates / static JS / CSS
- [ ] Final UI parity pass vs screenshots
- [x] Update README
