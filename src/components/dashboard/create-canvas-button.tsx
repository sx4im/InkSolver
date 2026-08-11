"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { Subject } from "@/lib/types";

export function CreateCanvasButton({
  title = "Untitled canvas",
  subject = "math",
  label = "New canvas",
  size = "lg",
  variant = "primary",
  className,
}: {
  title?: string;
  subject?: Subject;
  label?: string;
  size?: "sm" | "md" | "lg";
  variant?: "primary" | "secondary" | "ghost" | "dark";
  className?: string;
}) {
  const router = useRouter();
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    if (isCreating) return;

    setIsCreating(true);
    setError(null);

    try {
      const response = await fetch("/api/v1/canvases", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title,
          subject,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { code?: string } | null;
        if (response.status === 402 && payload?.code === "active_canvas_limit") {
          setError("Free accounts can keep 5 active canvases. Delete one or upgrade to Pro.");
          return;
        }

        throw new Error(`Canvas create failed with ${response.status}`);
      }

      const payload = (await response.json()) as { canvas_id: string };
      router.push(`/c/${payload.canvas_id}`);
    } catch {
      setError("Canvas could not be created.");
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <div className="inline-flex max-w-full flex-col items-start gap-2">
      <Button type="button" size={size} variant={variant} className={className} onClick={() => void handleCreate()} disabled={isCreating}>
        {isCreating ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />}
        {isCreating ? "Creating" : label}
      </Button>
      {error ? <p className="max-w-xs text-xs leading-5 text-danger">{error}</p> : null}
    </div>
  );
}
