"use client";

import { useState } from "react";
import { CheckCircle2, Loader2, Send } from "lucide-react";

import { Button } from "@/components/ui/button";

type SubmitState = "idle" | "saving" | "saved" | "error";

export function FeedbackForm() {
  const [state, setState] = useState<SubmitState>("idle");

  async function submitFeedback(formData: FormData) {
    if (state === "saving") return;

    setState("saving");

    const payload = {
      subject: String(formData.get("subject") ?? "unknown"),
      expected_answer: String(formData.get("expected_answer") ?? ""),
      actual_answer: String(formData.get("actual_answer") ?? ""),
      device: String(formData.get("device") ?? ""),
      notes: String(formData.get("notes") ?? ""),
      share_url: String(formData.get("share_url") ?? ""),
    };

    try {
      const response = await fetch("/api/v1/feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) throw new Error(`Feedback failed with ${response.status}`);
      setState("saved");
    } catch {
      setState("error");
    }
  }

  return (
    <form action={submitFeedback} className="grid gap-5">
      <div className="grid gap-2">
        <label htmlFor="subject" className="text-sm font-medium text-ink">
          Subject
        </label>
        <select
          id="subject"
          name="subject"
          className="h-11 rounded-md border border-hairline bg-canvas px-3 text-sm text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#458fff]"
          defaultValue="math"
        >
          <option value="math">Math</option>
          <option value="physics">Physics</option>
          <option value="chem">Chemistry</option>
          <option value="unknown">Not sure</option>
        </select>
      </div>

      <div className="grid gap-2">
        <label htmlFor="device" className="text-sm font-medium text-ink">
          Device
        </label>
        <input
          id="device"
          name="device"
          required
          maxLength={160}
          placeholder="iPad Safari, Chrome laptop, Android phone"
          className="h-11 rounded-md border border-hairline bg-canvas px-3 text-sm text-ink placeholder:text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#458fff]"
        />
      </div>

      <div className="grid gap-2 md:grid-cols-2">
        <div className="grid gap-2">
          <label htmlFor="expected_answer" className="text-sm font-medium text-ink">
            Expected answer
          </label>
          <textarea
            id="expected_answer"
            name="expected_answer"
            rows={4}
            maxLength={1200}
            className="resize-y rounded-md border border-hairline bg-canvas px-3 py-2 text-sm leading-6 text-ink placeholder:text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#458fff]"
          />
        </div>
        <div className="grid gap-2">
          <label htmlFor="actual_answer" className="text-sm font-medium text-ink">
            InkSolver answer
          </label>
          <textarea
            id="actual_answer"
            name="actual_answer"
            rows={4}
            maxLength={1200}
            className="resize-y rounded-md border border-hairline bg-canvas px-3 py-2 text-sm leading-6 text-ink placeholder:text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#458fff]"
          />
        </div>
      </div>

      <div className="grid gap-2">
        <label htmlFor="share_url" className="text-sm font-medium text-ink">
          Share URL
        </label>
        <input
          id="share_url"
          name="share_url"
          maxLength={500}
          placeholder="Optional public /s/... link"
          className="h-11 rounded-md border border-hairline bg-canvas px-3 text-sm text-ink placeholder:text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#458fff]"
        />
      </div>

      <div className="grid gap-2">
        <label htmlFor="notes" className="text-sm font-medium text-ink">
          What happened?
        </label>
        <textarea
          id="notes"
          name="notes"
          required
          rows={5}
          maxLength={2400}
          placeholder="Include the problem, what you expected, and what felt confusing."
          className="resize-y rounded-md border border-hairline bg-canvas px-3 py-2 text-sm leading-6 text-ink placeholder:text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#458fff]"
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={state === "saving" || state === "saved"}>
          {state === "saving" ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : state === "saved" ? (
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Send className="h-4 w-4" aria-hidden="true" />
          )}
          {state === "saved" ? "Submitted" : "Submit feedback"}
        </Button>
        {state === "error" ? (
          <p className="text-sm leading-6 text-danger">Feedback could not be saved.</p>
        ) : null}
        {state === "saved" ? (
          <p className="text-sm leading-6 text-success">Feedback saved to beta telemetry.</p>
        ) : null}
      </div>
    </form>
  );
}
