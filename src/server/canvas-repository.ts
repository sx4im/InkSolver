import { and, asc, count, desc, eq, lt, sql } from "drizzle-orm";
import { after } from "next/server";

import { getDb } from "@/db/client";
import { canvases, chatMessages, embeddings, solutions, usageEvents, users } from "@/db/schema";
import {
  DEMO_USER_ID,
  DEMO_CANVAS_ID,
  mockUser,
} from "@/lib/mock-data";
import type {
  CanvasDetail,
  CanvasSnapshot,
  CanvasSummary,
  ChatMessage,
  Plan,
  Solution,
  Subject,
  UsageEvent,
  UserAccount,
  VerificationStatus,
} from "@/lib/types";
import { getAuthenticatedUser, stableUuid } from "@/server/auth-context";
import { readLocalState, updateLocalState } from "@/server/local-store";
import { generateEmbedding } from "@/server/gemini-solver";

type CanvasPatch = {
  title?: string;
  subject?: Subject;
  tldrawState?: CanvasSnapshot | null;
  thumbnailUrl?: string | null;
  isPublic?: boolean;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const freeDailyLimit = 10;
const proDailyLimit = 999999;
const freeActiveCanvasLimit = 5;
const proActiveCanvasLimit = 999999;

export class QuotaExceededError extends Error {
  constructor(public user: UserAccount) {
    super("Daily solve quota exceeded");
    this.name = "QuotaExceededError";
  }
}

export class ActiveCanvasLimitError extends Error {
  constructor(public user: UserAccount) {
    super("Active canvas limit exceeded");
    this.name = "ActiveCanvasLimitError";
  }
}

function nextResetAt(now = new Date()) {
  const next = new Date(now);
  next.setUTCHours(24, 0, 0, 0);
  return next;
}

function dailyLimitForPlan(plan: Plan) {
  return plan === "pro" ? proDailyLimit : freeDailyLimit;
}

function activeCanvasLimitForPlan(plan: Plan) {
  return plan === "pro" ? proActiveCanvasLimit : freeActiveCanvasLimit;
}

function normalizeUserAccount(user: UserAccount, now = new Date()): UserAccount {
  const resetAt = user.resetAt ? new Date(user.resetAt) : nextResetAt(now);
  const shouldReset = Number.isNaN(resetAt.valueOf()) || resetAt <= now;
  const plan = user.plan;
  const dailyLimit = dailyLimitForPlan(plan);
  const activeCanvasLimit = activeCanvasLimitForPlan(plan);
  const problemsToday = shouldReset ? 0 : user.problemsToday;

  return {
    ...user,
    dailyLimit,
    activeCanvasLimit,
    problemsToday,
    usageRemaining: Math.max(0, dailyLimit - problemsToday),
    resetAt: (shouldReset ? nextResetAt(now) : resetAt).toISOString(),
  };
}

function isUuid(value: string) {
  return uuidPattern.test(value);
}

function normalizeCanvasIdentifier(identifier: string) {
  if (identifier === "calculus-past-paper") return DEMO_CANVAS_ID;
  return identifier;
}

function definedCanvasPatch(patch: CanvasPatch) {
  const next: CanvasPatch = {};

  if (patch.title !== undefined) next.title = patch.title;
  if (patch.subject !== undefined) next.subject = patch.subject;
  if (patch.tldrawState !== undefined) next.tldrawState = patch.tldrawState;
  if (patch.thumbnailUrl !== undefined) next.thumbnailUrl = patch.thumbnailUrl;
  if (patch.isPublic !== undefined) next.isPublic = patch.isPublic;

  return next;
}

function toneForSubject(subject: Subject): CanvasSummary["thumbnailTone"] {
  if (subject === "physics") return "mint";
  if (subject === "chem") return "cream";
  if (subject === "unknown") return "forest";
  return "peach";
}

function toIso(value: Date | string | null | undefined) {
  if (!value) return new Date().toISOString();
  return typeof value === "string" ? value : value.toISOString();
}

function slugify(value: string) {
  return (
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 64) || "canvas"
  );
}

