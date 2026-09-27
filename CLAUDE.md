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
| **Reality Fracture (FRA, « Réalité fracturée »)** | ✅ **279 / 279** (lots 0 à G, dont 4 decks préconstruits ; les 3 dernières cartes au lot 0.1 de la branche `standard`) |
| **Edge of Eternities (EOE)** | ✅ **260 / 260** (lots A à D, branche `standard`) |
| **Aetherdrift (DFT)** | ✅ **260 / 260** (lots A à C, branche `standard`) |
| **Outlaws of Thunder Junction + The Big Score (OTJ, BIG)** | ✅ **269 / 269 + 30 / 30** (lots A à C, branche `standard`) |
| **Final Fantasy (FIN)** | ✅ **307 / 307** (lots A à D4, branche `standard`) |
| Autres extensions Standard | branche `standard`, plan par lots ci-dessous |

### Branche `standard` : tout le Standard

Objectif : les 18 extensions Standard restantes (environ 4 360 cartes), **100 % des cartes, sans exclusion**, un commit par lot. Plan détaillé : `~/.claude/plans/je-voudrais-faire-une-velvet-kitten.md`.

- **Phase 0, socle transverse :**
  - 0.1 FRA à 100 % ✅ ;
  - 0.2 import de tout le Standard ✅ ;
  - 0.3 cartes à plusieurs faces ✅ (modèle) ;
  - 0.4 aventures et présages ✅ ;
  - 0.5 transformation, cartes recto-verso modales, assemblage ✅ ;
  - 0.6 cartes scindées et Salles ✅ ;
  - 0.7 Sagas, Classes, Affaires ✅ ;
  - 0.8 cartes face cachée ✅ ;
  - 0.9 mots-clés communs ✅ ;
  - 0.10 performances ✅.
- **Phase 0 terminée.**
- **Phase 1, extensions** (lots A/B/C, D pour FIN) : EOE ✅, DFT ✅, OTJ+BIG ✅, BLB, TDM, WOE, SOS, ECL, TLA, SPM, MSH, TMT, HOB, MKM, DSK, LCI, FIN.
- **Phase 2 :** decks Standard multi-extensions, puis clôture (5 158 / 5 158).
- **Consigne de l'utilisateur (27/09/2026) :** après OTJ+BIG, ne plus enchaîner les extensions du plan ; l'utilisateur dira laquelle implémenter ensuite.

