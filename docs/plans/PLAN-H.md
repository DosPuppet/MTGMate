# PLAN-H — Passe sur la dette et les approximations

## Contexte

Les PLAN-E (Commander, neuf préconstruits), PLAN-G et les decks récents ont ajouté beaucoup de formes et d'approximations. La dette s'est ré-accumulée, en partie de façon invisible : plusieurs structures n'ont pas de plafond (TriggerMod, EventReplacement, CastInfo…).

État au 07/10/2026 (règles 149) :
- **dette** (`packages/cards/data/debt-baseline.json`) :
  - entrées : playerStatic 62, keyword 15, op 23, singleCardKeys 100, turnFields 12 ;
  - plafonds : CardDef 98, GameObject 62, PlayerState 24, ObjectFilter 89, CastPermissionAbilityDef 21, Effect 154 / 654 champs ;
- **approximations** (`docs/approximations.md`) : 24 générales et 267 par carte (202 `règle`, 42 `choix auto`, 23 `timing`).

Objectif : réduire les deux, par de vraies fusions et des formes génériques qui lèvent des familles entières.

Décisions de l'utilisateur :
- plan complet, lots H0 à H11 ;
- on garde les choix automatiques façon Arena (environ 45 entrées), comme le PLAN-A, sauf ceux qui sont triviaux.

Un lot par commit sur `dev`, à la demande de l'utilisateur.

## Principes (repris de PLAN-S et PLAN-A)

1. **De vraies fusions seulement.** Un champ disparaît parce qu'un seul évaluateur le couvre désormais. Regrouper des champs dans un sous-objet juste pour faire baisser un compte ne vaut pas fusion. Les aides de `engine/src/dsl.ts` servent de façade : les scripts de cartes ne changent que là où ils écrivent des littéraux bruts.
2. **Les clés sont comptées par nom.** `debt.test.ts` compte une clé par son nom dans 6 fichiers du modèle. Renommer un champ propre à une carte vers un nom déjà partagé l'efface donc, à condition que le sens soit le même.
3. **Lot sans changement de règles :**
   - parties dorées identiques (`npm run golden`) ;
   - empreinte du fuzz identique à graine égale, avant et après : `npm run fuzz -- --games 300 --pool all --seed N`.
