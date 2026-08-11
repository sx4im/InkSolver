import { trustProxyHeaders } from "@/server/runtime-guards";

export function getClientIp(request: Request) {
  if (!trustProxyHeaders()) return "local";

  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (
    forwardedFor ||
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-real-ip") ||
    "local"
  );
}