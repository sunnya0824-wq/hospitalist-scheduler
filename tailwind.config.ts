import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Blade Runner neon palette
        neon: {
          bg: "#0a0e1a",
          surface: "#0f172a",
          border: "#1e293b",
          cyan: "#22d3ee",
          magenta: "#e879f9",
          amber: "#fbbf24",
          teal: "#2dd4bf",
        },
        // Neon dark-mode shift chip tokens
        rounder: {
          bg: "#0e2a33",
          text: "#67e8f9",
          border: "#22d3ee",
        },
        admin: {
          bg: "#2b220a",
          text: "#fbbf24",
          border: "#f59e0b",
        },
        night1: {
          bg: "#0c2b29",
          text: "#5eead4",
          border: "#2dd4bf",
        },
        night2: {
          bg: "#2a1430",
          text: "#f0abfc",
          border: "#e879f9",
        },
      },
      boxShadow: {
        "neon-cyan": "0 0 12px rgba(34, 211, 238, 0.4)",
        "neon-cyan-lg": "0 0 18px rgba(34, 211, 238, 0.55)",
        "neon-magenta": "0 0 12px rgba(232, 121, 249, 0.4)",
        "neon-amber": "0 0 12px rgba(251, 191, 36, 0.4)",
        "neon-teal": "0 0 12px rgba(45, 212, 191, 0.4)",
      },
    },
  },
  plugins: [],
};

export default config;
