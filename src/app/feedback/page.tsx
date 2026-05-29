import Link from "next/link";
import { ArrowRight, MessageSquareText } from "lucide-react";

import { AppHeader } from "@/components/app-header";
import { FeedbackForm } from "@/components/feedback/feedback-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Surface } from "@/components/ui/surface";

export const dynamic = "force-dynamic";

export default function FeedbackPage() {
  return (
    <div className="min-h-screen bg-canvas">
      <AppHeader />
      <main className="mx-auto max-w-6xl px-6 py-12">
        <section className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
          <div className="max-w-xl">
            <Badge>Beta feedback</Badge>
            <h1 className="mt-6 text-[40px] font-normal leading-[1.2] text-ink">
              Capture tester reports while the context is still fresh.
            </h1>
            <p className="mt-5 text-base leading-7 text-body">
              Store subject, device, expected answer, actual answer, and optional share URL as telemetry so launch
              issues can be triaged beside solve and error events.
            </p>
            <Surface className="mt-8 bg-surface-soft p-5">
              <div className="flex items-start gap-3">
                <MessageSquareText className="mt-1 h-4 w-4 text-muted" aria-hidden="true" />
                <div>
                  <h2 className="text-lg font-normal text-ink">Tester loop</h2>
                  <p className="mt-2 text-sm leading-6 text-muted">
                    Ask testers to submit one report for every wrong answer, unreadable handwriting case, export
                    issue, or confusing verification state.
                  </p>
                </div>
              </div>
            </Surface>
            <Button asChild variant="secondary" className="mt-5">
              <Link href="/readiness">
                View readiness
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
          </div>

          <Surface className="p-6">
            <FeedbackForm />
          </Surface>
        </section>
      </main>
    </div>
  );
}
