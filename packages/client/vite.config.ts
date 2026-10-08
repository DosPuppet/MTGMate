import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

/**
 * Illustrations personnelles (tools/custom-art.ts) : /art/ servi depuis `MTGX_ART_DIR` ou data/art/ à la racine du dépôt,
 * comme le fait le serveur de parties en production (hors de Git, hors du build).
 */
function customArt(): Plugin {
  const dir = process.env.MTGX_ART_DIR || fileURLToPath(new URL("../../data/art", import.meta.url));
  return {
    name: "mtgx-custom-art",
    configureServer(server) {
      server.middlewares.use("/art", (req, res, next) => {
        const m = req.url?.match(/^\/([a-z0-9-]+\.(webp|json))$/);
        const file = m?.[1] ? join(dir, m[1]) : "";
        if (!m || !existsSync(file)) {
          if (m) res.statusCode = 404;
          return m ? res.end() : next();
        }
        res.setHeader("Content-Type", m[2] === "json" ? "application/json" : "image/webp");
        res.setHeader("Cache-Control", "no-cache");
        res.end(readFileSync(file));
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), customArt()],
  worker: { format: "es" },
  build: {
    // Les données des cartes (6 Mo, 1 Mo compressées) forment un fichier à part : une mise à jour du code ne force pas à
    // les retélécharger, et elles se chargent en parallèle de l'application.
    chunkSizeWarningLimit: 7000,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            // Cartes des decks Commander (pseudo-ensemble EDH, PLAN-E) : un fichier à part, pour ne pas peser sur le budget
            // des extensions ; à charger à la demande quand elles dépasseront 1 Mo.
            { name: "commander", test: /packages[\\/]cards[\\/]data[\\/]edh\.json/ },
            // La table des impressions (éditeur de deck) reste un fichier à part, chargé à la demande.
            { name: "cartes", test: /packages[\\/]cards[\\/]data[\\/](?!printings|edh\.json)/ },
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
