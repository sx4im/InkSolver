import { ChevronDown, MessageSquareText } from "lucide-react";

import { VerificationBadge } from "@/components/canvas/verification-badge";
import { Latex } from "@/components/math/latex";
import { Button } from "@/components/ui/button";
import { Surface } from "@/components/ui/surface";
import type { Solution, SolutionStep } from "@/lib/types";
import { cn } from "@/lib/utils";

const stepStatusClass = {
  verified: "border-success/25 bg-success/5",
  unverifiable: "border-warning/25 bg-warning/5",
  mismatch: "border-danger/25 bg-danger/5",
};

// Pending/status placeholders ("Solving...", "Verifying...") are plain prose,
// not math; only render through KaTeX when the text looks like LaTeX.
function looksLikeMath(value: string) {
  return /[\\^_{}=+\-*/]|\d/.test(value);
}

export function SolutionCard({
  solution,
  onAskStep,
}: {
  solution: Solution;
  onAskStep?: (step: SolutionStep) => void;
}) {
  return (
    <Surface className="bg-canvas p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase text-muted">AI solution</p>
          <h3 className="mt-2 text-2xl leading-tight text-ink">
            {looksLikeMath(solution.finalAnswer) ? (
              <Latex value={solution.finalAnswer} display />
            ) : (
              <span className="font-hand text-3xl leading-none">{solution.finalAnswer}</span>
            )}
          </h3>
        </div>
        <VerificationBadge status={solution.verificationStatus} />
      </div>
      <div className="mt-4 space-y-3">
        {solution.steps.map((step) => (
          <details
            key={step.stepNum}
            className={cn("group rounded-md border p-3", stepStatusClass[step.verificationStatus])}
            open={step.stepNum === 1}
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
              <span className="min-w-0 text-sm font-medium text-ink">
                Step {step.stepNum}:{" "}
                <Latex value={step.latex} className="text-base" />
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <VerificationBadge status={step.verificationStatus} compact />
                <ChevronDown className="h-4 w-4 text-muted transition-transform group-open:rotate-180" aria-hidden="true" />
              </span>
            </summary>
            <p className="mt-3 text-sm leading-6 text-body">{step.explanation}</p>
            {step.verificationReason ? <p className="mt-2 text-xs leading-5 text-muted">{step.verificationReason}</p> : null}
            {onAskStep ? (
              <Button type="button" variant="secondary" size="sm" className="mt-3" onClick={() => onAskStep(step)}>
                <MessageSquareText className="h-4 w-4" aria-hidden="true" />
                Ask why
              </Button>
            ) : null}
          </details>
        ))}
      </div>
    </Surface>
  );
}
