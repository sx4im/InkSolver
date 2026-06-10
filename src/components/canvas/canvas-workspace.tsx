"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  Crosshair,
  Download,
  FileWarning,
  Home,
  Loader2,
  Menu,
  PanelRightClose,
  Save,
  Settings,
  Sparkles,
  UserCircle,
} from "lucide-react";
import type { Editor } from "tldraw";

import { CanvasStage } from "@/components/canvas/canvas-stage";
import { CanvasShareControls } from "@/components/canvas/canvas-share-controls";
import { Latex } from "@/components/math/latex";
import { ChatPanel } from "@/components/canvas/chat-panel";
import { placeSolutionOnCanvas } from "@/components/canvas/place-solution-on-canvas";
import { SolutionCard } from "@/components/canvas/solution-card";
import { VerificationBadge } from "@/components/canvas/verification-badge";
import { InkSolverLogo } from "@/components/brand/inksolver-logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { CanvasDetail, ChatMessage, RegionBounds, Solution, SolutionStep } from "@/lib/types";
import { formatDateTime, subjectLabel } from "@/lib/utils";

type CanvasWorkspaceProps = {
  canvas: CanvasDetail;
  initialSolutions: Solution[];
  chatMessages: ChatMessage[];
};

type SaveStatus = "saved" | "dirty" | "saving" | "error";
type RegionMode = "selection" | "viewport" | null;

const autosaveDebounceMs = 1200;
const maxSaveRetryDelayMs = 30_000;
const thumbnailIntervalMs = 30_000;
// fetch keepalive bodies are capped around 64KB by browsers; larger snapshots
// rely on the beforeunload prompt plus the regular debounced autosave.
const keepaliveFlushLimitBytes = 60_000;
const compressSaveThresholdBytes = 50_000;

// Gzip large snapshots before upload: tldraw JSON compresses roughly 10x,
// which keeps big boards fast on slow connections and under body limits.
async function encodeSavePayload(json: string): Promise<{ body: BodyInit; headers: Record<string, string> }> {
  if (typeof CompressionStream !== "undefined" && json.length > compressSaveThresholdBytes) {
    try {
      const stream = new Blob([json]).stream().pipeThrough(new CompressionStream("gzip"));
      const compressed = await new Response(stream).arrayBuffer();

      return {
        body: compressed,
        headers: {
          "Content-Type": "application/json",
          "X-Inksolver-Encoding": "gzip",
        },
      };
    } catch {
      // Fall back to plain JSON below.
    }
  }

  return {
    body: json,
    headers: { "Content-Type": "application/json" },
  };
}

