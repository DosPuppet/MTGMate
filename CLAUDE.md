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
| Decks préconstruits : les 5 decks de bienvenue (40 cartes FDN, joués tels quels malgré la règle des 60), le Starter Kit Final Fantasy (Séphiroth, Cloud) et, depuis le 30/09/2026, les 5 premiers decks du méta Standard avec leur réserve (`cards/decks/meta-*.json`) ; les anciens decks FDN et FRA sont retirés | ✅ |
| Tutoriel « Apprendre à jouer » (9 leçons mises en scène, guidage strict, reprise au début de la leçon ; `docs/tutoriel.md`) | ✅ |
| IA à trois niveaux (débutant, moyen, élevé : combat par simulation, ISMCTS en duel ; `docs/ia.md`, tournoi `npm run arena`) | ✅ |
| Fiabilisation (29/09/2026) : serveur (validation des messages, débit), décisions mal formées refusées, fuzz « chaos », invariants élargis, tests synthétiques des couches (`docs/moteur.md`, « Règles de conception ») | ✅ |
| Socle P0 de l'audit (29/09/2026) : intégration continue, lancer pendant la résolution (608.2g), remplacements « au lieu du cimetière » (616.1), équipage / Fabrication / prolifération au choix du joueur, capacités de mana à coût sans la pile (605.3b) ; `docs/extensions/socle.md`, lots 0.11 à 0.14 | ✅ |
| P1 de l'audit (29/09/2026) : audit Oracle ↔ script (`coverage --audit`, test `audit.test.ts`), attentes déduites de l'Oracle (84 cartes), journal des événements du tour (`turnlog.ts`) ; lots 0.15 à 0.17 | ✅ |
| P2 de l'audit (29/09/2026) : enregistrement des parties (`engine/src/record.ts`, graine + décisions), parties en ligne reprises après un redémarrage du serveur (`data/rooms`), export d'une partie et visionneur de replays | ✅ |
| P2 de l'audit, fin (29/09/2026) : images des jetons, bundle découpé et compressé, service worker (hors ligne), match BO3 avec réserve (contre l'IA et en ligne) | ✅ |
| Méta Standard, lot M1 (29/09/2026 ; plan P4, phase 1) : Izzet Spellementals et Mono-Green Landfall jouables, réserve comprise (22 cartes de 9 extensions) ; Harmonie, Marchandage, contempler, maîtrise de la terre ; `docs/extensions/meta.md` | ✅ |
| Méta Standard, lot M2 : Dimir Midrange et Jund Sacrifice (23 cartes) ; flétrir, Travail d'équipe, amasser | ✅ |
| Méta Standard, lot M3 : Dimir Excruciator, Azorius Control, Selesnya Landfall (15 cartes) ; évocation, mana dépensé par type, mobilisation, montée en puissance, réunir des preuves | ✅ |
| Méta Standard, lot M4 : 4c Control, Boros Dragons, Jeskai Artifacts (23 cartes) ; type de terrain choisi en jouant le terrain, exploiter, convergence, maîtrise du feu | ✅ |
| Méta Standard, lot M5 : Boros Dwarves, Lifegain, Mardu Discard, Boros Tokens (34 cartes) ; Storied, faufilement, chaos, paradigme, équiper digne | ✅ |
| Méta Standard, lot M6 : les six derniers archétypes (47 cartes) ; maîtrise de l'air, Web-slinging, payer X PV, tours passés. **Phase 1 du plan P4 finie : les 20 archétypes du méta (88,1 %) sont jouables** | ✅ |
| Phase 2 du plan P4 : **Tarkir: Dragonstorm (TDM)** à 100 % (`docs/plans/PLAN-P4.md`, `docs/extensions/tdm.md`) | ✅ **259 / 259** (lots A à D, 01/10/2026) ; lot D : remplacements de blessures génériques (R1, familles E et F), `RULES_VERSION` = 21 |
| **Lorwyn Eclipsed (ECL, « Lorwyn éclipsé »)** (`docs/extensions/ecl.md`) | ✅ **266 / 266** (lots A à D, 01/10/2026 ; `RULES_VERSION` = 25) |
| **Wilds of Eldraine (WOE, « Les friches d'Eldraine »)** (`docs/extensions/woe.md`) | ✅ **269 / 269** (socle 0, sous-lots A1 à A6, B1 à B4, C1 à C5, 01/10/2026 ; `RULES_VERSION` = 26) |
| **Secrets of Strixhaven (SOS, « Les secrets de Strixhaven »)** (`docs/extensions/sos.md`) | ✅ **262 / 262** (socle 0, sous-lots A1 à A6, B1 à B3, C1 à C3, 01/10/2026 ; `RULES_VERSION` = 32) |
| **Murders at Karlov Manor (MKM, « Meurtres au manoir Karlov »)** (`docs/extensions/mkm.md`) | ✅ **268 / 268** (socle 0, sous-lots A1 à A6, B1 à B4, C1 à C3, 02/10/2026 ; `RULES_VERSION` = 37) |
| **Avatar: The Last Airbender (TLA)** (`docs/extensions/tla.md`) | ✅ **280 / 280** (socle 0, sous-lots A1 à A6, B1 et B2, C1 à C3, 02/10/2026 ; `RULES_VERSION` = 45) |
| Plan de remédiation de l'audit du 30/09/2026 (`docs/plans/PLAN-R.md`, lots F1 à R8) : F1 à F3 (fondations), R0 (corrections rapides), R4.0 à R4.6, R2.1 à R2.5, R1 en partie, R3 (copies de sorts, répartition), R5 à R8 faits, `RULES_VERSION` = 19 ; restent R1 en partie (familles E, H, I, boucliers 615.7) et R7 (continu), suivis par la section « Ajouter des cartes ou une extension » | ✅ (plan archivé le 01/10/2026) |
| Autres extensions Standard | à la demande de l'utilisateur, une à la fois |


### Suite du travail

- **27/09/2026 :** l'intégration de tout le Standard d'un coup est abandonnée. La branche `standard` (socle multi-extensions, EOE, DFT, OTJ+BIG, FIN, vérification parallélisée) est fusionnée dans `master`.
- **28/09/2026 :** le travail se fait désormais sur la branche `dev` (créée depuis `master`).
- Ensuite : **une extension à la fois, sur `dev`, seulement quand l'utilisateur la nomme.**
- **30/09/2026 :** pas de nouvelles cartes tant que le moteur n'est pas sécurisé et finalisé (`docs/plans/PLAN-R.md`) ; Tarkir: Dragonstorm (phase 2 du P4) attend.
- **01/10/2026 :** PLAN-R terminé (sauf R1 en partie et R7, continu) et archivé avec son audit. Les nouvelles cartes peuvent reprendre, en suivant la section « Ajouter des cartes ou une extension » (fin de ce fichier).
- **01/10/2026 :** Tarkir: Dragonstorm faite à la demande de l'utilisateur (phase 2 du plan P4), lots A à D (`docs/extensions/tdm.md`). Prochaine extension : à la demande de l'utilisateur (suggestion du plan P4 : SOS ou TLA).
- **01/10/2026 :** Lorwyn Eclipsed faite à la demande de l'utilisateur, lots A à D (`docs/extensions/ecl.md`) ; le lot D a fait les familles H et I de R1. Prochaine extension : à la demande de l'utilisateur.
- **01/10/2026 :** l'utilisateur demande Wilds of Eldraine, Secrets of Strixhaven et Murders at Karlov Manor, dans cet ordre, par lots et sous-lots, un commit par sous-lot, sur `dev` sans fusion dans `master`. Wilds of Eldraine faite (`docs/extensions/woe.md`), puis Secrets of Strixhaven (`docs/extensions/sos.md`), puis Murders at Karlov Manor (`docs/extensions/mkm.md`, terminée le 02/10/2026). Prochaine extension : à la demande de l'utilisateur.
- **02/10/2026 :** l'utilisateur demande Avatar: The Last Airbender puis Marvel Super Heroes, par lots et sous-lots, un commit par sous-lot, sur `dev` sans fusion dans `master`. Avatar: The Last Airbender faite (`docs/extensions/tla.md`) ; suivante : MSH.
- **29/09/2026 (plan P4) :** exception décidée par l'utilisateur. On écrit d'abord les cartes des decks du méta Standard (lots M1 à M6, toutes extensions confondues ; des extensions restent donc partielles), puis Tarkir: Dragonstorm à 100 %. Un lot du méta se vérifie avec `npm run verify -- --set META`.
- Découpage habituel d'une extension :
  - lot A : cartes faisables avec le moteur, jetons et terrains ;
  - lot B : mécaniques phares ;
  - lots C et suivants : légendaires et cartes uniques, jusqu'à 100 % ;
  - un commit par lot.

## Documents

- `docs/plans/` : plans archivés.
  - `PLAN-R.md` : remédiation de l'audit du 30/09/2026 (lots F1 à R8, fait le 30/09/2026 ; décisions de conception, écarts trouvés en route, version des règles et replays, « Reporté tant qu'aucune carte ne l'exige »).
  - `PLAN-P4.md` : plan de couverture (méta Standard, fait ; puis Tarkir: Dragonstorm, à faire) ; instantané des decks du méta dans `docs/meta/2026-09-29/`.
- `docs/audits/` : audits archivés. `2026-09-30.md` : audit centré sur les règles du moteur (17 écarts avec les règles officielles, dette de conception, interface face à Arena, sécurité du serveur, comparaison, feuille de route R0 à R8, tous marqués corrigés ou non) ; `2026-09-29.md` : l'audit précédent et sa feuille de route P0 à P4.
- `docs/moteur.md` : **à lire avant d'ajouter une mécanique**. Carte des fichiers du moteur, et où toucher pour un effet, un déclencheur, une condition, un filtre, un statique de joueur ou un mot-clé.
- `docs/approximations.md` : approximations connues, générales puis carte par carte (à lever si une carte l'exige). **Toute nouvelle approximation y est ajoutée.**
- `docs/extensions/<ext>.md` : mécaniques et détail des lots de chaque extension :
  - `fdn`, `fra`, `eoe`, `dft`, `otj-big`, `fin`, `dsk`, `blb`, `lci`, `tdm`, `ecl`, `woe`, `sos`, `mkm`, `tla` ;
  - `socle` pour les lots transverses (faces multiples, Sagas, face cachée…) ;
  - `meta` pour les lots du méta Standard (plan P4, phase 1), avec une section par extension touchée.
  
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

- **Par lot :** `npm run verify -- --set <EXT>` (environ 70 s ; `--set META` pour un lot du méta, dont le fuzz joue les decks du méta jouables). Il lance :
  - `tsc`, Biome et la couverture ;
  - `vitest`, où le test de fumée est découpé en un fichier par extension (tous les cœurs) ;
  - le fuzz ciblé sur l'extension (`--pool <EXT>`, à 2, 3 et 4 joueurs, en IA mixte et en mode « chaos ») ;
  - un fuzz sur tout le pool ;
  - les tests d'interface seulement si le client, `view.ts` ou le protocole ont changé (`--ui` pour les forcer). Vite doit tourner. Ils tournent en deux files parallèles (environ 50 s ; `verify --set X --ui` : environ 125 s).
- **En fin d'extension ou avant une fusion :** `npm run verify -- --full` (environ 7 min, dont 3 de tests d'interface et de bench). Il lance :
  - trois graines sur tout le pool, puis 3 et 4 joueurs, et l'IA mixte ;
  - le bench ;
  - les tests d'interface (dont `tutorial-smoke` et `ai-smoke`).
- **Résultat :** une ligne par étape, avec sa durée. Le détail n'est affiché qu'en cas d'échec ; tous les journaux sont dans `test-results/verify/`.
- **Intégration continue** (`.github/workflows/ci.yml`, GitHub Actions) :
  - à chaque push sur `dev` ou `master` et à chaque pull request : `npm run verify -- --ci` (contrôles, vitest, fuzz courts sur tout le pool, chaos compris ; environ 1 min en local) ;
  - chaque nuit : `verify --full --no-ui --no-bench` ;
  - les tests d'interface et le bench restent locaux ; les journaux d'un échec sont joints à l'exécution.
- **Fuzz à la main :** `npm run fuzz -- --games 300 --pool FIN --jobs 10`. Les résultats sont identiques à graine égale, quel que soit `--jobs` (chaque partie ne dépend que de son numéro dans la série). `verify` lance toutes ses séries ensemble (`fuzz.ts --batch`) : un seul groupe de processus, qui prend les parties par petits paquets.
- **Coût des invariants :** `checkInvariants` (`ai/src/selfplay.ts`) tourne à chaque décision du fuzz et de la fumée. Ce qui s'y ajoute se paie des milliers de fois : un seul parcours des objets, pas de `JSON.stringify` ni de copie d'état sans nécessité. Ses contrôles sont testés dans `ai/test/invariants.test.ts`.
- **Bench :** il n'est fiable que sur secteur (le mode éco du CPU fausse les mesures). On juge une régression en comparant avant et après.
- **Lot qui change le comportement du moteur (« [règles] », `docs/plans/PLAN-R.md`) :** faire avancer `RULES_VERSION` (`engine/src/record.ts`, avec une ligne d'historique), puis régénérer les parties dorées (`npm run golden -- --update`). Le test `ai/test/golden.test.ts` échoue si une partie dorée ne se rejoue plus à l'identique à version égale.
- **Nouvelle mécanique visible :** un script Playwright ponctuel, avec captures dans `test-results/`.

## Pièges connus

- **Bundle de l'interface :** les données des cartes forment un fichier à part (`cartes-*.js`, 5,8 Mo, 750 Ko en brotli ; `client/vite.config.ts`), le code de l'application un autre (1 Mo). Le serveur Node compresse (brotli ou gzip, en mémoire) et met `/assets/` en cache un an (`index.html` jamais). En production, un service worker (`client/public/sw.js`) garde l'application en cache et permet une partie contre l'IA hors ligne. Le worker ne doit pas importer `@mtgx/cards` (il reçoit ses définitions dans `start`) ; seul `@mtgx/cards/tokens` est permis. Le premier chargement en dev est lent (compilation des JSON) : relancer un test d'interface qui échoue par délai dépassé juste après un redémarrage de Vite.
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
  - cartes jouables hors de la main (exil, cimetières, dessus de la bibliothèque : flashback, Icetill Explorer, sorts préparés, capacités activables depuis le cimetière) : `view.playableElsewhere` (permission sans le timing : `castTerms`, `landPermitted`), présentées au bout de la main avec un liseré et une étiquette de zone (`.from-elsewhere`, `.zone-tag`).
  - coût de mana modifié (réductions, taxes, flashback…) : `ObjectView.castCost` (texte et écart de VM, calculé par `spellCost` pour les cartes jouables du spectateur), affiché en pastille sur la carte (`.cost-badge`, verte si moins cher, rouge si plus cher).
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
- **Réglages retenus :** arrêts, contrôle total, « garder la priorité » et langue sont gardés dans `localStorage` (`mtgmate.autopilot`, `mtgmate.lang` ; `client/src/store.ts`). « Fin du tour » est une passe douce (elle s'arrête dès qu'un adversaire met quelque chose sur la pile) ; Maj+Entrée ou Maj+clic, une passe dure.
- **Annuler un terrain engagé (`undoMana`) :** n'est pas une option de `legalActions` (l'IA aléatoire engagerait et dégagerait sans fin) ; la vue marque `undoMana` sur les sources annulables de son joueur, et l'interface l'envoie au clic.
- **Mode dev seulement :** `window.__mtgx` (bac à sable) et `window.__sfxLog` n'existent pas dans le build de production ; les scripts qui visent la production (`online-smoke --base`) ne doivent pas s'en servir.
- **Mode rapide des tests (`?fast`, dev seulement, `client/src/fast.ts`) :** l'IA joue sans sa pause de 0,9 s et un sort adverse n'est montré que 0,3 s. Les scripts d'interface ouvrent `/?fast`, sauf `battlefield-smoke`, qui audite un plateau figé et ne doit pas laisser l'IA jouer pendant la mesure. Une boucle de test qui joue une partie doit gérer les fenêtres de choix (« Suggestion » puis « Valider ») et la défausse, et échouer si la partie se bloque.
- **Tutoriel (`client/src/tutorial/`) :** chaque leçon est rejouée par `client/test/tutorial.test.ts`, et suivie dans le navigateur par `tutorial-smoke`. Modifier une leçon, une carte qu'elle utilise ou l'automatisme (arrêts) peut la bloquer : relancer les deux tests. La garde du guidage passe par `store.decide` et `store.endTurn` : une nouvelle façon d'envoyer une décision doit aussi passer par eux.
- **IA (`packages/ai`, `docs/ia.md`) :**
  - ne jamais lire la main adverse, la liste de son deck ni l'ordre des bibliothèques : l'ISMCTS passe par `determinize`, qui ne tire que des cartes vues, et `ismcts.test.ts` le vérifie ;
  - dans une simulation, appliquer les décisions par `step` (`evaluate.ts`), pas par `applyMutable` directement : ce dernier n'est pas transactionnel ;
  - budget de réflexion en temps dans l'interface, en itérations partout ailleurs (tests, tournoi, fuzz, bench : reproductibles) ;
  - juger un changement de l'IA au tournoi (`npm run arena`, 600 parties ou plus), pas sur quelques parties.
- **Rythme de la partie (résolutions montrées une à une) :**
  - l'hôte (`GameHost`, option `frames`, activée par le worker et le serveur) envoie une mise à jour à chaque étape de la pile (élément ajouté, résolu, contrecarré, sans cible), sans décision en attente tant que l'automatisme continue ;
  - le client les joue dans l'ordre (`playback` dans `store.ts`) : chaque résolution est montrée (`resolving`, encart « Résolution » et cibles en surbrillance) avant d'appliquer son effet, puis le résultat reste un instant ; les durées suivent le réglage « Effets » de la barre latérale (Lent, Normal, Rapide, Sans pause ; `playbackTimes`, retenu dans `localStorage`), un instant en mode `?fast` ;
  - pendant la lecture, `decide` est ignoré ; le visionneur de replays applique les étapes sans attendre.
- **Mulligans (103.5) :** tour de table par tour de table. Chaque joueur encore en lice déclare, dans l'ordre de jeu, s'il garde ou prend un mulligan ; ceux qui en prennent un le prennent ensemble à la fin du tour de table, puis redécident. Un script de test ne doit pas supposer l'ordre.
- **Bac à sable (mode dev) :** `window.__mtgx` expose le store ; `startGame(deck, decksIA, { p1: { cards, tokens }, p2: … })` met des permanents en jeu dès le début (voir `battlefield-smoke`). Dans `page.evaluate`, pas de fonction nommée (tsx injecte `__name`).
- **`pgrep -f` / `pkill -f` :** avec un motif présent dans la ligne de commande, ils peuvent tuer le shell courant.
- **Test de fumée (`ai/test/smoke/`, un fichier par extension, harnais `harness.ts`) :** une carte qui n'a pas pu être jouée fait échouer le test. Une nouvelle extension gérée reçoit son fichier et entre dans `OWN_FILES`. On arrête 80 décisions après que la carte a été jouée, et on passe aux graines 2 et 3 seulement si elle ne l'a pas été. Pour les cartes réactives (contresorts), l'adversaire doit avoir de quoi lancer des sorts.
- **Cache des caractéristiques :** tout ce dont une capacité statique ou une F/E variable dépend doit faire avancer la version d'état (`bump`). Les points de vie et l'élimination d'un joueur le font désormais. Le fuzz détecte les oublis (« cache des caractéristiques périmé »).
- **Biome :**
  - `npx biome check . | tail -1` cache les erreurs : lire toute la sortie, ou grep « Found » ;
  - un `*/` dans un commentaire JSDoc (« */* ») ferme le commentaire.
- **Patchs par recherche/remplacement :** Biome reformate le code. Un outil tolérant aux espaces est pratique (voir l'historique : `patch.py` dans le scratchpad de session).
- **`ai-smoke` en fin de `verify --full` :** la mesure « ralenti ×4 » (médiane < 1,6 s) échoue parfois de peu, la machine étant chargée par les étapes précédentes ; relancer `npm run ai-smoke` seul avant de conclure à une régression.
- **Performances :** la machine (WSL) varie beaucoup d'une session à l'autre. Pour juger une régression, comparer `npm run bench` avant et après (`git stash`), pas avec un chiffre ancien.

## Règle pour la suite : arrêter la croissance des drapeaux propres à une carte

Audit du 30/09/2026, § 3.3 ; `docs/plans/PLAN-R.md`, lots R4.

- **Chercher d'abord une forme générique** avant d'ajouter, pour une seule carte, un champ à `PlayerStaticAbilityDef`, un membre à `Keyword`, une opération d'effet ou un champ d'état :
  - une famille paramétrée par un `ObjectFilter` (« ne peut pas être bloquée par [filtre] », « protection contre [filtre] », modificateurs de coût, jouer depuis une zone, restrictions de joueur…) ;
  - le journal du tour (`amount.turnEvents`) ;
  - les effets sur les joueurs (`fx.thisTurn`) ;
  - un effet ou un déclencheur existant.
- **Si une carte l'exige vraiment,** l'ajout est justifié dans `packages/cards/data/debt-baseline.json` (raison, famille cible) et signalé dans le lot.
- **`packages/cards/test/debt.test.ts` le vérifie :** il échoue sur tout drapeau, mot-clé non imprimé ou opération d'une seule carte absent de la référence, et sur toute entrée périmée. Un lot qui supprime un drapeau, ou dont l'opération sert désormais à plusieurs cartes, retire l'entrée : le plafond ne fait que baisser.
- **Départ au 30/09/2026 :** 96 drapeaux de `PlayerStaticAbilityDef`, 33 mots-clés non imprimés, 61 opérations utilisées par une seule carte. **Après R4 :** 69, 13 et 58 (familles génériques : `BlockRule`, `ProtectionRule`, `PowerRule`, `playFrom`, `abilityCost`, `castLimit`, `triggerMod`, `nextSpell`, `counterOnOrCreate`).

## Ajouter des cartes ou une extension : suivre R1 et R7

Suite de `docs/plans/PLAN-R.md` (lots R1 et R7, non terminés). À appliquer à chaque lot de cartes, extension complète ou lot du méta, en plus de la règle précédente.

**R1 — remplacements et prévention (616, 615) :**
- Un effet qui modifie un nombre (blessures, marqueurs, PV gagnés, cartes piochées) passe par `modifiers.ts` (`AmountMod`, `chooseReplacementOrder`), dans `dealDamage`, `changeCounters`, `gainLife` ou `drawCards` : jamais un ordre fixe écrit dans le code, ni une pioche qui contourne `drawCards`.
- **Familles E et F (blessures, perte de PV, prévention) : faites** (lot D de TDM, 01/10/2026). Un remplacement de blessures ou de perte de PV s'écrit avec `eventReplacement({ event, source, to, toFilter, combat, modify : { add, times, atLeastSourcePower, prevent }, onPrevent, condition })` (capacité imprimée) ou `fx.thisTurn({ replacement })` (effet), jamais avec un nouveau drapeau ; boucliers « la prochaine fois que » (615.7) : `fx.shield(…)`.
- **Familles H et I (jetons, marqueurs, PV gagnés, pioche, meule, mana) : faites** (lot D de Lorwyn Eclipsed, 01/10/2026). Même cadre : `eventReplacement({ event : "tokens" | "counters" | "lifeGain" | "draw" | "mill" | "mana" | "untap", to, toFilter, counter, effectOnly, instead, plus, manaProduced, extraMana, modify, condition })` ; les doubleurs (`doubler`) et les drapeaux de ces familles ont été convertis et retirés. Marqueurs de bouclier (122.1c) : sur ce même cadre, avec la première carte qui en a besoin.
- Avant d'implémenter une règle reportée, relire « Reporté tant qu'aucune carte ne l'exige » dans `docs/plans/PLAN-R.md` (bloquer plusieurs attaquants, batailles, phasing, couche 3, boucles abrégées, `ChoiceRequest` pour l'ordre des remplacements…).
- Tout changement de comportement du moteur : `RULES_VERSION` et parties dorées (voir « Vérifications avant de rendre un lot »).

**R7 — justesse des cartes :**
- **Un fichier de tests de règles par extension :** `packages/engine/test/<ext>.test.ts`, créé dès la première carte gérée de l'extension (même partielle, même par un lot du méta), complété à chaque lot. Chaque test vérifie le texte Oracle (« fait ce que dit la carte »), pas seulement que la carte se joue : au moins les mécaniques nouvelles et les cartes aux effets non triviaux. Modèles : `ecl.test.ts`, `mkm.test.ts`.
- **Décisions officielles :** une interaction de règles nouvelle ou délicate (copies, remplacements, lien de vie, nettoyage, couches, prouesse…) reçoit un test tiré des rulings Scryfall dans `packages/engine/test/rulings.test.ts`.
- **Attentes de l'Oracle :** si une forme de texte simple revient dans l'extension (« Destroy target… », « Each opponent… »), ajouter son motif dans `packages/cards/test/oracle-expectations.test.ts` (fonction `clause`).
- **Écart trouvé :** corriger le moteur ou le script ; sinon, approximation documentée dans `docs/approximations.md` (et dans `cards/data/audit-baseline.json` si l'audit Oracle ↔ script le signale). Ne jamais écrire un test qui fige un comportement faux.
- **Rendre le lot :** le compte rendu donne le nombre de tests ajoutés et les écarts trouvés.