4. **Lot [règles] :**
   - `RULES_VERSION` avance (`engine/src/record.ts`, ligne d'historique) ;
   - tests de règles tirés de l'Oracle ;
   - `rulings.test.ts` pour les interactions délicates ;
   - ne sont régénérées que les parties dorées qui divergent, et le commit les nomme.
5. **Nouvelles questions au joueur :**
   - jamais posée quand il n'y a qu'une option (les parties en duel et les dorées en duel restent identiques) ;
   - la réponse suggérée est le choix que le moteur faisait jusqu'ici.
6. **Plafonds :** baissés dans le même commit, avec `npx tsx tools/debt-ceilings.ts --write "PLAN-H Hn : …"`.
7. **Approximations :**
   - une approximation levée sort de `approximations.md`, une nouvelle y entre ;
   - on garde exprès les choix façon Arena, le « hors de la partie » et les timings au résultat identique.

## Lots

| Lot | Contenu | [règles] | Taille |
|---|---|---|---|
| H0 | Nettoyage, documents périmés, outillage de la dette | non | S |
| H1 | Renommages exacts et retours sur les ajouts récents | non | S/M |
| H2 | Approximations levées par script seulement | oui | M |
| H3 | Provocation (goad) et exigences d'attaque | oui | M |
| H4 | Choisir un joueur sans le cibler | oui | S/M |
| H5 | Joueur attaqué et joueur défenseur en multijoueur, ninjutsu | oui | M |
| H6 | Actions de règle sur la pile (monarque, radiation, vitesse) | oui | S/M |
| H7 | Familles moyennes du DSL et champs « ce tour-ci » simples | non | M |
| H8a / H8b | Ops fusionnées (famille « garder ») / statiques de joueur et mots-clés | oui | M + M |
| H9 | « En arrivant » générique | oui | L |
| H10 | ObjectFilter : comparaisons dynamiques, attaches | non | L |
| H11 | Champs « ce tour-ci » vers le journal du tour, puis bilan | si besoin | L |

### H0 — Nettoyage et outillage (S)

**Commentaires périmés :**
- La recherche cachée (hideaway) est déjà « face cachée » depuis PLAN-C C6. Corriger le commentaire de Collector's Cage (`cards/src/big/index.ts:87`), Fight Rigging (`edh/counterblitz.ts`), Clive's Hideaway (`fin/legends4.ts:264`), Beseech the Mirror (`woe/black.ts:121`), Connecting the Dots (`mkm/red.ts:97`) et Flameshape (`hob/red.ts:124`).
- Boommobile (`dft/speed.ts:261`) : le commentaire dit le contraire du script.
- Codie, Ravenous Codex (`fra/artifacts.ts:92`) : écrire d'abord un test montrant que la copie redemande ses cibles (`stackChoices.ts:60`), puis retirer le commentaire.

**`approximations.md` :**
- retirer Officious Interrogation et The Death of Gwen Stacy III, déjà exacts puisqu'il y a au plus 4 joueurs ;
- documenter deux approximations non écrites :
  - piles du premier adversaire (`ops/zones.ts:1520`) : Fact or Fiction, Intrude on the Mind, Riddles in the Dark ;
  - défenseur oublié par le ninjutsu (`stack.ts:3548`).

**Outillage de la dette :**
- exclure `affects` dans `debt.test.ts:20` (le moteur le traite déjà comme une méta-clé, `statics.ts:35`) : playerStatic passe de 62 à 61 ;
- une seule liste `SURFACES`, exportée de `cards/test/debtSurface.ts` et utilisée par `debt.test.ts` comme par `tools/debt-ceilings.ts` ;
- corriger le format des notes (le diff ajouté deux fois) et les deux notes doublées ;
- mesurer 10 nouvelles structures à leur taille actuelle : TriggerMod, EventReplacement, CastInfo, TurnLogQuery, MoveSpec, BlockRule, TargetSpec, AdditionalCost, CastLimit, NextSpell.

### H1 — Renommages exacts et retours sur les ajouts récents (S/M, sans changement de règles)

**Renommages vers un nom partagé :**
- `copySpell.sacrificeAtEnd` → `sacrificeAtEndStep` ;
- `NextSpell.copyNonlegendary` → `nonlegendary` ;
- TriggerMod `onEnter`, `onAttack`, `onDies`, `onDraw` → `on?: "enter" | "attack" | "dies" | "draw"` ;
- gainControl `toOwner` → `to: "owner"` ;
- grantPlay `forOwner` / `forNonOwners` → `for?`, et `landsTapped` → `tapped` ;
- castNow `exileAfter` / `bottomAfter` → `after?` ;
- AbilityCostMod : `reduce?: number | Amount` ;
- CostDef : `loyalty: number | "X"` ;
- LayerMods : `addChosen?: "subtype" | "landType"` ;
- AdditionalCost : `discardOr?` ;
- TargetSpec et `pickFromZone` : `distinct?: "name" | "manaValue"` ;
- becomesTarget : `by?`.

**Retours sur les ajouts des PLAN-E :**
- `PlayerState.poison` et `rad` → `counters: { poison, rad }` ; la vue garde ses noms de champs, donc pas de nouveau `PROTOCOL_VERSION` ;
- `CastInfo.artifactMana` et `caveMana` → `spentFrom` ;
- `halfLife` → `div` et `lifeTotal { starting }` ;
- `lifeAboveStart` devient un alias de `amountAtLeast` ;
- `maxOverPlayers.sum` → une forme d'agrégat ;
- `createTokens.attacking` (une Ref) aligné sur `copyToken.attacking` / `attackEach` ;
- `onPrevent.countersOnDamaged` → `counters { on }` ;
- couleurs « Thriving » : `options` de l'op `chooseOnEnter`.

**Attendu :**
- singleCardKeys de 100 à environ 86 ;
- PlayerState 24 → 23, CostDef 34 → 33, LayerMods 31 → 30, Amount 35 → 34, Condition 54 → 53 ;
- Effect : environ 6 champs en moins.

### H2 — Approximations levées par script (M, [règles])

Trois sous-agents en parallèle, un par groupe d'extensions, comme les lots A1 et A2. Chaque carte est revérifiée contre son Oracle.

Candidats :

| Carte | Correction |
|---|---|
| The Endstone (`eoe/rares.ts:445`) | « la moitié des PV de départ » avec `amount.startingLife` |
| Cloak and Dagger | `TargetSpec.of` |
| Finality, Krenko's Buzzcrusher | `fx.chooseAmong` (`dsl.ts:1273`) au lieu d'une cible |
| Kaya, Spirits' Justice / Jetsam, Hapatra | une cible par adversaire |
| Temple of the Dead, Namor | `ref.playersWhere` |
| Nightkin Ambusher | `ref.defendingPlayer` ou une règle de blocage du défenseur |
| Kitesail Larcenist | `differentPlayers` |
| Super Intelligence | entretien du contrôleur de la créature enchantée |

Chaque agent relit aussi sa section d'`approximations.md` pour lever tout ce qui n'exige pas de nouvelle forme.

Attendu : 12 à 18 entrées levées.

### H3 — Provocation et exigences d'attaque (M, [règles])

**Modèle (BlockRule) :**
- `goadedBy?: PlayerId`, posé par `fx.goad(what, durée)` qui fige le contrôleur à la résolution, comme `mustBlockEventObject` → `mustBlockAttacker` (`ops/permanents.ts:266`) ;
- `mustAttackPlayer?: PlayerId | "mostLifeOpponent"`.

**Moteur (`turn.ts:775-905`) :**
- `attackRequirements` ;
- `forcedAttackers` compte les créatures provoquées ;
- `declareAttackers` applique 508.1d : satisfaire le plus d'exigences possible, sans jamais imposer de payer une taxe ;
- `forcedAttacks` choisit le meilleur défenseur ;
- `allowedDefenders` et `preferredDefenders` sont exportés.

**IA :**
- `chooseDefenders` et `attackTarget` (`ai/src/heuristic.ts:78`) lisent ces aides, ainsi que `policy.ts:132`, `random.ts:55` et `combat.ts:31` ;
- cela lève aussi un report du PLAN-A : l'IA ignorait les restrictions d'attaque de chaque créature.

**Client :** pastille « Provoquée », présélection des attaques (`store.ts:1420`), script Playwright.

**Cartes :** Dack Fayden, Fast Forward, Taunt from the Rampart, Galactus, Silver Surfer, Maximum Carnage.

**Attendu :** 3 entrées levées (6 cartes) ; plafond de BlockRule +2, justifié ; en option, le mot-clé `mustAttack` devient une règle de blocage (keyword 15 → 14).

### H4 — Choisir un joueur sans le cibler (S/M, [règles])

**Forme :** `chooseAmong` (`ops/zones.ts:153`) accepte des joueurs, plus une option `random`, et une aide `chooseOpponent()`.

**Utilisations :**
- piles (`ops/zones.ts:1514`) ;
- cadeau (`ops/players.ts:81`) : demandé quand le sort est mis sur la pile, comme une répartition (601.2d) ; `giftTo` est retenu sur l'élément de pile.

**Cartes :**
- Discerning Financier, Sandstone Oracle, Zuko, Conflicted ;
- Indoraptor (au hasard) ;
- Curator of Destinies, Fact or Fiction, Intrude on the Mind, Riddles in the Dark ;
- le cadeau de Bloomburrow.

**Attendu :** environ 6 entrées levées, plus les 2 ajoutées en H0. Les parties en duel restent identiques (une seule option, donc aucune question).

### H5 — Joueur attaqué en multijoueur, ninjutsu (M, [règles], après H3)

**Une seule question « que doit attaquer ? »**, sortie de `createTokens` (`ops/permanents.ts:333-361`) et partagée par :
- `moveTo` (`MoveSpec.attacking: boolean | Ref`) ;
- `copyToken` (`attacking`, `attackEach` : la myriade pose un choix par copie) ;
- `createTokens`.

**Ninjutsu :** le défenseur de l'attaquant renvoyé est gardé dans `CostPaid` et réutilisé à l'arrivée du ninja (702.49c).

**Conditions sur le joueur attaqué :**
- `ObjectFilter.attacking: true | "you" | "player"` ;
- `attackWith.defending: "you" | "player"` ;
- taxe d'attaque qui porte sur un joueur seulement (Propaganda).

**Cartes :**
- arrivée en attaquant : Mardu Siegebreaker, Kaito, Shark Shredder, Adeline, la myriade, Shredder ;
- conditions sur le joueur attaqué : Swat Away, Mangara, Attuma, Crowd of True Believers, Party Dude, Oviya, Dollmaker's Shop, Propaganda, Nuka-Nuke Launcher.

**Attendu :** environ 12 entrées levées et 3 raccourcies.

### H6 — Actions de règle sur la pile (S/M, [règles])

- **Forme :** `rulesTrigger(s, joueur, nom, effets)`. Elle passe par `pushInline` (`triggers.ts:1228`) avec une définition synthétique (`rules:monarch`, `rules:radiation`, `rules:speed`), construite comme celles des emblèmes (`ops/permanents.ts:293`).
- **Remplace :**
  - la pioche du monarque (`turn.ts:146`) ;
  - la radiation (`turn.ts:149,162`) ;
  - l'augmentation de vitesse (`actions.ts:232`).
- **À vérifier :** la source sans objet, dans la vue, l'affichage de la pile, `determinize` et `hidden-info`.
- **Attendu :** les entrées du monarque et de la radiation levées, ainsi que l'entrée générale sur la vitesse. Les dorées Commander et DFT divergeront.

### H7 — Familles moyennes du DSL (M, sans changement de règles quand c'est possible ; découpable en H7a et H7b)

- **Durées de `modify`** (`untilLeavesExile`, `whileSource`, `whileSourceTapped`, `whileYouControlSource`, `whileTapped`, `whileHasCounter`) → `while?`.
- **Sort des copies** (`sacrificeAtEndStep`, `exileAtEndStep`, `sacrificeAtNextUpkeep`, `atEndOfCombat`) → `atEnd?`.
- **Durées de `playerEffect` et `grantPlay`** → `duration?`.
- **`EventReplacement.modify`** :
  - `addSourceCounters` et `addSourcePower` → `add?: Amount` ;
  - `atLeastSourcePower` → `atLeast?: Amount`.
- **`TurnLogQuery.source*`** → `source?`, avec un seul comparateur.
- **GraveyardReplacement** `gainLife` / `createToken` → `then?: Effect[]`.
- **MoveSpec** `cloak` / `manifest` → `as?`.
- **CastPermission** : les 11 champs `linked*` reprennent les noms et l'évaluateur de `PlayFromZone` (`zone: "linked"`). Lecteurs : `stack.ts`, `legal.ts`, `view.playableElsewhere`.
- **Champs « ce tour-ci » simples :**
  - `warpExiledTurn`, `plottedTurn` et `foretoldTurn` → `exiledVia { kind, turn }` ;
  - `expiresEndOfTurn` et `expiresAtTurnOf` → `expires` ;
  - `usedModes` et `usedModesTurn` fusionnés.
- **Attendu :**
  - singleCardKeys d'environ 86 à environ 62 ;
  - CastPermissionAbilityDef 21 → environ 11 ;
  - turnFields 12 → 7, GameObject 62 → 58 ;
  - Effect : environ 15 champs en moins.

### H8a — Ops fusionnées (M, [règles])

- **Un op `keep`** : `{ who, chooser: "each" | "you", pick: "one" | "onePerType" | "totalPower" | "sharesType", filter, fate: "sacrifice" | "destroy" }`.
  - Il remplace `keepOnePerType`, `keepWithinTotalPower`, `keepSharingCreatureType` et `destroyAllButOnePerPlayer` (`ops/zones.ts:299-540,983`).
  - Flux unique : les choix se font en ordre APNAP, puis le sort tombe sur tout le reste en même temps.
  - Il lève l'approximation de Tragic Arrogance (c'est le lanceur qui choisit).