export function CanvasWorkspace({ canvas, initialSolutions, chatMessages }: CanvasWorkspaceProps) {
  const [solutions, setSolutions] = useState(initialSolutions);
  const [isSolving, setIsSolving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [regionMode, setRegionMode] = useState<RegionMode>(null);
  const [showDemoPrompt, setShowDemoPrompt] = useState(!canvas.tldrawState);
  const [chatMessagesForActive, setChatMessagesForActive] = useState(chatMessages);
  const [focusedChatStep, setFocusedChatStep] = useState<SolutionStep | null>(null);
  const [isMobileChatOpen, setIsMobileChatOpen] = useState(false);
  const [isNavOpen, setIsNavOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [lastSolvedAt, setLastSolvedAt] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string>(canvas.updatedAt);
  const [notice, setNotice] = useState<string | null>(null);
  const editorRef = useRef<Editor | null>(null);
  const initialChatSolutionIdRef = useRef(initialSolutions[0]?.id ?? null);

  const dirtyRef = useRef(false);
  const saveInFlightRef = useRef(false);
  const retryCountRef = useRef(0);
  const debounceTimerRef = useRef<number | null>(null);
  const retryTimerRef = useRef<number | null>(null);
  const noticeTimerRef = useRef<number | null>(null);
  const lastThumbnailAtRef = useRef(0);

  const activeSolution = solutions[0];
  const activeSolutionId = activeSolution?.id ?? null;
  const chatSolution = activeSolution && !activeSolution.id.startsWith("pending_") ? activeSolution : null;

  const showNotice = useCallback((message: string) => {
    setNotice(message);
    if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = window.setTimeout(() => setNotice(null), 8000);
  }, []);

  // Refresh the dashboard thumbnail occasionally after saves: a small JPEG of
  // the real board, stored as a data URL. Fire-and-forget — thumbnail failures
  // must never affect save state.
  const updateThumbnail = useCallback(async () => {
    const image = await captureCanvasImage(editorRef.current, "jpeg", {
      maxPixels: 180_000,
      maxBytes: 60_000,
      quality: 0.5,
    });

    if (!image) return;

    await fetch(`/api/v1/canvases/${canvas.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ thumbnail_url: image }),
    }).catch(() => null);
  }, [canvas.id]);

  const performSave = useCallback(async () => {
    const editor = editorRef.current;
    if (!editor) return;
    if (saveInFlightRef.current) return;

    if (retryTimerRef.current) {
      window.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }

    saveInFlightRef.current = true;
    dirtyRef.current = false;
    setSaveStatus("saving");

    try {
      // Serialize at send time so the request always carries the latest state.
      const snapshot = editor.getSnapshot();
      const json = JSON.stringify({ tldraw_state: snapshot });
      const { body, headers } = await encodeSavePayload(json);
      const response = await fetch(`/api/v1/canvases/${canvas.id}`, {
        method: "PATCH",
        headers,
        body,
      });

      if (!response.ok) {
        throw new Error(`Save failed with ${response.status}`);
      }

      const result = (await response.json()) as { updated_at: string };
      setLastSavedAt(result.updated_at);
      retryCountRef.current = 0;
      saveInFlightRef.current = false;

      if (Date.now() - lastThumbnailAtRef.current > thumbnailIntervalMs) {
        lastThumbnailAtRef.current = Date.now();
        void updateThumbnail();
      }

      // Changes made while the request was in flight start another save so
      // nothing is dropped on slow connections.
      if (dirtyRef.current) {
        void performSave();
      } else {
        setSaveStatus("saved");
      }
    } catch {
      saveInFlightRef.current = false;
      dirtyRef.current = true;
      setSaveStatus("error");

      const retryDelay = Math.min(maxSaveRetryDelayMs, 5000 * 2 ** retryCountRef.current);
      retryCountRef.current += 1;
      retryTimerRef.current = window.setTimeout(() => {
        void performSave();
      }, retryDelay);
    }
  }, [canvas.id, updateThumbnail]);

  const handleDocumentChange = useCallback(() => {
    dirtyRef.current = true;
    setShowDemoPrompt(false);
    setSaveStatus((current) => (current === "saving" ? current : "dirty"));

    if (debounceTimerRef.current) window.clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = window.setTimeout(() => {
      void performSave();
    }, autosaveDebounceMs);
  }, [performSave]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (dirtyRef.current || saveInFlightRef.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };

    const handlePageHide = () => {
      if (!dirtyRef.current || saveInFlightRef.current) return;
      const editor = editorRef.current;
      if (!editor) return;

      try {
        const body = JSON.stringify({ tldraw_state: editor.getSnapshot() });
        if (body.length <= keepaliveFlushLimitBytes) {
          void fetch(`/api/v1/canvases/${canvas.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body,
            keepalive: true,
          });
        }
      } catch {
        // Best-effort flush only.
      }
    };

    const handleOnline = () => {
      if (dirtyRef.current) void performSave();
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("online", handleOnline);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("online", handleOnline);
      if (debounceTimerRef.current) window.clearTimeout(debounceTimerRef.current);
      if (retryTimerRef.current) window.clearTimeout(retryTimerRef.current);
      if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current);
    };
  }, [canvas.id, performSave]);

  async function handleSolve() {
    if (isSolving) return;

    const capture = await captureSolveRegion(editorRef.current);

    if (!capture.ok) {
      showNotice(capture.reason);
      return;
    }

    setIsSolving(true);
    setRegionMode(capture.source);

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
        const payload = (await response.json().catch(() => null)) as { error?: string; code?: string } | null;
        throw new SolveStreamError(payload?.error ?? `Solve failed with ${response.status}`, payload?.code ?? null);
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
        onStatus(state) {
          const statusText =
            state === "verifying"
              ? "Verifying..."
              : state === "retrying"
                ? "Re-solving after a verification mismatch..."
                : state === "cached"
                  ? "Matched an earlier verified solve..."
                  : "Solving...";

          setSolutions((current) =>
            current.map((solution) =>
              solution.id === pendingSolution.id && solution.steps.length === 0
                ? { ...solution, finalAnswer: statusText }
                : solution,
            ),
          );
        },
        onDone(solution) {
          const placed = placeSolutionOnCanvas(editorRef.current, solution);
          setSolutions((current) => [
            solution,
            ...current.filter((item) => item.id !== pendingSolution.id && item.id !== solution.id),
          ]);
          setLastSolvedAt(solution.createdAt);

          if (placed) {
            setShowDemoPrompt(false);
            dirtyRef.current = true;
            void performSave();
          }
        },
      });
    } catch (error) {
      setSolutions((current) => current.filter((solution) => solution.id !== pendingSolution.id));
      showNotice(solveErrorMessage(error));
    } finally {
      setIsSolving(false);
    }
  }

  async function handleExport(format: "pdf" | "png" | "latex" = "pdf") {
    if (isExporting) return;

    setIsExporting(true);

    try {
      // PDF embeds JPEG bytes directly; PNG exports serve the capture as-is.
      const canvasImage =
        format === "latex" ? null : await captureCanvasImage(editorRef.current, format === "pdf" ? "jpeg" : "png");

      const response = await fetch(`/api/v1/canvases/${canvas.id}/export`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ format, canvas_image_b64: canvasImage }),
      });

      if (!response.ok) {
        throw new Error(`Export failed with ${response.status}`);
      }

      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition") ?? "";
      const filename =
        disposition.match(/filename="([^"]+)"/)?.[1] ??
        `${canvas.title || "inksolver-canvas"}.${format === "latex" ? "tex" : format}`;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch {
      showNotice("Export failed. Try again.");
    } finally {
      setIsExporting(false);
    }
  }

  useEffect(() => {
    if (!activeSolutionId) {
      setChatMessagesForActive([]);
      setFocusedChatStep(null);
      return;
    }

    setFocusedChatStep(null);

    if (activeSolutionId === initialChatSolutionIdRef.current) {
      setChatMessagesForActive(chatMessages.filter((message) => !message.solutionId || message.solutionId === activeSolutionId));
      return;
    }

    setChatMessagesForActive([]);

    // Streaming placeholders never have persisted chat history.
    if (activeSolutionId.startsWith("pending_")) return;

    let cancelled = false;

    void fetch(`/api/v1/solutions/${activeSolutionId}/chat`)
      .then(async (response) => {
        if (!response.ok) return null;
        return (await response.json()) as { messages?: ChatMessage[] };
      })
      .then((payload) => {
        if (!cancelled && payload?.messages?.length) {
          setChatMessagesForActive(payload.messages);
        }
      })
      .catch(() => null);

    return () => {
      cancelled = true;
    };
  }, [activeSolutionId, chatMessages]);

  function handleEditorMount(editor: Editor) {
    editorRef.current = editor;
  }

  function handleAskStep(step: SolutionStep) {
    setFocusedChatStep(step);
    setIsMobileChatOpen(true);
  }

  return (
    <div className="flex h-screen overflow-hidden bg-canvas text-body">
      <section className="flex min-w-0 flex-1 flex-col">
        <header className="z-30 flex h-14 shrink-0 items-center justify-between gap-2 border-b border-hairline bg-canvas px-2 sm:px-4">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <Button variant="ghost" size="icon" aria-label="Open navigation" onClick={() => setIsNavOpen(true)}>
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
            <Button variant="secondary" size="sm" className="hidden sm:inline-flex" onClick={() => void performSave()} disabled={saveStatus === "saving"}>
              {saveStatus === "saving" ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Save className="h-4 w-4" aria-hidden="true" />
              )}
              <span className="hidden sm:inline">{saveStatus === "saving" ? "Saving" : "Save"}</span>
            </Button>
            <CanvasShareControls canvasId={canvas.id} initialIsPublic={canvas.isPublic} shareSlug={canvas.shareSlug} />
            <Button variant="secondary" size="sm" className="hidden md:inline-flex" onClick={() => void handleExport("pdf")} disabled={isExporting}>
              {isExporting ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Download className="h-4 w-4" aria-hidden="true" />
              )}
              <span className="hidden md:inline">PDF</span>
            </Button>
            <Button variant="secondary" size="sm" className="hidden md:inline-flex" onClick={() => void handleExport("latex")} disabled={isExporting}>
              {isExporting ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Download className="h-4 w-4" aria-hidden="true" />
              )}
              <span className="hidden md:inline">LaTeX</span>
            </Button>
            <Button size="sm" onClick={() => void handleSolve()} disabled={isSolving} aria-label="Solve">
              {isSolving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Sparkles className="h-4 w-4" aria-hidden="true" />}
              <span className="hidden sm:inline">{isSolving ? "Solving" : "Solve"}</span>
            </Button>
            <Button asChild variant="secondary" size="icon" aria-label="Account" className="hidden sm:inline-flex">
              <Link href="/settings">
                <UserCircle className="h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
          </div>
        </header>

        <div className="relative min-h-0 flex-1 bg-surface-soft">
          <CanvasStage
            snapshot={canvas.tldrawState}
            onDocumentChange={handleDocumentChange}
            onEditorMount={handleEditorMount}
          />
          {showDemoPrompt ? (
            <div className="pointer-events-none absolute left-[22%] top-[22%] z-10 hidden w-[320px] rounded-lg border border-hairline bg-white/95 p-5 shadow-button md:block">
              <p className="text-3xl leading-none text-ink">
                <Latex value={"\\int x^2\\,dx"} display />
              </p>
              <div className="mt-5 h-2 w-3/4 rounded-full bg-ink/15" />
              <div className="mt-2 h-2 w-1/2 rounded-full bg-ink/15" />
            </div>
          ) : null}

          <div className="absolute right-5 top-5 z-20 w-[360px] max-w-[calc(100vw-2.5rem)] space-y-3">
            {notice ? (
              <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm leading-6 text-ink" role="status">
                {notice}
              </div>
            ) : null}
            {activeSolution ? <SolutionCard solution={activeSolution} onAskStep={handleAskStep} /> : null}
            <div className="rounded-lg border border-hairline bg-canvas p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-ink">Solve status</p>
                  <p className="mt-1 text-xs text-muted">
                    {lastSolvedAt ? `Last solved ${formatDateTime(lastSolvedAt)}` : "Draw a problem, then press Solve."}
                  </p>
                </div>
                <VerificationBadge status={activeSolution?.verificationStatus ?? "unverifiable"} />
              </div>
              <div className="mt-3 flex items-center gap-2 text-xs text-muted">
                <Crosshair className="h-3.5 w-3.5" aria-hidden="true" />
                {regionMode === "selection"
                  ? "Using selected canvas shapes"
                  : regionMode === "viewport"
                    ? "Using the visible canvas region"
                    : "Select shapes, or press Solve to use the visible board"}
              </div>
            </div>
          </div>

          <div className="absolute bottom-4 right-4 z-20">
            <Button variant="secondary" size="icon" aria-label="Open chat" onClick={() => setIsMobileChatOpen(true)}>
              <PanelRightClose className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </div>
      </section>
      {isNavOpen && (
        <div className="absolute inset-0 z-50 flex">
          <div className="w-64 border-r border-hairline bg-canvas p-4 shadow-lg">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-ink">Navigation</h2>
              <Button variant="ghost" size="icon" onClick={() => setIsNavOpen(false)}>
                <PanelRightClose className="h-4 w-4" />
              </Button>
            </div>
            <nav className="mt-4 flex flex-col gap-2">
              <Button asChild variant="ghost" className="justify-start">
                <Link href="/">
                  <Home className="mr-2 h-4 w-4" />
                  Dashboard
                </Link>
              </Button>
              <Button asChild variant="ghost" className="justify-start">
                <Link href="/settings">
                  <Settings className="mr-2 h-4 w-4" />
                  Settings
                </Link>
              </Button>
              <Button asChild variant="ghost" className="justify-start">
                <Link href="/feedback">
                  <FileWarning className="mr-2 h-4 w-4" />
                  Feedback
                </Link>
              </Button>
            </nav>
            <div className="mt-6 border-t border-hairline pt-4 sm:hidden">
              <p className="text-xs font-medium uppercase text-muted">Canvas actions</p>
              <div className="mt-3 flex flex-col gap-2">
                <Button
                  variant="secondary"
                  className="justify-start"
                  onClick={() => {
                    setIsNavOpen(false);
                    void performSave();
                  }}
                  disabled={saveStatus === "saving"}
                >
                  <Save className="mr-2 h-4 w-4" aria-hidden="true" />
                  {saveStatus === "saving" ? "Saving..." : "Save now"}
                </Button>
                <Button
                  variant="secondary"
                  className="justify-start"
                  onClick={() => {
                    setIsNavOpen(false);
                    void handleExport("pdf");
                  }}
                  disabled={isExporting}
                >
                  <Download className="mr-2 h-4 w-4" aria-hidden="true" />
                  Export PDF
                </Button>
                <Button
                  variant="secondary"
                  className="justify-start"
                  onClick={() => {
                    setIsNavOpen(false);
                    void handleExport("latex");
                  }}
                  disabled={isExporting}
                >
                  <Download className="mr-2 h-4 w-4" aria-hidden="true" />
                  Export LaTeX
                </Button>
              </div>
            </div>
          </div>
          <div className="flex-1" onClick={() => setIsNavOpen(false)} />
        </div>
      )}
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

