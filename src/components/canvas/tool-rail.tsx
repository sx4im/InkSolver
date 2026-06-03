import { Brush, Circle, Eraser, Image, Loader2, MessageSquare, MousePointer2, PenTool, Shapes, Sparkles } from "lucide-react";
import type { Editor } from "tldraw";

import { Button } from "@/components/ui/button";

const tools = [
  { label: "Select", icon: MousePointer2, toolId: "select" },
  { label: "Pen", icon: PenTool, toolId: "draw" },
  { label: "Marker", icon: Brush, toolId: "highlight" },
  { label: "Shape", icon: Circle, toolId: "geo" },
  { label: "Eraser", icon: Eraser, toolId: "eraser" },
  { label: "Geometry", icon: Shapes, toolId: "arrow" },
  { label: "Image", icon: Image, toolId: "asset" },
];

type BottomToolbarProps = {
  editor: Editor | null;
  onSolve: () => void;
  isSolving: boolean;
  onToggleChat: () => void;
};

export function BottomToolbar({ editor, onSolve, isSolving, onToggleChat }: BottomToolbarProps) {
  function handleToolClick(toolId: string | null) {
    if (!editor || !toolId) return;
    editor.setCurrentTool(toolId);
  }

  return (
    <div className="absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1 rounded-xl border border-hairline bg-canvas p-1.5 shadow-lg">
      {tools.map((tool) => {
        const Icon = tool.icon;
        return (
          <Button
            key={tool.label}
            variant="ghost"
            size="icon"
            className="h-9 w-9"
            aria-label={tool.label}
            title={tool.label}
            onClick={() => handleToolClick(tool.toolId)}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
          </Button>
        );
      })}
      <span className="mx-1 h-5 w-px bg-hairline" />
      <Button
        onClick={onSolve}
        disabled={isSolving}
        className="h-9 gap-1.5 px-3"
        size="sm"
      >
        {isSolving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Sparkles className="h-4 w-4" aria-hidden="true" />}
        Solve
      </Button>
      <span className="mx-1 h-5 w-px bg-hairline" />
      <Button variant="secondary" size="icon" className="h-9 w-9" aria-label="Open chat" onClick={onToggleChat}>
        <MessageSquare className="h-4 w-4" aria-hidden="true" />
      </Button>
    </div>
  );
}
