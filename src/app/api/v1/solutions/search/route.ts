import { NextResponse } from "next/server";
import { z } from "zod";
import { sql, eq } from "drizzle-orm";

import { getDb } from "@/db/client";
import { embeddings, solutions, canvases } from "@/db/schema";
import { AuthenticationRequiredError } from "@/server/auth-context";
import { getCurrentUser } from "@/server/canvas-repository";
import { generateEmbedding } from "@/server/gemini-solver";
import { enforceRateLimit, parseGuardedJson, requestBodyLimits } from "@/server/request-guards";

export const dynamic = "force-dynamic";

const searchSchema = z.object({
  query: z.string().min(1).max(1000),
  limit: z.number().int().min(1).max(20).default(5),
});

export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, "chat", {
    route: "solutions_search",
  });

  if (limited) return limited;

  let user;

  try {
    user = await getCurrentUser();
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      return NextResponse.json({ error: "Sign in to search", code: "unauthenticated" }, { status: 401 });
    }
    throw error;
  }

  if (user.plan !== "pro") {
    return NextResponse.json(
      { error: "Semantic search is a Pro feature", code: "pro_required" },
      { status: 403 },
    );
  }

  const parsedBody = await parseGuardedJson(request, searchSchema, {
    maxBytes: requestBodyLimits.chat,
    route: "solutions_search",
  });

  if (!parsedBody.ok) return parsedBody.response;

  const body = parsedBody.data;
  const db = getDb();

  if (!db) {
    return NextResponse.json(
      { error: "Search needs the production database", code: "search_unavailable" },
      { status: 503 },
    );
  }

  const queryEmbedding = await generateEmbedding(body.query);

  if (!queryEmbedding) {
    return NextResponse.json(
      { error: "Search is not configured on this server yet", code: "search_unavailable" },
      { status: 503 },
    );
  }

  // Cosine distance (<=>) against the user's own solutions only.
  const queryArray = `[${queryEmbedding.join(",")}]`;
  const similarity = sql`1 - (${embeddings.embedding} <=> ${queryArray}::vector)`;

  const results = await db
    .select({
      id: solutions.id,
      problemText: solutions.problemText,
      finalAnswer: solutions.finalAnswer,
      canvasId: solutions.canvasId,
      canvasTitle: canvases.title,
      similarity,
    })
    .from(embeddings)
    .innerJoin(solutions, eq(embeddings.solutionId, solutions.id))
    .innerJoin(canvases, eq(solutions.canvasId, canvases.id))
    .where(eq(canvases.userId, user.id))
    .orderBy(sql`${embeddings.embedding} <=> ${queryArray}::vector`)
    .limit(body.limit);

  return NextResponse.json({ results });
}
