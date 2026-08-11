import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { chatMessages } from "@/db/schema";
import type { ChatMessage } from "@/lib/types";
import { readLocalState, updateLocalState } from "@/server/local-store";
import { getSolution } from "@/server/repository/solution-repository";
import { isUuid, mapChatRow } from "@/server/repository/helpers";

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
