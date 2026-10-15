import type { Config } from "tailwindcss";
export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: { extend: { colors: { brand: "var(--brand)" } } },
  plugins: [],
} satisfies Config;
