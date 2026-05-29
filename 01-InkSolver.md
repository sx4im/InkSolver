# InkSolver — PRD

> AI whiteboard that solves STEM problems as you draw them.

---

## 1. One-liner & Positioning

Drawing-first STEM solver. You sketch a math/physics/chem problem on an infinite canvas, AI solves it in handwritten-style annotations next to your work, with full step-by-step working that's verified for correctness.

Positioning: "Photomath grew up." Not photo-based, not text-based — canvas-native.

---

## 2. Problem

Existing solvers all suck in specific ways:

- **Symbolab / Mathway** — text-only. You type LaTeX-ish input. Students don't think in LaTeX.
- **Photomath / Gauth** — mobile-only, single-snapshot. Can't iterate, can't show your work next to AI's, can't doodle.
- **Brainly** — community Q&A. Slow, often wrong, full of ads.
- **ChatGPT/Claude in browser** — generic, no canvas, has to be coaxed, hallucinates math.

The actual student workflow is: open notebook, write the problem, attempt it, get stuck, want help *at the point you're stuck*. No tool maps to that.

---

## 3. Target Users

**Primary:** 13–22, STEM students globally. Heavy concentration in Commonwealth + Asian school systems where olympiad / O-Level / A-Level / FSc / JEE / IIT prep is a religion.

**Secondary:** Teachers prepping worksheets, parents helping kids with homework, engineering students debugging coursework.

**Personas:**

- **Areeba, 17, A-Level student in Karachi.** Doing P3 pure math past papers. Stuck on a partial fractions problem. Has notebook open. Wants help that respects her existing working.
- **Raj, 19, IIT aspirant in Pune.** Doing JEE Advanced 2023 P2. Wants every step shown because shortcuts cost marks.
- **Maria, 14, Algebra II in Texas.** Photomath gives an answer but doesn't explain *why* step 3 works. She'd ask follow-ups if it were a chat.

---

## 4. Why Now

- **tldraw SDK** released a stable v3 in 2024 with first-class React integration — infinite canvas is no longer a 6-month build.
- **Gemini 2.5 Pro** handles handwritten math from canvas snapshots accurately enough to beat Photomath on multi-step problems.
- **SymPy** is now mature enough to use as a verification backstop — LLM proposes, SymPy verifies, regenerate on mismatch. This is the missing piece older tools couldn't have.
- **studytok** is a viral surface tailor-made for "watch AI destroy this olympiad problem."
- **Cal AI + Gauth proved monetization.** Photo→AI verticals print money on the right wedge.

---

## 5. Core Features (MVP)

### Must-have (V1):

1. **Infinite canvas** — pan, zoom, draw with stylus/finger/mouse. tldraw-based.
2. **Lasso-to-solve** — circle any part of your canvas, hit "Solve". AI reads the selection (sends snapshot to Gemini multimodal).
3. **Solution placement** — AI writes solution as new shapes next to your selection, in a "handwriting" font that visually distinguishes it from your work.
4. **Step-by-step breakdown** — each step is its own collapsible group, color-coded.
5. **Verification badge** — green check if SymPy verified, yellow warn if math couldn't be verified symbolically, red if mismatched.
6. **Follow-up chat** — sidebar where you ask "why step 4?" — context is the canvas + that step.
7. **Subject auto-detect** — algebra, calculus, mechanics, organic chem reactions, balanced equations.
8. **Save / load / share canvas** — anonymous link with optional watermark.
9. **Account + history** — see all past problems.
10. **PDF export** — print a clean PDF of canvas + solutions.

### Nice-to-have (V1.5):

- LaTeX export of solution.
- Voice input ("explain this step").
- Multi-page canvas (for big problem sets).
- Embed widget for blogs / Notion.
- Browser extension to send screenshots from any webpage.

### Explicitly out of scope for V1:

- Multiplayer collaborative canvas (later).
- iPad app (web works on iPad Safari).
- AI generating practice problems (later).

