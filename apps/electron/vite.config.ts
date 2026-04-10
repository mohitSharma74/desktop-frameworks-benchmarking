import { resolve } from "node:path";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    fs: {
      allow: [resolve(__dirname, "../..")]
    }
  },
  build: {
    outDir: "dist",
    emptyOutDir: true
  },
  resolve: {
    dedupe: ["react", "react-dom"]
  }
});

