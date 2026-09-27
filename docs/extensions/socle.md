# Socle multi-extensions (phase 0, branche standard)

Lots transverses faits avant les extensions : import de tout le Standard, cartes à plusieurs faces, Sagas, face cachée, mots-clés communs, performances. Détail déplacé de CLAUDE.md.

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
