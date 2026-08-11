import { NextResponse } from "next/server";
import { z } from "zod";

import { captureException, trackTelemetryEvent } from "@/server/observability";
import { enforceRateLimit, parseGuardedJson, requestBodyLimits } from "@/server/request-guards";

export const dynamic = "force-dynamic";

const telemetrySchema = z.object({
  event_type: z.enum(["telemetry", "error", "web_vital"]).default("telemetry"),
  name: z.string().min(1).max(120),
  value: z.number().finite().optional(),
  rating: z.string().max(40).optional(),
  url: z.string().max(500).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, "telemetry", {
    route: "telemetry",
  });

  if (limited) return limited;

  const parsedBody = await parseGuardedJson(request, telemetrySchema, {
    maxBytes: requestBodyLimits.telemetry,
    route: "telemetry",
  });

  if (!parsedBody.ok) return parsedBody.response;

  const body = parsedBody.data;
  const metadata = {
    name: body.name,
    value: body.value,
    rating: body.rating,
    url: body.url,
    ...(body.metadata ?? {}),
  };

  if (body.event_type === "error") {
    await captureException(new Error(body.name), metadata);
  } else {
    await trackTelemetryEvent({
      eventType: body.event_type,
      metadata,
    });
  }

  return NextResponse.json({ ok: true });
}
