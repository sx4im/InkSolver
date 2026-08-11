// Gemini text-embedding client. The vision solver lives in nvidia-solver.ts;
// this module only produces the 768-dim embeddings used for semantic search.
export async function generateEmbedding(text: string): Promise<number[] | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          model: "models/text-embedding-004",
          content: {
            parts: [{ text }],
          },
        }),
        signal: AbortSignal.timeout(10_000),
      },
    );

    if (!response.ok) return null;

    const payload = (await response.json()) as {
      embedding?: { values?: number[] };
    };

    return payload.embedding?.values ?? null;
  } catch {
    return null;
  }
}
