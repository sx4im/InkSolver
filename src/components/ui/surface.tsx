import * as React from "react";

import { cn } from "@/lib/utils";

export function Surface({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-lg border border-hairline bg-canvas", className)} {...props} />;
}
