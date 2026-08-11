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
  // Create the store once per instance. Because CanvasStage uses key={canvasId}
  // and manually controls mounting, this component will never accidentally unmount
  // and remount unless the user actually navigates away.
  const [store] = useState(() => createTLStore(snapshot ? { snapshot } : {}));
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
