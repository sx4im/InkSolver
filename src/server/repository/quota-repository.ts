import { and, desc, eq, lt, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { usageEvents, users } from "@/db/schema";
import type { UsageEvent, UserAccount, VerificationStatus } from "@/lib/types";
import { readLocalState, updateLocalState } from "@/server/local-store";
import { getCurrentUser } from "@/server/repository/user-repository";
import { listCanvases } from "@/server/repository/canvas-repository";
import { getSolutionsForCanvas } from "@/server/repository/solution-repository";
import { getChatMessagesForSolution } from "@/server/repository/chat-repository";
import { isUuid, normalizeUserAccount, toIso } from "@/server/repository/helpers";
import { QuotaExceededError } from "@/server/repository/errors";

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

  // Increment inside the queued updater so concurrent reserves can't both
  // write the same precomputed next count (lost updates under two Solve tabs).
  let nextProblemsToday = 0;

  await updateLocalState((state) => {
    const current = state.users.find((entry) => entry.id === user.id);
    if (!current) return state;

    if (user.plan === "free" && current.problemsToday >= user.dailyLimit) {
      throw new QuotaExceededError(
        normalizeUserAccount({
          ...current,
          problemsToday: current.problemsToday,
          resetAt: user.resetAt,
        }),
      );
    }

    nextProblemsToday = current.problemsToday + 1;

    return {
      ...state,
      users: state.users.map((entry) =>
        entry.id === user.id
          ? normalizeUserAccount({
              ...entry,
              problemsToday: nextProblemsToday,
              resetAt: user.resetAt,
            })
          : entry,
      ),
    };
  });

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
  
  // Inlined listUsageEventsForCurrentUser
  const db = getDb();
  const limit = 1000;
  let userUsageEvents: UsageEvent[] = [];
  
  if (db) {
    const rows = await db
      .select()
      .from(usageEvents)
      .where(eq(usageEvents.userId, user.id))
      .orderBy(desc(usageEvents.createdAt))
      .limit(limit);

    userUsageEvents = rows.map((row): UsageEvent => ({
      id: row.id,
      userId: row.userId,
      eventType: row.eventType as UsageEvent["eventType"],
      costUsd: Number(row.costUsd),
      metadata: row.metadata as UsageEvent["metadata"],
      createdAt: toIso(row.createdAt),
    }));
  } else {
    const state = await readLocalState();
    userUsageEvents = [...(state.usageEvents ?? [])]
      .filter((event) => event.userId === user.id)
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .slice(0, limit);
  }

  return {
    generatedAt: new Date().toISOString(),
    user,
    canvases: userCanvases,
    solutions: userSolutions,
    chatMessages: chatGroups.flat(),
    usageEvents: userUsageEvents,
  };
}
