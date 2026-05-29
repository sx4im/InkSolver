# InkSolver Beta Launch Checklist

Use this as the soft-launch gate for the first 50 testers. Items marked local-ready are implemented for the repo's current local-first path; production-ready means external services have been configured and verified.

## Ship Gate

- [x] Local canvas create, save, solve, follow-up chat, share, and export flows work end to end.
- [x] Solution answers, steps, chat, onboarding, and thumbnails render typeset math (KaTeX); on-canvas solutions use Unicode-readable math.
- [x] Write endpoints have bounded JSON/body parsing.
- [x] Solve snapshots are restricted to base64 PNG, JPEG, or WebP images up to 4 MB decoded.
- [x] Solve, chat, export, billing, canvas writes, telemetry, and webhooks have in-memory per-IP throttles.
- [x] Browser responses include baseline security headers.
- [x] Local export and snapshot file routes reject traversal outside `.data`.
- [x] Rejected abusive requests are logged as security telemetry.
- [x] Local/dev request identities are isolated from each other for private canvases, solutions, and chat.
- [x] Free users are blocked at 5 active canvases with an upgrade-ready API response.
- [x] Settings exports current-user account history as JSON.
- [x] SymPy verifier tests run from a service-local virtualenv and cover `d/dx(sin x)` verification/mismatch.
- [x] Public share pages expose generated Open Graph/Twitter preview images.
- [x] Workspace sharing supports publish, copy link, open public view, unpublish, and public remix.
- [x] `/readiness` and `/api/v1/readiness` expose production launch gates without leaking secret values.
- [x] `/feedback` captures beta tester reports as telemetry.
- [x] `pnpm smoke:local` automates the local beta checklist against a running server and restores `.data` afterward.
- [x] Production runtime guardrails fail closed for trusted request headers, demo auth fallback, unsigned webhooks, internal diagnostics, and local artifact routes.
- [ ] Production database is configured with `DATABASE_URL` and migrations applied.
- [ ] Clerk session-backed auth replaces the demo user before inviting untrusted testers.
- [ ] `INKSOLVER_ADMIN_TOKEN` is configured for internal readiness and observability checks.
- [ ] Gemini and R2 production credentials are configured and smoke-tested.
- [ ] SymPy verifier is deployed and `SYMPY_VERIFIER_URL` is set.
- [ ] Lemon Squeezy checkout and webhook signatures are verified against live/sandbox events.
- [ ] PostHog and Sentry ingestion keys are configured and receiving events.

## Manual Smoke Tests

- Automated local coverage: start `pnpm dev --hostname 0.0.0.0`, then run `pnpm smoke:local`. The script covers the items below that can be verified without external production services.
- [ ] Create a canvas from onboarding and dashboard.
- [ ] Draw or paste a handwritten problem, solve it, and confirm streamed steps render on the canvas.
- [ ] Ask at least two follow-up questions against a solution and a specific step.
- [ ] Toggle public sharing, load the `/s/:slug` page in a signed-out browser, and confirm it is read-only.
- [ ] Remix a public share as another identity and confirm it creates a private editable copy with copied solutions.
- [ ] Paste a public share URL into a social-card debugger and confirm the generated preview image appears.
- [ ] Export PDF and PNG, then open both downloads.
- [ ] Hit the free-plan solve quota and confirm the upgrade state is clear.
- [ ] Hit the free-plan active canvas limit and confirm canvas creation is blocked without affecting Pro/local-upgraded users.
- [ ] Download settings history export and confirm it contains only the current user's canvases, solutions, chat messages, and usage events.
- [ ] Submit invalid JSON, an oversized body, and an unsupported snapshot MIME type to confirm 400/413/415 responses.
- [ ] Confirm repeated solve/chat/export requests eventually return 429 with `Retry-After`.
- [ ] Confirm two identities using `x-inksolver-user-id` cannot access each other's private `/c/:id` API data.
- [ ] Confirm `/api/v1/observability/summary` shows solve latency, errors, web vitals, and security telemetry.

## Launch Operations

- [x] Seed one polished demo canvas with calculus, physics, and chemistry examples.
- [x] Prepare a tester feedback form with fields for subject, expected answer, actual answer, device, notes, and optional share URL.
- [x] Add a rollback note for disabling paid checkout by unsetting `LEMON_SQUEEZY_CHECKOUT_URL`.
- [ ] Review public share examples for private information before using them in demos.
- [ ] Monitor solve latency and verification mismatch rate after the first 10 testers.

## Paid Checkout Rollback

To disable paid checkout during beta, unset `LEMON_SQUEEZY_CHECKOUT_URL` and redeploy. The checkout API will stop returning an external payment URL and the settings page will show the local/unconfigured checkout state. Keep `LEMON_SQUEEZY_WEBHOOK_SECRET` set in production whenever webhooks remain enabled.

## Known Beta Limits

- The current rate limiter is process-local. It is useful for local/serverful beta runs, but production serverless or multi-instance deployments need a shared store such as Upstash Redis, Vercel KV, or Postgres-backed counters.
- PDF export is a lightweight server-rendered artifact, not a browser-faithful canvas print.
- The local `.data` store is for development and demos only. Production beta should run on Postgres and object storage.
- Production auth still needs Clerk middleware/session wiring. The current ownership layer is local-first and accepts trusted dev/test headers.
