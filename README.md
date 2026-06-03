# InkSolver

**AI whiteboard that solves STEM problems as you draw them.**

Draw equations, diagrams, or math problems on an infinite canvas — InkSolver uses multimodal AI to analyze your sketches and return step-by-step solutions with LaTeX formatting.

[![Live Demo](https://img.shields.io/badge/Live%20Demo-inksolver.vercel.app-blue)](https://inksolver.vercel.app)
[![Next.js](https://img.shields.io/badge/Next.js-14-black)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)](https://www.typescriptlang.org/)
[![Clerk](https://img.shields.io/badge/Auth-Clerk-6C47FF)](https://clerk.com/)
[![PostgreSQL](https://img.shields.io/badge/DB-PostgreSQL-336791)](https://www.postgresql.org/)
[![License](https://img.shields.io/badge/License-MIT-green)](LICENSE)

## Features

- **Infinite Canvas** — Powered by [tldraw](https://tldraw.com/), draw freely with pen, shapes, text, and images
- **AI-Powered Solving** — Select any region and get step-by-step solutions using NVIDIA NIM (StepFun vision model)
- **STEM-Focused** — Math, Physics, and Chemistry problem recognition
- **LaTeX Export** — Download solutions as PDF or LaTeX
- **Real-time Collaboration** — Share canvases with public links
- **Chat Assistant** — Ask follow-up questions about any solution step
- **Verification Engine** — Symbolic verification via SymPy to catch errors

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14 (App Router), React, TypeScript, Tailwind CSS |
| Whiteboard | tldraw |
| Auth | Clerk |
| Database | PostgreSQL (Neon) + Drizzle ORM |
| AI Solver | NVIDIA NIM API (StepFun `step-3.7-flash`) |
| Verification | Python + FastAPI + SymPy |
| Storage | Cloudflare R2 |
| Analytics | PostHog |
| Error Tracking | Sentry |

## Architecture

```
InkSolver/
├── src/
│   ├── app/                 # Next.js App Router
│   ├── components/          # React components (canvas, UI, brand)
│   ├── server/              # Backend logic (auth, solving, verification)
│   └── db/                  # Drizzle schema & client
├── services/verifier/       # Python FastAPI symbolic verification service
├── public/                  # Static assets (logo, favicon)
└── tests/                   # Playwright E2E tests
```

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm
- Python 3.11+ (for verifier service)
- PostgreSQL database (or Neon account)

### Environment Variables

Copy `.env.example` to `.env.local` and fill in:

```bash
# Required
NEXT_PUBLIC_APP_URL=https://inksolver.vercel.app
DATABASE_URL=postgresql://...
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
NVIDIA_API_KEY=nvapi-...
NVIDIA_MODEL=stepfun-ai/step-3.7-flash

# Optional
NEXT_PUBLIC_TLDRAW_LICENSE_KEY=        # Get free at tldraw.com/pricing
CLOUDFLARE_R2_ACCOUNT_ID=
CLOUDFLARE_R2_ACCESS_KEY_ID=
CLOUDFLARE_R2_SECRET_ACCESS_KEY=
CLOUDFLARE_R2_BUCKET=
CLOUDFLARE_R2_PUBLIC_URL=
SYMPY_VERIFIER_URL=
LEMON_SQUEEZY_CHECKOUT_URL=
LEMON_SQUEEZY_WEBHOOK_SECRET=
POSTHOG_KEY=
POSTHOG_HOST=
SENTRY_INGEST_URL=
```

### Installation

```bash
# Clone the repo
git clone https://github.com/sx4im/InkSolver.git
cd InkSolver

# Install dependencies
pnpm install

# Set up database
pnpm db:push

# Run dev server
pnpm dev
```

The app will be available at `http://localhost:3000`.

### Run the Verifier Service (Optional)

```bash
cd services/verifier
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

## Deployment

### Vercel (Frontend)

1. Connect your GitHub repo to Vercel
2. Add all environment variables in Vercel Dashboard
3. Deploy — Vercel auto-builds on every push to `main`

### Verifier Service

Deploy `services/verifier/` to any Python host (Railway, Fly.io, or as a Vercel experimental service).

## Screenshots

| Canvas | Solution | Chat |
|--------|----------|------|
| Draw freely on infinite whiteboard | Get step-by-step LaTeX solutions | Ask follow-up questions |

## Roadmap

- [x] AI solve with vision models
- [x] Symbolic verification
- [x] PDF/LaTeX export
- [x] Public canvas sharing
- [ ] Pro subscription tier
- [ ] Mobile app (React Native)
- [ ] Real-time multiplayer cursors
- [ ] OCR for handwritten text

## Contributing

Contributions welcome! Please open an issue first to discuss what you'd like to change.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

Distributed under the MIT License. See [LICENSE](LICENSE) for more information.

---

Built with passion by [Saim Shafique](https://github.com/sx4im) and AI.
