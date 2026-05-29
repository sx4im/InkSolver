"use client";

import dynamic from "next/dynamic";
import type { Editor } from "tldraw";

import type { CanvasSnapshot } from "@/lib/types";

const TldrawBoard = dynamic(() => import("@/components/canvas/tldraw-board").then((mod) => mod.TldrawBoard), {
  ssr: false,
  loading: () => <div className="absolute inset-0 canvas-grid bg-surface-soft" />,
});

type CanvasStageProps = {
  snapshot?: CanvasSnapshot | null;
  onEditorMount?: (editor: Editor) => void;
  onDocumentChange?: (snapshot: CanvasSnapshot) => void;
  readOnly?: boolean;
};

export function CanvasStage(props: CanvasStageProps) {
  return <TldrawBoard {...props} />;
}
