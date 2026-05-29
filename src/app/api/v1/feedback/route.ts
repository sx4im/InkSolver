import { NextResponse } from "next/server";
import { z } from "zod";

import { trackTelemetryEvent } from "@/server/observability";
import { enforceRateLimit, parseGuardedJson, requestBodyLimits } from "@/server/request-guards";

export const dynamic = "force-dynamic";

const feedbackSchema = z.object({
  subject: z.enum(["math", "physics", "chem", "unknown"]),
  expected_answer: z.string().trim().max(1200).optional(),
  actual_answer: z.string().trim().max(1200).optional(),
  device: z.string().trim().min(1).max(160),
  notes: z.string().trim().min(1).max(2400),
  share_url: z.string().trim().max(500).optional(),
});

export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, "telemetry", {
    route: "feedback",
  });

  if (limited) return limited;

  const parsedBody = await parseGuardedJson(request, feedbackSchema, {
    maxBytes: requestBodyLimits.telemetry,
    route: "feedback",
  });

  if (!parsedBody.ok) return parsedBody.response;

  const body = parsedBody.data;

  await trackTelemetryEvent({
    eventType: "telemetry",
    metadata: {
      kind: "beta_feedback",
      subject: body.subject,
      expectedAnswer: body.expected_answer ?? null,
      actualAnswer: body.actual_answer ?? null,
      device: body.device,
      notes: body.notes,
      shareUrl: body.share_url ?? null,
    },
  });

  return NextResponse.json(
    {
      ok: true,
      status: "recorded",
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