function mapCanvasRow(
  row: typeof canvases.$inferSelect,
  solutionCount: number,
): CanvasDetail {
  return {
    id: row.id,
    userId: row.userId,
    title: row.title,
    subject: row.subject,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
    shareSlug: row.shareSlug,
    isPublic: row.isPublic,
    thumbnailUrl: row.thumbnailUrl,
    thumbnailTone: toneForSubject(row.subject),
    solutionCount,
    tldrawState: (row.tldrawState as CanvasSnapshot | null) ?? null,
  };
}

function mapSolutionRow(row: typeof solutions.$inferSelect): Solution {
  return {
    id: row.id,
    canvasId: row.canvasId,
    regionBounds: row.regionBounds as Solution["regionBounds"],
    promptImageUrl: row.promptImageUrl,
    problemText: row.problemText,
    subject: row.subject,
    finalAnswer: row.finalAnswer,
    verificationStatus: row.verificationStatus,
    steps: row.steps as Solution["steps"],
    model: row.model,
    tokensUsed: row.tokensUsed,
    costUsd: Number(row.costUsd),
    createdAt: toIso(row.createdAt),
  };
}

function mapChatRow(row: typeof chatMessages.$inferSelect): ChatMessage {
  return {
    id: row.id,
    solutionId: row.solutionId,
    role: row.role,
    content: row.content,
    createdAt: toIso(row.createdAt),
  };
}

function mapUserRow(row: typeof users.$inferSelect): UserAccount {
  return normalizeUserAccount({
    id: row.id,
    name: row.name ?? "Student",
    email: row.email,
    plan: row.plan,
    problemsToday: row.problemsToday,
    dailyLimit: dailyLimitForPlan(row.plan),
    usageRemaining: 0,
    resetAt: toIso(row.resetAt),
    activeCanvases: 0,
    activeCanvasLimit: activeCanvasLimitForPlan(row.plan),
    lemonSqueezyCustomerId: row.lemonSqueezyCustomerId,
  });
}

