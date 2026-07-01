import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Traffic-light palette used across the dashboard
        status: {
          green: "#16a34a",
          yellow: "#d97706",
          red: "#dc2626",
          gray: "#6b7280",
        },
      },
    },
  },
  plugins: [],
};

export default config;
