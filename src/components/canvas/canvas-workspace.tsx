"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  Crosshair,
  Download,
  Eye,
  EyeOff,
  FileWarning,
  Loader2,
  Menu,
  PanelRightClose,
  Save,
  Sparkles,
  UserCircle,
} from "lucide-react";
import type { Editor } from "tldraw";

import { captureCanvasImage } from "@/components/canvas/capture";
import { CanvasStage } from "@/components/canvas/canvas-stage";
import { CanvasShareControls } from "@/components/canvas/canvas-share-controls";
import { Latex } from "@/components/math/latex";
import { ChatPanel } from "@/components/canvas/chat-panel";
import { NavDrawer } from "@/components/canvas/nav-drawer";
import { placeSolutionOnCanvas } from "@/components/canvas/place-solution-on-canvas";
import { SolutionCard } from "@/components/canvas/solution-card";
import { captureSolveRegion, readSolveStream, SolveStreamError, solveErrorMessage } from "@/components/canvas/solve-stream";
import { VerificationBadge } from "@/components/canvas/verification-badge";
import { InkSolverLogo } from "@/components/brand/inksolver-logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { CanvasDetail, ChatMessage, Solution, SolutionStep } from "@/lib/types";
import { cn, formatDateTime, subjectLabel } from "@/lib/utils";

type CanvasWorkspaceProps = {
  canvas: CanvasDetail;
  initialSolutions: Solution[];
  chatMessages: ChatMessage[];
};

type SaveStatus = "saved" | "dirty" | "saving" | "error";
type RegionMode = "selection" | "viewport" | null;
type ExportFormat = "pdf" | "png" | "latex";
const HEADER_EXPORT_FORMATS: { format: ExportFormat; label: string }[] = [
  { format: "pdf", label: "PDF" },
  { format: "png", label: "PNG" },
  { format: "latex", label: "LaTeX" },
];