async function countSolutionsForCanvas(canvasId: string) {
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

async function ensureCurrentDbUser() {
  const db = getDb();
  if (!db) return null;
  const authUser = await getAuthenticatedUser();

  const byId = await db.select().from(users).where(eq(users.id, authUser.id)).limit(1);
  if (byId[0]) {
    const current = byId[0];
    const profileChanged =
      current.email !== authUser.email ||
      current.name !== authUser.name ||
      current.imageUrl !== (authUser.imageUrl ?? null);

    if (!profileChanged) return current;

    const [updated] = await db
      .update(users)
      .set({
        email: authUser.email,
        name: authUser.name,
        imageUrl: authUser.imageUrl,
      })
      .where(eq(users.id, current.id))
      .returning();

    return updated;
  }

  const byEmail = await db.select().from(users).where(eq(users.email, authUser.email)).limit(1);
  if (byEmail[0]) return byEmail[0];

  const [created] = await db
    .insert(users)
    .values({
      id: authUser.id,
      email: authUser.email,
      name: authUser.name,
      imageUrl: authUser.imageUrl,
      plan: "free",
      problemsToday: 0,
      resetAt: nextResetAt(),
    })
    .returning();

  return created;
}

export async function getCurrentUser() {
  const db = getDb();
  const authUser = await getAuthenticatedUser();

  if (db) {
    const user = await ensureCurrentDbUser();
    if (user) {
      const normalized = mapUserRow(user);
      if (normalized.resetAt !== toIso(user.resetAt) || normalized.problemsToday !== user.problemsToday) {
        await db
          .update(users)
          .set({
            problemsToday: normalized.problemsToday,
            resetAt: new Date(normalized.resetAt),
          })
          .where(eq(users.id, user.id));
      }

      const [canvasCount] = await db
        .select({ value: count() })
        .from(canvases)
        .where(eq(canvases.userId, user.id));
      return {
        ...normalized,
        activeCanvases: canvasCount?.value ?? 0,
      };
    }
  }

  const state = await readLocalState();
  const existingUser = state.users.find((user) => user.id === authUser.id || user.email === authUser.email);
  const current = normalizeUserAccount(
    existingUser ?? {
      ...mockUser,
      id: authUser.id,
      name: authUser.name,
      email: authUser.email,
      problemsToday: 0,
      usageRemaining: 10,
      activeCanvases: 0,
      activeCanvasLimit: 5,
      lemonSqueezyCustomerId: null,
    },
  );
  const withProfile = {
    ...current,
    name: authUser.name,
    email: authUser.email,
    activeCanvases: state.canvases.filter((canvas) => canvas.userId === current.id).length,
  };

  if (
    !existingUser ||
    withProfile.resetAt !== existingUser.resetAt ||
    withProfile.problemsToday !== existingUser.problemsToday ||
    withProfile.name !== existingUser.name ||
    withProfile.email !== existingUser.email
  ) {
    await updateLocalState((localState) => ({
      ...localState,
      users: localState.users.some((user) => user.id === withProfile.id)
        ? localState.users.map((user) => (user.id === withProfile.id ? withProfile : user))
        : [withProfile, ...localState.users],
    }));
  }

  return withProfile;
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

async function getPublicCanvas(identifier: string) {
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

export async function getChatMessagesForSolution(solutionId?: string) {
  const db = getDb();
  const solution = solutionId ? await getSolution(solutionId) : null;
  if (!solution) return [];

  if (db && isUuid(solution.id)) {
    const rows = await db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.solutionId, solution.id))
      .orderBy(asc(chatMessages.createdAt));

    return rows.map(mapChatRow);
  }

  const state = await readLocalState();

  return state.chatMessages
    .filter((message) => !message.solutionId || message.solutionId === solution.id)
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
}

export async function appendChatMessage(input: {
  solutionId: string;
  role: ChatMessage["role"];
  content: string;
}) {
  const solution = await getSolution(input.solutionId);
  if (!solution) return null;

  const createdAt = new Date();
  const message: ChatMessage = {
    id: crypto.randomUUID(),
    solutionId: solution.id,
    role: input.role,
    content: input.content,
    createdAt: createdAt.toISOString(),
  };

  const db = getDb();

  if (db && isUuid(solution.id)) {
    const [created] = await db
      .insert(chatMessages)
      .values({
        id: message.id,
        solutionId: solution.id,
        role: input.role,
        content: input.content,
        createdAt,
      })
      .returning();

    return mapChatRow(created);
  }

  await updateLocalState((state) => ({
    ...state,
    chatMessages: [...state.chatMessages, message],
  }));

  return message;
}


export async function reserveSolveQuota(): Promise<UserAccount> {
  const user = await getCurrentUser();
  const db = getDb();

  if (db && isUuid(user.id)) {
    const guard =
      user.plan === "free"
        ? and(eq(users.id, user.id), lt(users.problemsToday, user.dailyLimit))
        : eq(users.id, user.id);
    const rows = await db
      .update(users)
      .set({ problemsToday: sql`${users.problemsToday} + 1` })
      .where(guard)
      .returning({ problemsToday: users.problemsToday });

    if (!rows.length) {
      throw new QuotaExceededError({
        ...user,
        problemsToday: user.dailyLimit,
        usageRemaining: 0,
      });
    }

    return {
      ...user,
      problemsToday: rows[0].problemsToday,
      usageRemaining: Math.max(0, user.dailyLimit - rows[0].problemsToday),
    };
  }

  if (user.plan === "free" && user.problemsToday >= user.dailyLimit) {
    throw new QuotaExceededError(user);
  }

  const nextProblemsToday = user.problemsToday + 1;

  await updateLocalState((state) => ({
    ...state,
    users: state.users.map((current) =>
      current.id === user.id
        ? normalizeUserAccount({
            ...current,
            problemsToday: nextProblemsToday,
            resetAt: user.resetAt,
          })
        : current,
    ),
  }));

  return {
    ...user,
    problemsToday: nextProblemsToday,
    usageRemaining: Math.max(0, user.dailyLimit - nextProblemsToday),
  };
}

export async function refundSolveQuota(user: UserAccount) {
  const db = getDb();

  if (db && isUuid(user.id)) {
    await db
      .update(users)
      .set({ problemsToday: sql`greatest(${users.problemsToday} - 1, 0)` })
      .where(eq(users.id, user.id));
    return;
  }

  await updateLocalState((state) => ({
    ...state,
    users: state.users.map((current) =>
      current.id === user.id
        ? normalizeUserAccount({
            ...current,
            problemsToday: Math.max(0, current.problemsToday - 1),
            resetAt: user.resetAt,
          })
        : current,
    ),
  }));
}

export async function recordUsageEvent(input: {
  userId: string;
  eventType: UsageEvent["eventType"];
  costUsd?: number;
  metadata?: Record<string, unknown> | null;
}) {
  const event: UsageEvent = {
    id: crypto.randomUUID(),
    userId: input.userId,
    eventType: input.eventType,
    costUsd: input.costUsd ?? 0,
    metadata: input.metadata ?? null,
    createdAt: new Date().toISOString(),
  };

  const db = getDb();

  if (db && isUuid(input.userId)) {
    await db.insert(usageEvents).values({
      id: event.id,
      userId: input.userId,
      eventType: input.eventType,
      costUsd: String(input.costUsd ?? 0),
      metadata: input.metadata ?? null,
      createdAt: new Date(event.createdAt),
    });
  } else {
    await updateLocalState((state) => ({
      ...state,
      usageEvents: [...(state.usageEvents ?? []), event],
    }));
  }

  return event;
}

export async function listUsageEvents(limit = 500) {
  const db = getDb();
  const safeLimit = Math.min(Math.max(limit, 1), 2000);

  if (db) {
    const rows = await db
      .select()
      .from(usageEvents)
      .orderBy(desc(usageEvents.createdAt))
      .limit(safeLimit);

    return rows.map((row): UsageEvent => ({
      id: row.id,
      userId: row.userId,
      eventType: row.eventType as UsageEvent["eventType"],
      costUsd: Number(row.costUsd),
      metadata: row.metadata as UsageEvent["metadata"],
      createdAt: toIso(row.createdAt),
    }));
  }

  const state = await readLocalState();
  return [...(state.usageEvents ?? [])]
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, safeLimit);
}

