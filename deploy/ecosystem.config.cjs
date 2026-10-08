/**
 * pm2 configuration of the Planecircle server (see docs/deployment.md).
 *   pm2 start deploy/ecosystem.config.cjs && pm2 save
 * The server listens locally only: nginx publishes it over HTTPS.
 */
const path = require("node:path");

module.exports = {
  apps: [
    {
      name: "planecircle",
      cwd: path.join(__dirname, ".."),
      // Server compiled by "npm run build:server" (a single file: engine, cards and ws included; neither tsx nor
      // node_modules at run time).
      script: "packages/server/dist/main.mjs",
      interpreter: "node",
      // Young generation of the heap capped: under load, V8 otherwise keeps hundreds of MB unused (tools/load-test.ts).
      interpreter_args: "--max-semi-space-size=8 --max-old-space-size=512",
      env: {
        NODE_ENV: "production",
        PORT: 8787,
        HOST: "127.0.0.1",
        // Optional:
        // MTGX_DECISION_MS: 60000, // time per decision
        // MTGX_GRACE_MS: 60000,    // time allowed to come back after a disconnection
        // MTGX_MAX_ROOMS: 200,     // most rooms open at once
        // MTGX_MAX_HEAP_MB: 384,   // heap beyond which no room is created (before max_memory_restart)
        // MTGX_AI_WORKERS: 2,      // workers of the online AI seats (0: no online AI)
        // MTGX_MAX_AI_ROOMS: 12,   // most rooms with AI open at once (about 20 MB of RSS each)
        // MTGX_MAX_RSS_MB: 640,    // RSS (workers included) beyond which no room with AI is created
      },
      autorestart: true,
      // At rest: about 210 MB of RSS. A room takes 0.2 to 0.3 MB of heap; the server refuses new rooms beyond
      // MTGX_MAX_HEAP_MB, well before this limit (otherwise pm2 would restart the server in a loop).
      max_memory_restart: "768M",
      time: true,
    },
  ],
};
