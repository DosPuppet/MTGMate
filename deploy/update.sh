#!/usr/bin/env bash
# Mise à jour de MTG Mate sur le serveur : code, dépendances, build du client, redémarrage.
# Les parties en cours sont sauvegardées (data/rooms) et reprises au redémarrage : les joueurs se reconnectent seuls.
set -euo pipefail
cd "$(dirname "$0")/.."
git pull --ff-only
npm ci
npm run build
pm2 restart mtgmate --update-env
pm2 save
echo "MTG Mate mis à jour :"
curl -fsS http://127.0.0.1:${PORT:-8787}/healthz
