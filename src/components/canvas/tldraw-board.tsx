"use client";

import { useCallback, useEffect, useRef } from "react";
import { Tldraw, type Editor } from "tldraw";

import type { CanvasSnapshot } from "@/lib/types";

type TldrawBoardProps = {
  snapshot?: CanvasSnapshot | null;
  onEditorMount?: (editor: Editor) => void;
  onDocumentChange?: () => void;
  readOnly?: boolean;
};

export function TldrawBoard({ snapshot, onDocumentChange, onEditorMount, readOnly = false }: TldrawBoardProps) {
  const editorRef = useRef<Editor | null>(null);

  const handleMount = useCallback(
    (editor: Editor) => {
      editorRef.current = editor;
      editor.updateInstanceState({ isReadonly: readOnly });
      onEditorMount?.(editor);

      // Only notify that the document changed. Serializing the whole store on
      // every input event is O(document size) and visibly drops frames on
      // large whiteboards; consumers snapshot once at save time instead.
      return editor.store.listen(
        () => {
          onDocumentChange?.();
        },
        { scope: "document", source: "user" },
      );
    },
    [onDocumentChange, onEditorMount, readOnly],
  );

  useEffect(() => {
    editorRef.current?.updateInstanceState({ isReadonly: readOnly });
  }, [readOnly]);

  return (
    <div className="absolute inset-0">
      <Tldraw
        snapshot={snapshot ?? undefined}
        onMount={handleMount}
        licenseKey={process.env.NEXT_PUBLIC_TLDRAW_LICENSE_KEY}
      />
    </div>
  );
}