- **Autres ops :**
  - `destroyAllButChosenType` → choix du type, puis `destroyAll` avec un filtre ;
  - `damageEachPlayerPer` → `forEachPlayer` ;
  - `sacrificeElseDiscard` et `tapOrSacrifice` → punisher ou `unlessPay`, si la forme de la question convient.
- **Attendu :** op 23 → environ 16, Effect 154 → environ 147.

### H8b — Statiques de joueur et mots-clés (M, [règles], en parallèle de H8a)

**Fusions de statiques de joueur :**
- `enchantedPlayerCantGainLife` → `cantGainLife` avec `affects`. Vérifier d'abord, d'après les règles, l'interaction avec les remplacements de gain de PV.
- `combatDamageUnpreventable` et `damageUnpreventable` → `damageUnpreventable: true | "combat"`.
- `cantLose` et `noLoseForLife` → `cantLose: true | "life"`.
- `skipTurn`, `skipDrawStep` et `skipExtraTurns` → `skip?`.
- `noMaxHandSize` → `maxHandSize`.
- `lookAtTopCard` et `seeFaceDown` → un seul champ.
- Famille du combat (`attackTax`, `blockTax`, `maxOneAttacker`, `maxBlockingCreatures`, `cantAttackPlayer`, `cantAttackPlaneswalkers`) : seulement si un évaluateur unique remplace les vérifications séparées. À faire après H3.

