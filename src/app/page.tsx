import { auth } from "@clerk/nextjs/server";

import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { LandingPage } from "@/components/marketing/landing-page";
import { getCurrentUser, listCanvases } from "@/server/canvas-repository";

import type { CanvasSummary, UserAccount } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function RootPage() {
  const { userId } = await auth();

  // If we are in a development environment without Clerk, `getCurrentUser()`
  // might still succeed due to demo auth fallback. We must handle that gracefully.
  let user: UserAccount | null = null;
  let canvases: CanvasSummary[] = [];

  try {
    user = await getCurrentUser();
    canvases = await listCanvases();
  } catch {
    user = null;
  }

  // If there's no user at all (neither Clerk nor demo fallback), show the landing page.
  if (!user && !userId) {
    return <LandingPage />;
  }

  // Otherwise, if we got a user, show the dashboard.
  return <DashboardShell canvases={canvases} user={user!} />;
}
