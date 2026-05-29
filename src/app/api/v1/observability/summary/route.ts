import { NextResponse } from "next/server";

import { getObservabilitySummary } from "@/server/observability";
import { requireAdminAccess } from "@/server/runtime-guards";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const unauthorized = requireAdminAccess(request);
  if (unauthorized) return unauthorized;

  return NextResponse.json(await getObservabilitySummary(), {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
