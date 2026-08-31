import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    // Clases de Tailwind construidas dinámicamente (p.ej. STATUS_CARD_GRADIENT en
    // lib/status-colors.ts) viven fuera de components/app — sin este glob, Tailwind
    // nunca las escanea y las utilidades correspondientes no se generan (la clase
    // queda en el DOM pero sin regla CSS, así que no se ve ningún efecto visual).
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
      },
    },
  },
  plugins: [],
};
export default config;
