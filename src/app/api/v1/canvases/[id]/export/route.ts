import { NextResponse } from "next/server";
import { z } from "zod";

import { createCanvasExport } from "@/server/export-service";
import { getCanvas, getSolutionsForCanvas } from "@/server/canvas-repository";
import { enforceRateLimit, parseGuardedJson, requestBodyLimits } from "@/server/request-guards";

const exportSchema = z.object({
  format: z.enum(["pdf", "png", "latex"]),
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

  // Return the file directly: no dependency on instance-local disk, which does
  // not survive across serverless invocations.
  return new Response(new Uint8Array(result.body), {
    headers: {
      "Content-Type": result.mimeType,
      "Content-Disposition": `attachment; filename="${result.filename}"`,
      "Cache-Control": "no-store",
      "X-Inksolver-Watermark": result.watermark ? "true" : "false",
    },
  });
}
