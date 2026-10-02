# CLAUDE.md — suivi et conventions de MTGX (MTG Mate)

Ce fichier sert au suivi du projet entre les sessions : état présent, règles de travail, pièges. Le README présente le projet ; l'historique est dans `docs/historique.md` ; le reste est dans `docs/` (voir « Documents »).

## Objectif et périmètre

- Plateforme MTG contre l'IA et en ligne (duel), moteur de règles maison en TypeScript, interface fluide façon MTG Arena.
- **Périmètre : le format Standard.** Extensions légales et bannies : voir le README ; à revérifier à chaque rotation (Scryfall `legal:standard` / `banned:standard`).
- Hors périmètre : Commander, Limité, formats éternels, Alchemy.

## État (02/10/2026)

- **Tout le Standard est jouable :** 5 161 / 5 161 cartes, 19 extensions (5 174 cartes importées, dont 13 bannies). Détail par extension : `docs/extensions/<ext>.md` ; jalons et chronologie : `docs/historique.md`.
- **Plateforme :** IA à trois niveaux, duel en ligne (BO3, corde, reconnexion, reprise après redémarrage), tutoriel en 9 leçons, replays, reprise d'une partie à la réouverture de la page, tablette et téléphone, déploiement pm2 + nginx.
- **Plan en cours : `docs/plans/PLAN-C.md`** (consolidation après l'audit du 02/10/2026, lots C0 à C20). Son tableau « Décisions et ordre » et son « Suivi » disent où on en est.
- **Branche `dev`** pour le travail courant (`master` = version stable). Les lots se font à la demande de l'utilisateur, un commit par lot ou sous-lot.
- Découpage d'une extension (à la prochaine rotation) : lot A (cartes faisables avec le moteur, jetons, terrains), lot B (mécaniques phares), lots C et suivants (cartes uniques) ; un commit par lot ; `npm run verify -- --set <EXT>`.

## Documents

- `docs/plans/` : **`PLAN-C.md`, en cours** ; archivés : `PLAN-R.md` (remédiation de l'audit du 30/09 ; « Reporté tant qu'aucune carte ne l'exige »), `PLAN-P4.md` (méta Standard puis Tarkir: Dragonstorm ; decks du méta dans `docs/meta/2026-09-29/`).
- `docs/audits/` : **`2026-10-02.md`** (audit général après la couverture du Standard : bugs B1 à B6, choix faits à la place du joueur, approximations, dette, architecture, plateforme) ; archivés : `2026-09-30.md`, `2026-09-29.md`.
- `docs/moteur.md` : **à lire avant d'ajouter une mécanique.** Carte des fichiers du moteur, recettes, règles de conception, plafonds.
- `docs/approximations.md` : approximations connues, générales puis carte par carte. **Toute nouvelle approximation y est ajoutée** ; toute approximation levée en est retirée.
- `docs/extensions/<ext>.md` : mécaniques et lots de chaque extension (`socle` : lots transverses ; `meta` : lots du méta). **Le détail d'un lot de cartes va là.**
- `docs/historique.md` : jalons et chronologie du projet.
- `docs/deploiement.md` (pm2, nginx), `docs/tutoriel.md` (leçons), `docs/ia.md` (niveaux, ISMCTS, tournoi et mesures).
- Textes Oracle : `npm run coverage -- --set <ext> --text [--color W|U|B|R|G|M|C|L]` ; une carte : `--card "<nom>"`.
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
  - légalité : `validateDeck` (format `standard` par défaut) refuse les cartes bannies, hors format ou sans légalité connue, réserve comprise.
- **Jeu en ligne (`packages/server`) :**
  - le serveur fait autorité : il valide le deck et chaque décision (`RulesError` renvoyée au client) ;
  - un joueur ne reçoit que sa vue (`projectView`), ses événements filtrés (`filterEvents`) et les faces qu'il connaît (`visibleFaces`) ;
  - tout nouvel événement ou champ de vue qui peut citer une carte cachée est filtré ; `ai/test/hidden-info.test.ts` le vérifie ;
  - le protocole est dans `server/src/protocol.ts`, que le client importe en `import type`.
- **Données :** `packages/cards/data/fdn.json` est indenté avec **1 espace** (le réécrire à l'identique) ; réimport : `npm run import-cards -- <set>|all` (`all` exclut FDN et FRA, retouchés à la main).
- **Commits :** uniquement quand l'utilisateur le demande ; message en anglais, terminé par `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` ; remote `origin` (github.com/DosPuppet/MTGMate) : c'est l'utilisateur qui pousse.

## Vérifications avant de rendre un lot

- **Par lot :** `npm run verify -- --set <EXT>` (environ 2 min ; `--set META` pour les decks du méta) : `tsc`, Biome, couverture ; vitest (test de fumée par extension) ; fuzz ciblé à 2, 3 et 4 joueurs, IA mixte et « chaos » ; fuzz sur tout le pool ; tests d'interface seulement si le client, `view.ts` ou le protocole ont changé (`--ui` pour les forcer ; Vite doit tourner).
- **En fin de série ou avant une fusion :** `npm run verify -- --full` (environ 7 min) : trois graines sur tout le pool, 3 et 4 joueurs, IA mixte, bench, tests d'interface (dont `tutorial-smoke` et `ai-smoke`).
- **Résultat :** une ligne par étape avec sa durée ; détail en cas d'échec seulement ; journaux dans `test-results/verify/`.
- **CI** (`.github/workflows/ci.yml`) : `verify --ci` à chaque push sur `dev` ou `master` et à chaque pull request ; `verify --full --no-ui --no-bench` chaque nuit.
- **Fuzz à la main :** `npm run fuzz -- --games 300 --pool FIN --jobs 10` ; résultats identiques à graine égale, quel que soit `--jobs`.
- **Invariants** (`checkInvariants`, `ai/src/selfplay.ts`) : ils tournent à chaque décision du fuzz et de la fumée ; un seul parcours des objets, ni `JSON.stringify` ni copie d'état sans nécessité ; testés dans `ai/test/invariants.test.ts`.
- **Lot [règles]** (il change le comportement du moteur) : faire avancer `RULES_VERSION` (`engine/src/record.ts`, ligne d'historique), puis `npm run golden -- --update` ; `ai/test/golden.test.ts` échoue si une partie dorée ne se rejoue plus à l'identique à version égale.
- **Nouvelle mécanique visible :** un script Playwright ponctuel, avec captures dans `test-results/`.
- **Bench et `ai-smoke` :** fiables seulement sur secteur ; la machine (WSL, CPU réglable) varie beaucoup : comparer avant et après (`git stash`), jamais à un chiffre ancien ; un échec de peu de `ai-smoke` (« ralenti ×4 ») en fin de `--full` se relance seul avant de conclure.

## Pièges connus

- **Bundle :** données des cartes dans un chunk à part (`cartes-*.js`, `client/vite.config.ts`) ; le serveur compresse (brotli ou gzip) et met `/assets/` en cache un an ; un service worker (`client/public/sw.js`) permet de jouer hors ligne. Le worker ne doit pas importer `@mtgx/cards` (il reçoit ses définitions dans `start`) ; seul `@mtgx/cards/tokens` est permis. Premier chargement lent en dev : relancer un test d'interface qui échoue par délai juste après un redémarrage de Vite.
- **Vite sous WSL :** il peut servir une version périmée d'un module du moteur. Redémarrer `npm run dev` avant tout test dans le navigateur.
- **Champ de bataille (`client/src/board/layout.ts`) :** disposition en pur TypeScript, testée (`layout.test.ts`) ; chaque camp dimensionné indépendamment ; placement par type d'après MTGA (`battlefield-smoke` le vérifie) ; constantes d'espacement alignées avec `styles.css` ; colonne bornée (`minmax(0, 1fr)`) ; chercher un objet à l'écran avec `findObjectEl` (les jetons d'une pile n'ont pas tous d'élément) ; cartes exilées par un permanent (`view.exiledWith`) empilées derrière lui ; cartes jouables hors de la main (`view.playableElsewhere`) au bout de la main ; coût modifié en pastille (`ObjectView.castCost`).
- **Tablette et téléphone :** hauteurs en `dvh`, jamais `100vh` ; `fitHand` resserre la main ; tactile dans `client/src/touch.ts` (appui long = aperçu, premier tap lève la carte) ; tiroir sous 1100 px ; « Tournez votre appareil » en portrait sous 600 px ; `mobile-smoke` émule les appareils, mais tester la barre d'adresse sur un vrai appareil (`npm run dev -- --host`).
- **Images de Scryfall :** toute URL passe par `imageUrl` (`client/src/images.ts`) ; un composant qui affiche une image appelle `useRelayActive()` ; la route `/scry/` du serveur n'accepte que les images de cartes (liste blanche `SCRY_PATH`) : ne jamais l'élargir.
- **Sons (`client/src/audio/`) :** `sounds.ts` (table des fichiers), `eventSounds.ts` (événements → sons, testé), `sfx.ts` ; débloqués au premier geste ; un nouvel événement du moteur n'a pas de son tant qu'il n'est pas dans `soundsFor`.
- **Serveur de parties :** `npm run server` charge le moteur au démarrage (le relancer après une modification du moteur ou des cartes) et sert `packages/client/dist` (relancer `npm run build`).
- **Déploiement (VPS de l'utilisateur) :** machine partagée, nginx existant, **ni Docker ni Caddy ni unité systemd** : pm2 (`deploy/ecosystem.config.cjs`), serveur sur `127.0.0.1`. Les parties en cours sont sauvegardées (`data/rooms`) et reprises au démarrage en rejouant leurs décisions ; un changement de règles peut rendre une sauvegarde impossible à rejouer (fichier mis de côté).
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
- **`pgrep -f` / `pkill -f`** avec un motif présent dans la ligne de commande peuvent tuer le shell courant.

## Règle : pas de dette propre à une carte

- **Chercher d'abord une forme générique** avant d'ajouter, pour une seule carte, un champ, un membre d'union, une opération d'effet ou un champ d'état : famille paramétrée par un `ObjectFilter` (`BlockRule`, `ProtectionRule`, `playFrom`, `abilityCost`, `castLimit`, `triggerMod`…), journal du tour (`amount.turnEvents`) plutôt qu'un champ « ce tour-ci », effets sur les joueurs (`fx.thisTurn`), effet ou déclencheur existant.
- **Si une carte l'exige vraiment,** l'ajout est justifié dans `packages/cards/data/debt-baseline.json` (raison, famille cible) et signalé dans le lot.
- **`packages/cards/test/debt.test.ts` le vérifie** et échoue sur toute entrée nouvelle ou périmée : le plafond ne fait que baisser. Chiffres à jour : la référence elle-même.

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