---

## 6. Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | Next.js 15 App Router | Your stack, ISR for public canvases |
| UI | Tailwind + Shadcn | Your stack |
| Canvas | tldraw SDK | Best infinite canvas lib for React |
| State | Zustand (canvas-adjacent), React Query (server data) | Your stack |
| Backend | Node + Express on Cloud Run, or Next.js API routes | Start with API routes, split out later |
| DB | Postgres (Neon serverless) + Drizzle ORM | Your stack |
| Vector | pgvector extension | For semantic problem search (V1.5) |
| AI | Gemini 2.5 Pro (vision), Gemini 2.5 Flash (chat follow-ups) | Multimodal + cost |
| Verifier | SymPy via FastAPI microservice on Cloud Run | Python is the only sane option for symbolic math |
| Auth | Clerk or Lucia | Clerk for speed |
| Payments | Lemon Squeezy | Works for PK devs, handles VAT |
| Storage | Cloudflare R2 | Canvas image snapshots, free egress |
| Analytics | PostHog | Free tier generous |
| Hosting | Vercel (Next.js), Cloud Run (SymPy service) | Free tier covers you |

---

## 7. Database Schema (Drizzle)

```typescript
// users
{
  id: uuid (pk)
  email: text unique
  name: text
  image_url: text
  plan: enum('free', 'pro') default 'free'
  problems_today: int default 0  // resets daily via cron
  reset_at: timestamp
  created_at: timestamp
  stripe_customer_id: text  // lemonsqueezy customer
}

// canvases
{
  id: uuid (pk)
  user_id: uuid fk -> users.id
  title: text
  subject: enum('math', 'physics', 'chem', 'unknown')
  tldraw_state: jsonb  // raw tldraw snapshot
  thumbnail_url: text
  is_public: boolean default false
  share_slug: text unique  // for /c/[slug]
  created_at: timestamp
  updated_at: timestamp
}

// solutions
{
  id: uuid (pk)
  canvas_id: uuid fk -> canvases.id
  region_bounds: jsonb  // {x, y, w, h} of lasso selection
  prompt_image_url: text
  problem_text: text  // extracted/cleaned problem
  steps: jsonb  // array of {step_num, latex, explanation, verified}
  final_answer: text
  verification_status: enum('verified', 'unverifiable', 'mismatch')
  model: text  // e.g. 'gemini-2.5-pro'
  tokens_used: int
  cost_usd: numeric(10,4)
  created_at: timestamp
}

// chat_messages (follow-ups)
{
  id: uuid (pk)
  solution_id: uuid fk -> solutions.id
  role: enum('user', 'assistant')
  content: text
  created_at: timestamp
}

// embeddings (V1.5 — semantic problem search)
{
  id: uuid (pk)
  solution_id: uuid fk
  embedding: vector(768)
  problem_text: text
}

// usage_events (for billing + analytics)
{
  id: uuid (pk)
  user_id: uuid fk
  event_type: text  // 'solve', 'chat', 'export'
  cost_usd: numeric(10,4)
  metadata: jsonb
  created_at: timestamp
}
```

---

## 8. API Routes

All under `/api/v1/`. JSON in, JSON out. Auth via Clerk session token.

| Method | Path | Body / Query | Returns |
|---|---|---|---|
| POST | `/canvases` | `{ title?, subject? }` | `{ canvas_id, share_slug }` |
| GET | `/canvases` | pagination | `{ canvases: [...] }` |
| GET | `/canvases/:id` | — | full canvas + solutions |
| PATCH | `/canvases/:id` | `{ tldraw_state, title? }` | `{ updated_at }` |
| DELETE | `/canvases/:id` | — | `{ ok }` |
| POST | `/canvases/:id/solve` | `{ region_bounds, snapshot_b64 }` | streams SSE: `{step}` events then `{done, solution_id}` |
| POST | `/solutions/:id/chat` | `{ message }` | streams SSE token-by-token |
| POST | `/canvases/:id/export` | `{ format: 'pdf' \| 'png' }` | `{ download_url }` |
| GET | `/me` | — | user + plan + quota |
| POST | `/billing/checkout` | `{ plan }` | `{ checkout_url }` |
| POST | `/webhooks/lemonsqueezy` | (signed) | upgrade/downgrade user |
| POST | `/share/:slug` | — | public read-only canvas |

