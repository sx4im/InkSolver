import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowLeft, LockKeyhole, Sparkles } from "lucide-react";

import { CanvasStage } from "@/components/canvas/canvas-stage";
import { SolutionCard } from "@/components/canvas/solution-card";
import { PublicShareActions } from "@/components/share/public-share-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDateTime, subjectLabel } from "@/lib/utils";
import { getCanvasBySlug, getSolutionsForCanvas } from "@/server/canvas-repository";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const canvas = await getCanvasBySlug(slug);

  if (!canvas || !canvas.isPublic) {
    return {
      title: "Shared InkSolver canvas",
    };
  }

  return {
    title: `${canvas.title} | InkSolver`,
    description: `Read-only InkSolver canvas with ${canvas.solutionCount} solution${canvas.solutionCount === 1 ? "" : "s"}.`,
    openGraph: {
      title: `${canvas.title} | InkSolver`,
      description: "Canvas-native STEM solving with verified steps.",
      images: [
        {
          url: `/api/v1/share/${canvas.shareSlug}/og`,
          width: 1200,
          height: 630,
          alt: `${canvas.title} shared InkSolver canvas preview`,
        },
      ],
      type: "article",
    },
    twitter: {
      card: "summary_large_image",
      title: `${canvas.title} | InkSolver`,
      description: "Canvas-native STEM solving with verified steps.",
      images: [`/api/v1/share/${canvas.shareSlug}/og`],
    },
  };
}

export default async function PublicSharePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const canvas = await getCanvasBySlug(slug);

  if (!canvas || !canvas.isPublic) {
    notFound();
  }

  const solutions = await getSolutionsForCanvas(canvas.id, { publicRead: true });

  return (
    <main className="min-h-screen bg-canvas">
      <header className="border-b border-hairline bg-canvas">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <Button asChild variant="ghost">
            <Link href="/">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Back
            </Link>
          </Button>
          <PublicShareActions shareSlug={canvas.shareSlug} />
        </div>
      </header>

      <section className="mx-auto grid max-w-7xl gap-6 px-6 py-8 lg:grid-cols-[1fr_360px]">
        <div className="overflow-hidden rounded-lg border border-hairline bg-surface-soft">
          <div className="flex items-center justify-between border-b border-hairline bg-canvas p-4">
            <div>
              <h1 className="text-xl font-normal text-ink">{canvas.title}</h1>
              <p className="mt-1 text-xs text-muted">Shared canvas updated {formatDateTime(canvas.updatedAt)}</p>
            </div>
            <Badge>{subjectLabel(canvas.subject)}</Badge>
          </div>
          <div className="relative h-[620px]">
            <CanvasStage snapshot={canvas.tldrawState} readOnly />
            <div className="pointer-events-none absolute bottom-4 left-4 rounded-md bg-white/90 px-3 py-2 text-xs font-medium text-muted">
              InkSolver free share
            </div>
          </div>
        </div>

        <aside className="space-y-4">
          <div className="rounded-lg bg-primary p-6 text-white">
            <Sparkles className="h-5 w-5" aria-hidden="true" />
            <h2 className="mt-4 text-2xl font-normal leading-tight">Canvas-native STEM help</h2>
            <p className="mt-3 leading-6 text-white/80">
              Public shares are read-only. Free shares keep the InkSolver watermark, while Pro exports remove it.
            </p>
          </div>
          {solutions.map((solution) => (
            <SolutionCard key={solution.id} solution={solution} />
          ))}
          <div className="rounded-lg border border-hairline bg-canvas p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-ink">
              <LockKeyhole className="h-4 w-4 text-muted" aria-hidden="true" />
              Read-only mode
            </div>
            <p className="mt-2 text-sm leading-6 text-muted">Use Copy and remix to create a private editable copy in your workspace.</p>
          </div>
        </aside>
      </section>
    </main>
  );
}
