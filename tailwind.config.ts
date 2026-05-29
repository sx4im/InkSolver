import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
    "./src/app/**/*.{ts,tsx}",
    "./src/lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        canvas: "hsl(var(--canvas))",
        ink: "hsl(var(--ink))",
        body: "hsl(var(--body))",
        muted: "hsl(var(--muted))",
        hairline: "hsl(var(--hairline))",
        primary: "hsl(var(--primary))",
        "primary-active": "hsl(var(--primary-active))",
        "surface-soft": "hsl(var(--surface-soft))",
        "surface-strong": "hsl(var(--surface-strong))",
        "surface-dark": "hsl(var(--surface-dark))",
        coral: "hsl(var(--signature-coral))",
        forest: "hsl(var(--signature-forest))",
        cream: "hsl(var(--signature-cream))",
        peach: "hsl(var(--signature-peach))",
        mint: "hsl(var(--signature-mint))",
        mustard: "hsl(var(--signature-mustard))",
        success: "hsl(var(--success))",
        warning: "hsl(var(--warning))",
        danger: "hsl(var(--danger))",
      },
      borderRadius: {
        xs: "2px",
        sm: "6px",
        md: "10px",
        lg: "12px",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        hand: ["var(--font-caveat)", "cursive"],
      },
      boxShadow: {
        button: "0 10px 28px rgba(27, 97, 201, 0.12)",
      },
    },
  },
  plugins: [],
};

export default config;