Lot 0.1 : le moteur gagne :
- la **couche 1** (`LayerMods.copyOf`, effet `becomeCopy`, `copiedDefId`) : copie pour une durée, statiques et déclencheurs de la définition copiée, face copiée dans l'interface ;
- le déclencheur « quand vous lancez ce sort » (`castSelf`, source sur la pile) ;
- la garde « sacrifiez N permanents » ;
- les effets qui durent tant qu'une carte reste en exil (`untilExiledUid`) et la permission de lancer « tant qu'elle reste exilée » (`grantPlay` avec `forever`) ;
- les copies de cartes (`GameObject.cardCopy` : elles quittent l'exil seulement pour la pile et deviennent des jetons en arrivant) ;
- la règle des légendes suspendue pour le tour (`noLegendRuleThisTurn`).

Lot 0.2 :
- les 18 extensions sont importées : 5 174 cartes au total, dont 836 gérées (FDN, FRA et une quarantaine de créatures « à mots-clés seuls ») ;
- `npm run import-cards -- all` importe toutes les extensions sauf FDN et FRA ;
- les dispositions multi-faces (aventure, carte scindée, recto-verso, assemblage) gardent toutes leurs faces (`RawCard.faces`), et restent non gérées jusqu'aux lots 0.3 à 0.6 ;
- `npm run coverage -- --set all` donne le détail par extension, et `--set standard` se limite aux cartes légales ;
- le test de fumée est groupé par extension, et le test de légalité vérifie la liste exacte des 13 bannies ;
- le worker de partie reçoit les définitions des cartes des decks avec le message `start`, au lieu d'embarquer toute la base (6 Mo → 163 Ko). Les jetons du bac à sable viennent de `@mtgx/cards/tokens`, un module léger ;
- l'interface embarque toujours toutes les données : 6,3 Mo, 1,3 Mo compressé.

Lot 0.3 (modèle des cartes à plusieurs faces) :
- `CardDef.layout` et `CardDef.faceDefs` : une définition complète par face, construite par `toCardDef` avec le script cherché au nom de la face. La carte porte le recto, ou la réunion des deux moitiés d'une carte scindée (709.4 : valeur de mana additionnée, couleurs et types réunis) ;
- `registerDef` enregistre une carte et ses faces dans la partie (création de partie, bac à sable, tests) ;
- une carte à plusieurs faces reste non gérée tant que sa disposition n'est pas dans `HANDLED_LAYOUTS` (`cards/src/scryfall.ts`) et que toutes ses faces ne sont pas gérées ; les cartes d'assemblage (meld) aussi ;
- decklists : le recto seul (MTGA), « A/B » (MTGO) et le nom français du recto sont reconnus. L'export donne le recto seul, sauf pour une carte scindée (« A // B ») ;
- interface : les autres faces sont affichées dans l'aperçu (`CardFace.otherFaces`), avec un bouton « Voir le verso » (touche F) pour une carte recto-verso ; le deckbuilder cherche dans toutes les faces.

Lot 0.4 (aventures et présages) :
- `castableFaces` (stack.ts) : la carte et son aventure sont deux options de lancement (`ActionOption.face`, `CastChoices.face`). Une carte « en aventure » ne propose que la créature ;
- sur la pile, la face lancée donne les caractéristiques (`GameObject.faceDefId`, lu par `chars` et par la vue) ;
- une Aventure résolue part en exil « en aventure » (`onAdventure`), d'où son propriétaire peut lancer la créature. Contrecarrée, elle va au cimetière ;
- un présage (sous-type Omen, même disposition Scryfall que l'aventure) résolu est mélangé dans la bibliothèque ;
- interface : le menu de la carte en main propose « Lancer [créature] » et « Lancer [aventure] ». Tests dans `engine/test/faces.test.ts`.

Lot 0.5 (recto-verso et assemblage) :
- transformation (712) : effet `transform` (`fx.transform`), `MoveSpec.transformed` (arrive transformée). Le verso donne les caractéristiques via `faceDefId` (couches, déclencheurs, capacités, vue) ; la valeur de mana du verso est celle du recto (712.8e) ; événement `transform` dans le journal ;
- cartes recto-verso modales : l'une ou l'autre face se lance (`castableFaces`), et le permanent arrive avec la face lancée ;
- assemblage (701.42) :
  - l'importeur garde les cartes à assemblage comme des cartes simples, avec `meld: { parts, result }` ;
  - chaque partie embarque la définition de la carte assemblée (`meldResultDef`) ;
  - l'effet `meld` exile les deux cartes et crée un seul permanent (`GameObject.melded`), qui redevient ses deux cartes en quittant le champ de bataille ;
  - la carte assemblée ne se met pas dans un deck (légalité, deckbuilder, test de fumée) ;
  - l'invariant de décompte compte deux cartes pour un permanent assemblé ;
- importeur : reprise automatique sur l'erreur 429 de Scryfall ; la disposition des cartes simples non normales (saga, class, case, meld) est conservée.

Lot 0.6 (cartes scindées et Salles) :
- carte scindée (709) : chaque moitié se lance à part (faces 0 et 1) ; hors de la pile, la carte réunit les deux moitiés ;
- Salle (709.5) :
  - sur le champ de bataille, la Salle a le nom, les couleurs et les capacités de ses portes déverrouillées (`GameObject.unlocked`, `roomBase` dans layers.ts) ;
  - la porte lancée est déverrouillée à l'arrivée ; une Salle mise en jeu autrement arrive verrouillée ;
  - déverrouiller une porte est une action spéciale en rituel (`ActivatedAbilityDef.specialAction` : coût payé, pas de pile), générée par `toCardDef` pour chaque porte ;
  - « quand vous déverrouillez cette porte » (`when.unlockThisDoor`) : la porte est fixée à l'import ; condition `cond.fullyUnlocked` ;
- capacités calculées (Salle, verso, copie) dans les boucles des remplacements, des réductions de coût, des statiques et du filtre des déclencheurs.

Lot 0.7 (Sagas, Classes, Affaires) :
- Saga (714) :
  - dernier chapitre lu dans le texte (`CardDef.saga.chapters`) ;
  - un marqueur de savoir à l'arrivée et au début de la première phase principale (action de tour) ;
  - chapitres écrits avec `chapter([1, 2], effets)` (déclencheur `chapter`) ;
  - sacrifiée (action basée sur l'état) quand le dernier chapitre est atteint et qu'aucun chapitre n'attend ;
- Classe (716) : capacités de niveau dans le script (`classLevels`), coûts « {W}: Level 2 » lus dans le texte, capacités « Niveau N » générées (rituel, depuis le niveau N−1), déclencheur `when.classLevel(n)` ;
- Affaire (719) : `caseToSolve` (condition) et `caseSolved` (capacités) dans le script ; le déclencheur « au début de votre étape de fin, si elle n'est pas résolue et que la condition est remplie, elle est résolue » est généré ;
- `levelAbilities` (layers.ts) ajoute les capacités des niveaux atteints et les capacités « Résolue » ; l'aperçu affiche le niveau ou « Affaire résolue » ;
- tests : `engine/test/levels.test.ts`. Le helper `advanceUntil` avance la partie en passant les attaques, les blocages et les choix.

Lot 0.8 (cartes face cachée, 708) :
- un objet face cachée prend la définition générique `FACE_DOWN_DEF` (créature 2/2 sans nom, valeur de mana 0) ; la vraie carte, la garde et les coûts pour le retourner sont dans `GameObject.faceDown`. Vues, événements, couches et déclencheurs cachent donc la carte sans traitement particulier ;
- déguisement : `CardDef.disguise` lu dans le texte ; option de lancement `faceDown` pour {3} (`FACE_DOWN_SPELL`) ; garde {2} ;
- manifester et cape (`fx.putFaceDown(ref, ward)`), manifestation effroyable (`fx.manifestDread`, événement de règles `manifestDread`) ;
- retourner face visible : action spéciale pour chaque coût possible (déguisement, ou coût de mana d'une carte de créature), effet `fx.turnFaceUp`, déclencheur `when.turnedFaceUp` ;
- la carte est révélée en quittant le champ de bataille ; un sort lancé face cachée arrive face cachée ;
- seul le contrôleur voit la vraie carte (`ObjectView.faceDownCard`, affichée dans l'aperçu). L'audit `hidden-info` joue des parties avec des cartes déguisées et vérifie que l'adversaire ne les voit jamais.

Lot 0.9 (mécaniques communes à plusieurs extensions) :
- jetons Indice (`CLUE`, aide `investigate(n)`) et Carte (`MAP`) dans `fdn/common.ts`, disponibles aussi dans le bac à sable ;
- explorer (701.44) : `fx.explore(ref, times)` révèle la carte du dessus (événement `reveal`, public) ; déclencheur `when.explores(who, land?)` ;
- connivence (701.50) : `fx.connive(ref)` ;
- monture (702.171) : « Saddle N » lu dans le texte (même choix automatique que l'équipage), condition `cond.saddled`, déclencheur `when.saddled` ;
- les autres mécaniques (protections particulières, cascade, channel, don, rejeton, contempler…) sont traitées dans les lots de leur extension ;
- l'audit des informations cachées compte les cartes révélées (`reveal`) comme publiques.

Lot 0.10 (performances, pool complet de 5 174 cartes) :
- moteur :
  - chargement de `@mtgx/cards` en 212 ms ;
  - au profil du fuzz, la copie d'état (25 %) et les invariants du fuzz (21 %) dominent. L'état recopié reste petit (environ 30 Ko d'objets ; les définitions sont partagées), et le bench n'a pas régressé ;
- deckbuilder :
  - rendu progressif de la collection (pages de 120 cartes, suivantes à l'approche du bas de la grille) : toutes les cartes s'affichent en 164 ms au lieu de 2 084 ms ;
  - filtres différés (`useDeferredValue`) : une recherche prend 167 ms au lieu de 474 ms, sans bloquer la saisie.

### Edge of Eternities (EOE, 260 cartes)

| Mécanique | Cartes | Lot |
|---|---:|---|
| distorsion (warp) | 32 | A |
| station (Vaisseaux, Planètes) | 27 | B |
| vide (void) | 14 | A |
| jetons Lander, Robot, Drone, Munitions | ~40 | A |
| « votre deuxième sort de chaque tour » | 6 | A |
| « deux créatures engagées ou plus » | 6 | A |
| terrains choc | 5 | A |

- Lot A ✅ (170/260). Il couvre :
  - distorsion (702.185) :
    - option de lancement « (distorsion) » depuis la main (`CardDef.warp`, lue dans le texte, points de vie compris) ;
    - le permanent est exilé à la prochaine étape de fin, puis relançable depuis l'exil un tour suivant (`warpExiledTurn`) ;
    - Timeline Culler : depuis le cimetière ; filtre `warped` ;
  - vide : condition `cond.void` (un permanent non-terrain a quitté le champ de bataille ou un sort a été lancé avec la distorsion ce tour-ci) ;
  - déclencheurs et outils génériques :
    - `when.castNthSpell(2)` ;
    - « chaque fois que vous sacrifiez » (`when.sacrifice`, fonction `sacrifice` du moteur) ;
    - blessures de combat groupées (`when.combatDamageBatch`) ;
    - « la créature enchantée subit des blessures » ;
    - « mis au cimetière depuis le champ de bataille » (`when.putIntoGraveyardSelf`) ;
    - « meurt » pour des artefacts quand le filtre les nomme ;
  - jetons engagés ou attaquants (`fx.createTappedTokens`) ; « s'il paie » (`unlessPays` avec `paidStore`) ; filtres `blocking` et `damaged` ;
  - restrictions de blocage `canBlockOnlyFlyers` (Drone) et `cantBeBlockedByMoreThanOne` ;
  - terrains choc : deux options « jouer ce terrain » (payer 2 PV, dégagé ; ou engagé).
- Lot B ✅ (201/260) : station (702.184).
  - Les paliers « N+ | … » et le seuil de créature sont lus dans le texte (`CardDef.station`). Les mots-clés d'un palier sont automatiques ; ses autres capacités viennent du script (`stationAbilities`), sans quoi la carte reste non gérée ;
  - la capacité « Station » est générée : le joueur choisit la créature à engager (`ActionOption.additional.tap`, `CastChoices.tap`), puis l'effet `station` met autant de marqueurs de charge que sa force (Tapestry Warden : l'endurance) ;
  - Planètes ; mana égal aux marqueurs (`amountCounters`) ; copies légendaires ; filtre `multicolored` ;
  - engager ou dégager un permanent fait avancer la version d'état (statiques « créatures engagées », détecté par le fuzz).
- Lot C ✅ (241/260) : 40 rares, mythiques et cartes uniques (`eoe/rares.ts`). Le moteur gagne :
  - le mana dépensé pour lancer (`manaSpent` sur le sort et le permanent ; Amount `manaSpent`, filtres `manaSpentBelowValue` et `maxManaValueManaSpent`) ;
  - les coûts d'activation réduits (`reduction`, avec condition), « retirez un marqueur d'une créature », « engagez X artefacts » (`tapX`) ;
  - des statiques de joueur : déclencheurs d'arrivée doublés, +1 carte avec une petite main, sorts d'artefact du dessus de la bibliothèque, premier sort gratuit, sorts de créature incontrecarrables, blessures de combat imprévenables, terrains depuis le cimetière, distorsion accordée ;
  - les réductions de coût conditionnelles ou variables (affinité pour les artefacts, deuxième sort du tour) ;
  - le mana restreint aux capacités d'artefacts ou aux sorts lancés hors de la main, et la capacité de mana qui engage un autre permanent (Gene Pollinator) ;
  - les cartes exilées jouables sous condition, par leur propriétaire, avec un surcoût, terrains engagés (`grantPlay`) ; « exilez jusqu'à une carte non-terrain » ;
  - une cible « carte exilée » (`TargetFilter.exiled`), la garde accordée (`wardAbility`, la garde de la carte n'est lue que si Scryfall la donne en mot-clé) ;
  - des capacités retardées à l'étape de fin de votre prochain tour et à la fin du combat (`fx.delayedAt`) ;
  - « [ce joueur] peut… ; s'il ne le fait pas » (`fx.mayForStore`), « votre total de points de vie devient N », « meurt ou est exilée » (avec force minimale), la condition « vous avez attaqué avec un Vaisseau » (`cond.attackedWith`).
- Lot D ✅ (**260/260**) : les 19 dernières cartes (`eoe/unique.ts`). Le moteur gagne :
  - **le contrôle du tour d'un adversaire** (722, The Dominion Bracelet) : `GameState.turnControl`, `decider(s)` donne le joueur qui décide ; `submit` accepte sa décision au nom du joueur contrôlé ; l'hôte et le serveur (horloge) la lui demandent ; sa vue présente la décision comme la sienne, avec la main du joueur contrôlé (`GameView.controlling`, bandeau « Vous contrôlez … ») ;
  - dévorer (`CardDef.devour`, lu dans le texte : sacrifices choisis pendant la résolution) ;
  - le doublement de marqueurs filtré (`countersFilter`), les jetons remplacés par des copies du permanent enchanté ;
  - les cibles de valeur de mana totale limitée (`maxTotalManaValue`), les filtres de parité et « endurance ≤ X » ;
  - « chaque adversaire choisit une créature et l'exile » (`sacrifice` avec `exile`), les cartes exilées par la source (`ref.exiledWith`) ;
  - `pickFromZone` parmi des objets mémorisés ou liés (`pool`), avec valeur de mana maximale variable ;
  - « défaussez deux cartes à moins de défausser une carte d'artefact », la meule de la moitié de la bibliothèque ;
  - un permanent mis en jeu attaquant ; la condition « un joueur ne contrôle aucune créature » ;
  - les remplacements d'arrivée s'appliquent aussi aux jetons créés, et savent lire le mana dépensé et les terrains arrivés ce tour-ci.
- Test de fumée : l'adversaire du scénario a un Goblin Firebomb en main (cible des contresorts d'artefact).

### Aetherdrift (DFT, 260 cartes)

| Mécanique | Cartes | Lot |
|---|---:|---|
| Véhicules (équipage) | 43 | A |
| Montures (« attaque en étant montée ») | 32 | A |
| cycle (« quand vous cyclez cette carte ») | 28 | A |
| vitesse (« Start your engines! », « Max speed ») | 40 | B |
| exhaust | 29 | B |

- Lot A ✅ (152/260). Il couvre :
  - les pilotes (mot-clé `crewPlus2` : « monte et équipe comme si sa force était supérieure de 2 ») et Interface Ace (`crewWithToughness`) ;
  - « chaque fois que cette créature monte une Monture ou équipe un Véhicule » (`when.crews`, événement `crewed` ; l'objet de l'événement est le Véhicule) ; « devient montée » (`fx.saddle(ref)`) et « devient une créature-artefact » (`fx.animateVehicle`) ;
  - « quand vous cyclez cette carte » (`when.cycleSelf`, avec le X du coût de cycle) ; « chaque fois que vous défaussez une ou plusieurs cartes » (`when.discardBatch`, une fois par défausse) ;
  - épuiser (`exert`), les Verges (capacité de mana sous condition), les Roads, Bloodghast (« un adversaire a 10 PV ou moins ») ;
  - jetons Pilote, Servo, Éléphant, Véhicule 3/2 (équipage 1), Dinosaure Dragon (`dft/common.ts`, aussi dans le bac à sable) ;
  - le test de fumée peut ajouter des cartes au cimetière du joueur 1 (`EXTRA_P1_GRAVEYARD`).
- Lot B ✅ (218/260) : vitesse et exhaust.
  - vitesse (702.179) : `PlayerState.speed` (absente au départ). « Start your engines! » est un mot-clé lu dans le texte : un joueur sans vitesse qui contrôle un tel permanent passe à 1 (action basée sur l'état). Quand un adversaire perd des PV pendant votre tour, votre vitesse augmente de 1, une fois par tour (`setSpeed`, événement `speed`) ;
  - « Max speed — [capacité] » : condition `cond.maxSpeed` sur la capacité (statique, déclenchée, activée, de mana ou de joueur : `PlayerStaticAbilityDef.condition`) ; `amount.speed`, `perSpeed` (Samut), `fx.reduceSpeed` (Spikeshell Harrier), `ref.playersWithoutMaxSpeed` ;
  - interface : pastille « ⚡ N » près du nom du joueur (dorée à la vitesse maximale) et ligne de journal ;
  - exhaust (702.177) : aide `exhaust({...})` (une seule activation), déclencheur `when.exhaustActivated`, réduction de Boom Scholar (`exhaustReduction`), réactivation d'Elvish Refueler (`exhaustReuse`) ;
  - aussi : « lancer depuis votre cimetière [si…] » (`castFromGraveyard`), pioche doublée (Vnwxt), +1 blessure aux adversaires (Far Fortune), « si ce n'est pas son tour » (`when.castSpellOffTurn`), « sacrifie, sinon défausse » (Momentum Breaker), meule égale au cimetière.
- Lot C ✅ (**260/260**) : 42 cartes uniques (`dft/unique.ts`). Le moteur gagne :
  - le contrôle « tant que vous contrôlez [la source] » (`gainControlWhileSource`, effets `whileSource`) et l'échange de contrôle ;
  - « arrive comme copie de … » (`entersAsCopyOf`, choix pendant la résolution) ; Mimeoplasm (dévorer depuis le cimetière avec cartes liées, copie 0/0 qui garde ses capacités activées) ;
  - nommer une carte sans information cachée (`chooseCardName`, `exileNamed`) ; payer le coût de mana d'une carte (`payCostOf`) ;
  - les coûts « exilez X cartes de votre cimetière » et « sacrifiez un ou plusieurs artefacts » (`exileFromGraveyardX`, `sacrificeX`) ;
  - les déclencheurs groupés « une ou plusieurs … » (`batched`), « une carte change de zone » (`when.zoneChange`), « un sort qu'il ne possède pas », « blessures de combat à l'un de vos adversaires » ;
  - Skyseer's Chariot (taxe sur le nom choisi, `chosenNameTax`), The Aetherspark (planeswalker-Équipement, pas attaquable quand il est attaché), Pit Automaton (copie de la prochaine capacité d'exhaust), modes uniques « ce tour-ci » ;
  - « lancer depuis votre cimetière » avec PV et sacrifice en plus (Wickerfolk), X du sort mémorisé sur le permanent (`castX`), « N-ième depuis le dessus de la bibliothèque », « révélez jusqu'à N terrains ».

### Outlaws of Thunder Junction + The Big Score (OTJ 269 cartes, BIG 30)

| Mécanique | Cartes | Lot |
|---|---:|---|
| plot | 32 | A |
| spree | 21 | A |
| crimes (« chaque fois que vous commettez un crime ») | 26 | A |
| hors-la-loi (Assassin, Mercenaire, Pirate, Voleur, Sorcier) | 13 | A |
| monture | 17 | A (moteur de DFT) |
| hideaway (BIG) | 1 | C |

- Lot A ✅ (OTJ 221/269). Il couvre :
  - plot (702.170) : « Plot {coût} » est lu dans le texte ; action spéciale depuis la main au moment d'un rituel (`plotCard`, `GameObject.plottedTurn`) ; la carte complotée se lance gratuitement depuis l'exil à un tour ultérieur, au moment d'un rituel (`CastTerms.sorceryTiming`) ; `fx.plot` (Aven Interrupter, Kellan Joins Up) et « quand cette carte devient complotée » (déclenché depuis l'exil) ;
  - spree (702.172) : aide `spree(...)`, qui génère toutes les combinaisons de modes (`ModeDef.extraCost` additionnés, payés même si le sort est gratuit ; un mode trop cher n'est pas proposé) ;
  - crimes (700.13) : cibler un adversaire, un objet qu'il contrôle ou une carte de son cimetière (`checkCrime` à la mise sur la pile des sorts, capacités et déclencheurs) ; `when.crime`, `cond.crime` ;
  - marqueurs de capacité (122.1b : vol, lien de vie, contact mortel…), « si vous n'avez pas lancé de sort depuis votre main ce tour-ci », flash sous condition (`flashIf`), jetons X/X (`fx.createXXToken`), `perHand`, « jusqu'à la fin de votre prochain tour » pour les cartes exilées jouables ;
  - `checkCondition` évalue désormais n'importe quel montant (sommes, force d'un objet…), et plus seulement les décomptes ;
  - la pioche fait avancer la version d'état (Duelist of the Mind).
- Lot B ✅ (**OTJ 269/269**) : 48 légendaires, rares et cartes uniques (`otj/unique.ts`). Le moteur gagne :
  - les taxes d'attaque et de blocage (Archangel of Tithes : `attackTax`, `blockTax`), les surcoûts ou réductions selon la zone de lancement (`fromZones` : cimetière, exil), « un seul sort par tour » (High Noon), la taxe en PV des sorts qui ciblent (Terror of the Peaks) ;
  - les créatures qui ont monté ou équipé un permanent ce tour-ci (`GameObject.crewedBy`, `ref.crewedBy`) ; l'équipage « une fois par tour » lu dans le texte ;
  - la copie d'un sort de permanent (elle devient un jeton, 707.10) et la copie de capacités activées ou déclenchées ; le déclencheur « quand vous activez une capacité qui cible » (Ertha Jo) ;
  - les emblèmes jusqu'à la fin du tour, le flashback {0}, les permissions de jouer une carte du cimetière d'un adversaire avec du mana de n'importe quel type, le plot à la résolution (Lilah) ;
  - pile ou face (`fx.coinFlip`, événement public), étapes d'entretien supplémentaires (approximation : seuls les déclencheurs d'entretien), « chacun peut mélanger main et cimetière et piocher sept cartes », `exileOnResolve` ;
  - les déclencheurs de légendaires doublés, les Auras qui volent les permanents moins chers (Eriette), le mana supplémentaire des jetons d'artefact (Roxanne), le bonus de blessures non de combat du tour (Taii Wakeen) ;
  - les références à la carte du dessus d'une bibliothèque, aux cartes exilées d'un joueur, à tous les cimetières ; la copie liée à une carte exilée (Assimilation Aegis) ; les jetons légendaires et à F/E variables (Beau) ;
  - le helper de test initialise le nombre de tours joués (`turnsTaken`, pour Jace Reawakened).
- Lot C ✅ (**BIG 30/30**, `big/index.ts`) : hideaway (Collector's Cage, carte liée), Grand Abolisher (`lockOpponentsOnYourTurn`), Rest in Peace (`graveyardToExile`), Torpor Orb, Worldwalker Helm (jeton Carte en plus), Territory Forge (capacités activées de la carte liée, `gainLinkedActivated`), tirage au hasard parmi des cartes liées (Omenpath Journey), jetons copies 3/3 (Nexus of Becoming), montants « forces différentes » et « types de carte parmi ».

### Final Fantasy (FIN, 307 cartes dont 2 cartes assemblées)

Demandée par l'utilisateur le 27/09/2026.

| Mécanique | Lot |
|---|---|
| Villes (terrains engagés, Villes à aventure) | A |
| tiered | A |
| « si au moins quatre mana ont été dépensés » | A |
| job select et Équipements | A (simples), B |
| créatures-Sagas « Summon » | B |
| transformation (dont Sagas au verso), assemblage | C |
| légendaires et rares restants | D |

- Lot A ✅ (166/307). Il couvre :
  - job select (lu dans le texte) : à l'arrivée, un jeton Héros 1/1 est créé et l'Équipement s'y attache ; « Nom — Equip {N} » est lu comme Équiper ; aide `jobGear(type, F, E, mots-clés)` ;
  - tiered (aide `tiered(...)`, comme spree mais un seul palier) ; déclencheur `when.castNoncreatureWithMana(n)` (`minManaSpent`) ;
  - Villes à aventure (Lindblum, Midgar…) : seule l'Aventure se lance depuis la main ; la carte « en aventure » se joue comme terrain depuis l'exil ; l'interface propose « Jouer ce terrain » ou « Lancer [Aventure] » ;
  - `fx.counterExile` (Syncopate) et « à moins de payer {X} » (X du sort) ; `setBasePTAll` avec la force seule (PuPu UFO) ;
  - jetons Héros, Chevalier, Mog, Horreur, Grenouille, Robot Guerrier, Chocobo (Oiseau 2/2 avec landfall), Sorcier 0/1 (`fin/common.ts`) ;
  - IA : l'énumération des cibles écarte les combinaisons qui violent « une autre cible » (`otherThan`).
- Lot B ✅ (188/307) : 11 Équipements (`fin/gear.ts`) et 11 Summons (`fin/summons.ts`, créatures-Sagas écrites avec `chapter`). Le moteur gagne :
  - `fx.discard` mémorise les cartes défaussées (`ref.stored`, Ninja's Blades) ;
  - Équiper « payez 3 points de vie, une fois par tour » écrit dans le script (Dark Knight's Greatsword) ;
  - `chapter` est exporté par `fdn/common.ts` ;
  - correctif : Territory Forge fait avancer la version d'état en liant la carte, et ne garde que les capacités d'une carte encore exilée ; l'invariant de cache du fuzz nomme la carte et les champs divergents.
  
  Passent au lot D : Summon: Primal Odin (« ce joueur perd la partie »), Summon: Brynhildr, Summon: Fenrir, Summon: Bahamut (valeur de mana totale), Aettir and Priwen, Buster Sword, Genji Glove, The Masamune.
- Lot C ✅ (217/307) : 18 cartes transformables et l'assemblage Vanille + Fang = Ragnarok (`fin/transform.ts`, scripts par nom de face). Le moteur gagne :
  - les Sagas au verso : la face est reconnue comme Saga à l'import (ligne de type), elle arrive transformée avec un marqueur de savoir, et le marqueur de la phase principale et le sacrifice (714.4) lisent la face active (`copiedDefId`) ; une Saga renvoyée sur son recto n'est plus une Saga ;
  - aides `flipOut` / `flipBack` (« exilez-la, puis renvoyez-la [transformée] ») ;
  - la condition « une créature est morte sous le contrôle d'un adversaire ce tour-ci » (`cond.creaturesDied(n, true)`, `turnStats.creaturesLost`) ;
  - 11 cartes des decks de démarrage (`fin/starter.ts`, numéros hors du set principal), avec le montant `creaturesDiedThisTurn` et l'effet `attach` qui attache plusieurs Équipements à la fois (Beatrix).
- Lot D1 ✅ (242/307) : 25 légendaires, Cristaux et cartes uniques (`fin/legends.ts`). Le moteur gagne :
  - le filtre `equipped` (créature équipée, calculé dans la vue) ;
  - la cible « capacité activée ou déclenchée, ou sort non-créature » (`stackItems.abilitiesOnly`, Louisoix's Sacrifice) ;
  - « à moins de payer {1} pour chaque… » (`unlessPays` avec `genericAmount`), « ce joueur perd la partie » (`fx.playerLoses`) ;
  - des blessures infligées par une autre source à chaque créature (`damageAll` avec `source`, Nibelheim Aflame) ;
  - les gains de PV doublés (`doubler({ lifeGain })`), la meule adverse augmentée (`opponentMillExtra`), la première pièce gagnée chaque tour (`winFirstCoinFlips`) ;
  - la restriction `noActivatedAbilities` (capacités activées et de mana).
- Lot D2 ✅ (264/307) : 22 cartes (`fin/legends2.ts`, et Clive, Ultimecia, Sephiroth dans `fin/transform.ts`). Le moteur gagne :
  - le kicker sans mana (`kickerCost` : sacrifier ou renvoyer un permanent, choisi automatiquement, jamais une cible du sort) ;
  - les tours supplémentaires (`GameState.extraTurns`, `fx.extraTurn`) et les étapes de fin supplémentaires (`fx.extraEndStep`, `cond.firstEndStep`) ;
  - le déclencheur « attaque seule » (`when.attacksAlone`), « un joueur sacrifie » (`when.sacrifice(filtre, true)`) ;
  - les montants `totalManaValue`, `eventManaSpent`, `devotion` ; l'effet `eachDealsDamage` ; le sacrifice de la moitié (`half`) ;
  - les statiques de joueur `landsEnterUntapped`, `playTopCard` (avec condition), `extraToken` (Quina) ;
  - les restrictions `minThreeBlockers` et `combatDamageImmune` ; les copies de jeton « sauf que c'est un Démon noir » (`setColors`, `setSubtypes`) ;
  - Cloud, Midgar Mercenary (`doubleTriggersWhenEquipped`) ; les permissions de lancer qui exilent le sort ensuite (`grantPlay` avec `exileAfter`).
- Lot D3 ✅ (288/307) : 24 cartes (`fin/legends3.ts`, et Kuja, Kefka, Serah, Esper Origins, Emet-Selch, Crystal Fragments, Terra dans `fin/transform.ts`). Le moteur gagne :
  - les modifications à l'arrivée d'un sort (`StackItem.arrival`) : prochain sort de créature du tour (`fx.nextCreatureSpell`, Fenrir, Brynhildr), marqueurs ajoutés à un sort sur la pile (`fx.spellArrivalCounters`, Torgal), artefacts lancés du cimetière avec finalité (`artifactsFromGraveyardLife`, Noctis) ;
  - les blessures doublées par une source filtrée (`doubler({ damageFilter })`, Trance Kuja) ou reçues par un joueur jusqu'au prochain tour (`fx.doubleDamageTo`, Lightning) ; la prévention des blessures à vos créatures ce tour-ci (Summon: Alexander) ;
  - **correctif** : les blessures d'une capacité d'un permanent ont ce permanent pour source (lien de vie, contact mortel, doublements) ;
  - le compteur de phases de combat (`cond.firstCombat`), les conditions « un adversaire blessé par une créature légendaire », « un joueur a subi N blessures de combat », « premier sort de créature légendaire du tour », « la créature de plus grande force » ;
  - le sort résolu qui arrive transformé (`fx.resolveToBattlefieldTransformed`, Esper Origins), jouer depuis son cimetière et exiler son propre cimetière (Hades), F/E de base égales aux PV (Aettir and Priwen), capacité de mana sans {T} une fois par tour (Vivi), réduction d'Équiper sur une cible (`equipDiscountWhenTargeted`), filtre `crewedBySource`, montant `cardTypesOf`, `removeCounters` d'un type avec mémorisation.
- Lot D4 ✅ (**307/307**) : les 19 dernières cartes (`fin/legends4.ts`, et Zenos, Play Blitzball dans `fin/transform.ts`). Le moteur gagne :
  - `setController` (state.ts) : tout changement de contrôle passe par là et émet l'événement `controlChange` (déclencheur `when.opponentGainsControl`, Zidane) ;
  - `fx.unattach`, la garde « payez des PV égaux à sa force » (`ward.lifePower`), les capacités retardées « au prochain entretien » (`nextUpkeep`) ;
  - les copies-jetons avec Équiper réduit et sacrifiées au prochain entretien (Firion) ; Triple Triad (`fx.tripleTriad`) ;
  - Ancient Adamantoise (mots-clés `keepsDamage`, `absorbsDamage`), la protection du joueur contre ses adversaires (`protectionFromOpponents`) ;
  - `playTopCard` filtré et les déclencheurs d'arrivée doublés filtrés (Traveling Chocobo), les déclencheurs de mort doublés (The Masamune) ;
  - la permission gratuite depuis la main à usage unique (`ref.handOf`, `grantPlay` avec `oneOf`, Buster Sword) ;
  - l'exil « au lieu de mourir » lié par identité physique (`linkedUids`, The Darkness Crystal) ;
  - les déclencheurs « l'objet lié quitte le champ de bataille » et « un adversaire perd la partie » (Zenos, Shinryu) ; le {C} supplémentaire des terrains (Ultima) ; `lastAttachedTo` (Zack Fair). (légendaires, rares, transformables complexes : Clive, Terra, Sephiroth, Zenos, Kefka, Kuja, Serah, Ultimecia, Emet-Selch, Esper Origins, Crystal Fragments, Play Blitzball…).

### Reality Fracture (FRA)

- 285 cartes selon Scryfall, dont 6 réimpressions de FDN (terrains de base, Unsummon), donc 279 cartes propres. Toutes sont légales en Standard.
- **Sortie le 2 octobre 2026 : pas encore de textes français.** Réimporter après la sortie (`npm run import-cards -- fra`), puis vérifier les noms français dans le deckbuilder.
- Lot 0 (infrastructure multi-extensions) et lot A (cartes faisables avec le moteur, jetons Cadet, Heartwood, Lotus, Forêt Tentacule et Thopter, terrains lents) : ✅.
- Lot F (**cartes uniques**) : ✅, 50 cartes. Le moteur gagne :
  - durée « jusqu'à votre prochain tour » (`modify`, `untilYourNextTurn`) et emblèmes temporaires (`expiresAtTurnOf`) ;
  - déclencheurs « subit des blessures », « bloque », « vous attaque » (`defending: "you"`), « lance un sort qui cible… » (`targeting`, `orFilter`) ;
  - hybride monocolore {2/W} (`ManaCost.twoHybrid`), loyauté −X (`loyaltyX`), coût « exilez une autre carte de votre cimetière » ;
  - garde « défaussez une carte », flashback avec défausse (`flashbackDiscard`), Équiper réduit par les marqueurs +1/+1 ;
  - combat : blessures selon l'endurance (Ghalta), valeur absolue d'une force négative (Loot), attaque malgré le défenseur, un seul attaquant par planeswalker (Tomik) ;
  - statiques de joueur : taxe adverse (Thalia), +1 marqueur (Yoshimaru), +1 blessure non de combat (Tomik), pas de déclencheur d'arrivée (Karn), pas de sorts en combat (Yuriko), jetons d'artefact → Dragons, créatures adverses exilées au lieu de mourir ;
  - Tarmogoyf (`cdaToughness`), Omnipresence, Null Summoner (carte liée lançable), sorts renvoyés en main, Molten Tide, « chaque joueur peut défausser sa main et piocher sept cartes », Kindred Judgment.
  
  Non gérées : **Emrakul, the Exigent Doom** (terrain qui gagne une capacité jusqu'au lancement depuis l'exil, garde « sacrifiez trois permanents »), **Uldaros Theorix** (copies de cartes de chaque type lancées gratuitement), **Hall of Echoes** (terrain qui devient la copie d'une créature, règle de légende suspendue).
- Lot E (**planeswalkers**) : ✅. Il couvre :
  - The Theorist, Jace Beleren ; Ajani Resolute ; Ajani Unrelenting ;
  - les sorts « créature ou planeswalker » ;
  - les 10 terrains Commons/Annex (« arrive engagé sauf si vous contrôlez un planeswalker ») ;
  - Tam (prolifération, choix automatique) ; Kiora (condition « capacité de loyauté activée ce tour-ci ») ;
  - Mabel (retirer jusqu'à trois marqueurs, choix automatique) ; Winter et Dark Matter Manipulator (bonus par carte du cimetière, `perGraveyard` et `perDivisor`) ;
  - Craftwork Crusher (« choisissez deux », sous forme des trois paires possibles).
  
  Passent au lot F :
  - Face Yourself, Identity Echo, Loot, the Anomaly, Tomik, Orzhov Lawmage ;
  - les deux Chandra, les deux Garruk, Jace, Reality Sculptor ;
  - Gideon the Oathless (garde « défaussez une carte ») et Break Under Pressure.
- Lot D (**Empower Jace**) : ✅. Il couvre :
  - l'effet `empowerJace` (aide `empower(n)` dans `fra/common.ts`) : N marqueurs de loyauté sur votre jeton Jace, créé d'abord s'il n'existe pas (−1 : surveillance 1 ; −3 : piochez) ;
  - les Ways, qui accordent des capacités de loyauté à vos planeswalkers (aide `walkersHave`) ;
  - le déclencheur « quand vous activez une capacité de loyauté » (`loyaltyActivated`) ;
  - la loyauté des Jace à vitesse d'éphémère (Jace's Machinations) et les planeswalkers qui survivent à 0 (Sanctum Lurker) ;
  - « contempler un Jace » (condition `beholdJace`), un terrain supplémentaire ce tour-ci, « le prochain sort ne peut pas être contrecarré ».
  
  Fatehold Charm (renvoyer un sort de la pile en main) et Jace, Reality Sculptor passent aux lots E et F.
- Lot C (**préparé**) : ✅, fidèle aux notes de version officielles :
  - devenir préparé crée une **copie du sort en exil** (`GameObject.preparedCopy` / `preparedFor`), lançable par le contrôleur actuel du permanent, au timing de son type, en payant son coût ;
  - lancer la copie dé-prépare le permanent ; un effet qui dé-prépare, ou le départ du permanent, fait disparaître la copie ;
  - la copie cesse d'exister en quittant la pile. Elle n'est pas une carte : l'invariant de décompte l'exclut ;
  - dans l'interface, la copie apparaît au bout de la main (comme les cartes jouables depuis l'exil), et une pastille « Préparée » s'affiche sur la créature ;
  - Pyre Rhymer (mana supplémentaire en engageant une Montagne) et Variable Chaser (« chaque joueur peut défausser sa main ») passent au lot F.
- Lot B : ✅. Il couvre :
  - les capacités activées depuis la main (`fromHand` et le coût `discardSelf`), avec un menu « Lancer / Cycle » quand une carte en main a plusieurs options ;
  - le cycle, le cycle de terrain et le cycle de type, lus dans le texte ;
  - la condition de lancement (`castCondition`), le second partagé (Samut), la convocation, l'exhaust (`once`) ;
  - le domaine (`basicLandTypes`), la recherche « de noms différents » et « quand vous défaussez cette carte ».
  
  Les cartes Jace du lot B (Hexhaven Battalion, Countersculpt, Theorist's Sanctum) passent au lot D, Tam au lot E et Emrakul au lot F.
- Lot G (**decks préconstruits**) : ✅. Quatre decks bicolores en cartes FRA seules (`packages/cards/decks/fra-*.json`), un par faction :
  - Fatehold : Jace renforcé (W/U) ;
  - Innovative : sorts préparés (U/R) ;
  - Formidable : cimetière (B/G) ;
  - Dedicated : Cadets en armes (R/W).
  
  Ils sont ajoutés après les deux decks FDN dans `DECKS` (les tests et le bench utilisent les deux premiers). Équilibrage vérifié par un tournoi toutes rondes entre IA heuristiques, 10 parties par affrontement : tous les decks gagnent entre 38 et 59 % de leurs parties.
- Reste pour FRA : Emrakul, Uldaros Theorix et Hall of Echoes, puis le réimport des textes français après le 2 octobre.

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
- **Prolifération (Tam) :** choix automatique. Tous les marqueurs de vos permanents ; chez les adversaires, seulement les marqueurs -1/-1, d'étourdissement et de poison.
- **Mabel, Bitter Recluse :** les marqueurs retirés sont choisis automatiquement (loyauté, puis +1/+1, puis les autres).
- **Liliana the Faultless, Massacre Girl :** mêmes approximations que plus haut (défausse à la résolution ; blessures non de combat de vos seules sources).
- **Empower Jace avec plusieurs jetons Jace :** les marqueurs vont sur le premier jeton (pas de choix).
- **Contempler un Jace :** toujours fait quand c'est possible (Countersculpt, Theorist's Sanctum), sans révéler la carte.
- **Codie, Ravenous Codex :** la copie du sort préparé garde ses cibles (pas de nouveau choix).
- **Hallway Heckler :** la défausse est faite à la résolution, et non comme coût.
- **Convocation :** une créature qui a une capacité de mana ne sert pas à la convocation (elle paie par sa capacité de mana).
- **Master of Barbs :** seules les blessures non de combat infligées par vos sources (sorts compris) comptent, pas celles d'une source adverse.
- **Something Worth Saving :** les quatre cartes sont regardées puis mises au cimetière, ce qui n'est pas une meule au sens strict (pas de déclencheur de meule).
- **Solitary Cell, Murmuring Volume :** la carte défaussée l'est à la résolution, et non comme coût d'activation.
- **Extrapolate the Impossible :** ne fait rien, comme sur Arena en BO1 (pas de cartes « hors du jeu »).
- **Chandra, Torch of Defiance +1 :** la carte exilée est lançable ce tour-ci (et non immédiatement) ; les 2 blessures ne sont infligées que si c'est un terrain.
- **Chandra, Chill of Compliance +1 ({U}) :** mana sans restriction (pas de réserve de mana restreint).
- **Fblthp, Impossibly Lost :** une seule fois par tour (et non une fois par étape de blessures de combat).
- **Garruk, Veiled Butcher −3 :** pioche si le total de cartes non-terrain défaussées est inférieur à deux (exact à 2 joueurs, approché en multijoueur).
- **Garruk, Curse Breaker −4, Jace, Reality Sculptor −3 :** emblèmes temporaires ; Garruk utilise « chaque fois que vous attaquez ».
- **Hapatra, the Desert Fang :** une seule cible adverse, même en multijoueur.
- **Seasoned Cryomancer :** le nombre de cibles est choisi d'après les cartes non-terrain défaussées (1 ou 2), via deux déclencheurs réflexifs exclusifs.
- **Gallia, Tragic Host :** la carte exilée du cimetière est choisie automatiquement (la moins chère).
- **Molten Tide :** le {R} supplémentaire s'ajoute à toute capacité de mana « {T} » d'une Montagne, quelle que soit la couleur produite.
- **Warrior's Blades :** la légalité de l'Équiper suppose la meilleure réduction possible ; le coût payé dépend de la cible choisie.
- **Uldaros Theorix :** les copies choisies (valeur de mana totale 6 ou moins) se lancent gratuitement après la résolution du déclencheur, à tout moment ce tour-ci, et non pendant la résolution (comme Etali).
- **Emrakul, the Exigent Doom :** la capacité accordée au terrain cesse dès que la carte quitte l'exil, de quelque façon que ce soit (et pas seulement quand elle est lancée).
- **Evendo, Uthros (Planètes 12+) :** leurs capacités de mana à coût ({G}, {T}) passent par la pile (comme Ramos).
- **Terrains choc mis en jeu par un effet** (et non joués) : ils arrivent engagés, sans proposer de payer 2 points de vie.
- **Gene Pollinator :** le permanent engagé en plus est choisi automatiquement (d'abord un permanent sans capacité de mana).
- **Emissary Escort :** le bonus « +X/+0 » est une force de base variable (un effet qui fixe la force l'écrase).
- **Terrasymbiosis :** se déclenche au plus une fois par tour (même si l'on refuse de piocher), pour tout marqueur +1/+1 mis sur vos créatures, qu'importe qui le met.
- **Roving Actuator :** la copie se lance après la résolution, à tout moment ce tour-ci (comme Uldaros Theorix).
- **Syr Vondam, Sunstar Exemplar :** « tant que sa force est de 4 ou plus » est lu dans ses dernières informations connues.
- **The Endstone :** « la moitié de vos points de vie de départ » vaut 10 (Standard, 20 PV).
- **The Dominion Bracelet :** la capacité accordée à la créature équipée est portée par l'Équipement (comme Fishing Pole). Une IA qui contrôle le tour d'un autre joueur se contente des décisions par défaut (passer, ne pas attaquer).
- **Close Encounter :** la créature ou la carte exilée « choisie » est une cible.
- **Chorale of the Void :** la carte vient du cimetière d'un adversaire quelconque (pas forcément du joueur défenseur en multijoueur).
- **Moonlit Meditation :** les copies sont toujours créées (pas de choix « vous pouvez »).
- **Dyadrine, Synthesis Amalgam :** les deux créatures dont on retire un marqueur sont choisies automatiquement (celles qui en ont le plus).
- **Molt Tender :** sa capacité de mana à coût « exilez une carte de votre cimetière » passe par la pile (comme Ramos).
- **Caradora, Heart of Alacria :** le marqueur supplémentaire ne vaut que pour vos créatures (Véhicules animés compris).
- **Pyrewood Gearhulk :** « les blessures ne peuvent pas être prévenues ce tour-ci » n'est pas modélisé.
- **Webstrike Elite :** la cible est un artefact ou enchantement quelconque, détruit seulement si sa valeur de mana vaut X.
- **Chorale, Grim Javelineer :** « quand cette créature meurt ce tour-ci » est une capacité accordée jusqu'à la fin du tour.
- **Vitesse :** l'augmentation (« quand un adversaire perd des PV pendant votre tour ») est immédiate, sans passer par la pile.
- **Boommobile :** les quatre mana ne sont pas restreints aux capacités.
- **Loot, the Pathfinder :** sa capacité d'exhaust de mana passe par la pile (comme Ramos).
- **Thunderhead Gunner, Avishkar Raceway :** la carte est défaussée à la résolution, et non comme coût (comme Solitary Cell).
- **Cursecloth Wrappings :** l'embaumement accordé est payé tout de suite (en rituel) et le jeton garde les couleurs de la carte.
- **Gonti, Night Minister :** la carte est exilée face visible, jouable par le contrôleur de Gonti, sans mana de n'importe quel type.
- **Radiant Lotus :** c'est son contrôleur qui ajoute le mana (pas de joueur ciblé) ; les artefacts sacrifiés sont choisis automatiquement (la source en dernier).
- **Winter, Cursed Rider :** les X cartes d'artefact exilées sont choisies automatiquement.
- **Full Throttle :** deux combats supplémentaires après le combat normal (et non juste après la phase principale).
- **Oviya :** le piétinement vaut pour vos créatures attaquantes (quel que soit le joueur attaqué).
- **Déclencheurs « une ou plusieurs … » (Ketramose, Dredger's Insight) :** fusionnés tant qu'une occurrence attend d'être mise sur la pile.
- **Hollow Marauder :** une carte piochée si au moins un adversaire ciblé n'a pas défaussé de carte de VM 4 ou plus.
- **Giant Beaver, Rambling Possum :** la créature qui reçoit le marqueur est ciblée parmi les vôtres ; Rambling Possum ne renvoie pas les créatures qui l'ont montée.
- **Arid Archway :** le terrain renvoyé est ciblé. **Conduit Pylons :** la capacité de mana à coût passe par la pile.
- **Marqueurs de capacité :** ils s'appliquent après les autres effets de couche 6.
- **Fortune, Calamity, The Gitrog :** toutes les créatures qui ont monté la Monture sont concernées (et non une au plus, au choix).
- **Fblthp, Lost on the Range :** comploter la carte du dessus passe par une capacité (sur la pile) qui paie son coût de mana.
- **Kaervek, Tinybones the Pickpocket, Kellan the Kid :** la carte se lance plus tard dans le tour (et non pendant la résolution) ; Kaervek fait perdre 2 PV même si la copie n'est pas lancée ; Kellan met le permanent sur le champ de bataille au lieu de le lancer.
- **Obeka :** les étapes d'entretien supplémentaires ne font que déclencher les capacités « au début de votre entretien ».
- **Riku of Many Paths :** un seul mode, quel que soit le nombre de modes du sort. **Resilient Roadrunner :** pas de protection contre les Coyotes.
- **Great Train Heist :** le combat supplémentaire a lieu après le combat normal ; les Trésors viennent des blessures infligées à n'importe quel adversaire.
- **Collector's Cage (hideaway) :** la carte est exilée face visible. **Memory Vessel :** on peut encore jouer les cartes de sa main. **Sword of Wealth and Power :** la protection devient une défense talismanique contre les éphémères. **Transmutation Font :** les trois jetons sacrifiés n'ont pas à avoir des noms différents. **Grand Abolisher :** les capacités de mana ne sont pas bloquées.
- **Blessures de combat groupées** (« une ou plusieurs créatures… ») : une fois par étape de blessures et par joueur blessé.
- **Demon Wall :** « a un marqueur » est lu comme « a un marqueur +1/+1 ».
- **Haste Magic, Opera Love Song :** les cartes exilées sont jouables jusqu'à la fin de votre prochain tour (et non jusqu'à votre prochaine étape de fin).
- **Freya Crescent :** son mana sert à toute capacité d'un Équipement, pas seulement à Équiper.
- **Sorceress's Schemes :** seulement une carte d'éphémère ou de rituel du cimetière (pas une carte exilée avec flashback).
- **Vayne's Treachery, Chocobo Kick :** le permanent du kicker est choisi automatiquement (le moins cher, jeton d'abord).
- **Quistis Trepe, Seifer Almasy :** le sort se lance après la résolution, à tout moment ce tour-ci (comme Etali).
- **The Lunar Whale :** « regarder la carte du dessus à tout moment » n'est pas affiché.
- **Tellah, Great Sage :** trois déclenchements séparés (Héros, pioche, sacrifice). **Ultimecia, Sidequest: Raise a Chocobo :** l'effet « quand elle se transforme » est fait par l'effet qui la transforme.
- **Quina, Qu Gourmet :** pas de Grenouille pour les jetons copies.
- **Vivi Ornitier :** le mana est d'une seule couleur ({U} ou {R}), pas une combinaison.
- **Garnet, Princess of Alexandria :** un marqueur de savoir de chacune de vos Sagas, ou d'aucune.
- **Choco, Seeker of Paradise :** les cartes regardées sont meulées, puis une va en main et les terrains sur le champ de bataille.
- **Memories Returning :** vous choisissez les trois cartes gardées (l'adversaire ne choisit pas celles du dessous).
- **Esper Terra :** trois marqueurs de savoir sur la copie de Saga, ou aucun.
- **Sin, Spira's Punishment :** six copies au plus par déclenchement.
- **Zack Fair :** tous les Équipements qui lui étaient attachés sont déplacés (et non un seul).
- **Stolen Uniform, Unexpected Request :** l'Équipement est détaché à l'étape de fin ; pour Unexpected Request, il est ciblé au lancement.
- **Vaan, Buster Sword :** on décide tout de suite, et la carte se lance ensuite, à tout moment ce tour-ci. Avec Buster Sword, la carte choisie est gratuite (et non « peut être » gratuite).
- **Ultima, Origin of Oblivion :** l'effet sur les terrains avec un marqueur de fléau cesse si Ultima quitte le champ de bataille.
- **Zenos, Shinryu :** la créature choisie est une cible ; l'adversaire choisi est le premier qui perd la partie.
- **Traveling Chocobo, The Lunar Whale :** la carte du dessus n'est pas montée à leur contrôleur.
- **Zell Dincht :** le terrain renvoyé est ciblé (comme Arid Archway).
- **The Earth Crystal :** tous les marqueurs mis sur vos créatures sont doublés, pas seulement les marqueurs +1/+1.
- **Rydia, Summoner of Mist :** la Saga ciblée a une valeur de mana d'au plus X (et non exactement X).
- **Beatrix, Loyal General :** tous vos Équipements ou aucun (pas de choix un par un).
- **Lightning, Security Sergeant :** la carte reste jouable tant que vous contrôlez une créature nommée Lightning, Security Sergeant.
- **Sidequest: Raise a Chocobo :** la recherche de terrain de Black Chocobo (« quand il se transforme ») est faite par l'effet qui le transforme.
- **Summoner's Grimoire :** le joueur choisit d'abord parmi les cartes de créature non-enchantement ; s'il n'en prend aucune, il peut mettre une créature-enchantement engagée et attaquante.
- **Capital City, Starting Town :** leurs capacités de mana à coût (mana ou PV) passent par la pile (comme Ramos).
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
  - branche `master`, pas de remote.

## Vérifications avant de rendre un lot

- **Par lot :** `npm run verify -- --set <EXT>` (environ 70 s). Il lance :
  - `tsc`, Biome et la couverture ;
  - `vitest`, où le test de fumée est découpé en un fichier par extension (tous les cœurs) ;
  - le fuzz ciblé sur l'extension (`--pool <EXT>`, à 2, 3 et 4 joueurs, et en IA mixte) ;
  - un fuzz sur tout le pool ;
  - les tests d'interface seulement si le client, `view.ts` ou le protocole ont changé (`--ui` pour les forcer). Vite doit tourner.
- **En fin d'extension ou avant une fusion :** `npm run verify -- --full` (environ 3 min). Il lance :
  - trois graines sur tout le pool, puis 3 et 4 joueurs, et l'IA mixte ;
  - le bench ;
  - les trois tests d'interface.
- **Résultat :** une ligne par étape, avec sa durée. Le détail n'est affiché qu'en cas d'échec ; tous les journaux sont dans `test-results/verify/`.
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
- **Test de fumée (`ai/test/smoke/`, un fichier par extension, harnais `harness.ts`) :** une carte qui n'a pas pu être jouée fait échouer le test. Une nouvelle extension gérée reçoit son fichier et entre dans `OWN_FILES`. On arrête 80 décisions après que la carte a été jouée, et on passe aux graines 2 et 3 seulement si elle ne l'a pas été. Pour les cartes réactives (contresorts), l'adversaire doit avoir de quoi lancer des sorts.
- **Cache des caractéristiques :** tout ce dont une capacité statique ou une F/E variable dépend doit faire avancer la version d'état (`bump`). Les points de vie et l'élimination d'un joueur le font désormais. Le fuzz détecte les oublis (« cache des caractéristiques périmé »).
- **Biome :**
  - `npx biome check . | tail -1` cache les erreurs : lire toute la sortie, ou grep « Found » ;
  - un `*/` dans un commentaire JSDoc (« */* ») ferme le commentaire.
- **Patchs par recherche/remplacement :** Biome reformate le code. Un outil tolérant aux espaces est pratique (voir l'historique : `patch.py` dans le scratchpad de session).
- **Performances :** la machine (WSL) varie beaucoup d'une session à l'autre. Pour juger une régression, comparer `npm run bench` avant et après (`git stash`), pas avec un chiffre ancien.
