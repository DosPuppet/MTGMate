# Lorwyn Eclipsed (ECL, « Lorwyn éclipsé », 266 cartes)

Mécaniques et détail des lots.

Extension demandée par l'utilisateur le 01/10/2026, après Tarkir: Dragonstorm. 19 cartes étaient déjà gérées depuis la phase méta (lots M1 à M6, `docs/extensions/meta.md`) : terrains choc, flétrir en coût additionnel facultatif, évocation, Moonshadow, Sapling Nursery… L'extension suit les règles d'intégration de PLAN-R (R1 et R7, fin de CLAUDE.md).

| Mécanique | Lot |
|---|---|
| Cartes faisables avec le moteur : flétrir (effet et coût), Vivid, changelins, convocation, persistance accordée, Ordres (« choisissez deux »), recto-verso transformables | A |
| Formes restantes du moteur : contempler et exiler depuis la main, type choisi lu partout (`subtypeChosen`), « quand elle se transforme en… », flétrissure (wither), flétrir N ou payer, flétrir X | B |
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

### Reste à faire (39 cartes)

| Ce qui manque | Cartes |
|---|---|
| Contempler et exiler une carte de la main (coût additionnel) | Champion of the Weird, Champion of the Path, Champions of the Perfect, Celestial Reunion |
| Type de créature choisi lu partout (`subtypeChosen` dans les filtres d'effet, les déclencheurs, les réductions ; choix fait par un sort ou gardé par un emblème) | Selfless Safewright, Gathering Stone, Rimefire Torque, Harmonized Crescendo, Bloodline Bidding, Oko |
| Déclencheur « quand elle se transforme en [cette face] » | Grub, Ashling (et Brigid, Sygg, Trystan à reprendre) |
| Flétrissure (wither, 702.80) | Barbed Bloodletter, Spinerock Tyrant |
| Flétrir N ou payer, flétrir X (moteur fait, scripts à écrire) | Wild Unraveling, Bogslither's Embrace, Soul Immolation |
| Remplacements des familles H et I (jetons, pioche, mana) | Mirrormind Crown, Mornsong Aria, Lavaleaper, Shimmerwilds Growth |
| F/E définies par Vivid | Squawkroaster |
| Autres | Kinbinding, Winnowing, Blossombind, Glen Elendra's Answer, Swat Away, Dawnhand Dissident, Taster of Wares, Twilight Diviner, Unbury, Goliath Daydreamer, Lasting Tarfire, Dream Harvest, Lluwen, Maralen, Raiding Schemes (conspiration), Sanar, Shadow Urchin |

**Écarts du moteur relevés en route, à corriger au lot B :**
- `spellReduction` évalue la condition sans la carte lancée : `cond.behold` voit la carte elle-même en main ;
- `withChosen` n'est appliqué ni dans `resolveFilter`, ni dans `matchWho`, ni dans le filtre de source des remplacements de blessures ;
- `fx.untap` ne tient pas compte des marqueurs d'étourdissement (122.1d) ;
- `createToken` n'écrit rien au journal du tour ;
- `other: true` ne reconnaît pas la carte source une fois au cimetière (nouvel identifiant) ;
- `amount.countersOn(ref.eventObject)` ne lit pas les dernières informations connues d'une créature morte.
