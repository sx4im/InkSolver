import crypto from "crypto";

import type { Solution, RegionBounds } from "@/lib/types";
import {
  appendSolution,
  findCachedSolution,
  getCanvas,
  recordSolveUsage,
  recordUsageEvent,
  refundSolveQuota,
  reserveSolveQuota,
} from "@/server/canvas-repository";
import { solveWithNvidia, type StreamedStep } from "@/server/nvidia-solver";
import { storePromptSnapshot } from "@/server/snapshot-storage";
import { verifySolution } from "@/server/verifier-client";

export type SolveRequest = {
  canvasId: string;
  regionBounds?: RegionBounds | null;
  snapshotBase64?: string | null;
  mimeType?: string | null;
  problemHint?: string | null;
};

export type SolveProgressHooks = {
  onStep?: (step: StreamedStep) => void;
  onStatus?: (state: "solving" | "verifying" | "retrying" | "cached") => void;
};

function solveCacheKey(request: SolveRequest) {
  if (!request.snapshotBase64) return null;

  return crypto
    .createHash("sha256")
    .update(request.snapshotBase64)
    .update("\0")
    .update(request.problemHint ?? "")
    .digest("hex");
}

export async function solveCanvasSelection(
  request: SolveRequest,
  hooks: SolveProgressHooks = {},
): Promise<Solution | null> {
  const startedAt = performance.now();
  const canvas = await getCanvas(request.canvasId);
  if (!canvas) return null;

  // Re-solving byte-identical ink with an already-verified answer would spend
  // model tokens to reproduce the same result; serve the cached solution and
  // leave the user's quota untouched.
  const cacheKey = solveCacheKey(request);

  if (cacheKey) {
    const cached = await findCachedSolution(canvas.id, cacheKey);

    if (cached) {
      hooks.onStatus?.("cached");
      for (const step of cached.steps) {
        hooks.onStep?.({ stepNum: step.stepNum, latex: step.latex, explanation: step.explanation });
      }

      await recordUsageEvent({
        userId: canvas.userId,
        eventType: "solve",
        costUsd: 0,
        metadata: {
          solutionId: cached.id,
          canvasId: canvas.id,
          model: cached.model ?? "unknown",
          cached: true,
          durationMs: Math.round(performance.now() - startedAt),
        },
      });

      return cached;
    }
  }

  // Reserve quota atomically before doing any expensive work; refund it if the
  // solve or persistence fails so users are never charged for errors.
  const user = await reserveSolveQuota();

  try {
    const storedSnapshot = await storePromptSnapshot({
      canvasId: canvas.id,
      snapshotBase64: request.snapshotBase64,
      mimeType: request.mimeType,
    });

    const solveInput = {
      canvasId: canvas.id,
      regionBounds: request.regionBounds,
      snapshotBase64: request.snapshotBase64,
      mimeType: storedSnapshot?.mimeType ?? request.mimeType,
      problemHint: request.problemHint,
      promptImageUrl: storedSnapshot?.url ?? null,
    };

    const firstPass = await solveWithNvidia(solveInput, { onStep: hooks.onStep });
    hooks.onStatus?.("verifying");
    const firstAttempt = await verifySolution(firstPass);

    let solution: Solution;

    if (firstAttempt.verificationStatus === "mismatch") {
      hooks.onStatus?.("retrying");
      const retryPass = await solveWithNvidia(
        {
          ...solveInput,
          verificationFeedback:
            firstAttempt.verificationReason ??
            "The previous answer failed symbolic verification. Re-solve and return a corrected final answer.",
        },
        { onStep: hooks.onStep },
      );
      hooks.onStatus?.("verifying");
      const retry = await verifySolution(retryPass);

      // Both model calls were paid for; report combined usage.
      solution = {
        ...retry,
        tokensUsed: (firstAttempt.tokensUsed ?? 0) + (retry.tokensUsed ?? 0),
        costUsd: Number(((firstAttempt.costUsd ?? 0) + (retry.costUsd ?? 0)).toFixed(6)),
      };
    } else {
      solution = firstAttempt;
    }

    const persisted = await appendSolution(canvas.id, solution, { snapshotHash: cacheKey });

    if (!persisted) {
      await refundSolveQuota(user);
      return null;
    }

    await recordSolveUsage({
      user,
      solutionId: persisted.id,
      canvasId: persisted.canvasId,
      model: persisted.model,
      tokensUsed: persisted.tokensUsed,
      costUsd: persisted.costUsd,
      durationMs: Math.round(performance.now() - startedAt),
      verificationStatus: persisted.verificationStatus,
    });

    return persisted;
  } catch (error) {
    await refundSolveQuota(user);
    throw error;
  }
}
