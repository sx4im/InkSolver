import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  vector,
} from "drizzle-orm/pg-core";

export const planEnum = pgEnum("plan", ["free", "pro"]);
export const subjectEnum = pgEnum("subject", ["math", "physics", "chem", "unknown"]);
export const verificationStatusEnum = pgEnum("verification_status", [
  "verified",
  "unverifiable",
  "mismatch",
]);
export const chatRoleEnum = pgEnum("chat_role", ["user", "assistant"]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name"),
  imageUrl: text("image_url"),
  plan: planEnum("plan").notNull().default("free"),
  problemsToday: integer("problems_today").notNull().default(0),
  resetAt: timestamp("reset_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lemonSqueezyCustomerId: text("lemonsqueezy_customer_id"),
});

export const canvases = pgTable("canvases", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  subject: subjectEnum("subject").notNull().default("unknown"),
  tldrawState: jsonb("tldraw_state"),
  thumbnailUrl: text("thumbnail_url"),
  isPublic: boolean("is_public").notNull().default(false),
  shareSlug: text("share_slug").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => {
  return {
    userUpdatedIdx: index("canvases_user_updated_idx").on(table.userId, table.updatedAt),
    shareSlugIdx: index("canvases_share_slug_idx").on(table.shareSlug),
  };
});

export const solutions = pgTable("solutions", {
  id: uuid("id").primaryKey().defaultRandom(),
  canvasId: uuid("canvas_id")
    .notNull()
    .references(() => canvases.id, { onDelete: "cascade" }),
  regionBounds: jsonb("region_bounds"),
  promptImageUrl: text("prompt_image_url"),
  subject: subjectEnum("subject").notNull().default("unknown"),
  problemText: text("problem_text").notNull(),
  steps: jsonb("steps").notNull(),
  finalAnswer: text("final_answer").notNull(),
  verificationStatus: verificationStatusEnum("verification_status").notNull().default("unverifiable"),
  model: text("model").notNull(),
  tokensUsed: integer("tokens_used").notNull().default(0),
  costUsd: numeric("cost_usd", { precision: 10, scale: 4 }).notNull().default("0"),
  snapshotHash: text("snapshot_hash"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => {
  return {
    canvasCreatedIdx: index("solutions_canvas_created_idx").on(table.canvasId, table.createdAt),
    canvasSnapshotIdx: index("solutions_canvas_snapshot_idx").on(table.canvasId, table.snapshotHash),
  };
});

export const chatMessages = pgTable("chat_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  solutionId: uuid("solution_id")
    .notNull()
    .references(() => solutions.id, { onDelete: "cascade" }),
  role: chatRoleEnum("role").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => {
  return {
    solutionCreatedIdx: index("chat_messages_solution_created_idx").on(table.solutionId, table.createdAt),
  };
});

export const embeddings = pgTable("embeddings", {
  id: uuid("id").primaryKey().defaultRandom(),
  solutionId: uuid("solution_id")
    .notNull()
    .references(() => solutions.id, { onDelete: "cascade" }),
  embedding: vector("embedding", { dimensions: 768 }).notNull(),
  problemText: text("problem_text").notNull(),
}, (table) => {
  return {
    solutionIdx: index("embeddings_solution_idx").on(table.solutionId),
    embeddingIdx: index("embeddings_vector_idx").using("hnsw", table.embedding.op("vector_cosine_ops")),
  };
});

export const usageEvents = pgTable("usage_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  eventType: text("event_type").notNull(),
  costUsd: numeric("cost_usd", { precision: 10, scale: 4 }).notNull().default("0"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => {
  return {
    userCreatedIdx: index("usage_events_user_created_idx").on(table.userId, table.createdAt),
  };
});
