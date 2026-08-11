import zlib from "zlib";
import { NextResponse } from "next/server";
import { ZodError, type ZodTypeAny } from "zod";
import { recordRejectedRequest } from "./rejection";

export function tooLargeResponse(maxBytes: number, error = "Request body is too large", code = "body_too_large") {
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

export type GzipOptions = {
  maxDecompressedBytes: number;
};

export type GuardedJsonOptions = {
  fallback?: unknown;
  maxBytes: number;
  route: string;
  gzip?: GzipOptions;
};

export type GuardResult<T> =
  | {
      ok: true;
      data: T;
    }
  | {
      ok: false;
      response: NextResponse;
    };

function summarizeZodIssues(error: ZodError) {
  return error.issues.slice(0, 6).map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));
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