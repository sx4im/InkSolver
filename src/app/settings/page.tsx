import { AppHeader } from "@/components/app-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Surface } from "@/components/ui/surface";
import { BillingPanel } from "@/components/settings/billing-panel";
import { getCurrentUser } from "@/server/canvas-repository";
import { Download } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await getCurrentUser();

  return (
    <div className="min-h-screen bg-canvas">
      <AppHeader />
      <main className="mx-auto max-w-5xl px-6 py-12">
        <Badge>Settings</Badge>
        <h1 className="mt-6 text-[40px] font-normal leading-[1.2] text-ink">Account, billing, and history export.</h1>
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <Surface className="p-6">
            <h2 className="text-xl font-normal text-ink">Account</h2>
            <dl className="mt-5 space-y-4 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted">Name</dt>
                <dd className="font-medium text-ink">{user.name}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted">Email</dt>
                <dd className="font-medium text-ink">{user.email}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted">Plan</dt>
                <dd className="font-medium text-ink">{user.plan}</dd>
              </div>
            </dl>
          </Surface>
          <Surface className="bg-surface-soft p-6">
            <BillingPanel user={user} />
          </Surface>
          <Surface className="p-6 md:col-span-2">
            <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-xl font-normal text-ink">History export</h2>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
                  Download your account profile, canvas list, saved solutions, follow-up messages, and usage events as JSON.
                </p>
              </div>
              <Button asChild variant="secondary">
                <a href="/api/v1/account/export">
                  <Download className="h-4 w-4" aria-hidden="true" />
                  Export history
                </a>
              </Button>
            </div>
          </Surface>
        </div>
      </main>
    </div>
  );
}
