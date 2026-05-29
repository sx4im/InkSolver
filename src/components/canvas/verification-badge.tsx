import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { VerificationStatus } from "@/lib/types";

const statusConfig = {
  verified: {
    tone: "success" as const,
    label: "Verified",
    icon: CheckCircle2,
  },
  unverifiable: {
    tone: "warning" as const,
    label: "Needs review",
    icon: AlertTriangle,
  },
  mismatch: {
    tone: "danger" as const,
    label: "Mismatch",
    icon: XCircle,
  },
};

export function VerificationBadge({ status, compact = false }: { status: VerificationStatus; compact?: boolean }) {
  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <Badge tone={config.tone} className={compact ? "h-6 px-2" : undefined} aria-label={config.label}>
      <Icon className={compact ? "h-3.5 w-3.5" : "mr-1.5 h-3.5 w-3.5"} aria-hidden="true" />
      {compact ? <span className="sr-only">{config.label}</span> : config.label}
    </Badge>
  );
}
