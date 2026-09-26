/**
 * Configuration pm2 du serveur MTG Mate (voir docs/deploiement.md).
 *   pm2 start deploy/ecosystem.config.cjs && pm2 save
 * Le serveur écoute seulement en local : c'est nginx qui le publie en HTTPS.
 */
const path = require("node:path");

module.exports = {
  apps: [
    {
      name: "mtgmate",
      cwd: path.join(__dirname, ".."),
      // Node exécute directement le TypeScript du serveur grâce à tsx.
      script: "packages/server/src/main.ts",
      interpreter: "node",
      interpreter_args: "--import tsx",
      env: {
        NODE_ENV: "production",
        PORT: 8787,
        HOST: "127.0.0.1",
        // Facultatif :
        // MTGX_DECISION_MS: 60000, // temps par décision
        // MTGX_GRACE_MS: 60000,    // délai de retour après une déconnexion
        // MTGX_MAX_ROOMS: 200,     // salons ouverts au plus
      },
      autorestart: true,
      max_memory_restart: "400M",
      time: true,
    },
  ],
};
