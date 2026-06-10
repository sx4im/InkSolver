import zlib from "zlib";

import { NextResponse } from "next/server";
import { ZodError, type ZodTypeAny } from "zod";

import { trackTelemetryEvent } from "@/server/observability";
import { trustProxyHeaders } from "@/server/runtime-guards";

type GzipOptions = {
  maxDecompressedBytes: number;
};

type GuardedJsonOptions = {
  fallback?: unknown;
  maxBytes: number;
  route: string;
  gzip?: GzipOptions;
};

type GuardResult<T> =
  | {
      ok: true;
      data: T;
    }
  | {
      ok: false;
      response: NextResponse;
    };

type RateLimitPolicy = {
  max: number;
  windowMs: number;
};

type RateLimitName =
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

export const requestBodyLimits = {
  billing: 4 * 1024,
  canvasCreate: 8 * 1024,
  canvasPatch: 4 * 1024 * 1024,
  chat: 16 * 1024,
  // Exports carry a client-captured image of the actual board.
  export: 6 * 1024 * 1024,
  solve: 6 * 1024 * 1024,
  telemetry: 32 * 1024,
  webhook: 256 * 1024,
} as const;

export const snapshotLimits = {
  maxBytes: 4 * 1024 * 1024,
  allowedMimeTypes: ["image/png", "image/jpeg", "image/webp"],
} as const;

const rateLimitPolicies: Record<RateLimitName, RateLimitPolicy> = {
  billing: { max: 10, windowMs: 5 * 60 * 1000 },
  canvas_create: { max: 30, windowMs: 60 * 1000 },
  canvas_write: { max: 90, windowMs: 60 * 1000 },
  chat: { max: 60, windowMs: 60 * 1000 },
  export: { max: 20, windowMs: 60 * 1000 },
  solve: { max: 12, windowMs: 60 * 1000 },
  telemetry: { max: 120, windowMs: 60 * 1000 },
  webhook: { max: 240, windowMs: 60 * 1000 },
};

export async function enforceRateLimit(
  request: Request,
  name: RateLimitName,
  metadata: Record<string, unknown> = {},
) {
  const ip = getClientIp(request);
  const policy = rateLimitPolicies[name];
  const now = Date.now();
  const key = `${name}:${ip}`;
  const current = rateLimitStore.get(key);
  const entry =
    !current || current.resetAt <= now
      ? { count: 0, resetAt: now + policy.windowMs }
      : current;

  entry.count += 1;
  rateLimitStore.set(key, entry);

  pruneRateLimitStore(now);

  if (entry.count <= policy.max) return null;

  const retryAfterSeconds = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));

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

export async function parseGuardedJson<TSchema extends ZodTypeAny>(
  request: Request,
  schema: TSchema,
  options: GuardedJsonOptions,
): Promise<GuardResult<TSchema["_output"]>> {
  const textResult = await readGuardedText(request, {
    maxBytes: options.maxBytes,
    route: options.route,
    fallback: options.fallback,
    gzip: options.gzip,
  });

  if (!textResult.ok) return textResult;

  const payload = textResult.data;
  const raw = typeof payload === "string" ? payload : null;
  const parsedPayload =
    raw === null
      ? payload
      : raw.trim().length
        ? parseJson(raw, options.route)
        : options.fallback;

  if (parsedPayload instanceof NextResponse) {
    return {
      ok: false,
      response: parsedPayload,
    };
  }

  const parsed = schema.safeParse(parsedPayload ?? {});

  if (!parsed.success) {
    await recordRejectedRequest("validation_failed", {
      route: options.route,
      issues: summarizeZodIssues(parsed.error),
    });

    return {
      ok: false,
      response: NextResponse.json(
        {
          error: "Invalid request body",
          code: "validation_failed",
          issues: summarizeZodIssues(parsed.error),
        },
        {
          status: 400,
          headers: {
            "Cache-Control": "no-store",
          },
        },
      ),
    };
  }

  return {
    ok: true,
    data: parsed.data,
  };
}

