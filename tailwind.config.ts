import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ci: {
          bg: "#080a0f",
          surface: "#0d1018",
          surface2: "#111520",
          border: "#1e2535",
          "border-hover": "#2a3548",
          accent: "#2563eb",
          "accent-bright": "#3b82f6",
          text: "#e8edf8",
          text2: "#8b9ab5",
          text3: "#4a5a75",
          green: "#22c55e",
          red: "#ef4444",
          orange: "#f59e0b",
          gold: "#d4a843",
        },
      },
      fontFamily: {
        serif: ["Instrument Serif", "Georgia", "serif"],
        sans: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "monospace"],
      },
      borderRadius: {
        none: "0",
        DEFAULT: "0",
      },
      maxWidth: {
        dashboard: "1200px",
      },
    },
  },
  plugins: [],
};
export default config;
