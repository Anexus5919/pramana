import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { buildDefine } from "./build-info";

// Landing page V3 runs as its own app on port 5181 and builds to dist-v3
const frontendDir = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: fileURLToPath(new URL("./v3", import.meta.url)),
  publicDir: false,
  plugins: [react(), tailwindcss()],
  define: buildDefine(),
  server: {
    port: 5181,
    strictPort: true,
    fs: { allow: [frontendDir] },
  },
  preview: {
    port: 5181,
    strictPort: true,
  },
  build: {
    outDir: fileURLToPath(new URL("./dist-v3", import.meta.url)),
    emptyOutDir: true,
    sourcemap: false,
    chunkSizeWarningLimit: 1200,
  },
});
