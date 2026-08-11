import { and, desc, eq } from "drizzle-orm";
import { after } from "next/server";
import { getDb } from "@/db/client";
import { embeddings, solutions } from "@/db/schema";
import type { Solution, VerificationStatus } from "@/lib/types";
import { readLocalState, updateLocalState } from "@/server/local-store";
import { generateEmbedding } from "@/server/gemini-solver";
import { getCanvas, getPublicCanvas } from "@/server/repository/canvas-repository";
import { isUuid, mapSolutionRow } from "@/server/repository/helpers";

export async function getSolutionsForCanvas(canvasId: string, options: { publicRead?: boolean } = {}) {
  const canvas = options.publicRead ? await getPublicCanvas(canvasId) : await getCanvas(canvasId);
  if (!canvas) return [];

  const db = getDb();

  if (db) {
    const rows = await db
      .select()
      .from(solutions)
      .where(eq(solutions.canvasId, canvas.id))
      .orderBy(desc(solutions.createdAt));

    return rows.map(mapSolutionRow);
  }

  const state = await readLocalState();
  return state.solutions
    .filter((solution) => solution.canvasId === canvas.id)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

export async function getSolution(solutionId: string) {
  const db = getDb();

  if (db && isUuid(solutionId)) {
    const [row] = await db
      .select()
      .from(solutions)
      .where(eq(solutions.id, solutionId))
      .limit(1);

    if (!row) return null;

    const canvas = await getCanvas(row.canvasId);
    return canvas ? mapSolutionRow(row) : null;
  }

  const state = await readLocalState();
  const solution = state.solutions.find((item) => item.id === solutionId) ?? null;
  if (!solution) return null;

  const canvas = await getCanvas(solution.canvasId);
  return canvas ? solution : null;
}

export async function findCachedSolution(canvasId: string, snapshotHash: string) {
  const db = getDb();

  if (db && isUuid(canvasId)) {
    const [row] = await db
      .select()
      .from(solutions)
      .where(
        and(
          eq(solutions.canvasId, canvasId),
          eq(solutions.snapshotHash, snapshotHash),
          eq(solutions.verificationStatus, "verified"),
        ),
      )
      .orderBy(desc(solutions.createdAt))
      .limit(1);

    return row ? mapSolutionRow(row) : null;
  }

  const state = await readLocalState();
  return (
    state.solutions.find(
      (solution) =>
        solution.canvasId === canvasId &&
        (solution as Solution & { snapshotHash?: string | null }).snapshotHash === snapshotHash &&
        solution.verificationStatus === "verified",
    ) ?? null
  );
}

export async function appendSolution(
  canvasIdentifier: string,
  solution: Solution,
  options: { snapshotHash?: string | null } = {},
) {
  const canvas = await getCanvas(canvasIdentifier);
  if (!canvas) return null;

  const nextSolution: Solution = {
    ...solution,
    canvasId: canvas.id,
    verificationStatus: solution.verificationStatus as VerificationStatus,
  };

  const db = getDb();

  if (db) {
    const [created] = await db
      .insert(solutions)
      .values({
        id: nextSolution.id,
        canvasId: canvas.id,
        regionBounds: nextSolution.regionBounds ?? null,
        promptImageUrl: nextSolution.promptImageUrl,
        subject: nextSolution.subject,
        problemText: nextSolution.problemText,
        steps: nextSolution.steps,
        finalAnswer: nextSolution.finalAnswer,
        verificationStatus: nextSolution.verificationStatus,
        model: nextSolution.model ?? "unknown",
        tokensUsed: nextSolution.tokensUsed ?? 0,
        costUsd: String(nextSolution.costUsd ?? 0),
        snapshotHash: options.snapshotHash ?? null,
        createdAt: new Date(nextSolution.createdAt),
      })
      .returning();

    const embeddingTask = (async () => {
      try {
        const embeddingValues = await generateEmbedding(nextSolution.problemText);
        if (embeddingValues && embeddingValues.length === 768) {
          await db.insert(embeddings).values({
            solutionId: created.id,
            problemText: nextSolution.problemText,
            embedding: embeddingValues,
          });
        }
      } catch (err) {
        console.error("Failed to generate/store embedding:", err);
      }
    })();

    try {
      after(embeddingTask);
    } catch {
      // Intended for scripts outside a request context
    }

    return mapSolutionRow(created);
  }

  const storedSolution = {
    ...nextSolution,
    snapshotHash: options.snapshotHash ?? null,
  } as Solution;

  await updateLocalState((state) => ({
    ...state,
    solutions: [storedSolution, ...state.solutions],
  }));

  return nextSolution;
}
