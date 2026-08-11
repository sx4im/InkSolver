import { NextResponse } from "next/server";
import { UPSTASH_TIMEOUT_MS } from "./limits";
import { getClientIp } from "./ip-extraction";
import { recordRejectedRequest } from "./rejection";

export type RateLimitPolicy = {
  max: number;
  windowMs: number;
};

export type RateLimitName =
  | "billing"
  | "canvas_create"
  | "canvas_write"
  | "chat"
  | "export"
  | "solve"
  | "telemetry"
  | "webhook";

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

const globalRateLimitState = globalThis as typeof globalThis & {
  __inksolverRateLimits?: Map<string, RateLimitEntry>;
};

const rateLimitStore = globalRateLimitState.__inksolverRateLimits ?? new Map<string, RateLimitEntry>();
globalRateLimitState.__inksolverRateLimits = rateLimitStore;

export const rateLimitPolicies: Record<RateLimitName, RateLimitPolicy> = {
  billing: { max: 10, windowMs: 5 * 60 * 1000 },
  canvas_create: { max: 30, windowMs: 60 * 1000 },
  canvas_write: { max: 90, windowMs: 60 * 1000 },
  chat: { max: 60, windowMs: 60 * 1000 },
  export: { max: 20, windowMs: 60 * 1000 },
  solve: { max: 12, windowMs: 60 * 1000 },
  telemetry: { max: 120, windowMs: 60 * 1000 },
  webhook: { max: 240, windowMs: 60 * 1000 },
};

// Serverless platforms run many instances, so the in-memory store only limits
// per-instance. When Upstash Redis credentials are configured the count is
// shared across all instances via a single REST pipeline call; any Redis
// failure falls back to the in-memory limiter rather than blocking traffic.
async function incrementUpstash(
  key: string,
  policy: RateLimitPolicy,
): Promise<{ count: number; resetAt: number } | null> {
  const url = process.env.UPSTASH_REDIS_REST_URL?.replace(/\/$/, "");
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  const windowSeconds = Math.max(1, Math.ceil(policy.windowMs / 1000));

  try {
    const response = await fetch(`${url}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([
        ["INCR", key],
        ["EXPIRE", key, String(windowSeconds), "NX"],
        ["TTL", key],
      ]),
      signal: AbortSignal.timeout(UPSTASH_TIMEOUT_MS),
    });

    if (!response.ok) return null;

    const payload = (await response.json()) as Array<{ result?: unknown }>;
    const count = Number(payload?.[0]?.result);
    const ttl = Number(payload?.[2]?.result);

    if (!Number.isFinite(count)) return null;

    return {
      count,
      resetAt: Date.now() + (Number.isFinite(ttl) && ttl > 0 ? ttl : windowSeconds) * 1000,
    };
  } catch {
    return null;
  }
}

function pruneRateLimitStore(now: number) {
  if (rateLimitStore.size < 1000) return;

  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetAt <= now) {
      rateLimitStore.delete(key);
    }
  }
}

function incrementInMemory(key: string, policy: RateLimitPolicy) {
  const now = Date.now();
  const current = rateLimitStore.get(key);
  const entry =
    !current || current.resetAt <= now
      ? { count: 0, resetAt: now + policy.windowMs }
      : current;

  entry.count += 1;
  rateLimitStore.set(key, entry);
  pruneRateLimitStore(now);

  return entry;
}

export async function enforceRateLimit(
  request: Request,
  name: RateLimitName,
  metadata: Record<string, unknown> = {},
) {
  const ip = getClientIp(request);
  const policy = rateLimitPolicies[name];
  const key = `${name}:${ip}`;

  const entry = (await incrementUpstash(key, policy)) ?? incrementInMemory(key, policy);

  if (entry.count <= policy.max) return null;

  const retryAfterSeconds = Math.max(1, Math.ceil((entry.resetAt - Date.now()) / 1000));

  await recordRejectedRequest("rate_limited", {
    ...metadata,
    ip,
    limit: name,
    retryAfterSeconds,
  });

  return NextResponse.json(
    {
      error: "Too many requests",
      code: "rate_limited",
      retry_after: retryAfterSeconds,
    },
    {
      status: 429,
      headers: {
        "Cache-Control": "no-store",
        "Retry-After": String(retryAfterSeconds),
      },
    },
  );
}