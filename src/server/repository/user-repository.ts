import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { users } from "@/db/schema";
import { mockUser } from "@/lib/mock-data";
import type { Plan, UserAccount } from "@/lib/types";
import { getAuthenticatedUser, stableUuid } from "@/server/auth-context";
import { readLocalState, updateLocalState } from "@/server/local-store";
import {
  mapUserRow,
  nextResetAt,
  normalizeUserAccount,
  toIso,
} from "@/server/repository/helpers";
import { DEMO_USER_ID } from "@/lib/mock-data";
import { recordUsageEvent } from "@/server/repository/quota-repository";

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

      // We need to resolve canvas count without circular dependency, but Drizzle doesn't require importing canvases table here
      // if we just use SQL or a separate query. Actually, we can import canvases schema here.
      const { canvases } = await import("@/db/schema");
      const { count } = await import("drizzle-orm");
      
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
