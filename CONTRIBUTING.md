# Contributing to InkSolver

Thanks for helping make InkSolver better! This guide is intentionally short.

## Getting set up

```bash
pnpm install
docker compose up -d        # optional: local Postgres (pgvector) + SymPy verifier
cp .env.example .env.local  # no keys required for local development
pnpm dev
```

The app runs fully without API keys in development: persistence falls back to a
local JSON store and solving uses a deterministic mock, so every flow is
testable offline.

## Before you open a PR

Run the same checks CI runs:

```bash
pnpm typecheck
pnpm lint
pnpm build
pnpm smoke:local            # 23-check API suite against your dev server
```

If you touched the verifier:

```bash
cd services/verifier
pip install -r requirements.txt -r requirements-dev.txt
python -m pytest tests/ -q
```

## Guidelines

- **Small, focused PRs** are reviewed fastest. Open an issue first for anything
  architectural.
- **Match the surrounding code** — naming, error handling, and the existing
  request-guard patterns (rate limits, body limits, Zod validation) for any new
  API route.
- **Honest failure modes**: never mask an error with fabricated output. Errors
  must surface to the user with a clear message, and quota must be refunded for
  failed solves.
- **Add coverage**: a smoke check (`scripts/smoke-local.mjs`) for API behavior,
  a Playwright spec (`tests/e2e/`) for UI flows, or a pytest case for verifier
  rules.

## Great first contributions

- New symbolic verification rules in `services/verifier/app/main.py`
  (linear equations, limits, basic chemistry balancing) — pytest makes these
  safe and satisfying
- Additional Playwright specs for canvas flows
- Accessibility and mobile polish
- Documentation and translations

## Reporting bugs

Use the bug template and include: what you drew/did, what you expected, what
happened, browser + device, and a share link if the canvas is public.

## Code of conduct

Be kind, be constructive, assume good intent. Maintainers may edit or close
issues and PRs that don't follow these guidelines.
