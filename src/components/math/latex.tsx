import katex from "katex";

import { cn } from "@/lib/utils";

// Renders on both the server (share pages, RSC) and the client. KaTeX is pure
// JS with no DOM dependency, so renderToString works everywhere; on invalid
// input we fall back to the raw source rather than throwing mid-render.
export function Latex({
  value,
  display = false,
  className,
}: {
  value: string;
  display?: boolean;
  className?: string;
}) {
  let html: string | null = null;

  try {
    html = katex.renderToString(value, {
      displayMode: display,
      throwOnError: false,
      strict: false,
      output: "html",
    });
  } catch {
    html = null;
  }

  if (!html) {
    return <span className={cn("font-hand", className)}>{value}</span>;
  }

  return (
    <span
      className={cn(display ? "block overflow-x-auto" : "inline-block max-w-full overflow-x-auto align-middle", className)}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
