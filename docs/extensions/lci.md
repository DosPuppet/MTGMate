# The Lost Caverns of Ixalan (LCI, « Les cavernes oubliées d'Ixalan », 279 cartes)

Mécaniques et détail des lots.

Demandée par l'utilisateur le 28/09/2026. Explorer (701.44), les jetons Carte et les marqueurs de finalité existaient déjà dans le socle.

| Mécanique | Lot |
|---|---|
| Cartes faisables avec le moteur (explorer, Cartes, Trésors, Descente 4 et 8, descente profonde), jetons, terrains « Restless », Cavernes simples | A |
| Découverte, « si vous êtes descendu ce tour-ci », mana des Cavernes | B |
| Fabrication (Craft with …) et versos | C |
| Légendaires et cartes uniques | D |

Les scripts sont dans `packages/cards/src/lci/` : `white`, `blue`, `black`, `red`, `green`, `multi` (légendaires compris) et `artifacts` (artefacts incolores et terrains). Les aides sont dans `lci/common.ts` : `descend(4 | 8)` et `PERMANENT_CARDS` (cartes de permanent de votre cimetière), `CAVES` (Cavernes contrôlées plus cartes de Caverne au cimetière), `ARTIFACT_ENTERED`, les jetons Gnome, Champignon, Dinosaure 3/3, Œuf, Ange, Ondin, Squelette Pirate, Vampire, Vampire Démon, Golem, Esprit et Gnome Soldier.

