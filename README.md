# MTGX — MTG Mate

Plateforme pour jouer à Magic: The Gathering contre une ou plusieurs IA (en duel ou en multijoueur), et bientôt contre d'autres joueurs. Elle repose sur un **moteur de règles maison en TypeScript** et une interface 2D pensée pour être aussi fluide que MTG Arena :

- passage automatique de la priorité ;
- paiement automatique du mana ;
- arrêts configurables ;
- cible choisie automatiquement quand elle est unique ;
- glisser-déposer.

## Périmètre : le Standard

Le périmètre visé avant toute extension est le **format Standard** : construit, 60 cartes minimum, 4 exemplaires maximum (sauf terrains de base et cartes « n'importe quel nombre »), réserve de 15 cartes.

Les cartes sont couvertes extension par extension : **Foundations (FDN)**, complète, puis **Reality Fracture (FRA, « Réalité fracturée »)**, en cours. D'après Scryfall au 25/09/2026, les 517 cartes de FDN sont toutes légales en Standard (aucune bannie) : tout le set est dans le périmètre.

**Extensions légales en Standard au 25/09/2026** (source : Scryfall, à revérifier à chaque rotation) :

- Wilds of Eldraine (WOE)
- The Lost Caverns of Ixalan (LCI)
- Murders at Karlov Manor (MKM)
- Outlaws of Thunder Junction (OTJ) et The Big Score (BIG)
- Bloomburrow (BLB)
- Duskmourn (DSK)
- **Foundations (FDN)**
- Aetherdrift (DFT)
- Tarkir: Dragonstorm (TDM)
- Final Fantasy (FIN)
- Edge of Eternities (EOE)
- Marvel's Spider-Man (SPM)
- Avatar: The Last Airbender (TLA)
- Lorwyn Eclipsed (ECL)
- Teenage Mutant Ninja Turtles (TMT)
- Secrets of Strixhaven (SOS)
- Marvel Super Heroes (MSH)
- The Hobbit (HOB)

Soit environ 4 900 cartes uniques. Quelques réimpressions d'extensions plus anciennes sont aussi légales parce qu'elles figurent dans ces sets.

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

## Commandes

| Commande | Rôle |
|---|---|
| `npm test` | Tests de règles, d'IA et test de fumée de chaque carte gérée (Vitest) |
| `npm run fuzz -- --games 300 [--ai random\|heuristic\|mixed] [--players 4] [--pool all] [--seed N]` | Parties IA contre IA, invariants vérifiés à chaque décision (`--pool all` : decks aléatoires tirés de toutes les cartes gérées) |
| `npm run bench` | Décisions par seconde du moteur et temps de décision de l'IA (cibles : ≥ 5 000 déc/s, IA < 50 ms) |
| `npm run coverage [-- --set main\|fdn\|fra] [-- --missing] [-- --card "<nom>"]` | Cartes gérées, mécaniques manquantes, texte Oracle et script d'une carte |
| `npm run server` | Serveur de parties en ligne (WebSocket `/ws`, sert aussi `packages/client/dist`) |
| `npm run online-smoke [-- --base <url>]` | Duel en ligne entre deux navigateurs : salon, lien d'invitation, corde, reprise après rechargement, revanche (serveur de dev par défaut, ou `--base` vers un serveur de production ou nginx) |
| `npm run battlefield-smoke` | Plateaux chargés (jetons, 2e ligne, 4 joueurs) mis en jeu par le bac à sable du mode dev : rangées, piles de jetons, aucune carte rognée (serveur de dev lancé) |
| `npm run deck-smoke` | Deckbuilder de bout en bout : import, édition, export, persistance, partie (serveur de dev lancé) |
| `npm run ui-smoke -- <dossier> [actions]` | Joue une partie dans Chromium via l'interface et prend des captures (serveur de dev lancé) |
| `npm run typecheck` / `npm run lint` | TypeScript strict / Biome |
| `npm run import-cards -- fdn` (ou `fra`) | Réimporte un set depuis Scryfall (EN + FR, loyauté et légalité en Standard comprises) |

## Architecture

```
packages/
  engine/   moteur pur et déterministe : état JSON, décisions, règles, autopilot, vue filtrée, GameHost
  cards/    données Scryfall (data/fdn.json), scripts des cartes (src/fdn/<couleur>.ts), decklists, decks (decks/*.json)
  ai/       IA aléatoire (fuzz) et heuristique (simulation sur clones de l'état + évaluation)
  server/   jeu en ligne : salons, GameHost côté serveur (fait autorité), minuteur, reconnexion ; protocole partagé
  client/   React + Vite + Zustand + Motion ; la partie tourne dans un Web Worker ; deckbuilder ; disposition du plateau façon MTGA (board/layout.ts) ; effets sonores (audio/)
tools/      import Scryfall, fuzz, bench, couverture, tests d'interface
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
- **Performance** : `submit` copie l'état puis le mute (pas d'Immer) ; les simulations de l'IA utilisent `applyMutable` sur une copie de travail.

## Ajouter une carte

Les caractéristiques d'une carte (coût, types, F/E, mots-clés, loyauté, garde, « Équiper ») viennent de Scryfall. Une créature « vanilla » ou « french vanilla » fonctionne donc sans script. Sinon, on décrit son comportement dans `packages/cards/src/fdn/<couleur>.ts` :

```ts
"Burst Lightning": { kicker: "{4}", spell: spell([target.any()], [fx.damage(amount.kicked(4, 2), ref.target())]) },
```

Chaque carte gérée est automatiquement jouée par le test de fumée (`packages/ai/test/cards-smoke.test.ts`) ; les mécaniques nouvelles ont en plus un test de règles (`packages/engine/test/fdn.test.ts`).

## État

| Étape | Contenu | État |
|---|---|---|
| 1. Fondations | monorepo, TS strict, Biome, Vitest, import Scryfall FDN | ✅ |
| 2. Noyau du moteur | tours et phases, priorité et pile, mana, combat et mots-clés, actions basées sur l'état, mulligan de Londres, X, kicker, sorts modaux, capacités activées, jetons | ✅ |
| 3. Client contre l'IA | plateau façon MTGA (créatures devant ; terrains, puis artefacts, puis enchantements derrière ; zone des planeswalkers à part, tout à droite ; attachements sur leur hôte ; piles de jetons « ×N » ; lignes multiples et taille des cartes adaptées à la place), main en éventail, glisser-déposer, flèches, barre des phases et arrêts, autopilot, journal FR | ✅ |
| 4a. Fondations du moteur | N joueurs, choix génériques, déclencheurs, couches, remplacements, coûts, performance | ✅ |
| 4b. Deckbuilder | collection filtrable, deck et réserve, validation 60/4/15, import et export de decklists (MTGA, MTGO, noms FR), persistance | ✅ |
| 4c. FDN, set principal (n° 1 à 281) | lots A (longue traîne) à F (mécaniques uniques : permissions de lancement, doublements, protection, choix en arrivant, mana restreint, copie de sorts…) | ✅ **276 / 276** |
| 4d. FDN, réimpressions (n° 282 et plus) | cartes des decks d'initiation et de la Starter Collection | ✅ **241 / 241** (517 / 517 pour tout FDN) |
| 4e. Légalité Standard | légalités Scryfall importées, liste des bannies, validation du format dans le deckbuilder | ✅ |
| 4f. Autres extensions Standard | une extension à la fois ; Reality Fracture d'abord (lots 0 et A : 119/279) | en cours |
| 5. IA | attaques par simulation, puis ISMCTS | à faire |
| 6. JcJ en ligne | duel Standard : serveur Node `ws` (`GameHost`, vues et faces filtrées), code de salon, corde, reconnexion, revanche | ✅ duel ; déploiement pm2 + nginx documenté |
| 7. Finitions | effets sonores ✅ ; replays (graine + décisions), images des jetons, musique | en cours |

Le suivi détaillé (cartes restantes, approximations connues, conventions) est dans [CLAUDE.md](CLAUDE.md).

## Cadre légal

Projet de fan gratuit et non commercial ([Fan Content Policy](https://company.wizards.com/fancontentpolicy) de Wizards of the Coast). Les images restent hébergées par Scryfall et ne sont pas copiées dans le dépôt. Les effets sonores sont des packs de [Kenney](https://www.kenney.nl) sous licence CC0 (`packages/client/public/sounds/LICENSE-kenney.txt`).
