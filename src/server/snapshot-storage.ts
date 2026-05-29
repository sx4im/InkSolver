import { promises as fs } from "fs";
import path from "path";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

function dataUrlToBase64(value: string) {
  const [metadata, payload] = value.split(",", 2);
  const mimeMatch = metadata.match(/^data:(.+);base64$/);

  return {
    base64: payload ?? value,
    mimeType: mimeMatch?.[1] ?? "image/png",
  };
}

function extensionForMime(mimeType: string) {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/svg+xml") return "svg";
  if (mimeType === "application/json") return "json";
  return "png";
}

function getR2Config() {
  const accountId = process.env.CLOUDFLARE_R2_ACCOUNT_ID;
  const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;
  const bucket = process.env.CLOUDFLARE_R2_BUCKET;

  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
    return null;
  }

  return {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucket,
    publicUrl: process.env.CLOUDFLARE_R2_PUBLIC_URL?.replace(/\/$/, "") ?? null,
  };
}

async function storeInR2(input: {
  objectKey: string;
  body: Buffer;
  mimeType: string;
}) {
  const config = getR2Config();
  if (!config) return null;

  const client = new S3Client({
    region: "auto",
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });

  await client.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: input.objectKey,
      Body: input.body,
      ContentType: input.mimeType,
    }),
  );

  return {
    url: config.publicUrl
      ? `${config.publicUrl}/${input.objectKey}`
      : `r2://${config.bucket}/${input.objectKey}`,
    objectKey: input.objectKey,
    mimeType: input.mimeType,
  };
}

export async function storePromptSnapshot(input: {
  canvasId: string;
  snapshotBase64?: string | null;
  mimeType?: string | null;
}) {
  if (!input.snapshotBase64) {
    return null;
  }

  const normalized = input.snapshotBase64.startsWith("data:")
    ? dataUrlToBase64(input.snapshotBase64)
    : {
        base64: input.snapshotBase64,
        mimeType: input.mimeType ?? "image/png",
      };

  const extension = extensionForMime(normalized.mimeType);
  const objectKey = `${input.canvasId}/${Date.now()}-${crypto.randomUUID()}.${extension}`;
  const body = Buffer.from(normalized.base64, "base64");
  const r2Result = await storeInR2({
    objectKey,
    body,
    mimeType: normalized.mimeType,
  }).catch(() => null);

  if (r2Result) {
    return r2Result;
  }

  const storageDir = path.join(process.cwd(), ".data", "snapshots", input.canvasId);
  const storagePath = path.join(storageDir, path.basename(objectKey));

  await fs.mkdir(storageDir, { recursive: true });
  await fs.writeFile(storagePath, body);

  return {
    url: `/local-snapshots/${objectKey}`,
    objectKey,
    mimeType: normalized.mimeType,
  };
}
