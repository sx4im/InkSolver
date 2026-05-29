"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  Crosshair,
  Download,
  FileWarning,
  Loader2,
  Menu,
  PanelRightClose,
  Save,
  Sparkles,
  UserCircle,
} from "lucide-react";
import type { Editor } from "tldraw";

import { CanvasStage } from "@/components/canvas/canvas-stage";
import { CanvasShareControls } from "@/components/canvas/canvas-share-controls";
import { Formula } from "@/components/math/math-text";
import { ChatPanel } from "@/components/canvas/chat-panel";
import { placeSolutionOnCanvas } from "@/components/canvas/place-solution-on-canvas";
import { SolutionCard } from "@/components/canvas/solution-card";
import { ToolRail } from "@/components/canvas/tool-rail";
import { VerificationBadge } from "@/components/canvas/verification-badge";
import { InkSolverLogo } from "@/components/brand/inksolver-logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { CanvasDetail, CanvasSnapshot, ChatMessage, RegionBounds, Solution, SolutionStep } from "@/lib/types";
import { formatDateTime, subjectLabel } from "@/lib/utils";

type CanvasWorkspaceProps = {
  canvas: CanvasDetail;
  initialSolutions: Solution[];
  chatMessages: ChatMessage[];
};

type SaveStatus = "saved" | "dirty" | "saving" | "error";
type RegionMode = "selection" | "demo";

