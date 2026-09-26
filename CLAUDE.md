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
| Légalité Standard dans le deckbuilder (légalités Scryfall, bannies) | ✅ |
| Champ de bataille façon MTGA (rangées, zone des planeswalkers, piles de jetons, lignes multiples, redimensionnement) | ✅ |
| Effets sonores (échantillons Kenney CC0, volume, muet avec M) | ✅ |
| Jeu en ligne : duel Standard à 2 (serveur local, code de salon, corde, reconnexion, revanche) | ✅ |
| Déploiement : pm2 derrière nginx sur un VPS (`docs/deploiement.md`, `deploy/`) | ✅ documenté et testé en local (pm2, nginx) |
| Autres extensions Standard | **prochaine étape** |

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
- **Légalité Standard :** instantané des légalités Scryfall au moment de l'import (`legalities.standard` dans `data/<set>.json`). Après une rotation ou une annonce de bannissement, réimporter les sets (`npm run import-cards -- <set>`).
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
  - ce qui se lit dans le texte Scryfall (mots-clés, prouesse, garde, « Équiper », loyauté) est déduit dans `cards/src/scryfall.ts` ;
  - légalité : `validateDeck` (format `standard` par défaut) refuse les cartes bannies, hors format ou sans légalité connue, réserve comprise ; les decks illégaux ne lancent pas de partie.
- **Jeu en ligne (`packages/server`) :**
  - le serveur fait autorité : il valide le deck (`validateDeck`, légal et jouable) et chaque décision (`RulesError` renvoyée au client) ;
  - un joueur ne reçoit que sa vue (`projectView`), ses événements filtrés (`filterEvents`) et les faces qu'il connaît (`visibleFaces`), jamais la decklist adverse ;
  - tout nouvel événement ou champ de vue qui peut citer une carte cachée doit être filtré ; l'audit `ai/test/hidden-info.test.ts` le vérifie ;
  - le protocole est dans `server/src/protocol.ts`, que le client importe en `import type`.
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
   - `npm run deck-smoke`, `npm run ui-smoke` et `npm run battlefield-smoke` (plateaux chargés via le bac à sable) ;
   - pour une nouvelle mécanique visible, un script Playwright ponctuel avec captures dans `test-results/`.

## Pièges connus

- **Serveur Vite sous WSL :** il peut servir une version périmée d'un module du moteur après modification. Redémarrer `npm run dev` avant tout test dans le navigateur, ou vérifier avec `curl http://localhost:5173/@fs/<chemin absolu> | grep <nouveau code>`.
- **Champ de bataille (`client/src/board/layout.ts`) :**
  - la disposition est calculée en pur TypeScript et testée (`client/test/layout.test.ts`) ; les lignes sont découpées explicitement, pas par `flex-wrap` ;
  - chaque camp est dimensionné indépendamment (comme sur MTGA) : un adversaire très chargé ne rapetisse pas vos cartes ;
  - placement par type, d'après MTGA : créatures devant ; terrains, puis artefacts, puis enchantements derrière ; planeswalkers et batailles dans une zone à part tout à droite (recouvrement vertical s'ils sont nombreux) ; Auras et Équipements attachés rendus avec leur hôte ; `battlefield-smoke` vérifie ce rangement ;
  - batailles : placées chez leur contrôleur (MTGA les met chez le protecteur, que le moteur ne modélise pas encore) ;
  - les constantes d'espacement de `layout.ts` (GAP, SEPARATOR, TOKEN_OFFSET…) doivent rester alignées avec `styles.css` ;
  - la colonne du plateau est bornée (`grid-template-columns: minmax(0, 1fr)`) : sans cela, le contenu élargit la zone mesurée et la taille des cartes ne se réduit plus ;
  - les jetons d'une pile n'ont pas tous d'élément : chercher un objet à l'écran avec `findObjectEl` (et non `[data-oid]`).
- **Effets sonores (`client/src/audio/`) :**
  - `sounds.ts` = table clé → fichiers de `public/sounds/` (changer un son = une ligne) ; `eventSounds.ts` = événements → sons, pur et testé ; `sfx.ts` = Web Audio ;
  - les navigateurs bloquent le son avant le premier geste : `unlockAudio` au premier `pointerdown` (main.tsx) ;
  - un nouveau type d'événement moteur n'a pas de son tant qu'il n'est pas ajouté à `soundsFor` ;
  - en mode dev, `window.__sfxLog` liste les sons joués (vérifié par `ui-smoke`).
- **Serveur de parties :** `npm run server` charge le moteur au démarrage ; le relancer après toute modification du moteur ou des cartes. Il sert `packages/client/dist` : relancer `npm run build` pour y voir les changements du client (en dev, Vite redirige `/ws` vers le port 8787).
- **Déploiement (VPS de l'utilisateur) :** machine partagée avec d'autres applis, nginx existant devant, **ni Docker ni Caddy ni unité systemd** : pm2 (`deploy/ecosystem.config.cjs`), serveur sur `127.0.0.1`. Une mise à jour (`deploy/update.sh`) redémarre le serveur et **coupe les parties en cours** (salons en mémoire).
- **Mode dev seulement :** `window.__mtgx` (bac à sable) et `window.__sfxLog` n'existent pas dans le build de production ; les scripts qui visent la production (`online-smoke --base`) ne doivent pas s'en servir.
- **Mulligans :** ils se décident l'un après l'autre (le premier joueur d'abord) ; un script de test ne doit pas supposer l'ordre.
- **Bac à sable (mode dev) :** `window.__mtgx` expose le store ; `startGame(deck, decksIA, { p1: { cards, tokens }, p2: … })` met des permanents en jeu dès le début (voir `battlefield-smoke`). Dans `page.evaluate`, pas de fonction nommée (tsx injecte `__name`).
- **`pgrep -f` / `pkill -f` :** avec un motif présent dans la ligne de commande, ils peuvent tuer le shell courant.
- **Test de fumée (`ai/test/cards-smoke.test.ts`) :** une carte qui n'a pas pu être jouée fait échouer le test. Pour les cartes réactives (contresorts), l'adversaire doit avoir de quoi lancer des sorts.
- **Cache des caractéristiques :** tout ce dont une capacité statique ou une F/E variable dépend doit faire avancer la version d'état (`bump`). Les points de vie et l'élimination d'un joueur le font désormais. Le fuzz détecte les oublis (« cache des caractéristiques périmé »).
- **Biome :**
  - `npx biome check . | tail -1` cache les erreurs : lire toute la sortie, ou grep « Found » ;
  - un `*/` dans un commentaire JSDoc (« */* ») ferme le commentaire.
- **Patchs par recherche/remplacement :** Biome reformate le code. Un outil tolérant aux espaces est pratique (voir l'historique : `patch.py` dans le scratchpad de session).
- **Performances :** la machine (WSL) varie beaucoup d'une session à l'autre. Pour juger une régression, comparer `npm run bench` avant et après (`git stash`), pas avec un chiffre ancien.
