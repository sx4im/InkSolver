import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "@/db/schema";

type DbClient = ReturnType<typeof drizzle<typeof schema>>;
type SqlClient = ReturnType<typeof postgres>;

const globalForDb = globalThis as unknown as {
  inkSolverDb?: DbClient;
  inkSolverSql?: SqlClient;
};

export function getDb() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    return null;
  }

  if (!globalForDb.inkSolverSql) {
    globalForDb.inkSolverSql = postgres(databaseUrl, {
      max: 5,
      prepare: false,
    });
  }

  if (!globalForDb.inkSolverDb) {
    globalForDb.inkSolverDb = drizzle(globalForDb.inkSolverSql, { schema });
  }

  return globalForDb.inkSolverDb;
}
