import { z } from "zod";

import { QuotaExceededError } from "@/server/canvas-repository";
import { SolverError } from "@/server/nvidia-solver";
import { captureException } from "@/server/observability";
import {
  enforceRateLimit,
  parseGuardedJson,
  requestBodyLimits,
  validateSnapshotImage,
} from "@/server/request-guards";
import { solveCanvasSelection } from "@/server/solve-service";

export const dynamic = "force-dynamic";
// Solve + verify + one retry can take most of a minute on complex diagrams.
export const maxDuration = 60;

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

  const encoder = new TextEncoder();

  // Stream from the first byte: the client gets an immediate `status` event,
  // periodic heartbeats keep proxies from buffering or timing out while the
  // model works, and steps flush as soon as the solve completes — with no
  // artificial pacing delays.
  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;

      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          closed = true;
        }
      };

      send("status", { state: "solving" });

      const heartbeat = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`: heartbeat\n\n`));
        } catch {
          closed = true;
        }
      }, 10_000);

      try {
        const solution = await solveCanvasSelection(
          {
            canvasId: id,
            regionBounds: body.region_bounds ?? null,
            snapshotBase64: body.snapshot_b64,
            mimeType: body.mime_type,
            problemHint: body.problem_hint,
          },
          {
            // Relay model output live: each step is forwarded the moment the
            // model finishes writing it, then verification statuses arrive
            // with the final `done` payload.
            onStep(step) {
              send("step", {
                step_num: step.stepNum,
                latex: step.latex,
                explanation: step.explanation,
                verified: false,
                verification_status: "unverifiable",
              });
            },
            onStatus(state) {
              send("status", { state });
            },
          },
        );

        if (!solution) {
          send("error", { error: "Canvas not found", code: "not_found" });
        } else {
          for (const step of solution.steps) {
            send("step", {
              step_num: step.stepNum,
              latex: step.latex,
              explanation: step.explanation,
              verified: step.verified,
              verification_status: step.verificationStatus,
            });
          }

          send("done", {
            canvas_id: solution.canvasId,
            solution_id: solution.id,
            solution,
            final_answer: solution.finalAnswer,
            verification_status: solution.verificationStatus,
          });
        }
      } catch (error) {
        if (error instanceof QuotaExceededError) {
          send("error", {
            error: "Daily solve quota exceeded",
            code: "quota_exceeded",
            user: error.user,
          });
        } else if (error instanceof SolverError) {
          await captureException(error, {
            route: "solve",
            canvasId: id,
            solverErrorCode: error.code,
          });
          send("error", {
            error: error.message,
            code: error.code,
            retryable: error.retryable,
          });
        } else {
          await captureException(error, {
            route: "solve",
            canvasId: id,
          });
          send("error", {
            error: "The solve request failed unexpectedly. Your quota was not used.",
            code: "internal_error",
            retryable: true,
          });
        }
      } finally {
        clearInterval(heartbeat);
        if (!closed) {
          closed = true;
          try {
            controller.close();
          } catch {
            // Stream already closed by the client.
          }
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
