import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { getCurrentUser, listCanvases } from "@/server/canvas-repository";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [canvases, user] = await Promise.all([listCanvases(), getCurrentUser()]);

  return <DashboardShell canvases={canvases} user={user} />;
}
