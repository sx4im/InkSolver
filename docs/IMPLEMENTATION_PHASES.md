# InkSolver Implementation Phases

This plan is derived from `01-InkSolver.md` and `DESIGN.md`. The project is intentionally split into more phases than the PRD sprint plan so each layer can be verified before the next one depends on it.

## Current Status

- Phase 0 is complete: PRD and design constraints are mapped into this plan.
- Phase 1 is complete: the Next.js shell, dashboard, canvas workspace, share/settings/onboarding surfaces, tldraw mount, schema stubs, and PRD-shaped API routes are in place.
- Phase 2 is in progress: Drizzle config, migration baseline, repository layer, local JSON fallback persistence, and tldraw snapshot save/load wiring are implemented. A real Neon/Postgres `DATABASE_URL` is still needed before database migrations can be applied against external infrastructure.
- Phase 3 is complete for the local/integrated MVP path: selected tldraw shapes can be exported to PNG client-side, solve requests stream over SSE, prompt images upload to Cloudflare R2 when credentials exist and fall back to local storage otherwise, Gemini REST structured-output integration is implemented behind `GEMINI_API_KEY`, mock solving persists solutions when no key is configured, and completed solutions are placed back onto the tldraw canvas as handwritten-style text shapes. Production Gemini/R2 credentials still need environment validation.
- Phase 4 is in progress: a FastAPI SymPy verifier service exists for power-rule integrals and simple derivatives, the Next.js solve path calls `SYMPY_VERIFIER_URL` with a local power-rule fallback, mismatch results trigger one corrected solve attempt, and solution cards now expose step-level verification states. Cloud Run deployment and broader math coverage remain later work.
- Phase 5 is in progress: `/api/v1/solutions/:id/chat` now streams persisted, solution-scoped follow-up answers, uses Gemini Flash when `GEMINI_API_KEY` is configured with local contextual fallback otherwise, and the right sidebar can target the active solution or a selected step.
- Phase 6 is in progress: free-plan solve quota enforcement, solve/chat usage events, checkout API behavior, local development upgrades, Lemon Squeezy webhook plan updates, and dashboard/settings quota surfaces are implemented. Clerk session-backed auth and live Lemon checkout credentials remain external integration work.
- Phase 7 is in progress: public share routes now enforce `isPublic`, tldraw public canvases mount read-only, share metadata is generated for OG consumers, PDF/PNG export artifacts are created locally, export usage is recorded, and free exports/shares keep a watermark.
- Phase 8 is in progress: onboarding is now an interactive 3-step first-use flow with subject selection and canvas creation, dashboard empty states avoid dead-end `/c/new` links, canvas solve errors distinguish quota exhaustion, and follow-up chat opens as a mobile drawer.
- Phase 9 is in progress: local-first observability records solve latency, web vitals, telemetry, and errors into usage events; `/api/v1/observability/summary` exposes solve P50/P95 and recent errors; PostHog/Sentry-compatible forwarding hooks are available through environment variables; public share API/page caching is configured.
- Phase 10 is in progress: beta hardening now adds bounded request parsing, per-IP abuse throttles, solve snapshot MIME/size validation, security telemetry for rejected requests, baseline browser security headers, hardened local file path containment, and launch/security checklists. Production auth, shared rate-limit storage, live billing, external observability, and hosted verifier/database/object storage remain release gates.
- Phase 11 is in progress: local-first auth context now resolves request users from dev/test headers or environment fallback, maps non-UUID provider subjects to stable UUIDs, creates/syncs user records, scopes private canvases/solutions/chat/usage to the current user, and keeps public share reads separate from private workspace reads. Clerk middleware/session wiring remains the production integration gate.
- Phase 12 is in progress: the free-plan active canvas cap is enforced, canvas creation returns a paywall-shaped response at the 5-canvas limit, dashboard/settings surfaces show active-canvas usage, and settings can export the current user's profile, canvases, solutions, chat messages, and usage events as JSON.
- Phase 13 is in progress: the SymPy verifier local environment is reproducible with service-local dev requirements, tests now run in a `.venv`, and derivative verification covers the PRD-critical `d/dx(sin x) = cos x` success and `-cos x` mismatch cases.
- Phase 14 is in progress: public share metadata now includes a generated 1200x630 social preview image for Open Graph/Twitter cards, backed by a cacheable image route that renders the canvas title, subject, sample work, latest solution, and verification states.
- Phase 15 is in progress: canvas sharing now has a publish/copy/open/unpublish lifecycle in the workspace header, public shares expose real copy/remix actions, and remixing a public canvas creates a private editable copy with the source snapshot and solution history.
- Phase 16 is in progress: launch readiness is exposed through `/readiness` and `/api/v1/readiness`, tester reports can be captured through `/feedback`, `pnpm smoke:local` automates the local beta checklist against a running app while restoring `.data` afterward, and production guardrails now fail closed for demo auth, trusted headers, unsigned webhooks, diagnostics, and local artifact routes.
- Phase 17 is complete: solution answers, step expressions, follow-up chat, onboarding samples, the demo prompt, and dashboard thumbnails now render real math with KaTeX instead of raw LaTeX source, the on-canvas placed solution uses a Unicode-readable conversion, and the unused `zustand` dependency was removed.

