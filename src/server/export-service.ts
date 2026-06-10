import zlib from "zlib";

import type { CanvasDetail, Solution, UserAccount } from "@/lib/types";
import { getCurrentUser, recordUsageEvent } from "@/server/canvas-repository";

type ExportFormat = "pdf" | "png" | "latex";

type ExportResult = {
  canvasId: string;
  format: ExportFormat;
  body: Buffer;
  mimeType: string;
  filename: string;
  watermark: boolean;
};

const exportMimeTypes: Record<ExportFormat, string> = {
  pdf: "application/pdf",
  png: "image/png",
  latex: "text/x-tex; charset=utf-8",
};

export async function createCanvasExport(input: {
  canvas: CanvasDetail;
  solutions: Solution[];
  format: ExportFormat;
}): Promise<ExportResult> {
  const user = await getCurrentUser();
  const watermark = user.plan !== "pro";
  const extension = input.format === "latex" ? "tex" : input.format;
  const filename = `${slugify(input.canvas.title)}.${extension}`;

  const body =
    input.format === "pdf"
      ? renderPdf(input.canvas, input.solutions, user, watermark)
      : input.format === "latex"
        ? renderLatex(input.canvas, input.solutions, user, watermark)
        : renderPngPreview(input.canvas, input.solutions, watermark);

  await recordUsageEvent({
    userId: user.id,
    eventType: "export",
    metadata: {
      canvasId: input.canvas.id,
      format: input.format,
      watermark,
    },
  });

  return {
    canvasId: input.canvas.id,
    format: input.format,
    body,
    mimeType: exportMimeTypes[input.format],
    filename,
    watermark,
  };
}

function renderLatex(canvas: CanvasDetail, solutions: Solution[], user: UserAccount, watermark: boolean) {
  const lines = [
    "\\documentclass{article}",
    "\\usepackage{amsmath}",
    "\\usepackage{amssymb}",
    "\\title{" + escapeLatex(canvas.title) + "}",
    "\\date{" + new Date(canvas.updatedAt).toLocaleDateString("en") + "}",
    "\\begin{document}",
    "\\maketitle",
    "",
    "\\section*{Problem Details}",
    `\\textbf{Subject:} ${escapeLatex(canvas.subject)} \\\\`,
    `\\textbf{Plan:} ${user.plan.toUpperCase()} \\\\`,
    "",
    ...solutions.flatMap((solution, index) => [
      `\\subsection*{Solution ${index + 1}}`,
      "\\textbf{Problem:}",
      "\\begin{equation*}",
      solution.problemText,
      "\\end{equation*}",
      "",
      "\\textbf{Steps:}",
      "\\begin{align*}",
      ...solution.steps.map((step) => `  & ${step.latex} && \\text{${escapeLatex(step.explanation)}} \\\\`),
      "\\end{align*}",
      "",
      "\\textbf{Final Answer:}",
      "\\begin{equation*}",
      solution.finalAnswer,
      "\\end{equation*}",
      `\\textit{Verification Status:} ${solution.verificationStatus}`,
      "",
    ]),
    watermark ? "\\vfill\\noindent\\textit{Generated with InkSolver free share}" : "\\vfill\\noindent\\textit{Generated with InkSolver Pro}",
    "\\end{document}",
  ];

  return Buffer.from(lines.join("\n"), "utf-8");
}

function renderPdf(canvas: CanvasDetail, solutions: Solution[], user: UserAccount, watermark: boolean) {
  const lines = [
    "InkSolver Export",
    canvas.title,
    `Subject: ${canvas.subject}`,
    `Updated: ${new Date(canvas.updatedAt).toLocaleString("en")}`,
    `Plan: ${user.plan.toUpperCase()}`,
    "",
    ...solutions.flatMap((solution, index) => [
      `Solution ${index + 1}: ${plain(solution.finalAnswer)}`,
      `Verification: ${solution.verificationStatus}`,
      `Problem: ${plain(solution.problemText)}`,
      ...solution.steps.map((step) => `Step ${step.stepNum}: ${plain(step.latex)} - ${plain(step.explanation)}`),
      "",
    ]),
    watermark ? "Generated with InkSolver free share" : "Generated with InkSolver Pro",
  ];

  const content = [
    "BT",
    "/F1 18 Tf",
    "72 760 Td",
    ...lines.flatMap((line, index) => [
      index === 0 ? "" : "0 -22 Td",
      `(${escapePdf(line.slice(0, 96))}) Tj`,
    ]),
    "ET",
  ]
    .filter(Boolean)
    .join("\n");

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
  ];

  return Buffer.from(buildPdf(objects));
}

