"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Loader2, PenLine } from "lucide-react";

import { Button } from "@/components/ui/button";

type RemixResponse = {
  canvas_id?: string;
  code?: string;
};

export function PublicShareActions({ shareSlug }: { shareSlug: string }) {
  const router = useRouter();
  const [isRemixing, setIsRemixing] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  async function copyShareLink() {
    const url = `${window.location.origin}/s/${shareSlug}`;

    try {
      await navigator.clipboard?.writeText(url);
      setStatus("Share link copied.");
    } catch {
      window.prompt("Copy this share link", url);
      setStatus("Share link ready to copy.");
    }
  }

  async function remixCanvas() {
    if (isRemixing) return;

    setIsRemixing(true);
    setStatus(null);

    try {
      const response = await fetch(`/api/v1/share/${shareSlug}/remix`, {
        method: "POST",
      });
      const payload = (await response.json().catch(() => ({}))) as RemixResponse;

      if (response.status === 402 && payload.code === "active_canvas_limit") {
        setStatus("Free accounts can keep 5 active canvases. Delete one or upgrade to Pro before remixing.");
        return;
      }

      if (!response.ok || !payload.canvas_id) {
        throw new Error(`Remix failed with ${response.status}`);
      }

      router.push(`/c/${payload.canvas_id}`);
    } catch {
      setStatus("Remix could not be created.");
    } finally {
      setIsRemixing(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="secondary" onClick={() => void copyShareLink()}>
          <Copy className="h-4 w-4" aria-hidden="true" />
          Copy link
        </Button>
        <Button type="button" onClick={() => void remixCanvas()} disabled={isRemixing}>
          {isRemixing ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <PenLine className="h-4 w-4" aria-hidden="true" />
          )}
          Copy and remix
        </Button>
      </div>
      {status ? <p className="max-w-xs text-right text-xs leading-5 text-muted">{status}</p> : null}
    </div>
  );
}
