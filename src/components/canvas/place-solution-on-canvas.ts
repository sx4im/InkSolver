import {
  createShapeId,
  toRichText,
  type TLCreateShapePartial,
  type TLShapeId,
  type TLTextShape,
} from "@tldraw/tlschema";
import type { Editor } from "tldraw";

import { latexToReadable } from "@/lib/latex";
import type { RegionBounds, Solution } from "@/lib/types";

function placementOrigin(editor: Editor, bounds?: RegionBounds | null) {
  if (bounds) {
    return {
      x: bounds.x + bounds.w + 48,
      y: bounds.y,
    };
  }

  const viewport = editor.getViewportPageBounds();

  return {
    x: viewport.x + Math.min(520, viewport.w * 0.52),
    y: viewport.y + Math.max(96, viewport.h * 0.2),
  };
}

function textShape(input: {
  idSeed: string;
  x: number;
  y: number;
  text: string;
  w?: number;
  size?: TLTextShape["props"]["size"];
  color?: TLTextShape["props"]["color"];
}): TLCreateShapePartial<TLTextShape> {
  return {
    id: createShapeId(input.idSeed),
    type: "text",
    x: input.x,
    y: input.y,
    props: {
      autoSize: false,
      color: input.color ?? "blue",
      font: "draw",
      richText: toRichText(input.text),
      scale: 1,
      size: input.size ?? "m",
      textAlign: "start",
      w: input.w ?? 360,
    },
  };
}

function verificationLabel(status: Solution["verificationStatus"]) {
  if (status === "verified") return "verified";
  if (status === "mismatch") return "mismatch";
  return "needs review";
}

export function placeSolutionOnCanvas(editor: Editor | null, solution: Solution) {
  if (!editor) return false;

  const origin = placementOrigin(editor, solution.regionBounds);
  const shapes: TLCreateShapePartial<TLTextShape>[] = [
    textShape({
      idSeed: `ai-${solution.id}-label`,
      x: origin.x,
      y: origin.y,
      text: `AI solution - ${verificationLabel(solution.verificationStatus)}`,
      size: "s",
      color: "light-blue",
      w: 220,
    }),
    textShape({
      idSeed: `ai-${solution.id}-answer`,
      x: origin.x,
      y: origin.y + 38,
      text: latexToReadable(solution.finalAnswer),
      size: "xl",
      color: "blue",
      w: 380,
    }),
    ...solution.steps.map((step, index) =>
      textShape({
        idSeed: `ai-${solution.id}-step-${step.stepNum}`,
        x: origin.x,
        y: origin.y + 110 + index * 92,
        text: `Step ${step.stepNum} (${verificationLabel(step.verificationStatus)}): ${latexToReadable(step.latex)}\n${step.explanation}`,
        size: "s",
        color: "blue",
        w: 430,
      }),
    ),
  ];

  const ids = shapes.map((shape) => shape.id).filter((id): id is TLShapeId => Boolean(id));

  editor.createShapes<TLTextShape>(shapes);
  editor.bringToFront(ids);
  editor.select(...ids);

  return true;
}
