import crypto from "crypto";
import { NextResponse } from "next/server";

import type { Plan } from "@/lib/types";
import { updateUserPlan } from "@/server/canvas-repository";
import { enforceRateLimit, readGuardedText, requestBodyLimits } from "@/server/request-guards";
import { allowUnsignedWebhooks } from "@/server/runtime-guards";

export const dynamic = "force-dynamic";

type LemonPayload = {
  meta?: {
    event_name?: string;
    custom_data?: {
      user_id?: string;
      email?: string;
    };
  };
  data?: {
    attributes?: {
      user_email?: string;
      customer_email?: string;
      customer_id?: string | number;
      status?: string;
      custom_data?: {
        user_id?: string;
        email?: string;
      };
    };
  };
};

export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, "webhook", {
    route: "lemonsqueezy_webhook",
  });

  if (limited) return limited;

  const textResult = await readGuardedText(request, {
    maxBytes: requestBodyLimits.webhook,
    route: "lemonsqueezy_webhook",
  });

  if (!textResult.ok) return textResult.response;

  const rawBody = typeof textResult.data === "string" ? textResult.data : "";

  if (!isValidSignature(rawBody, request.headers.get("x-signature"))) {
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });
  }

  let payload: LemonPayload;

  try {
    payload = JSON.parse(rawBody || "{}") as LemonPayload;
  } catch {
    return NextResponse.json(
      {
        error: "Webhook body must be valid JSON",
        code: "invalid_json",
      },
      { status: 400 },
    );
  }

  const eventName = payload.meta?.event_name ?? "unknown";
  const plan = planFromEvent(eventName, payload.data?.attributes?.status);

  if (!plan) {
    return NextResponse.json({ ok: true, ignored: true, event_name: eventName });
  }

  const targetUserId = payload.meta?.custom_data?.user_id ?? payload.data?.attributes?.custom_data?.user_id ?? null;
  const targetEmail =
    payload.meta?.custom_data?.email ??
    payload.data?.attributes?.custom_data?.email ??
    payload.data?.attributes?.user_email ??
    payload.data?.attributes?.customer_email ??
    null;

  if (!targetUserId && !targetEmail) {
    return NextResponse.json(
      {
        error: "Webhook must include a target user_id or email.",
        code: "missing_webhook_identity",
      },
      { status: 400 },
    );
  }

  const user = await updateUserPlan({
    plan,
    userId: targetUserId,
    email: targetEmail,
    lemonSqueezyCustomerId: payload.data?.attributes?.customer_id
      ? String(payload.data.attributes.customer_id)
      : null,
  });

  return NextResponse.json({
    ok: true,
    event_name: eventName,
    plan,
    user,
  });
}

function planFromEvent(eventName: string, status?: string): Plan | null {
  if (["subscription_created", "subscription_updated", "order_created"].includes(eventName)) {
    return status === "cancelled" || status === "expired" ? "free" : "pro";
  }

  if (["subscription_cancelled", "subscription_expired"].includes(eventName)) {
    return "free";
  }

  return null;
}

function isValidSignature(rawBody: string, signature: string | null) {
  const secret = process.env.LEMON_SQUEEZY_WEBHOOK_SECRET;
  if (!secret) return allowUnsignedWebhooks();
  if (!signature) return false;

  const digest = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const expected = Buffer.from(digest);
  const received = Buffer.from(signature);

  if (expected.length !== received.length) return false;

  return crypto.timingSafeEqual(expected, received);
}
