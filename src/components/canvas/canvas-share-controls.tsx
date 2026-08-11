"use client";

import Link from "next/link";
import { useState } from "react";
import { CheckCircle2, Eye, Loader2, Share2, Unlink } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ShareState = "idle" | "saving" | "copied" | "error";

// Controlled component: the workspace owns isPublic so the header and the
// mobile drawer render the same publish state.
export function CanvasShareControls({
  canvasId,
  isPublic,
  onPublicChange,
  shareSlug,
  className,
}: {
  canvasId: string;
  isPublic: boolean;
  onPublicChange: (next: boolean) => void;
  shareSlug: string;
  className?: string;
}) {
  const [state, setState] = useState<ShareState>("idle");
  const sharePath = `/s/${shareSlug}`;

  async function setPublic(nextIsPublic: boolean) {
    if (state === "saving") return false;

    setState("saving");

    try {
      const response = await fetch(`/api/v1/canvases/${canvasId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          is_public: nextIsPublic,
        }),
      });

      if (!response.ok) {
        throw new Error(`Share update failed with ${response.status}`);
      }

      onPublicChange(nextIsPublic);
      setState("idle");
      return true;
    } catch {
      setState("error");
      return false;
    }
  }

  async function copyLink() {
    if (!isPublic) {
      const published = await setPublic(true);
      if (!published) return;
    }

    const url = typeof window === "undefined" ? sharePath : `${window.location.origin}${sharePath}`;

    try {
      await navigator.clipboard?.writeText(url);
      setState("copied");
      window.setTimeout(() => setState("idle"), 1800);
    } catch {
      window.prompt("Copy this share link", url);
      setState("copied");
    }
  }

  return (
    <div className={cn("items-center gap-2", className ?? "hidden sm:flex")}>
      <Badge tone={isPublic ? "success" : state === "error" ? "danger" : "neutral"} className="hidden xl:inline-flex">
        {state === "error" ? "Share failed" : isPublic ? "Public" : "Private"}
      </Badge>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => void copyLink()}
        disabled={state === "saving"}
      >
        {state === "saving" ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : state === "copied" ? (
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
        ) : (
          <Share2 className="h-4 w-4" aria-hidden="true" />
        )}
        <span className="hidden lg:inline">{state === "copied" ? "Copied" : isPublic ? "Copy link" : "Publish"}</span>
      </Button>
      {isPublic ? (
        <>
          <Button asChild variant="secondary" size="icon" aria-label="Open public share">
            <Link href={sharePath} target="_blank" rel="noreferrer">
              <Eye className="h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Unpublish canvas"
            onClick={() => void setPublic(false)}
            disabled={state === "saving"}
          >
            <Unlink className="h-4 w-4" aria-hidden="true" />
          </Button>
        </>
      ) : null}
    </div>
  );
}
