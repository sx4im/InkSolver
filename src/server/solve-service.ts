import type { RegionBounds, Solution } from "@/lib/types";
import { appendSolution, assertCanSolve, getCanvas, recordSolveUsage } from "@/server/canvas-repository";
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

  await assertCanSolve();

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
  const solution =
    firstAttempt.verificationStatus === "mismatch"
      ? await verifySolution(
          await solveWithNvidia({
            ...solveInput,
            verificationFeedback:
              firstAttempt.verificationReason ??
              "The previous answer failed symbolic verification. Re-solve and return a corrected final answer.",
          }),
        )
      : firstAttempt;

  const persisted = await appendSolution(canvas.id, solution);

  if (persisted) {
    await recordSolveUsage({
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
