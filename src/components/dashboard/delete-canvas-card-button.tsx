"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function DeleteCanvasCardButton({ canvasId }: { canvasId: string }) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleDelete(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();

    if (!window.confirm("Are you sure you want to delete this canvas? This cannot be undone.")) return;
    if (isDeleting) return;

    setIsDeleting(true);
    try {
      const response = await fetch(`/api/v1/canvases/${canvasId}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Delete failed");
      router.refresh();
    } catch {
      alert("Could not delete canvas.");
      setIsDeleting(false);
    }
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      className="absolute right-2 top-2 z-10 h-8 w-8 bg-black/40 text-white opacity-0 transition-opacity hover:bg-danger hover:text-white group-hover:opacity-100"
      onClick={handleDelete}
      disabled={isDeleting}
      aria-label="Delete canvas"
    >
      {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
    </Button>
  );
}
