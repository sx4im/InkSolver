# InkSolver Verifier

FastAPI service for symbolic math verification. It is intentionally narrow at this phase: supported checks cover single-variable power-rule integrals and derivatives, including common trig/log/sqrt notation, with unsupported subjects returning `unverifiable` instead of guessing.

## Run locally

```bash
cd services/verifier
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements-dev.txt
uvicorn app.main:app --host 0.0.0.0 --port 8001
```

Point the Next.js app at it with:

```bash
SYMPY_VERIFIER_URL=http://localhost:8001
```

## Test

```bash
cd services/verifier
. .venv/bin/activate
python -m pytest
```
