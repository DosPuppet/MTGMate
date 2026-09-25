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
| FDN set principal (n° 1–281, 276 cartes) | ✅ **276 / 276** (lots A à F) |
| FDN réimpressions (n° 282+, 241 cartes) | ✅ **517 / 517** pour tout FDN |
| Légalité Standard dans le deckbuilder (légalités Scryfall, bannies) | **prochaine étape** |
| Autres extensions Standard | à faire |

### Lots du set principal FDN (tous terminés)

- A. Longue traîne (primitives du DSL, terrains bicolores)
- B. Bibliothèque et cimetière (cibles au cimetière, recherche, retour)
- C. Pile : contresorts, garde, sorts de la pile ciblables
- D. Auras et Équipements
- E. Planeswalkers et emblèmes
- F. Mécaniques uniques :
  - permissions de lancement (Omniscience, Etali, Muldrotha, Tinybones, impulsion, flashback accordé, lancer depuis le cimetière) ;
  - coûts alternatifs et « sacrifiez ou payez » ;
  - doublements (jetons, marqueurs, blessures) ;
  - protection contre tout et défense talismanique contre les éphémères ;
  - statiques de joueur ;
  - choix en arrivant et mana restreint ;
  - copie de sorts, changement de contrôle, fin du tour, F/E variables, déclencheurs depuis le cimetière.

Réimpressions : défenses talismaniques contre une couleur, changelin, restrictions de blocage (« doit être bloquée », « ne peut pas être bloquée par… »), Équipage, coûts d'activation (exil, retour en main, marqueurs, une fois par tour), marqueurs de poison, combats supplémentaires, mana conservé jusqu'à la fin du tour, sorts copiés par le mana dépensé, changement de cible, victoire et défaite par effet, Auras « vous contrôlez la créature enchantée ».

## Approximations connues (à lever si une carte l'exige)

- **Blocages :** ils sont déclarés joueur par joueur en ordre APNAP, et non simultanément.
- **Remplacements multiples (616.1) :** le premier s'applique, sans choix du joueur affecté.
- **Dépendances de couches (613.8) :** seulement une approximation à un niveau, du type « une source qui perd toutes ses capacités n'applique plus ses statiques ».
- **Blessures « réparties » (Chandra −4) :** la répartition est choisie à la résolution, et non au lancement (601.2d).
- **Aura mise en jeu sans être lancée :** elle va au cimetière, faute du choix de l'objet enchanté (303.4f).
- **Fishing Pole :** la capacité accordée à la créature équipée est portée par l'Équipement (coût « engager la créature équipée »).
- **« Au début de l'étape de fin, sacrifiez ce jeton » :** modélisé par une capacité retardée plutôt que par une capacité du jeton.
- **Etali :** les cartes exilées se lancent gratuitement, sans restriction de timing, après la résolution du déclencheur (et non pendant), jusqu'à la fin du tour.
- **Thousand-Year Storm :** les copies gardent les cibles du sort d'origine (pas de nouveau choix de cibles).
- **Coûts retirés automatiquement :**
  - Quilled Greatwurm : les six marqueurs sont retirés d'abord des créatures qui en ont le plus ;
  - Lathril : les Elfes à engager sont choisis automatiquement.
- **Mana restreint (Giada, Secluded Courtyard) :** utilisé seulement par le paiement automatique, pour un sort ou une capacité autorisés ; ces sources ne se tapent pas à la main.
- **Muldrotha :** une carte à plusieurs types de permanent utilise automatiquement le premier type encore libre.
- **Abyssal Harvester :** les autres jetons Cauchemar sont exilés avant la création de la copie (même résultat).
- **Choix « en arrivant » sans résolution** (permanent remis en jeu par un effet) : choix par défaut, le type ou la couleur les plus présents chez le contrôleur.
- **Curator of Destinies :** en multijoueur, c'est l'adversaire suivant qui choisit la pile.
- **Tinybones :** seuls les sorts avec un marqueur de butin sont jouables, pas les terrains.
- **Soulstone Sanctuary** (« tous les types de créature ») : tout sous-type sauf ceux de terrain, d'artefact et d'enchantement connus.
- **Équipage :** les créatures engagées sont choisies automatiquement.
- **Ramos, Three Tree Mascot :** leurs capacités de mana sont des capacités activées qui passent par la pile.
- **Mana « déclencheur » (haste, copie du sort) :** appliqué seulement quand ce mana est dépensé par le paiement automatique.
- **Bolt Bend :** la nouvelle cible est choisie à la résolution.
- **Demonic Pact :** les modes déjà choisis sont mémorisés sur le permanent (perdus s'il change de zone, ce qui est conforme).
- **Ordeal of Nylea :** sacrifiée directement, sans déclencheur séparé.
- **Dégager jusqu'à N terrains :** les terrains sont choisis automatiquement.
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
- **Cache des caractéristiques :** tout ce dont une capacité statique ou une F/E variable dépend doit faire avancer la version d'état (`bump`). Les points de vie et l'élimination d'un joueur le font désormais. Le fuzz détecte les oublis (« cache des caractéristiques périmé »).
- **Biome :**
  - `npx biome check . | tail -1` cache les erreurs : lire toute la sortie, ou grep « Found » ;
  - un `*/` dans un commentaire JSDoc (« */* ») ferme le commentaire.
- **Patchs par recherche/remplacement :** Biome reformate le code. Un outil tolérant aux espaces est pratique (voir l'historique : `patch.py` dans le scratchpad de session).
- **Performances :** la machine (WSL) varie beaucoup d'une session à l'autre. Pour juger une régression, comparer `npm run bench` avant et après (`git stash`), pas avec un chiffre ancien.