export async function readGuardedText(
  request: Request,
  options: {
    fallback?: unknown;
    maxBytes: number;
    route: string;
    gzip?: GzipOptions;
  },
): Promise<GuardResult<string | unknown>> {
  const contentLength = Number(request.headers.get("content-length") ?? "0");

  if (Number.isFinite(contentLength) && contentLength > options.maxBytes) {
    await recordRejectedRequest("body_too_large", {
      route: options.route,
      contentLength,
      maxBytes: options.maxBytes,
    });

    return {
      ok: false,
      response: tooLargeResponse(options.maxBytes),
    };
  }

  // Large canvas snapshots arrive gzip-compressed (tldraw JSON compresses
  // ~10x), with a separate cap on the decompressed size to bound memory.
  if (options.gzip && request.headers.get("x-inksolver-encoding") === "gzip") {
    const compressed = Buffer.from(await request.arrayBuffer());

    if (compressed.byteLength > options.maxBytes) {
      await recordRejectedRequest("body_too_large", {
        route: options.route,
        byteLength: compressed.byteLength,
        maxBytes: options.maxBytes,
      });

      return {
        ok: false,
        response: tooLargeResponse(options.maxBytes),
      };
    }

    try {
      const decompressed = zlib.gunzipSync(compressed, {
        maxOutputLength: options.gzip.maxDecompressedBytes,
      });

      return {
        ok: true,
        data: decompressed.toString("utf8"),
      };
    } catch {
      await recordRejectedRequest("invalid_gzip_body", {
        route: options.route,
        maxDecompressedBytes: options.gzip.maxDecompressedBytes,
      });

      return {
        ok: false,
        response: NextResponse.json(
          {
            error: "Compressed request body could not be decoded.",
            code: "invalid_gzip_body",
            max_decompressed_bytes: options.gzip.maxDecompressedBytes,
          },
          {
            status: 400,
            headers: {
              "Cache-Control": "no-store",
            },
          },
        ),
      };
    }
  }

  const raw = await request.text();
  const byteLength = Buffer.byteLength(raw);

  if (byteLength > options.maxBytes) {
    await recordRejectedRequest("body_too_large", {
      route: options.route,
      byteLength,
      maxBytes: options.maxBytes,
    });

    return {
      ok: false,
      response: tooLargeResponse(options.maxBytes),
    };
  }

  if (!raw && options.fallback !== undefined) {
    return {
      ok: true,
      data: options.fallback,
    };
  }

  return {
    ok: true,
    data: raw,
  };
}

export async function validateSnapshotImage(input: {
  mimeType?: string | null;
  route: string;
  snapshotBase64?: string | null;
}) {
  if (!input.snapshotBase64) return null;

  const normalized = normalizeBase64Image(input.snapshotBase64, input.mimeType);

  if (!normalized) {
    await recordRejectedRequest("invalid_snapshot", {
      route: input.route,
    });

    return NextResponse.json(
      {
        error: "Snapshot image must be a base64-encoded PNG, JPEG, or WebP image.",
        code: "invalid_snapshot",
      },
      { status: 400 },
    );
  }

  if (!(snapshotLimits.allowedMimeTypes as readonly string[]).includes(normalized.mimeType)) {
    await recordRejectedRequest("unsupported_snapshot_type", {
      route: input.route,
      mimeType: normalized.mimeType,
    });

    return NextResponse.json(
      {
        error: "Snapshot image type is not supported.",
        code: "unsupported_snapshot_type",
        allowed_mime_types: snapshotLimits.allowedMimeTypes,
      },
      { status: 415 },
    );
  }

  if (normalized.bytes > snapshotLimits.maxBytes) {
    await recordRejectedRequest("snapshot_too_large", {
      route: input.route,
      bytes: normalized.bytes,
      maxBytes: snapshotLimits.maxBytes,
    });

    return tooLargeResponse(snapshotLimits.maxBytes, "Snapshot image is too large", "snapshot_too_large");
  }

  return null;
}

function parseJson(raw: string, route: string) {
  try {
    return JSON.parse(raw);
  } catch {
    void recordRejectedRequest("invalid_json", {
      route,
    });

    return NextResponse.json(
      {
        error: "Request body must be valid JSON",
        code: "invalid_json",
      },
      {
        status: 400,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }
}

function normalizeBase64Image(value: string, mimeType?: string | null) {
  const dataUrlMatch = value.match(/^data:([^;,]+);base64,([\s\S]*)$/);
  const payload = (dataUrlMatch?.[2] ?? value).replace(/\s/g, "");
  const normalizedMimeType = (dataUrlMatch?.[1] ?? mimeType ?? "image/png").toLowerCase();

  if (!payload || payload.length % 4 === 1 || !/^[A-Za-z0-9+/]*={0,2}$/.test(payload)) {
    return null;
  }

  const padding = payload.endsWith("==") ? 2 : payload.endsWith("=") ? 1 : 0;
  const bytes = Math.floor((payload.length * 3) / 4) - padding;

  if (bytes <= 0) return null;

  return {
    bytes,
    mimeType: normalizedMimeType,
  };
}

function tooLargeResponse(maxBytes: number, error = "Request body is too large", code = "body_too_large") {
  return NextResponse.json(
    {
      error,
      code,
      max_bytes: maxBytes,
    },
    {
      status: 413,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}

function summarizeZodIssues(error: ZodError) {
  return error.issues.slice(0, 6).map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));
}

function getClientIp(request: Request) {
  if (!trustProxyHeaders()) return "local";

  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (
    forwardedFor ||
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-real-ip") ||
    "local"
  );
}

function pruneRateLimitStore(now: number) {
  if (rateLimitStore.size < 1000) return;

  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetAt <= now) {
      rateLimitStore.delete(key);
    }
  }
}

async function recordRejectedRequest(reason: string, metadata: Record<string, unknown>) {
  await trackTelemetryEvent({
    eventType: "telemetry",
    metadata: {
      kind: "security",
      reason,
      ...metadata,
    },
  }).catch(() => null);
}
