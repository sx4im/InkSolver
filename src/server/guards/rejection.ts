import { trackTelemetryEvent } from "@/server/observability";

export async function recordRejectedRequest(reason: string, metadata: Record<string, unknown>) {
  await trackTelemetryEvent({
    eventType: "telemetry",
    metadata: {
      kind: "security",
      reason,
      ...metadata,
    },
  }).catch(() => null);
}