import { and, desc, eq, count } from "drizzle-orm";
import { getDb } from "@/db/client";
import { canvases, solutions } from "@/db/schema";
import type { CanvasDetail, CanvasSnapshot, Subject, Solution } from "@/lib/types";
import { readLocalState, updateLocalState } from "@/server/local-store";
import { getCurrentUser } from "@/server/repository/user-repository";
import { getSolutionsForCanvas, appendSolution } from "@/server/repository/solution-repository";
import { recordUsageEvent } from "@/server/repository/quota-repository";
import {
  definedCanvasPatch,
  isUuid,
  mapCanvasRow,
  normalizeCanvasIdentifier,
  slugify,
  toneForSubject,
} from "@/server/repository/helpers";
import { ActiveCanvasLimitError } from "@/server/repository/errors";

type CanvasPatch = {
  title?: string;
  subject?: Subject;
  tldrawState?: CanvasSnapshot | null;
  thumbnailUrl?: string | null;
  isPublic?: boolean;
};

export async function countSolutionsForCanvas(canvasId: string) {
  const db = getDb();
  if (!db) return 0;

  const [row] = await db
    .select({ value: count() })
    .from(solutions)
    .where(eq(solutions.canvasId, canvasId));

  return row?.value ?? 0;
}

async function resolveDbCanvas(identifier: string, userId?: string | null) {
  const db = getDb();
  if (!db) return null;

  if (isUuid(identifier)) {
    const byId = await db
      .select()
      .from(canvases)
      .where(userId ? and(eq(canvases.id, identifier), eq(canvases.userId, userId)) : eq(canvases.id, identifier))
      .limit(1);
    if (byId[0]) return byId[0];
  }

  const bySlug = await db
    .select()
    .from(canvases)
    .where(userId ? and(eq(canvases.shareSlug, identifier), eq(canvases.userId, userId)) : eq(canvases.shareSlug, identifier))
    .limit(1);
  return bySlug[0] ?? null;
}

export async function listCanvases() {
  const db = getDb();
  const user = await getCurrentUser();

  if (db) {
    const rows = await db
      .select({
        canvas: canvases,
        solutionCount: count(solutions.id),
      })
      .from(canvases)
      .leftJoin(solutions, eq(solutions.canvasId, canvases.id))
      .where(eq(canvases.userId, user.id))
      .groupBy(canvases.id)
      .orderBy(desc(canvases.updatedAt));

    return rows.map((row) => mapCanvasRow(row.canvas, row.solutionCount));
  }

  const state = await readLocalState();
  return state.canvases
    .filter((canvas) => canvas.userId === user.id)
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}

export async function getCanvas(identifier: string) {
  const normalizedIdentifier = normalizeCanvasIdentifier(identifier);
  const db = getDb();
  const user = await getCurrentUser();

  if (db) {
    const canvas = await resolveDbCanvas(normalizedIdentifier, user.id);
    if (!canvas) return null;

    return mapCanvasRow(canvas, await countSolutionsForCanvas(canvas.id));
  }

  const state = await readLocalState();
  return (
    state.canvases.find(
      (canvas) =>
        canvas.userId === user.id &&
        (canvas.id === normalizedIdentifier ||
          canvas.shareSlug === normalizedIdentifier ||
          canvas.title?.toLowerCase().replace(/[^a-z0-9]+/g, "-") === normalizedIdentifier),
    ) ?? null
  );
}

export async function getCanvasBySlug(slug: string) {
  const db = getDb();

  if (db) {
    const [canvas] = await db.select().from(canvases).where(eq(canvases.shareSlug, slug)).limit(1);
    if (!canvas) return null;

    return mapCanvasRow(canvas, await countSolutionsForCanvas(canvas.id));
  }

  const state = await readLocalState();
  return state.canvases.find((canvas) => canvas.shareSlug === slug) ?? null;
}

export async function getPublicCanvas(identifier: string) {
  const normalizedIdentifier = normalizeCanvasIdentifier(identifier);
  const db = getDb();

  if (db) {
    const canvas = await resolveDbCanvas(normalizedIdentifier);
    if (!canvas || !canvas.isPublic) return null;

    return mapCanvasRow(canvas, await countSolutionsForCanvas(canvas.id));
  }

  const state = await readLocalState();
  return (
    state.canvases.find(
      (canvas) =>
        canvas.isPublic &&
        (canvas.id === normalizedIdentifier ||
          canvas.shareSlug === normalizedIdentifier ||
          canvas.title?.toLowerCase().replace(/[^a-z0-9]+/g, "-") === normalizedIdentifier),
    ) ?? null
  );
}

