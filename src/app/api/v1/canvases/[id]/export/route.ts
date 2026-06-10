import { NextResponse } from "next/server";
import { z } from "zod";

import { createCanvasExport, type CanvasImageAttachment } from "@/server/export-service";
import { getCanvas, getSolutionsForCanvas } from "@/server/canvas-repository";
import {
  enforceRateLimit,
  parseGuardedJson,
  requestBodyLimits,
  validateSnapshotImage,
} from "@/server/request-guards";

const exportSchema = z.object({
  format: z.enum(["pdf", "png", "latex"]),
  canvas_image_b64: z.string().max(requestBodyLimits.export).nullable().optional(),
});

function decodeCanvasImage(value: string | null | undefined): CanvasImageAttachment | null {
  if (!value) return null;

  const dataUrlMatch = value.match(/^data:([^;,]+);base64,([\s\S]*)$/);
  const payload = (dataUrlMatch?.[2] ?? value).replace(/\s/g, "");
  const mimeType = (dataUrlMatch?.[1] ?? "image/png").toLowerCase();

  try {
    return { data: Buffer.from(payload, "base64"), mimeType };
  } catch {
    return null;
  }
}

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
  const imageError = await validateSnapshotImage({
    route: "export",
    snapshotBase64: body.canvas_image_b64,
  });

  if (imageError) return imageError;

  const canvas = await getCanvas(id);

  if (!canvas) {
    return NextResponse.json({ error: "Canvas not found" }, { status: 404 });
  }

  const result = await createCanvasExport({
    canvas,
    solutions: await getSolutionsForCanvas(canvas.id),
    format: body.format,
    canvasImage: decodeCanvasImage(body.canvas_image_b64),
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