export function CanvasWorkspace({ canvas, initialSolutions, chatMessages }: CanvasWorkspaceProps) {
  const [solutions, setSolutions] = useState(initialSolutions);
  const [isSolving, setIsSolving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [regionMode, setRegionMode] = useState<RegionMode>("demo");
  const [showDemoPrompt, setShowDemoPrompt] = useState(!canvas.tldrawState);
  const [chatMessagesForActive, setChatMessagesForActive] = useState(chatMessages);
  const [focusedChatStep, setFocusedChatStep] = useState<SolutionStep | null>(null);
  const [isMobileChatOpen, setIsMobileChatOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [lastSolvedAt, setLastSolvedAt] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string>(canvas.updatedAt);
  const editorRef = useRef<Editor | null>(null);
  const latestSnapshotRef = useRef<CanvasSnapshot | null>(canvas.tldrawState);
  const saveRequestRef = useRef<Promise<void> | null>(null);
  const initialChatSolutionIdRef = useRef(initialSolutions[0]?.id ?? null);

  const activeSolution = solutions[0];
  const activeSolutionId = activeSolution?.id ?? null;
  const chatSolution = activeSolution && !activeSolution.id.startsWith("pending_") ? activeSolution : null;

  async function handleSolve() {
    if (isSolving) return;

    setIsSolving(true);

    const capture = await captureSolveRegion(editorRef.current);
    setRegionMode(capture.regionBounds ? "selection" : "demo");

    const pendingSolution: Solution = {
      id: `pending_${Date.now()}`,
      canvasId: canvas.id,
      regionBounds: capture.regionBounds,
      promptImageUrl: null,
      problemText: capture.problemHint,
      subject: "unknown",
      finalAnswer: "Solving...",
      verificationStatus: "unverifiable",
      steps: [],
      model: "streaming",
      createdAt: new Date().toISOString(),
    };

    setSolutions((current) => [pendingSolution, ...current]);

    try {
      const response = await fetch(`/api/v1/canvases/${canvas.id}/solve`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          region_bounds: capture.regionBounds,
          snapshot_b64: capture.snapshotBase64,
          mime_type: capture.mimeType,
          problem_hint: capture.problemHint,
        }),
      });

      if (!response.ok || !response.body) {
        if (response.status === 402) {
          throw new Error("quota_exceeded");
        }

        throw new Error(`Solve failed with ${response.status}`);
      }

      await readSolveStream(response.body, {
        onStep(step) {
          setSolutions((current) =>
            current.map((solution) =>
              solution.id === pendingSolution.id
                ? {
                    ...solution,
                    finalAnswer: step.latex,
                    steps: [...solution.steps.filter((item) => item.stepNum !== step.stepNum), step].sort(
                      (a, b) => a.stepNum - b.stepNum,
                    ),
                  }
                : solution,
            ),
          );
        },
        onDone(solution) {
          const placed = placeSolutionOnCanvas(editorRef.current, solution);
          setSolutions((current) => [solution, ...current.filter((item) => item.id !== pendingSolution.id)]);
          setLastSolvedAt(solution.createdAt);

          if (placed) {
            latestSnapshotRef.current = editorRef.current?.getSnapshot() ?? latestSnapshotRef.current;
            setShowDemoPrompt(false);
            setSaveStatus("dirty");
            void saveCanvas();
          }
        },
      });
    } catch (error) {
      const isQuotaError = error instanceof Error && error.message === "quota_exceeded";

      setSolutions((current) =>
        current.map((solution) =>
          solution.id === pendingSolution.id
            ? {
                ...solution,
                finalAnswer: isQuotaError ? "Daily limit reached" : "Solve failed",
                steps: [
                  {
                    stepNum: 1,
                    latex: isQuotaError ? "\\text{Upgrade or wait}" : "\\text{Try again}",
                    explanation: isQuotaError
                      ? "The free daily solve limit has been used. Upgrade to Pro or wait for the next reset."
                      : "The solve request could not complete.",
                    verified: false,
                    verificationStatus: "unverifiable",
                  },
                ],
              }
            : solution,
        ),
      );
    } finally {
      setIsSolving(false);
    }
  }

  async function handleExport(format: "pdf" | "png" = "pdf") {
    if (isExporting) return;

    setIsExporting(true);

    try {
      const response = await fetch(`/api/v1/canvases/${canvas.id}/export`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ format }),
      });

      if (!response.ok) {
        throw new Error(`Export failed with ${response.status}`);
      }

      const payload = (await response.json()) as { download_url?: string };
      if (payload.download_url) {
        window.open(payload.download_url, "_blank", "noopener,noreferrer");
      }
    } finally {
      setIsExporting(false);
    }
  }

  const saveCanvas = useCallback(async () => {
    if (saveRequestRef.current) {
      await saveRequestRef.current;
      return;
    }

    const snapshot = latestSnapshotRef.current ?? editorRef.current?.getSnapshot();
    if (!snapshot) return;

    setSaveStatus("saving");

    const request = fetch(`/api/v1/canvases/${canvas.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tldraw_state: snapshot,
      }),
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Save failed with ${response.status}`);
        }

        const result = (await response.json()) as { updated_at: string };
        setLastSavedAt(result.updated_at);
        setSaveStatus("saved");
      })
      .catch(() => {
        setSaveStatus("error");
      })
      .finally(() => {
        saveRequestRef.current = null;
      });

    saveRequestRef.current = request;
    await request;
  }, [canvas.id]);

  useEffect(() => {
    if (saveStatus !== "dirty") return;

    const timer = window.setTimeout(() => {
      void saveCanvas();
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [saveCanvas, saveStatus]);

  useEffect(() => {
    if (!activeSolutionId) {
      setChatMessagesForActive([]);
      setFocusedChatStep(null);
      return;
    }

    if (activeSolutionId === initialChatSolutionIdRef.current) {
      setChatMessagesForActive(chatMessages.filter((message) => !message.solutionId || message.solutionId === activeSolutionId));
    } else {
      setChatMessagesForActive([]);
    }

    setFocusedChatStep(null);
  }, [activeSolutionId, chatMessages]);

  function handleEditorMount(editor: Editor) {
    editorRef.current = editor;
  }

  function handleDocumentChange(snapshot: CanvasSnapshot) {
    latestSnapshotRef.current = snapshot;
    setShowDemoPrompt(false);
    setSaveStatus("dirty");
  }

  function handleAskStep(step: SolutionStep) {
    setFocusedChatStep(step);
    setIsMobileChatOpen(true);
  }

  return (
    <div className="flex h-screen overflow-hidden bg-canvas text-body">
      <section className="flex min-w-0 flex-1 flex-col">
        <header className="z-30 flex h-14 shrink-0 items-center justify-between border-b border-hairline bg-canvas px-4">
          <div className="flex min-w-0 items-center gap-3">
            <Button variant="ghost" size="icon" aria-label="Open navigation">
              <Menu className="h-4 w-4" aria-hidden="true" />
            </Button>
            <InkSolverLogo />
            <div className="hidden min-w-0 items-center gap-3 md:flex">
              <span className="h-5 w-px bg-hairline" />
              <div className="min-w-0">
                <h1 className="truncate text-sm font-medium text-ink">{canvas.title}</h1>
                <p className="text-xs text-muted">Saved {formatDateTime(lastSavedAt)}</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Badge className="hidden sm:inline-flex">{subjectLabel(canvas.subject)}</Badge>
            <SaveState status={saveStatus} />
            <Button variant="secondary" size="sm" className="hidden sm:inline-flex" onClick={() => void saveCanvas()} disabled={saveStatus === "saving"}>
              {saveStatus === "saving" ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Save className="h-4 w-4" aria-hidden="true" />
              )}
              <span className="hidden sm:inline">{saveStatus === "saving" ? "Saving" : "Save"}</span>
            </Button>
            <CanvasShareControls canvasId={canvas.id} initialIsPublic={canvas.isPublic} shareSlug={canvas.shareSlug} />
            <Button variant="secondary" size="sm" className="hidden sm:inline-flex" onClick={() => void handleExport("pdf")} disabled={isExporting}>
              {isExporting ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Download className="h-4 w-4" aria-hidden="true" />
              )}
              <span className="hidden sm:inline">{isExporting ? "Exporting" : "Export"}</span>
            </Button>
            <Button variant="secondary" size="icon" aria-label="Account">
              <UserCircle className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </header>

        <div className="relative min-h-0 flex-1 bg-surface-soft">
          <CanvasStage
            snapshot={canvas.tldrawState}
            onDocumentChange={handleDocumentChange}
            onEditorMount={handleEditorMount}
          />
          <ToolRail />

          {showDemoPrompt ? (
            <div className="pointer-events-none absolute left-[22%] top-[22%] z-10 hidden w-[320px] rounded-lg border border-hairline bg-white/95 p-5 shadow-button md:block">
              <Formula latex="\int x^2\,dx" display className="text-4xl leading-none text-ink" />
              <div className="mt-5 h-2 w-3/4 rounded-full bg-ink/15" />
              <div className="mt-2 h-2 w-1/2 rounded-full bg-ink/15" />
            </div>
          ) : null}

          <div className="absolute left-[calc(22%+340px)] top-[calc(22%+18px)] z-20 hidden md:block">
            <Button onClick={handleSolve} disabled={isSolving} className="pointer-events-auto">
              {isSolving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Sparkles className="h-4 w-4" aria-hidden="true" />}
              Solve selection
            </Button>
          </div>

          <div className="absolute right-5 top-5 z-20 w-[360px] max-w-[calc(100vw-2.5rem)] space-y-3">
            {activeSolution ? <SolutionCard solution={activeSolution} onAskStep={handleAskStep} /> : null}
            <div className="rounded-lg border border-hairline bg-canvas p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-ink">Solve status</p>
                  <p className="mt-1 text-xs text-muted">
                    {lastSolvedAt ? `Last solved ${formatDateTime(lastSolvedAt)}` : "Select shapes or use the demo region."}
                  </p>
                </div>
                <VerificationBadge status={activeSolution?.verificationStatus ?? "unverifiable"} />
              </div>
              <div className="mt-3 flex items-center gap-2 text-xs text-muted">
                <Crosshair className="h-3.5 w-3.5" aria-hidden="true" />
                {regionMode === "selection" ? "Using selected canvas shapes" : "Using demo integral fallback"}
              </div>
            </div>
          </div>

          <div className="absolute bottom-4 right-4 z-20 lg:hidden">
            <Button variant="secondary" size="icon" aria-label="Open chat" onClick={() => setIsMobileChatOpen(true)}>
              <PanelRightClose className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </div>
      </section>
      <ChatPanel
        solution={chatSolution}
        focusedStep={focusedChatStep}
        messages={chatMessagesForActive}
        mobileOpen={isMobileChatOpen}
        onRequestClose={() => setIsMobileChatOpen(false)}
        onClearFocusedStep={() => setFocusedChatStep(null)}
        onMessagesChange={setChatMessagesForActive}
      />
    </div>
  );
}