## Phase 0 — Product + Design Alignment

Goal: Convert the PRD and design system into build constraints.

Deliverables:
- Product scope mapped from canvas, solving, verification, chat, sharing, export, billing, and launch polish.
- UI system mapped from `DESIGN.md`: white canvas, near-black ink actions, editorial spacing, restrained type, signature coral/forest/dark surfaces, small radii, minimal shadow.
- Phase plan committed in this document.

Done when:
- The team can point to the source PRD/design requirements behind each major build decision.

## Phase 1 — Application Foundation

Goal: Establish a working Next.js 15 App Router product shell.

Deliverables:
- Next.js, TypeScript, Tailwind, shadcn-style primitives, lucide icons.
- Dashboard `/`, canvas workspace `/c/[id]`, public share `/s/[slug]`, onboarding, settings.
- tldraw mounted in the canvas route.
- Mock data and route handlers matching the PRD API shape.
- Drizzle schema stub for the PRD entities.

Done when:
- The app runs locally, renders the dashboard and canvas workspace, and a placeholder solve interaction proves the UI flow.

## Phase 2 — Persistence + Canvas State

Goal: Make canvases durable.

Deliverables:
- Neon Postgres connection, Drizzle migrations, server-side canvas CRUD.
- tldraw snapshot save/load through `/api/v1/canvases/:id`.
- Thumbnail generation placeholder and updated dashboard cards.

Done when:
- A user can draw, refresh, and see the same canvas restored from the database.

## Phase 3 — Solve Flow MVP

Goal: Solve a selected canvas region without verification.

Deliverables:
- Region selection/lasso affordance.
- Snapshot capture and R2 upload.
- Gemini structured-output call.
- Solution cards placed near the selection and persisted.

Done when:
- A handwritten `integral x^2 dx` produces `x^3/3 + C` on the canvas within the target latency band.

## Phase 4 — SymPy Verification

Goal: Add mathematical trust signals.

Deliverables:
- FastAPI verifier service for symbolic math checks.
- LaTeX-to-SymPy parsing strategy for supported classes.
- Green/yellow/red verification statuses in solution UI.
- Retry-on-mismatch behavior in the solve path.

Done when:
- Correct derivative/integral examples verify green and deliberately wrong examples produce a mismatch.

## Phase 5 — Streaming + Follow-Up Chat

Goal: Make solving feel live and explainable.

Deliverables:
- SSE solve endpoint.
- Step-by-step progressive rendering.
- Right chat sidebar with solution-step context.
- Persisted chat history.
- Gemini Flash follow-up generation with deterministic local fallback.

Done when:
- Steps appear progressively and "why this step?" streams a contextual explanation.

## Phase 6 — Auth, Quotas, Billing

Goal: Enforce the product model.

Deliverables:
- Clerk auth and user sync.
- Free/pro quota accounting.
- Lemon Squeezy checkout and webhook handling.
- Upgrade/paywall states.
- Local development fallback for testing plan upgrades without payment credentials.

Done when:
- Free users stop at 10 solves/day and paid users are upgraded automatically.

## Phase 7 — Sharing + Export

Goal: Turn solved canvases into shareable artifacts.

Deliverables:
- Public read-only canvas page.
- Share slug lifecycle and watermark rules.
- PDF/PNG export.
- OG image generation.

Done when:
- Shared canvases render cleanly for logged-out users and export to a polished PDF.

## Phase 8 — Onboarding + Product Polish

Goal: Make first use self-explanatory without marketing fluff.

Deliverables:
- 3-step onboarding.
- Empty states, error states, timeout handling.
- Better dashboard, settings, and account surfaces.
- Mobile/tablet behavior per PRD.

Done when:
- A new user can sign up and solve a first problem in under 90 seconds.

## Phase 9 — Observability + Performance

Goal: Prepare for controlled launch.

Deliverables:
- PostHog funnels.
- Sentry.
- Lighthouse and bundle checks.
- Public canvas caching.
- Solve latency instrumentation.

Done when:
- P95 solve latency is measurable, public pages are cacheable, and client errors are visible.

## Phase 10 — Beta Launch Hardening

Goal: Convert the working product into a launchable beta.

Deliverables:
- Top feedback fixes.
- Security and abuse checks.
- Demo content and launch assets.
- Soft-launch checklist.
- Request size limits and throttles on write-heavy endpoints.
- Production integration checklist for auth, database, storage, billing, AI, verifier, and observability.

Done when:
- The product can be put in front of the first 50 testers without known critical gaps.

## Phase 11 — Auth Context + Tenancy

Goal: Remove the single-demo-user assumption before production auth is wired.

