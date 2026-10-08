# Installer Planecircle sur un serveur (pm2 + nginx)

Cette notice installe Planecircle sur un VPS Linux qui héberge déjà d'autres applications derrière **nginx**. L'appli tourne avec Node, gérée par **pm2**, et n'écoute qu'en local (`127.0.0.1:8787`) ; nginx la publie en HTTPS sur un sous-domaine.

Une fois installée, deux joueurs sur deux machines différentes ouvrent `https://mtg.mondomaine.fr`, choisissent « Contre un joueur » : l'un crée la partie et envoie le lien, l'autre la rejoint.

Dans toute la notice, remplacez `mtg.mondomaine.fr` par votre sous-domaine.

## 1. Nom de domaine

Chez votre registrar, créez un enregistrement **A** `mtg.mondomaine.fr` → adresse IPv4 du VPS (et **AAAA** si le VPS a une IPv6). Vérifiez depuis votre machine :

```bash
dig +short mtg.mondomaine.fr
```

L'appli doit être à la **racine** d'un (sous-)domaine : elle ne fonctionne pas sous un chemin comme `https://mondomaine.fr/mtg/`.

## 2. Node 24 et pm2

```bash
node --version        # v24.x attendu
```

Si Node est absent ou trop ancien (Debian/Ubuntu) :

```bash
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt-get install -y nodejs
```

Puis pm2 (s'il n'est pas déjà là) :

```bash
sudo npm install -g pm2
```

## 3. Récupérer le code

Le dépôt n'a pas de dépôt distant. Deux possibilités :

- **Dépôt privé** (GitHub, GitLab…) : depuis votre poste, `git remote add origin <url> && git push -u origin master`, puis sur le VPS :

  ```bash
  sudo mkdir -p /opt/planecircle && sudo chown "$USER" /opt/planecircle
  git clone <url> /opt/planecircle
  ```

- **Sans dépôt distant** : depuis votre poste,

  ```bash
  git bundle create planecircle.bundle master
  scp planecircle.bundle vps:/tmp/
  ```

  puis sur le VPS : `git clone /tmp/planecircle.bundle /opt/planecircle`.

## 4. Installer et construire

```bash
cd /opt/planecircle
npm ci
npm run build          # construit l'interface dans packages/client/dist
npm run build:server   # compile le serveur dans packages/server/dist/main.mjs (lancé par pm2, sans tsx)
```

## 5. Lancer avec pm2

```bash
pm2 start deploy/ecosystem.config.cjs
pm2 save
pm2 startup            # une seule fois par machine : affiche une commande sudo à copier-coller
curl http://127.0.0.1:8787/healthz     # → {"ok":true,"build":"…","rules":…,"rooms":0,"memory":{…}}
```

Commandes utiles : `pm2 status`, `pm2 logs planecircle`, `pm2 restart planecircle`, `pm2 stop planecircle`.

**Journaux :** pm2 ne les fait pas tourner de lui-même. Une fois par machine :

```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 14
```

**`/healthz` :** une requête locale directe (`curl` sur le VPS, supervision) reçoit le détail en JSON : commit du serveur, version du protocole et des règles, salons, mémoire. À travers nginx, la réponse n'est que « ok ».

Si le port 8787 est déjà pris sur le VPS, changez `PORT` dans `deploy/ecosystem.config.cjs` **et** dans le site nginx (étape 6), puis `pm2 restart planecircle --update-env && pm2 save`.

