import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  worker: { format: "es" },
  server: {
    port: 5173,
    proxy: {
      // Jeu en ligne : le WebSocket /ws est redirigé vers le serveur de parties (npm run server).
      "/ws": { target: "ws://localhost:8787", ws: true },
      // Relais des images de Scryfall (fait par le serveur en production, voir server/src/index.ts).
      "/scry": {
        target: "https://cards.scryfall.io",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/scry/, ""),
      },
    },
  },
});
