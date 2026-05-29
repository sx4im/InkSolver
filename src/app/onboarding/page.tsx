import { AppHeader } from "@/components/app-header";
import { OnboardingFlow } from "@/components/onboarding/onboarding-flow";

export default function OnboardingPage() {
  return (
    <div className="min-h-screen bg-canvas">
      <AppHeader />
      <OnboardingFlow />
    </div>
  );
}
