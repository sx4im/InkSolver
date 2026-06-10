// Backfills semantic-search embeddings for solutions created before the
// embedding pipeline was configured (or while GEMINI_API_KEY was absent).
//
// Usage: DATABASE_URL=... GEMINI_API_KEY=... node scripts/backfill-embeddings.mjs

import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL;
const apiKey = process.env.GEMINI_API_KEY;
const batchSize = Number(process.env.BACKFILL_BATCH_SIZE ?? 50);

if (!databaseUrl) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

if (!apiKey) {
  console.error("GEMINI_API_KEY is required to generate embeddings.");
  process.exit(1);
}

const sql = postgres(databaseUrl, { max: 2, prepare: false });

async function generateEmbedding(text) {
  const response = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        model: "models/text-embedding-004",
        content: { parts: [{ text }] },
      }),
      signal: AbortSignal.timeout(15_000),
    },
  );

  if (!response.ok) {
    throw new Error(`Embedding request failed with ${response.status}`);
  }

  const payload = await response.json();
  return payload.embedding?.values ?? null;
}

let processed = 0;
let failed = 0;

try {
  while (true) {
    const rows = await sql`
      select s.id, s.problem_text
      from solutions s
      left join embeddings e on e.solution_id = s.id
      where e.id is null
      order by s.created_at asc
      limit ${batchSize}
    `;

    if (!rows.length) break;

    for (const row of rows) {
      try {
        const values = await generateEmbedding(row.problem_text);

        if (!values || values.length !== 768) {
          failed += 1;
          console.warn(`skip ${row.id}: embedding unavailable`);
          continue;
        }

        await sql`
          insert into embeddings (solution_id, problem_text, embedding)
          values (${row.id}, ${row.problem_text}, ${`[${values.join(",")}]`}::vector)
        `;
        processed += 1;
      } catch (error) {
        failed += 1;
        console.warn(`skip ${row.id}: ${error.message}`);
      }
    }

    console.log(`progress: ${processed} embedded, ${failed} skipped`);
  }

  console.log(`done: ${processed} embeddings created, ${failed} skipped`);
} finally {
  await sql.end();
}