### Solve flow (the hot path):

```
1. Client: user lassos region → captures snapshot → POST /solve
2. Server: check quota (free = 10/day)
3. Server: upload snapshot to R2
4. Server: call Gemini 2.5 Pro with system prompt + image
   System: "You are a STEM tutor. Read the problem in the image.
            Output JSON: {subject, problem_text, steps: [{latex, explanation}]}"
5. Server: for each step with parseable LaTeX → send to SymPy verifier
   SymPy returns: {verified: bool, computed_value, ours_matches}
6. Server: streams steps to client via SSE as they verify
7. Server: persists solution row, updates user.problems_today
8. Client: places each step on canvas as it arrives
```

### Latency budget: 6s P50, 12s P95. Streaming makes 6s feel like 2s.

---

## 9. UI / UX (Wireframes Described)

### Layout — main app `/c/[id]`:

```
┌──────────────────────────────────────────────────────────────────┐
│  [☰] InkSolver  My Canvas Title          [Share] [Export] [👤]   │  ← topbar 48px
├──────────────────────────────────────────────────────────────────┤
│ ┌──┐                                                              │
│ │✏│                                                               │
│ │🖌│           ┌─────────────────────────┐                        │
│ │○│           │ ∫ x² dx                  │   ← your writing       │
│ │✎│           │                          │                        │
│ │🧹│           │ [drag lasso around]      │                        │
│ │  │           └─────────────────────────┘                        │
│ │📐│              ↑ [⚡ Solve]                                     │
│ │  │                                                               │
│ │+ │           ┌─────────────────────────┐                        │
│ │  │           │ x³/3 + C  ✓ verified    │   ← AI output          │
│ │  │           │ Step 1: power rule...   │      different font    │
│ │  │           │ Step 2: ...             │      blue color        │
│ │  │           └─────────────────────────┘                        │
│ └──┘                                                              │
│                                                          ┌──────┐ │
│                                                          │chat  │ │  ← collapsible
│                                                          │📩    │ │     right panel
│                                                          └──────┘ │
└──────────────────────────────────────────────────────────────────┘
```

### Key interactions:

- **Tool palette (left):** select, pen, marker, eraser, shapes, image upload, AI region selector (lasso with sparkle icon).
- **Lasso + Solve:** user draws lasso → floating action button appears with `⚡ Solve` and `📷 Capture`. Clicking solve fires the solve API.
- **Solution placement:** AI's answer slides in from right of selection, with a connector arrow. Different handwriting-style font (Caveat / Patrick Hand).
- **Step pills:** each step rendered as a draggable, color-coded card. Click → expands to show explanation.
- **Verification badges:** small green ✓ next to each verified step. Yellow ? if unverifiable. Red ✗ + auto-retry if mismatched.
- **Chat sidebar:** right-collapsible. Auto-opens when user clicks a step. Knows context of canvas + that step.

### Other key screens:

- **Dashboard `/`** — grid of past canvases (thumbnails), "New Canvas" button, plan/quota indicator.
- **Public view `/s/[slug]`** — read-only canvas, "Copy & remix" CTA, watermark if free user's canvas.
- **Settings `/settings`** — account, billing, history export.
- **Onboarding** — 3-step: pick subject preference, draw something, hit solve. Done in <60s.

### Mobile (responsive PWA — V1.5):

Canvas works on iPad Safari out of the box via tldraw. Phone is too small to be useful for canvas — show a "use a tablet or desktop" message but offer a photo-upload-only fallback.

---

## 10. Monetization

