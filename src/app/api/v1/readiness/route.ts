import { NextResponse } from "next/server";

import { getReadinessReport } from "@/server/readiness";
import { requireAdminAccess } from "@/server/runtime-guards";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const unauthorized = requireAdminAccess(request);
  if (unauthorized) return unauthorized;

  return NextResponse.json(getReadinessReport(), {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
