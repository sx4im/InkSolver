import Link from "next/link";
import { PenTool } from "lucide-react";

export function InkSolverLogo() {
  return (
    <Link
      href="/"
      className="flex min-h-10 items-center gap-2 rounded-sm text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#458fff]"
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-white">
        <PenTool className="h-4 w-4" aria-hidden="true" />
      </span>
      <span className="text-base font-medium">InkSolver</span>
    </Link>
  );
}
