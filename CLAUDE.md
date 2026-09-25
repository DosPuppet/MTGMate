# CLAUDE.md — suivi et conventions de MTGX (MTG Mate)

Ce fichier sert au suivi du projet entre les sessions. Le README présente le projet ; ici, on trouve où on en est, ce qui reste à faire, les approximations connues et les règles de travail.

## Objectif et périmètre

- Plateforme MTG contre IA (puis JcJ), moteur de règles maison en TypeScript, interface fluide façon MTG Arena.
- **Périmètre avant extension : le format Standard.** On couvre les extensions une par une, en commençant par Foundations (FDN).
- Selon Scryfall (25/09/2026), **les 517 cartes de FDN sont toutes légales en Standard**, et aucune n'est bannie. Omniscience, Progenitus, Time Stop, etc. sont donc dans le périmètre.
- Extensions légales en Standard et liste des bannies : voir le README. À revérifier à chaque rotation, avec la requête Scryfall `legal:standard` / `banned:standard`.
- Hors périmètre pour l'instant : Commander, Limité, formats éternels, Alchemy.

## Avancement

| Jalon | État |
|---|---|
| Deckbuilder, decklists (import/export MTGA, MTGO, noms FR), validation 60/4/15 | ✅ |
| FDN set principal (n° 1–281, 276 cartes) | **244 / 276** (`npm run coverage -- --set main --missing`) |
| FDN réimpressions (n° 282+, 241 cartes) | à faire (beaucoup de « vanilla » et de mécaniques déjà gérées) |
| Légalité Standard dans le deckbuilder (légalités Scryfall, bannies) | à faire |
| Autres extensions Standard | à faire |

### Lots du set principal FDN

- A. Longue traîne (primitives du DSL, terrains bicolores) ✅
- B. Bibliothèque et cimetière (cibles au cimetière, recherche, retour) ✅
- C. Pile : contresorts, garde, sorts de la pile ciblables ✅
- D. Auras et Équipements ✅
- E. Planeswalkers et emblèmes ✅
- **F. Reste 32 cartes**, regroupées par mécanique à implémenter :

