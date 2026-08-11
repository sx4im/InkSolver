import type { TLEditorSnapshot, TLStoreSnapshot } from "tldraw";

export type Subject = "math" | "physics" | "chem" | "unknown";

export type Plan = "free" | "pro";

export type VerificationStatus = "verified" | "unverifiable" | "mismatch";

export type CanvasSnapshot = TLEditorSnapshot | TLStoreSnapshot;

export type RegionBounds = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type CanvasSummary = {
  id: string;
  userId: string;
  title: string;
  subject: Subject;
  updatedAt: string;
  createdAt: string;
  shareSlug: string;
  isPublic: boolean;
  thumbnailUrl?: string | null;
  thumbnailTone: "peach" | "mint" | "cream" | "forest" | "coral";
  solutionCount: number;
};

export type CanvasDetail = CanvasSummary & {
  tldrawState: CanvasSnapshot | null;
};

export type SolutionStep = {
  stepNum: number;
  latex: string;
  explanation: string;
  verified: boolean;
  verificationStatus: VerificationStatus;
  computedValue?: string | null;
  verificationReason?: string | null;
};

export type Solution = {
  id: string;
  canvasId: string;
  regionBounds?: RegionBounds | null;
  promptImageUrl?: string | null;
  problemText: string;
  subject: Subject;
  finalAnswer: string;
  verificationStatus: VerificationStatus;
  steps: SolutionStep[];
  model?: string;
  tokensUsed?: number;
  costUsd?: number;
  computedValue?: string | null;
  verificationReason?: string | null;
  createdAt: string;
};

export type UserAccount = {
  id: string;
  name: string;
  email: string;
  plan: Plan;
  problemsToday: number;
  dailyLimit: number;
  usageRemaining: number;
  resetAt: string;
  activeCanvases: number;
  activeCanvasLimit: number;
  lemonSqueezyCustomerId?: string | null;
};

export type UsageEvent = {
  id: string;
  userId: string;
  eventType: "solve" | "chat" | "export" | "billing" | "telemetry" | "error" | "web_vital";
  costUsd: number;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
};

export type ChatMessage = {
  id: string;
  solutionId: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};
