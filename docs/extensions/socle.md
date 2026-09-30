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

Lot 0.11 (lancer pendant la résolution, 608.2g ; P0 de l'audit) :
- une résolution peut se suspendre sur une **priorité restreinte** : `PendingDecision` `priority` avec `castNow: { cards, prompt }`. Le joueur lance l'une des cartes proposées (décision `cast` ordinaire : cibles, modes, X, coûts additionnels, `tapForMana` permis) ou passe pour refuser ; la résolution reprend ensuite (`answerCastNow`, `stack.ts`). Le sort lancé va sur la pile au-dessus de l'objet qui se résout, et se résout après lui ;
- effet `fx.castNow(ref, { free, many, exileAfter, anyMana, storeCast, storeRest })` (`ops/spells.ts`, boucle commune `castNowLoop`) : permission temporaire `now` (retirée dès la réponse), seules les cartes réellement lançables sont proposées ; `storeCast` compte les sorts lancés (« si vous ne le faites pas… ») ;
- `castCopiesFree` (Uldaros, Roving Actuator, Kaervek avec `paid`) lance les copies pendant la résolution ; les copies non lancées cessent d'exister (707.12) ;
- `legalActions` ne propose que ces cartes ; l'automatisme ne passe jamais à la place du joueur ; l'IA évalue l'offre (`priorityOptions`, politique rapide) ; l'interface affiche la question dans le bandeau, la carte brille au bout de la main (exil) ou dans la fenêtre du cimetière, et le bouton principal devient « Ne pas lancer » ;
- cartes migrées : Découverte (LCI), rebond (Ojer Pakpatiq), Malcolm, Etali, Chandra, Torch of Defiance, Uldaros Theorix, Roving Actuator, Kaervek, Tinybones, the Pickpocket, The Key to the Vault, Quistis Trepe, Seifer Almasy, Vaan, Buster Sword, Daring Waverider, Wishing Well, The Infamous Cruelclaw, Portent of Calamity (le sort lancé est désormais choisi) ;
- tests : `engine/test/lci.test.ts` (Découverte, rebond), `fra-lotf.test.ts` (Chandra, Uldaros), `fdn-lotf.test.ts` (Etali), `blb.test.ts` (Wishing Well), `ai/test/ai.test.ts` (l'IA lance la carte découverte).

Lot 0.12 (remplacements « au lieu du cimetière », 614.1a / 616.1 ; P0 de l'audit) :
- capacité générique `graveyardReplacement` (`GraveyardReplacementAbilityDef`) : filtre d'objets, « depuis le champ de bataille », cimetière visé (`you` / `opponent`), « que vous ne contrôliez pas », lien à la source (identifiant ou identité physique), PV gagnés, condition. Elle remplace sept drapeaux de `playerStatic` (Rest in Peace, Leyline of the Void, Hades et Forgotten Cellar, Dryad Militant, Garruk et Vren, The Darkness Crystal, Valgavoth) ;
- `replaceGraveyard` (`replacement.ts`) réunit tous les candidats, y compris « exilez-la si elle devait mourir » (Lava Coil) et le marqueur de finalité : l'auto-remplacement passe d'abord (616.1a, Progenitus et Darksteel Colossus mélangés même avec un marqueur de finalité), puis un seul remplacement s'applique, choisi pour le joueur affecté (616.1e ; choix automatique : il écarte ceux qui profitent à un adversaire) ;
- deux erreurs corrigées : Darksteel Colossus avec un marqueur de finalité était exilé ; avec Rest in Peace et The Darkness Crystal, le Cristal donnait ses PV ;
- tests : `engine/test/replacement.test.ts`.

Lot 0.13 (choix automatiques rendus au joueur ; P0 de l'audit) :
- équipage et monture : l'option d'activation expose `additional.tap` avec `minPower`, les forces (`powers`) et le choix par défaut (`suggested`) ; le joueur engage les créatures de son choix (force totale suffisante, vérifiée par `chosenCrew`, `stack.ts`), sinon le choix par défaut s'applique. Dans l'interface, la fenêtre « Engagez des créatures de force totale N ou plus » a un bouton « Suggestion » ;
- Fabrication : `additional.materials` (`craftSpec` : `min`, `max`, options du cimetière et du champ de bataille, suggestion) et le champ de décision `materials`, vérifié par `chosenCraftMaterials` (un matériau distinct par filtre pour `each`) ;
- prolifération : un choix `pick` (intention `proliferate`, `autoOk`) parmi les permanents et joueurs qui ont des marqueurs ; l'automatisme et l'IA prennent la suggestion d'avant (vos marqueurs, les marqueurs nuisibles adverses), le mode « contrôle total » laisse choisir ;
- tests : `fdn-reprints.test.ts` (équipage), `lci.test.ts` (Fabrication), `fra.test.ts` (prolifération).

Lot 0.14 (capacités de mana à coût, 605.1a / 605.3b ; P0 de l'audit) :
- une capacité activée sans cible, qui n'est pas une capacité de loyauté et qui peut ajouter du mana (`addMana`, `addManaChoice`, `addManaColorsAmong`, `addManaUntilEndOfTurn`, même imbriqués) est une capacité de mana (`isManaAbility`, `stack.ts`) : ses coûts sont payés comme d'habitude, puis elle se résout aussitôt, sans la pile (`resolveManaAbilityNow`) ;
- un choix pendant cette résolution (couleur du mana) la suspend ; la réponse rend la priorité au joueur qui l'a activée, telle qu'elle était (`Resolution.returnPriority`, `game.ts`), même en réponse à un sort adverse ;
- cartes concernées sans modification de leur script : Ramos, Dragon Engine, Ramos, Three Tree Mascot, les Planètes d'Edge of Eternities (Evendo, Uthros…), Molt Tender, Loot, the Pathfinder, Conduit Pylons, Tarnation Vista, Capital City et la ville à 1 PV de Final Fantasy, Sunbird Effigy, Thornvault Forager, Baylen ;
- limite : le paiement automatique ne s'en sert pas (il faut les activer à la main avant de lancer) ;
- tests : `engine/test/costs.test.ts`.

Lot 0.15 (audit Oracle ↔ script ; P1 de l'audit, étape 6) :
- `cards/src/audit.ts` découpe le texte Oracle en paragraphes (mots-clés, déclenchées, activées, statiques, chapitres ; texte de rappel, mots d'aptitude et capacités citées écartés) et vérifie que le script a au moins autant de capacités déclenchées et activées, et que les nombres d'effet du texte (blessures, pioche, PV, +N/+N, jetons, marqueurs, regard) figurent dans le script ;
- `npm run coverage -- --audit` liste les écarts ; `cards/test/audit.test.ts` échoue sur un nouvel écart, ou sur un écart connu qui a disparu (`cards/data/audit-baseline.json`, huit équivalences ou approximations documentées) ;
- deux oublis trouvés et corrigés : Greenhouse Propagator (FRA) n'avait pas sa capacité de mana « {T} : ajoutez {G} » ; Magmatic Galleon (LCI) n'avait pas son déclencheur de Trésors. Pour ce dernier, le moteur calcule désormais les blessures en excès (120.4a : au-delà des blessures mortelles, contact mortel compris, ou de la loyauté), transmises par l'événement `damage` (`excess`), avec le déclencheur `when.excessDamage(filtre, nonCombatSeulement)` ;
- limite : c'est une heuristique structurelle. Elle ne vérifie ni le sens des effets ni les statiques ; les nombres d'un script sont comparés en vrac.

Lot 0.16 (attentes déduites de l'Oracle ; P1 de l'audit, étape 7) :
- `cards/test/oracle-expectations.test.ts` : pour les éphémères et rituels au texte simple, et pour les créatures dont la seule capacité est « When this creature enters, … », le texte est lu phrase par phrase (blessures à une cible, à un joueur, à chaque adversaire ou à une créature ; pioche ; PV ; jetons ; ±N/±N et mots-clés jusqu'à la fin du tour, sur une cible ou sur vos créatures ; destruction, exil, renvoi en main ; « Untap it », « Scry N »). La carte est lancée dans une position fixe (une créature adverse 10/10, une créature à vous), puis l'effet est vérifié ;
- une phrase inconnue écarte la carte : 104 cartes vérifiées (84 au lot 0.16), toutes conformes ; un témoin (script à 2 blessures, texte à 3) vérifie que le test sait échouer ;
- pour couvrir plus de cartes : ajouter une phrase reconnue dans `clause`.

Lot 0.17 (journal des événements du tour ; P1 de l'audit, étape 8, première tranche) :
- `s.turnLog` (`turnlog.ts`) note les déplacements publics (pas les pioches), les sorts lancés, les sacrifices et les blessures du tour, en petites entrées JSON ; il est vidé au début de chaque tour ;
- montant générique `amount.turnEvents(requête)` (événement, joueur concerné, zones, types, sous-type, supertype, jeton, zone de lancement, combat, source : contrôleur, couleurs, types) ; `sum` fait la somme des blessures, `perPlayer` prend le plus grand total d'un joueur ;
- neuf compteurs à usage unique retirés de `TurnStats` (Nourritures sacrifiées, cartes sorties du cimetière, créatures exilées, créatures parties, blessures non de combat rouges, sorts de créature légendaire, sorts depuis la main, blessures d'une créature légendaire, blessures de combat subies), avec cinq conditions et quatre montants propres à une carte, désormais écrits comme des requêtes (Bonecache Overseer, Vren, Kutzil's Flanker, Temple of Power, Serah Farron, Sidequest: Play Blitzball…) ;
- bench inchangé, et parties identiques à graine égale ;
- tests : `engine/test/turnlog.test.ts`.
- suite : migrer les autres compteurs de `TurnStats` et les champs de tour propres à une carte (`s.turn`) au fil des extensions.

Lot 0.18 (suite des étapes 7 et 8 de l'audit) :
- journal du tour, deuxième tranche : huit autres compteurs retirés de `TurnStats` (terrains arrivés, cartes meulées, sorts non-créature, éphémères et rituels lancés, créatures mortes, sacrifices, Descente, sorts par type pour Alania), avec leurs montants et conditions propres (`landsEnteredThisTurn`, `milledThisTurn`, `noncreatureCastBy`, `descended`…), désormais des requêtes. La requête accepte `notTypes` et `byOwner` (propriétaire plutôt que contrôleur) ; le montant accepte `of` (compter pour des joueurs désignés). Une arrivée sur le champ de bataille est attribuée à son nouveau contrôleur ;
- correction en passant : un jeton mis au cimetière ne compte plus pour la Descente (ce n'est pas une carte) ;
- attentes de l'Oracle : nouvelles phrases (perte de PV adverse et drain, défausse adverse, meule, pillage, marqueurs +1/+1, vol de contrôle jusqu'à la fin du tour, -N/-N sur une créature adverse, jetons nommés, surveillance, « It gains haste », « exilez-la à la place »), et les phrases suivantes sont lues avec une majuscule : 104 cartes vérifiées ;
- bench et nombres de décisions inchangés.

Lot 0.19 (suite des étapes 7 et 8 de l'audit) :
- journal du tour, tranche « champs de tour » : `s.turn.attacked`, `creatureDied`, `creaturesDied`, `diedSubtypes`, `nonlandLeft`, `spellWarped`, `attackerSubtypes` et `attackedBy` sont retirés. Le journal a une entrée `attack` (joueur, joueur défenseur, types et sous-types de l'attaquant), les sorts lancés savent s'ils l'ont été avec la distorsion, et la requête accepte `notSubtype`, `againstYou` et `warped`. Morbide, Vide, raid (« si vous avez attaqué avec un Vaisseau »), Sandswirl Wanderglyph et Undead Sprinter lisent le journal. Chaque entrée fait avancer la version d'état (cache des couches : des statiques en dépendent) ;
- permissions du tour : `mayCastFromGraveyard` (Zul Ashur), `flashbackGranted` et `freeFlashbackGranted` (Sphinx of Forgotten Lore, Archmage's Newt) deviennent des `playPermissions` ordinaires ; le flashback accordé est une permission marquée `flashback` (exilée après la résolution) ;
- ce qui reste dans `s.turn` : l'état propre au déroulement du tour (terrains joués, combats et étapes de fin supplémentaires, « une fois par tour ») et quelques interdictions ou permissions de joueur (Sandswirl `attackBans`, Tomb of Aclazotz, Muldrotha, Summon: Alexander) ;
- attentes de l'Oracle : déclencheurs de mort (la créature est détruite) et d'attaque (elle attaque), en plus de l'arrivée : 121 cartes vérifiées ;
- tests : `fdn-lotf.test.ts` (flashback {0} accordé), tests de raid et de Vide adaptés au journal.

Lot 0.20 (suite des étapes 7 et 8 de l'audit) :
- effets sur les joueurs : `s.playerEffects` (`PlayerEffect` : joueur, statique de joueur, dernier tour, usage unique), lus par `playerStatic` comme si le joueur contrôlait la capacité ; `playerStaticTotal` additionne les statiques numériques (un booléen vaut 1), `addPlayerEffect` en crée un, `consumePlayerEffect` retire un effet à usage unique. Ils remplacent neuf champs de `PlayerState` propres à une carte : Screaming Nemesis (`cantGainLife`), Molten Tide, Jace's Machinations, Hall of Echoes, Way of the Paradox (terrains supplémentaires, cumulables avec les statiques `extraLands`), Theorist's Proxy et Pit Automaton (usage unique), Taii Wakeen, Lightning, Army of One (blessures doublées jusqu'à son prochain tour). Les effets expirés disparaissent au début de chaque tour ;
- attentes de l'Oracle : déclencheurs d'étape de fin, avec leur condition intercalée (603.4) vérifiée dans les deux sens : effet quand la mise en scène la remplit (attaque, créature morte, PV gagnés ou perdus, deux créatures engagées, permanent non-terrain parti, perte de PV adverse), aucun déclenchement sinon ; retours d'une carte de créature du cimetière ; marqueurs sur la créature elle-même ; « Max speed — » (condition sans « if ») écarté. 133 cartes vérifiées, dont 8 conditions contrôlées dans les deux sens ;
- tests : `engine/test/player-effects.test.ts`.

Lot 0.21 (fin des étapes 7 et 8 de l'audit, pour cette série) :
- dernières interdictions et permissions de joueur de `s.turn` passées aux effets sur les joueurs : Sandswirl Wanderglyph (`cantAttackPlayer`, lu par `playerEffectValues`), The Tomb of Aclazotz (`castCreatureFromGraveyard`, usage unique), Summon: Alexander (`creaturesDamageImmune`). `s.turn` ne garde plus que le déroulement du tour (terrains joués, combats et étapes de fin, « une fois par tour », vitesse, fabrication en cours, Muldrotha, compteurs de résolution) ;
- attentes de l'Oracle : déclencheurs d'entretien (la partie part de l'étape de fin adverse), « ~ deals N damage to you », condition « you control six or more lands » (toujours remplie, vérifiée dans un seul sens) ; une créature à déclencheur d'attaque, d'étape de fin ou d'entretien peut avoir d'autres capacités statiques ou activées. 138 cartes vérifiées ;
- tests : `engine/test/player-effects.test.ts` (Sandswirl, Tomb, Alexander).

Lot 0.22 (P2 de l'audit : enregistrement des parties) :
- `engine/src/record.ts` : `GameRecord` (format `mtgx-game`, version 1 : graine, premier joueur imposé ou non, decks par noms dans l'ordre, décisions appliquées). `createRecordedGame` crée la partie et son enregistrement ; `GameHost` y ajoute chaque décision acceptée (humains, IA, automatisme) et appelle `onRecord` ; `replayGame` et `replayStates` rejouent. Piège : un premier joueur tiré au sort consomme le hasard du moteur, l'enregistrement garde donc l'option d'origine, pas son résultat ;
- serveur : `RoomConfig.dataDir` (`MTGX_DATA_DIR`, `data/rooms` par défaut) ; un fichier par salon (en-tête : sièges avec jetons, enregistrement ; puis une décision par ligne). Au démarrage, `RoomManager` rejoue les salons sauvegardés ; les joueurs reviennent avec leur jeton et ont le délai de retour habituel. Fermer un salon efface son fichier, arrêter le serveur le garde ; un fichier illisible (ou qui ne se rejoue plus après un changement du moteur) est mis de côté en `.bad`. Message `export` : l'enregistrement, seulement une fois la partie terminée (il révèle les decks et la graine) ;
- client : le worker enregistre les parties contre l'IA (pas le tutoriel ni le bac à sable) ; « Exporter la partie » (barre latérale) télécharge le fichier ; « Revoir une partie » (accueil) l'ouvre dans le visionneur (`ReplaySession`, `ReplayBar` : pas à pas, lecture automatique, début, fin, point de vue ; décisions ignorées) ;
- tests : `ai/test/record.test.ts` (partie complète rejouée à l'identique), `server/test/persistence.test.ts` (redémarrage en pleine partie, export refusé puis accepté, fichier illisible), `npm run replay-smoke`.

Lot 0.23 (P2 de l'audit : images des jetons) :
- `npm run import-tokens` (`tools/import-tokens.ts`) importe les jetons Scryfall des extensions Standard (sets `t<code>`, faces recto-verso comprises) dans `packages/cards/data/tokens.json` (334 faces) : nom, ligne de type, F/E, couleurs, texte, URL de l'image ;
- `tokenImage` (`cards/src/tokenImages.ts`) choisit l'image du jeton de même nom le plus proche (mêmes F/E, puis mêmes couleurs, puis même ligne de type ; à égalité, l'extension la plus récente). La face d'un jeton (`CardFace`) porte ses couleurs ; `faceImage` (client) s'en sert quand la face n'a pas d'image. 104 profils de jetons des scripts sur 112 ont une image ; les autres gardent le cadre texte ;
- tests : `cards/test/token-images.test.ts`.

Lot 0.24 (P2 de l'audit : chargement) :
- build découpé (`client/vite.config.ts`, groupes Rolldown) : `cartes-*.js` (données des cartes, 5,8 Mo, 750 Ko en brotli), `bibliotheques-*.js` (React, Motion, Zustand : 100 Ko en brotli), `index-*.js` (application : 225 Ko en brotli). Une mise à jour du code ne fait plus retélécharger les données des cartes ;
- serveur Node : fichiers texte compressés (brotli si accepté, sinon gzip ; compressés une fois par fichier et par version, en mémoire), `/assets/` en cache un an (`immutable`), `index.html` et `sw.js` sans cache. nginx transmet la compression telle quelle (rien à configurer). Premier chargement : environ 1,1 Mo transférés au lieu de 7,1 Mo ;
- service worker (`client/public/sw.js`, production seulement) : `/assets/` et `/sounds/` depuis le cache (une nouvelle version d'un fichier remplace l'ancienne), la page réseau d'abord puis cache ; le worker de partie est mis en cache dès la première visite. Une partie contre l'IA démarre hors ligne (cartes en cadre texte, faute d'images) ;
- tests : `server/test/static.test.ts` ; vérifié à la main sur un build de production (hors ligne, partie contre l'IA).

Lot 0.25 (P2 de l'audit : match BO3 avec réserve) :
- règle commune : `sideboardSwapError` (`cards/src/decklist.ts`) : le nouveau deck contient les mêmes cartes qu'au début du match (deck et réserve réunis) et reste légal et jouable ;
- serveur : `Room.match` (`MatchInfo` : `bestOf`, victoires, manche, vainqueur) ; `create` accepte `bestOf` (1 ou 3) et `sideboard`, `join` aussi la réserve (validée avec le deck). À la fin d'une manche (`finishGame`), la victoire est comptée ; tant que personne n'a deux victoires, statut `sideboard` : chaque joueur envoie `sideboard` (deck et réserve, vérifiés), la manche suivante démarre quand les deux sont prêts, commencée par le perdant de la précédente. Trois manches au plus (une partie nulle compte). Quitter entre deux manches concède le match ; une revanche repart à 0–0 avec les decks d'origine. Le match et les decks sont sauvegardés avec le salon (reprise après un redémarrage : la victoire d'une manche finie juste avant l'arrêt est comptée à la reprise) ;
- client : case « Match en 3 manches (BO3) » (accueil, duel contre l'IA ; page « Contre un joueur », à la création) ; `localMatch` (store) tient le match contre l'IA, `nextGame` relance avec le deck choisi et le perdant en premier joueur (option `startingPlayer` du worker) ; le panneau de fin de partie affiche le score, l'éditeur de réserve (`SideboardEditor`, un exemplaire à la fois, validation en direct) et « Manche suivante », puis l'issue du match ;
- tests : `server/test/bo3.test.ts` (match complet entre bots, échange refusé), `npm run bo3-smoke`.

Lot F1 (PLAN-R.md : version des règles, parties dorées) :
- `engine/src/record.ts` : `RULES_VERSION` (1 : un compteur d'identifiants par préfixe ; à faire avancer à chaque lot qui change le comportement du moteur), `GameRecord.rules` (absent : 0) et `checkpoints` (toutes les 25 décisions et à la fin : `[décisions appliquées, outcomeHash]`, ajoutés par `recordDecision`, appelé par `GameHost`) ;
- `outcomeHash(s)` : empreinte (cyrb53) d'une projection stable de la partie (tour, étape, décision attendue, joueurs et zones en `defId`, champ de bataille, pile), sans identifiant d'objet ni compteur interne : deux versions du moteur qui jouent la même partie donnent la même empreinte ;
- `replayChecked` : rejeu qui s'arrête à la première divergence (décision refusée, empreinte différente) ;
- identifiants : `s.nextId` ne sert plus qu'aux objets (`o…`) ; les effets, déclencheurs, capacités… ont chacun leur compteur (`s.idCounters`), pour qu'un effet de plus ne décale pas les objets cités par les décisions enregistrées ;
- serveur : chaque ligne de `data/rooms` porte l'empreinte de l'état obtenu. À la reprise : même version des règles et empreinte différente, fichier mis de côté (`.bad`) ; autre version, la partie ne reprend que si chaque décision a son empreinte et qu'elles concordent, sinon le fichier devient `.rules<N>` et le joueur qui revient lit « Partie interrompue par une mise à jour du moteur » ;
- client : le visionneur s'arrête à la première divergence et l'affiche dans sa barre (`ReplaySession.warning`) ;
- parties dorées : six parties à graine fixe entre decks du méta, dont deux à quatre joueurs (`ai/src/golden.ts`, fichiers `ai/test/golden/`), rejouées par `ai/test/golden.test.ts` ; `npm run golden` les vérifie, `-- --update` les régénère ;
- tests : `ai/test/record.test.ts` (points de contrôle, divergences, empreinte stable), `engine/test/ids.test.ts`, `server/test/persistence.test.ts` (version différente, empreinte fausse).

Lot F3 (PLAN-R.md : sécurité du serveur) :
- une URL mal encodée (`GET /%`) répond 400 ; toute exception d'une requête HTTP répond 500 au lieu d'arrêter le serveur ;
- adresse du client (`clientIp`) : derrière nginx, `X-Real-IP`, sinon la dernière adresse de `X-Forwarded-For` (le début est fourni par le client, qui contournait le plafond de connexions) ; le site nginx transmet `X-Real-IP` ;
- WebSocket (`originAllowed`) : sans en-tête Origin, même hôte que la requête, ou origine de `MTGX_ORIGINS` ; le relais de Vite en dev et nginx en production gardent l'hôte ;
- plafond de salons ouverts par adresse de créateur (`maxRoomsPerIp`, 4, `MTGX_MAX_ROOMS_PER_IP`) : créer et abandonner des salons en boucle ne remplit plus le serveur ;
- `/scry/` ne transmet plus la chaîne de requête à Scryfall, et la clé de cache nginx l'ignore ;
- en-têtes de sécurité sur les fichiers servis (`nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `Permissions-Policy`) ; HSTS en commentaire dans le site nginx, à activer après certbot ;
- reste : jetons de reconnexion en clair dans `data/rooms` ;
- tests : `server/test/online.test.ts` (adresse, Origin, plafond de salons), `static.test.ts` (URL mal encodée, en-têtes), `images.test.ts` ; `npm run online-smoke` à travers le relais de Vite.

Lot R0.1 (PLAN-R.md ; `RULES_VERSION` = 2) :
- second partagé (702.61b) : les actions spéciales restent possibles (retourner une carte face visible), dans `activateAbility` comme dans `legalActions` ;
- protection contre tout : elle ne prévient plus des blessures qui ne peuvent pas être prévenues (Sunspine Lynx) ;
- 704.5b : l'indicateur de pioche impossible est remis à zéro à chaque vérification ; la défaite par poison est annoncée comme telle (`reason: "poison"`, journal « 10 marqueurs poison ») ;
- « vous gagnez / perdez la partie » par un effet respecte « vous ne pouvez pas perdre et vos adversaires ne peuvent pas gagner » (clé `cantLose` existante, sans nouveau drapeau) ;
- marqueurs mis comme coût (loyauté +N, « mettez un marqueur », flétrir en kicker) : `changeCounters(…, asCost)` ; un doubleur `effectOnly` (Doubling Season : « si un effet devait ») ne les double pas ; The Earth Crystal et Innkeeper's Talent, si ;
- 506.4 : un attaquant ou un bloqueur qui cesse d'être une créature quitte le combat (vérifié avec les actions basées sur l'état) ;
- plus de 100 passes d'actions basées sur l'état : une `Error` (au lieu d'un arrêt silencieux), que le fuzz verrait ;
- tests : `engine/test/audit.test.ts`.

Lot R0.2 (PLAN-R.md ; `RULES_VERSION` = 3) :
- sorts lancés sans payer leur coût de mana (Découverte, complot, Omniscience) : les augmentations de coût s'appliquent (601.2f, 118.9d ; Thalia, the Survivor), les réductions ne descendent pas sous zéro ; `legalActions` ne propose une option gratuite que si ce reste est payable ;
- taxes d'attaque et de blocage (Archangel of Tithes) : additionnées (`playerStaticTotal`, `attackTaxFor`) au lieu d'être lues comme des booléens ;
- 508.1d : une créature qui « attaque si possible » n'est obligée d'attaquer que s'il existe un défenseur sans taxe (`forcedAttackers`) ; l'automatisme déclare les attaques obligées vers un tel défenseur (`forcedAttacks`). Avant, sans mana face à Archangel of Tithes, aucune déclaration n'était acceptée ;
- limite : l'IA garde `forcedAttackers` et choisit elle-même ses défenseurs ; en multijoueur, elle peut encore viser un joueur taxé (décision refusée, puis décision par défaut) ;
- tests : `engine/test/audit.test.ts` (#3, #5, N3).

Lot R0.3 (PLAN-R.md ; `RULES_VERSION` = 4) :
- 514.3a : après les actions de nettoyage (514.1, 514.2), les actions basées sur l'état sont vérifiées ; si l'une est accomplie, qu'une question est posée (règle des légendes) ou qu'une capacité s'est déclenchée, les joueurs reçoivent la priorité (`turn.cleanupAgain`), puis une nouvelle étape de nettoyage a lieu (`endStep`), qui met fin aux effets « jusqu'à la fin du tour » créés entre-temps ;
- `stateBasedActions` renvoie désormais si quelque chose a été fait ;
- une créature tenue en vie par un bonus qui expire meurt pendant le nettoyage du même tour, et ses déclencheurs « meurt » s'y résolvent ;
- tests : `engine/test/audit.test.ts` (#1).

Lot R0.4 (PLAN-R.md ; `RULES_VERSION` = 5) :
- lien de vie (119.9, 120.3f) : pendant un lot d'événements simultanés (`simultaneously` : un effet de résolution, les blessures de combat d'une étape, les actions basées sur l'état), les gains d'une même source sont additionnés (`queueLifelink`) et appliqués à la fin du lot, en un seul gain par source. Un piétineur bloqué ne déclenche plus deux fois Ajani's Pridemate ; deux sources avec le lien de vie font deux gains ; la double initiative, un par étape de blessures. Hors lot (capacité de mana), le gain est immédiat ;
- tests : `engine/test/audit.test.ts` (#2).

Lot R0.5 (PLAN-R.md ; `RULES_VERSION` = 6) :
- 603.6a : des permanents qui arrivent en même temps (jetons créés ensemble, cartes mises sur le champ de bataille par un même effet) se voient arriver. Chaque arrivée d'un lot `simultaneously` est détectée tout de suite, puis revue à la fin du lot pour les seules sources arrivées après elle (`enterBatch`, option `only` de `detectTriggers`) ; rien ne change pour une arrivée isolée ;
- tests : `engine/test/audit.test.ts` (#6).