function buildPdf(objects: string[]) {
  let pdf = "%PDF-1.4\n";
  const offsets = [0];

  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join("");
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return pdf;
}

function renderPngPreview(canvas: CanvasDetail, solutions: Solution[], watermark: boolean) {
  const width = 1200;
  const height = 800;
  const data = Buffer.alloc(width * height * 3, 255);

  fillRect(data, width, 0, 0, width, height, [248, 250, 252]);
  fillRect(data, width, 64, 64, 700, 520, [255, 255, 255]);
  fillRect(data, width, 96, 116, 420, 10, [24, 29, 38]);
  fillRect(data, width, 96, 156, 260, 8, [24, 29, 38]);
  fillRect(data, width, 96, 210, 360, 120, [252, 171, 121]);
  fillRect(data, width, 540, 210, 170, 120, [168, 216, 196]);

  solutions.slice(0, 3).forEach((solution, index) => {
    const top = 110 + index * 150;
    const color: [number, number, number] =
      solution.verificationStatus === "verified"
        ? [57, 191, 69]
        : solution.verificationStatus === "mismatch"
          ? [190, 35, 35]
          : [244, 184, 60];
    fillRect(data, width, 820, top, 300, 108, [255, 255, 255]);
    fillRect(data, width, 844, top + 24, 180, 10, [24, 29, 38]);
    fillRect(data, width, 844, top + 54, 230, 7, [65, 69, 77]);
    fillRect(data, width, 844, top + 76, 140, 7, [65, 69, 77]);
    fillRect(data, width, 1086, top + 24, 18, 18, color);
  });

  if (watermark) {
    fillRect(data, width, 64, 700, 260, 36, [245, 233, 212]);
    fillRect(data, width, 88, 714, 190, 8, [65, 69, 77]);
  }

  return encodePng(width, height, data);
}

function fillRect(
  data: Buffer,
  width: number,
  x: number,
  y: number,
  w: number,
  h: number,
  color: [number, number, number],
) {
  for (let row = y; row < y + h; row += 1) {
    for (let col = x; col < x + w; col += 1) {
      const index = (row * width + col) * 3;
      data[index] = color[0];
      data[index + 1] = color[1];
      data[index + 2] = color[2];
    }
  }
}

function encodePng(width: number, height: number, rgb: Buffer) {
  const scanlines = Buffer.alloc((width * 3 + 1) * height);

  for (let y = 0; y < height; y += 1) {
    const sourceStart = y * width * 3;
    const targetStart = y * (width * 3 + 1);
    scanlines[targetStart] = 0;
    rgb.copy(scanlines, targetStart + 1, sourceStart, sourceStart + width * 3);
  }

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", Buffer.concat([uint32(width), uint32(height), Buffer.from([8, 2, 0, 0, 0])])),
    pngChunk("IDAT", zlib.deflateSync(scanlines)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function pngChunk(type: string, data: Buffer) {
  const typeBuffer = Buffer.from(type);
  return Buffer.concat([uint32(data.length), typeBuffer, data, uint32(crc32(Buffer.concat([typeBuffer, data])))]);
}

function uint32(value: number) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32BE(value >>> 0);
  return buffer;
}

function crc32(buffer: Buffer) {
  let crc = 0xffffffff;

  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function escapePdf(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function escapeLatex(value: string) {
  return value.replace(/[\$\%\^\&\_\{\}\~\#\\]/g, "\\$&");
}

function plain(value: string) {
  return value.replace(/\\/g, "").replace(/[{}]/g, "");
}

function slugify(value: string) {
  return (
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 64) || "inksolver-canvas"
  );
}