export async function createCanvas(input: { title?: string; subject?: Subject }) {
  const db = getDb();
  const user = await getCurrentUser();

  if (user.plan === "free" && user.activeCanvases >= user.activeCanvasLimit) {
    throw new ActiveCanvasLimitError(user);
  }

  const title = input.title?.trim() || "Untitled canvas";
  const subject = input.subject ?? "unknown";
  const shareSlug = `${slugify(title)}-${crypto.randomUUID().slice(0, 8)}`;

  if (db) {
    const [created] = await db
      .insert(canvases)
      .values({
        userId: user.id,
        title,
        subject,
        shareSlug,
      })
      .returning();

    return mapCanvasRow(created, 0);
  }

  const now = new Date().toISOString();
  const created: CanvasDetail = {
    id: crypto.randomUUID(),
    userId: user.id,
    title,
    subject,
    createdAt: now,
    updatedAt: now,
    shareSlug,
    isPublic: false,
    thumbnailUrl: null,
    thumbnailTone: toneForSubject(subject),
    solutionCount: 0,
    tldrawState: null,
  };

  await updateLocalState((state) => ({
    ...state,
    canvases: [created, ...state.canvases],
  }));

  return created;
}

export async function updateCanvas(identifier: string, patch: CanvasPatch) {
  const db = getDb();
  const normalizedIdentifier = normalizeCanvasIdentifier(identifier);
  const updatedAt = new Date();
  const user = await getCurrentUser();
  const patchNext = definedCanvasPatch(patch);

  if (db) {
    const current = await resolveDbCanvas(normalizedIdentifier, user.id);
    if (!current) return null;

    const [updated] = await db
      .update(canvases)
      .set({
        ...patchNext,
        updatedAt,
      })
      .where(eq(canvases.id, current.id))
      .returning();

    return mapCanvasRow(updated, await countSolutionsForCanvas(updated.id));
  }

  let updatedCanvas: CanvasDetail | null = null;

  await updateLocalState((state) => {
    const canvasesNext = state.canvases.map((canvas) => {
      if (
        canvas.userId !== user.id ||
        (canvas.id !== normalizedIdentifier && canvas.shareSlug !== normalizedIdentifier)
      ) {
        return canvas;
      }

      updatedCanvas = {
        ...canvas,
        ...patchNext,
        updatedAt: updatedAt.toISOString(),
      };

      return updatedCanvas;
    });

    return {
      ...state,
      canvases: canvasesNext,
    };
  });

  return updatedCanvas;
}

export async function remixPublicCanvas(slug: string) {
  const sourceCanvas = await getCanvasBySlug(slug);

  if (!sourceCanvas || !sourceCanvas.isPublic) {
    return null;
  }

  const sourceSolutions = await getSolutionsForCanvas(sourceCanvas.id, { publicRead: true });
  const remixedCanvas = await createCanvas({
    title: `Remix of ${sourceCanvas.title}`,
    subject: sourceCanvas.subject,
  });
  const updatedCanvas = sourceCanvas.tldrawState
    ? await updateCanvas(remixedCanvas.id, {
        tldrawState: sourceCanvas.tldrawState,
      })
    : remixedCanvas;

  const copiedSolutions: Solution[] = [];

  for (const solution of sourceSolutions) {
    const copied = await appendSolution(remixedCanvas.id, {
      ...solution,
      id: crypto.randomUUID(),
      canvasId: remixedCanvas.id,
      promptImageUrl: solution.promptImageUrl ?? null,
      createdAt: new Date().toISOString(),
    });

    if (copied) copiedSolutions.push(copied);
  }

  const user = await getCurrentUser();
  await recordUsageEvent({
    userId: user.id,
    eventType: "telemetry",
    metadata: {
      kind: "share_remix",
      sourceCanvasId: sourceCanvas.id,
      sourceShareSlug: sourceCanvas.shareSlug,
      canvasId: remixedCanvas.id,
      copiedSolutionCount: copiedSolutions.length,
    },
  });

  return {
    canvas: updatedCanvas ?? remixedCanvas,
    sourceCanvas,
    copiedSolutions,
  };
}

export async function deleteCanvas(identifier: string) {
  const db = getDb();
  const normalizedIdentifier = normalizeCanvasIdentifier(identifier);
  const user = await getCurrentUser();

  if (db) {
    const current = await resolveDbCanvas(normalizedIdentifier, user.id);
    if (!current) return false;
    await db.delete(canvases).where(eq(canvases.id, current.id));
    return true;
  }

  let deleted = false;

  await updateLocalState((state) => {
    const canvasesNext = state.canvases.filter((canvas) => {
      const matches =
        canvas.userId === user.id &&
        (canvas.id === normalizedIdentifier || canvas.shareSlug === normalizedIdentifier);
      const keep = !matches;
      if (!keep) deleted = true;
      return keep;
    });

    return {
      ...state,
      canvases: canvasesNext,
      solutions: state.solutions.filter((solution) =>
        canvasesNext.some((canvas) => canvas.id === solution.canvasId),
      ),
    };
  });

  return deleted;
}