**Mots-clés :**
- `combatDamageImmune` → `PreventionAbilityDef` ;
- `doesntUntap` et `mayNotUntap` → remplacement `untap` ; Hedge Whisperer gagne un vrai choix.

**Attendu :** playerStatic 61 → environ 47, keyword 15 → environ 12.

### H9 — « En arrivant » générique (L, [règles], seul)

- **Modèle :** `CardDef.asEnters?: Effect[]` remplace `chooseOnEnter`, `enterModes`, `devour` et les cinq champs `entersAsCopy*`.
- **Une boucle unique pour les quatre chemins d'arrivée :**
  - résolution d'un sort (`specsAndEffects`, `stack.ts:3687`, qui ne gère aujourd'hui qu'un seul de ces effets) ;
  - jeu d'un terrain ;
  - `moveTo` ;
  - chemin par défaut (`replacement.ts:310-375`).
- **`chooseCopy`** gagne `duration` et `optional`.
- **Mettre à jour** les déductions de `scryfall.ts`.
- **Cartes :**
  - Echoing Deeps, Cursed Mirror, Altered Ego, Sin, Unending Cataclysm, Dawn-Blessed Pennant, Arachne ;
  - en partie Flesh Duplicate, Indominus Rex, Abuelo's Awakening ;
  - peut-être Mox Diamond.
