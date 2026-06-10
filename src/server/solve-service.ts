import type { RegionBounds, Solution } from "@/lib/types";
import {
  appendSolution,
  getCanvas,
  recordSolveUsage,
  refundSolveQuota,
  reserveSolveQuota,
} from "@/server/canvas-repository";
import { solveWithNvidia } from "@/server/nvidia-solver";
import { storePromptSnapshot } from "@/server/snapshot-storage";
import { verifySolution } from "@/server/verifier-client";

export type SolveRequest = {
  canvasId: string;
  regionBounds?: RegionBounds | null;
  snapshotBase64?: string | null;
  mimeType?: string | null;
  problemHint?: string | null;
};

export async function solveCanvasSelection(request: SolveRequest): Promise<Solution | null> {
  const startedAt = performance.now();
  const canvas = await getCanvas(request.canvasId);
  if (!canvas) return null;

  // Reserve quota atomically before doing any expensive work; refund it if the
  // solve fails so users are never charged for errors.
  const user = await reserveSolveQuota();

  let solution: Solution;

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

    const firstAttempt = await verifySolution(await solveWithNvidia(solveInput));

    if (firstAttempt.verificationStatus === "mismatch") {
      const retry = await verifySolution(
        await solveWithNvidia({
          ...solveInput,
          verificationFeedback:
            firstAttempt.verificationReason ??
            "The previous answer failed symbolic verification. Re-solve and return a corrected final answer.",
        }),
      );

      // Both model calls were paid for; report combined usage.
      solution = {
        ...retry,
        tokensUsed: (firstAttempt.tokensUsed ?? 0) + (retry.tokensUsed ?? 0),
        costUsd: Number(((firstAttempt.costUsd ?? 0) + (retry.costUsd ?? 0)).toFixed(6)),
      };
    } else {
      solution = firstAttempt;
    }
  } catch (error) {
    await refundSolveQuota(user).catch(() => null);
    throw error;
  }

  const persisted = await appendSolution(canvas.id, solution);

  if (persisted) {
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
  }

  return persisted;
}
