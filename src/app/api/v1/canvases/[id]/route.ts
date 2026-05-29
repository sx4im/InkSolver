import { NextResponse } from "next/server";
import { z } from "zod";

import type { CanvasSnapshot } from "@/lib/types";
import {
  deleteCanvas,
  getCanvas,
  getSolutionsForCanvas,
  updateCanvas,
} from "@/server/canvas-repository";
import { enforceRateLimit, parseGuardedJson, requestBodyLimits } from "@/server/request-guards";

const updateCanvasSchema = z.object({
  title: z.string().min(1).max(120).optional(),
  subject: z.enum(["math", "physics", "chem", "unknown"]).optional(),
  tldraw_state: z.unknown().optional(),
  thumbnail_url: z.string().nullable().optional(),
  is_public: z.boolean().optional(),
});

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const canvas = await getCanvas(id);

  if (!canvas) {
    return NextResponse.json({ error: "Canvas not found" }, { status: 404 });
  }

  return NextResponse.json({
    canvas,
    solutions: await getSolutionsForCanvas(canvas.id),
  });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const limited = await enforceRateLimit(request, "canvas_write", {
    canvasId: id,
    route: "canvas_patch",
  });

  if (limited) return limited;

  const parsedBody = await parseGuardedJson(request, updateCanvasSchema, {
    fallback: {},
    maxBytes: requestBodyLimits.canvasPatch,
    route: "canvas_patch",
  });

  if (!parsedBody.ok) return parsedBody.response;

  const body = parsedBody.data;
  const canvas = await updateCanvas(id, {
    title: body.title,
    subject: body.subject,
    tldrawState: body.tldraw_state as CanvasSnapshot | undefined,
    thumbnailUrl: body.thumbnail_url,
    isPublic: body.is_public,
  });

  if (!canvas) {
    return NextResponse.json({ error: "Canvas not found" }, { status: 404 });
  }

  return NextResponse.json({
    canvas_id: canvas.id,
    updated_at: canvas.updatedAt,
    thumbnail_status: "placeholder",
  });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const limited = await enforceRateLimit(_request, "canvas_write", {
    canvasId: id,
    route: "canvas_delete",
  });

  if (limited) return limited;

  const ok = await deleteCanvas(id);

  return NextResponse.json({ ok, canvas_id: id }, { status: ok ? 200 : 404 });
}
