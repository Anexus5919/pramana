import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Worktrees and parallel servers point the dev proxy at their own backend
const api = process.env.PRAMANA_API_URL ?? "http://127.0.0.1:8000";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: Number(process.env.PRAMANA_VITE_PORT ?? 5173),
    proxy: {
      "/api": { target: api, changeOrigin: false },
    },
  },
  preview: {
    proxy: {
      "/api": { target: api, changeOrigin: false },
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: false,
    chunkSizeWarningLimit: 800,
  },
});
