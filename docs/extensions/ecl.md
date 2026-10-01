# Lorwyn Eclipsed (ECL, « Lorwyn éclipsé », 266 cartes)

Mécaniques et détail des lots.

Extension demandée par l'utilisateur le 01/10/2026, après Tarkir: Dragonstorm. 19 cartes étaient déjà gérées depuis la phase méta (lots M1 à M6, `docs/extensions/meta.md`) : terrains choc, flétrir en coût additionnel facultatif, évocation, Moonshadow, Sapling Nursery… L'extension suit les règles d'intégration de PLAN-R (R1 et R7, fin de CLAUDE.md).

| Mécanique | Lot |
|---|---|
| Cartes faisables avec le moteur : flétrir (effet et coût), Vivid, changelins, convocation, persistance accordée, Ordres (« choisissez deux »), recto-verso transformables | A |
| Formes du moteur : contempler et exiler depuis la main, type choisi lu partout (`subtypeChosen`), « quand elle se transforme en… », flétrissure (wither) | B |
| Cartes uniques : mana restreint, cartes exilées liées, conspiration, sorts qui gagnent un mot-clé… | C |
| Remplacements des familles H et I (R1) : jetons, marqueurs, pioche, mana | D |

Les scripts sont dans `packages/cards/src/ecl/` : `cards` (cartes du méta, phase 1), `white`, `blue`, `black`, `red`, `green`, `multi`, `artifacts` (incolores et terrain) et `legends`. Les jetons sont dans `ecl/common.ts` : Kithkin vert et blanc, Ondin blanc et bleu, Gobelin noir et rouge, Faerie bleue et noire avec le vol, Changeforme incolore avec le changelin, Elfe noir et vert 2/2, Élan 3/3, Ver noir et vert, Mutavault (terrain qui devient une créature 2/2 de tous les types), Sylvin 3/4 avec la portée.

## Lot A ✅ (227 / 266)

- **Cartes :** 208 nouvelles, écrites par couleur :
  - blanc 37, bleu 31, noir 26, rouge 32, vert 34, multicolores 41, incolores et terrain 8 ;
  - dont les recto-verso Brigid, Eirdu / Isilu, Sygg et Trystan, les cinq Ordres (« choisissez deux », un mode par paire), Tam, Twinflame Travelers, Chronicle of Victory, Dawn-Blessed Pennant, Eclipsed Realms.
