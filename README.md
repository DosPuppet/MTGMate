# MTGX

Plateforme pour jouer à Magic: The Gathering contre une IA (et bientôt contre un autre joueur). Elle repose sur un **moteur de règles maison en TypeScript** et une interface 2D pensée pour être aussi fluide que MTG Arena :

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
| `npm test` | Tests de règles et d'IA (Vitest) |
| `npm run fuzz -- --games 300 [--ai random\|heuristic\|mixed]` | Parties IA contre IA, invariants vérifiés à chaque décision |
| `npm run typecheck` / `npm run lint` | TypeScript strict / Biome |
| `npm run import-cards -- fdn` | Réimporte un set depuis Scryfall (EN + FR) |
| `npm run ui-smoke -- <dossier> [actions]` | Joue une partie dans Chromium via l'interface et prend des captures (serveur de dev lancé) |

## Architecture

```
packages/
  engine/   moteur pur et déterministe : état JSON, décisions, règles, autopilot, vue filtrée, GameHost
  cards/    données Scryfall (data/fdn.json), comportement des cartes (src/fdn.ts), decks (decks/*.json)
  ai/       IA aléatoire (fuzz) et heuristique (simulation sur clones de l'état + évaluation)
  client/   React + Vite + Zustand + Motion ; la partie tourne dans un Web Worker
tools/      import Scryfall, fuzz, test d'interface
```

- **`submit(state, joueur, décision) → { state, events }`** : le moteur avance tout seul jusqu'à la prochaine décision. Il donne ensuite la liste exhaustive des options légales (`legalActions`), dont se servent l'interface, l'IA et l'autopilot.
- **Autopilot** (`engine/src/autopilot.ts`) : il répond aux décisions triviales. Le moteur, lui, reste strict. Le mode « contrôle total » désactive l'autopilot.
- **Effets de cartes** : ce sont des données sérialisables (`engine/src/dsl.ts`), jamais du code stocké dans l'état.
- **Règle 400.7** : un objet qui change de zone reçoit un nouvel identifiant (`id`). L'identifiant `uid`, lui, suit la carte physique pour les animations.

## Ajouter une carte

Les caractéristiques d'une carte (coût, types, F/E, mots-clés) viennent de Scryfall. Une créature « vanilla » ou « french vanilla » fonctionne donc sans script. Sinon, on décrit son comportement dans `packages/cards/src/fdn.ts` :

```ts
"Burst Lightning": { kicker: "{4}", spell: spell([target.any()], [fx.damage(amount.kicked(4, 2), ref.target())]) },
```

## État

| Étape | Contenu | État |
|---|---|---|
| 1. Fondations | monorepo, TS strict, Biome, Vitest, import Scryfall FDN | ✅ |
| 2. Noyau du moteur | tours et phases, priorité et pile, mana, combat et mots-clés, actions basées sur l'état, mulligan de Londres, X, kicker, sorts modaux, capacités activées, jetons | ✅ |
| 3. Client contre l'IA | plateau, main en éventail, glisser-déposer, flèches, barre des phases et arrêts, autopilot, journal FR | ✅ |
| 4. Mécaniques du pool | capacités déclenchées, statiques et couches complètes, auras et équipements, remplacements, choix en cours de résolution → ~150 cartes, 8–10 decks | à faire |
| 5. IA | attaques par simulation, puis ISMCTS | à faire |
| 6. JcJ en ligne | serveur Node `ws` réutilisant `GameHost` + `projectView` | à faire |
| 7. Finitions | animations, sons, deckbuilder, replays (graine + décisions) | à faire |

## Cadre légal

Projet de fan gratuit et non commercial ([Fan Content Policy](https://company.wizards.com/fancontentpolicy) de Wizards of the Coast). Les images restent hébergées par Scryfall et ne sont pas copiées dans le dépôt.
