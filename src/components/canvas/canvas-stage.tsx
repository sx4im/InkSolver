"use client";

import dynamic from "next/dynamic";
import { memo, useCallback, useEffect, useRef } from "react";
import type { Editor } from "tldraw";

import type { CanvasSnapshot } from "@/lib/types";

const TldrawBoard = dynamic(() => import("@/components/canvas/tldraw-board").then((mod) => mod.TldrawBoard), {
  ssr: false,
  loading: () => <div className="absolute inset-0 canvas-grid bg-surface-soft" />,
});

type CanvasStageProps = {
  canvasId: string;
  snapshot?: CanvasSnapshot | null;
  onEditorMount?: (editor: Editor) => void;
  onDocumentChange?: () => void;
  readOnly?: boolean;
};

export const CanvasStage = memo(function CanvasStage({
  canvasId,
  snapshot,
  onEditorMount,
  onDocumentChange,
  readOnly = false,
}: CanvasStageProps) {
  const onDocumentChangeRef = useRef(onDocumentChange);
  const onEditorMountRef = useRef(onEditorMount);
  onDocumentChangeRef.current = onDocumentChange;
  onEditorMountRef.current = onEditorMount;

  const handleDocumentChange = useCallback(() => {
    onDocumentChangeRef.current?.();
  }, []);

  const handleEditorMount = useCallback((editor: Editor) => {
    onEditorMountRef.current?.(editor);
  }, []);

  return (
    <TldrawBoard
      canvasId={canvasId}
      snapshot={snapshot}
      onDocumentChange={handleDocumentChange}
      onEditorMount={handleEditorMount}
      readOnly={readOnly}
    />
  );
});
