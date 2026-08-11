import { NextResponse } from "next/server";

import { getCanvasBySlug, getSolutionsForCanvas } from "@/server/canvas-repository";

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const canvas = await getCanvasBySlug(slug);

  if (!canvas || !canvas.isPublic) {
    return NextResponse.json({ error: "Canvas not found" }, { status: 404 });
  }

  return NextResponse.json({
    canvas,
    solutions: await getSolutionsForCanvas(canvas.id, { publicRead: true }),
  }, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
