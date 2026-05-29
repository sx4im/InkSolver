import { notFound } from "next/navigation";

import { CanvasWorkspace } from "@/components/canvas/canvas-workspace";
import {
  getCanvas,
  getChatMessagesForSolution,
  getSolutionsForCanvas,
} from "@/server/canvas-repository";

export const dynamic = "force-dynamic";

export default async function CanvasPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const canvas = getCanvas(id);
  const resolvedCanvas = await canvas;

  if (!resolvedCanvas) {
    notFound();
  }

  const solutions = await getSolutionsForCanvas(resolvedCanvas.id);
  const chatMessages = await getChatMessagesForSolution(solutions[0]?.id);

  return <CanvasWorkspace canvas={resolvedCanvas} chatMessages={chatMessages} initialSolutions={solutions} />;
}
