# PLAN-S — nettoyer le DSL, baisser les plafonds, accélérer le moteur (03/10/2026)

Lots faits sur la branche `plan-s`, un commit par lot, dans l'ordre du tableau. Mesures de départ : `test-results/plan-s/` (non versionné) ; outil de suivi : `npx tsx tools/dsl-census.ts`.

## Contexte

Les plafonds de `packages/cards/data/debt-baseline.json` n'ont fait que monter depuis le lot C1 : chaque lot K et D a ajouté des variantes ou des champs pour une ou deux cartes. Aujourd'hui : Effect 178 variantes / 670 champs, Amount 77 / 131, Condition 82 / 138, TriggerSpec 62 / 157, Ref 35 / 55, ObjectFilter 91 champs, CardDef 95, GameObject 71, StackItem 46, CostDef 37 ; `singleCardKeys` 109, `op` 42.

Un recensement sur les définitions chargées (toutes les cartes, en parcourant `op`/`kind`/`on`) montre :
- 59 opérations d'effet servent à 0, 1 ou 2 cartes, 28 conditions et 39 quantités aussi ;
- de vraies familles : `distinct*`/`max*`/`total*` (Amount), `*ThisTurn` (Condition, Amount, champs de GameObject), `castFrom*` (Condition, GameObject, StackItem), `*All` (Effect), `keep*`/`destroyAllBut*` (Effect), `cost*` (Ref) ;
- des alias exacts et du code mort ;
- trois évaluateurs de `ObjectFilter` (`matchesView`, `matchesObjectFilter`, `matchesCard`, `targets.ts`) qui gèrent chacun un sous-ensemble des champs. Ailleurs, un champ est ignoré sans bruit et le filtre accepte à tort : c'est un risque de bug réel.

Côté performance, les caches des couches et des statiques sont des `WeakMap` indexées par l'état (`layers.ts:484`, `statics.ts:28`). Or `submit` appelle `cloneState` à chaque décision (`game.ts:303`), qui crée un nouvel état : le cache est donc reconstruit à chaque décision. Le bench rate déjà sa cible (4 880 décisions/s pour 5 000).

**Choix de l'utilisateur :** les unions d'abord, puis les interfaces les plus redondantes ; la famille « payer » et la refonte de CardDef restent en option à la fin ; les lots de performance sont séparés et mesurés.

## Lots

