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
        rounder: {
          bg: "#dbeafe",
          text: "#1e40af",
          border: "#93c5fd",
        },
        admin: {
          bg: "#fef3c7",
          text: "#92400e",
          border: "#fcd34d",
        },
        night1: {
          bg: "#e0e7ff",
          text: "#3730a3",
          border: "#a5b4fc",
        },
        night2: {
          bg: "#f3e8ff",
          text: "#6b21a8",
          border: "#d8b4fe",
        },
      },
    },
  },
  plugins: [],
};

export default config;
