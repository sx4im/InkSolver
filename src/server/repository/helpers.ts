import { canvases, chatMessages, solutions, users } from "@/db/schema";
import { DEMO_CANVAS_ID } from "@/lib/mock-data";
import type {
  CanvasDetail,
  CanvasSnapshot,
  CanvasSummary,
  ChatMessage,
  Solution,
  Subject,
  UserAccount,
} from "@/lib/types";
import { dailyLimitForPlan, activeCanvasLimitForPlan } from "@/server/repository/constants";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string) {
  return uuidPattern.test(value);
}

export function nextResetAt(now = new Date()) {
  const next = new Date(now);
  next.setUTCHours(24, 0, 0, 0);
  return next;
}

export function normalizeUserAccount(user: UserAccount, now = new Date()): UserAccount {
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

export function normalizeCanvasIdentifier(identifier: string) {
  if (identifier === "calculus-past-paper") return DEMO_CANVAS_ID;
  return identifier;
}

export function definedCanvasPatch<T extends Record<string, unknown>>(patch: T): Partial<T> {
  return Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) as Partial<T>;
}

export function toneForSubject(subject: Subject): CanvasSummary["thumbnailTone"] {
  if (subject === "physics") return "mint";
  if (subject === "chem") return "cream";
  if (subject === "unknown") return "forest";
  return "peach";
}

export function toIso(value: Date | string | null | undefined) {
  if (!value) return new Date().toISOString();
  return typeof value === "string" ? value : value.toISOString();
}

export function slugify(value: string) {
  return (
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 64) || "canvas"
  );
}

export function mapCanvasRow(
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

export function mapSolutionRow(row: typeof solutions.$inferSelect): Solution {
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

export function mapChatRow(row: typeof chatMessages.$inferSelect): ChatMessage {
  return {
    id: row.id,
    solutionId: row.solutionId,
    role: row.role,
    content: row.content,
    createdAt: toIso(row.createdAt),
  };
}

export function mapUserRow(row: typeof users.$inferSelect): UserAccount {
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
