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
          bg: "#f8f9fb",
          surface: "#ffffff",
          surface2: "#f8f9fb",
          border: "#e5e7eb",
          "border-hover": "#d1d5db",
          accent: "#2563eb",
          "accent-bright": "#3b82f6",
          text: "#111827",
          text2: "#4b5563",
          text3: "#9ca3af",
          green: "#059669",
          red: "#dc2626",
          orange: "#d97706",
        },
      },
      fontFamily: {
        serif: ['"DM Serif Display"', "Georgia", "serif"],
        sans: ['"DM Sans"', "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', "monospace"],
      },
      maxWidth: {
        dashboard: "1100px",
      },
    },
  },
  plugins: [],
};
export default config;
