import type { UserAccount } from "@/lib/types";

export class QuotaExceededError extends Error {
  constructor(public user: UserAccount) {
    super("Daily solve quota exceeded");
    this.name = "QuotaExceededError";
  }
}

export class ActiveCanvasLimitError extends Error {
  constructor(public user: UserAccount) {
    super("Active canvas limit exceeded");
    this.name = "ActiveCanvasLimitError";
  }
}
