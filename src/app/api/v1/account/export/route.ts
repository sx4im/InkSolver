import { NextResponse } from "next/server";

import { getAccountExport } from "@/server/canvas-repository";
import { enforceRateLimit } from "@/server/request-guards";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const limited = await enforceRateLimit(request, "export", {
    route: "account_export",
  });

  if (limited) return limited;

  const payload = await getAccountExport();
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Disposition": `attachment; filename="inksolver-history-${timestamp}.json"`,
    },
  });
}