Deliverables:
- Request-scoped user resolution with local development fallback.
- Stable user IDs for Clerk-style provider subjects.
- Automatic local/DB user creation and profile sync.
- Private canvas, solution, chat, and usage reads scoped to the current user.
- Public share reads that do not require ownership but still require `isPublic`.

Done when:
- Two different request identities can create private canvases without seeing or mutating each other's work, while public share links still render for logged-out visitors.

## Phase 12 — Account Controls + Plan Limits

Goal: Make the account model match the PRD's free/pro limits and history-export requirement.

Deliverables:
- Free-plan active canvas limit enforcement.
- Upgrade-ready API error when canvas creation is blocked by plan limits.
- Dashboard/settings visibility for active canvas usage.
- Account history export from settings.
- Current-user scoped export data for profile, canvases, solutions, chat, and usage events.

Done when:
- A free user with 5 active canvases cannot create another private canvas, Pro/local-upgraded users can, and settings downloads only the current user's history.

## Phase 13 — Verifier Coverage + Reproducibility

Goal: Make the symbolic verification service easier to trust and run locally.

Deliverables:
- Service-local development requirements for running verifier tests.
- Documented local setup that installs both runtime and test dependencies.
- Trig/log/sqrt-aware parser locals for common calculus notation.
- Derivative extraction for `d/dx(...)` and LaTeX derivative notation.
- Tests for the PRD's `d/dx(sin x)` success and mismatch cases.

Done when:
- The verifier test suite passes from a fresh service-local virtualenv and includes both verified and mismatched trig derivative examples.

## Phase 14 — Share Preview Images

Goal: Make shared canvases look launch-ready when posted to social surfaces.

Deliverables:
- Dynamic share preview image route for public canvases.
- Open Graph and Twitter metadata pointing to the generated image.
- Editorial visual treatment aligned to the `DESIGN.md` canvas/ink/signature-surface system.
- Public cache headers for social crawlers.

Done when:
- A public share URL exposes metadata with a large preview image and the preview endpoint returns a valid 1200x630 PNG.

## Phase 15 — Share Lifecycle + Remix

Goal: Make sharing an actual user workflow instead of a static public route.

Deliverables:
- Workspace controls for publishing, copying, opening, and unpublishing a share link.
- Public share actions for copying the URL and remixing into the current user's workspace.
- API route for remixing a public canvas.
- Remix persistence for copied canvas state and solution history.
- Plan-limit handling when a free user tries to remix beyond the active canvas cap.

Done when:
- A private canvas can be published from the workspace, the public link can be copied/opened, unpublishing hides it again, and a public share can be remixed into a private editable canvas owned by another local/dev identity.

## Phase 16 — Beta Completion Tooling

Goal: Make the project operationally complete for local beta and explicit about production blockers.

Deliverables:
- Production readiness report for database, auth, AI, storage, verifier, billing, analytics, errors, and public app URL configuration.
- `/readiness` UI and `/api/v1/readiness` JSON endpoint that expose blocked/warning/ready gates without leaking secret values.
- `/feedback` tester report flow and `/api/v1/feedback` telemetry capture for subject, device, expected answer, actual answer, notes, and optional share URL.
- `pnpm smoke:local` script that verifies create, solve, chat, sharing, remix, OG image, export, account export, request guards, quota, active canvas limits, rate limiting, observability, and unpublish behavior against a running local server.
- Rollback note for disabling paid checkout.
- Production guardrails that keep local-only auth, unsigned webhooks, internal diagnostics, and local artifact URLs from silently shipping open.

Done when:
- The local beta smoke script passes, readiness reports the missing external service gates clearly, and tester feedback can be submitted without adding a separate database table.

## Phase 17 — Rendered Math (KaTeX)

Goal: Show students typeset math instead of raw LaTeX source, closing the PRD's "LaTeX rendered via KaTeX" requirement.

Deliverables:
- A shared, isomorphic `Formula` component (server- and client-safe via `katex.renderToString`) plus a `MathProse` renderer for chat answers that contain inline/display math delimited by `$...$`, `$$...$$`, `\(...\)`, or `\[...\]`.
- KaTeX stylesheet loaded globally; KaTeX-bundled fonts (no external font fetch).
- Solution cards, the follow-up chat header/step/messages, onboarding samples, the canvas demo prompt, and dashboard thumbnails render with KaTeX.
- Graceful fallback to the raw expression in the handwriting face when an expression cannot be parsed (bad OCR / partial stream).
- `latexToReadable` Unicode conversion (`src/lib/latex.ts`) so on-canvas placed solution shapes read as `∫ x² dx` rather than `\int x^2\,dx`; PDF/PNG exports keep their ASCII-safe `plain()` text because their base-14 PDF font cannot embed Unicode math glyphs.
- Local chat answers wrap embedded expressions in `$...$`, and the Gemini follow-up prompt asks for the same so streamed answers render.
- Removed the unused `zustand` dependency.

Done when:
- A solved canvas shows a typeset fraction/integral on the side card and the public share page, onboarding shows typeset subject samples, and no surface renders literal `\frac`/`\int` source to the reader.