async function captureSolveRegion(editor: Editor | null): Promise<{
  regionBounds: RegionBounds | null;
  snapshotBase64: string | null;
  mimeType: string | null;
  problemHint: string;
}> {
  const fallback = {
    regionBounds: null,
    snapshotBase64: null,
    mimeType: null,
    problemHint: "Evaluate the selected integral: integral x squared dx.",
  };

  if (!editor) return fallback;

  const selectedShapeIds = editor.getSelectedShapeIds();
  const bounds = editor.getSelectionPageBounds();

  if (!selectedShapeIds.length || !bounds) return fallback;

  try {
    const image = await editor.toImageDataUrl(selectedShapeIds, {
      background: false,
      format: "png",
      padding: 24,
      pixelRatio: 2,
    });

    return {
      regionBounds: {
        x: bounds.x,
        y: bounds.y,
        w: bounds.w,
        h: bounds.h,
      },
      snapshotBase64: image.url,
      mimeType: "image/png",
      problemHint: "Solve the selected whiteboard region.",
    };
  } catch {
    return {
      ...fallback,
      regionBounds: {
        x: bounds.x,
        y: bounds.y,
        w: bounds.w,
        h: bounds.h,
      },
      problemHint: "Solve the selected whiteboard region.",
    };
  }
}

