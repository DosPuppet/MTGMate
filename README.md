# MTGX — MTG Mate

Plateforme pour jouer à Magic: The Gathering contre une ou plusieurs IA (en duel ou en multijoueur), et bientôt contre d'autres joueurs. Elle repose sur un **moteur de règles maison en TypeScript** et une interface 2D pensée pour être aussi fluide que MTG Arena :

- passage automatique de la priorité ;
- paiement automatique du mana ;
- arrêts configurables ;
- cible choisie automatiquement quand elle est unique ;
- glisser-déposer ;
- IA à trois niveaux au choix (débutant, moyen, élevé), du jeu heuristique à la recherche ISMCTS en duel (voir docs/ia.md) ;
- exil consultable : bouton à côté du cimetière, et cartes exilées par un permanent affichées sous lui (survol pour les voir) ;
- jouable sur tablette et sur téléphone en paysage (voir « Tablette et téléphone ») ;
- images des cartes relayées par le serveur quand le réseau du joueur bloque Scryfall (voir « Images bloquées par le réseau »).

Dernière extension ajoutée : **The Lost Caverns of Ixalan (LCI)**, entièrement gérée (279 / 279), avec la Découverte, la Descente (4, 8, descente profonde, « si vous êtes descendu ce tour-ci »), la Fabrication, les Cavernes, l'exploration, les dieux et leurs Temples, et le rebond (Ojer Pakpatiq).

## Périmètre : le Standard

