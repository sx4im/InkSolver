"use client";

import { Component, memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Tldraw, createTLStore, type Editor, type TLStore } from "tldraw";

import type { CanvasSnapshot } from "@/lib/types";

type TldrawBoardProps = {
  canvasId: string;
  snapshot?: CanvasSnapshot | null;
  onEditorMount?: (editor: Editor) => void;
  onDocumentChange?: () => void;
  readOnly?: boolean;
};

// Survive React remounts (dynamic() reload, parent re-render, Clerk hydration).
// A fresh createTLStore on each mount was reloading the initial snapshot and
// disposing the live editor — blank canvas + missing toolbars within seconds.
const storeRegistry = new Map<string, TLStore>();

function getStore(canvasId: string, snapshot?: CanvasSnapshot | null) {
  const existing = storeRegistry.get(canvasId);
  if (existing) return existing;
  const store = createTLStore(snapshot ? { snapshot } : {});
  storeRegistry.set(canvasId, store);
  return store;
}

const tldrawOptions = { maxFontsToLoadBeforeRender: 0 };

class BoardErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="absolute inset-0 flex items-center justify-center bg-surface-soft p-6 text-sm text-ink">
          Canvas failed to load: {this.state.error.message}
        </div>
      );
    }
    return this.props.children;
  }
}

export const TldrawBoard = memo(function TldrawBoard({
  canvasId,
  snapshot,
  onDocumentChange,
  onEditorMount,
  readOnly = false,
}: TldrawBoardProps) {
  // snapshot is only consumed on first create for this canvasId; including it in
  // deps would recreate the memo value when the page prop identity churns.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- registry keyed by canvasId
  const store = useMemo(() => getStore(canvasId, snapshot), [canvasId]);
  const editorRef = useRef<Editor | null>(null);
  const onDocumentChangeRef = useRef(onDocumentChange);
  const onEditorMountRef = useRef(onEditorMount);
  onDocumentChangeRef.current = onDocumentChange;
  onEditorMountRef.current = onEditorMount;

  const handleMount = useCallback(
    (editor: Editor) => {
      editorRef.current = editor;
      editor.updateInstanceState({ isReadonly: readOnly, isFocusMode: false });
      onEditorMountRef.current?.(editor);

      return editor.store.listen(
        () => {
          onDocumentChangeRef.current?.();
        },
        { scope: "document", source: "user" },
      );
    },
    [readOnly],
  );

  useEffect(() => {
    editorRef.current?.updateInstanceState({ isReadonly: readOnly, isFocusMode: false });
  }, [readOnly]);

  return (
    <BoardErrorBoundary>
      <div className="absolute inset-0">
        <Tldraw
          store={store}
          onMount={handleMount}
          options={tldrawOptions}
          licenseKey={process.env.NEXT_PUBLIC_TLDRAW_LICENSE_KEY}
        />
      </div>
    </BoardErrorBoundary>
  );
});
