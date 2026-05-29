import { z } from "zod";

import { QuotaExceededError } from "@/server/canvas-repository";
import { captureException } from "@/server/observability";
import {
  enforceRateLimit,
  parseGuardedJson,
  requestBodyLimits,
  validateSnapshotImage,
} from "@/server/request-guards";
import { solveCanvasSelection } from "@/server/solve-service";

export const dynamic = "force-dynamic";

const coordinateSchema = z.number().finite().min(-1_000_000).max(1_000_000);
const sizeSchema = z.number().finite().positive().max(200_000);

const solveSchema = z.object({
  region_bounds: z
    .object({
      x: coordinateSchema,
      y: coordinateSchema,
      w: sizeSchema,
      h: sizeSchema,
    })
    .optional(),
  snapshot_b64: z.string().max(requestBodyLimits.solve).nullable().optional(),
  mime_type: z.string().max(80).nullable().optional(),
  problem_hint: z.string().trim().max(2000).nullable().optional(),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const limited = await enforceRateLimit(request, "solve", {
    canvasId: id,
    route: "solve",
  });

  if (limited) return limited;

  const parsedBody = await parseGuardedJson(request, solveSchema, {
    fallback: {},
    maxBytes: requestBodyLimits.solve,
    route: "solve",
  });

  if (!parsedBody.ok) return parsedBody.response;

  const body = parsedBody.data;
  const snapshotError = await validateSnapshotImage({
    mimeType: body.mime_type,
    route: "solve",
    snapshotBase64: body.snapshot_b64,
  });

  if (snapshotError) return snapshotError;

  let solution;

  try {
    solution = await solveCanvasSelection({
      canvasId: id,
      regionBounds: body.region_bounds ?? null,
      snapshotBase64: body.snapshot_b64,
      mimeType: body.mime_type,
      problemHint: body.problem_hint,
    });
  } catch (error) {
    if (error instanceof QuotaExceededError) {
      return Response.json(
        {
          error: "Daily solve quota exceeded",
          code: "quota_exceeded",
          user: error.user,
        },
        { status: 402 },
      );
    }

    await captureException(error, {
      route: "solve",
      canvasId: id,
    });
    throw error;
  }

  if (!solution) {
    return Response.json({ error: "Canvas not found" }, { status: 404 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      for (const step of solution.steps) {
        controller.enqueue(
          encoder.encode(
            `event: step\ndata: ${JSON.stringify({
              step_num: step.stepNum,
              latex: step.latex,
              explanation: step.explanation,
              verified: step.verified,
              verification_status: step.verificationStatus,
            })}\n\n`,
          ),
        );
        await new Promise((resolve) => setTimeout(resolve, 120));
      }

      controller.enqueue(
        encoder.encode(
          `event: done\ndata: ${JSON.stringify({
            canvas_id: solution.canvasId,
            solution_id: solution.id,
            solution,
            final_answer: solution.finalAnswer,
            verification_status: solution.verificationStatus,
          })}\n\n`,
        ),
      );
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
