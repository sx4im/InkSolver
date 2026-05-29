import { promises as fs } from "fs";
import path from "path";

import { localFileRoutesEnabled } from "@/server/runtime-guards";

export const runtime = "nodejs";

const contentTypes: Record<string, string> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
};

export async function GET(_request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  if (!localFileRoutesEnabled()) {
    return Response.json({ error: "Local export routes are disabled" }, { status: 404 });
  }

  const { path: parts } = await params;
  const root = path.resolve(process.cwd(), ".data", "exports");
  const filePath = path.resolve(root, ...parts);

  if (!isInsideRoot(root, filePath)) {
    return Response.json({ error: "Invalid export path" }, { status: 400 });
  }

  try {
    const file = await fs.readFile(filePath);
    const extension = path.extname(filePath).toLowerCase();
    const filename = path.basename(filePath);

    return new Response(file, {
      headers: {
        "Cache-Control": "private, max-age=3600",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Type": contentTypes[extension] ?? "application/octet-stream",
      },
    });
  } catch {
    return Response.json({ error: "Export not found" }, { status: 404 });
  }
}

function isInsideRoot(root: string, filePath: string) {
  const relativePath = path.relative(root, filePath);
  return relativePath.length > 0 && !relativePath.startsWith("..") && !path.isAbsolute(relativePath);
}