export async function listUsageEventsForCurrentUser(limit = 1000) {
  const user = await getCurrentUser();
  const db = getDb();
  const safeLimit = Math.min(Math.max(limit, 1), 2000);

  if (db) {
    const rows = await db
      .select()
      .from(usageEvents)
      .where(eq(usageEvents.userId, user.id))
      .orderBy(desc(usageEvents.createdAt))
      .limit(safeLimit);

    return rows.map((row): UsageEvent => ({
      id: row.id,
      userId: row.userId,
      eventType: row.eventType as UsageEvent["eventType"],
      costUsd: Number(row.costUsd),
      metadata: row.metadata as UsageEvent["metadata"],
      createdAt: toIso(row.createdAt),
    }));
  }

  const state = await readLocalState();
  return [...(state.usageEvents ?? [])]
    .filter((event) => event.userId === user.id)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, safeLimit);
}

export async function getAccountExport() {
  const user = await getCurrentUser();
  const userCanvases = await listCanvases();
  const solutionGroups = await Promise.all(
    userCanvases.map(async (canvas) => getSolutionsForCanvas(canvas.id)),
  );
  const userSolutions = solutionGroups.flat();
  const chatGroups = await Promise.all(
    userSolutions.map(async (solution) => getChatMessagesForSolution(solution.id)),
  );

  return {
    generatedAt: new Date().toISOString(),
    user,
    canvases: userCanvases,
    solutions: userSolutions,
    chatMessages: chatGroups.flat(),
    usageEvents: await listUsageEventsForCurrentUser(),
  };
}

