"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import type { Editor } from "tldraw";
import { TldrawBoard } from "@/components/canvas/tldraw-board";

import type { CanvasSnapshot } from "@/lib/types";

export type CanvasStageProps = {
  canvasId: string;
  snapshot?: CanvasSnapshot | null;
  onEditorMount?: (editor: Editor) => void;
  onDocumentChange?: () => void;
  readOnly?: boolean;
};

export const CanvasStage = memo(function CanvasStage({
  canvasId,
  snapshot,
  onDocumentChange,
  onEditorMount,
  readOnly = false,
}: CanvasStageProps) {
  const onDocumentChangeRef = useRef(onDocumentChange);
  const onEditorMountRef = useRef(onEditorMount);
  onDocumentChangeRef.current = onDocumentChange;
  onEditorMountRef.current = onEditorMount;

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const handleDocumentChange = useCallback(() => {
    onDocumentChangeRef.current?.();
  }, []);

  if (!mounted) {
    return <div className="absolute inset-0 canvas-grid bg-surface-soft" />;
  }

  return (
    <TldrawBoard
      key={canvasId}
      canvasId={canvasId}
      snapshot={snapshot}
      onDocumentChange={handleDocumentChange}
      onEditorMount={onEditorMountRef.current}
      readOnly={readOnly}
    />
  );
});
