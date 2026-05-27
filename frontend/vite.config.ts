import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// When deployed to GitHub Pages under jthcreative.github.io/financial-algorithm
// the app is served from /financial-algorithm/. Set VITE_BASE to override
// (e.g., "/" for local preview or a custom domain).
const base = process.env.VITE_BASE ?? "/financial-algorithm/";

export default defineConfig({
  plugins: [react()],
  base,
  server: {
    port: 5173,
  },
});
