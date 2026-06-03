import crypto from "crypto";
import { headers } from "next/headers";
import { currentUser } from "@clerk/nextjs/server";

import { DEMO_USER_ID, mockUser } from "@/lib/mock-data";
import { allowDemoAuthFallback, trustRequestIdentityHeaders } from "@/server/runtime-guards";

type HeaderReader = {
  get(name: string): string | null;
};

export type AuthenticatedUser = {
  id: string;
  email: string;
  name: string;
  imageUrl?: string | null;
  rawSubject: string;
  source: "headers" | "env" | "demo" | "clerk";
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const idHeaders = ["x-inksolver-user-id", "x-clerk-user-id", "x-user-id"];
const emailHeaders = ["x-inksolver-user-email", "x-clerk-user-email", "x-user-email"];
const nameHeaders = ["x-inksolver-user-name", "x-clerk-user-name", "x-user-name"];
const imageHeaders = ["x-inksolver-user-image", "x-clerk-user-image", "x-user-image"];
const maxHeaderValueLength = 320;

export class AuthenticationRequiredError extends Error {
  constructor() {
    super("Authentication is required");
    this.name = "AuthenticationRequiredError";
  }
}

export async function getAuthenticatedUser(request?: Request): Promise<AuthenticatedUser> {
  try {
    const clerkUser = await currentUser();
    if (clerkUser) {
      const email = clerkUser.emailAddresses[0]?.emailAddress || `${clerkUser.id}@clerk.local`;
      return {
        id: stableUuid(clerkUser.id),
        rawSubject: clerkUser.id,
        email,
        name: clerkUser.firstName ? `${clerkUser.firstName} ${clerkUser.lastName || ''}`.trim() : email.split('@')[0],
        imageUrl: clerkUser.imageUrl,
        source: "clerk",
      };
    }
  } catch (err) {
    // Ignore Clerk errors in environments where it's not configured
  }

  const requestHeaders = await resolveHeaders(request);
  const headerIdentity = requestHeaders && trustRequestIdentityHeaders() ? identityFromHeaders(requestHeaders) : null;
  if (headerIdentity) return headerIdentity;

  const envSubject = process.env.INKSOLVER_DEMO_USER_ID;
  const envEmail = process.env.INKSOLVER_DEMO_USER_EMAIL;

  if ((envSubject || envEmail) && allowDemoAuthFallback()) {
    const rawSubject = envSubject || envEmail || DEMO_USER_ID;

    return {
      id: stableUuid(rawSubject),
      rawSubject,
      email: envEmail || mockUser.email,
      name: process.env.INKSOLVER_DEMO_USER_NAME || mockUser.name,
      imageUrl: process.env.INKSOLVER_DEMO_USER_IMAGE_URL || null,
      source: "env",
    };
  }

  if (!allowDemoAuthFallback()) {
    throw new AuthenticationRequiredError();
  }

  return {
    id: DEMO_USER_ID,
    rawSubject: DEMO_USER_ID,
    email: mockUser.email,
    name: mockUser.name,
    imageUrl: null,
    source: "demo",
  };
}

export function stableUuid(subject: string) {
  if (uuidPattern.test(subject)) return subject;

  const hash = crypto.createHash("sha256").update(subject).digest("hex");
  const variant = ((parseInt(hash[16], 16) & 0x3) | 0x8).toString(16);

  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    `4${hash.slice(13, 16)}`,
    `${variant}${hash.slice(17, 20)}`,
    hash.slice(20, 32),
  ].join("-");
}

async function resolveHeaders(request?: Request): Promise<HeaderReader | null> {
  if (request) return request.headers;

  try {
    return await headers();
  } catch {
    return null;
  }
}

function identityFromHeaders(requestHeaders: HeaderReader): AuthenticatedUser | null {
  const rawSubject = firstHeader(requestHeaders, idHeaders) || firstHeader(requestHeaders, emailHeaders);
  if (!rawSubject) return null;

  const email = firstHeader(requestHeaders, emailHeaders) || `${stableUuid(rawSubject)}@local.inksolver.dev`;
  const name = firstHeader(requestHeaders, nameHeaders) || email.split("@")[0] || "Student";
  const imageUrl = firstHeader(requestHeaders, imageHeaders);

  return {
    id: stableUuid(rawSubject),
    rawSubject,
    email,
    name,
    imageUrl,
    source: "headers",
  };
}

function firstHeader(requestHeaders: HeaderReader, names: string[]) {
  for (const name of names) {
    const value = requestHeaders.get(name);
    const trimmed = value?.trim();
    if (trimmed && trimmed.length <= maxHeaderValueLength) return trimmed;
  }

  return null;
}
