import { NextResponse } from "next/server";

type HeaderReader = {
  get(name: string): string | null;
};

export function isProductionRuntime() {
  return process.env.NODE_ENV === "production";
}

export function trustRequestIdentityHeaders() {
  return !isProductionRuntime() || process.env.INKSOLVER_TRUST_REQUEST_HEADERS === "true";
}

export function allowDemoAuthFallback() {
  return !isProductionRuntime() || process.env.INKSOLVER_ALLOW_DEMO_AUTH === "true";
}

export function trustProxyHeaders() {
  return !isProductionRuntime() || process.env.INKSOLVER_TRUST_PROXY_HEADERS === "true";
}

export function allowUnsignedWebhooks() {
  return !isProductionRuntime() && process.env.INKSOLVER_ALLOW_UNSIGNED_WEBHOOKS !== "false";
}

export function localFileRoutesEnabled() {
  return !isProductionRuntime() || process.env.INKSOLVER_ENABLE_LOCAL_FILE_ROUTES === "true";
}

export function hasAdminAccess(requestHeaders: HeaderReader | null) {
  if (!isProductionRuntime()) return { ok: true, status: 200, message: "Allowed in local development." };

  const token = process.env.INKSOLVER_ADMIN_TOKEN;

  if (!token) {
    return {
      ok: false,
      status: 503,
      message: "Admin token is not configured.",
    };
  }

  const authorization = requestHeaders?.get("authorization") ?? "";
  const expected = `Bearer ${token}`;

  if (authorization === expected) {
    return { ok: true, status: 200, message: "Allowed." };
  }

  return {
    ok: false,
    status: 401,
    message: "Admin authorization is required.",
  };
}

export function requireAdminAccess(request: Request) {
  const access = hasAdminAccess(request.headers);
  if (access.ok) return null;

  return NextResponse.json(
    {
      error: access.message,
      code: access.status === 503 ? "admin_not_configured" : "admin_required",
    },
    {
      status: access.status,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
