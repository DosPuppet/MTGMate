# Bloomburrow (BLB, 266 cartes)

Mécaniques et détail des lots.

Demandée par l'utilisateur le 28/09/2026. Les Classes (716) et le Seuil existaient déjà dans le socle.

| Mécanique | Lot |
|---|---|
| Cartes faisables avec le moteur, jetons (Loutre, Chauve-souris, Escargot, Écureuil, Mur), terrains (Villages, Three Tree City) | A |
| Progéniture, Cadeau, Fourrager, Dépense, Vaillance, Saisons (modes « patte ») | B |
| Légendaires et cartes uniques (Alania, Vren, Mockingbird, Portent of Calamity, Osteomancer Adept, Festival of Embers…) | C |

Les scripts sont dans `packages/cards/src/blb/` : `white`, `blue`, `black`, `red`, `green`, `multi` (légendaires compris) et `artifacts` (artefacts, terrains et cartes spéciales n° 262 et au-delà). Les aides sont dans `blb/common.ts` : `valiant`, `expend`, `kin` (familles d'animaux), `entersAndSacrificed`, `FOOD_ABILITY`, et les jetons Loutre, Chauve-souris, Escargot, Écureuil, Mur, Rat de Vren, Épée et Cragflame.

- Lot A ✅. Il couvre les cartes sans nouvelle mécanique, les Classes (dix Talents), le Seuil, les Villages (mana réservé aux sorts de créature) et Three Tree City.
- Lot B ✅. Le moteur gagne :
  - Progéniture (702.175) : « Offspring {2} » est lu dans le texte (`parseOffspring`, `cards/src/scryfall.ts`). C'est un kicker (`CardDef.kickerKind = "offspring"`) ; le déclencheur « quand elle arrive, créez un jeton 1/1 copie d'elle » est généré ;
  - Cadeau (702.174) : « Gift a card / a Food / a tapped Fish / a Treasure » est lu dans le texte (`parseGift`). C'est un kicker à {0} (`kickerKind = "gift"`, `CardDef.gift`). L'effet `gift` est ajouté en tête de chaque mode d'un éphémère ou d'un rituel, ou dans un déclencheur d'arrivée généré pour un permanent. `cond.gift` (= `cond.kicked`) lit « si le cadeau a été promis », `when.giveGift` « chaque fois que vous offrez un cadeau » ;
  - cibles propres au cadeau : `TargetSpec.kickedFilter` (« à la place, un permanent non-terrain ciblé »), vérifié au lancement et à la résolution, et proposé à l'IA et à l'interface (`TargetOption.kickedLegal`) ; `kickedCount` sert aux cibles supplémentaires ;
  - la question du kicker a ses propres libellés (`kickerPrompt` de l'option : « Payer la progéniture {2} ? », « Offrir une Nourriture ») ;
  - Fourrager (701.61) : `canForage` et `forage` (`actions.ts`), en effet (`fx.mayForage`), en coût d'activation (`activated({ forage: true })`), en coût alternatif (`forageOrPay` : Feed the Cycle, « Fourrager — {1}{B} ») et en coût de lancement depuis le cimetière (Osteomancer Adept). Déclencheur `when.forage` ;
  - Dépense N : `turnStats.manaSpentOnSpells`, événement `expend` émis au lancement quand le total franchit 4 ou 8 ; `when.expend(n)`, aide `expend(4, …)` ;
  - Vaillance : `becomesTarget` avec `byYou` (sort ou capacité que vous contrôlez), une fois par tour ; `becomesTarget` accepte aussi un filtre (Pawpatch Recruit : `when.targetedByOpponent`) ;
  - Saisons : `pawprint(...)` (`dsl.ts`) génère toutes les combinaisons de modes jusqu'à cinq {P}, le même mode plusieurs fois ; les cibles de chaque exemplaire sont renommées.
- Lot C ✅ (**266/266**). Le moteur gagne :
  - la prouesse accordée ou portée par un jeton (capacité ajoutée par les couches ; `liveSources` n'ignore plus ces créatures) ;
  - les déclencheurs `lifeChange` (gagner ou perdre des PV), `leavesWithoutDying`, `attackWith` avec filtre (« avec un ou plusieurs Rats »), `castSpell.firstOf` (Alania) ;
  - les conditions `any`, `opponentHasMore` (Beza), `lostLife`, `refLostLife`, `handAtMost`, `targetChosen`, `sacrificedFood`, `canForage` ; la référence `defendingPlayer` ;
  - les montants `inExile`, `yourCreaturesDiedThisTurn`, `opponentCreaturesExiledThisTurn` (Vren), `opponentsWithHandAtMost`, `lkiPower`, `instantSorceryCast`, `cardsLeftGraveyardThisTurn` ;
  - les statiques de joueur `noncombatDamageBonusAmount` (Artist's Talent), `damageUnpreventable` (Sunspine Lynx), `instantsSorceriesFromGraveyardLife` (Festival of Embers), `flashFor` (Valley Floodcaller), `damagePlusOneFrom` (Valley Flamecaller), `creaturesFromGraveyardForage` (Osteomancer Adept) ;
  - les effets `untapAll`, `damageEachPlayerPer`, `portent` ; `modifyAll` jusqu'à votre prochain tour ; `punisher` répété (`times`) ; `sacrifice` de plus grande force ; `copyToken` exilé à l'étape de fin ; les cibles réflexives de valeur de mana variable (`manaValueAmount`, Wishing Well) ;
  - la copie à l'arrivée d'une créature de n'importe quel contrôleur, avec des mots-clés en plus (Mockingbird) ;
  - le mot-clé `cantBeBlockedByPowerGE2` (Azure Beastbinder).

Tests : `engine/test/blb.test.ts` (29 tests) et le test de fumée `ai/test/smoke/blb.test.ts`.
