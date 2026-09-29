# CLAUDE.md — suivi et conventions de MTGX (MTG Mate)

Ce fichier sert au suivi du projet entre les sessions : où on en est, les règles de travail et les pièges. Le README présente le projet ; le détail des extensions, les approximations et la carte du moteur sont dans `docs/` (voir « Documents »).

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
| Relais des images Scryfall par le serveur (`/scry/`, bascule automatique, case « Images par le serveur MTG Mate », cache nginx) | ✅ |
| Tablette et téléphone (main ajustée à la largeur, appui long = aperçu, tap pour lever une carte, tiroir sous 1100 px, paysage imposé sur téléphone) | ✅ |
| Jeu en ligne : duel Standard à 2 (serveur local, code de salon, corde, reconnexion, revanche) | ✅ |
| Déploiement : pm2 derrière nginx sur un VPS (`docs/deploiement.md`, `deploy/`) | ✅ documenté et testé en local (pm2, nginx) |
| **Reality Fracture (FRA, « Réalité fracturée »)** | ✅ **279 / 279** (lots 0 à G, dont 4 decks préconstruits, retirés le 28/09/2026 ; les 3 dernières au lot 0.1 du socle multi-extensions) |
| **Edge of Eternities (EOE)** | ✅ **260 / 260** (lots A à D) |
| **Aetherdrift (DFT)** | ✅ **260 / 260** (lots A à C) |
| **Outlaws of Thunder Junction + The Big Score (OTJ, BIG)** | ✅ **269 / 269 + 30 / 30** (lots A à C) |
| **Final Fantasy (FIN)** | ✅ **307 / 307** (lots A à D4) |
| **Duskmourn: House of Horror (DSK, « Mornebrune »)** | ✅ **268 / 268** (lots A à D) |
| **Bloomburrow (BLB)** | ✅ **266 / 266** (lots A à C) |
| **The Lost Caverns of Ixalan (LCI, « Les cavernes oubliées d'Ixalan »)** | ✅ **279 / 279** (lots A à D) |
| Decks préconstruits : seulement les 5 decks de bienvenue (40 cartes FDN, joués tels quels malgré la règle des 60) et le Starter Kit Final Fantasy (Séphiroth, Cloud) ; les anciens decks FDN et FRA sont retirés | ✅ |
| Tutoriel « Apprendre à jouer » (9 leçons mises en scène, guidage strict, reprise au début de la leçon ; `docs/tutoriel.md`) | ✅ |
| IA à trois niveaux (débutant, moyen, élevé : combat par simulation, ISMCTS en duel ; `docs/ia.md`, tournoi `npm run arena`) | ✅ |
| Fiabilisation (29/09/2026) : serveur (validation des messages, débit), décisions mal formées refusées, fuzz « chaos », invariants élargis, tests synthétiques des couches (`docs/moteur.md`, « Règles de conception ») | ✅ |
| Socle P0 de l'audit (29/09/2026) : intégration continue, lancer pendant la résolution (608.2g), remplacements « au lieu du cimetière » (616.1), équipage / Fabrication / prolifération au choix du joueur, capacités de mana à coût sans la pile (605.3b) ; `docs/extensions/socle.md`, lots 0.11 à 0.14 | ✅ |
| P1 de l'audit (29/09/2026) : audit Oracle ↔ script (`coverage --audit`, test `audit.test.ts`), attentes déduites de l'Oracle (84 cartes), journal des événements du tour (`turnlog.ts`) ; lots 0.15 à 0.17 | ✅ |
| Autres extensions Standard | à la demande de l'utilisateur, une à la fois |


### Suite du travail

- **27/09/2026 :** l'intégration de tout le Standard d'un coup est abandonnée. La branche `standard` (socle multi-extensions, EOE, DFT, OTJ+BIG, FIN, vérification parallélisée) est fusionnée dans `master`.
- **28/09/2026 :** le travail se fait désormais sur la branche `dev` (créée depuis `master`).
- Ensuite : **une extension à la fois, sur `dev`, seulement quand l'utilisateur la nomme.**
- Découpage habituel d'une extension :
  - lot A : cartes faisables avec le moteur, jetons et terrains ;
  - lot B : mécaniques phares ;
  - lots C et suivants : légendaires et cartes uniques, jusqu'à 100 % ;
  - un commit par lot.

## Documents

- `AUDIT.md` : audit du 29/09/2026 (points forts et faibles, limites par rapport au vrai Magic, comparaison, feuille de route P0 à P4).
- `docs/moteur.md` : **à lire avant d'ajouter une mécanique**. Carte des fichiers du moteur, et où toucher pour un effet, un déclencheur, une condition, un filtre, un statique de joueur ou un mot-clé.
- `docs/approximations.md` : approximations connues, générales puis carte par carte (à lever si une carte l'exige). **Toute nouvelle approximation y est ajoutée.**
- `docs/extensions/<ext>.md` : mécaniques et détail des lots de chaque extension :
  - `fdn`, `fra`, `eoe`, `dft`, `otj-big`, `fin`, `dsk`, `blb`, `lci` ;
  - `socle` pour les lots transverses (faces multiples, Sagas, face cachée…).
  
  **Le détail d'un nouveau lot va là**, et CLAUDE.md ne reçoit qu'une ligne d'avancement.
- `docs/deploiement.md` : mise en production (pm2, nginx).
- `docs/tutoriel.md` : leçons du tutoriel, format des étapes, ajout d'une leçon.
- `docs/ia.md` : niveaux de l'IA, évaluation, combat par simulation, ISMCTS, tournoi et mesures.
- Textes Oracle des cartes à faire : `npm run coverage -- --set <ext> --text [--color W|U|B|R|G|M|C|L]` ; une carte : `--card "<nom>"`.
- Audit Oracle ↔ script : `npm run coverage -- --set <ext> --audit` (`cards/src/audit.ts`). Le test `cards/test/audit.test.ts` échoue sur tout nouvel écart ; un écart vérifié et voulu (équivalence, approximation documentée) va dans `cards/data/audit-baseline.json` avec sa raison.

## Conventions

- **Langue :**
  - interface, journal, commentaires et documents en **français** ;
  - l'interface **vouvoie** le joueur (« Votre tour », « À vous de jouer »), jamais de tutoiement ;
  - identifiants de code en anglais ;
  - l'utilisateur écrit en français.
- **Moteur :**
  - pur et déterministe (graine) ;
  - effets = données sérialisables (DSL `engine/src/dsl.ts`), jamais de fonctions dans l'état ;
  - une décision illégale lève une **`RulesError`** : l'IA et le fuzz en dépendent, une `Error` ordinaire fait planter une partie ;
  - toute modification pouvant changer des caractéristiques appelle `bump(s)` (cache des couches) ;
  - un nouveau champ de `GameState` doit être initialisé dans `game.ts` et, si besoin, dans le helper de test `engine/test/helpers.ts`.
- **Cartes :**
  - extensions déclarées dans `packages/cards/src/sets.ts` (données `data/<set>.json`, scripts, dernier numéro du set principal). Une réimpression garde la définition de la première extension ;
  - scripts dans `packages/cards/src/<set>/<couleur>.ts` ; le DSL et les jetons génériques sont dans `fdn/common.ts`, que `fra/common.ts` réexporte en y ajoutant ses propres jetons ;
  - disposition Scryfall `prepare` (FRA) : la face 0 est la carte, et la face 1 (le sort) va dans `CardDef.prepareFace`. La carte reste « non gérée » tant que le lot C n'est pas fait ;
  - ce qui se lit dans le texte Scryfall (mots-clés, prouesse, garde, « Équiper », loyauté) est déduit dans `cards/src/scryfall.ts` ;
  - légalité : `validateDeck` (format `standard` par défaut) refuse les cartes bannies, hors format ou sans légalité connue, réserve comprise ; les decks illégaux ne lancent pas de partie.
- **Jeu en ligne (`packages/server`) :**
  - le serveur fait autorité : il valide le deck (`validateDeck`, légal et jouable) et chaque décision (`RulesError` renvoyée au client) ;
  - un joueur ne reçoit que sa vue (`projectView`), ses événements filtrés (`filterEvents`) et les faces qu'il connaît (`visibleFaces`), jamais la decklist adverse ;
  - tout nouvel événement ou champ de vue qui peut citer une carte cachée doit être filtré ; l'audit `ai/test/hidden-info.test.ts` le vérifie ;
  - le protocole est dans `server/src/protocol.ts`, que le client importe en `import type`.
- **Données :**
  - `packages/cards/data/fdn.json` est indenté avec **1 espace** ; le réécrire à l'identique pour garder des diffs minimaux ;
  - réimport : `npm run import-cards -- fdn` ou `-- fra`.
- **Commits :**
  - uniquement quand l'utilisateur le demande ;
  - message en anglais, terminé par `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` ;
  - branche `dev` pour le travail courant (`master` = version stable) ;
  - remote `origin` (github.com/DosPuppet/MTGMate) : c'est l'utilisateur qui pousse, pas Claude.

## Vérifications avant de rendre un lot

- **Par lot :** `npm run verify -- --set <EXT>` (environ 70 s). Il lance :
  - `tsc`, Biome et la couverture ;
  - `vitest`, où le test de fumée est découpé en un fichier par extension (tous les cœurs) ;
  - le fuzz ciblé sur l'extension (`--pool <EXT>`, à 2, 3 et 4 joueurs, en IA mixte et en mode « chaos ») ;
  - un fuzz sur tout le pool ;
  - les tests d'interface seulement si le client, `view.ts` ou le protocole ont changé (`--ui` pour les forcer). Vite doit tourner. Ils tournent en deux files parallèles (environ 50 s ; `verify --set X --ui` : environ 125 s).
- **En fin d'extension ou avant une fusion :** `npm run verify -- --full` (environ 3 min). Il lance :
  - trois graines sur tout le pool, puis 3 et 4 joueurs, et l'IA mixte ;
  - le bench ;
  - les tests d'interface (dont `tutorial-smoke` et `ai-smoke`).
- **Résultat :** une ligne par étape, avec sa durée. Le détail n'est affiché qu'en cas d'échec ; tous les journaux sont dans `test-results/verify/`.
- **Intégration continue** (`.github/workflows/ci.yml`, GitHub Actions) :
  - à chaque push sur `dev` ou `master` et à chaque pull request : `npm run verify -- --ci` (contrôles, vitest, fuzz courts sur tout le pool, chaos compris ; environ 1 min en local) ;
  - chaque nuit : `verify --full --no-ui --no-bench` ;
  - les tests d'interface et le bench restent locaux ; les journaux d'un échec sont joints à l'exécution.
- **Fuzz à la main :** `npm run fuzz -- --games 300 --pool FIN --jobs 10`. Les résultats sont identiques à graine égale, quel que soit `--jobs`.
- **Bench :** il n'est fiable que sur secteur (le mode éco du CPU fausse les mesures). On juge une régression en comparant avant et après.
- **Nouvelle mécanique visible :** un script Playwright ponctuel, avec captures dans `test-results/`.

## Pièges connus

- **Bundle de l'interface :** toutes les cartes sont dans le bundle principal (6,3 Mo). Le worker ne doit pas importer `@mtgx/cards` (il reçoit ses définitions dans `start`) ; seul `@mtgx/cards/tokens` est permis. Le premier chargement en dev est lent (compilation des JSON) : relancer un test d'interface qui échoue par délai dépassé juste après un redémarrage de Vite.
- **Serveur Vite sous WSL :** il peut servir une version périmée d'un module du moteur après modification. Redémarrer `npm run dev` avant tout test dans le navigateur, ou vérifier avec `curl http://localhost:5173/@fs/<chemin absolu> | grep <nouveau code>`.
- **Champ de bataille (`client/src/board/layout.ts`) :**
  - la disposition est calculée en pur TypeScript et testée (`client/test/layout.test.ts`) ; les lignes sont découpées explicitement, pas par `flex-wrap` ;
  - chaque camp est dimensionné indépendamment (comme sur MTGA) : un adversaire très chargé ne rapetisse pas vos cartes ;
  - placement par type, d'après MTGA : créatures devant ; terrains, puis artefacts, puis enchantements derrière ; planeswalkers et batailles dans une zone à part tout à droite (recouvrement vertical s'ils sont nombreux) ; Auras et Équipements attachés rendus avec leur hôte ; `battlefield-smoke` vérifie ce rangement ;
  - cartes exilées par un permanent (`view.exiledWith` : exil lié et cartes liées) : empilées derrière lui comme les Auras, teintées, étiquette « Exil » ; celles d'une Aura ou d'un Équipement vont sous son hôte. Elles comptent dans la profondeur d'empilement de `fitBattlefield`. L'exil de chaque joueur se consulte par le bouton à côté du cimetière (`ExileViewer`) ;
  - batailles : placées chez leur contrôleur (MTGA les met chez le protecteur, que le moteur ne modélise pas encore) ;
  - les constantes d'espacement de `layout.ts` (GAP, SEPARATOR, TOKEN_OFFSET…) doivent rester alignées avec `styles.css` ;
  - la colonne du plateau est bornée (`grid-template-columns: minmax(0, 1fr)`) : sans cela, le contenu élargit la zone mesurée et la taille des cartes ne se réduit plus ;
  - les jetons d'une pile n'ont pas tous d'élément : chercher un objet à l'écran avec `findObjectEl` (et non `[data-oid]`).
- **Tablette et téléphone :**
  - hauteurs en `dvh`, jamais `100vh` (qui compte la barre d'adresse repliée des navigateurs mobiles) ;
  - la main se resserre pour tenir dans sa largeur (`fitHand`, `board/layout.ts`) ; `--hand-peek` règle la part visible des cartes (0,5 sous 560 px de haut) ;
  - tactile (`client/src/touch.ts`, `(hover: none), (pointer: coarse)`) : l'appui long sur une `Card` ouvre l'aperçu en surimpression (`peek` du store, `TouchPreview`) ; dans la main, le premier tap lève la carte, le second la joue ; le glisser reste possible ;
  - sous 1100 px de large, la barre latérale est un tiroir (bouton ☰) ; en portrait sous 600 px, la partie affiche « Tournez votre appareil » ;
  - `mobile-smoke` émule iPad, tablette Android, Pixel et iPhone (Playwright `devices`) ; appui long simulé par CDP (`Input.dispatchTouchEvent`). Une émulation ne reproduit pas la barre d'adresse : tester sur un vrai appareil avec `npm run dev -- --host`.
- **Images de Scryfall :**
  - toute URL d'image affichée passe par `imageUrl` (`client/src/images.ts`), qui la réécrit en `/scry/…` quand le relais est actif ; un composant qui affiche une image appelle `useRelayActive()` pour se redessiner à la bascule ;
  - la route `/scry/` du serveur (`server/src/index.ts`) n'accepte que les chemins d'images de cartes (liste blanche `SCRY_PATH`) : ne jamais l'élargir en proxy ouvert ;
  - en dev, Vite relaie `/scry` directement vers Scryfall (`client/vite.config.ts`) ; `proxy-smoke` bloque Scryfall avec `page.route`.
- **Effets sonores (`client/src/audio/`) :**
  - `sounds.ts` = table clé → fichiers de `public/sounds/` (changer un son = une ligne) ; `eventSounds.ts` = événements → sons, pur et testé ; `sfx.ts` = Web Audio ;
  - les navigateurs bloquent le son avant le premier geste : `unlockAudio` au premier `pointerdown` (main.tsx) ;
  - un nouveau type d'événement moteur n'a pas de son tant qu'il n'est pas ajouté à `soundsFor` ;
  - en mode dev, `window.__sfxLog` liste les sons joués (vérifié par `ui-smoke`).
- **Serveur de parties :** `npm run server` charge le moteur au démarrage ; le relancer après toute modification du moteur ou des cartes. Il sert `packages/client/dist` : relancer `npm run build` pour y voir les changements du client (en dev, Vite redirige `/ws` vers le port 8787).
- **Déploiement (VPS de l'utilisateur) :** machine partagée avec d'autres applis, nginx existant devant, **ni Docker ni Caddy ni unité systemd** : pm2 (`deploy/ecosystem.config.cjs`), serveur sur `127.0.0.1`. Une mise à jour (`deploy/update.sh`) redémarre le serveur ; les parties en cours sont sauvegardées (`data/rooms`, `MTGX_DATA_DIR`) et reprises au démarrage en rejouant leurs décisions. Un changement de comportement du moteur peut rendre une sauvegarde impossible à rejouer (fichier mis de côté en `.bad`).
- **Mode dev seulement :** `window.__mtgx` (bac à sable) et `window.__sfxLog` n'existent pas dans le build de production ; les scripts qui visent la production (`online-smoke --base`) ne doivent pas s'en servir.
- **Mode rapide des tests (`?fast`, dev seulement, `client/src/fast.ts`) :** l'IA joue sans sa pause de 0,9 s et un sort adverse n'est montré que 0,3 s. Les scripts d'interface ouvrent `/?fast`, sauf `battlefield-smoke`, qui audite un plateau figé et ne doit pas laisser l'IA jouer pendant la mesure. Une boucle de test qui joue une partie doit gérer les fenêtres de choix (« Suggestion » puis « Valider ») et la défausse, et échouer si la partie se bloque.
- **Tutoriel (`client/src/tutorial/`) :** chaque leçon est rejouée par `client/test/tutorial.test.ts`, et suivie dans le navigateur par `tutorial-smoke`. Modifier une leçon, une carte qu'elle utilise ou l'automatisme (arrêts) peut la bloquer : relancer les deux tests. La garde du guidage passe par `store.decide` et `store.endTurn` : une nouvelle façon d'envoyer une décision doit aussi passer par eux.
- **IA (`packages/ai`, `docs/ia.md`) :**
  - ne jamais lire la main adverse ni l'ordre des bibliothèques : l'ISMCTS passe par `determinize`, et `ismcts.test.ts` le vérifie ;
  - dans une simulation, appliquer les décisions par `step` (`evaluate.ts`), pas par `applyMutable` directement : ce dernier n'est pas transactionnel ;
  - budget de réflexion en temps dans l'interface, en itérations partout ailleurs (tests, tournoi, fuzz, bench : reproductibles) ;
  - juger un changement de l'IA au tournoi (`npm run arena`, 600 parties ou plus), pas sur quelques parties.
- **Mulligans :** ils se décident l'un après l'autre (le premier joueur d'abord) ; un script de test ne doit pas supposer l'ordre.
- **Bac à sable (mode dev) :** `window.__mtgx` expose le store ; `startGame(deck, decksIA, { p1: { cards, tokens }, p2: … })` met des permanents en jeu dès le début (voir `battlefield-smoke`). Dans `page.evaluate`, pas de fonction nommée (tsx injecte `__name`).
- **`pgrep -f` / `pkill -f` :** avec un motif présent dans la ligne de commande, ils peuvent tuer le shell courant.
- **Test de fumée (`ai/test/smoke/`, un fichier par extension, harnais `harness.ts`) :** une carte qui n'a pas pu être jouée fait échouer le test. Une nouvelle extension gérée reçoit son fichier et entre dans `OWN_FILES`. On arrête 80 décisions après que la carte a été jouée, et on passe aux graines 2 et 3 seulement si elle ne l'a pas été. Pour les cartes réactives (contresorts), l'adversaire doit avoir de quoi lancer des sorts.
- **Cache des caractéristiques :** tout ce dont une capacité statique ou une F/E variable dépend doit faire avancer la version d'état (`bump`). Les points de vie et l'élimination d'un joueur le font désormais. Le fuzz détecte les oublis (« cache des caractéristiques périmé »).
- **Biome :**
  - `npx biome check . | tail -1` cache les erreurs : lire toute la sortie, ou grep « Found » ;
  - un `*/` dans un commentaire JSDoc (« */* ») ferme le commentaire.
- **Patchs par recherche/remplacement :** Biome reformate le code. Un outil tolérant aux espaces est pratique (voir l'historique : `patch.py` dans le scratchpad de session).
- **Performances :** la machine (WSL) varie beaucoup d'une session à l'autre. Pour juger une régression, comparer `npm run bench` avant et après (`git stash`), pas avec un chiffre ancien.
