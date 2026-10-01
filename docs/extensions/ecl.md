# Lorwyn Eclipsed (ECL, « Lorwyn éclipsé », 266 cartes)

Mécaniques et détail des lots.

Extension demandée par l'utilisateur le 01/10/2026, après Tarkir: Dragonstorm. 19 cartes étaient déjà gérées depuis la phase méta (lots M1 à M6, `docs/extensions/meta.md`) : terrains choc, flétrir en coût additionnel facultatif, évocation, Moonshadow, Sapling Nursery… L'extension suit les règles d'intégration de PLAN-R (R1 et R7, fin de CLAUDE.md).

| Mécanique | Lot |
|---|---|
| Cartes faisables avec le moteur : flétrir (effet et coût), Vivid, changelins, convocation, persistance accordée, Ordres (« choisissez deux »), recto-verso transformables | A |
| Formes du moteur : contempler et exiler depuis la main, type choisi lu partout (`subtypeChosen`), « quand elle se transforme en… », flétrissure (wither) | B |
| Légendaires et cartes uniques restantes | C |

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

### Reste à faire (23 cartes)

| Ce qui manque | Cartes |
|---|---|
| Mana restreint produit par un effet | Ashling |
| Donner un mot-clé à des sorts sur la pile | Spinerock Tyrant |
| Coût additionnel facultatif « choisissez un type et contemplez deux créatures » | Celestial Reunion |
| Remplacements des familles H et I (jetons, pioche, mana) | Mirrormind Crown, Mornsong Aria, Lavaleaper, Shimmerwilds Growth |
| Autres | Kinbinding, Winnowing, Blossombind, Glen Elendra's Answer, Swat Away, Dawnhand Dissident, Taster of Wares, Twilight Diviner, Unbury, Goliath Daydreamer, Lasting Tarfire, Dream Harvest, Lluwen, Maralen, Raiding Schemes (conspiration), Sanar |
