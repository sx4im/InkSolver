"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { Star, ArrowRight } from "lucide-react";
import { InkSolverLogo } from "@/components/brand/inksolver-logo";

export function LandingPage() {
  const [email, setEmail] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (email) {
      window.location.href = `/sign-up?email_address=${encodeURIComponent(email)}`;
    }
  };

  return (
    <div className="relative h-screen w-full bg-white text-[#141414] font-geist antialiased overflow-hidden flex flex-col items-center justify-between">
      {/* 1. Vertically Flipped Video Background */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        <video
          src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260302_085640_276ea93b-d7da-4418-a09b-2aa5b490e838.mp4"
          autoPlay
          muted
          playsInline
          loop
          className="w-full h-full object-cover [transform:scaleY(-1)]"
        />
        {/* Soft White Blend Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-b from-[26.416%] from-[rgba(255,255,255,0)] to-[66.943%] to-white" />
      </div>

      {/* Top Navbar */}
      <header className="relative z-20 w-full max-w-[1200px] flex items-center justify-between px-6 py-6">
        <InkSolverLogo />
        <div className="flex items-center gap-6">
          <Link
            href="/sign-in"
            className="text-sm font-medium text-[#373a46]/80 hover:text-black transition-colors"
          >
            Sign in
          </Link>
          <Link
            href="/sign-up"
            className="text-sm font-medium text-white bg-black px-4 py-2 rounded-full hover:bg-gray-800 transition-colors"
          >
            Try for free
          </Link>
        </div>
      </header>

      {/* Main Hero Container - Centered Vertically without Page Scroll */}
      <main className="relative z-10 w-full max-w-[1200px] flex-1 flex flex-col items-center justify-center text-center px-4 pb-12 gap-[24px] md:gap-[32px]">
        {/* Stagger 1: Main Heading */}
        <motion.h1
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className="font-medium tracking-[-0.04em] text-[#141414] leading-[1.05] text-[40px] sm:text-[56px] md:text-[76px] max-w-[1000px]"
        >
          Simple{" "}
          <span className="font-serif italic font-normal text-[48px] sm:text-[70px] md:text-[96px] tracking-normal">
            solving
          </span>{" "}
          for your STEM workflow.
        </motion.h1>

        {/* Stagger 2: Description */}
        <motion.p
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
          className="text-[15px] md:text-[18px] text-[#373a46] opacity-80 max-w-[554px] leading-relaxed font-normal"
        >
          Draw your math and calculus problems directly on an interactive canvas. Verified instantly with SymPy symbolic step-by-step reasoning.
        </motion.p>

        {/* Stagger 3: Email Input Container + CTA */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="w-full max-w-[480px] flex flex-col items-center gap-4 mt-1"
        >
          <form
            onSubmit={handleSubmit}
            className="w-full flex items-center justify-between p-1.5 pl-5 bg-[#fcfcfc] border border-gray-200/80 rounded-[40px] shadow-[0px_10px_40px_5px_rgba(194,194,194,0.25)] focus-within:border-gray-400 transition-all"
          >
            <input
              type="email"
              placeholder="Enter your work email..."
              aria-label="Work email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-transparent text-sm md:text-base text-black placeholder:text-gray-400 focus:outline-none pr-2"
              required
            />
            <button
              type="submit"
              className="shrink-0 bg-black text-white text-sm font-medium px-6 py-3.5 rounded-[40px] transition-transform hover:scale-[1.02] active:scale-[0.98] shadow-[inset_-4px_-6px_25px_0px_rgba(201,201,201,0.08),inset_4px_4px_10px_0px_rgba(29,29,29,0.24)] flex items-center gap-2"
            >
              <span>Create Free Account</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          {/* Social Proof / Rating Badge */}
          <div className="flex items-center gap-2 text-xs text-gray-500 font-medium">
            <div className="flex items-center text-amber-400">
              {[...Array(5)].map((_, i) => (
                <Star key={i} className="w-3.5 h-3.5 fill-amber-400" />
              ))}
            </div>
            <span>1,020+ STEM Students &amp; Researchers</span>
          </div>
        </motion.div>
      </main>
    </div>
  );
}
