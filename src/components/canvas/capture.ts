import type { Editor } from "tldraw";

const defaultMaxPixels = 2_200_000;
const defaultMaxBytes = 3_400_000;
const maxPixelRatio = 2;
const minPixelRatio = 0.05;
const defaultPadding = 32;
const defaultQuality = 0.85;
// data URL base64 is ~4/3 the size of the raw bytes.
const base64Overhead = 0.75;

// Captures every shape on the current page as an image of the real board for
// exports and dashboard thumbnails. Returns null on an empty canvas so
// callers can fall back gracefully.
export async function captureCanvasImage(
  editor: Editor | null,
  format: "png" | "jpeg",
  options: { maxPixels?: number; maxBytes?: number; quality?: number } = {},
): Promise<string | null> {
  if (!editor) return null;

  const maxPixels = options.maxPixels ?? defaultMaxPixels;
  const maxBytes = options.maxBytes ?? defaultMaxBytes;
  const quality = options.quality ?? defaultQuality;

  const shapeIds = [...editor.getCurrentPageShapeIds()];
  if (!shapeIds.length) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const id of shapeIds) {
    const bounds = editor.getShapePageBounds(id);
    if (!bounds) continue;
    minX = Math.min(minX, bounds.x);
    minY = Math.min(minY, bounds.y);
    maxX = Math.max(maxX, bounds.x + bounds.w);
    maxY = Math.max(maxY, bounds.y + bounds.h);
  }

  if (!Number.isFinite(minX)) return null;

  const area = Math.max(1, (maxX - minX) * (maxY - minY));
  const baseRatio = Math.min(maxPixelRatio, Math.max(minPixelRatio, Math.sqrt(maxPixels / area)));

  for (const pixelRatio of [baseRatio, baseRatio / 2]) {
    try {
      const image = await editor.toImageDataUrl(shapeIds, {
        background: true,
        format,
        padding: defaultPadding,
        pixelRatio,
        quality,
      });

      if (Math.floor(image.url.length * base64Overhead) <= maxBytes) {
        return image.url;
      }
    } catch {
      return null;
    }
  }

  return null;
}
