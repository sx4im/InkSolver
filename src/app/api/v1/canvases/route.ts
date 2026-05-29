import { NextResponse } from "next/server";
import { z } from "zod";

import { ActiveCanvasLimitError, createCanvas, listCanvases } from "@/server/canvas-repository";
import { enforceRateLimit, parseGuardedJson, requestBodyLimits } from "@/server/request-guards";

const createCanvasSchema = z.object({
  title: z.string().min(1).max(120).optional(),
  subject: z.enum(["math", "physics", "chem", "unknown"]).optional(),
});

export async function GET() {
  return NextResponse.json({ canvases: await listCanvases() });
}

export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, "canvas_create", {
    route: "canvas_create",
  });

  if (limited) return limited;

  const parsedBody = await parseGuardedJson(request, createCanvasSchema, {
    fallback: {},
    maxBytes: requestBodyLimits.canvasCreate,
    route: "canvas_create",
  });

  if (!parsedBody.ok) return parsedBody.response;

  const body = parsedBody.data;
  let canvas;

  try {
    canvas = await createCanvas(body);
  } catch (error) {
    if (error instanceof ActiveCanvasLimitError) {
      return NextResponse.json(
        {
          error: "Free active canvas limit reached",
          code: "active_canvas_limit",
          user: error.user,
        },
        { status: 402 },
      );
    }

    throw error;
  }

  return NextResponse.json(
    {
      canvas_id: canvas.id,
      share_slug: canvas.shareSlug,
    },
    { status: 201 },
  );
}
