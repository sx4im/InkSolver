# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

InkSolver — an AI whiteboard that solves STEM problems from handwriting/drawings. Next.js 15 (App Router) + React 19 + TypeScript + tldraw canvas. A Python/FastAPI/SymPy microservice verifies solutions symbolically.

## Commands

```bash
pnpm dev                    # dev server at localhost:3000
pnpm typecheck              # tsc --noEmit
pnpm lint                   # next lint (eslint, next/core-web-vitals)
pnpm build                  # production build
pnpm smoke:local            # 23-check API smoke suite (needs dev server running)
pnpm test:e2e               # Playwright (auto-starts dev server)

# Verifier (Python)
cd services/verifier
pip install -r requirements.txt -r requirements-dev.txt
python -m pytest tests/ -q

# DB
pnpm db:generate            # drizzle-kit generate
pnpm db:migrate             # drizzle-kit migrate
pnpm db:push                # drizzle-kit push
```

Run a single Playwright test: `pnpm exec playwright test tests/e2e/canvas.spec.ts`
Run a single pytest: `python -m pytest tests/test_verifier.py::test_name -q`

CI runs: typecheck → lint → build → smoke:local, plus Playwright e2e and verifier pytest in parallel jobs.

## Architecture

```
src/
  app/                      # Next.js App Router pages + API routes
    api/v1/                 # All API routes under /api/v1/*
    c/[id]/                 # Canvas workspace page
    s/[slug]/               # Public share page
  server/                   # Server-only business logic (not route handlers)
    solve-service.ts        # Orchestrates: cache check → NVIDIA solve → SymPy verify → retry on mismatch
    nvidia-solver.ts        # Streams structured JSON from NVIDIA NIM vision model, parses steps incrementally
    verifier-client.ts      # Calls the Python SymPy service
    gemini-solver.ts        # Chat follow-ups + embedding generation
    repository/             # Data access layer (user, canvas, solution, chat, quota)
    guards/                 # Shared guards: rate-limiter, payload-parser, snapshot-guard
    local-store.ts          # JSON file store in .data/ — used when DATABASE_URL is absent
    runtime-guards.ts       # Environment detection helpers (isProductionRuntime, etc.)
    snapshot-storage.ts     # Prompt image storage (R2 or local disk)
  components/
    canvas/                 # tldraw board, solve-stream, capture, nav-drawer, solution cards
    dashboard/              # Canvas list, create/delete, semantic search
    ui/                     # Shared primitives (button, badge, surface)
  db/
    schema.ts               # Drizzle ORM schema (Postgres + pgvector)
    client.ts               # DB connection
  lib/
    types.ts                # Shared TypeScript types
    utils.ts                # cn() and small helpers
  middleware.ts             # Clerk auth — defines public vs protected routes

services/verifier/          # Python FastAPI service, SymPy-based symbolic verification
  app/
    api.py                  # FastAPI verification endpoints
    engine/                 # SymPy parser, equivalence matcher, dispatch
    rules/                  # Verification rules (integral, limit, linear_system, etc.)
    main.py                 # Entry point re-exporting public symbols
  tests/test_verifier.py    # pytest suite

drizzle/                    # Migration SQL files + snapshots
scripts/                    # smoke-local.mjs, seed-demo.mjs, backfill-embeddings.mjs
```

## Key patterns

- **Graceful degradation**: everything works without external services. No `DATABASE_URL` → local JSON store. No `NVIDIA_API_KEY` → mock solver in dev. No `SYMPY_VERIFIER_URL` → solutions marked "unverifiable". No `UPSTASH_REDIS_*` → in-memory rate limiter.
- **Import alias**: `@/*` maps to `src/*`.
- **New API routes** must use the request-guard patterns from `src/server/guards/` (rate limits, body size limits, Zod validation). Match existing routes.
- **Solve flow**: capture PNG → cache check → NVIDIA NIM streaming → parse steps → SymPy verify → on mismatch, retry once with verifier feedback → stream steps to client via SSE.
- **Auth**: Clerk middleware in `src/middleware.ts`. Public routes are explicitly listed. Demo auth fallback exists for local dev.
- **Quota/billing**: solve quota is reserved before the call and refunded on failure. Lemon Squeezy webhooks (HMAC-verified) handle Pro upgrades.
- **Canvas persistence**: autosave is debounced + gzip-compressed. Canvas state is tldraw JSON.