export async function recordSolveUsage(input: {
  user: UserAccount;
  solutionId: string;
  canvasId: string;
  model?: string | null;
  tokensUsed?: number | null;
  costUsd?: number | null;
  durationMs?: number | null;
  verificationStatus?: VerificationStatus | null;
}) {
  await recordUsageEvent({
    userId: input.user.id,
    eventType: "solve",
    costUsd: input.costUsd ?? 0,
    metadata: {
      solutionId: input.solutionId,
      canvasId: input.canvasId,
      model: input.model ?? "unknown",
      tokensUsed: input.tokensUsed ?? 0,
      durationMs: input.durationMs ?? null,
      verificationStatus: input.verificationStatus ?? null,
    },
  });
}

export async function updateUserPlan(input: {
  plan: Plan;
  userId?: string | null;
  email?: string | null;
  lemonSqueezyCustomerId?: string | null;
}) {
  const db = getDb();
  const normalizedUserId = input.userId ? stableUuid(input.userId) : null;

  if (!normalizedUserId && !input.email) return null;

  if (db) {
    const userRows = normalizedUserId
      ? await db.select().from(users).where(eq(users.id, normalizedUserId)).limit(1)
      : await db.select().from(users).where(eq(users.email, input.email!)).limit(1);
    const user = userRows[0];
    if (!user) return null;

    const [updated] = await db
      .update(users)
      .set({
        plan: input.plan,
        lemonSqueezyCustomerId: input.lemonSqueezyCustomerId ?? user.lemonSqueezyCustomerId,
      })
      .where(eq(users.id, user.id))
      .returning();

    await recordUsageEvent({
      userId: updated.id,
      eventType: "billing",
      metadata: {
        plan: input.plan,
        lemonSqueezyCustomerId: input.lemonSqueezyCustomerId ?? null,
      },
    });

    return mapUserRow(updated);
  }

  let updatedUser: UserAccount | null = null;

  await updateLocalState((state) => ({
    ...state,
    users: state.users.map((user) => {
      const matches =
        (normalizedUserId ? user.id === normalizedUserId : false) ||
        (input.email ? user.email === input.email : false);

      if (!matches) return user;

      updatedUser = normalizeUserAccount({
        ...user,
        plan: input.plan,
        lemonSqueezyCustomerId: input.lemonSqueezyCustomerId ?? user.lemonSqueezyCustomerId ?? null,
      });

      return updatedUser;
    }),
    usageEvents: [
      ...(state.usageEvents ?? []),
      {
        id: crypto.randomUUID(),
        userId: normalizedUserId ?? state.users[0]?.id ?? DEMO_USER_ID,
        eventType: "billing",
        costUsd: 0,
        metadata: {
          plan: input.plan,
          lemonSqueezyCustomerId: input.lemonSqueezyCustomerId ?? null,
        },
        createdAt: new Date().toISOString(),
      },
    ],
  }));

  return updatedUser;
}

export async function appendSolution(canvasIdentifier: string, solution: Solution) {
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
        createdAt: new Date(nextSolution.createdAt),
      })
      .returning();

    // Generate and store the semantic-search embedding off the critical path so
    // the solve response is not delayed by an extra model roundtrip.
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
      // Outside a request scope (scripts/tests) there is no `after` lifecycle;
      // the task still runs in the background.
    }

    return mapSolutionRow(created);
  }

  await updateLocalState((state) => ({
    ...state,
    solutions: [nextSolution, ...state.solutions],
  }));

  return nextSolution;
}