async function readSolveStream(
  body: ReadableStream<Uint8Array>,
  handlers: {
    onStep: (step: SolutionStep) => void;
    onDone: (solution: Solution) => void;
  },
) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";

    for (const event of events) {
      const eventName = event
        .split("\n")
        .find((line) => line.startsWith("event: "))
        ?.slice(7);
      const dataLine = event
        .split("\n")
        .find((line) => line.startsWith("data: "))
        ?.slice(6);

      if (!eventName || !dataLine) continue;

      const payload = JSON.parse(dataLine) as {
        step_num?: number;
        latex?: string;
        explanation?: string;
        verified?: boolean;
        verification_status?: SolutionStep["verificationStatus"];
        solution?: Solution;
      };

      if (eventName === "step" && payload.step_num && payload.latex && payload.explanation) {
        handlers.onStep({
          stepNum: payload.step_num,
          latex: payload.latex,
          explanation: payload.explanation,
          verified: payload.verified ?? false,
          verificationStatus: payload.verification_status ?? "unverifiable",
        });
      }

      if (eventName === "done" && payload.solution) {
        handlers.onDone(payload.solution);
      }
    }
  }
}

function SaveState({ status }: { status: SaveStatus }) {
  if (status === "dirty") {
    return <Badge tone="warning">Unsaved</Badge>;
  }

  if (status === "saving") {
    return (
      <Badge tone="neutral">
        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        Saving
      </Badge>
    );
  }

  if (status === "error") {
    return (
      <Badge tone="danger">
        <FileWarning className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
        Save failed
      </Badge>
    );
  }

  return (
    <Badge tone="success">
      <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
      Saved
    </Badge>
  );
}