class SolveStreamError extends Error {
  constructor(
    message: string,
    public code: string | null,
  ) {
    super(message);
    this.name = "SolveStreamError";
  }
}

function solveErrorMessage(error: unknown) {
  if (error instanceof SolveStreamError) {
    if (error.code === "quota_exceeded") {
      return "Daily free solves are used up. Upgrade to Pro or wait for the next reset.";
    }
    if (error.code === "not_configured") {
      return "The AI solver is not configured on this server yet.";
    }
    if (error.code === "upstream_failed" || error.code === "upstream_timeout") {
      return "The AI solver is temporarily unavailable. Your quota was not used — try again.";
    }
    if (error.message) return error.message;
  }

  return "The solve request failed. Your quota was not used — try again.";
}

type SolveCapture =
  | {
      ok: true;
      regionBounds: RegionBounds;
      snapshotBase64: string;
      mimeType: string;
      problemHint: string;
      source: "selection" | "viewport";
    }
  | { ok: false; reason: string };

// Vision models do not need more than ~2MP of handwriting, and the snapshot
// must stay under the 4MB request cap even for very large regions.
const maxSnapshotPixels = 2_200_000;
const maxSnapshotBytes = 3_400_000;

// Captures every shape on the current page as an image of the real board for
// exports and dashboard thumbnails. Returns null on an empty canvas so
// callers can fall back gracefully.
async function captureCanvasImage(
  editor: Editor | null,
  format: "png" | "jpeg",
  options: { maxPixels?: number; maxBytes?: number; quality?: number } = {},
): Promise<string | null> {
  if (!editor) return null;

  const maxPixels = options.maxPixels ?? maxSnapshotPixels;
  const maxBytes = options.maxBytes ?? maxSnapshotBytes;
  const quality = options.quality ?? 0.85;

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
  const baseRatio = Math.min(2, Math.max(0.05, Math.sqrt(maxPixels / area)));

  for (const pixelRatio of [baseRatio, baseRatio / 2]) {
    try {
      const image = await editor.toImageDataUrl(shapeIds, {
        background: true,
        format,
        padding: 32,
        pixelRatio,
        quality,
      });

      if (Math.floor(image.url.length * 0.75) <= maxBytes) {
        return image.url;
      }
    } catch {
      return null;
    }
  }

  return null;
}

