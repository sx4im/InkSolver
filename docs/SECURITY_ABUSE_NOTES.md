# InkSolver Security and Abuse Notes

## Implemented Guards

- `src/server/request-guards.ts` centralizes request body limits, JSON validation, snapshot checks, and per-IP throttling.
- JSON endpoints read text first and enforce byte caps before parsing.
- Solve snapshots must be valid base64 PNG, JPEG, or WebP images and decode to no more than 4 MB.
- Rejected bodies, validation failures, unsupported snapshots, and throttled requests are recorded as telemetry with `kind: "security"`.
- `next.config.ts` sets `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, and a minimal `Permissions-Policy` on every route. HSTS is added in production.
- Local file-serving routes use `path.relative` containment checks before reading from `.data`.
- Private workspace reads and writes are scoped to the current local/dev request identity. Public share reads use a separate `isPublic` path.
- Request-header identities are trusted only outside production unless `INKSOLVER_TRUST_REQUEST_HEADERS=true` is set explicitly.
- Production demo auth fallback is disabled unless `INKSOLVER_ALLOW_DEMO_AUTH=true` is set explicitly.
- `/api/v1/readiness` and `/api/v1/observability/summary` require `Authorization: Bearer $INKSOLVER_ADMIN_TOKEN` in production.
- Local `.data` export/snapshot file routes are disabled in production unless `INKSOLVER_ENABLE_LOCAL_FILE_ROUTES=true` is set explicitly.

## Rate Limits

| Limit | Window | Max |
| --- | ---: | ---: |
| Solve | 60s | 12 |
| Chat | 60s | 60 |
| Export | 60s | 20 |
| Canvas create | 60s | 30 |
| Canvas write/delete | 60s | 90 |
| Telemetry | 60s | 120 |
| Billing checkout | 5m | 10 |
| Lemon Squeezy webhook | 60s | 240 |

These limits are intentionally generous enough for normal beta workflows and strict enough to block accidental loops or simple abuse.

## Production Follow-Ups

- Move rate-limit state to shared storage before deploying to multiple instances.
- Wire Clerk middleware/session identity into the auth context before inviting untrusted production users.
- Add a CSP only after testing tldraw, Next.js script hydration, analytics, R2 images, Clerk, and Lemon Squeezy redirects together.
- Add virus/malware scanning if future uploads allow files beyond canvas snapshots.
- Lemon Squeezy webhooks fail closed in production when `LEMON_SQUEEZY_WEBHOOK_SECRET` is missing. Unsigned webhook testing is only allowed outside production.
