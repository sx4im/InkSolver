import Link from "next/link";
import { SignInButton, SignUpButton, Show, UserButton } from "@clerk/nextjs";
import { Activity, Menu, MessageSquareText, Settings, UserCircle } from "lucide-react";

import { InkSolverLogo } from "@/components/brand/inksolver-logo";
import { Button } from "@/components/ui/button";

export function AppHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-hairline bg-canvas">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" aria-label="Open navigation">
            <Menu className="h-4 w-4" aria-hidden="true" />
          </Button>
          <InkSolverLogo />
        </div>
        <nav className="hidden items-center gap-2 md:flex" aria-label="Primary">
          <Button asChild variant="ghost" size="sm">
            <Link href="/onboarding">Onboarding</Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href="/feedback">
              <MessageSquareText className="h-4 w-4" aria-hidden="true" />
              Feedback
            </Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href="/readiness">
              <Activity className="h-4 w-4" aria-hidden="true" />
              Readiness
            </Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href="/settings">
              <Settings className="h-4 w-4" aria-hidden="true" />
              Settings
            </Link>
          </Button>
          <Show when="signed-out">
            <SignInButton mode="modal">
              <Button variant="ghost" size="sm">Sign In</Button>
            </SignInButton>
            <SignUpButton mode="modal">
              <Button variant="primary" size="sm">Sign Up</Button>
            </SignUpButton>
          </Show>
          <Show when="signed-in">
            <UserButton />
          </Show>
        </nav>
      </div>
    </header>
  );
}
