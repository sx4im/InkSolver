import { promises as fs } from "fs";
import path from "path";

import { localFileRoutesEnabled } from "@/server/runtime-guards";

export const runtime = "nodejs";

const contentTypes: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

export async function GET(_request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  if (!localFileRoutesEnabled()) {
    return Response.json({ error: "Local snapshot routes are disabled" }, { status: 404 });
  }

  const { path: parts } = await params;
  const root = path.resolve(process.cwd(), ".data", "snapshots");
  const filePath = path.resolve(root, ...parts);

  if (!isInsideRoot(root, filePath)) {
    return Response.json({ error: "Invalid snapshot path" }, { status: 400 });
  }

  try {
    const file = await fs.readFile(filePath);
    const contentType = contentTypes[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";

    return new Response(file, {
      headers: {
        "Cache-Control": "private, max-age=31536000, immutable",
        "Content-Type": contentType,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return Response.json({ error: "Snapshot not found" }, { status: 404 });
  }
}

function isInsideRoot(root: string, filePath: string) {
  const relativePath = path.relative(root, filePath);
  return relativePath.length > 0 && !relativePath.startsWith("..") && !path.isAbsolute(relativePath);
}
