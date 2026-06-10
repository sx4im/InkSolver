import Link from "next/link";
import { SignInButton, SignUpButton, Show, UserButton } from "@clerk/nextjs";
import { MessageSquareText, Settings, Sparkles } from "lucide-react";

import { InkSolverLogo } from "@/components/brand/inksolver-logo";
import { Button } from "@/components/ui/button";

export function AppHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-hairline bg-canvas">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
        <InkSolverLogo />
        <nav className="flex items-center gap-1 sm:gap-2" aria-label="Primary">
          <Button asChild variant="ghost" size="sm">
            <Link href="/onboarding">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">Onboarding</span>
            </Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href="/feedback">
              <MessageSquareText className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">Feedback</span>
            </Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href="/settings">
              <Settings className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">Settings</span>
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
