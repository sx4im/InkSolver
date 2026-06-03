import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db/client";
import { embeddings, solutions, canvases } from "@/db/schema";
import { sql, eq } from "drizzle-orm";
import { generateEmbedding } from "@/server/gemini-solver";
import { getCurrentUser } from "@/server/canvas-repository";

const searchSchema = z.object({
  query: z.string().min(1).max(1000),
  limit: z.number().int().min(1).max(20).default(5),
});

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user || user.plan !== "pro") {
    return NextResponse.json({ error: "Semantic search is a Pro feature" }, { status: 403 });
  }

  let body;
  try {
    body = searchSchema.parse(await request.json());
  } catch (error) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const queryEmbedding = await generateEmbedding(body.query);
  if (!queryEmbedding) {
    return NextResponse.json({ error: "Failed to generate search embedding" }, { status: 500 });
  }

  const db = getDb();
  if (!db) {
    return NextResponse.json({ error: "Database not available" }, { status: 500 });
  }

  // Find most similar embeddings
  // We compute the cosine distance (<=>) and order by it
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
    .where(eq(canvases.userId, user.id)) // ensure we only search this user's stuff
    .orderBy(sql`${embeddings.embedding} <=> ${queryArray}::vector`)
    .limit(body.limit);

  return NextResponse.json({ results });
}
