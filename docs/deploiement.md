# Installer MTG Mate sur un serveur (pm2 + nginx)

Cette notice installe MTG Mate sur un VPS Linux qui héberge déjà d'autres applications derrière **nginx**. L'appli tourne avec Node, gérée par **pm2**, et n'écoute qu'en local (`127.0.0.1:8787`) ; nginx la publie en HTTPS sur un sous-domaine.

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
  sudo mkdir -p /opt/mtgmate && sudo chown "$USER" /opt/mtgmate
  git clone <url> /opt/mtgmate
  ```

- **Sans dépôt distant** : depuis votre poste,

  ```bash
  git bundle create mtgmate.bundle master
  scp mtgmate.bundle vps:/tmp/
  ```

  puis sur le VPS : `git clone /tmp/mtgmate.bundle /opt/mtgmate`.

## 4. Installer et construire

```bash
cd /opt/mtgmate
npm ci
npm run build          # construit l'interface dans packages/client/dist
```

## 5. Lancer avec pm2

```bash
pm2 start deploy/ecosystem.config.cjs
pm2 save
pm2 startup            # une seule fois par machine : affiche une commande sudo à copier-coller
curl http://127.0.0.1:8787/healthz     # → « ok 0 salon(s) »
```

Commandes utiles : `pm2 status`, `pm2 logs mtgmate`, `pm2 restart mtgmate`, `pm2 stop mtgmate`.

Si le port 8787 est déjà pris sur le VPS, changez `PORT` dans `deploy/ecosystem.config.cjs` **et** dans le site nginx (étape 6), puis `pm2 restart mtgmate --update-env && pm2 save`.

Réglages facultatifs (même fichier, section `env`) : `MTGX_DECISION_MS` (temps par décision, 60 000 ms), `MTGX_GRACE_MS` (délai de retour après une déconnexion, 60 000 ms), `MTGX_MAX_ROOMS` (salons ouverts au plus, 200), `MTGX_DATA_DIR` (sauvegarde des parties en cours, `data/rooms` par défaut, `off` pour la désactiver), `MTGX_MAX_ROOMS_PER_IP` (salons ouverts au plus par adresse de créateur, 4), `MTGX_ORIGINS` (origines admises pour le WebSocket en plus du site lui-même, séparées par des virgules ; inutile en temps normal).

## 6. nginx et HTTPS

```bash
sudo cp deploy/nginx-mtgmate.conf /etc/nginx/sites-available/mtgmate
sudo nano /etc/nginx/sites-available/mtgmate      # remplacer mtg.mondomaine.fr
sudo ln -s ../sites-available/mtgmate /etc/nginx/sites-enabled/
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
- `location /scry/` et `proxy_cache_path` : relais des images (voir « Images pour les joueurs derrière un proxy »). Si `nginx -t` signale que la zone `mtgmate_scry` existe déjà, c'est que le fichier est inclus deux fois.

### Images pour les joueurs derrière un proxy

Les images des cartes viennent de Scryfall (`cards.scryfall.io`). Certains réseaux (entreprise, école) le bloquent. L'appli relaie alors les images par `https://mtg.mondomaine.fr/scry/…`, et nginx les garde en cache (`/var/cache/nginx/mtgmate-scry`, 2 Go au plus).

- **Côté joueur :** rien à faire. Le relais s'active tout seul quand Scryfall ne répond pas. Sinon, le joueur coche « Images par le serveur MTG Mate », sur l'accueil ou dans les réglages de la partie.
- **Côté serveur :** seules les images de cartes sont relayées (liste blanche) ; ce n'est pas un proxy ouvert. Le VPS doit pouvoir joindre `cards.scryfall.io` en HTTPS.
- **Vérification :** lancez deux fois la commande suivante. La première réponse contient `X-Cache: MISS`, la seconde `X-Cache: HIT`.

```bash
curl -sI https://mtg.mondomaine.fr/scry/small/front/8/d/8d8432a7-1c8a-4cfb-947c-ecf9791063eb.jpg | grep -i -E "^HTTP|x-cache"
```

