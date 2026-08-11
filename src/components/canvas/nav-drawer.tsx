import Link from "next/link";
import {
  Download,
  FileWarning,
  Home,
  Loader2,
  PanelRightClose,
  Save,
  Settings,
  Trash2,
} from "lucide-react";

import { CanvasShareControls } from "@/components/canvas/canvas-share-controls";
import { Button } from "@/components/ui/button";

type ExportFormat = "pdf" | "png" | "latex";

type NavDrawerProps = {
  canvasId: string;
  isPublic: boolean;
  onPublicChange: (value: boolean) => void;
  shareSlug: string;
  saveStatus: "saved" | "dirty" | "saving" | "error";
  isExporting: boolean;
  isDeleting: boolean;
  onClose: () => void;
  onSave: () => void;
  onExport: (format: ExportFormat) => void;
  onDelete: () => void;
};

const EXPORT_FORMATS: { format: ExportFormat; label: string }[] = [
  { format: "pdf", label: "Export PDF" },
  { format: "png", label: "Export PNG" },
  { format: "latex", label: "Export LaTeX" },
];

export function NavDrawer({
  canvasId,
  isPublic,
  onPublicChange,
  shareSlug,
  saveStatus,
  isExporting,
  isDeleting,
  onClose,
  onSave,
  onExport,
  onDelete,
}: NavDrawerProps) {
  return (
    <div className="absolute inset-0 z-50 flex" role="dialog" aria-modal="true" aria-label="Navigation">
      <div className="relative z-10 w-72 max-w-[85vw] overflow-y-auto border-r border-hairline bg-canvas p-4 shadow-lg">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-ink">Navigation</h2>
          <Button variant="ghost" size="icon" aria-label="Close navigation" onClick={onClose}>
            <PanelRightClose className="h-4 w-4" />
          </Button>
        </div>
        <nav className="mt-4 flex flex-col gap-2">
          <Button asChild variant="ghost" className="justify-start">
            <Link href="/">
              <Home className="mr-2 h-4 w-4" />
              Dashboard
            </Link>
          </Button>
          <Button asChild variant="ghost" className="justify-start">
            <Link href="/settings">
              <Settings className="mr-2 h-4 w-4" />
              Settings
            </Link>
          </Button>
          <Button asChild variant="ghost" className="justify-start">
            <Link href="/feedback">
              <FileWarning className="mr-2 h-4 w-4" />
              Feedback
            </Link>
          </Button>
        </nav>
        <div className="mt-6 border-t border-hairline pt-4 sm:hidden">
          <p className="text-xs font-medium uppercase text-muted">Share</p>
          <div className="mt-3">
            <CanvasShareControls
              canvasId={canvasId}
              isPublic={isPublic}
              onPublicChange={onPublicChange}
              shareSlug={shareSlug}
              className="flex flex-wrap"
            />
          </div>
          <p className="mt-5 text-xs font-medium uppercase text-muted">Canvas actions</p>
          <div className="mt-3 flex flex-col gap-2">
            <Button
              variant="secondary"
              className="justify-start"
              onClick={() => {
                onClose();
                onSave();
              }}
              disabled={saveStatus === "saving"}
            >
              <Save className="mr-2 h-4 w-4" aria-hidden="true" />
              {saveStatus === "saving" ? "Saving..." : "Save now"}
            </Button>
            {EXPORT_FORMATS.map(({ format, label }) => (
              <Button
                key={format}
                variant="secondary"
                className="justify-start"
                onClick={() => {
                  onClose();
                  onExport(format);
                }}
                disabled={isExporting}
              >
                <Download className="mr-2 h-4 w-4" aria-hidden="true" />
                {label}
              </Button>
            ))}
            <button
              type="button"
              onClick={onDelete}
              disabled={isDeleting}
              className="flex w-full items-center rounded-md px-3 py-2 text-sm font-medium text-danger hover:bg-danger/5 disabled:opacity-50"
            >
              {isDeleting ? (
                <Loader2 className="mr-3 h-5 w-5 animate-spin" aria-hidden="true" />
              ) : (
                <Trash2 className="mr-3 h-5 w-5" aria-hidden="true" />
              )}
              Delete canvas
            </button>
          </div>
        </div>
      </div>
      <button
        type="button"
        aria-label="Close navigation"
        className="flex-1 cursor-default bg-ink/20"
        onClick={onClose}
      />
    </div>
  );
}
