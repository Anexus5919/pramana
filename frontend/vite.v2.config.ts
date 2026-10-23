import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Landing page V2 runs as its own app on port 5180 and builds to dist-v2
const frontendDir = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: fileURLToPath(new URL("./v2", import.meta.url)),
  publicDir: false,
  plugins: [react(), tailwindcss()],
  server: {
    port: 5180,
    strictPort: true,
    fs: { allow: [frontendDir] },
  },
  preview: {
    port: 5180,
    strictPort: true,
  },
  build: {
    outDir: fileURLToPath(new URL("./dist-v2", import.meta.url)),
    emptyOutDir: true,
    sourcemap: false,
  },
});