## 7. Vérifier

- `https://mtg.mondomaine.fr/healthz` affiche « ok … » ;
- ouvrez `https://mtg.mondomaine.fr` sur deux machines (ou un navigateur normal et une fenêtre privée), « Contre un joueur », créez une partie d'un côté et rejoignez-la de l'autre avec le lien.

## 8. Mettre à jour

```bash
cd /opt/mtgmate
./deploy/update.sh      # git pull, npm ci, build, pm2 restart
```

**Les parties en cours survivent au redémarrage** : chaque salon est sauvegardé dans `data/rooms/` (un fichier par salon : les sièges, puis une décision par ligne) et repris au démarrage, en rejouant ses décisions. Les joueurs se reconnectent seuls (le navigateur réessaie pendant une minute) et ont le délai de retour habituel (`MTGX_GRACE_MS`).

Chaque décision sauvegardée porte une empreinte de l'état obtenu, vérifiée à la reprise. Une mise à jour qui change le comportement du moteur fait avancer sa version des règles (`RULES_VERSION`) : une partie d'une autre version ne reprend que si toutes ses empreintes concordent. Sinon, elle est interrompue : le fichier devient `.rules<N>`, et le joueur qui revient lit « Partie interrompue par une mise à jour du moteur ». Une empreinte différente à version égale (moteur non déterministe) met le fichier de côté (`.bad`).

## Compression et cache

Le serveur compresse lui-même le code de l'interface (brotli ou gzip) et le met en cache chez le joueur ; nginx n'a rien à configurer pour cela. Un service worker garde l'application sur l'appareil après la première visite : les visites suivantes démarrent immédiatement, même hors ligne pour une partie contre l'IA.

## Dépannage

| Symptôme | Cause probable |
|---|---|
| 502 Bad Gateway | appli arrêtée (`pm2 status`, `pm2 logs mtgmate`) ou port différent entre pm2 et nginx |
| La page s'affiche mais « Contre un joueur » ne se connecte jamais | en-têtes `Upgrade` / `Connection` absents dans `location /ws` |
| Déconnexions régulières après environ une minute | `proxy_read_timeout` trop court dans `location /ws` |
| « Trop de connexions depuis cette adresse » | plus de 8 onglets ouverts depuis la même IP |
| « Serveur complet, réessayez plus tard » | limite `MTGX_MAX_ROOMS` atteinte |
| « Trop de salons ouverts depuis cette adresse » | limite `MTGX_MAX_ROOMS_PER_IP` ; si tous les joueurs semblent avoir la même adresse, vérifier `X-Real-IP` dans le site nginx |
| Jeu en ligne impossible (WebSocket refusé) | page servie depuis une autre adresse que le serveur : ajouter cette origine à `MTGX_ORIGINS` |
| Cartes sans images chez un joueur, « Images par le serveur MTG Mate » cochée | le VPS ne joint pas `cards.scryfall.io` (`curl -I https://cards.scryfall.io` depuis le VPS), ou `location /scry/` absent |
| Certificat refusé par certbot | le DNS ne pointe pas encore vers le VPS, ou le port 80 est fermé |

## Sécurité

- Le serveur n'écoute que sur `127.0.0.1` : il n'est joignable qu'à travers nginx.
- Il fait autorité : decks vérifiés (légaux en Standard et jouables), chaque décision contrôlée par le moteur, aucune information cachée envoyée à l'adversaire.
- Pas de comptes ni de données personnelles : un pseudo par partie, un jeton de reconnexion propre à l'onglet.
- WebSocket accepté seulement depuis le site lui-même (même hôte) ou une origine de `MTGX_ORIGINS` : une page d'un autre site ne peut pas jouer à la place du joueur.
- Plafonds par adresse IP (connexions simultanées, salons ouverts), d'après `X-Real-IP` transmis par nginx.
- Une requête mal formée (URL mal encodée…) répond 400 ou 500 sans arrêter le serveur.
- Relais `/scry/` : liste blanche des chemins d'images de cartes, sans la chaîne de requête.