async function captureSolveRegion(editor: Editor | null): Promise<SolveCapture> {
  if (!editor) {
    return { ok: false, reason: "The canvas is still loading. Try again in a moment." };
  }

  let shapeIds = [...editor.getSelectedShapeIds()];
  let source: "selection" | "viewport" = "selection";

  if (!shapeIds.length) {
    // No explicit selection: solve everything visible in the viewport instead
    // of failing — the most common flow is draw, then immediately hit Solve.
    const viewport = editor.getViewportPageBounds();
    shapeIds = [...editor.getCurrentPageShapeIds()].filter((id) => {
      const bounds = editor.getShapePageBounds(id);
      if (!bounds) return false;
      return (
        bounds.x < viewport.x + viewport.w &&
        bounds.x + bounds.w > viewport.x &&
        bounds.y < viewport.y + viewport.h &&
        bounds.y + bounds.h > viewport.y
      );
    });
    source = "viewport";
  }

  if (!shapeIds.length) {
    return { ok: false, reason: "Draw or select a problem first, then press Solve." };
  }

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

  if (!Number.isFinite(minX) || !Number.isFinite(minY)) {
    return { ok: false, reason: "Could not measure the selected shapes. Try selecting them again." };
  }

  const regionBounds: RegionBounds = {
    x: minX,
    y: minY,
    w: Math.max(1, maxX - minX),
    h: Math.max(1, maxY - minY),
  };

  const baseRatio = Math.min(
    2,
    Math.max(0.35, Math.sqrt(maxSnapshotPixels / (regionBounds.w * regionBounds.h))),
  );
  const problemHint =
    source === "selection"
      ? "Solve the selected whiteboard region."
      : "Solve the STEM problem visible on this whiteboard.";

  for (const pixelRatio of [baseRatio, baseRatio / 2]) {
    try {
      // background: true renders strokes on the white canvas; transparent
      // PNGs of dark ink are unreliable inputs for vision models.
      const image = await editor.toImageDataUrl(shapeIds, {
        background: true,
        format: "png",
        padding: 24,
        pixelRatio,
      });

      const estimatedBytes = Math.floor(image.url.length * 0.75);

      if (estimatedBytes <= maxSnapshotBytes) {
        return {
          ok: true,
          regionBounds,
          snapshotBase64: image.url,
          mimeType: "image/png",
          problemHint,
          source,
        };
      }
    } catch {
      break;
    }
  }

  return {
    ok: false,
    reason: "This region is too large to snapshot. Zoom in or select a smaller part of the board.",
  };
}

async function readSolveStream(
  body: ReadableStream<Uint8Array>,
  handlers: {
    onStep: (step: SolutionStep) => void;
    onStatus?: (state: string) => void;
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

      let payload: {
        step_num?: number;
        latex?: string;
        explanation?: string;
        verified?: boolean;
        verification_status?: SolutionStep["verificationStatus"];
        solution?: Solution;
        error?: string;
        code?: string;
        state?: string;
      };

      try {
        payload = JSON.parse(dataLine);
      } catch {
        continue;
      }

      if (eventName === "error") {
        throw new SolveStreamError(payload.error ?? "Solve failed", payload.code ?? null);
      }

      if (eventName === "status" && payload.state) {
        handlers.onStatus?.(payload.state);
      }

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
        Retrying save
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
