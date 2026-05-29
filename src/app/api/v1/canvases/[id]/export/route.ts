import { NextResponse } from "next/server";
import { z } from "zod";

import { createCanvasExport } from "@/server/export-service";
import { getCanvas, getSolutionsForCanvas } from "@/server/canvas-repository";
import { enforceRateLimit, parseGuardedJson, requestBodyLimits } from "@/server/request-guards";

const exportSchema = z.object({
  format: z.enum(["pdf", "png"]),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const limited = await enforceRateLimit(request, "export", {
    canvasId: id,
    route: "export",
  });

  if (limited) return limited;

  const parsedBody = await parseGuardedJson(request, exportSchema, {
    fallback: { format: "pdf" },
    maxBytes: requestBodyLimits.export,
    route: "export",
  });

  if (!parsedBody.ok) return parsedBody.response;

  const body = parsedBody.data;
  const canvas = await getCanvas(id);

  if (!canvas) {
    return NextResponse.json({ error: "Canvas not found" }, { status: 404 });
  }

  const result = await createCanvasExport({
    canvas,
    solutions: await getSolutionsForCanvas(canvas.id),
    format: body.format,
  });

  return NextResponse.json({
    canvas_id: result.canvasId,
    format: result.format,
    download_url: result.downloadUrl,
    filename: result.filename,
    watermark: result.watermark,
    status: result.status,
  });
}
