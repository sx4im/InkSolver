export const UPSTASH_TIMEOUT_MS = 2000;

export const requestBodyLimits = {
  billing: 4 * 1024,
  canvasCreate: 8 * 1024,
  canvasPatch: 4 * 1024 * 1024,
  chat: 16 * 1024,
  export: 6 * 1024 * 1024,
  solve: 6 * 1024 * 1024,
  telemetry: 32 * 1024,
  webhook: 256 * 1024,
} as const;

export const snapshotLimits = {
  maxBytes: 4 * 1024 * 1024,
  allowedMimeTypes: ["image/png", "image/jpeg", "image/webp"],
} as const;
