import { z } from "zod";

import { getChatMessagesForSolution, getSolution } from "@/server/canvas-repository";
import { chunkAnswer, createFollowUpResponse, resolveFollowUpContext } from "@/server/chat-service";
import { captureException } from "@/server/observability";
import { enforceRateLimit, parseGuardedJson, requestBodyLimits } from "@/server/request-guards";

export const dynamic = "force-dynamic";

const chatSchema = z.object({
  message: z.string().trim().min(1).max(1200),
  step_num: z.number().int().positive().nullable().optional(),
});

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const solution = await getSolution(id);

  if (!solution) {
    return Response.json({ error: "Solution not found" }, { status: 404 });
  }

  return Response.json({ messages: await getChatMessagesForSolution(solution.id) });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const limited = await enforceRateLimit(request, "chat", {
    route: "chat",
    solutionId: id,
  });

  if (limited) return limited;

  const parsedBody = await parseGuardedJson(request, chatSchema, {
    maxBytes: requestBodyLimits.chat,
    route: "chat",
  });

  if (!parsedBody.ok) return parsedBody.response;

  const body = parsedBody.data;
  const context = await resolveFollowUpContext({
    solutionId: id,
    message: body.message,
    stepNum: body.step_num,
  });

  if (!context) {
    return Response.json({ error: "Solution not found" }, { status: 404 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const result = await createFollowUpResponse(
          {
            solutionId: id,
            message: body.message,
            stepNum: body.step_num,
          },
          context,
        );

        for (const token of chunkAnswer(result.answer)) {
          controller.enqueue(
            encoder.encode(
              `event: token\ndata: ${JSON.stringify({
                solution_id: id,
                token,
              })}\n\n`,
            ),
          );
        }

        controller.enqueue(
          encoder.encode(
            `event: done\ndata: ${JSON.stringify({
              ok: true,
              user_message: result.userMessage,
              assistant_message: result.assistantMessage,
            })}\n\n`,
          ),
        );
      } catch (error) {
        await captureException(error, {
          route: "chat",
          solutionId: id,
        });
        controller.enqueue(
          encoder.encode(
            `event: error\ndata: ${JSON.stringify({
              error: "Chat response could not be generated.",
            })}\n\n`,
          ),
        );
      }
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