- Lot A ✅ (185/279). Il couvre :
  - Descente N : une condition sur le nombre de cartes de permanent du cimetière (`cond.amountAtLeast`), sans nouveau code moteur ; la descente profonde passe par `perGraveyard` (statiques) ou `PERMANENT_CARDS` (montants) ;
  - les terrains « Restless » (aide `restless` : engagé, bicolore, animé par `fx.modify`, déclencheur d'attaque) et les Cavernes à capacités simples ;
  - les cartes transformables sans fabrication : Grasping Shadows, Dowsing Device, Growing Rites of Itlimoc, Huatli (Saga au verso), Treasure Map ;
  - **correctif** : un permanent mis sur le champ de bataille engagé par un effet (`moveWithSpec`) fait avancer la version d'état ; le fuzz l'a trouvé avec The Wandering Rescuer.
- Lot B ✅ (221/279). Le moteur gagne :
  - la Découverte (701.57) : effet `discover` (`fx.discover(n, { who, store })`, `ops/spells.ts`). Les cartes exilées sont révélées (événement `reveal`), le reste va dessous dans un ordre aléatoire ; le joueur choisit (intention `discover`) de lancer la carte sans payer son coût de mana ou de la mettre en main. Déclencheur `when.discover` (`amount.eventAmount` : la valeur N) ;
  - la Descente « ce tour-ci » : `turnStats.descended`, compté dans `moveObject` (carte de permanent, pas un jeton, mise dans le cimetière de son propriétaire depuis n'importe où) ; `cond.descended` et `amount.descendedThisTurn` ;
  - le mana des Cavernes : `payMana` rend les sources engagées par le paiement automatique ; le sort retient `caveMana` (transmis au permanent, `amount.caveManaSpent`) et `manaSources` ;
  - les options de déclencheur `castSpell` : `usingManaFromSelf` (« en utilisant du mana produit par [cette source] » : Tecutlan) et `fromExile` (Quintorius Kand).
- Lot C ✅ (239/279). Le moteur gagne :
  - la Fabrication (702.167) : coût `craft` (`CostDef.craft`, aide `craft(mana, matériaux)` dans `dsl.ts`) et effet `craftReturn`. Les matériaux (`craftMaterials`, `stack.ts`) sont choisis automatiquement : cartes du cimetière d'abord, puis jetons, puis autres permanents (les moins chers d'abord, ou les plus chers avec `preferHighManaValue`) ; `each` (un matériau par filtre : The Grim Captain), `orMore` (un ou plusieurs), `distinctColors` (Sunbird Standard). La source et les matériaux ne paient pas le mana ; les matériaux exilés sont liés au verso (`ref.linked`) ;
  - les montants `linkedTotalPower` (Mastercraft Raptor) et `linkedColors` (Sunbird Effigy), et `addManaColorsAmong` sur les cartes liées ;
  - le déclencheur « exilé pour une fabrication » (`leaves` avec `whileCrafting` : Market Gnome) ;
  - `cdaValue` (F/E définies par une capacité) tient compte des sous-types et de « l'un de » (The Mycotyrant, jeton Gnome Soldier) ;
  - **correctif** : une carte mise sur le champ de bataille transformée (ou engagée) l'est avant ses déclencheurs d'arrivée (712.14) : auparavant, c'était le recto qui se déclenchait.

- Lot D ✅ (**279/279**). Les scripts sont dans `lci/legends.ts`. Le moteur gagne :
  - les dieux et leurs Temples : retour transformé et engagé à la mort (aide `returnsAsTemple`), Temples (aide `temple`) avec les montants `attackersThisTurn` (Temple of Civilization) et `redNoncombatDamageThisTurn` (Temple of Power), la capacité de mana qui retire un marqueur (`removeCounter` : Temple of Cyclical Time) ;
  - Ojer Taq : doublement `creatureTokensTriple` (`tokenMultiplier`, `statics.ts`, aussi pour les jetons copies) ; Ojer Axonil : statique `noncombatDamageAtLeastPower` (`dealDamage`) ; Ojer Pakpatiq : le rebond (702.88 : `fx.grantRebound`, `StackItem.rebound`, capacité retardée `yourNextUpkeep`) et l'option `fromHand` du déclencheur `castSpell` ;
  - Bloodletter of Aclazotz : `doubleOpponentLifeLossYourTurn` (`loseLife`) ;
  - les coûts additionnels « défaussez une carte ou payez 3 PV » (`discardOrLife` : Bitter Triumph) et « … ou sacrifiez un permanent » (`discardOrSacrifice` : Souls of the Lost), proposés par la fenêtre de coût additionnel du client (bouton « Payer 3 points de vie à la place ») et par l'IA ;
  - la force de base (`Characteristics.basePower`, après la couche 7b), le filtre `powerAboveBase` (Kutzil) et l'effet `countersAboveBase` (Sovereign Okinec Ahau) ;
  - `fx.modifyWhileSource` (Kitesail Larcenist), `fx.counterAbilitySilence` (Tishana's Tidebinder), `destroyAllButOnePerPlayer` (Unstable Glyphbridge), `exileForManaValue` (Fabrication Foundry), `graveyardCreatureOnce` (The Tomb of Aclazotz : finalité et sous-type Vampire à l'arrivée), l'exil lié d'une carte de main qui revient en main (`exileFromHandLinked(…, untilLeaves)` : Deep-Cavern Bat) ;
  - les restrictions de joueur : `opponentsCantCastYourTurn` (Kutzil), `attackersCantCast` et `cantAttackYouThisTurn` (Sandswirl Wanderglyph, `s.turn.attackBans` et `attackedBy`) ;
  - la condition `mostLife` (Preacher of the Schism), les montants `creaturesLeftThisTurn`, `permanentTypesInGraveyard`, `untappedInUntapStep` ;
  - Locus of Enlightenment : l'événement `activated` et le déclencheur `activateAbility` ; le filtre `withActivatedAbility` (The Enigma Jewel) ;
  - Roaming Throne : `doubleTriggersFor` (type choisi) ; Twists and Turns : `scryBeforeExplore` ;
  - les capacités de mana `produceLinkedColors` (Pit of Offerings) et `amountGraveyard` (The Core), et le rider `uncounterable` (Cavern of Souls ; le type choisi se lit sur la source) ;
  - Intrepid Paleontologist : `castPermission` avec `linkedFilter` et `linkedFinality` ;
  - **correctif** : `cdaValue` (F/E définies par une capacité) tient compte du filtre complet, y compris dans les cimetières (Souls of the Lost) ; le journal nomme les arrivées sur le champ de bataille.

Tests : `engine/test/lci.test.ts` et le test de fumée `ai/test/smoke/lci.test.ts`.
