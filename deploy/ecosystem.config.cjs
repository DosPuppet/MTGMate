/**
 * Configuration pm2 du serveur Planecircle (voir docs/deploiement.md).
 *   pm2 start deploy/ecosystem.config.cjs && pm2 save
 * Le serveur écoute seulement en local : c'est nginx qui le publie en HTTPS.
 */
const path = require("node:path");

module.exports = {
  apps: [
    {
      name: "planecircle",
      cwd: path.join(__dirname, ".."),
      // Serveur compilé par « npm run build:server » (un seul fichier : moteur, cartes et ws compris ; ni tsx ni
      // node_modules à l'exécution).
      script: "packages/server/dist/main.mjs",
      interpreter: "node",
      // Jeune génération du tas plafonnée : sous charge, V8 garde sinon des centaines de Mo inutilisés (tools/load-test.ts).
      interpreter_args: "--max-semi-space-size=8 --max-old-space-size=512",
      env: {
        NODE_ENV: "production",
        PORT: 8787,
        HOST: "127.0.0.1",
        // Facultatif :
        // MTGX_DECISION_MS: 60000, // temps par décision
        // MTGX_GRACE_MS: 60000,    // délai de retour après une déconnexion
        // MTGX_MAX_ROOMS: 200,     // salons ouverts au plus
        // MTGX_MAX_HEAP_MB: 384,   // tas au-delà duquel aucun salon n'est créé (avant max_memory_restart)
      },
      autorestart: true,
      // Au repos : environ 210 Mo de RSS. Un salon occupe 0,2 à 0,3 Mo de tas ; le serveur refuse de nouveaux salons
      // au-delà de MTGX_MAX_HEAP_MB, bien avant cette limite (sinon pm2 redémarrerait le serveur en boucle).
      max_memory_restart: "768M",
      time: true,
    },
  ],
};
