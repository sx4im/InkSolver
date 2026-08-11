import { NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentUser, updateUserPlan } from "@/server/canvas-repository";
import { enforceRateLimit, parseGuardedJson, requestBodyLimits } from "@/server/request-guards";

const checkoutSchema = z.object({
  plan: z.enum(["pro_monthly", "pro_annual"]),
  local_upgrade: z.boolean().optional(),
});

const planLabels = {
  pro_monthly: "Pro monthly",
  pro_annual: "Pro annual",
};

export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, "billing", {
    route: "billing_checkout",
  });

  if (limited) return limited;

  const parsedBody = await parseGuardedJson(request, checkoutSchema, {
    fallback: { plan: "pro_monthly" },
    maxBytes: requestBodyLimits.billing,
    route: "billing_checkout",
  });

  if (!parsedBody.ok) return parsedBody.response;

  const body = parsedBody.data;
  const user = await getCurrentUser();

  if (user.plan === "pro") {
    return NextResponse.json({
      plan: body.plan,
      checkout_url: null,
      status: "already_pro",
      user,
    });
  }

  if (body.local_upgrade && process.env.NODE_ENV !== "production") {
    const upgraded = await updateUserPlan({
      plan: "pro",
      userId: user.id,
      lemonSqueezyCustomerId: "local_dev_upgrade",
    });

    return NextResponse.json({
      plan: body.plan,
      checkout_url: null,
      status: "local_upgraded",
      user: upgraded,
    });
  }

  const configuredCheckoutUrl = process.env.LEMON_SQUEEZY_CHECKOUT_URL;
  const checkoutUrl = configuredCheckoutUrl
    ? appendCheckoutParams(configuredCheckoutUrl, {
        plan: body.plan,
        user_id: user.id,
        email: user.email,
      })
    : null;

  return NextResponse.json({
    plan: body.plan,
    label: planLabels[body.plan],
    checkout_url: checkoutUrl,
    status: checkoutUrl ? "checkout_ready" : "local_checkout_unconfigured",
    local_upgrade_available: process.env.NODE_ENV !== "production",
    user,
  });
}

function appendCheckoutParams(baseUrl: string, params: Record<string, string>) {
  const url = new URL(baseUrl);

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  return url.toString();
}
