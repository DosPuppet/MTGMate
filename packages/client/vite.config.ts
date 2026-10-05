import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  worker: { format: "es" },
  build: {
    // Les données des cartes (6 Mo, 1 Mo compressées) forment un fichier à part : une mise à jour du code ne force pas à
    // les retélécharger, et elles se chargent en parallèle de l'application.
    chunkSizeWarningLimit: 7000,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            // La table des impressions (éditeur de deck) reste un fichier à part, chargé à la demande.
            { name: "cartes", test: /packages[\\/]cards[\\/]data[\\/](?!printings)/ },
            { name: "bibliotheques", test: /node_modules/ },
          ],
        },
      },
    },
  },
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
