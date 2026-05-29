type ReadinessStatus = "ready" | "warning" | "blocked";

export type ReadinessCheck = {
  id: string;
  label: string;
  description: string;
  status: ReadinessStatus;
  configured: boolean;
  requiredEnv: string[];
  action: string;
};

export type ReadinessReport = {
  generatedAt: string;
  summary: {
    ready: number;
    warning: number;
    blocked: number;
    total: number;
    productionReady: boolean;
  };
  checks: ReadinessCheck[];
};

type CheckDefinition = {
  id: string;
  label: string;
  description: string;
  requiredEnv: string[];
  action: string;
  warning?: boolean;
};

const checks: CheckDefinition[] = [
  {
    id: "database",
    label: "Production database",
    description: "Neon/Postgres persistence for canvases, solutions, users, chat, and usage events.",
    requiredEnv: ["DATABASE_URL"],
    action: "Set DATABASE_URL and run pnpm db:migrate against the production database.",
  },
  {
    id: "auth",
    label: "Clerk auth",
    description: "Session-backed identity for untrusted testers instead of trusted local headers.",
    requiredEnv: ["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "CLERK_SECRET_KEY"],
    action: "Install and wire Clerk middleware/session resolution before public beta traffic.",
  },
  {
    id: "admin",
    label: "Admin gate",
    description: "Bearer token protecting readiness and observability diagnostics in production.",
    requiredEnv: ["INKSOLVER_ADMIN_TOKEN"],
    action: "Set INKSOLVER_ADMIN_TOKEN and pass it as Authorization: Bearer <token> for internal diagnostics.",
  },
  {
    id: "ai",
    label: "Gemini solver",
    description: "Gemini vision/chat credentials for live multimodal solve and follow-up generation.",
    requiredEnv: ["GEMINI_API_KEY", "GEMINI_MODEL", "GEMINI_CHAT_MODEL"],
    action: "Set Gemini keys/models and smoke-test one handwritten solve plus one follow-up.",
  },
  {
    id: "storage",
    label: "Cloudflare R2 snapshots",
    description: "Object storage for prompt snapshots and public asset URLs.",
    requiredEnv: [
      "CLOUDFLARE_R2_ACCOUNT_ID",
      "CLOUDFLARE_R2_ACCESS_KEY_ID",
      "CLOUDFLARE_R2_SECRET_ACCESS_KEY",
      "CLOUDFLARE_R2_BUCKET",
      "CLOUDFLARE_R2_PUBLIC_URL",
    ],
    action: "Create an R2 bucket, configure credentials, and confirm solve snapshots return public URLs.",
  },
  {
    id: "verifier",
    label: "Hosted SymPy verifier",
    description: "Cloud Run or equivalent deployment for broader symbolic verification.",
    requiredEnv: ["SYMPY_VERIFIER_URL"],
    action: "Deploy services/verifier and set SYMPY_VERIFIER_URL to the hosted /verify endpoint.",
  },
  {
    id: "billing",
    label: "Lemon Squeezy billing",
    description: "Checkout URL and signed webhooks for free-to-Pro upgrades.",
    requiredEnv: ["LEMON_SQUEEZY_CHECKOUT_URL", "LEMON_SQUEEZY_WEBHOOK_SECRET"],
    action: "Configure checkout, set webhook secret, and replay a sandbox subscription event.",
  },
  {
    id: "analytics",
    label: "PostHog analytics",
    description: "Funnel events for signup, first solve, second solve, exports, and retention.",
    requiredEnv: ["POSTHOG_KEY", "POSTHOG_HOST"],
    action: "Set PostHog keys and confirm /api/v1/telemetry events appear in the project.",
    warning: true,
  },
  {
    id: "errors",
    label: "Sentry errors",
    description: "Production error ingestion for API and client failure visibility.",
    requiredEnv: ["SENTRY_INGEST_URL"],
    action: "Set the Sentry ingest URL and verify a test error reaches the issue stream.",
    warning: true,
  },
  {
    id: "app-url",
    label: "Public app URL",
    description: "Absolute URL used by metadata, share previews, and social cards.",
    requiredEnv: ["NEXT_PUBLIC_APP_URL"],
    action: "Set NEXT_PUBLIC_APP_URL to the production origin before generating share metadata.",
  },
];

export function getReadinessReport(): ReadinessReport {
  const reportChecks = checks.map(toReadinessCheck);
  const ready = reportChecks.filter((check) => check.status === "ready").length;
  const warning = reportChecks.filter((check) => check.status === "warning").length;
  const blocked = reportChecks.filter((check) => check.status === "blocked").length;

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      ready,
      warning,
      blocked,
      total: reportChecks.length,
      productionReady: blocked === 0,
    },
    checks: reportChecks,
  };
}

function toReadinessCheck(definition: CheckDefinition): ReadinessCheck {
  const configured = definition.requiredEnv.every((name) => Boolean(process.env[name]?.trim()));

  return {
    ...definition,
    configured,
    status: configured ? "ready" : definition.warning ? "warning" : "blocked",
  };
}
