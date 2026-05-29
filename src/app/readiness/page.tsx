import Link from "next/link";
import { headers } from "next/headers";
import { AlertTriangle, CheckCircle2, CircleDashed, ExternalLink } from "lucide-react";

import { AppHeader } from "@/components/app-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Surface } from "@/components/ui/surface";
import { getReadinessReport, type ReadinessCheck } from "@/server/readiness";
import { hasAdminAccess } from "@/server/runtime-guards";

export const dynamic = "force-dynamic";

const statusTone: Record<ReadinessCheck["status"], "success" | "warning" | "danger"> = {
  blocked: "danger",
  ready: "success",
  warning: "warning",
};

const statusIcon = {
  blocked: AlertTriangle,
  ready: CheckCircle2,
  warning: CircleDashed,
};

export default async function ReadinessPage() {
  const access = hasAdminAccess(await headers());

  if (!access.ok) {
    return (
      <div className="min-h-screen bg-canvas">
        <AppHeader />
        <main className="mx-auto max-w-3xl px-6 py-12">
          <Badge tone="warning">Launch readiness</Badge>
          <h1 className="mt-6 text-[40px] font-normal leading-[1.2] text-ink">Admin access required.</h1>
          <p className="mt-5 text-base leading-7 text-body">
            {access.message} Use the JSON readiness endpoint with the configured admin token after production secrets are connected.
          </p>
        </main>
      </div>
    );
  }

  const report = getReadinessReport();

  return (
    <div className="min-h-screen bg-canvas">
      <AppHeader />
      <main className="mx-auto max-w-7xl px-6 py-12">
        <section className="grid gap-8 lg:grid-cols-[1fr_360px] lg:items-end">
          <div className="max-w-3xl">
            <Badge tone={report.summary.productionReady ? "success" : "warning"}>Launch readiness</Badge>
            <h1 className="mt-6 max-w-2xl text-[40px] font-normal leading-[1.2] text-ink">
              Local beta is ready. Production launch still depends on external services.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-body">
              This report checks whether the environment has the service credentials required to move from
              local-first beta to an untrusted public tester launch.
            </p>
          </div>

          <Surface className="bg-surface-soft p-6">
            <div className="grid grid-cols-3 gap-3">
              <SummaryMetric label="Ready" value={report.summary.ready} />
              <SummaryMetric label="Warnings" value={report.summary.warning} />
              <SummaryMetric label="Blocked" value={report.summary.blocked} />
            </div>
            <p className="mt-5 text-sm leading-6 text-muted">
              Generated {new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(report.generatedAt))}
            </p>
            <Button asChild variant="secondary" className="mt-5 w-full">
              <Link href="/api/v1/readiness" target="_blank" rel="noreferrer">
                JSON report
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
          </Surface>
        </section>

        <section className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {report.checks.map((check) => {
            const Icon = statusIcon[check.status];

            return (
              <Surface key={check.id} className="flex min-h-[260px] flex-col p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full border border-hairline bg-surface-soft">
                      <Icon className="h-4 w-4 text-ink" aria-hidden="true" />
                    </span>
                    <h2 className="text-lg font-normal leading-tight text-ink">{check.label}</h2>
                  </div>
                  <Badge tone={statusTone[check.status]}>{check.status}</Badge>
                </div>
                <p className="mt-4 text-sm leading-6 text-muted">{check.description}</p>
                <div className="mt-5 flex flex-wrap gap-2">
                  {check.requiredEnv.map((name) => (
                    <code key={name} className="rounded-sm border border-hairline bg-surface-soft px-2 py-1 text-xs text-ink">
                      {name}
                    </code>
                  ))}
                </div>
                <p className="mt-auto pt-5 text-sm leading-6 text-body">{check.action}</p>
              </Surface>
            );
          })}
        </section>
      </main>
    </div>
  );
}

function SummaryMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-hairline bg-canvas p-4 text-center">
      <p className="text-2xl font-medium text-ink">{value}</p>
      <p className="mt-1 text-xs text-muted">{label}</p>
    </div>
  );
}