| Tier | Price | What you get |
|---|---|---|
| Free | $0 | 10 solves/day, 5 active canvases, watermark on shares, AdSense banner |
| Pro | $5.99/mo or $39/year | Unlimited solves, unlimited canvases, no watermark, PDF export, chat follow-ups, priority Gemini Pro |
| Pro Annual | $39/yr | Same as Pro, 45% off |

Lemon Squeezy handles checkout + tax + EU VAT. They wire USD to Payoneer → HBL.

**Unit economics target (Pro):**
- Average user: 30 solves/month × $0.008 Gemini cost = $0.24
- SymPy compute (Cloud Run): $0.05
- Storage + bandwidth: $0.10
- **Total COGS per Pro user: ~$0.40**
- Lemon Squeezy fee: 5% + $0.50 = ~$0.85
- **Net: ~$4.74/mo per Pro user.** Healthy.

**Free user economics:**
- 10 solves/day × 30 days = 300 max. Most use 3-5/day = ~75/mo.
- 75 × $0.008 = $0.60/mo cost
- AdSense banner @ $0.50–1.50 RPM in Tier-2 markets × ~30 sessions = $0.30–0.90/mo revenue
- **Net: -$0.30 to +$0.30.** Roughly break-even. Free tier funded by Pro conversions.

**Target:** 3% free → Pro conversion. With 50K free MAU, that's 1,500 Pro × $5.99 = $9K MRR.

---

## 11. Growth & Distribution

- **studytok / mathtok** — film "watch AI solve a 2023 IMO problem live." Post-prep season spikes (Sept–Oct, March–May).
- **Reddit:** r/learnmath, r/IBO, r/JEE, r/ALevels, r/APStudents.
- **SEO:** programmatic landing pages for "[topic] solver" — `/solve/integration-by-parts`, `/solve/projectile-motion`, etc. Indexable public canvases for popular problems.
- **YouTube partnerships:** sponsor exam-prep YouTubers (organic chemistry tutor, ExamSolutions, etc.) for $200–500/video.
- **Discord servers:** O-Level / A-Level / IB Discord communities have 50K+ members each. Free Pro for top 5 members per server.
- **Product Hunt launch** at week 8.
- **Hacker News** — angle as "we use SymPy to verify GPT's math because LLMs hallucinate."

---

## 12. Sprint Plan (8–10 weeks solo)

### Week 1 — Setup + Canvas
- [ ] Next.js + Tailwind + Shadcn + Drizzle + Clerk auth scaffold
- [ ] Postgres on Neon, run first migration
- [ ] tldraw integrated, basic save/load via PATCH endpoint
- [ ] Deploy to Vercel, custom domain
- **Done when:** you can log in, draw on infinite canvas, refresh page, work persists.

### Week 2 — Solve flow MVP (single-shot, no verification)
- [ ] Lasso → snapshot capture (tldraw API gives you bounds + PNG)
- [ ] Upload snapshot to R2
- [ ] POST `/api/v1/canvases/:id/solve` → Gemini 2.5 Pro with structured output (JSON schema)
- [ ] Render solution as new tldraw shapes (text + LaTeX rendered via KaTeX)
- [ ] Store solution in DB
- **Done when:** you can lasso "∫ x² dx", click Solve, see "x³/3 + C" appear next to it within 8s.

### Week 3 — SymPy verifier microservice
- [ ] FastAPI service on Cloud Run with one endpoint: POST `/verify` { latex_problem, latex_steps[] }
- [ ] Returns per-step verified bool + final answer match
- [ ] Wire into solve flow — call after Gemini, attach verification status
- [ ] Verification badge UI on solution cards
- **Done when:** solving "d/dx(sin x)" returns "cos x" with green ✓; solving "d/dx(sin x) = -cos x" returns red ✗.

