"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, BookOpen, CheckCircle2, FlaskConical, FunctionSquare, PenTool, Sigma, Sparkles } from "lucide-react";

import { CreateCanvasButton } from "@/components/dashboard/create-canvas-button";
import { Formula } from "@/components/math/math-text";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Surface } from "@/components/ui/surface";
import { DEMO_CANVAS_ID } from "@/lib/mock-data";
import type { Subject } from "@/lib/types";
import { cn } from "@/lib/utils";

const steps = [
  {
    title: "Pick a STEM lane",
    copy: "Choose the subject that best matches the first problem.",
    icon: BookOpen,
  },
  {
    title: "Draw naturally",
    copy: "Use the canvas like notebook paper, then select the stuck region.",
    icon: PenTool,
  },
  {
    title: "Solve and ask why",
    copy: "InkSolver places verified steps beside your work and keeps follow-up chat in context.",
    icon: Sparkles,
  },
];

const subjectOptions: Array<{ label: string; value: Subject; icon: typeof Sigma; sample: string }> = [
  { label: "Math", value: "math", icon: Sigma, sample: "\\int x^2 dx" },
  { label: "Physics", value: "physics", icon: FunctionSquare, sample: "v^2 = u^2 + 2as" },
  { label: "Chemistry", value: "chem", icon: FlaskConical, sample: "2H_2 + O_2" },
];

export function OnboardingFlow() {
  const [stepIndex, setStepIndex] = useState(0);
  const [subject, setSubject] = useState<Subject>("math");
  const activeStep = steps[stepIndex];
  const ActiveIcon = activeStep.icon;
  const selectedSubject = useMemo(
    () => subjectOptions.find((option) => option.value === subject) ?? subjectOptions[0],
    [subject],
  );

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-8 md:py-12">
      <section className="grid gap-8 lg:grid-cols-[0.92fr_1.08fr] lg:items-center">
        <div>
          <Badge tone="dark">First solve</Badge>
          <h1 className="mt-6 max-w-xl text-[40px] font-normal leading-[1.2] text-ink">Set up the first canvas in three moves.</h1>
          <p className="mt-5 max-w-xl text-base leading-7 text-body">
            Choose a subject, open the canvas, and run the demo solve path that mirrors the PRD workflow.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <CreateCanvasButton
              title={`${selectedSubject.label} practice canvas`}
              subject={subject}
              label="Create my canvas"
            />
            <Button asChild variant="secondary" size="lg">
              <Link href={`/c/${DEMO_CANVAS_ID}`}>
                Open demo
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
          </div>
        </div>

        <Surface className="bg-surface-soft p-5 md:p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-ink">Step {stepIndex + 1} of 3</p>
              <h2 className="mt-2 text-2xl font-normal leading-tight text-ink">{activeStep.title}</h2>
            </div>
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary text-white">
              <ActiveIcon className="h-5 w-5" aria-hidden="true" />
            </div>
          </div>

          <div className="mt-5 grid grid-cols-3 gap-2" aria-label="Onboarding progress">
            {steps.map((step, index) => (
              <button
                key={step.title}
                type="button"
                className={cn(
                  "h-2 rounded-full transition-colors",
                  index <= stepIndex ? "bg-primary" : "bg-white",
                )}
                aria-label={`Go to ${step.title}`}
                onClick={() => setStepIndex(index)}
              />
            ))}
          </div>

          <p className="mt-6 text-base leading-7 text-body">{activeStep.copy}</p>

          {stepIndex === 0 ? (
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              {subjectOptions.map((option) => {
                const Icon = option.icon;
                const selected = option.value === subject;

                return (
                  <button
                    key={option.value}
                    type="button"
                    className={cn(
                      "rounded-lg border p-4 text-left transition-colors",
                      selected ? "border-primary bg-canvas text-ink" : "border-hairline bg-white/70 text-muted active:bg-canvas",
                    )}
                    onClick={() => setSubject(option.value)}
                    aria-pressed={selected}
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" />
                    <span className="mt-3 block text-sm font-medium">{option.label}</span>
                    <Formula latex={option.sample} className="mt-2 block max-w-full overflow-x-auto text-lg leading-6" />
                  </button>
                );
              })}
            </div>
          ) : null}

          {stepIndex === 1 ? (
            <div className="canvas-grid mt-6 rounded-lg border border-hairline bg-canvas p-5">
              <Formula latex={selectedSubject.sample} display className="text-4xl leading-none text-ink" />
              <div className="mt-6 h-2 w-2/3 rounded-full bg-ink/15" />
              <div className="mt-2 h-2 w-1/2 rounded-full bg-ink/15" />
            </div>
          ) : null}

          {stepIndex === 2 ? (
            <div className="mt-6 rounded-lg border border-success/20 bg-success/10 p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-success">
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                Verified solve path ready
              </div>
              <p className="mt-3 text-sm leading-6 text-body">
                The demo canvas can solve the integral fallback, stream steps, verify the answer, and answer step follow-ups.
              </p>
            </div>
          ) : null}

          <div className="mt-6 flex items-center justify-between gap-3">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setStepIndex((current) => Math.max(0, current - 1))}
              disabled={stepIndex === 0}
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Back
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => setStepIndex((current) => Math.min(steps.length - 1, current + 1))}
              disabled={stepIndex === steps.length - 1}
            >
              Next
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </Surface>
      </section>
    </main>
  );
}
