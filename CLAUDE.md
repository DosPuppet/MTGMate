# CLAUDE.md — suivi et conventions de MTGX (MTG Mate)

Ce fichier sert au suivi du projet entre les sessions : état présent, règles de travail, pièges. Le README présente le projet ; l'historique est dans `docs/historique.md` ; le reste est dans `docs/` (voir « Documents »).

## Objectif et périmètre

- Plateforme MTG contre l'IA et en ligne (duel), moteur de règles maison en TypeScript, interface fluide façon MTG Arena.
- **Périmètre : le format Standard.** Extensions légales et bannies : voir le README ; à revérifier à chaque rotation (Scryfall `legal:standard` / `banned:standard`).
- Hors périmètre : Commander, Limité, formats éternels, Alchemy.

## État (02/10/2026)

- **Tout le Standard est jouable :** 5 164 / 5 164 cartes, 19 extensions (5 177 cartes importées, dont 13 bannies ; légalités comparées chaque semaine à Scryfall, `tools/check-legality.ts`). Détail par extension : `docs/extensions/<ext>.md` ; jalons et chronologie : `docs/historique.md`.
- **Plateforme :** IA à trois niveaux, duel en ligne (BO3, corde, reconnexion, reprise après redémarrage), tutoriel en 9 leçons, replays, reprise d'une partie à la réouverture de la page, tablette et téléphone, déploiement pm2 + nginx.
- **Plans :** `docs/plans/PLAN-A.md` (passe sur les approximations) fait le 05/10/2026 : lots A0 à A4, environ 130 entrées levées, règles 131 ; `docs/plans/PLAN-G.md` (Special Guests et rééditions pour « Sans limite ») fait le 04/10/2026 : les 413 cartes des huit ensembles (SPG, EOS, WOT, OTP, FCA, SOA, PZA, REX) sont gérées, avec l'illustration de la réédition, règles 121 ; `docs/plans/PLAN-S.md` (nettoyage du DSL, baisse des plafonds, performance) fait le 04/10/2026 sur la branche `plan-s`, règles 102 (bilan en fin de document) ; `docs/plans/PLAN-D.md` (reports de l'analyse des cartes) fait le 03/10/2026, règles 95 ; `docs/plans/PLAN-C.md` (consolidation après l'audit du 02/10/2026) : lots C0 à C19 faits le 03/10/2026, C20 écarté après mesure. Restent : C13 en continu (extensions d'avant R7 et TDM à 50 % de cartes testées, `npm run coverage -- --set all --tests`), les parties non faites de C12 et C18 (listées dans le « Suivi »).
- **Branche `dev`** pour le travail courant (`master` = version stable). Les lots se font à la demande de l'utilisateur, un commit par lot ou sous-lot.
- Découpage d'une extension (à la prochaine rotation) : lot A (cartes faisables avec le moteur, jetons, terrains), lot B (mécaniques phares), lots C et suivants (cartes uniques) ; un commit par lot ; `npm run verify -- --set <EXT>`.

## Documents

