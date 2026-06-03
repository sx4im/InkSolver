import { Brush, Circle, Eraser, Image, MousePointer2, PenTool, Shapes, Sparkles } from "lucide-react";
import type { Editor } from "tldraw";

import { Button } from "@/components/ui/button";

const tools = [
  { label: "Select", icon: MousePointer2, toolId: "select" },
  { label: "Pen", icon: PenTool, toolId: "draw" },
  { label: "Marker", icon: Brush, toolId: "highlight" },
  { label: "Shape", icon: Circle, toolId: "geo" },
  { label: "Eraser", icon: Eraser, toolId: "eraser" },
  { label: "Geometry", icon: Shapes, toolId: "arrow" },
  { label: "Image upload", icon: Image, toolId: "asset" },
  { label: "AI region selector", icon: Sparkles, toolId: null },
];

export function ToolRail({ editor }: { editor: Editor | null }) {
  function handleToolClick(toolId: string | null) {
    if (!editor || !toolId) return;
    editor.setCurrentTool(toolId);
  }

  return (
    <div className="absolute left-4 top-20 z-20 flex w-12 flex-col items-center gap-2 rounded-lg border border-hairline bg-canvas p-1.5">
      {tools.map((tool) => {
        const Icon = tool.icon;

        return (
          <Button
            key={tool.label}
            variant={tool.label === "AI region selector" ? "primary" : "ghost"}
            size="icon"
            aria-label={tool.label}
            title={tool.label}
            onClick={() => handleToolClick(tool.toolId)}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
          </Button>
        );
      })}
    </div>
  );
}
