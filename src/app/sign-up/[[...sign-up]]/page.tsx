"use client";

import { SignUp } from "@clerk/nextjs";
import { useSearchParams } from "next/navigation";

export default function SignUpPage() {
  const searchParams = useSearchParams();
  const initialEmail = searchParams.get("email_address") ?? searchParams.get("email") ?? undefined;

  return (
    <div className="flex min-h-screen items-center justify-center">
      <SignUp initialValues={initialEmail ? { emailAddress: initialEmail } : undefined} />
    </div>
  );
}
