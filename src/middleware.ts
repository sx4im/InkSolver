import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Routes that must work without a Clerk session:
// - sign-in/sign-up: the auth flow itself
// - /s/:slug + share APIs: the public share loop (visitors and social crawlers
//   are signed out by definition); remix stays protected so it can attach the
//   copy to a signed-in account
// - billing webhooks: Lemon Squeezy's servers authenticate with an HMAC
//   signature, not a Clerk session
// - telemetry: beacons also fire from public pages; the route is rate-limited
// - readiness: guarded by its own admin bearer token
const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/s/(.*)",
  "/api/v1/share/:slug",
  "/api/v1/share/:slug/og",
  "/api/v1/webhooks/(.*)",
  "/api/v1/telemetry",
  "/api/v1/readiness",
]);

const clerkConfigured = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
const isProduction = process.env.NODE_ENV === "production";

export default clerkMiddleware(async (auth, request) => {
  // Local-first development: without Clerk keys the app authenticates via the
  // demo/header fallback in auth-context, so middleware must not 404 every
  // page. Production always requires a real session.
  if (!clerkConfigured && !isProduction) return;

  if (!isPublicRoute(request)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