- **Attendu :** environ 8 entrées levées ; CardDef 98 → environ 91.
- **Risque :** élevé (copies de sorts de permanent, jetons, faces cachées, questions du client).

### H10 — ObjectFilter (L, sans changement de règles, empreinte identique)

**Comparaisons dynamiques :**
- Environ 17 champs → `compare?: { what, op, to: Amount }[]` : `manaValueSourcePower`, `maxToughnessX`, `powerAboveOf`, `manaValueSourceCounters`, `maxManaValueX`, `powerAboveSource`, `powerBelowSource`, `toughnessAbovePower`, `powerAboveBase`, `manaValueParity`…
- Un seul résolveur remplace les deux actuels (`effects.ts:101-133`, `targets.ts:172-244`).
- Les bornes fixes `min*` / `max*` restent.
- Documenter quel X est lu (celui de la capacité, sinon celui du permanent).
- Un test par champ retiré ; vérifier `printedMatch` (`layers.ts:105`).

**Attaches et équipage :** `attachedToSource`, `wasAttachedToSource`, `crewedBySource`… → `attached?` et `crew?`.

**Attendu :** ObjectFilter 89 → environ 73 ; singleCardKeys environ −8.

### H11 — Journal du tour, puis bilan (L)

- **Journal du tour :** `loyaltyTurn`, `activatedTurn`, `discardedTurn`, `saddledTurn`, `countersPut*`, `tapTurn` et `tapsThisTurn` deviennent des entrées du journal du tour, avec l'identifiant de l'objet.
  - `canActivate` est sur le chemin chaud de `legalActions` : mesurer le bench avant et après (`git stash`).
  - Attendu : turnFields de 7 à environ 1.