### Week 4 — Streaming + chat follow-ups
- [ ] Convert solve endpoint to SSE — stream each step as it's verified
- [ ] Right-side chat sidebar (Shadcn Sheet)
- [ ] POST `/solutions/:id/chat` SSE streaming
- [ ] Chat history persisted
- **Done when:** steps appear progressively (not all at once), and clicking "why step 3?" gives you a streamed explanation.

### Week 5 — Auth flows + quotas + billing
- [ ] Clerk webhooks → create user row
- [ ] Daily cron (Vercel cron) resets `problems_today` for free users
- [ ] Lemon Squeezy product + checkout link
- [ ] Webhook handler upgrades user to Pro
- [ ] Quota enforcement on solve endpoint (return 429 with upgrade CTA)
- **Done when:** free user hits 10 solves, sees paywall, can pay $5.99, becomes Pro, unlimited works.

### Week 6 — Sharing + public canvases + export
- [ ] Public canvas page `/s/[slug]` (server-rendered, indexable)
- [ ] OG image generation (Vercel @vercel/og) showing canvas thumbnail
- [ ] PDF export via `puppeteer-core` + chromium-aws-lambda
- [ ] Watermark on free shares
- **Done when:** you share a canvas, get a clean preview card on Twitter, recipient sees a read-only beautiful page.

### Week 7 — Polish + onboarding + dashboard
- [ ] Empty-state designs
- [ ] 3-step onboarding flow
- [ ] Dashboard with canvas grid, thumbnails (server-generated)
- [ ] Settings page (account, plan, history)
- [ ] Better error states (Gemini timeout, SymPy down, etc.)
- **Done when:** a brand-new user can land on homepage, sign up, complete onboarding, and solve their first problem in under 90 seconds.

### Week 8 — Performance + analytics + soft launch
- [ ] PostHog wired up (funnel: signup → first solve → second solve → return next day)
- [ ] Sentry for error monitoring
- [ ] Lighthouse passes (canvas page lazy-loads tldraw)
- [ ] Edge caching for public canvases
- [ ] Soft launch to 50 friends + 3 student Discords
- **Done when:** P95 solve latency <12s, no JS errors in Sentry for 48h, first 10 organic signups.

### Week 9 (buffer) — feedback fixes + ProductHunt prep
- [ ] Top 5 bugs from soft launch
- [ ] ProductHunt assets (gallery, GIF, 60s demo video)
- [ ] Twitter launch thread
- [ ] HN "Show HN: We use SymPy to verify GPT's math"

### Week 10 — Public launch
- [ ] ProductHunt Tuesday launch
- [ ] HN Show HN same day
- [ ] Twitter thread
- [ ] Email to friends + first 50 testers asking for shares
- **Target:** 1,000 signups week 1, 50 Pro conversions, $300 MRR by end of week 10.

---

## 13. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Gemini Pro hallucinates math, even with SymPy fallback | Use structured output (JSON schema), regenerate up to 2x on verification failure, show low-confidence warning when retries fail |
| tldraw canvas snapshots → Gemini OCR is weak on bad handwriting | Show "couldn't read clearly — try rewriting" UI, suggest using image upload as fallback |
| Cost spirals if free users abuse | Hard quota (10/day), aggressive caching of identical problem hashes, rate limiting at IP level |
| Students share Pro accounts | Device fingerprinting + concurrent session limit (2) |
| Gauth/Photomath ships a web canvas version | Move fast. Their orgs are slow. Ship in 8 weeks while they're in roadmap meetings. |
| LaTeX rendering on canvas is fiddly | Use KaTeX, pre-render to SVG, embed as tldraw image shape |

---

## 14. Success Metrics

**By month 3:**
- 10K MAU
- 4.5+ rating on PH / G2
- 2% free → Pro conversion
- $500 MRR
- 35% D1 retention (industry: 25%)

**By month 6:**
- 100K MAU
- $5K MRR
- featured in r/ALevels weekly study tips
- 1 viral TikTok with 500K+ views

**By month 12:**
- 500K MAU
- $30K MRR
- Mentioned in The Verge / TechCrunch student-AI roundup
