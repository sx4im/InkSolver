import { Brush, Circle, Eraser, Image, MousePointer2, PenTool, Shapes, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";

const tools = [
  { label: "Select", icon: MousePointer2 },
  { label: "Pen", icon: PenTool },
  { label: "Marker", icon: Brush },
  { label: "Shape", icon: Circle },
  { label: "Eraser", icon: Eraser },
  { label: "Geometry", icon: Shapes },
  { label: "Image upload", icon: Image },
  { label: "AI region selector", icon: Sparkles },
];

export function ToolRail() {
  return (
    <div className="absolute left-4 top-20 z-20 flex w-12 flex-col items-center gap-2 rounded-lg border border-hairline bg-canvas p-1.5">
      {tools.map((tool) => {
        const Icon = tool.icon;

        return (
          <Button key={tool.label} variant={tool.label === "AI region selector" ? "primary" : "ghost"} size="icon" aria-label={tool.label} title={tool.label}>
            <Icon className="h-4 w-4" aria-hidden="true" />
          </Button>
        );
      })}
    </div>
  );
}