- **Bilan :**
  - `verify --full` ;
  - mise à jour de `moteur.md`, `CLAUDE.md`, `historique.md` et du bilan du plan.

## Ordre et parallélisme

- **Épine dorsale séquentielle** (ces lots réécrivent tous `model/effects.ts`, `model/cards.ts` et `dsl.ts`) : H0 → H1 → H7 → H9 → H10 → H11.
- **Fenêtre 1, après H1** (copies de travail isolées, fusionnées par cherry-pick comme A3 et A4) : H2 (3 agents), H3, H4 et H6.
- **Strictement après H3 :** H5.
- **Fenêtre 2, après H7 :** H8a et H8b.
- **À chaque fusion :**
  - `RULES_VERSION` numérotée dans l'ordre des fusions (150, 151…) ;
  - relancer `debt-ceilings`, les dorées et `debt.test.ts`.

## Cibles

| Mesure | Aujourd'hui | Après H10 | Après H11 |
|---|---|---|---|
| singleCardKeys | 100 | ~55 | ~55 |
| playerStatic / keyword / op | 62 / 15 / 23 | ~47 / 12 / 16 | idem |
| turnFields | 12 | 7 | ~1 |
| CardDef / GameObject / PlayerState | 98 / 62 / 24 | ~91 / 58 / 23 | — / ~50 / — |
| ObjectFilter / CastPermissionAbilityDef | 89 / 21 | ~73 / 11 | idem |
| Effect (variantes / champs) | 154 / 654 | ~147 / ~620 | idem |
| Approximations (par carte / générales) | 267 / 24 | ~215 / 22 | idem |

## Vérifications

**À chaque lot :**
- `npm run verify -- --set <EXT>` pour chaque extension touchée (`--set COMMANDER` pour les cartes EDH) ;
- `--set META` pour les lots du moteur ou du DSL ;
- `npx tsx tools/debt-ceilings.ts` doit répondre « Plafonds à jour ».

**Lots sans changement de règles (H0, H1, H7, H10) :**
- `npm run golden` sans divergence ;
- même empreinte de fuzz avant et après (`--games 300 --pool all --seed N`).

**Lots [règles] :**
- `RULES_VERSION` avancée ;
- tests de l'Oracle dans `engine/test/<ext>.test.ts` ou `edh*.test.ts` ;
- `rulings.test.ts` pour 701.38 (provocation), 702.49c (ninjutsu) et 508.1d (exigences) ;
- dorées régénérées nommées dans le commit.

**Après tout changement du moteur :**
- fuzz strict `--offers 4` à 2, 3 et 4 joueurs ;
- tout désaccord entre ce que `legalActions` propose et ce que le moteur accepte reçoit un test dans `offers.test.ts`.

**Client et vue (H3, H4, H5) :** tests d'interface `--ui` après redémarrage de Vite, plus un script Playwright ponctuel avec captures dans `test-results/`.

**IA (H3, H5) :** `ai-smoke` et `npm run arena` (600 parties ou plus, dont Commander à 4 joueurs).

**Fin de série :** `npm run verify -- --full`.

## Fichiers critiques

- `packages/engine/src/model/{cards,effects,rules,state}.ts`
- `packages/engine/src/dsl.ts`
- `packages/engine/src/turn.ts`, `ops/zones.ts`, `ops/permanents.ts`, `stack.ts`, `replacement.ts`, `targets.ts`
- `packages/ai/src/heuristic.ts`
- `packages/cards/test/debt.test.ts`, `packages/cards/test/debtSurface.ts`, `tools/debt-ceilings.ts`, `packages/cards/data/debt-baseline.json`
- `docs/approximations.md`

## Suivi

- **H0 (07/10/2026) :**
  - commentaires périmés corrigés : sept cartes de recherche cachée exilent déjà face cachée, Boommobile, et Codie, Ravenous Codex (avec un test : la copie redemande ses cibles) ;
  - `approximations.md` : Officious Interrogation et The Death of Gwen Stacy III retirés (au plus quatre joueurs) ; piles du premier adversaire (Fact or Fiction, Intrude on the Mind, Riddles in the Dark) et défenseur du ninjutsu documentés ;
  - dette : `affects` traité comme une méta-clé (playerStatic 62 → 61), une seule liste des surfaces (`debtSurface.ts`), notes de plafonds sans doublon, dix structures mesurées (TriggerMod 9, EventReplacement 18, CastInfo 10, TurnLogQuery 31, MoveSpec 18, BlockRule 13, TargetSpec 24, AdditionalCost 13, CastLimit 9, NextSpell 9).
