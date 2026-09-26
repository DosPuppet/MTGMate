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

Réglages facultatifs (même fichier, section `env`) : `MTGX_DECISION_MS` (temps par décision, 60 000 ms), `MTGX_GRACE_MS` (délai de retour après une déconnexion, 60 000 ms), `MTGX_MAX_ROOMS` (salons ouverts au plus, 200).

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
- `X-Forwarded-For` : le serveur limite les connexions par adresse IP du joueur.

## 7. Vérifier

- `https://mtg.mondomaine.fr/healthz` affiche « ok … » ;
- ouvrez `https://mtg.mondomaine.fr` sur deux machines (ou un navigateur normal et une fenêtre privée), « Contre un joueur », créez une partie d'un côté et rejoignez-la de l'autre avec le lien.

## 8. Mettre à jour

```bash
cd /opt/mtgmate
./deploy/update.sh      # git pull, npm ci, build, pm2 restart
```

**Le redémarrage coupe les parties en cours** (les salons sont gardés en mémoire) : mettez à jour quand personne ne joue.

## Dépannage

| Symptôme | Cause probable |
|---|---|
| 502 Bad Gateway | appli arrêtée (`pm2 status`, `pm2 logs mtgmate`) ou port différent entre pm2 et nginx |
| La page s'affiche mais « Contre un joueur » ne se connecte jamais | en-têtes `Upgrade` / `Connection` absents dans `location /ws` |
| Déconnexions régulières après environ une minute | `proxy_read_timeout` trop court dans `location /ws` |
| « Trop de connexions depuis cette adresse » | plus de 8 onglets ouverts depuis la même IP |
| « Serveur complet, réessayez plus tard » | limite `MTGX_MAX_ROOMS` atteinte |
| Certificat refusé par certbot | le DNS ne pointe pas encore vers le VPS, ou le port 80 est fermé |

## Sécurité

- Le serveur n'écoute que sur `127.0.0.1` : il n'est joignable qu'à travers nginx.
- Il fait autorité : decks vérifiés (légaux en Standard et jouables), chaque décision contrôlée par le moteur, aucune information cachée envoyée à l'adversaire.
- Pas de comptes ni de données personnelles : un pseudo par partie, un jeton de reconnexion propre à l'onglet.