| Mécanique | Cartes |
|---|---|
| Copie (couche 1) | Abyssal Harvester (jeton copie d'une carte de cimetière, Cauchemar) |
| Changement de contrôle (couche 2) | Involuntary Employment |
| Doublement / remplacements multiples (616.1) | Doubling Season, Twinflame Tyrant |
| Protection, « défense talismanique contre » | Progenitus (protection contre tout ; mélangé dans la bibliothèque au lieu du cimetière), Elenda (défense talismanique contre les éphémères) |
| Choix « en arrivant » (type, couleur) | Banner of Kinship, Heraldic Banner, Secluded Courtyard (mana restreint) |
| Mana restreint | Giada (mana pour sorts d'Ange), Secluded Courtyard |
| Lancer sans payer / depuis d'autres zones | Omniscience, Etali, Muldrotha, Tinybones (exil avec marqueur de butin), Kellan, Strongbox Raider (jouer depuis l'exil jusqu'au tour suivant), Sphinx of Forgotten Lore (flashback accordé), Quilled Greatwurm (lancer depuis le cimetière en retirant des marqueurs) |
| Déclencheurs depuis le cimetière | Flamewake Phoenix |
| Copie de sorts | Thousand-Year Storm |
| Tour et partie | Time Stop (terminer le tour), Herald of Eternal Dawn (ne peut pas perdre) |
| Coûts spéciaux | Blasphemous Edict (coût alternatif), Eaten Alive (sacrifier OU payer), Luminous Rebuke (réduction si la cible est engagée) |
| F/E variables (*/*) | Consuming Aberration |
| Divers | Crystal Barricade (défense talismanique du joueur, prévention non-combat), Curator of Destinies (piles), Nine-Lives Familiar (marqueurs de résurrection), Loot (terrain supplémentaire), Niv-Mizzet (pas de taille de main maximale), Soulstone Sanctuary (terrain qui devient créature de tous types) |

## Approximations connues (à lever si une carte l'exige)

- **Blocages :** ils sont déclarés joueur par joueur en ordre APNAP, et non simultanément.
- **Remplacements multiples (616.1) :** le premier s'applique, sans choix du joueur affecté.
- **Dépendances de couches (613.8) :** seulement une approximation à un niveau, du type « une source qui perd toutes ses capacités n'applique plus ses statiques ».
- **Blessures « réparties » (Chandra −4) :** la répartition est choisie à la résolution, et non au lancement (601.2d).
- **Aura mise en jeu sans être lancée :** elle va au cimetière, faute du choix de l'objet enchanté (303.4f).
- **Fishing Pole :** la capacité accordée à la créature équipée est portée par l'Équipement (coût « engager la créature équipée »).
- **« Au début de l'étape de fin, sacrifiez ce jeton » :** modélisé par une capacité retardée plutôt que par une capacité du jeton.
- **Légalité Standard et liste des bannies :** pas encore vérifiées par le deckbuilder.
- **Jetons :** pas d'image (cadre texte).

## Conventions

- **Langue :**
  - interface, journal, commentaires et documents en **français** ;
  - identifiants de code en anglais ;
  - l'utilisateur écrit en français.
- **Moteur :**
  - pur et déterministe (graine) ;
  - effets = données sérialisables (DSL `engine/src/dsl.ts`), jamais de fonctions dans l'état ;
  - une décision illégale lève une **`RulesError`** : l'IA et le fuzz en dépendent, une `Error` ordinaire fait planter une partie ;
  - toute modification pouvant changer des caractéristiques appelle `bump(s)` (cache des couches) ;
  - un nouveau champ de `GameState` doit être initialisé dans `game.ts` et, si besoin, dans le helper de test `engine/test/helpers.ts`.
- **Cartes :**
  - scripts dans `packages/cards/src/fdn/<couleur>.ts` ; jetons et filtres partagés dans `fdn/common.ts` ;
  - ce qui se lit dans le texte Scryfall (mots-clés, prouesse, garde, « Équiper », loyauté) est déduit dans `cards/src/scryfall.ts`.
- **Données :**
  - `packages/cards/data/fdn.json` est indenté avec **1 espace** ; le réécrire à l'identique pour garder des diffs minimaux ;
  - réimport : `npm run import-cards -- fdn`.
- **Commits :**
  - uniquement quand l'utilisateur le demande ;
  - message en anglais, terminé par `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` ;
  - branche `master`, pas de remote.

## Vérifications avant de rendre un lot

1. `npx tsc -p tsconfig.json`, `npx biome check .` : Biome réordonne les imports, donc relire un fichier avant de le patcher par recherche/remplacement.
2. `npx vitest run` : règles, IA, test de fumée de chaque carte, decklists.
3. Fuzz sur toutes les cartes gérées :
   - `npm run fuzz -- --games 300 --pool all` (plusieurs `--seed`) ;
   - `--players 3` et `--players 4` ;
   - `--ai mixed`.
4. `npm run bench` : cibles atteintes.
5. Interface :
   - `npm run deck-smoke` et `npm run ui-smoke` ;
   - pour une nouvelle mécanique visible, un script Playwright ponctuel avec captures dans `test-results/`.

## Pièges connus

- **Serveur Vite sous WSL :** il peut servir une version périmée d'un module du moteur après modification. Redémarrer `npm run dev` avant tout test dans le navigateur, ou vérifier avec `curl http://localhost:5173/@fs/<chemin absolu> | grep <nouveau code>`.
- **`pgrep -f` / `pkill -f` :** avec un motif présent dans la ligne de commande, ils peuvent tuer le shell courant.
- **Test de fumée (`ai/test/cards-smoke.test.ts`) :** une carte qui n'a pas pu être jouée fait échouer le test. Pour les cartes réactives (contresorts), l'adversaire doit avoir de quoi lancer des sorts.