| Lot | Contenu | État |
|---|---|---|
| S0 | Plan, recensement (`tools/dsl-census.ts`), empreinte du fuzz (`empreinte :` dans le bilan de `tools/fuzz.ts`, indépendante de `--jobs`), mesures de départ. Le fuzz de départ a trouvé un bug corrigé à part (règles 96 : Cryptex exilait en preuve un matériau de fabrication) | ✅ |
| S1 | Code mort et alias exacts : Condition 82 → 73 variantes, Amount 77 → 72 ; `exileAtLeast` et `allGraveyards` gardés (pas équivalents : cartes face cachée, joueurs sortis) ; empreintes identiques | ✅ |
| S2 [règles 97] | Journal du tour : seule source de « ce tour-ci » pour les joueurs (vie, pioches, défausses, regards, crimes, loyauté, retournements, blessures non de combat) ; `distinct` remplace trois booléens ; « un adversaire » = encore en partie (800.4a, trouvé par l'empreinte : Stromkirk Bloodthief en partie à quatre) ; Condition 73 → 60, Amount 72 → 67. Les champs « ce tour-ci » de `GameObject` vont avec S8 | ✅ |
| S3 [règles 98] | Familles de quantités : `aggregate` (28 sortes), `spent` (8), `manaSymbols` (2), référence `playersWhere` (une Ref, une Amount, deux Conditions) ; Amount 67 → 31 variantes, 119 → 71 champs, Condition 60 → 58 ; Ref +2 champs. Écart corrigé : une copie a la valeur de mana de ce qu'elle copie (Lunar Insight, Omni-Changeling) ; `graveyardsWithAtLeast` gardé (calculé pendant les couches) | ✅ |
| S4 [règles 99] | Sorts lancés : `CastInfo` (zone, coût alternatif `via` dont évocation, distorsion et imminence, mana et couleurs dépensés, Cavernes, créature renvoyée, contempler, `whenCast`) sur la pile, le contexte d'arrivée et le permanent ; `cond.cast({ from, via })` remplace sept conditions ; GameObject 71 → 60, StackItem 46 → 32, Condition 58 → 52. `kicked` et `x` restent sur l'objet (copie d'un sort kické, 707.10 ; X payé pour retourner face visible) | ✅ |
| S5 | Références : `cost` (sacrifiés, défaussées, exilées, renvoyée) et `zone` (champ de bataille, cimetière, main, exil, pile des joueurs désignés) remplacent dix références ; les objets payés pour un coût sont regroupés (`CostPaid`, `StackItem.paid`) ; Ref 35 → 27 variantes, 57 → 46 champs, StackItem 32 → 29 ; empreintes identiques | ✅ |
| S6a | Équivalences exactes : effets de joueur, `grantPlay`, `tap{untap}`, `revealUntilN`, `doubleCounters{all}`, `setLife{exchange}` ; Effect 178 → 169 | ✅ |
| S6b | `playerEffect` (pour toute la partie, « ne peut pas vous attaquer ») ; `objectReplacement` ; Effect 169 → 166. `shield` et `noncombatBonusThisTurn` gardés (choix de la source ; quantité dans un remplacement) | ✅ |
| S6c [règles 100] | `pumpAll`, `addCountersAll`, `modifyAll`, `destroyAll` deviennent leur jumelle sur une référence de zone (`allMatching`), X du sort lu par la référence (`withX`) ; `exileTop{allBut}` ; Effect 166 → 161. `setBasePTAll` et `millUntil` gardés (force seule ; déplacement différent) | ✅ |
| S6d, S6e [règles 101] | `extra{kind, amount}` (entretien, combat, étape de fin, tour), `spellFate` (exil, complot, rebond, transformé), `gainControl{to, duration}` (absorbe `gainControlWhileSource` et `giveControl`), `grantPlay{flashback}`, `moveTo{warp}`, référence `sameName` (Maelstrom Pulse), durée des emblèmes (`duration`) ; Effect 161 → 150 variantes, 632 → 611 champs. Gardés, faute de forme générique qui simplifie vraiment : les quatre « gardez … » (questions de forme différente), `destroyAllButChosenType`, `exileNamesakes`, `chooseCardName`, `becomeCopyKeepAbilities`, `millUntil`, la paire de « roues », `chooseRiot`, `shield`, `noncombatBonusThisTurn` | ✅ |
| S7 | Déclencheurs : `life`, `leaves`, dégâts au joueur attaché | |
| S8 | ObjectFilter : un seul évaluateur, comparaisons, négations, choix, relations | |
| S9 | CostDef, `activated()`, `manaAbility()`, permissions liées | |
| S10 | Rangement de `dsl.ts` et des `common.ts`, GameState | |
| P1 à P5 | Performance (caches suivis au clone, invalidation par dépendance, filtres compilés, index des déclencheurs, définitions partagées) | |

## Principes (valent pour tous les lots)

1. **Seulement de vraies fusions.**
   - Une variante disparaît parce qu'une forme générique, déjà existante ou paramétrée, la couvre.
   - On ne range pas des champs dans un sous-objet pour faire baisser le compte.
   - On ne remplace pas des noms de variantes par une chaîne `action: "..."` sans simplifier l'évaluateur.
2. **Les cartes ne changent pas : les aides du DSL servent de façade.**
   - On réécrit les aides de `dsl.ts` (`fx`, `amount`, `cond`, `when`, `ref`) pour qu'elles produisent la forme générique ; les cartes qui les appellent migrent sans retouche.
   - Exceptions, à corriger à la main : les littéraux bruts (`lci/legends.ts:185,374,378,603`, `scryfall.ts:559`) ; à rechercher par `kind: "…"` et `on: "…"`.
3. **Un lot sans changement de règles se prouve à l'identique.**
   - Les parties dorées se rejouent telles quelles.
   - Les résultats du fuzz à graine égale sont identiques avant et après : comparer `test-results/verify/fuzz-batch.json` et les sorties de `npm run fuzz` lancé avec la même graine.
   - Sinon, le lot est un lot **[règles]** : faire avancer `RULES_VERSION`, régénérer seulement les parties dorées qui divergent, et ajouter des tests de décisions officielles (rulings).
4. **Un lot baisse les plafonds dans le même commit.**
   - `npx tsx tools/debt-ceilings.ts --write "PLAN-S Sx : …"`. `debt.test.ts` exige l'égalité exacte.
   - Retirer de `singleCardKeys` et de `op` les entrées devenues périmées : le test échoue sinon.
5. **Chaque lot vérifie** avec `npm run verify -- --set META` (il comprend le fuzz sur tout le pool) et lance `npm run verify -- --full` en fin de phase. Un commit par lot. Mettre à jour `docs/moteur.md` (recettes, familles) et `docs/approximations.md` si une approximation est levée ou ajoutée.

## Lot S0 : préparation

- Écrire ce plan dans `docs/plans/PLAN-S.md` et le citer dans `CLAUDE.md` (lignes « Plans » et « Documents »).
- Ajouter l'outil `tools/dsl-census.ts`. C'est le script déjà essayé : il charge `CARDS` et `unionVariants`, puis compte, par variante, les cartes qui l'utilisent et les champs déclarés jamais utilisés. Il sert à suivre le plan et à trouver les cartes d'une variante.
- Relever la mesure de départ :
  - le bench sur secteur ;
  - `fuzz-batch.json` à graines fixes, pour la comparaison à l'identique.

## Phase 1 : les unions (S1 à S7)

### S1 : code mort et alias exacts (sans changement de règles)

- **Code mort à retirer :**
  - la condition `fullyUnlocked`, le champ `bend.kinds` du déclencheur, et les champs `search.optional` et `mayPay.waterbend` des effets ;
  - les aides `fx.mayWaterbend`, `cond.classLevel`, `cond.solved` et `cond.fullyUnlocked` ;
  - le champ `CardDef.caseToSolve` (écrit par `scryfall.ts:630`, jamais lu) et le champ `ObjectFilter.modal` (jamais évalué) ;
  - les jetons inutilisés `VIRTUOUS_ROLE` (`woe/common.ts`) et `WOLF_GW` (`mkm/common.ts`).
- **Amount :**
  - `distinctColors` devient `colorsAmong` ;
  - `lkiCounters` devient `countersOn(self)` ;
  - `creaturesDiedThisTurn`, `spellsCastThisTurn` et `attackersThisTurn` deviennent `turnEvents`.
- **Condition :**
  - `sneaked` devient `castVia("sneak")` ;
  - `threshold`, `lifeAtLeast`, `exileAtLeast`, `targetChosen` et `canForage` deviennent `amountAtLeast` ou `any` ;
  - `creatureDiedThisTurn`, `creaturesDiedAtLeast` et `creatureDiedMatching` deviennent `turnEvents`.
- **Ref :** `allGraveyards` devient `graveyardOf(eachPlayer)`.
- **Gain estimé :** Amount −5, Condition −11, Ref −1 variantes ; quelques champs.

### S2 : le journal du tour devient la seule source de ce qui s'est passé pendant le tour

- **Nouvelles entrées de `TurnLogEntry`** (`model/state.ts:449`, `turnlog.ts`) :
  - gain et perte de vie (avec le montant), pioche, défausse ;
  - regard (scry), crime, activation de loyauté ;
  - carte retournée face visible ;
  - un `id` sur les entrées `zone`, `counters` et `activate`.
- **Requête :** `sum` additionne toute entrée qui porte un montant. Les champs `distinctSources`, `distinctKinds` et `distinctTypes` sont remplacés par `distinct: "source" | "kind" | "type" | "player"`.
- **Ce qui migre vers le journal :**
  - les conditions `drewAtLeast`, `lifeGainedAtLeast`, `lostLifeThisTurn`, `opponentLostLifeThisTurn`, `refLostLife`, `scriedThisTurn`, `crimeThisTurn`, `castThisTurn`, `attackedThisTurn`, `void`, `opponentDealtNoncombatDamage`, `activatedLoyaltyThisTurn` et `faceDownOrUpThisTurn` (Condition environ −16 variantes) ;
  - les quantités `lifeGained/LostThisTurn`, `cardsDrawn/DiscardedThisTurn` et `opponentsLostLife` ;
  - les champs `*Turn` de `GameObject` qui ne valent que pour le tour courant (`discardedTurn`, `saddledTurn`, `countersPutTurn`, `countersPutBy`, `countersPutKinds`, `tapTurn`, `tapsThisTurn`, `crewedBy`, `damagedBy`, `combatDamagedPlayers`, `activatedTurn`, `loyaltyTurn`…). Ceux qui couvrent plusieurs tours (`plottedTurn`, `foretoldTurn`, `warpExiledTurn`) sont regroupés dans `exiledVia`.
- **Contraintes :**
  - `TurnStats.lifeGainEvents` et `spellsCast` gardent leur ordre par rapport aux événements de règles (déclencheur « la première fois », `castSpell.nth`).
  - `cdaValue` (`layers.ts:147`) doit accepter `turnEvents` (la pioche peut entrer dans une F/E définie par une capacité).
- **[règles] probable :** les statiques qui lisent ces compteurs sont aujourd'hui périmées, parce que `turnStats` ne fait pas avancer la version. Le lot corrige ce défaut.

### S3 : familles de quantités (Amount)

- **`aggregate { fn: "count" | "sum" | "max" | "distinct" | "mostShared", property, filter?, zone?, whose?, of? }`** remplace environ 28 variantes : `distinct*`, `different*`, `cardTypes*`, `colorsOf`, `linkedColors`, `counterKindsAmong`, `total*`, `max*`, `greatestManaValueOf`, `linkedTotalPower`, `countersAmong`, `maxSharingCreatureType`. À garder pour chaque `fn` :
  - le plancher à 0 tel qu'aujourd'hui : par objet pour les sommes, sur le résultat pour les maxima ;
  - les dernières informations connues (LKI) pour `of: Ref` ;
  - les valeurs imprimées pendant le calcul des couches (613.8) dans `cdaValue` ; `cards/test/cda.test.ts` vérifie des combinaisons au lieu d'une liste de sortes.
- **`spent { what: "x" | "manaSpent" | "colorsSpent" | "caveMana", of? }`** remplace 8 variantes `event*`, `*Spent*` et `sourceX`. Ordre de lecture : objet de la pile, puis sort en cours de résolution, puis données de lancement du permanent.
- **Autres fusions :**
  - `manaSymbols { color, of? }` remplace `devotion` et `manaSymbolsOf` ;
  - une nouvelle Ref `playersWhere { of, where: Condition }`, combinée avec `refCount`, remplace `opponentsWithHandAtMost` et `graveyardsWithAtLeast`, et sert aussi aux conditions `playerWithoutCreatures` et `opponentLifeAtMost` ;
  - Ref : `playersWithoutMaxSpeed` devient `playersWhere`.
- **Cible :** Amount environ 31 variantes / 67 champs.
- **[règles] :** unifier sur la valeur de mana calculée (face cachée = 0, copies) change le comportement de `differentManaValues` et de `maxManaValue`.

### S4 : sorts lancés, avec un enregistrement `castInfo` commun

- Le type `CastInfo` (`model/state.ts`) remplace :
  - sur `StackItem` : `kicked`, `warped`, `impending`, `evoked`, `sneaked`, `castVia`, `fromHand`, `fromGraveyard`, `fromExile`, `manaSpent`, `spentColors`, `caveMana`, `beheld`, `metWhenCast`, `costBounced`… ;
  - sur `GameObject` : `cast`, `castFromHand`, `castFromGraveyard`, `castFromExile`, `castX`…
- La copie champ par champ (`stack.ts:3480-3509`) devient une seule affectation.
- Condition : `cast { from?, via? }` remplace `castFromHand`, `castFromGraveyard`, `spellCastFrom*`, `wasCast`, `castVia` et `evoked`.
- **Points d'attention :**
  - `spellCastFromGraveyard` lit `flashback`, qui couvre aussi `terms.exileAfter` ;
  - le déclencheur `enters.fromZone` lit aussi ces champs.
- **Gain estimé :** GameObject environ −13 champs, StackItem environ −15, Condition −6.

### S5 : références (Ref)

- `cost { what: "sacrificed" | "discarded" | "exiled" | "bounced" }` remplace les quatre `cost*`. Les champs de paiement de `StackItem` sont regroupés dans `paid` : `discarded`, `costExiled`, `sacrificed` et `tappedForCost`.
- `zone { zone, who, filter?, maxManaValue? }` remplace `graveyardOf`, `exiledCardsOf`, `handOf`, `permanentsOf` et `stackItemsOf`. Chaque zone garde sa sémantique :
  - le champ de bataille se filtre par contrôleur, les autres zones par propriétaire ;
  - l'exil exclut les cartes face cachée et les copies ;
  - la pile exclut l'objet en cours de résolution.
- **Cible :** Ref environ 27 variantes / 46 champs.

### S6 : familles d'effets (Effect)

Dans l'ordre de risque :
- **Équivalences exactes :**
  - `noLegendRuleThisTurn`, `extraLandThisTurn`, `copyNextExhaust` et `graveyardCreatureOnce` deviennent `playerEffect` ;
  - `allowCastFromGraveyard` et `grantFlashback` deviennent `grantPlay` ;
  - `becomeCopyKeepAbilities` devient `becomeCopy` avec exceptions (707.9b) ;
  - `chooseCardName` devient `chooseOnEnter("cardName")`, avec une option pour ne pas lister d'abord les noms de la main adverse (fuite d'information cachée) ;
  - `untapAll` devient `tap{untap}` ;
  - `revealUntil` devient `revealUntilN{n:1}` ;
  - `doubleAllCounters` devient `doubleCounters{all}` ;
  - `exchangeLife` devient `setLife{with}`.
- **`playerEffect` étendu :**
  - durée `"game"` (`cantGainLife`) ;
  - « vous » résolu à la résolution (`cantAttackYouThisTurn`) ;
  - `modify.add` accepte une Amount figée (`noncombatBonusThisTurn`) ;
  - `once` remplace `shield`.
- **`exileIfDies{kind}`** absorbe `preventCombatDamage` : les deux corps sont identiques.
- **Les opérations `*All` deviennent leur jumelle par référence** avec `ref.zone(battlefield, …, filter)` : `pumpAll`, `addCountersAll`, `modifyAll`, `destroyAll` et `setBasePTAll`.
  - Préalable : la substitution des X dans les filtres, aujourd'hui recopiée trois fois (`zones.ts:1019`, `permanents.ts:392`, `zones.ts:1225`), passe dans une seule aide.
  - `damageAll` reste telle quelle (planeswalkers, batailles, joueurs).
- **Parcours de bibliothèque :** `millUntil` devient `exileUntil{to:"graveyard"}` ; `exileLibraryButBottom` devient `exileTop{allBut}`.
- **`keepChosen { who, filter?, chooser, rule?, maxTotalPower?, destroy? }`** remplace `keepOnePerType`, `keepWithinTotalPower`, `keepSharingCreatureType` et `destroyAllButOnePerPlayer`.
  - Tous les choix sont faits d'abord, puis les permanents sont retirés en même temps. C'est un **[règles]** : aujourd'hui, `keepOnePerType` sacrifie joueur par joueur.
  - `destroyAllButChosenType` devient `chooseOnEnter` + `destroyAll` avec `not:{subtypeChosen}`, ce qui demande d'étendre la résolution des valeurs choisies à `not` (`targets.ts:175`).
- **Même nom :** la Ref `sameName{ref, zones, whose?}` absorbe `destroySameName` et `exileNamesakes`, avec les noms lus avant le déplacement (dernières informations connues).
- **Autres fusions :**
  - `extra{kind}` remplace `extraUpkeeps`, `extraEndStep`, `extraCombat` et `extraTurn` ;
  - `spellFate{then}` remplace `plotOnResolve`, `grantRebound` (rebond seulement depuis la main, 702.88a), `spellArrivalCounters`, `exileOnResolve` et `resolveToBattlefieldTransformed` ;
  - `gainControl{to?, duration?}` remplace `gainControlWhileSource` et `giveControl` ;
  - les deux effets de « roue », `mayWheel` et `mayShuffleHandGraveyardDraw`, fusionnent : APNAP, puis tout en même temps ;
  - `sacrifice{elseDiscard}`.
- **Opérations internes :**
  - `warpExile` devient `moveTo{warp}` ;
  - `chooseRiot` devient `chooseOption` ;
  - `devour` et `chooseCopy` lisent la `CardDef` au lieu de recopier ses champs.
- **Harmonisation :**
  - un type `Duration` commun, à la place des booléens de `grantPlay`, `emblem`, `playerEffect` et `gainControl` ;
  - les exceptions de `copyToken` deviennent `except: LayerMods`, la forme que `becomeCopy` utilise déjà ;
  - un seul `store` (la convention `${store}Rest` existe déjà).
- **Ce qui reste propre à une carte, faute de forme générique propre :** `portent`, `tripleTriad`, `hellkite`, `meld`, `millWhileShared`, `harness`, `counterAbilitySilence`, `reduceSpeed`…
- **Cible :** Effect environ 135 variantes / 570 champs ; `op` environ −15 entrées. À découper en sous-lots :
  - S6a : exact ;
  - S6b : `playerEffect` ;
  - S6c : `*All` et bibliothèque ;
  - S6d : `keepChosen` et même nom ;
  - S6e : le reste.

### S7 : déclencheurs (TriggerSpec)

- `life { change?, whose? = "you", first? }` remplace `gainLife`, `loseLife` et `lifeChange`.
- `isDealtDamage{who:"attached"}` absorbe `attachedPlayerDamaged`.
- `leaves { to: Zone | Zone[], withoutDying? }` absorbe `diesOrExiled` et `leavesWithoutDying`.
- La fusion des déclencheurs d'action (`search`, `forage`, `discover`…) n'est faite que si la fusion de `RulesEvent` est décidée (option finale). Faite seule, elle ne serait que cosmétique.
- **Cible :** TriggerSpec environ −5 variantes.

## Phase 2 : les interfaces (S8 à S10)

### S8 : ObjectFilter, avec un seul évaluateur

- Une fonction unique, `compileFilter`/`resolveFilter`, est appelée **une fois par filtre** et non une fois par objet. Elle sert à `matchesView`, à `matchesObjectFilter` et à `matchesCard`, si bien qu'aucun champ n'est plus ignoré sans bruit. Un test vérifie chaque champ dans chaque évaluateur.
- **Comparaisons à bornes en Amount :** `manaValue`, `power`, `toughness` et `colorCount` prennent la forme `number | {min?, max?}`. Elles absorbent `min*`/`max*`, `*SourcePower`, `*X`, `*ColorsSpent`, `powerAbove/BelowSource` et `multicolored`.
- **Négations par `not` :** `notKeyword`, `notSubtype`, `noneOfSubtypes`, `nontoken`, `nonland`, `nonbasic`, `noCounters`, `notAttachedToSource` et `notSameNameAs`. Les noms commodes restent des constantes du DSL.
- **Valeurs choisies :** `chosen?: "creatureType" | "color" | "type" | "parity" | "number" | "name"`.
- **Relations à la source :** `rel?`.
- **Le tour :** les champs `*ThisTurn` deviennent une requête au journal (après S2).
- **Cible :** ObjectFilter environ 50 champs ; `singleCardKeys` environ −25.

### S9 : CostDef et l'aide `activated()`

- `self?: "sacrifice" | "exile" | "discard" | "bounce" | "exert"`.
- `others?: {action, filter, zone?, count: number | "X"}[]` remplace `sacrifice`, `tapOthers`, `exileFromGraveyard`, `bounceOther`, `exileOther`, `discard*` et leurs variantes X.
- Les autres variantes X deviennent un compte `"X"`.
- `linkEvidence` entre dans `collectEvidence`.
- `activated()` (`dsl.ts:1546`) et `manaAbility()` prennent les noms de `CostDef` sans les renommer, et n'écrivent plus une quarantaine de clés `undefined` par capacité.
- La quantité d'une capacité de mana devient `amount: Amount`, ce qui retire `amountCounters`.
- `CastPermissionAbilityDef` : `from: "linked" | "hand"` remplace les sept champs `linked*` et les quatre `free*`.
- **Cible :** CostDef environ 20 champs, CastPermissionAbilityDef environ 9.

### S10 : ranger dsl.ts et les common.ts

- Découper `fx` (environ 970 lignes en un seul littéral) en modules (`engine/src/dsl/*.ts`), réexportés à l'identique par `dsl.ts`.
- **Fusions d'aides :**
  - `fx.modifyWhile(what, mods, duration)` remplace les six `modifyWhile*` ;
  - un seul `fx.mayPay({mana?, life?, waterbend?})` ;
  - `fx.nextSpell({…})` ;
  - `amount.distinct(attr, filter)`.
- **Jetons :**
  - une fabrique `creature()` dans `fdn/common.ts` (elle est copiée dans 12 fichiers) ;
  - les jetons définis en double (`NINJA`, `HUMAN_SOLDIER`, `HERO`, `ELK`, `ANGEL_3`) ne le sont plus qu'une fois ;
  - `targetObj` devient `target.obj`.
- `CardScript` (`dsl.ts:51`) est dérivé de `CardDef` par un `Pick` ou un `Omit`, au lieu d'en recopier une cinquantaine de champs qui ont déjà divergé (`kickerCost.life`).
- **GameState :**
  - `over` est retiré : il double `flow === "over"` ;
  - `nextId` rejoint `idCounters` ;
  - `mulliganQueue`, `mulliganTaken` et `leylineAsked` sont regroupés dans `setup` ;
  - `eventBatch` et `leftBatch` sont regroupés dans `batch`.

## Phase 3 : performance (P1 à P5, lots séparés, sans changement de règles)

**Règle de ces lots :**
- Les résultats sont identiques à graine égale (fuzz, parties dorées).
- On compare le bench avant et après avec `git stash`, sur secteur, jamais à un chiffre ancien.
- On relance `ai-smoke` et le tournoi de l'IA n'est pas nécessaire, puisque les décisions sont identiques.

| Lot | Ce qu'il change | Où |
|---|---|---|
| P1 | Faire suivre l'entrée de cache (couches, statiques, sources des déclencheurs) au clone quand `version`, le tour et l'étape sont inchangés. Les `Characteristics` mises en cache doivent être traitées comme immuables : le vérifier en les gelant en mode test. | `state.ts:177`, `layers.ts:484`, `statics.ts:28`, `triggers.ts` (`sourcesCache`) |
| P2 | `logTurnEvent` invalide le cache par dépendance (forme `bumpFor`), et non à chaque événement. Indispensable après S2. Le `cacheKey` cesse d'être une chaîne recalculée à chaque appel. | `turnlog.ts:21`, `layers.ts:538` |
| P3 | Filtres compilés une fois (S8). `snapshot`/`view` reçoivent `equipped` et `enchantedMap` calculés une fois par passe. `sameNameAs` et les requêtes au journal sont indexés. | `targets.ts:61,248,277`, `layers.ts:573,612,620`, `effects.ts:772` |
| P4 | Index des capacités déclenchées par `trigger.on` dans `detectTriggers`. | `triggers.ts:1017` |
| P5 | Les définitions immuables (capacités dans `lki`, effets, retardés) sont gelées et partagées au lieu d'être recopiées par `deepClone`. `hybridColors` est mémorisé par définition au lieu d'un `JSON.stringify` à chaque `legalActions`. | `state.ts:160`, `stack.ts:1675`, `legal.ts:552` |

P1 et P4 peuvent se faire tout de suite ; P2 vient avec ou après S2, P3 après S8.

## Option finale (sur décision de l'utilisateur)

- **Famille « payer » :** `pay{who, cost: CostDef, skip, unless}` remplace `mayPay`, `unlessPay`, `payCostOf`, `forage`, `collectEvidence`, `behold`, `tapOrSacrifice`, `removeCounterFromEach` et `exileForManaValue`. Gain estimé : Effect environ −8 variantes / −40 champs. Points d'attention : paiement pendant la résolution, et choix du joueur dans `collectEvidence` et `behold`.
- **CardDef :**
  - `castOptions[]` (flashback, mayhem, warp, plot, déguisement…) ;
  - `kicker{}` ;
  - `entersAsCopy{}` ;
  - CDA en un seul champ ;
  - `rules[]` ;
  - gain estimé : environ −30 champs.
- **Fusion des `RulesEvent` d'action, avec les déclencheurs d'action (T1/T2).** Gain estimé : TriggerSpec environ −19 variantes.

## Cibles

| Surface | Aujourd'hui | Après les phases 1 et 2 |
|---|---|---|
| Effect | 178 / 670 | ≈ 135 / 570 |
| Amount | 77 / 131 | ≈ 31 / 67 |
| Condition | 82 / 138 | ≈ 50 / 92 |
| Ref | 35 / 55 | ≈ 27 / 46 |
| TriggerSpec | 62 / 157 | ≈ 57 / 150 |
| ObjectFilter | 91 | ≈ 50 |
| GameObject | 71 | ≈ 42 |
| StackItem | 46 | ≈ 25 |
| CostDef | 37 | ≈ 20 |
| `singleCardKeys` / `op` | 109 / 42 | ≈ 60 / 27 |

## Fichiers principaux

- Modèle : `packages/engine/src/model/{effects,rules,cards,state}.ts`.
- Évaluateurs : `effects.ts` (`evalAmount`, `evalCondition`, refs), `triggers.ts` (`checkCondition`, `matchTrigger`, `detectTriggers`), `targets.ts` (filtres), `layers.ts` (`cdaValue`, cache), `turnlog.ts`, `ops/*.ts`, `stack.ts` (`castSpell`, copie vers le permanent).
- DSL : `packages/engine/src/dsl.ts`, `packages/cards/src/fdn/common.ts` et les `common.ts` de chaque extension, `packages/cards/src/scryfall.ts`.
- Garde-fous : `packages/cards/data/debt-baseline.json`, `packages/cards/test/debt.test.ts`, `tools/debt-ceilings.ts`, `cards/test/cda.test.ts`, `engine/test/rulings.test.ts`.
- Docs : `docs/plans/PLAN-S.md` (nouveau), `docs/moteur.md`, `docs/approximations.md`, `CLAUDE.md`, `docs/historique.md`.

## Vérification

- **Par lot :**
  - `npm run verify -- --set META` ;
  - `npx tsx tools/debt-ceilings.ts` doit afficher « Plafonds à jour » après `--write` ;
  - `tools/dsl-census.ts` montre les variantes retirées.
- **Lot sans changement de règles :**
  - `npm run golden` sans divergence ;
  - fuzz à graines fixes (`npm run fuzz -- --games 300 --pool all --seed N`) aux résultats identiques à ceux de S0.
- **Lot [règles] :**
  - `RULES_VERSION` avance ;
  - tests de décisions officielles dans `engine/test/rulings.test.ts` ;
  - tests de la carte dans `engine/test/<ext>.test.ts` pour chaque comportement changé (Liliana, Winnowing, Kindred Judgment…) ;
  - le commit dit quelles parties dorées ont été régénérées.
- **Lots P :** bench avant et après (`git stash`), plus les mêmes contrôles à l'identique.
- **En fin de phase :** `npm run verify -- --full`.
