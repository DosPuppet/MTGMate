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
# Le serveur met quelques secondes à démarrer (chargement des cartes, reprise des salons) : on attend qu'il réponde.
for _ in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:${PORT:-8787}/healthz" >/dev/null 2>&1; then
    echo "MTG Mate mis à jour :"
    curl -fsS "http://127.0.0.1:${PORT:-8787}/healthz"
    exit 0
  fi
  sleep 1
done
echo "MTG Mate ne répond pas après 30 s : voir pm2 logs mtgmate" >&2
exit 1
