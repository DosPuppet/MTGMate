# MTGX

Plateforme pour jouer à Magic: The Gathering contre une ou plusieurs IA (en duel ou en multijoueur), et bientôt contre d'autres joueurs. Elle repose sur un **moteur de règles maison en TypeScript** et une interface 2D pensée pour être aussi fluide que MTG Arena :

- passage automatique de la priorité ;
- paiement automatique du mana ;
- arrêts configurables ;
- cible choisie automatiquement quand elle est unique ;
- glisser-déposer.

## Démarrer

```bash
npm install
npm run dev          # http://localhost:5173
```

## Commandes

| Commande | Rôle |
|---|---|
| `npm test` | Tests de règles, d'IA et test de fumée de chaque carte du set principal (Vitest) |
| `npm run fuzz -- --games 300 [--ai random\|heuristic\|mixed] [--players 4] [--pool all]` | Parties IA contre IA, invariants vérifiés à chaque décision (`--pool all` : decks aléatoires tirés de toutes les cartes gérées) |
| `npm run bench` | Décisions par seconde du moteur et temps de décision de l'IA (cibles : ≥ 5 000 déc/s, IA < 50 ms) |
| `npm run coverage [-- --set main] [-- --missing] [-- --card "<nom>"]` | Cartes FDN gérées, mécaniques manquantes, texte Oracle et script d'une carte |
| `npm run deck-smoke` | Deckbuilder de bout en bout : import, édition, export, persistance, partie (serveur de dev lancé) |
| `npm run typecheck` / `npm run lint` | TypeScript strict / Biome |
| `npm run import-cards -- fdn` | Réimporte un set depuis Scryfall (EN + FR) |
| `npm run ui-smoke -- <dossier> [actions]` | Joue une partie dans Chromium via l'interface et prend des captures (serveur de dev lancé) |

## Architecture

```
packages/
  engine/   moteur pur et déterministe : état JSON, décisions, règles, autopilot, vue filtrée, GameHost
  cards/    données Scryfall (data/fdn.json), scripts des cartes par couleur (src/fdn/*.ts), decklists, decks (decks/*.json)
  ai/       IA aléatoire (fuzz) et heuristique (simulation sur clones de l'état + évaluation)
  client/   React + Vite + Zustand + Motion ; la partie tourne dans un Web Worker
tools/      import Scryfall, fuzz, test d'interface
```

- **`submit(state, joueur, décision) → { state, events }`** : le moteur avance tout seul jusqu'à la prochaine décision. Il donne ensuite la liste exhaustive des options légales (`legalActions`), dont se servent l'interface, l'IA et l'autopilot.
- **Autopilot** (`engine/src/autopilot.ts`) : il répond aux décisions triviales. Le moteur, lui, reste strict. Le mode « contrôle total » désactive l'autopilot.
- **Effets de cartes** : ce sont des données sérialisables (`engine/src/dsl.ts`), jamais du code stocké dans l'état.
- **Règle 400.7** : un objet qui change de zone reçoit un nouvel identifiant (`id`). L'identifiant `uid`, lui, suit la carte physique pour les animations.
- **N joueurs** : priorité en tour de table, ordre APNAP, un défenseur par attaquant, élimination d'un joueur (800.4a).
- **Choix génériques** (`choices.ts`) : toute question passe par une `ChoiceRequest` (choisir, ordonner, oui/non, nombre, répartir) avec une réponse suggérée. Une résolution peut être suspendue sur un choix puis reprise.
- **Capacités déclenchées** (`triggers.ts`) : détectées au moment de l'événement, avec regard en arrière pour les morts simultanées, puis mises sur la pile en APNAP. Les conditions « si… » sont revérifiées à la résolution.
- **Couches** (`layers.ts`) : caractéristiques calculées couche par couche (4 à 7) avec capacités statiques. Elles sont mises en cache par version d'état, et le fuzz vérifie le cache.
- **Remplacements et prévention** (`replacement.ts`) et **coûts** (`mana.ts`) : exil à la place de mourir, arrivée engagée ou avec marqueurs, prévention, hybride, coûts additionnels, flashback, réductions, Trésors.
- **Performance** : `submit` copie l'état puis le mute (pas d'Immer) ; les simulations de l'IA utilisent `applyMutable` sur une copie de travail.

## Ajouter une carte

Les caractéristiques d'une carte (coût, types, F/E, mots-clés) viennent de Scryfall. Une créature « vanilla » ou « french vanilla » fonctionne donc sans script. Sinon, on décrit son comportement dans `packages/cards/src/fdn/<couleur>.ts` :

```ts
"Burst Lightning": { kicker: "{4}", spell: spell([target.any()], [fx.damage(amount.kicked(4, 2), ref.target())]) },
```

## État

| Étape | Contenu | État |
|---|---|---|
| 1. Fondations | monorepo, TS strict, Biome, Vitest, import Scryfall FDN | ✅ |
| 2. Noyau du moteur | tours et phases, priorité et pile, mana, combat et mots-clés, actions basées sur l'état, mulligan de Londres, X, kicker, sorts modaux, capacités activées, jetons | ✅ |
| 3. Client contre l'IA | plateau, main en éventail, glisser-déposer, flèches, barre des phases et arrêts, autopilot, journal FR | ✅ |
| 4a. Fondations du moteur | N joueurs, choix génériques, déclencheurs, couches, remplacements, coûts, performance | ✅ |
| 4b. Couverture FDN | set principal (276 cartes) : cimetière, recherche, cibles multiples, exil lié, contresorts et garde, auras et équipements… ; restent planeswalkers, copie, contrôle, cas particuliers | en cours : 239 / 276 cartes du set principal |
| 5. IA | attaques par simulation, puis ISMCTS | à faire |
| 6. JcJ en ligne | serveur Node `ws` réutilisant `GameHost` + `projectView` | à faire |
| 7. Finitions | deckbuilder, import et export de decklists (MTGA, MTGO, noms FR) ✅ ; sons, replays (graine + décisions) | en cours |

## Cadre légal

Projet de fan gratuit et non commercial ([Fan Content Policy](https://company.wizards.com/fancontentpolicy) de Wizards of the Coast). Les images restent hébergées par Scryfall et ne sont pas copiées dans le dépôt.
