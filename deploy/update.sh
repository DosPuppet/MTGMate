#!/usr/bin/env bash
# Mise à jour de Planecircle sur le serveur : sauvegarde des parties en cours, code, dépendances, builds, vérification des
# parties sauvegardées avec le nouveau moteur, redémarrage. Retour arrière : docs/deploiement.md, « Revenir en arrière ».
set -euo pipefail
cd "$(dirname "$0")/.."
DATA="${MTGX_DATA_DIR:-data/rooms}"

# 1. Sauvegarde des parties en cours (les 10 dernières gardées dans data/backups).
if [ -d "$DATA" ]; then
  mkdir -p data/backups
  backup="data/backups/rooms-$(date +%Y%m%d-%H%M%S)-$(git rev-parse --short HEAD).tgz"
  tar -czf "$backup" -C "$(dirname "$DATA")" "$(basename "$DATA")"
  chmod 600 "$backup"
  ls -1t data/backups/rooms-*.tgz | tail -n +11 | xargs -r rm -f
  echo "Parties sauvegardées : $backup"
fi

# 2. Code, dépendances, interface et serveur compilé.
git pull --ff-only
npm ci
npm run build
npm run build:server

# 3. Parties en cours rejouées avec le nouveau moteur (sur une copie) : combien seront interrompues.
npx tsx tools/rooms-check.ts "$DATA" || echo "Attention : des parties en cours seront interrompues (voir ci-dessus)."

# 4. Redémarrage (le processus « mtgmate », nom d'avant le 05/10/2026, est remplacé par « planecircle »).
if pm2 describe mtgmate >/dev/null 2>&1; then
  pm2 delete mtgmate
  pm2 start deploy/ecosystem.config.cjs
else
  pm2 restart planecircle --update-env
fi
pm2 save
# Le serveur met quelques secondes à démarrer (chargement des cartes, reprise des salons) : on attend qu'il réponde.
for _ in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:${PORT:-8787}/healthz" >/dev/null 2>&1; then
    echo "Planecircle mis à jour :"
    curl -fsS "http://127.0.0.1:${PORT:-8787}/healthz"
    exit 0
  fi
  sleep 1
done
echo "Planecircle ne répond pas après 30 s : voir pm2 logs planecircle" >&2
exit 1