- **H1 (07/10/2026) :** renommages exacts, sans changement de règles (parties dorées et empreintes de fuzz identiques : `880c4c6c` sur tout le pool, `32593805` en Commander, graine 7) :
  - `sacrificeAtEnd` → `sacrificeAtEndStep` (copie de sort et arrivée) ; `copyNonlegendary` → `nonlegendary` ; `exileAfter` / `bottomAfter` → `after` (castNow, grantPlay et permissions de jouer) ;
  - TriggerMod `onEnter` / `onAttack` / `onDies` / `onDraw` → `on` ; gainControl `to: "owner"` ; grantPlay `for`, `tapped` ;
  - AbilityCostMod `reduce: number | Amount` ; CostDef `loyalty: number | "X"` ; AdditionalCost `discardOr` ; LayerMods `addChosen` ;
  - `distinct: "name" | "manaValue"` (cibles, pickFromZone, sacrifice en coût) ; becomesTarget `by` ;
  - retours sur le PLAN-E : `PlayerState.counters { poison, rad }` (la vue garde ses noms), `CastInfo.spentFrom`, `halfLife` et `lifeAboveStart` exprimés par `lifeTotal` (`who`, `starting`) et `div` (`up`) ;
  - écartés (pas de gain réel) : `maxOverPlayers.sum`, `createTokens.attacking` (revu en H5), `onPrevent.countersOnDamaged`, couleurs « Thriving » ;
  - dette : singleCardKeys 100 → 86 ; PlayerState 24 → 23, CostDef 34 → 33, LayerMods 31 → 30, TriggerMod 9 → 6, CastInfo 10 → 9, TargetSpec 24 → 23, AdditionalCost 13 → 11, Effect 654 → 651 champs, TriggerSpec 164 → 162 champs, Condition 54 → 53 (99 → 97 champs), Amount 35 → 34.
- **H2a (07/10/2026, règles 150) :** approximations levées par les scripts dans les sections FDN à FRA (15 entrées, 16 cartes : The Endstone, Hapatra, Kitesail Larcenist, Temple of the Dead, Choco, Radiant Lotus, Hollow Marauder, Garruk, Veiled Butcher −3, Betor, Whiskervale Forerunner, Thousand Moons Smithy, Sandswirl Wanderglyph, Ojer Kaslem, Brass's Tunnel-Grinder et Unstable Glyphbridge déjà exacts) ; 12 tests ; une entrée `timing` ajoutée (Ojer Kaslem) ; relecture adversariale : Choco compte les Oiseaux au déclenchement. Parties dorées identiques.
- **H2b (07/10/2026, règles 151) :** approximations levées par les scripts dans les sections Méta à HOB : Krenko's Buzzcrusher, Kaya, Spirits' Justice −2, Jetsam, Super Intelligence, Sentinel of Lost Lore, The Legend of Yangchen, Kitsune, Madame Null, Shredder's Technique ; Mysterio et Spry and Mighty retirés (exacts d'après les décisions officielles) ; raccourcies : Cloak and Dagger, Zimone's Experiment, Dream Harvest ; 17 tests. Relecture : le choix facultatif de `chooseAmong` suggère d'abord l'objet d'un autre joueur (Yangchen). Parties dorées identiques.
- **H2c (07/10/2026, règles 152) :** approximations levées dans les sections Rééditions et Commander : Finality (choix sans cible), Black Bolt (permanent du joueur qui l'a ciblé), Nightkin Ambusher (joueur défenseur), Negative Zone Portal (au hasard), Mutational Advantage ; raccourcies : Namor, Ragavan, Sylvan Library, Expropriate, Plague of Vermin ; 11 tests. Relecture : la prévention de Mutational Advantage tient même si les permanents perdent leurs capacités (nouvelle sorte `preventDamage` des remplacements d'objet). Parties dorées identiques.

