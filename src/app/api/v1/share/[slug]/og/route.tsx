import { ImageResponse } from "next/og";

import type { CanvasDetail, Solution, VerificationStatus } from "@/lib/types";
import { subjectLabel } from "@/lib/utils";
import { getCanvasBySlug, getSolutionsForCanvas } from "@/server/canvas-repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const size = {
  width: 1200,
  height: 630,
};

const subjectSurfaces: Record<CanvasDetail["thumbnailTone"], string> = {
  coral: "#aa2d00",
  cream: "#f5e9d4",
  forest: "#0a2e0e",
  mint: "#a8d8c4",
  peach: "#fcab79",
};

const verificationColors: Record<VerificationStatus, string> = {
  mismatch: "#be2323",
  unverifiable: "#d9a441",
  verified: "#006400",
};

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const canvas = await getCanvasBySlug(slug);

  if (!canvas || !canvas.isPublic) {
    return new Response("Canvas not found", { status: 404 });
  }

  const solutions = await getSolutionsForCanvas(canvas.id, { publicRead: true });
  const primarySolution = solutions[0] ?? null;
  const surface = subjectSurfaces[canvas.thumbnailTone];
  const onSubjectSurface = canvas.thumbnailTone === "forest" || canvas.thumbnailTone === "coral" ? "#ffffff" : "#181d26";
  const solutionSummary = `Read-only canvas with ${canvas.solutionCount} verified step${
    canvas.solutionCount === 1 ? "" : "s"
  } and follow-up context.`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: "#ffffff",
          color: "#181d26",
          fontFamily: "Arial, Helvetica, sans-serif",
          padding: 48,
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            width: 460,
            paddingRight: 42,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div
                style={{
                  alignItems: "center",
                  background: "#181d26",
                  borderRadius: 12,
                  color: "#ffffff",
                  display: "flex",
                  fontSize: 26,
                  fontWeight: 700,
                  height: 52,
                  justifyContent: "center",
                  width: 52,
                }}
              >
                I
              </div>
              <div style={{ display: "flex", flexDirection: "column" }}>
                <div style={{ color: "#181d26", fontSize: 30, fontWeight: 700, lineHeight: 1.1 }}>
                  InkSolver
                </div>
                <div style={{ color: "#41454d", fontSize: 18, lineHeight: 1.3 }}>
                  Verified STEM whiteboard
                </div>
              </div>
            </div>

            <div
              style={{
                background: "#181d26",
                borderRadius: 999,
                color: "#ffffff",
                display: "flex",
                fontSize: 18,
                fontWeight: 700,
                marginTop: 54,
                padding: "12px 18px",
                width: 170,
              }}
            >
              {subjectLabel(canvas.subject)}
            </div>

            <div style={{ color: "#181d26", fontSize: 58, fontWeight: 700, lineHeight: 1.03, marginTop: 28 }}>
              {truncate(canvas.title, 62)}
            </div>

            <div style={{ color: "#333840", fontSize: 24, lineHeight: 1.35, marginTop: 24 }}>
              {solutionSummary}
            </div>
          </div>

          <div style={{ color: "#41454d", display: "flex", flexDirection: "column", fontSize: 18, gap: 8 }}>
            <div>Shared canvas preview</div>
            <div>Generated with InkSolver</div>
          </div>
        </div>

        <div
          style={{
            background: "#f8fafc",
            border: "1px solid #dddddd",
            borderRadius: 18,
            display: "flex",
            flex: 1,
            padding: 24,
          }}
        >
          <div
            style={{
              background: "#ffffff",
              border: "1px solid #dddddd",
              borderRadius: 14,
              display: "flex",
              flex: 1,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                background: surface,
                color: onSubjectSurface,
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                padding: 34,
                width: 330,
              }}
            >
              <div style={{ display: "flex", flexDirection: "column" }}>
                <div style={{ fontSize: 52, fontWeight: 700, lineHeight: 1.05 }}>
                  {sampleForSubject(canvas.subject)}
                </div>
                <div style={{ background: onSubjectSurface, height: 8, marginTop: 34, opacity: 0.28, width: 220 }} />
                <div style={{ background: onSubjectSurface, height: 8, marginTop: 14, opacity: 0.22, width: 150 }} />
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, opacity: 0.82 }}>
                Student work
              </div>
            </div>

            <div style={{ display: "flex", flex: 1, flexDirection: "column", padding: 32 }}>
              <div style={{ color: "#41454d", fontSize: 18, fontWeight: 700, textTransform: "uppercase" }}>
                AI solution
              </div>
              <div style={{ color: "#181d26", fontSize: 48, fontWeight: 700, lineHeight: 1.1, marginTop: 18 }}>
                {truncate(primarySolution?.finalAnswer ?? defaultAnswerForSubject(canvas.subject), 44)}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 26 }}>
                {solutionRows(primarySolution).map((row) => (
                  <div
                    key={row.label}
                    style={{
                      alignItems: "center",
                      border: "1px solid #dddddd",
                      borderRadius: 12,
                      display: "flex",
                      gap: 14,
                      padding: "14px 16px",
                    }}
                  >
                    <div
                      style={{
                        background: verificationColors[row.status],
                        borderRadius: 999,
                        height: 16,
                        width: 16,
                      }}
                    />
                    <div style={{ color: "#333840", display: "flex", flexDirection: "column", fontSize: 20, lineHeight: 1.25 }}>
                      <div style={{ color: "#181d26", fontWeight: 700 }}>{row.label}</div>
                      <div>{truncate(row.copy, 48)}</div>
                    </div>
                  </div>
                ))}
              </div>

              <div
                style={{
                  alignItems: "center",
                  background: "#181d26",
                  borderRadius: 12,
                  color: "#ffffff",
                  display: "flex",
                  fontSize: 20,
                  fontWeight: 700,
                  justifyContent: "center",
                  marginTop: "auto",
                  padding: "16px 20px",
                  width: 240,
                }}
              >
                Open read-only canvas
              </div>
            </div>
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}

function solutionRows(solution: Solution | null) {
  if (!solution) {
    return [
      {
        label: "Step 1",
        copy: "Write or select work on the canvas.",
        status: "unverifiable" as VerificationStatus,
      },
      {
        label: "Step 2",
        copy: "InkSolver streams a verified explanation.",
        status: "verified" as VerificationStatus,
      },
    ];
  }

  return solution.steps.slice(0, 3).map((step) => ({
    label: `Step ${step.stepNum}`,
    copy: step.explanation || step.latex,
    status: step.verificationStatus,
  }));
}

function sampleForSubject(subject: CanvasDetail["subject"]) {
  if (subject === "physics") return "v^2 = u^2 + 2as";
  if (subject === "chem") return "2H2 + O2";
  return "int x^2 dx";
}

function defaultAnswerForSubject(subject: CanvasDetail["subject"]) {
  if (subject === "physics") return "s = (v^2 - u^2) / 2a";
  if (subject === "chem") return "2H2 + O2 -> 2H2O";
  return "x^3 / 3 + C";
}

function truncate(value: string, maxLength: number) {
  const normalized = value.replace(/\\/g, "").replace(/[{}]/g, "").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1).trim()}...`;
}