- `docs/plans/` : `PLAN-A.md` (passe sur les approximations, lots A0 à A4, fait le 05/10/2026) ; `PLAN-G.md` (Special Guests et rééditions pour le format « Sans limite », lots G0 à G9 et sous-lot difficile G4e ; fait le 04/10/2026, suivi en fin de document) ; `PLAN-S.md` (nettoyage du DSL et des surfaces du modèle, lots S0 à S10, performance P1, P2 ; fait le 04/10/2026, bilan et reports en fin de document) ; `PLAN-D.md` (reports de l'analyse des cartes du 03/10/2026, lots D1 à D9 faits le 03/10/2026, bilan en fin de document) ; `PLAN-C.md` (fait le 03/10/2026) ; archivés : `PLAN-R.md` (remédiation de l'audit du 30/09 ; « Reporté tant qu'aucune carte ne l'exige »), `PLAN-P4.md` (méta Standard puis Tarkir: Dragonstorm ; decks du méta dans `docs/meta/2026-09-29/`).
- `docs/audits/` : **`2026-10-03-cartes.md`** (exactitude des cartes M/R/U : couverture des tests, familles d'approximations, options ; lots K0 à K8 faits le 03/10/2026, bilan et reports en fin de document) ; **`2026-10-02.md`** (audit général après la couverture du Standard : bugs B1 à B6, choix faits à la place du joueur, approximations, dette, architecture, plateforme) ; archivés : `2026-09-30.md`, `2026-09-29.md`.
- `docs/moteur.md` : **à lire avant d'ajouter une mécanique.** Carte des fichiers du moteur, recettes, règles de conception, plafonds.
- `docs/approximations.md` : approximations connues, générales puis carte par carte. **Toute nouvelle approximation y est ajoutée** ; toute approximation levée en est retirée.
- `docs/extensions/<ext>.md` : mécaniques et lots de chaque extension (`socle` : lots transverses ; `meta` : lots du méta). **Le détail d'un lot de cartes va là.**
- `docs/historique.md` : jalons et chronologie du projet.
- `docs/deploiement.md` (pm2, nginx), `docs/tutoriel.md` (leçons), `docs/ia.md` (niveaux, ISMCTS, tournoi et mesures).
- Textes Oracle : `npm run coverage -- --set <ext> --text [--color W|U|B|R|G|M|C|L]` ; une carte : `--card "<nom>"`.
- Cartes nommées dans un test de règles, par extension : `npm run coverage -- --set all --tests [--meta]` (à citer dans le compte rendu d'un lot de cartes).
- Audit Oracle ↔ script : `npm run coverage -- --set <ext> --audit` (`cards/src/audit.ts`) ; `cards/test/audit.test.ts` échoue sur tout nouvel écart ; un écart voulu va dans `cards/data/audit-baseline.json` avec sa raison.

## Conventions

- **Langue :** interface, journal, commentaires et documents en **français** ; l'interface **vouvoie** le joueur, jamais de tutoiement ; identifiants de code en anglais ; l'utilisateur écrit en français.
- **Moteur :**
  - pur et déterministe (graine) ; effets = données sérialisables (DSL `engine/src/dsl.ts`), jamais de fonctions dans l'état ;
  - une décision illégale lève une **`RulesError`** : l'IA et le fuzz en dépendent, une `Error` ordinaire fait planter une partie ;
  - toute modification pouvant changer des caractéristiques appelle `bump(s)` (cache des couches) ;
  - un nouveau champ de `GameState` est initialisé dans `game.ts` et, si besoin, dans `engine/test/helpers.ts`.
- **Cartes :**
  - extensions déclarées dans `packages/cards/src/sets.ts` ; une réimpression garde la définition de la première extension ;
  - scripts dans `packages/cards/src/<set>/*.ts` ; DSL et jetons génériques dans `fdn/common.ts` ;
  - ce qui se lit dans le texte Scryfall (mots-clés, garde, « Équiper », loyauté, Harmonie, Marchandage…) est déduit dans `cards/src/scryfall.ts` ;
  - légalité : `validateDeck` (format `standard` par défaut) refuse les cartes bannies, hors format ou sans légalité connue, réserve comprise ; le format `unlimited` (« Sans limite », choisi à l'accueil ou à la création d'un salon en ligne, retenu dans `mtgmate.format`) accepte toute carte du catalogue quelle que soit sa légalité (bannie, hors Standard, Commander plus tard) ; seules restent les règles de construction.
- **Jeu en ligne (`packages/server`) :**
  - le serveur fait autorité : il valide le deck et chaque décision (`RulesError` renvoyée au client) ;
  - un joueur ne reçoit que sa vue (`projectView`), ses événements filtrés (`filterEvents`) et les faces qu'il connaît (`visibleFaces`) ;
  - tout nouvel événement ou champ de vue qui peut citer une carte cachée est filtré ; `ai/test/hidden-info.test.ts` le vérifie ;
  - le protocole est dans `server/src/protocol.ts`, que le client importe en `import type` (sauf la constante `PROTOCOL_VERSION`) ;
  - poignée de main : création, arrivée et reprise d'un salon portent `{ protocol: PROTOCOL_VERSION, rules: RULES_VERSION }` ; un client d'une autre version reçoit l'erreur `version` et recharge la page. Faire avancer `PROTOCOL_VERSION` à tout changement incompatible des messages.
- **Données :** `packages/cards/data/fdn.json` est indenté avec **1 espace** (le réécrire à l'identique) ; réimport : `npm run import-cards -- <set>|all` (`all` exclut FDN et FRA, retouchés à la main ; leurs données françaises manquantes : `npx tsx tools/import-french.ts <set>`). Liste des extensions : `cards/src/setRegistry.ts` (seule source, lue par les outils d'import). Bannissement annoncé avant un réimport : `cards/data/legality-overrides.json` ; la liste des bannies du README est vérifiée par `cards/test/legality.test.ts`.
- **Commits :** uniquement quand l'utilisateur le demande ; message en anglais, terminé par `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` ; remote `origin` (github.com/DosPuppet/MTGMate) : c'est l'utilisateur qui pousse.

## Vérifications avant de rendre un lot

- **Par lot :** `npm run verify -- --set <EXT>` (environ 2 min ; `--set META` pour les decks du méta) : `tsc`, Biome, couverture, budget du bundle (`tools/bundle-size.ts` : build du client, taille de chaque chunk, aucune carte dans le worker) ; vitest (test de fumée par extension) ; fuzz ciblé à 2, 3 et 4 joueurs, IA mixte et « chaos » ; fuzz sur tout le pool ; tests d'interface seulement si le client, `view.ts` ou le protocole ont changé (`--ui` pour les forcer ; Vite doit tourner).
- **En fin de série ou avant une fusion :** `npm run verify -- --full` (environ 7 min) : trois graines sur tout le pool, 3 et 4 joueurs, IA mixte, bench, tests d'interface (dont `tutorial-smoke` et `ai-smoke`).
- **Résultat :** une ligne par étape avec sa durée ; détail en cas d'échec seulement ; journaux dans `test-results/verify/`.
- **CI** (`.github/workflows/ci.yml`) : `verify --ci` à chaque push sur `dev` ou `master` et à chaque pull request ; `verify --full --no-ui --no-bench` chaque nuit.
- **Fuzz à la main :** `npm run fuzz -- --games 300 --pool FIN --jobs 10` ; résultats identiques à graine égale, quel que soit `--jobs`.
- **Invariants** (`checkInvariants`, `ai/src/selfplay.ts`) : ils tournent à chaque décision du fuzz et de la fumée ; un seul parcours des objets, ni `JSON.stringify` ni copie d'état sans nécessité ; testés dans `ai/test/invariants.test.ts`.
- **Lot [règles]** (il change le comportement du moteur) : faire avancer `RULES_VERSION` (`engine/src/record.ts`, ligne d'historique). Les parties dorées (`tools/golden.ts`, `ai/test/golden/`) qui se rejouent à l'identique restent telles quelles ; `npm run golden -- --update` ne régénère que celles qui divergent, et le commit dit lesquelles. `ai/test/golden.test.ts` échoue sur toute divergence (à version égale : le moteur a changé sans faire avancer la version).
- **Fuzz strict** (`--offers N`) : toutes les N priorités, chaque option de `legalActions`, avec ses choix par défaut, doit être acceptée par le moteur (`checkOffers`, `ai/src/selfplay.ts`). Une option proposée puis refusée est un désaccord entre `legal.ts` et `stack.ts` : corriger l'un ou l'autre, et ajouter un test à `engine/test/offers.test.ts`.
- **Nouvelle mécanique visible :** un script Playwright ponctuel, avec captures dans `test-results/`.
- **Bench et `ai-smoke` :** fiables seulement sur secteur ; la machine (WSL, CPU réglable) varie beaucoup : comparer avant et après (`git stash`), jamais à un chiffre ancien ; un échec de peu de `ai-smoke` (« ralenti ×4 ») en fin de `--full` se relance seul avant de conclure.

## Pièges connus

- **Bundle :** données des cartes dans un chunk à part (`cartes-*.js`, `client/vite.config.ts`), scripts des cartes dans celui de l'application (`index-*.js`, environ 1,8 Mo) ; budgets dans `tools/bundle-size.ts` ; le serveur compresse (brotli ou gzip) et met `/assets/` en cache un an ; un service worker (`client/public/sw.js`) permet de jouer hors ligne. Le worker ne doit pas importer `@mtgx/cards` (il reçoit ses définitions dans `start`) ; seul `@mtgx/cards/tokens` est permis. Premier chargement lent en dev : relancer un test d'interface qui échoue par délai juste après un redémarrage de Vite.
- **Vite sous WSL :** il peut servir une version périmée d'un module du moteur. Redémarrer `npm run dev` avant tout test dans le navigateur.
- **Champ de bataille (`client/src/board/layout.ts`) :** disposition en pur TypeScript, testée (`layout.test.ts`) ; chaque camp dimensionné indépendamment ; placement par type d'après MTGA (`battlefield-smoke` le vérifie) ; constantes d'espacement alignées avec `styles.css` ; colonne bornée (`minmax(0, 1fr)`) ; chercher un objet à l'écran avec `findObjectEl` (les jetons d'une pile n'ont pas tous d'élément) ; cartes exilées par un permanent (`view.exiledWith`) empilées derrière lui ; cartes jouables hors de la main (`view.playableElsewhere`) au bout de la main ; coût modifié en pastille (`ObjectView.castCost`).
- **Tablette et téléphone :** hauteurs en `dvh`, jamais `100vh` ; `fitHand` resserre la main ; tactile dans `client/src/touch.ts` (appui long = aperçu, premier tap lève la carte) ; tiroir sous 1100 px ; « Tournez votre appareil » en portrait sous 600 px ; `mobile-smoke` émule les appareils, mais tester la barre d'adresse sur un vrai appareil (`npm run dev -- --host`).
- **Images de Scryfall :** toute URL passe par `imageUrl` (`client/src/images.ts`) ; un composant qui affiche une image appelle `useRelayActive()` ; la route `/scry/` du serveur n'accepte que les images de cartes (liste blanche `SCRY_PATH`) : ne jamais l'élargir.
- **Sons (`client/src/audio/`) :** `sounds.ts` (table des fichiers), `eventSounds.ts` (événements → sons, testé), `sfx.ts` ; débloqués au premier geste ; un nouvel événement du moteur n'a pas de son tant qu'il n'est pas dans `soundsFor`.
- **Serveur de parties :** `npm run server` (tsx, pour le développement) charge le moteur au démarrage (le relancer après une modification du moteur ou des cartes) et sert `packages/client/dist` (relancer `npm run build`). En production, pm2 lance le serveur compilé `packages/server/dist/main.mjs` (`npm run build:server`, esbuild). `/healthz` détaille versions, mémoire et salons pour une requête locale directe seulement. Un salon occupe 0,2 à 0,3 Mo de tas ; au-delà de `maxHeapMb`, aucun salon n'est créé (`tools/load-test.ts`). Avant un déploiement [règles] : `npx tsx tools/rooms-check.ts` (lancé par `deploy/update.sh`).
- **Déploiement (VPS de l'utilisateur) :** machine partagée, nginx existant, **ni Docker ni Caddy ni unité systemd** : pm2 (`deploy/ecosystem.config.cjs`), serveur sur `127.0.0.1`. Les parties en cours sont sauvegardées (`data/rooms`, fichiers en 600, jetons et adresses en empreintes SHA-256) et reprises au démarrage en rejouant leurs décisions ; un changement de règles peut rendre une sauvegarde impossible à rejouer (fichier mis de côté, effacé après sept jours). `deploy/update.sh` sauvegarde `data/rooms` avant chaque mise à jour (retour arrière : `docs/deploiement.md`).
- **Reprise à la réouverture (`client/src/savedGame.ts`) :** partie contre l'IA écrite dans `localStorage` (`mtgmate.localGame`) par `SaveWriter`, rejouée par le worker à l'ouverture ; partie en ligne reprise par son jeton (`mtgmate.online`), sinon message et accueil ; un lien `?room=` passe avant.
- **Réglages retenus** dans `localStorage` (`mtgmate.autopilot`, `mtgmate.lang`, `mtgmate.board`). « Fin du tour » est une passe douce ; Maj+Entrée, une passe dure.
- **`undoMana`** n'est pas une option de `legalActions` (l'IA aléatoire bouclerait) : la vue marque les sources annulables.
- **Mode dev seulement :** `window.__mtgx` (bac à sable : `startGame(deck, decksIA, { p1: { cards, tokens } })`) et `window.__sfxLog` ; pas dans le build de production. Dans `page.evaluate`, pas de fonction nommée (tsx injecte `__name`).
- **Mode rapide des tests (`?fast`) :** l'IA joue sans pause. Les scripts d'interface ouvrent `/?fast`, sauf `battlefield-smoke`. Une boucle de test qui joue une partie gère les fenêtres de choix et la défausse, et échoue si la partie se bloque.
- **Tutoriel (`client/src/tutorial/`) :** rejoué par `client/test/tutorial.test.ts` et `tutorial-smoke`. Modifier une leçon, une carte qu'elle utilise, l'automatisme ou les options de `legalActions` peut la bloquer : relancer les deux. Toute décision passe par `store.decide` ou `store.endTurn` (garde du guidage).
- **IA (`packages/ai`) :** ne jamais lire la main adverse, son deck, l'ordre des bibliothèques ni les faces cachées (`determinize`, `ismcts.test.ts`) ; dans une simulation, appliquer les décisions par `step`, pas par `applyMutable` ; budget en temps dans l'interface, en itérations ailleurs ; juger un changement au tournoi (`npm run arena`, 600 parties ou plus).
- **Rythme de la partie :** l'hôte (option `frames`) envoie une mise à jour par étape de la pile ; le client les joue dans l'ordre (`playback`, `store.ts`) ; pendant la lecture, `decide` est ignoré.
- **Mulligans (103.5) :** tour de table par tour de table ; un script de test ne doit pas supposer l'ordre.
- **Test de fumée (`ai/test/smoke/`) :** une carte non jouée fait échouer le test ; une nouvelle extension reçoit son fichier et entre dans `OWN_FILES` ; pour une carte réactive, l'adversaire doit avoir des sorts.
- **Cache des caractéristiques :** tout ce dont une statique ou une F/E variable dépend fait avancer la version (`bump`) ; le fuzz détecte les oublis.
- **Biome :** `npx biome check . | tail -1` cache les erreurs (grep « Found ») ; un `*/` dans un commentaire JSDoc le ferme. Biome reformate : préférer un patch tolérant aux espaces.
- **Vitest 5.0.1 et `/tmp` :** chaque exécution crée `/tmp/<nanoid>/ssr` (environ 60 Mo) sans le supprimer ; le greffon `mtgx-clear-vitest-tmp` de `vitest.config.ts` le supprime à la fermeture (sans lui, `/tmp` a saturé le 02/10/2026). À retirer quand vitest le fera lui-même.
- **`pgrep -f` / `pkill -f`** avec un motif présent dans la ligne de commande peuvent tuer le shell courant.

## Règle : pas de dette propre à une carte

- **Chercher d'abord une forme générique** avant d'ajouter, pour une seule carte, un champ, un membre d'union, une opération d'effet ou un champ d'état : famille paramétrée par un `ObjectFilter` (`BlockRule`, `ProtectionRule`, `playFrom`, `abilityCost`, `castLimit`, `triggerMod`…), journal du tour (`amount.turnEvents`) plutôt qu'un champ « ce tour-ci », effets sur les joueurs (`fx.thisTurn`), effet ou déclencheur existant.
- **Si une carte l'exige vraiment,** l'ajout est justifié dans `packages/cards/data/debt-baseline.json` (raison, famille cible) et signalé dans le lot.
- **`packages/cards/test/debt.test.ts` le vérifie** et échoue sur toute entrée nouvelle ou périmée : drapeaux de joueur, mots-clés non imprimés, opérations et propriétés d'une seule carte, champs « ce tour-ci » de `GameObject`, noms de cartes dans le code du moteur. Il suit aussi la taille des surfaces du modèle (`ceilings`) et le plus grand cycle d'imports du moteur (`importCycleMax`) : les relever se justifie dans le lot, les baisser est obligatoire dès qu'elles baissent (`npx tsx tools/debt-ceilings.ts [--write "raison"]`, raison notée dans `ceilingNotes`). Chiffres à jour : la référence elle-même.

## Ajouter des cartes : remplacements (R1) et justesse (R7)

**Remplacements et prévention (616, 615) :**
- Un nombre modifié (blessures, marqueurs, PV, pioche) passe par `modifiers.ts` (`AmountMod`, `chooseReplacementOrder`) dans `dealDamage`, `changeCounters`, `gainLife` ou `drawCards` ; jamais un ordre fixe, jamais une pioche qui contourne `drawCards`.
- Un remplacement s'écrit avec `eventReplacement({ event: "damage" | "lifeLoss" | "tokens" | "counters" | "lifeGain" | "draw" | "mill" | "mana" | "untap", … })` (capacité imprimée) ou `fx.thisTurn({ replacement })` (effet) ; bouclier « la prochaine fois que » (615.7) : `fx.shield(…)`.
- Avant d'implémenter une règle reportée, relire « Reporté tant qu'aucune carte ne l'exige » dans `docs/plans/PLAN-R.md`.

**Justesse des cartes :**
- **Un fichier de tests de règles par extension** (`packages/engine/test/<ext>.test.ts`), qui vérifie le texte Oracle, pas seulement que la carte se joue. Modèles : `ecl.test.ts`, `mkm.test.ts` ; aides communes dans `engine/test/helpers.ts`.
- **Décisions officielles :** une interaction délicate (copies, remplacements, lien de vie, couches…) reçoit un test tiré des rulings Scryfall dans `engine/test/rulings.test.ts`.
- **Attentes de l'Oracle :** une forme de texte qui revient reçoit son motif dans `cards/test/oracle-expectations.test.ts` (`clause`).
- **Écart trouvé :** corriger le moteur ou le script ; sinon, approximation documentée. Ne jamais écrire un test qui fige un comportement faux.
- **Compte rendu de lot :** nombre de tests ajoutés, écarts trouvés.
