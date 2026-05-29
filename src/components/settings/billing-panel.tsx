"use client";

import { useState } from "react";
import { CreditCard, ExternalLink, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { UserAccount } from "@/lib/types";

type CheckoutResponse = {
  checkout_url: string | null;
  status: "already_pro" | "checkout_ready" | "local_checkout_unconfigured" | "local_upgraded";
  local_upgrade_available?: boolean;
  user?: UserAccount | null;
};

export function BillingPanel({ user }: { user: UserAccount }) {
  const [status, setStatus] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function startCheckout(localUpgrade = false) {
    setIsLoading(true);
    setStatus(null);

    try {
      const response = await fetch("/api/v1/billing/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          plan: "pro_monthly",
          local_upgrade: localUpgrade,
        }),
      });
      const payload = (await response.json()) as CheckoutResponse;

      if (payload.checkout_url) {
        window.location.assign(payload.checkout_url);
        return;
      }

      if (payload.status === "local_upgraded") {
        setStatus("Local development upgrade applied.");
        window.location.reload();
        return;
      }

      if (payload.status === "already_pro") {
        setStatus("Your account is already on Pro.");
        return;
      }

      setStatus("Checkout is not configured yet. Use the local upgrade while developing.");
    } catch {
      setStatus("Checkout could not start.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <CreditCard className="h-4 w-4 text-muted" aria-hidden="true" />
        <h2 className="text-xl font-normal text-ink">Billing</h2>
      </div>
      <p className="mt-4 leading-6 text-muted">
        Free accounts get 10 solves per day and 5 active canvases. Pro removes daily solve and active canvas limits for production usage.
      </p>
      <div className="mt-5 rounded-md border border-hairline bg-canvas p-4">
        <div className="flex items-center justify-between gap-4">
          <span className="text-sm text-muted">Current plan</span>
          <span className="text-sm font-medium uppercase text-ink">{user.plan}</span>
        </div>
        <div className="mt-3 flex items-center justify-between gap-4">
          <span className="text-sm text-muted">Solves remaining today</span>
          <span className="text-sm font-medium text-ink">{user.usageRemaining}</span>
        </div>
        <div className="mt-3 flex items-center justify-between gap-4">
          <span className="text-sm text-muted">Active canvases</span>
          <span className="text-sm font-medium text-ink">
            {user.plan === "pro" ? user.activeCanvases : `${user.activeCanvases}/${user.activeCanvasLimit}`}
          </span>
        </div>
      </div>
      <div className="mt-6 flex flex-wrap gap-3">
        <Button onClick={() => void startCheckout(false)} disabled={isLoading || user.plan === "pro"}>
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ExternalLink className="h-4 w-4" aria-hidden="true" />}
          Upgrade to Pro
        </Button>
        {process.env.NODE_ENV !== "production" && user.plan !== "pro" ? (
          <Button type="button" variant="secondary" onClick={() => void startCheckout(true)} disabled={isLoading}>
            Local upgrade
          </Button>
        ) : null}
      </div>
      {status ? <p className="mt-4 text-sm leading-6 text-muted">{status}</p> : null}
    </div>
  );
}