const autosaveDebounceMs = 1200;
const maxSaveRetryDelayMs = 30_000;
const thumbnailIntervalMs = 30_000;
// fetch keepalive bodies are capped around 64KB by browsers; larger snapshots
// rely on the beforeunload prompt plus the regular debounced autosave.
const keepaliveFlushLimitBytes = 60_000;
const compressSaveThresholdBytes = 50_000;
const noticeAutoDismissMs = 8000;
const saveRetryBaseMs = 5000;

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
  const [isPanelOpen, setIsPanelOpen] = useState(true);
  const [isNavOpen, setIsNavOpen] = useState(false);
  const [isPublic, setIsPublic] = useState(canvas.isPublic);
  const [title, setTitle] = useState(canvas.title);
  const [isExporting, setIsExporting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [selectedSolutionId, setSelectedSolutionId] = useState<string | null>(null);
  const [lastSolvedAt, setLastSolvedAt] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string>(canvas.updatedAt);
  const [notice, setNotice] = useState<string | null>(null);
  const editorRef = useRef<Editor | null>(null);
  const savedTitleRef = useRef(canvas.title);

  const dirtyRef = useRef(false);
  const saveInFlightRef = useRef(false);
  const retryCountRef = useRef(0);
  const debounceTimerRef = useRef<number | null>(null);
  const retryTimerRef = useRef<number | null>(null);
  const noticeTimerRef = useRef<number | null>(null);
  const lastThumbnailAtRef = useRef(0);

  const activeSolution = solutions.find((s) => s.id === selectedSolutionId) ?? solutions[0];
  const activeSolutionId = activeSolution?.id ?? null;
  const chatSolution = activeSolution && !activeSolution.id.startsWith("pending_") ? activeSolution : null;

  const showNotice = useCallback((message: string) => {
    setNotice(message);
    if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = window.setTimeout(() => setNotice(null), noticeAutoDismissMs);
  }, []);

  async function handleTitleBlur(event: React.FocusEvent<HTMLInputElement>) {
    const newTitle = event.target.value.trim();
    if (!newTitle) {
      setTitle(savedTitleRef.current);
      return;
    }

    if (newTitle === savedTitleRef.current) return;

    try {
      const response = await fetch(`/api/v1/canvases/${canvas.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle }),
      });
      if (!response.ok) throw new Error("Title save failed");
      savedTitleRef.current = newTitle;
      setTitle(newTitle);
    } catch {
      setTitle(savedTitleRef.current);
      showNotice("Failed to save title.");
    }
  }

  async function handleDeleteCanvas() {
    if (!window.confirm("Are you sure you want to delete this canvas? This cannot be undone.")) return;
    if (isDeleting) return;

    setIsDeleting(true);
    try {
      const response = await fetch(`/api/v1/canvases/${canvas.id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Delete failed");
      window.location.href = "/";
    } catch {
      showNotice("Could not delete canvas.");
      setIsDeleting(false);
    }
  }

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

      const retryDelay = Math.min(maxSaveRetryDelayMs, saveRetryBaseMs * 2 ** retryCountRef.current);
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

  useEffect(() => {
    if (!isNavOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsNavOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isNavOpen]);

  async function handleSolve() {
    if (isSolving) return;

    const capture = await captureSolveRegion(editorRef.current);

    if (!capture.ok) {
      showNotice(capture.reason);
      return;
    }

    setIsSolving(true);
    setRegionMode(capture.source);
    setSelectedSolutionId(null);

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

      let completed = false;

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
          completed = true;
          const placed = placeSolutionOnCanvas(editorRef.current, solution);
          setSolutions((current) => [
            solution,
            ...current.filter((item) => item.id !== pendingSolution.id && item.id !== solution.id),
          ]);
          setSelectedSolutionId(null);
          setLastSolvedAt(solution.createdAt);

          if (placed) {
            setShowDemoPrompt(false);
            dirtyRef.current = true;
            void performSave();
          }
        },
      });

      if (!completed) {
        setSolutions((current) => current.filter((solution) => solution.id !== pendingSolution.id));
        showNotice("Solve interrupted. Try again.");
      }
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

    // Streaming placeholders never have persisted chat history.
    if (activeSolutionId.startsWith("pending_")) {
      setChatMessagesForActive([]);
      return;
    }

    let cancelled = false;
    setChatMessagesForActive([]);

    void fetch(`/api/v1/solutions/${activeSolutionId}/chat`)
      .then(async (response) => {
        if (!response.ok) return null;
        return (await response.json()) as { messages?: ChatMessage[] };
      })
      .then((payload) => {
        if (!cancelled && payload?.messages) {
          setChatMessagesForActive(payload.messages);
        }
      })
      .catch(() => null);

    return () => {
      cancelled = true;
    };
  }, [activeSolutionId]);

  const onEditorMount = useCallback((editor: Editor) => {
    editorRef.current = editor;
  }, []);

  const showSolutionPanel = Boolean(notice || activeSolution || isSolving);

  function handleAskStep(step: SolutionStep) {
    setFocusedChatStep(step);
    setIsMobileChatOpen(true);
  }

  return (
    <div className="h-app flex overflow-hidden bg-canvas text-body">
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
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  onBlur={handleTitleBlur}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.currentTarget.blur();
                  }}
                  className="w-full truncate bg-transparent text-sm font-medium text-ink focus-visible:outline-none"
                  maxLength={120}
                  aria-label="Canvas title"
                />
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
            <CanvasShareControls
              canvasId={canvas.id}
              isPublic={isPublic}
              onPublicChange={setIsPublic}
              shareSlug={canvas.shareSlug}
            />
            {HEADER_EXPORT_FORMATS.map(({ format, label }) => (
              <Button key={format} variant="secondary" size="sm" className="hidden md:inline-flex" onClick={() => void handleExport(format)} disabled={isExporting}>
                {isExporting ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Download className="h-4 w-4" aria-hidden="true" />
                )}
                <span className="hidden md:inline">{label}</span>
              </Button>
            ))}
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
            canvasId={canvas.id}
            snapshot={canvas.tldrawState}
            onDocumentChange={handleDocumentChange}
            onEditorMount={onEditorMount}
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

          {/* The panel scrolls within itself and never blocks drawing outside
              the cards; on phones it can be collapsed entirely. */}
          <div
            className={cn(
              "pointer-events-none absolute right-3 top-3 z-20 flex max-h-[calc(100%-6.5rem)] w-[360px] max-w-[calc(100vw-1.5rem)] flex-col sm:right-5 sm:top-5 sm:max-h-[calc(100%-3rem)]",
              (!isPanelOpen || !showSolutionPanel) && "hidden lg:flex",
              !showSolutionPanel && "lg:hidden",
            )}
          >
            <div className="pointer-events-auto min-h-0 space-y-3 overflow-y-auto pb-1 pr-0.5">
              <div className="flex justify-end lg:hidden">
                <Button
                  variant="secondary"
                  size="sm"
                  aria-label="Hide solution panel"
                  onClick={() => setIsPanelOpen(false)}
                >
                  <EyeOff className="h-4 w-4" aria-hidden="true" />
                  Hide
                </Button>
              </div>
              {notice ? (
                <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm leading-6 text-ink" role="status">
                  {notice}
                </div>
              ) : null}
              {activeSolution ? <SolutionCard solution={activeSolution} onAskStep={handleAskStep} /> : null}
              {activeSolution || isSolving ? (
              <div className="rounded-lg border border-hairline bg-canvas p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-ink">Solve status</p>
                    <p className="mt-1 text-xs text-muted">
                      {isSolving
                        ? "Solving the selected region…"
                        : lastSolvedAt
                          ? `Last solved ${formatDateTime(lastSolvedAt)}`
                          : "Solution ready."}
                    </p>
                  </div>
                  {activeSolution ? <VerificationBadge status={activeSolution.verificationStatus} /> : null}
                </div>
                <div className="mt-3 flex items-center gap-2 text-xs text-muted">
                  <Crosshair className="h-3.5 w-3.5" aria-hidden="true" />
                  {regionMode === "selection"
                    ? "Using selected canvas shapes"
                    : regionMode === "viewport"
                      ? "Using the visible canvas region"
                      : "Select shapes, or press Solve to use the visible board"}
                </div>
                {solutions.length > 1 ? (
                  <div className="mt-4 flex items-center justify-between border-t border-hairline pt-3">
                    <span className="text-xs font-medium text-ink">Solution History</span>
                    <select
                      className="h-8 max-w-[140px] truncate rounded-md border border-hairline bg-canvas px-2 text-xs text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
                      value={activeSolution?.id ?? ""}
                      onChange={(e) => setSelectedSolutionId(e.target.value)}
                      aria-label="Select solution version"
                    >
                      {solutions.map((s, i) => (
                        <option key={s.id} value={s.id}>
                          {i === 0 ? "Latest solution" : `Version ${solutions.length - i}`}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}
              </div>
              ) : null}
            </div>
          </div>

          {!isPanelOpen && showSolutionPanel ? (
            <div className="absolute right-3 top-3 z-20 lg:hidden">
              <Button variant="secondary" size="sm" onClick={() => setIsPanelOpen(true)}>
                <Eye className="h-4 w-4" aria-hidden="true" />
                Solution
              </Button>
            </div>
          ) : null}

          {/* Clears tldraw's bottom toolbar on phones. */}
          <div className="absolute bottom-20 right-3 z-20 sm:bottom-4 sm:right-4">
            <Button variant="secondary" size="icon" aria-label="Open chat" onClick={() => setIsMobileChatOpen(true)}>
              <PanelRightClose className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </div>
      </section>
      {isNavOpen && (
        <NavDrawer
          canvasId={canvas.id}
          isPublic={isPublic}
          onPublicChange={setIsPublic}
          shareSlug={canvas.shareSlug}
          saveStatus={saveStatus}
          isExporting={isExporting}
          isDeleting={isDeleting}
          onClose={() => setIsNavOpen(false)}
          onSave={() => void performSave()}
          onExport={(format) => void handleExport(format)}
          onDelete={() => void handleDeleteCanvas()}
        />
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