- **Le moteur gagne :**
  - flétrir N (« blight N » : N marqueurs −1/−1 sur une créature que l'on contrôle) :
    - en effet, `fx.blight(n, qui, store)`, `ops/counters.ts` : chaque joueur désigné choisit sa créature ; `store` vaut 1 si c'est fait (« vous pouvez flétrir 1 ; si vous le faites… ») ;
    - en coût de capacité, `activated({ blight: N })` : la créature est choisie par le moteur (`blightTarget`, `stack.ts`) ;
  - « flétrissez N ou payez {M} » en coût additionnel (Wild Unraveling, Bogslither's Embrace) : lu dans le texte, c'est le kicker « flétrir » et, s'il n'est pas payé, le mana `CardDef.kickerOrPay` ;
  - « flétrissez X ; X ne peut pas dépasser la plus grande endurance parmi vos créatures » (Soul Immolation) : `CardDef.xCost: "blight"`. Le champ remplace `payLifeX` (« payez X points de vie », Vicious Rivalry : `xCost: "life"`) ;
  - Vivid : `amount.colorsAmong(filtre)`, le nombre de couleurs parmi les permanents (les vôtres par défaut) ;
  - le changelin est lu dans le texte Scryfall (`scryfall.ts`).
- **Correctif [règles] :** un permanent qui quitte le champ de bataille est retiré du combat dans `moveObject`, quel que soit l'effet ou le coût qui le déplace (506.4). Le coût « contemplez un Kithkin et exilez-le » de Champion of the Clachan exilait un attaquant sans le retirer du combat (trouvé par le fuzz). `RULES_VERSION` = 22, parties dorées régénérées.
- **Dette :** `proliferate` et `revealUntilN` servent désormais à plusieurs cartes, et le changelin est lu dans le texte : leurs entrées quittent `debt-baseline.json`.
- **Audit :** Sygg et Trystan (« quand il se transforme en… » fait par la capacité qui le transforme) entrent dans `audit-baseline.json`, en attendant le lot B.
- **Tests :** 203 tests de règles en plus dans `engine/test/ecl.test.ts` (un `describe` par couleur, aides locales) ; le test de fumée `ai/test/smoke/ecl.test.ts`, où Champion of the Clachan et Champions of the Shoal reçoivent un changelin à contempler.
- **Approximations :** voir `docs/approximations.md`, section Lorwyn Eclipsed.

## Lot B ✅ (243 / 266)

- **Cartes :** 16 nouvelles : Grub, les Champions de Gobelin, d'Élémental et d'Elfe (Champion of the Weird, Champion of the Path, Champions of the Perfect), Wild Unraveling, Bogslither's Embrace, Soul Immolation, Selfless Safewright, Harmonized Crescendo, Bloodline Bidding, Gathering Stone, Rimefire Torque, Oko (planeswalker recto-verso), Barbed Bloodletter, Squawkroaster, Shadow Urchin.
- **Le moteur gagne :**
  - le déclencheur « quand il se transforme en [cette face] » (`when.transformsSelf`, événement `transformed`), porté par la face visée : Brigid, Sygg et Trystan le prennent, et leurs entrées quittent `audit-baseline.json` ;
  - contempler et exiler une carte de la main (`additionalCost.exile.fromHand`, aide `champion(type, capacités)` dans `ecl/common.ts`) ; « contemplez ou payez » : aide `beholdOrPay(type, N)` ;
  - « du type choisi » lu partout : `resolveFilter` (cibles, comptes, recherches, `lookAtTop`), `matchWho` (déclencheurs), le filtre de source des remplacements de blessures, les réductions de coût. Le choix fait par un sort qui se résout est gardé sur le sort (Harmonized Crescendo) ; un emblème garde le choix de l'effet qui le crée (Oko) ; les dernières informations connues gardent le choix ;
  - la flétrissure (wither, 702.80) : des marqueurs −1/−1 au lieu de blessures marquées ;
  - les F/E définies par Vivid (`colorsAmong` dans `cdaValue`) ;
  - « retirez N marqueurs de cette créature » de n'importe quelle sorte (`removeCounters.kind: "any"`) ;
  - `fx.blight` garde les créatures flétries (`ref.stored`, « la créature flétrie ») ;
  - le choix d'un type de créature propose toujours les types les plus courants (aucune option sans créature connue de la partie).
- **Correctifs [règles] :**
  - flétrir pour plusieurs joueurs (« chaque adversaire flétrit 1 ») posait les marqueurs du premier deux fois : tous les choix sont faits d'abord ;
  - une réduction de coût voit la carte lancée : « contemplez un Gobelin » ne la compte plus elle-même ;
  - « dégagez » retire un marqueur d'étourdissement au lieu de dégager (122.1d), comme l'étape de dégagement (`untapObject`) ;
  - les jetons créés sont notés au journal du tour (« une créature est arrivée sous votre contrôle ce tour-ci ») ;
  - « une autre carte » reconnaît la source morte, devenue une carte du cimetière (identité physique) ;
  - `amount.countersOn(ref.eventObject)` lit les marqueurs d'une créature morte (dernières informations) ;
  - un joueur qui quitte la partie (800.4a) : le cache des caractéristiques est invalidé après le départ de ses permanents (Ygra, Eater of All rendait encore les créatures Nourritures ; trouvé par le fuzz à 3 joueurs).
  
  `RULES_VERSION` = 23, parties dorées régénérées.
- **Approximations levées :** « retirez un marqueur » limité aux −1/−1, Champions sans la main, « contemplez ou payez » qui excluait son propre nom, la transformation de Brigid, Sygg et Trystan, Morcant's Loyalist, Bristlebane Outrider et Thoughtweft Charge, Collective Inferno.
- **Tests :** 23 tests de règles en plus dans `engine/test/ecl.test.ts` (« Lorwyn Eclipsed, lot B »).

## Lot C ✅ (261 / 266)

- **Cartes :** 18 nouvelles : Kinbinding, Winnowing, Unbury, Glen Elendra's Answer, Swat Away, Lasting Tarfire, Spinerock Tyrant, Dawnhand Dissident, Maralen, Taster of Wares, Twilight Diviner, Goliath Daydreamer, Dream Harvest, Lluwen, Ashling (recto-verso), Celestial Reunion, Raiding Schemes, Sanar.
- **Le moteur gagne :**
  - le mana restreint ajouté par un effet (`restrictedMana` du joueur, `fx.addManaChoice(n, couleurs, restriction)`) : le solveur le dépense d'abord, et seulement pour un paiement permis ; il disparaît quand la réserve se vide (Ashling, Rimebound) ;
  - la permission « lancer les cartes exilées liées » prend des variantes : n'importe quel propriétaire, gratuit, une fois par tour, seulement ce tour-ci, valeur de mana plafonnée, en retirant des marqueurs parmi vos créatures, avec du mana de n'importe quel type (Dawnhand Dissident, Maralen, Taster of Wares) ;
  - un statique multiplié par un compte du journal du tour (`perTurnEvents`, Kinbinding) ; les marqueurs mis sur un permanent sont au journal (`event: "counters"`, Lasting Tarfire) ;
  - un sort sur la pile peut gagner un mot-clé (`fx.modify` sur un sort, Spinerock Tyrant), et le déclencheur « un sort avec une seule cible » (`singleTarget`) ;
  - `exileOnResolve` généralisé : exiler les sorts désignés en se résolvant, avec un marqueur (Goliath Daydreamer) ;
  - la Ref `stackItemsOf(joueurs)` et le compte des sorts contrecarrés (`fx.counter(ref, store)`, Glen Elendra's Answer) ;
  - un sort ciblé mis au-dessus ou au-dessous de la bibliothèque (`spellToZone`, Swat Away) ;
  - la contrainte de cibles « qui partagent un type de créature » (`shareCreatureType`, Unbury) ;
  - « exilez jusqu'à une valeur de mana totale de N » pour chaque joueur désigné (Dream Harvest) ; « défaussez une carte de terrain » en coût (`discardFilter`, Lluwen) ; « révélez X cartes de votre main », choisies par leur propriétaire (Taster of Wares) ;
  - le déclencheur d'arrivée « depuis un cimetière » (`fromGraveyard`, Twilight Diviner) ; « révélez jusqu'à X » avec X variable, et « une carte par couleur » (Sanar ; Aurora Awakener s'en trouve simplifiée) ; engager exactement N créatures qui partagent une couleur avec un sort (conspiration, Raiding Schemes) ; la condition « contempler deux créatures d'un type de [l'objet] » (Celestial Reunion).
- **Dette :** une seule opération nouvelle, `keepSharingCreatureType` (Winnowing), justifiée dans `debt-baseline.json` ; les autres formes étendent des opérations existantes.
- **Correctif [règles] :** un sort lancé était vu sans valeur de mana ni nom (`spellView`) : un filtre « sort de VM 4 ou plus » sur un sort en cours de lancement ne correspondait jamais. `RULES_VERSION` = 24, parties dorées régénérées.
- **Limite d'affichage :** le mana restreint n'apparaît pas encore dans la réserve affichée.
- **Tests :** 18 tests de règles en plus dans `engine/test/ecl.test.ts` (« Lorwyn Eclipsed, lot C »). Le test de fumée essaie désormais les décisions d'une action jusqu'à la première que le moteur accepte (Unbury : deux cartes qui partagent un type, une contrainte que l'énumération des cibles ne voit pas).

## Lot D ✅ (266 / 266) : remplacements des familles H et I (R1)

- **Cartes :** Mirrormind Crown, Blossombind, Mornsong Aria, Lavaleaper, Shimmerwilds Growth.
- **Le moteur gagne** les remplacements des familles H et I sur le cadre d'`EventReplacement` (R1), comme les blessures au lot D de Tarkir :
  - `event: "tokens"` (`createTokens`, `copyToken`) : « le double / le triple » (`modify.times`), d'autres jetons à la place (`instead.token`), des copies du permanent auquel la source est attachée, la première fois de chaque tour (`instead.copyOfAttached`, `firstEachTurn`), « ces jetons plus un jeton » (`plus`) ;
  - `event: "counters"` (`changeCounters`) : sorte de marqueur (`counter`), pas pour un coût (`effectOnly`), prévention (Blossombind : « on ne peut pas mettre de marqueurs dessus ») ;
  - `event: "lifeGain"`, `"draw"`, `"mill"` (`gainLife`, `drawCards`, la meule) : « autant plus N », « le double », prévention (Mornsong Aria : « les joueurs ne peuvent pas piocher ni gagner de PV ») ;
  - `event: "mana"` (production de mana d'un permanent engagé) : un mana de plus du même type, de la couleur choisie par la source (`extraMana: "chosen"`) ou seulement quand un type est produit (`manaProduced`, Ultima) ;
  - `event: "untap"` : un permanent qui ne peut pas être dégagé (Blossombind), y compris à l'étape de dégagement (`untapObject`) ;
  - `quantityMods`, `recipientMatches` et `playerSide` (`statics.ts`) rassemblent les remplacements qui s'appliquent ; le filtre `attachedToSource` (« la créature enchantée / équipée ») vaut aussi pour les permanents ; `setColorsChosen` : « le terrain enchanté est de la couleur choisie ».
- **Conversion :** les doubleurs (`doubler`, `DoublerAbilityDef` : Doubling Season, Ojer Taq, The Wind Crystal, The Earth Crystal…) et 13 drapeaux de `PlayerStaticAbilityDef` (`extraToken`, `extraMapToken`, `replaceArtifactTokens`, `tokensAsCopiesOfAttached`, `plusOneCounterBonus`, `lifeGainBonus`, `noLifeGainForAll`, `drawDouble`, `drawPlusOneWhenHandSmall`, `opponentMillExtra`, `extraMountainMana`, `extraColorlessFromLands`, `artifactTokenManaBonus`) deviennent des `eventReplacement` dans les scripts de 19 fichiers ; leurs entrées quittent `debt-baseline.json`.
- **[règles]** « ces jetons plus un jeton » s'applique une fois par événement (Worldwalker Helm et Quina ne se donnent plus une Grenouille de plus pour la Carte). `RULES_VERSION` = 25, parties dorées régénérées.
- **Audit :** Lavaleaper et Shimmerwilds Growth (capacités de mana déclenchées écrites comme remplacements) entrent dans `audit-baseline.json` ; l'entrée de Vnwxt en sort (le « 2 » est dans le script).
- **Tests :** 5 tests de règles en plus dans `engine/test/ecl.test.ts` (« lot D »), 2 dans `engine/test/rulings.test.ts` (jeton remplacé puis doublé ; prévention plus forte qu'un doubleur) ; les tests existants des drapeaux convertis (`audit.test.ts`, `fra-lotf.test.ts`) passent par le nouveau cadre.
