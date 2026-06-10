import type { Config } from "tailwindcss";

/**
 * Design tokens from design.md §2 — dark terminal / mission-control aesthetic.
 * The hex values live as CSS variables in app/globals.css (:root) and are
 * referenced here via var(), so the palette has a single source of truth.
 * Dark-only — no light mode (CLAUDE.md / design.md §9 invariant).
 */
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          primary: "var(--bg-primary)",
          surface: "var(--bg-surface)",
          elevated: "var(--bg-elevated)",
        },
        border: {
          DEFAULT: "var(--border-default)",
          accent: "var(--border-accent)",
        },
        text: {
          primary: "var(--text-primary)",
          secondary: "var(--text-secondary)",
          dim: "var(--text-dim)",
        },
        "green-pass": "var(--green-pass)",
        "green-dim": "var(--green-dim)",
        "red-slash": "var(--red-slash)",
        "red-dim": "var(--red-dim)",
        "amber-pending": "var(--amber-pending)",
        "cyan-accent": "var(--cyan-accent)",
        "purple-protocol": "var(--purple-protocol)",
      },
      fontFamily: {
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
        display: ["var(--font-display)", "ui-sans-serif", "sans-serif"],
      },
      fontSize: {
        xs: "11px",
        sm: "13px",
        base: "15px",
        lg: "20px",
        xl: "28px",
        xxl: "48px",
      },
      boxShadow: {
        // Green/red glow on PASS/SLASH events (design.md §2 effects).
        "glow-green": "0 0 12px 0 var(--green-dim), 0 0 2px 0 var(--green-pass)",
        "glow-red": "0 0 24px 2px var(--red-dim), 0 0 4px 0 var(--red-slash)",
        "glow-cyan": "0 0 12px 0 rgba(0, 212, 255, 0.16)",
      },
      keyframes: {
        blink: {
          "0%, 49%": { opacity: "1" },
          "50%, 100%": { opacity: "0" },
        },
        "pulse-green": {
          "0%, 100%": { boxShadow: "0 0 0 0 var(--green-dim)" },
          "50%": { boxShadow: "0 0 14px 1px var(--green-dim)" },
        },
        "pulse-red": {
          "0%, 100%": { boxShadow: "0 0 0 0 var(--red-dim)" },
          "50%": { boxShadow: "0 0 18px 2px var(--red-dim)" },
        },
      },
      animation: {
        blink: "blink 1s step-end infinite",
        "pulse-green": "pulse-green 1.6s ease-in-out 2",
        "pulse-red": "pulse-red 1.2s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
