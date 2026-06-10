import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Gauge,
  LayoutGrid,
  Lock,
  type LucideIcon,
  Share2,
} from "lucide-react";

import { AppHeader } from "@/components/app-header";
import { CreateCanvasButton } from "@/components/dashboard/create-canvas-button";
import { SolutionSearch } from "@/components/dashboard/solution-search";
import { Latex } from "@/components/math/latex";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Surface } from "@/components/ui/surface";
import type { CanvasSummary, UserAccount } from "@/lib/types";
import { cn, formatDateTime, subjectLabel } from "@/lib/utils";

type DashboardShellProps = {
  user: UserAccount;
  canvases: CanvasSummary[];
};

const thumbnailToneClass: Record<CanvasSummary["thumbnailTone"], string> = {
  peach: "bg-peach",
  mint: "bg-mint",
  cream: "bg-cream",
  forest: "bg-forest text-white",
  coral: "bg-coral text-white",
};

export function DashboardShell({ user, canvases }: DashboardShellProps) {
  const quotaPercent = Math.min(100, Math.round((user.problemsToday / user.dailyLimit) * 100));
  const canvasLimitLabel = user.plan === "pro" ? "Unlimited" : `${user.activeCanvases}/${user.activeCanvasLimit}`;
  const canvasLimitReached = user.plan === "free" && user.activeCanvases >= user.activeCanvasLimit;
  const primaryCanvasHref = canvases[0]?.id ? `/c/${canvases[0].id}` : `/onboarding`;
  const hasCanvases = canvases.length > 0;

  return (
    <div className="min-h-screen bg-canvas">
      <AppHeader />
      <main className="mx-auto flex max-w-7xl flex-col gap-12 px-6 py-12">
        <section className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-end">
          <div className="max-w-3xl">
            <Badge tone="dark">Beta</Badge>
            <h1 className="mt-6 max-w-2xl text-[40px] font-normal leading-[1.2] text-ink">
              Draw the STEM problem. Solve it beside your work.
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-body">
              Sketch equations, diagrams, or worked problems on an infinite canvas. InkSolver reads
              your ink, returns verified step-by-step solutions, and answers follow-up questions.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <CreateCanvasButton title="Math practice canvas" subject="math" />
              <Button asChild variant="secondary" size="lg">
                <Link href="/onboarding">
                  Start onboarding
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </Button>
            </div>
          </div>

          <Surface className="bg-surface-soft p-6">
            <div className="flex items-start justify-between gap-6">
              <div>
                <p className="text-sm font-medium text-ink">Daily solve quota</p>
                <p className="mt-2 text-3xl font-normal text-ink">
                  {user.problemsToday}
                  <span className="text-base text-muted">/{user.dailyLimit}</span>
                </p>
              </div>
              <Badge tone={user.plan === "pro" ? "success" : "neutral"}>{user.plan.toUpperCase()}</Badge>
            </div>
            <div className="mt-6 h-2 rounded-full bg-white">
              <div className="h-2 rounded-full bg-primary" style={{ width: `${quotaPercent}%` }} />
            </div>
            {user.plan === "free" && user.usageRemaining === 0 ? (
              <div className="mt-5 rounded-md border border-warning/20 bg-warning/10 p-3 text-sm leading-6 text-warning">
                Daily free solves are used. Upgrade to Pro or wait for the next reset.
              </div>
            ) : null}
            {canvasLimitReached ? (
              <div className="mt-5 rounded-md border border-warning/20 bg-warning/10 p-3 text-sm leading-6 text-warning">
                Free active canvas limit reached. Delete a canvas or upgrade to Pro before creating another.
              </div>
            ) : null}
            <div className="mt-6 grid grid-cols-3 gap-3">
              <Metric icon={LayoutGrid} label="Active canvases" value={canvasLimitLabel} />
              <Metric icon={Gauge} label="Solves today" value={String(user.problemsToday)} />
              <Metric icon={CheckCircle2} label="Plan" value={user.plan === "pro" ? "Pro" : "Free"} />
            </div>
          </Surface>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <div>
            <div className="mb-4 flex items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-normal leading-tight text-ink">Recent canvases</h2>
                <p className="mt-1 text-sm text-muted">Pick up where you left off.</p>
              </div>
            </div>
            {hasCanvases ? (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {canvases.map((canvas) => (
                  <Link
                    key={canvas.id}
                    href={`/c/${canvas.id}`}
                    className="group rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#458fff]"
                  >
                    <Surface className="overflow-hidden transition-colors group-active:bg-surface-soft">
                      {canvas.thumbnailUrl ? (
                        <div className="aspect-[4/3] overflow-hidden bg-white">
                          {/* Thumbnails are tiny self-contained data URLs; next/image adds nothing here. */}
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={canvas.thumbnailUrl}
                            alt={`Preview of ${canvas.title}`}
                            className="h-full w-full object-contain"
                            loading="lazy"
                          />
                        </div>
                      ) : (
                        <div className={cn("canvas-grid flex aspect-[4/3] items-center justify-center p-6", thumbnailToneClass[canvas.thumbnailTone])}>
                          <div className="w-full rounded-md bg-white/90 p-4 text-ink">
                            <p className="text-2xl leading-none">
                              <Latex value={canvas.subject === "physics" ? "v^2 = u^2 + 2as" : "\\int x^2\\,dx"} />
                            </p>
                            <div className="mt-5 h-2 w-2/3 rounded-full bg-ink/20" />
                            <div className="mt-2 h-2 w-1/2 rounded-full bg-ink/20" />
                          </div>
                        </div>
                      )}
                      <div className="p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <h3 className="font-medium text-ink">{canvas.title}</h3>
                            <p className="mt-1 text-xs text-muted">Updated {formatDateTime(canvas.updatedAt)}</p>
                          </div>
                          {canvas.isPublic ? <Share2 className="h-4 w-4 text-muted" aria-hidden="true" /> : <Lock className="h-4 w-4 text-muted" aria-hidden="true" />}
                        </div>
                        <div className="mt-4 flex items-center justify-between">
                          <Badge>{subjectLabel(canvas.subject)}</Badge>
                          <span className="text-xs text-muted">{canvas.solutionCount} solutions</span>
                        </div>
                      </div>
                    </Surface>
                  </Link>
                ))}
              </div>
            ) : (
              <Surface className="canvas-grid p-8">
                <div className="max-w-lg rounded-lg border border-hairline bg-canvas p-6">
                  <h3 className="text-2xl font-normal leading-tight text-ink">No canvases yet</h3>
                  <p className="mt-3 text-sm leading-6 text-muted">
                    Start from onboarding or create a math practice canvas now.
                  </p>
                  <div className="mt-5 flex flex-wrap gap-3">
                    <CreateCanvasButton title="Math practice canvas" subject="math" size="md" />
                    <Button asChild variant="secondary">
                      <Link href="/onboarding">Onboarding</Link>
                    </Button>
                  </div>
                </div>
              </Surface>
            )}
          </div>

          <div className="space-y-4 self-start">
          <SolutionSearch plan={user.plan} />
          <Surface className="bg-primary p-6 text-white">
            <h2 className="text-2xl font-normal leading-tight">Verification-first solving</h2>
            <p className="mt-4 leading-6 text-white/80">
              Every answer is checked against a symbolic math engine. Steps that pass are marked
              verified; anything the engine cannot confirm is flagged for review instead of hidden.
            </p>
            <Button asChild variant="dark" className="mt-6">
              <Link href={primaryCanvasHref}>
                Open a canvas
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
          </Surface>
          </div>
        </section>
      </main>
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-md border border-hairline bg-canvas p-3">
      <Icon className="h-4 w-4 text-muted" aria-hidden="true" />
      <p className="mt-3 text-lg font-medium text-ink">{value}</p>
      <p className="mt-1 text-xs text-muted">{label}</p>
    </div>
  );
}