Réglages facultatifs (même fichier, section `env`) : `MTGX_DECISION_MS` (temps par décision, 60 000 ms), `MTGX_GRACE_MS` (délai de retour après une déconnexion, 60 000 ms), `MTGX_MAX_ROOMS` (salons ouverts au plus, 200), `MTGX_MAX_HEAP_MB` (tas JavaScript au-delà duquel aucun salon n'est plus créé, 384 Mo), `MTGX_DATA_DIR` (sauvegarde des parties en cours, `data/rooms` par défaut, `off` pour la désactiver), `MTGX_MAX_ROOMS_PER_IP` (salons ouverts au plus par adresse de créateur, 4), `MTGX_ORIGINS` (origines admises pour le WebSocket en plus du site lui-même, séparées par des virgules ; inutile en temps normal).

**Sièges IA en ligne (PLAN-E) :** les IA des salons réfléchissent dans des workers (`packages/server/dist/ai-worker.mjs`, construit avec le serveur), jamais dans le fil principal. `MTGX_AI_WORKERS` (workers, 2 au plus par défaut ; `0` : pas d'IA en ligne), `MTGX_MAX_AI_ROOMS` (salons avec IA ouverts au plus, 12), `MTGX_MAX_RSS_MB` (mémoire du processus, workers compris, au-delà de laquelle aucun salon avec IA n'est créé, 640 Mo ; garder `max_memory_restart` de pm2 au-dessus). `/healthz` donne en local l'état des workers (`ai` : workers, occupés, file d'attente, réflexion p50 et p95 en ms). Mesure : `node --expose-gc --import tsx tools/load-test.ts --rooms 10 --ai 3 --workers 2`. Le 06/10/2026 (salons d'un humain et trois IA, 60 décisions humaines chacun) : RSS de 266 Mo au repos à 586 Mo pour 10 salons et 685 Mo pour 20 (environ 20 Mo par salon avec IA, en plus des workers ; à peine moins avec un seul worker : 649 Mo pour 20), tas du fil principal presque stable (0,6 Mo par salon), boucle d'événements p99 de 19 à 20 ms, réflexion de l'IA p95 de 23 à 31 ms. D'où 12 salons avec IA au plus et 640 Mo de RSS, sous les 768 Mo de `max_memory_restart` ; pour en ouvrir plus, relever les deux ensemble si le VPS a la mémoire.

## 6. nginx et HTTPS

```bash
sudo cp deploy/nginx-planecircle.conf /etc/nginx/sites-available/planecircle
sudo nano /etc/nginx/sites-available/planecircle      # remplacer mtg.mondomaine.fr
sudo ln -s ../sites-available/planecircle /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d mtg.mondomaine.fr         # certificat Let's Encrypt + redirection HTTPS
```

Si `nginx -t` signale que `$connection_upgrade` est déjà défini (un autre site l'utilise), supprimez le bloc `map` au début du fichier.

Points importants de ce site (déjà dans le fichier) :

- `location /ws` transmet les en-têtes `Upgrade` et `Connection` : sans eux, le jeu en ligne ne se connecte pas ;
- `proxy_read_timeout 1h` : sinon nginx coupe un WebSocket calme au bout de 60 s ;
- `X-Real-IP` : l'adresse du joueur vue par nginx ; le serveur limite les connexions et les salons par adresse. `X-Forwarded-For` ne suffit pas : son début est fourni par le client ;
- `proxy_cache_key $scheme$host$uri` (dans `/scry/`) : une image par chemin, quelle que soit la chaîne de requête ;
- HSTS : après `certbot`, ajoutez dans le bloc `listen 443` la ligne indiquée en commentaire en tête du fichier. Les autres en-têtes de sécurité (`nosniff`, `X-Frame-Options`, `Referrer-Policy`) viennent du serveur Node ;
- `location /scry/` et `proxy_cache_path` : relais des images (voir « Images pour les joueurs derrière un proxy »). Si `nginx -t` signale que la zone `planecircle_scry` existe déjà, c'est que le fichier est inclus deux fois.

### Images pour les joueurs derrière un proxy

Les images des cartes viennent de Scryfall (`cards.scryfall.io`). Certains réseaux (entreprise, école) le bloquent. L'appli relaie alors les images par `https://mtg.mondomaine.fr/scry/…`, et nginx les garde en cache (`/var/cache/nginx/planecircle-scry`, 2 Go au plus).

- **Côté joueur :** rien à faire. Le relais s'active tout seul quand Scryfall ne répond pas. Sinon, le joueur coche « Images par le serveur Planecircle », sur l'accueil ou dans les réglages de la partie.
- **Côté serveur :** seules les images de cartes sont relayées (liste blanche) ; ce n'est pas un proxy ouvert. Le VPS doit pouvoir joindre `cards.scryfall.io` en HTTPS.
- **Vérification :** lancez deux fois la commande suivante. La première réponse contient `X-Cache: MISS`, la seconde `X-Cache: HIT`.

```bash
curl -sI https://mtg.mondomaine.fr/scry/small/front/8/d/8d8432a7-1c8a-4cfb-947c-ecf9791063eb.jpg | grep -i -E "^HTTP|x-cache"
```

### Illustrations personnelles (facultatif)

Des images locales (proxys, versions alternatives) peuvent remplacer celles de Scryfall pour les cartes, jetons et dos qu'elles nomment. Elles ne sont jamais dans Git.

1. Sur votre machine, préparez-les : `npm run custom-art -- <dossier des images>`. Les fichiers sont nommés d'après le nom anglais de la carte (détail en tête de `tools/custom-art.ts`). Le résultat va dans `data/art/` : des images réduites en WebP (environ 100 Ko chacune) et `manifest.json`.
2. Copiez ce dossier sur le VPS, dans le dossier `data/` de l'appli : `rsync -a data/art/ vps:planecircle/data/art/`. Un autre emplacement se donne par `MTGX_ART_DIR`.
3. Le serveur les sert sur `/art/`, sans redémarrage. Tout joueur du serveur voit alors la case « Illustrations personnelles », cochée par défaut, sur l'accueil et dans les réglages de la partie.

## 7. Vérifier

- `https://mtg.mondomaine.fr/healthz` affiche « ok » ;
- ouvrez `https://mtg.mondomaine.fr` sur deux machines (ou un navigateur normal et une fenêtre privée), « Contre un joueur », créez une partie d'un côté et rejoignez-la de l'autre avec le lien.

## 8. Mettre à jour

```bash
cd /opt/planecircle
./deploy/update.sh
```

Le script :
1. sauvegarde les parties en cours dans `data/backups/rooms-<date>-<commit>.tgz` (les dix dernières sont gardées) ;
2. met à jour le code (`git pull`), les dépendances, l'interface et le serveur compilé ;
3. rejoue une copie des parties en cours avec le nouveau moteur (`tools/rooms-check.ts`) et dit combien seront interrompues : une mise à jour qui change les règles du moteur interrompt les parties dont les empreintes ne concordent plus. Pour la reporter, arrêtez-vous là (Ctrl+C) et relancez-la quand aucune partie n'est en cours (`/healthz`, `rooms`) ;
4. redémarre le serveur et attend que `/healthz` réponde (30 s au plus).

**Installation d'avant le changement de nom (MTG Mate, jusqu'au 05/10/2026) :** le script remplace de lui-même le processus pm2 `mtgmate` par `planecircle`. Le dossier `/opt/mtgmate`, le site nginx `mtgmate` et sa zone de cache `mtgmate_scry` peuvent rester tels quels ; si le dépôt a changé d'adresse : `git remote set-url origin <nouvelle url>` avant la mise à jour.

### Revenir en arrière

Si la nouvelle version pose problème :

```bash
cd /opt/planecircle
git log --oneline -5                       # le commit précédent
git checkout <commit précédent>
npm ci && npm run build && npm run build:server
pm2 stop planecircle
rm -rf data/rooms && tar -xzf data/backups/rooms-<date>-<commit>.tgz -C data   # parties d'avant la mise à jour
pm2 start planecircle && pm2 save
```

Restaurer la sauvegarde n'est utile que si les parties ont été interrompues par la nouvelle version : celles jouées depuis sont perdues. Revenez ensuite sur la branche (`git checkout master`) pour la mise à jour suivante.

**Onglets restés ouverts :** le client envoie sa version (protocole et règles) en créant, rejoignant ou reprenant un salon. Après une mise à jour, un onglet de l'ancienne version reçoit « Une nouvelle version de Planecircle est disponible » et recharge la page ; le jeton de reconnexion est gardé, la partie reprend avec la nouvelle version.

**Les parties en cours survivent au redémarrage** : chaque salon est sauvegardé dans `data/rooms/` (un fichier par salon : les sièges, puis une décision par ligne) et repris au démarrage, en rejouant ses décisions. Les joueurs se reconnectent seuls (le navigateur réessaie pendant une minute) et ont le délai de retour habituel (`MTGX_GRACE_MS`).

Chaque décision sauvegardée porte une empreinte de l'état obtenu, vérifiée à la reprise. Une mise à jour qui change le comportement du moteur fait avancer sa version des règles (`RULES_VERSION`) : une partie d'une autre version ne reprend que si toutes ses empreintes concordent. Sinon, elle est interrompue : le fichier devient `.rules<N>`, et le joueur qui revient lit « Partie interrompue par une mise à jour du moteur » (même après un second redémarrage : `data/rooms/interrupted.json`). Une empreinte différente à version égale (moteur non déterministe) met le fichier de côté (`.bad`). Les fichiers mis de côté sont effacés après sept jours.

Au démarrage, le serveur ne reprend au plus que `MTGX_MAX_ROOMS` salons (les plus récents) : un serveur redémarré faute de mémoire ne doit pas reprendre plus qu'il ne peut tenir.

## Compression et cache

Le serveur compresse lui-même le code de l'interface (brotli ou gzip) et le met en cache chez le joueur ; nginx n'a rien à configurer pour cela. Un service worker garde l'application sur l'appareil après la première visite : les visites suivantes démarrent immédiatement, même hors ligne pour une partie contre l'IA.

## Dépannage

| Symptôme | Cause probable |
|---|---|
| 502 Bad Gateway | appli arrêtée (`pm2 status`, `pm2 logs planecircle`) ou port différent entre pm2 et nginx |
| La page s'affiche mais « Contre un joueur » ne se connecte jamais | en-têtes `Upgrade` / `Connection` absents dans `location /ws` |
| Déconnexions régulières après environ une minute | `proxy_read_timeout` trop court dans `location /ws` |
| « Trop de connexions depuis cette adresse » | plus de 8 onglets ouverts depuis la même IP |
| « Serveur complet, réessayez plus tard » | limite `MTGX_MAX_ROOMS` atteinte, ou tas au-delà de `MTGX_MAX_HEAP_MB` (`/healthz` en local) |
| « Trop de parties contre l'IA en cours sur le serveur » | limite `MTGX_MAX_AI_ROOMS` atteinte, ou RSS au-delà de `MTGX_MAX_RSS_MB` |
| « Trop de salons ouverts depuis cette adresse » | limite `MTGX_MAX_ROOMS_PER_IP` ; si tous les joueurs semblent avoir la même adresse, vérifier `X-Real-IP` dans le site nginx |
| Jeu en ligne impossible (WebSocket refusé) | page servie depuis une autre adresse que le serveur : ajouter cette origine à `MTGX_ORIGINS` |
| Cartes sans images chez un joueur, « Images par le serveur Planecircle » cochée | le VPS ne joint pas `cards.scryfall.io` (`curl -I https://cards.scryfall.io` depuis le VPS), ou `location /scry/` absent |
| Certificat refusé par certbot | le DNS ne pointe pas encore vers le VPS, ou le port 80 est fermé |

## Sécurité

- Le serveur n'écoute que sur `127.0.0.1` : il n'est joignable qu'à travers nginx.
- Il fait autorité : decks vérifiés (légaux en Standard et jouables), chaque décision contrôlée par le moteur, aucune information cachée envoyée à l'adversaire.
- Pas de comptes ni de données personnelles : un pseudo par partie, un jeton de reconnexion gardé dans le navigateur (`localStorage`), pour reprendre la partie si la page est rouverte. Sur le disque, seule son empreinte (SHA-256) est écrite, comme celle de l'adresse du créateur d'un salon ; les fichiers de `data/rooms` ne sont lisibles que par le compte du serveur (600).
- Politique de contenu (CSP) : scripts et worker du site seulement, images du site et de Scryfall, styles de Google Fonts, aucun encadrement par une autre page.
- WebSocket accepté seulement depuis le site lui-même (même hôte) ou une origine de `MTGX_ORIGINS` : une page d'un autre site ne peut pas jouer à la place du joueur.
- Plafonds par adresse IP (connexions simultanées, salons ouverts, reprises comprises), d'après `X-Real-IP` transmis par nginx ; en IPv6, par préfixe /64 (un abonné en reçoit souvent un entier).
- Une requête mal formée (URL mal encodée…) répond 400 ou 500 sans arrêter le serveur.
- Relais `/scry/` : liste blanche des chemins d'images de cartes, sans la chaîne de requête.
