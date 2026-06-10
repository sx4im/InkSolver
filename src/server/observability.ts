import type { UsageEvent } from "@/lib/types";
import { AuthenticationRequiredError } from "@/server/auth-context";
import { getCurrentUser, listUsageEvents, recordUsageEvent } from "@/server/canvas-repository";

type TelemetryMetadata = Record<string, unknown>;

export async function trackTelemetryEvent(input: {
  eventType: UsageEvent["eventType"];
  metadata?: TelemetryMetadata | null;
  costUsd?: number;
}): Promise<UsageEvent | null> {
  let userId: string | null = null;

  try {
    userId = (await getCurrentUser()).id;
  } catch (error) {
    // Telemetry also arrives from public pages (share links, sign-in). Forward
    // it without a database row instead of failing the request.
    if (!(error instanceof AuthenticationRequiredError)) throw error;
  }

  const metadata = {
    source: "inksolver",
    ...input.metadata,
  };

  if (!userId) {
    void forwardToPostHog({
      id: crypto.randomUUID(),
      userId: "anonymous",
      eventType: input.eventType,
      costUsd: input.costUsd ?? 0,
      metadata,
      createdAt: new Date().toISOString(),
    });
    return null;
  }

  const event = await recordUsageEvent({
    userId,
    eventType: input.eventType,
    costUsd: input.costUsd,
    metadata,
  });

  void forwardToPostHog(event);
  return event;
}

export async function captureException(error: unknown, metadata?: TelemetryMetadata) {
  const normalized = normalizeError(error);
  const event = await trackTelemetryEvent({
    eventType: "error",
    metadata: {
      ...metadata,
      message: normalized.message,
      name: normalized.name,
      stack: normalized.stack?.slice(0, 1600),
    },
  });

  void forwardToSentry(normalized, metadata);
  return event;
}

export async function getObservabilitySummary(limit = 500) {
  const events = await listUsageEvents(limit);
  const solveDurations = events
    .filter((event) => event.eventType === "solve")
    .map((event) => Number(event.metadata?.durationMs))
    .filter((value) => Number.isFinite(value) && value >= 0)
    .sort((a, b) => a - b);
  const webVitals = events.filter((event) => event.eventType === "web_vital");
  const errors = events.filter((event) => event.eventType === "error");

  return {
    generatedAt: new Date().toISOString(),
    eventCount: events.length,
    solve: {
      count: solveDurations.length,
      p50Ms: percentile(solveDurations, 50),
      p95Ms: percentile(solveDurations, 95),
      latestMs: solveDurations.at(-1) ?? null,
    },
    errors: {
      count: errors.length,
      latest: errors[0] ?? null,
    },
    webVitals: {
      count: webVitals.length,
      latest: webVitals[0] ?? null,
      byName: summarizeWebVitals(webVitals),
    },
    events: events.slice(0, 25),
  };
}

function percentile(values: number[], percentileValue: number) {
  if (!values.length) return null;
  const index = Math.ceil((percentileValue / 100) * values.length) - 1;
  return Math.round(values[Math.min(Math.max(index, 0), values.length - 1)]);
}

function summarizeWebVitals(events: UsageEvent[]) {
  return events.reduce<Record<string, { count: number; latestValue: number | null }>>((summary, event) => {
    const name = String(event.metadata?.name ?? "unknown");
    const value = Number(event.metadata?.value);
    const current = summary[name] ?? { count: 0, latestValue: null };

    summary[name] = {
      count: current.count + 1,
      latestValue: Number.isFinite(value) ? value : current.latestValue,
    };

    return summary;
  }, {});
}

function normalizeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return {
    name: "UnknownError",
    message: String(error),
    stack: undefined,
  };
}

async function forwardToPostHog(event: UsageEvent) {
  const apiKey = process.env.POSTHOG_KEY;
  const host = process.env.POSTHOG_HOST ?? "https://app.posthog.com";
  if (!apiKey) return;

  await fetch(`${host.replace(/\/$/, "")}/capture/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      api_key: apiKey,
      event: event.eventType,
      distinct_id: event.userId,
      properties: event.metadata ?? {},
      timestamp: event.createdAt,
    }),
    signal: AbortSignal.timeout(5000),
  }).catch(() => null);
}

async function forwardToSentry(error: { name: string; message: string; stack?: string }, metadata?: TelemetryMetadata) {
  const ingestUrl = process.env.SENTRY_INGEST_URL;
  if (!ingestUrl) return;

  await fetch(ingestUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      level: "error",
      exception: error,
      extra: metadata ?? {},
      timestamp: new Date().toISOString(),
    }),
    signal: AbortSignal.timeout(5000),
  }).catch(() => null);
}
