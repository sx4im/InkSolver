import type { Editor } from "tldraw";

import type { RegionBounds, Solution, SolutionStep } from "@/lib/types";

// Vision models do not need more than ~2MP of handwriting, and the snapshot
// must stay under the 4MB request cap even for very large regions.
const maxSnapshotPixels = 2_200_000;
const maxSnapshotBytes = 3_400_000;

const minSolvePixelRatio = 0.35;
const solvePadding = 24;

export class SolveStreamError extends Error {
  constructor(
    message: string,
    public code: string | null,
  ) {
    super(message);
    this.name = "SolveStreamError";
  }
}

export function solveErrorMessage(error: unknown) {
  if (error instanceof SolveStreamError) {
    if (error.code === "quota_exceeded") {
      return "Daily free solves are used up. Upgrade to Pro or wait for the next reset.";
    }
    if (error.code === "not_configured") {
      return "The AI solver is not configured on this server yet.";
    }
    if (error.code === "upstream_failed" || error.code === "upstream_timeout") {
      return "The AI solver is temporarily unavailable. Your quota was not used — try again.";
    }
    if (error.message) return error.message;
  }

  return "The solve request failed. Your quota was not used — try again.";
}

export type SolveCapture =
  | {
      ok: true;
      regionBounds: RegionBounds;
      snapshotBase64: string;
      mimeType: string;
      problemHint: string;
      source: "selection" | "viewport";
    }
  | { ok: false; reason: string };

export async function captureSolveRegion(editor: Editor | null): Promise<SolveCapture> {
  if (!editor) {
    return { ok: false, reason: "The canvas is still loading. Try again in a moment." };
  }

  let shapeIds = [...editor.getSelectedShapeIds()];
  let source: "selection" | "viewport" = "selection";

  if (!shapeIds.length) {
    // No explicit selection: solve everything visible in the viewport instead
    // of failing — the most common flow is draw, then immediately hit Solve.
    const viewport = editor.getViewportPageBounds();
    shapeIds = [...editor.getCurrentPageShapeIds()].filter((id) => {
      const bounds = editor.getShapePageBounds(id);
      if (!bounds) return false;
      return (
        bounds.x < viewport.x + viewport.w &&
        bounds.x + bounds.w > viewport.x &&
        bounds.y < viewport.y + viewport.h &&
        bounds.y + bounds.h > viewport.y
      );
    });
    source = "viewport";
  }

  if (!shapeIds.length) {
    return { ok: false, reason: "Draw or select a problem first, then press Solve." };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const id of shapeIds) {
    const bounds = editor.getShapePageBounds(id);
    if (!bounds) continue;
    minX = Math.min(minX, bounds.x);
    minY = Math.min(minY, bounds.y);
    maxX = Math.max(maxX, bounds.x + bounds.w);
    maxY = Math.max(maxY, bounds.y + bounds.h);
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY)) {
    return { ok: false, reason: "Could not measure the selected shapes. Try selecting them again." };
  }

  const regionBounds: RegionBounds = {
    x: minX,
    y: minY,
    w: Math.max(1, maxX - minX),
    h: Math.max(1, maxY - minY),
  };

  const baseRatio = Math.min(
    2,
    Math.max(minSolvePixelRatio, Math.sqrt(maxSnapshotPixels / (regionBounds.w * regionBounds.h))),
  );
  const problemHint =
    source === "selection"
      ? "Solve the selected whiteboard region."
      : "Solve the STEM problem visible on this whiteboard.";

  for (const pixelRatio of [baseRatio, baseRatio / 2]) {
    try {
      // background: true renders strokes on the white canvas; transparent
      // PNGs of dark ink are unreliable inputs for vision models.
      const image = await editor.toImageDataUrl(shapeIds, {
        background: true,
        format: "png",
        padding: solvePadding,
        pixelRatio,
      });

      const estimatedBytes = Math.floor(image.url.length * 0.75);

      if (estimatedBytes <= maxSnapshotBytes) {
        return {
          ok: true,
          regionBounds,
          snapshotBase64: image.url,
          mimeType: "image/png",
          problemHint,
          source,
        };
      }
    } catch {
      break;
    }
  }

  return {
    ok: false,
    reason: "This region is too large to snapshot. Zoom in or select a smaller part of the board.",
  };
}

export async function readSolveStream(
  body: ReadableStream<Uint8Array>,
  handlers: {
    onStep: (step: SolutionStep) => void;
    onStatus?: (state: string) => void;
    onDone: (solution: Solution) => void;
  },
) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";

    for (const event of events) {
      const eventName = event
        .split("\n")
        .find((line) => line.startsWith("event: "))
        ?.slice(7);
      const dataLine = event
        .split("\n")
        .find((line) => line.startsWith("data: "))
        ?.slice(6);

      if (!eventName || !dataLine) continue;

      let payload: {
        step_num?: number;
        latex?: string;
        explanation?: string;
        verified?: boolean;
        verification_status?: SolutionStep["verificationStatus"];
        solution?: Solution;
        error?: string;
        code?: string;
        state?: string;
      };

      try {
        payload = JSON.parse(dataLine);
      } catch {
        continue;
      }

      if (eventName === "error") {
        throw new SolveStreamError(payload.error ?? "Solve failed", payload.code ?? null);
      }

      if (eventName === "status" && payload.state) {
        handlers.onStatus?.(payload.state);
      }

      if (eventName === "step" && payload.step_num != null && payload.latex != null && payload.explanation != null) {
        handlers.onStep({
          stepNum: payload.step_num,
          latex: payload.latex,
          explanation: payload.explanation,
          verified: payload.verified ?? false,
          verificationStatus: payload.verification_status ?? "unverifiable",
        });
      }

      if (eventName === "done" && payload.solution) {
        handlers.onDone(payload.solution);
      }
    }
  }
}