Le périmètre visé avant toute extension est le **format Standard** : construit, 60 cartes minimum, 4 exemplaires maximum (sauf terrains de base et cartes « n'importe quel nombre »), réserve de 15 cartes.

Les cartes sont couvertes **extension par extension, à 100 % avant de passer à la suivante**. Toutes les extensions Standard sont importées (textes, légalités, faces), mais une carte n'est jouable que lorsqu'elle est gérée par le moteur. Les autres apparaissent grisées dans le deckbuilder, avec la mention « bientôt » (un filtre n'affiche que les cartes jouables).

**Extensions légales en Standard au 25/09/2026** (source : Scryfall, à revérifier à chaque rotation) :

| Extension | Cartes gérées |
|---|---|
| **Foundations (FDN)** | ✅ 517 / 517 |
| **Reality Fracture (FRA, « Réalité fracturée »)** | ✅ 279 / 279 |
| **Edge of Eternities (EOE)** | ✅ 260 / 260 |
| **Aetherdrift (DFT)** | ✅ 260 / 260 |
| **Outlaws of Thunder Junction (OTJ) et The Big Score (BIG)** | ✅ 269 / 269 et 30 / 30 |
| **Final Fantasy (FIN)** | ✅ 307 / 307 |
| **Duskmourn: House of Horror (DSK, « Mornebrune : la Maison de l'horreur »)** | ✅ 268 / 268 |
| **Bloomburrow (BLB)** | ✅ 266 / 266 |
| **The Lost Caverns of Ixalan (LCI, « Les cavernes oubliées d'Ixalan »)** | ✅ 279 / 279 |
| Tarkir: Dragonstorm (TDM), Wilds of Eldraine (WOE), Secrets of Strixhaven (SOS), Lorwyn Eclipsed (ECL), Avatar: The Last Airbender (TLA), Marvel's Spider-Man (SPM), Marvel Super Heroes (MSH), Teenage Mutant Ninja Turtles (TMT), The Hobbit (HOB), Murders at Karlov Manor (MKM) | à venir (seules quelques créatures à mots-clés sont déjà jouables) |

Au total, **environ 2 750 cartes jouables** sur 5 161 cartes légales en Standard. Quelques réimpressions d'extensions plus anciennes sont aussi légales parce qu'elles figurent dans ces sets.

**Cartes bannies en Standard** (13) :

- Abuelo's Awakening
- Badgermole Cub
- Cori-Steel Cutter
- Gran-Gran
- Heartfire Hero
- Hopeless Nightmare
- Monstrous Rage
- Proft's Eidetic Memory
- Screaming Nemesis
- Stormchaser's Talent
- This Town Ain't Big Enough
- Up the Beanstalk
- Vivi Ornitier

**Hors périmètre pour l'instant :** Commander, Limité (scellé, draft), formats éternels, cartes numériques d'Alchemy. L'architecture reste prête pour N joueurs.

## Démarrer

```bash
npm install
npm run dev          # http://localhost:5173
```

### Jouer en ligne contre un joueur (duel Standard)

- **En développement :** `npm run server` (serveur de parties, port 8787) et `npm run dev`. Ouvrez deux onglets, puis « Contre un joueur » : l'un crée la partie, l'autre la rejoint avec le code ou le lien.
- **En réseau local :** `npm run build` puis `npm run server`. Le serveur sert aussi l'interface : votre adversaire ouvre l'adresse « réseau » affichée (`http://<ip>:8787`).
- **Sur un serveur (Internet, HTTPS) :** Node + pm2 derrière nginx, avec un sous-domaine. La notice pas à pas est dans [docs/deploiement.md](docs/deploiement.md) ; les fichiers sont dans `deploy/` (configuration pm2, site nginx, script de mise à jour).
- **Règles du salon :**
  - 60 s par décision, avec une corde affichée pendant les 20 dernières ;
  - à l'expiration, une décision par défaut est jouée ; 3 expirations valent une défaite ;
  - après une déconnexion, 60 s pour revenir (en rechargeant la page), sinon défaite ;
  - revanche possible dans le même salon.
- **Variables d'environnement :** `PORT`, `HOST` (`127.0.0.1` derrière nginx), `MTGX_DECISION_MS`, `MTGX_GRACE_MS`, `MTGX_MAX_ROOMS`. `/healthz` indique l'état du serveur.

### Tablette et téléphone

L'interface s'adapte à l'écran : tablette en paysage ou en portrait, téléphone en paysage. En portrait, un téléphone affiche « Tournez votre appareil ».

- **La main** se resserre pour toujours tenir dans la largeur de l'écran. Sur téléphone, elle dépasse sous l'écran, comme sur MTG Arena.
- **Au doigt :**
  - un premier tap lève une carte de la main et l'agrandit, un second la joue ; on peut aussi la glisser vers le champ de bataille ;
  - un appui long sur n'importe quelle carte l'affiche en grand, et un tap la referme.
- **Écran étroit** (moins de 1100 px, par exemple une tablette en portrait) : les réglages et le journal passent dans un tiroir ouvert par le bouton ☰.
- **Essai sur un vrai appareil :** `npm run dev -- --host`, puis ouvrez l'adresse « Network » affichée depuis la tablette (même réseau Wi-Fi).

### Images bloquées par le réseau

Les images des cartes viennent de Scryfall (`cards.scryfall.io`). Certains réseaux (entreprise, école) le bloquent, et les cartes s'affichent alors en cadre texte. Le serveur MTG Mate peut relayer les images par `/scry/…` :

- **Automatique :** au démarrage, si Scryfall ne répond pas et que le serveur répond, le relais s'active tout seul.
- **À la main :** la case **« Images par le serveur MTG Mate »**, sur l'accueil (en haut à droite) ou dans les réglages de la partie. Cochez-la si les cartes ne s'affichent pas. Le choix est mémorisé.
- **Serveur :** seules les images de cartes sont relayées (liste blanche) ; ce n'est pas un proxy ouvert. Derrière nginx, les images sont mises en cache (voir [docs/deploiement.md](docs/deploiement.md)). En dev, Vite relaie `/scry` directement.
- Si Scryfall est accessible, les images viennent de Scryfall en direct, et le serveur n'est pas sollicité.

## Commandes

| Commande | Rôle |
|---|---|
| `npm run verify -- --set <EXT>` | Vérification d'un lot, parallélisée (~70 s) : types, Biome, couverture, tous les tests, fuzz ciblé sur l'extension à 2, 3 et 4 joueurs ; tests d'interface si le client a changé |
| `npm run verify -- --full` | Vérification complète (~3 min) : fuzz sur tout le pool, bench et tests d'interface. Durée de chaque étape affichée, journaux dans `test-results/verify/` |
| `npm run verify -- --ci` | Vérification de l'intégration continue (GitHub Actions, à chaque push) : types, Biome, couverture, tests et fuzz courts sur tout le pool, sans interface ni bench |
| `npm test` | Tests de règles, d'IA, et test de fumée de chaque carte gérée (Vitest, un fichier par extension) |
| `npm run fuzz -- --games 300 [--pool decks\|all\|<EXT>] [--players 4] [--ai random\|heuristic\|mixed\|beginner\|medium\|expert\|levels] [--seed N] [--jobs 10]` | Parties IA contre IA, invariants vérifiés à chaque décision. `--pool FIN` : decks tirés surtout de cette extension. `--jobs` : parties réparties sur plusieurs processus, mêmes résultats à graine égale |
| `npm run bench` | Décisions par seconde du moteur et temps de décision de l'IA (cibles : ≥ 5 000 déc/s, IA moyenne < 50 ms, IA élevée < 150 ms ; à mesurer sur secteur) |
| `npm run arena -- --a expert --b medium [--games 600] [--jobs 11] [--budget 100] [--pool decks\|all\|mix]` | Tournoi d'IA en duel (places et decks alternés) : taux de victoire avec intervalle à 95 %, temps de décision ; `expert:0` = élevé sans ISMCTS |
| `npm run ai-smoke` | Niveau de l'IA : sélecteur de l'accueil, latence de l'IA élevée en temps réel, processeur normal et ralenti ×4 (serveur de dev lancé) |
| `npm run tutorial-smoke [-- --only 2,3] [-- --debug]` | Tutoriel suivi dans le navigateur comme un joueur, refus hors guide, reprise (serveur de dev lancé) |
| `npm run coverage [-- --set all\|standard\|<EXT>] [-- --text [--color W]] [-- --card "<nom>"]` | Cartes gérées par extension, textes Oracle des cartes restantes, texte et script d'une carte |
| `npm run server` | Serveur de parties en ligne (WebSocket `/ws`, sert aussi `packages/client/dist`) |
| `npm run online-smoke [-- --base <url>]` | Duel en ligne entre deux navigateurs : salon, lien d'invitation, corde, reprise après rechargement, revanche (serveur de dev par défaut, ou `--base` vers un serveur de production ou nginx) |
| `npm run proxy-smoke` | Relais des images : Scryfall bloqué (bascule automatique sur `/scry/`), case « Images par le serveur MTG Mate » (serveur de dev lancé) |
| `npm run mobile-smoke` | Tablette et téléphone émulés : main, bouton principal et champs à l'écran, appui long, tap pour lever une carte, tiroir, portrait (serveur de dev lancé) |
| `npm run battlefield-smoke` | Plateaux chargés (jetons, 2e ligne, 4 joueurs) mis en jeu par le bac à sable du mode dev : rangées, piles de jetons, aucune carte rognée (serveur de dev lancé) |
| `npm run import-cards -- <set>\|all` | Import Scryfall d'une extension, ou de toutes les extensions Standard hors FDN et FRA (`all`) |
| `npm run deck-smoke` | Deckbuilder de bout en bout : import, édition, export, persistance, partie (serveur de dev lancé) |
| `npm run ui-smoke -- <dossier> [actions]` | Joue une partie dans Chromium via l'interface et prend des captures (serveur de dev lancé) |
| `npm run typecheck` / `npm run lint` | TypeScript strict / Biome |

## Architecture

```
packages/
  engine/   moteur pur et déterministe : état JSON, décisions, règles, autopilot, vue filtrée, GameHost
            src/model/ (types), src/ops/ (traitements des effets par domaine) ; guide : docs/moteur.md
  cards/    données Scryfall (data/<set>.json, 20 extensions), scripts des cartes (src/<ext>/*.ts), lecture du texte
            Scryfall (src/scryfall.ts), decklists, decks préconstruits (decks/*.json : 5 decks de bienvenue FDN, Starter Kit FIN)
  ai/       IA à trois niveaux (heuristique paramétrée, combat par simulation, ISMCTS), IA aléatoire (fuzz),
            adversaire scripté (tutoriel) ; guide : docs/ia.md
  server/   jeu en ligne : salons, GameHost côté serveur (fait autorité), minuteur, reconnexion ; protocole partagé ;
            relais des images de Scryfall (/scry/)
  client/   React + Vite + Zustand + Motion ; la partie tourne dans un Web Worker ; deckbuilder ; disposition du plateau façon MTGA (board/layout.ts) ;
            effets sonores (audio/) ; gestes tactiles (touch.ts) ; relais des images (images.ts)
tools/      import Scryfall, vérification, fuzz, bench, couverture, tests d'interface
docs/       guide du moteur, approximations connues, détail des extensions, déploiement
```

- **`submit(state, joueur, décision) → { state, events }`** : le moteur avance tout seul jusqu'à la prochaine décision. Il donne ensuite la liste exhaustive des options légales (`legalActions`), dont se servent l'interface, l'IA et l'autopilot.
- **Autopilot** (`engine/src/autopilot.ts`) : il répond aux décisions triviales. Le moteur, lui, reste strict. Le mode « contrôle total » désactive l'autopilot, sauf « Fin du tour », qui reste une demande explicite.
- **Effets de cartes** : ce sont des données sérialisables (`engine/src/dsl.ts`), jamais du code stocké dans l'état.
- **Règle 400.7** : un objet qui change de zone reçoit un nouvel identifiant (`id`). L'identifiant `uid`, lui, suit la carte physique pour les animations.
- **N joueurs** : priorité en tour de table, ordre APNAP, un défenseur par attaquant (joueur ou planeswalker), élimination d'un joueur (800.4a).
- **Choix génériques** (`choices.ts`) : toute question passe par une `ChoiceRequest` (choisir, ordonner, oui/non, nombre, répartir) avec une réponse suggérée. Une résolution peut être suspendue sur un choix puis reprise ; les valeurs intermédiaires (« si vous le faites ») sont mémorisées dans la résolution.
- **Capacités déclenchées** (`triggers.ts`) :
  - détectées au moment de l'événement, avec regard en arrière pour les morts simultanées ;
  - mises sur la pile en APNAP ;
  - les conditions « si… » sont revérifiées à la résolution ;
  - sont aussi gérées : les capacités modales, « une fois par tour », les capacités retardées et réflexives, et les emblèmes.
- **Couches** (`layers.ts`) :
  - caractéristiques calculées couche par couche (4 à 7) : types, couleurs, capacités accordées ou perdues, F/E ;
  - capacités statiques, y compris sur « la créature équipée ou enchantée » ;
  - résultat mis en cache par version d'état ; le fuzz vérifie le cache.
- **Pile** : sorts et capacités ciblables, contresorts, garde (ward), « ne peut pas être contrecarré ».
- **Attachements** : Auras (ciblées au lancement), Équipements (« Équiper » lu dans le texte), actions basées sur l'état 704.5m–n.
- **Planeswalkers** : loyauté, capacités de loyauté (une par tour), attaque des planeswalkers, emblèmes.
- **Remplacements et prévention** (`replacement.ts`) et **coûts** (`mana.ts`, `stack.ts`) :
  - remplacements : exil à la place de mourir, arrivée engagée ou avec marqueurs (y compris imposée par un autre permanent), prévention ;
  - coûts : hybride, coûts additionnels, flashback, réductions, sacrifice ou marqueurs comme coût, activation depuis le cimetière.
- **Cartes à plusieurs faces** : aventures et présages, recto-verso (transformation, faces modales, Sagas au verso), cartes scindées et Salles, assemblage ; Sagas, Classes et Affaires ; cartes face cachée (déguisement, cape, manifestation), invisibles pour l'adversaire.
- **Mécaniques d'extensions** : entre autres, préparé (FRA), distorsion et station (EOE), vitesse, exhaust et Véhicules (DFT), plot, spree et crimes (OTJ), job select et tiered (FIN), Salles, manifestation effroyable, Sinistre, Survie, Délire et Imminence (DSK), Progéniture, Cadeau, Fourrager, Dépense, Vaillance et Saisons (BLB). Le détail par extension est dans `docs/extensions/`.
- **Performance** : `submit` copie l'état puis le mute (pas d'Immer) ; les simulations de l'IA utilisent `applyMutable` sur une copie de travail.

## Ajouter une carte

Les caractéristiques d'une carte (coût, types, F/E, mots-clés, loyauté, garde, « Équiper », cycle, chapitres de Saga…) viennent de Scryfall. Une créature « vanilla » ou « french vanilla » fonctionne donc sans script. Sinon, on décrit son comportement dans `packages/cards/src/<ext>/*.ts` :

```ts
"Burst Lightning": { kicker: "{4}", spell: spell([target.any()], [fx.damage(amount.kicked(4, 2), ref.target())]) },
```

Chaque carte gérée est automatiquement jouée par le test de fumée (`packages/ai/test/smoke/`, un fichier par extension). Les mécaniques nouvelles ont en plus un test de règles (`packages/engine/test/<ext>.test.ts`). Pour une mécanique qui manque au moteur, `docs/moteur.md` indique où toucher.

**Ajouter une extension :**
1. `npm run coverage -- --set <EXT> --text` donne les textes des cartes restantes.
2. Écrire les scripts par lots (A : cartes simples ; B : mécaniques phares ; C et suivants : cartes uniques), avec `npm run verify -- --set <EXT>` puis un commit par lot.
3. Terminer par `npm run verify -- --full`.

## État

| Étape | Contenu | État |
|---|---|---|
| 1. Fondations | monorepo, TS strict, Biome, Vitest, import Scryfall FDN | ✅ |
| 2. Noyau du moteur | tours et phases, priorité et pile, mana, combat et mots-clés, actions basées sur l'état, mulligan de Londres, X, kicker, sorts modaux, capacités activées, jetons | ✅ |
| 3. Client contre l'IA | plateau façon MTGA (créatures devant ; terrains, puis artefacts, puis enchantements derrière ; zone des planeswalkers à part, tout à droite ; attachements et cartes exilées sur leur hôte ; exil consultable ; piles de jetons « ×N » ; lignes multiples et taille des cartes adaptées à la place), main en éventail, glisser-déposer, flèches, barre des phases et arrêts, autopilot, journal FR | ✅ |
| 4a. Fondations du moteur | N joueurs, choix génériques, déclencheurs, couches, remplacements, coûts, performance | ✅ |
| 4b. Deckbuilder | collection filtrable, deck et réserve, validation 60/4/15, import et export de decklists (MTGA, MTGO, noms FR), persistance | ✅ |
| 4c. FDN, set principal (n° 1 à 281) | lots A (longue traîne) à F (mécaniques uniques : permissions de lancement, doublements, protection, choix en arrivant, mana restreint, copie de sorts…) | ✅ **276 / 276** |
| 4d. FDN, réimpressions (n° 282 et plus) | cartes des decks d'initiation et de la Starter Collection | ✅ **241 / 241** (517 / 517 pour tout FDN) |
| 4e. Légalité Standard | légalités Scryfall importées, liste des bannies, validation du format dans le deckbuilder | ✅ |
| 4f. Cartes à plusieurs faces | aventures, recto-verso, cartes scindées et Salles, Sagas, Classes, Affaires, face cachée, assemblage | ✅ |
| 4g. Autres extensions Standard | une extension à la fois : Reality Fracture ✅, Edge of Eternities ✅, Aetherdrift ✅, Outlaws of Thunder Junction + The Big Score ✅, Final Fantasy ✅, Duskmourn ✅, Bloomburrow ✅, The Lost Caverns of Ixalan ✅ ; les suivantes à la demande | en cours |
| 5. IA | trois niveaux au choix (débutant, moyen, élevé) ; évaluation sur les caractéristiques durables ; attaques et blocages par simulation ; ISMCTS en duel (déterminisation de l'information cachée), budget en temps ; tournoi d'IA (`npm run arena`) ; guide : docs/ia.md | ✅ |
| 6. JcJ en ligne | duel Standard : serveur Node `ws` (`GameHost`, vues et faces filtrées), code de salon, corde, reconnexion, revanche | ✅ duel ; déploiement pm2 + nginx documenté |
| 7. Finitions | effets sonores ✅ ; tablette et téléphone ✅ ; relais des images Scryfall ✅ ; replays (graine + décisions), images des jetons, musique | en cours |

Le suivi (avancement, conventions, pièges) est dans [CLAUDE.md](CLAUDE.md). Les approximations connues sont dans [docs/approximations.md](docs/approximations.md), et le détail de chaque extension dans [docs/extensions/](docs/extensions/).

## Cadre légal

Projet de fan gratuit et non commercial ([Fan Content Policy](https://company.wizards.com/fancontentpolicy) de Wizards of the Coast). Les images restent hébergées par Scryfall et ne sont pas copiées dans le dépôt. Le relais du serveur les transmet telles quelles, sans les stocker ailleurs que dans le cache de nginx. Les effets sonores sont des packs de [Kenney](https://www.kenney.nl) sous licence CC0 (`packages/client/public/sounds/LICENSE-kenney.txt`).
