import katex from "katex";

import { cn } from "@/lib/utils";

// KaTeX-rendered math. `katex.renderToString` is isomorphic (no DOM needed), so
// this component renders correctly in both server components (the public share
// page) and client components (the canvas workspace and chat) without a
// `"use client"` boundary or a hydration mismatch — the same input always
// produces the same markup.

type MathProps = {
  latex: string;
  display?: boolean;
  className?: string;
};

export function Formula({ latex, display = false, className }: MathProps) {
  const trimmed = latex?.trim();
  if (!trimmed) return null;

  try {
    const html = katex.renderToString(trimmed, {
      displayMode: display,
      throwOnError: true,
      strict: false,
    });

    return (
      <span
        className={cn(display ? "block" : "inline-block", className)}
        // KaTeX output is generated from a trusted, locally-rendered expression.
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  } catch {
    // If the expression cannot be parsed (bad OCR, partial stream, unusual
    // notation), fall back to the raw source in the handwriting face rather than
    // a red KaTeX error — see the PRD's "couldn't read clearly" resilience note.
    return <span className={cn("font-hand", className)}>{trimmed}</span>;
  }
}

type MathSegment = { type: "text" | "math"; value: string; display: boolean };

// Matches `$$...$$`, `\[...\]` (display) and `$...$`, `\(...\)` (inline).
const MATH_DELIMITERS = /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|\$([^$\n]+?)\$/g;

export function splitMathSegments(input: string): MathSegment[] {
  const segments: MathSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  MATH_DELIMITERS.lastIndex = 0;
  while ((match = MATH_DELIMITERS.exec(input)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: "text", value: input.slice(lastIndex, match.index), display: false });
    }

    const display = match[1] !== undefined || match[2] !== undefined;
    const value = match[1] ?? match[2] ?? match[3] ?? match[4] ?? "";
    segments.push({ type: "math", value, display });
    lastIndex = MATH_DELIMITERS.lastIndex;
  }

  if (lastIndex < input.length) {
    segments.push({ type: "text", value: input.slice(lastIndex), display: false });
  }

  return segments;
}

// Renders prose that may contain inline/display math delimited by `$...$`,
// `$$...$$`, `\(...\)`, or `\[...\]`. Plain text outside delimiters is rendered
// verbatim. Used for follow-up chat answers.
export function MathProse({ text, className }: { text: string; className?: string }) {
  if (!text) return null;

  const segments = splitMathSegments(text);

  return (
    <span className={className}>
      {segments.map((segment, index) =>
        segment.type === "math" ? (
          <Formula key={index} latex={segment.value} display={segment.display} />
        ) : (
          <span key={index}>{segment.value}</span>
        ),
      )}
    </span>
  );
}
