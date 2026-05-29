import { NextResponse } from "next/server";

import { ActiveCanvasLimitError, remixPublicCanvas } from "@/server/canvas-repository";
import { enforceRateLimit } from "@/server/request-guards";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const limited = await enforceRateLimit(request, "canvas_create", {
    route: "share_remix",
    shareSlug: slug,
  });

  if (limited) return limited;

  try {
    const remix = await remixPublicCanvas(slug);

    if (!remix) {
      return NextResponse.json({ error: "Canvas not found" }, { status: 404 });
    }

    return NextResponse.json(
      {
        canvas_id: remix.canvas.id,
        share_slug: remix.canvas.shareSlug,
        source_canvas_id: remix.sourceCanvas.id,
        copied_solution_count: remix.copiedSolutions.length,
      },
      {
        status: 201,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
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
}
