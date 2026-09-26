import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  worker: { format: "es" },
  server: {
    port: 5173,
    // Jeu en ligne : le WebSocket /ws est redirigé vers le serveur de parties (npm run server).
    proxy: { "/ws": { target: "ws://localhost:8787", ws: true } },
  },
});
