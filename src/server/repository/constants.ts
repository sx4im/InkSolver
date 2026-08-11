import type { Plan } from "@/lib/types";

export const FREE_DAILY_LIMIT = 10;
export const FREE_ACTIVE_CANVAS_LIMIT = 5;
// Pro users have no effective limit. Infinity works in JS comparisons; the
// Drizzle SQL path already skips the lt() guard for pro users, so this value
// never reaches a SQL WHERE clause.
export const UNLIMITED = Infinity;

export function dailyLimitForPlan(plan: Plan) {
  return plan === "pro" ? UNLIMITED : FREE_DAILY_LIMIT;
}

export function activeCanvasLimitForPlan(plan: Plan) {
  return plan === "pro" ? UNLIMITED : FREE_ACTIVE_CANVAS_LIMIT;
}
