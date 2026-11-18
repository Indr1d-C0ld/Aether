import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root,
  // AETHER_BASE: il percorso sotto cui il gioco è pubblicato (su Balthasar «/aether/»)
  base: process.env.AETHER_BASE ?? "/",
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: Number(process.env.PORT ?? 5173),
    proxy: { "/ws": { target: `ws://127.0.0.1:${process.env.AETHER_PORT ?? 7077}`, ws: true } },
  },
  build: { outDir: "../dist", emptyOutDir: true },
});
