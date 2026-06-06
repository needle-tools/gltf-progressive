import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: __dirname,
  publicDir: path.join(__dirname, "public"),
  resolve: {
    alias: {
      three: path.resolve(__dirname, "../../node_modules/@needle-tools/engine/node_modules/three"),
      "@needle-tools/gltf-progressive": path.resolve(__dirname, "../../src/index.ts"),
    },
  },
  server: {
    port: 5179,
    fs: {
      allow: [path.resolve(__dirname, "../.."), __dirname],
    },
  },
  build: {
    outDir: path.resolve(__dirname, "../../dist/sidecar"),
    emptyOutDir: true,
    chunkSizeWarningLimit: 1800,
  },
});
