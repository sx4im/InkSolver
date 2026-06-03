import { ClerkProvider } from "@clerk/nextjs";
import { shadcn } from "@clerk/ui/themes";
import type { Metadata } from "next";
import { Caveat, Inter } from "next/font/google";
import "tldraw/tldraw.css";
import "./globals.css";
import { WebVitalsReporter } from "@/components/telemetry/web-vitals-reporter";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const caveat = Caveat({
  subsets: ["latin"],
  variable: "--font-caveat",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
  title: "InkSolver",
  description: "AI whiteboard that solves STEM problems as you draw them.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${caveat.variable}`}>
      <body className="font-sans">
        <ClerkProvider 
          appearance={{ 
            theme: shadcn,
            variables: {
              colorPrimary: 'hsl(220 23% 12%)', // var(--ink)
              colorForeground: 'hsl(220 23% 12%)', // var(--ink)
              colorMutedForeground: 'hsl(220 9% 28%)', // var(--muted)
              colorBackground: 'white',
              colorInput: 'white',
              colorInputForeground: 'hsl(220 23% 12%)', // var(--ink)
              colorShimmer: 'hsl(220 10% 89%)', // var(--surface-strong)
              colorBorder: 'black',
              colorNeutral: 'black',
            },
            elements: {
              card: 'shadow-button border border-hairline',
              formButtonPrimary: 'bg-ink hover:bg-primary-active text-white',
              formFieldInput: 'border-[1px] border-solid border-black focus:ring-ink focus:border-ink',
              socialButtonsBlockButton: 'border-[1px] border-solid border-black hover:bg-surface-soft',
              footerActionLink: 'text-ink hover:text-primary-active',
              navbar: 'bg-canvas',
              pageScrollBox: 'bg-canvas',
              userProfilePage: 'bg-canvas',
              userPreviewMainIdentifier: 'text-ink',
              profileSectionTitle: 'text-ink',
            }
          }}
        >
          {children}
          <WebVitalsReporter />
        </ClerkProvider>
      </body>
    </html>
  );
}