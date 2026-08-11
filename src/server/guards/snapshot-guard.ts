import { NextResponse } from "next/server";
import { snapshotLimits } from "./limits";
import { recordRejectedRequest } from "./rejection";
import { tooLargeResponse } from "./payload-parser";

function normalizeBase64Image(value: string, mimeType?: string | null) {
  const dataUrlMatch = value.match(/^data:([^;,]+);base64,([\s\S]*)$/);
  const payload = (dataUrlMatch?.[2] ?? value).replace(/\s/g, "");
  const normalizedMimeType = (dataUrlMatch?.[1] ?? mimeType ?? "image/png").toLowerCase();

  if (!payload || payload.length % 4 === 1 || !/^[A-Za-z0-9+/]*={0,2}$/.test(payload)) {
    return null;
  }

  const padding = payload.endsWith("==") ? 2 : payload.endsWith("=") ? 1 : 0;
  const bytes = Math.floor((payload.length * 3) / 4) - padding;

  if (bytes <= 0) return null;

  return {
    bytes,
    mimeType: normalizedMimeType,
  };
}

export async function validateSnapshotImage(input: {
  mimeType?: string | null;
  route: string;
  snapshotBase64?: string | null;
}) {
  if (!input.snapshotBase64) return null;

  const normalized = normalizeBase64Image(input.snapshotBase64, input.mimeType);

  if (!normalized) {
    await recordRejectedRequest("invalid_snapshot", {
      route: input.route,
    });

    return NextResponse.json(
      {
        error: "Snapshot image must be a base64-encoded PNG, JPEG, or WebP image.",
        code: "invalid_snapshot",
      },
      { status: 400 },
    );
  }

  if (!(snapshotLimits.allowedMimeTypes as readonly string[]).includes(normalized.mimeType)) {
    await recordRejectedRequest("unsupported_snapshot_type", {
      route: input.route,
      mimeType: normalized.mimeType,
    });

    return NextResponse.json(
      {
        error: "Snapshot image type is not supported.",
        code: "unsupported_snapshot_type",
        allowed_mime_types: snapshotLimits.allowedMimeTypes,
      },
      { status: 415 },
    );
  }

  if (normalized.bytes > snapshotLimits.maxBytes) {
    await recordRejectedRequest("snapshot_too_large", {
      route: input.route,
      bytes: normalized.bytes,
      maxBytes: snapshotLimits.maxBytes,
    });

    return tooLargeResponse(snapshotLimits.maxBytes, "Snapshot image is too large", "snapshot_too_large");
  }

  return null;
}