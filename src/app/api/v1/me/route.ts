import { NextResponse } from "next/server";

import { getCurrentUser } from "@/server/canvas-repository";

export async function GET() {
  return NextResponse.json({ user: await getCurrentUser() });
}
