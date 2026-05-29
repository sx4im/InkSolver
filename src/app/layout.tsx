import type { Metadata } from "next";
import { Caveat, Inter } from "next/font/google";
import "tldraw/tldraw.css";
import "katex/dist/katex.min.css";
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
        {children}
        <WebVitalsReporter />
      </body>
    </html>
  );
}
