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

**Plan fait le 07/10/2026 (règles 164) :** lots H0 à H11 faits ; bilan en fin de document.

| Mesure | Départ (règles 149) | Fin (règles 164) | Cible |
|---|---|---|---|
| singleCardKeys | 100 | 54 | ~55 |
| playerStatic / keyword / op | 62 / 15 / 23 | 52 / 12 / 16 | ~47 / 12 / 16 |
| turnFields | 12 | 0 | ~1 |
| CardDef / GameObject / PlayerState | 98 / 62 / 24 | 91 / 49 / 23 | ~91 / ~50 / 23 |
| ObjectFilter / CastPermissionAbilityDef | 89 / 21 | 71 / 10 | ~73 / 11 |
| Effect (variantes / champs) | 154 / 654 | 149 / 639 | ~147 / ~620 |
| Approximations (générales / par carte) | 24 / 267 | 27 / 217 | 22 / ~215 |

Écarts avec le plan : la fusion `GraveyardReplacement` → `then` est écartée (H7a, deux évaluateurs resteraient) ; quatre statiques de combat restent séparées (H8b, règles différentes, 508.1 et 509.1). Les approximations générales ont augmenté parce que H0 et H5 ont documenté des approximations jusque-là non écrites. Hors plan : deux correctifs de cartes trouvés en partie (règles 157 et 159) et l'accélération des arènes Commander (voir plus bas).

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
- **H4 (07/10/2026, règles 153) :** choisir un joueur sans le cibler : `chooseAmong` accepte des joueurs et une option `random`, `fx.chooseOpponent` ; les piles (Fact or Fiction, Intrude on the Mind, Riddles in the Dark, Curator of Destinies) sont séparées ou choisies par l'adversaire que vous choisissez ; l'adversaire du cadeau est choisi au lancement (`CastInfo.giftTo`), et une copie garde celui de l'original (relecture) ; Discerning Financier, Sandstone Oracle, Indoraptor levées, Zuko, Conflicted raccourcie. Aucune question quand il n'y a qu'un adversaire : parties dorées identiques. CastInfo 9 → 10, Effect 651 → 652 champs.
- **H6 (07/10/2026, règles 154) :** actions de règle sur la pile par `rulesTrigger` (sources synthétiques `rules:*`, nommées en français dans la pile) : pioche du monarque (724.2) et, relecture, passage du monarque après des blessures de combat ; radiation (si revérifié à la résolution) ; vitesse (702.179, une fois par tour, `s.turn.speedRaised` retiré). Approximations du monarque, de la radiation et de la vitesse levées. Effect 154 → 156 variantes (opérations `increaseSpeed` et `radiation`, utilisées par les règles et non par les cartes). Parties dorées identiques.
- **H3 (07/10/2026, règles 155) :** provocation (701.38, `fx.goad`, `BlockRule.goadedBy`, cumul de plusieurs provocateurs) et exigences d'attaque (`mustAttackPlayer`, dont « l'adversaire qui a le plus de PV ») : la déclaration doit satisfaire le plus grand nombre d'exigences possible, sans jamais imposer de payer une taxe (508.1d) ; la déclaration par défaut et l'IA (`allowedDefenders`, `preferredDefenders`, `repairAttacks`) les respectent, ainsi que les restrictions d'attaque de chaque créature (report du PLAN-A levé) ; pastille « Provoquée » dans le client. Cartes : Dack Fayden, Fast Forward, Taunt from the Rampart, Galactus, Silver Surfer, Maximum Carnage. Relecture : six défauts corrigés (attaque payée qui dispensait d'une exigence gratuite, « ne peut pas attaquer seule », cumul de Maximum Carnage…). `mustBlockEventObject` fondu dans `mustBlockAttacker: "eventObject"`. Parties dorées identiques.
- **Correctif de la fenêtre 1 (07/10/2026, règles 156) :** un joueur qui quitte la partie pendant une résolution (800.4a) ne bloque plus la partie : la question qui lui était posée reçoit une réponse neutre (`absentAnswer`), une question qui devait lui être posée n'est pas posée, et la capacité d'un joueur parti cesse d'exister ; la priorité revient au joueur actif (117.3b). Trouvé par le fuzz strict à 4 joueurs (graine 62) ; deux défauts relevés à la relecture, chacun avec son test (`multiplayer.test.ts`). Parties dorées identiques.

- **Correctif hors plan (07/10/2026, règles 157) :** Mirelurk Queen, Nightkin Ambusher et The Master, Transcendent donnaient leurs marqueurs de radiation à « personne » : la cible était déclarée `"p"`, l'effet lisait `ref.target()` (`"t"`). Signalé par une partie de l'utilisateur. Nouvelle garde `cards/test/target-refs.test.ts` : toute référence à une cible désigne une cible déclarée (ou une liaison), toute cible déclarée est lue (exception documentée : Great Train Heist).
- **H5 (07/10/2026, règles 158) :** joueur attaqué en multijoueur et ninjutsu. Une seule question « que doit attaquer ? » (`chooseAttacked`, `ops/permanents.ts`), partagée par `createTokens`, `copyToken` et les déplacements (`arrivalChoices`, `ops/zones.ts`, qui reprend les terrains choc) : parmi les adversaires et leurs planeswalkers, sans restriction ni taxe d'attaque (508.4), ou parmi les défenseurs désignés (`attacking: Ref`, référence `withPlaneswalkers`), écartés s'ils ne peuvent plus être attaqués (508.4a) ; jamais posée pour une seule option. Ninjutsu : le défenseur de l'attaquant renvoyé est gardé (`CostPaid.defender`, `ref.cost("defender")`, 702.49c). Myriade : une question facultative par adversaire (`copyToken.optional`). Conditions : `ObjectFilter.attacking: "you" | "opponent" | Ref`, déclencheur `attacks` avec `defending: "player"`, déclencheurs `attacks` et `attackWith` avec `defending: "you"` (vous seulement : Sabotage Strategist, Trouble in Pairs, Lulu, Struggle for Project Purity) ou `"youOrYourPlaneswalkers"` (Jace, Tomik, Mangara), `attackTax` réservée aux attaques contre le joueur (Propaganda, Ghostly Prison, Dáin, Summon: Yojimbo), `{ amount, defending: "youOrYourPlaneswalkers" }` pour Archangel of Tithes. Jetons créés pour un autre joueur (Najeela) : leur contrôleur choisit parmi ses propres adversaires. Cartes : Kaito, Bane of Nightmares, Mardu Siegebreaker, Shark Shredder, Adeline, Goldlust Triad, Shredder, Namor, Swat Away, Mangara, Attuma, Crowd of True Believers, Party Dude, Oviya, Dollmaker's Shop, Propaganda ; 15 entrées d'`approximations.md` levées (dont l'entrée générale du ninjutsu), une raccourcie (Dollmaker's Shop), une entrée générale ajoutée (un seul défenseur pour les jetons d'un même effet) ; Nuka-Nuke Launcher inchangé. 22 tests, puis 6 après relecture (Sabotage Strategist, Trouble in Pairs, Lulu, Struggle for Project Purity, Najeela, Calamity). Dette : `againstYou` n'est plus utilisé par une carte ; Effect 654 → 655 champs, Ref 34 → 35 (63 champs). Parties dorées identiques ; empreinte du fuzz identique en duel (`387119f0`, 200 parties, tout le pool).
- **Correctif hors plan (07/10/2026, règles 159) :** recherche des liens par nom qui échouent en silence dans les scripts (valeurs retenues et variables : aucun écart sur 1 362 lectures). Corrigés : Serra's Emissary (la protection contre le type choisi lit le choix de la source de la statique, `layers.ts`) ; sept capacités d'équipement écrites à la main sans `equip: true` (jetons Hache, Épée, Cragflame, Pirate Hat, Bloodthorn Flail, Shredder's Armor, Dissection Tools, Dark Knight's Greatsword ; une aide `equipAbility`) ; Épuisement de Liliana the Repentant ; libellés des marqueurs (Initiative, Double initiative, 13 noms alignés sur le texte français). Gardes : `cards/test/ability-flags.test.ts` (Équiper et Épuisement comparés à l'Oracle, un libellé pour chaque sorte de marqueur).
- **Arènes Commander (07/10/2026, sans changement de règles) :** l'outil d'arène est parallèle par défaut (processus = cœurs − 2), distribue les parties à la demande, affiche l'avancement et les décisions les plus lentes ; profilage des parties à 4 joueurs, puis optimisations : contexte de parcours (`withScan`, `copiedDefMap`) pour les couches et les sources des déclencheurs, dépendances du cache `life` et `dealt` (`bumpFor`), clés sans valeur ignorées, actions basées sur l'état et retour du commandant sans parcours ni copies inutiles, `rollout` de l'IA sur place. Les marqueurs de poison font maintenant leur `bump` (Skrelv's Hive, trouvé par les invariants). Empreintes de fuzz identiques sur cinq séries ; 24 parties Commander à 4 joueurs : 405 → 229 s de CPU, décision la plus lente 4 058 → 665 ms ; avec le parallélisme, environ 700 → 32 s.
- **H7a (07/10/2026, sans changement de règles) :** familles moyennes du DSL, de vraies fusions (un seul évaluateur par champ) ; les aides du DSL gardent leurs options et les traduisent, seuls les littéraux bruts des scripts changent : Reste propre à une carte, sans être compté (le nom `exiled` est partagé, dans un autre sens) : `while: { exiled }` d'Emrakul (« jusqu'à ce que la carte quitte l'exil »).
  - durées de `modify` (`untilLeavesExile`, `whileSource`, `whileSourceTapped`, `whileYouControlSource`, `whileTapped`, `whileHasCounter`) → `while` (`ModifyWhile` : `"source"`, `"sourceTapped"`, `"youControlSource"`, `"tapped"`, `{ counter }`, `{ exiled }`) ;
  - sort des copies (`sacrificeAtEndStep`, `exileAtEndStep`, `sacrificeAtNextUpkeep`, `atEndOfCombat`) → `copyToken.atEnd` (`CopyFate`, un seul bloc qui crée la capacité retardée) ; `copySpell.atEnd: "sacrifice"` et `StackItem.arrival.atEnd` (même sens) ;
  - durées de `playerEffect` (`untilYourNextTurn`, `untilTheirNextTurn`, `forever`) et de `grantPlay` (`untilYourNextTurn`, `untilOwnersNextTurn`, `untilYourNextEndStep`, `forever`) → `duration` ;
  - `EventReplacement.modify` : `addSourceCounters` et `addSourcePower` → `add: Amount`, `atLeastSourcePower` → `atLeast: Amount`, évalués du point de vue du remplacement (`replacementAdd`, `replacementAtLeast`, `statics.ts`, lus par tous les événements chiffrés) ;
  - `TurnLogQuery.source*` → `source: { controller, types, subtype, supertype, colors }`, comparé par le même comparateur que l'objet de l'entrée (`charsMatch`, `turnlog.ts`) ;
  - `MoveSpec.cloak` / `manifest` → `as` ;
  - écarté : GraveyardReplacement `gainLife` / `createToken` → `then` n'est pas une fusion : le gain de PV fait partie du remplacement (immédiat, The Darkness Crystal), le jeton vient d'une capacité réflexive sur la pile (603.12, Head of the Hunt) ; deux évaluateurs resteraient (ou un changement de règles) ;
  - définitions des cartes comparées avant et après (toutes les cartes et jetons, une fois les anciens champs traduits) : identiques ; parties dorées identiques ; empreintes du fuzz identiques (graine 7 : `2277fbdc` sur tout le pool, 300 parties ; `a8a081a5` en Commander, 200 parties ; `3648f25e` en Commander à 4 joueurs, 60 parties) ;
  - dette : singleCardKeys 85 → 70 ; TurnLogQuery 31 → 27, MoveSpec 18 → 17, Effect 655 → 642 champs.
- **H7b (07/10/2026, sans changement de règles) :** la suite de H7, de vraies fusions :
  - CastPermission : les 11 champs `linked*` de `CastPermissionAbilityDef` (Null Summoner, Intrepid Paleontologist, Taster of Wares, Maralen, Dawnhand Dissident, Hama, Azula, Cunning Usurper) et `playLinkedPayLife` (Valgavoth, statique de joueur) deviennent `playerStatic({ playFrom: { zone: "linked", … } })`, évalués par le seul `playFromRules` (`stack.ts`, lu par `baseCastTerms` et `landPermitted` ; `valgavothLinked` et la boucle des permissions liées retirés). Noms repris de `PlayFromZone` : `filter` (« que vous possédez » : `owner: "you"` ; « exilées ce tour-ci » : `enteredThisTurn`), `finality`, `anyMana`, `oncePerTurn`, `payLifeManaValue` (Valgavoth, avec `cond.yourTurn`) ; ajoutés à `PlayFromZone`, avec le même sens qu'ailleurs : `free`, `waterbend`, `maxManaValue: Amount` ; propre à une carte : `removeCountersAmong` (Dawnhand Dissident, ancien `linkedRemoveCounters`, justifié dans la référence) ;
  - `GameObject` : `warpExiledTurn`, `plottedTurn` et `foretoldTurn` → `exiledVia { kind: "warp" | "plot" | "foretell", turn }` (un seul champ lu par `baseCastTerms` et le filtre `warped`) ; `expiresEndOfTurn` et `expiresAtTurnOf` → `expires: { endOfTurn } | { turnOf }`, retirés par une seule fonction (`expireEmblems`, `turn.ts`, au nettoyage et au début du tour) ; `usedModes` et `usedModesTurn` → `usedModes: { modes, turn }` ;
  - la vue et le protocole ne changent pas (aucun de ces champs n'est lu par `projectView` ni par le client) ; les sauvegardes sont des rejeux de décisions ;
  - parties dorées identiques ; empreintes du fuzz identiques (graine 7 : `2277fbdc` sur tout le pool, 300 parties ; `a8a081a5` en Commander, 200 parties ; `3648f25e` en Commander à 4 joueurs, 60 parties ; fuzz strict `--offers 4`, 200 parties : `387119f0`, aucun désaccord) ;
  - dette : CastPermissionAbilityDef 21 → 10, PlayFromZone 17 → 21, GameObject 62 → 58 ; turnFields 12 → 7 ; singleCardKeys 70 → 63 ; statiques de joueur 61 → 60.
- **H8a (07/10/2026, règles 160) :** ops fusionnées.
  - Une seule opération `keep` (« gardez les permanents choisis », `fx.keep`, `ops/zones.ts`) remplace `keepOnePerType`, `keepWithinTotalPower`, `keepSharingCreatureType` et `destroyAllButOnePerPlayer` : `{ who, chooser: "each" | "you", pick: "one" | "onePerType" | "totalPower" | "sharesType", filter, fate: "sacrifice" | "destroy", among?, max? }`. Un seul flux : tous les choix d'abord, dans l'ordre APNAP, puis le sort tombe en même temps sur tous les autres permanents du filtre (Liliana, Dreadhorde General sacrifiait joueur par joueur). `among` : les permanents qui peuvent être choisis (Unstable Glyphbridge : de force 2 ou moins ; Tragic Arrogance : un artefact, une créature, un enchantement et un planeswalker, terrains compris : un artefact-terrain peut être « l'artefact » gardé).
  - Approximation levée : Tragic Arrogance (c'est vous qui choisissez pour chaque joueur).
  - `destroyAllButChosenType` (Kindred Judgment) → `fx.chooseForSelf("creatureType")` puis `fx.destroyAll({ types: ["Creature"], not: { subtypeChosen: true } })` : tout type de créature peut être choisi (avant : seulement ceux des créatures en jeu), la suggestion est celle de `chooseOnEnter` (le type le plus présent chez vous) ; `damageEachPlayerPer` (Sunspine Lynx) → `fx.forEachPlayer` avec `damage`.
  - `sacrificeElseDiscard` (Momentum Breaker) : ni `punisher` ni `unlessPay` ne conviennent (le joueur n'a pas le choix : il défausse seulement s'il ne peut pas sacrifier) ; exprimé par `sacrifice` avec `store` puis `fx.when(cond.not(cond.v(…)), fx.discard(1, p))` dans `fx.forEachPlayer`, mêmes questions qu'avant. `tapOrSacrifice` (Command Bridge) : `unlessPay` poserait deux questions (oui/non puis le permanent) ; exprimé par `fx.tapChosen({}, …, { exactly: 1 })` puis `fx.when(…, fx.sacrificeIt(ref.self))`, la même question qu'avant (un permanent à engager, aucun pour la sacrifier) ; Command Bridge elle-même peut être engagée si elle est dégagée (Oracle).
  - 9 tests (Tragic Arrogance, Destined Confrontation, Winnowing, Unstable Glyphbridge à trois joueurs ; Liliana −9 à trois dans `rulings.test.ts` : ordre des choix, un permanent compte pour chacun de ses types, rien n'est sacrifié avant la fin des choix ; Kindred Judgment avec un changelin ; Sunspine Lynx et Momentum Breaker à trois ; Command Bridge) ; aucun écart trouvé hors de ceux levés.
  - parties dorées identiques ; fuzz strict `--offers 4` (200 parties, tout le pool) : `28eccd03`, une décision illégale de l'IA aléatoire comme avant (`387119f0`) ; Commander à 4 joueurs, IA mixte, `--offers 4` (80 parties) : `169a8b8f` ; 3 joueurs « chaos » (100 parties) : `acf7256d` ; aucune erreur.
  - dette : opérations propres à une carte 23 → 16 ; Effect 156 → 149 variantes, 642 → 632 champs.
- **H8b (07/10/2026, règles 161) :** statiques de joueur et mots-clés, de vraies fusions (un seul évaluateur par champ) :
  - `enchantedPlayerCantGainLife` → `cantGainLife` avec `affects: "enchanted"` (le joueur que la source enchante, `affectedPlayers`, `statics.ts`) ; d'après 119.7 et 101.2, « ne peut pas gagner de PV » est lu par `gainLife` avant tout remplacement du gain (ni « autant plus N », ni déclenchement), comme avant pour Screaming Nemesis ;
  - `combatDamageUnpreventable` + `damageUnpreventable` → `damageUnpreventable: true | "combat"` (évaluateur `damageUnpreventable`) ; `cantLose` + `noLoseForLife` → `cantLose: true | "life"` (`cantLose`, lu par `checkGameOver`, `winGame`, `loseGame`) ; `skipTurn`, `skipDrawStep`, `skipExtraTurns` → `skips: "turn" | "drawStep" | "extraTurns"` (`skips`, `consumePlayerEffect` avec une valeur ; nom `skip` écarté : il existe déjà dans `Effect`, dans un autre sens) ; `noMaxHandSize` → `maxHandSize: "none"` (même tri par horodatage, 613.11) ; `lookAtTopCard` + `seeFaceDown` → `lookAt: "libraryTop" | "faceDown"`, lu par le seul `mayLookAt` (`view.ts` : carte du dessus et créatures face cachée ; la forme de la vue ne change pas) ;
  - famille du combat : `cantAttackPlayer` + `cantAttackPlaneswalkers` → `cantAttack: { of, subtype? }`, un seul test dans `attackableDefenders` ; écartés, faute d'évaluateur commun : `attackTax` (`attackTaxFor`, défenseur attaqué) et `blockTax` (contrôleur des attaquants, payé à la déclaration des bloqueurs), `maxOneAttacker` (forme de la déclaration d'attaque) et `maxBlockingCreatures` (forme de la déclaration de blocage) : deux règles distinctes chaque fois (508.1, 509.1), les réunir n'aurait fait que les ranger dans un sous-objet ;
  - mots-clés : `combatDamageImmune` → `prevention({ self: true }, { combatOnly: true })` (Diamond Weapon, préventions statiques de `dealDamage`) ; `doesntUntap` et `mayNotUntap` → `doesntUntap(affects, { may, condition })` (`dsl.ts`) : remplacement `untap` limité à l'étape de dégagement de son contrôleur (`EventReplacement.untapStep: true | "may"`, `untapStepRule`), ignoré par `untapObject` ; 21 cartes (Auras, Mana Vault, Slumbering Cerberus, Traxos, Intruder Alarm, Bombur, Ty Lee…). Effets de règle : un permanent qui « ne se dégage pas » se dégage avec Prop Room (ce n'est pas l'étape de dégagement de son contrôleur) ; la restriction d'une Aura reste une capacité de l'Aura (un « perd toutes ses capacités » ultérieur sur la créature ne la retire plus) ;
  - Hedge Whisperer : un vrai choix (502.3) : quand elle est engagée, l'étape de dégagement demande au joueur actif les permanents qu'il garde engagés (`ChoicePurpose` `untap`, `answerUntapStep`) ; réponse proposée : celle du moteur jusqu'ici (engagée tant que le terrain 5/5 en dépend). Approximation levée ;
  - vue : `ObjectView.untapRule` (« ne se dégage pas », « peut ne pas se dégager »), affiché par le client comme une restriction, à la place des anciens mots-clés ; nouvelle sorte de question `untap` (choix sur le champ de bataille, sans changement du protocole) ; IA : `staysTapped` (`evaluate.ts`) ;
  - 14 tests (Hedge Whisperer ×3 et la vue, Grievous Wound et Angel of Vitality à trois joueurs, Frenzied Baloth et Diamond Weapon, Sunspine Lynx, Phyrexian Unlife et Angel's Grace face au poison, Diamond Weapon sans capacités, Intruder Alarm, Prop Room, Found Footage et Johann, « vos Jace », `skips`) ;
  - parties dorées identiques ; fuzz : seule diverge, sur tout le pool (200 parties, `--offers 4`), la partie 10, à la question de Hedge Whisperer ; en Commander à 4 joueurs (80 parties), des choix de l'IA moyenne changent (la partie 54 : Mana Vault vaut un peu plus, avec une capacité de plus) ; décisions illégales de l'IA aussi nombreuses qu'avant ;
  - dette : statiques de joueur 60 → 52, mots-clés non imprimés 15 → 12 ; EventReplacement 18 → 19 (`untapStep`).
- **H9 (07/10/2026, règles 162) :** « en arrivant » générique (614.1c, 614.12), une vraie fusion :
  - modèle : `CardDef.asEnters: Effect[]` remplace `chooseOnEnter`, `enterModes`, `devour`, `entersAsCopyOf`, `entersAsCopyMods`, `entersAsCopyKeepName`, `entersAsCopyOfGraveyard` et `entersAsCopyAnyController` ; les scripts écrivent `fx.chooseForSelf(sorte, { options })` (les modes des Sièges et la couleur exclue des terrains Thriving deviennent des `options`), `fx.chooseCopy(filtre, { anyController, fromGraveyards, optional, duration, except, counters, tapped, exile })`, `fx.devour(filtre, n)` (« Devour N » toujours lu dans le texte, `scryfall.ts`) ; tout autre effet peut y figurer, avec ses valeurs mémorisées ; des marqueurs mis sur `ref.self` sont ceux avec lesquels il arrive ; une soixantaine de scripts migrés ;
  - une seule boucle, `asEntersChoices` (`replacement.ts`), pour les quatre chemins : sort de permanent qui se résout (opération interne `asEnters`, qui remplace `chooseRiot` : l'émeute est demandée dans la boucle ; aussi la copie d'un sort de permanent, 707.10), terrain joué (la première question vient avec la décision `playLand`, `chosen` ou `landType`, sondée par `legalActions` ; `""` pour « aucune »), effet qui le met sur le champ de bataille (`arrivalChoices` : `moveTo`, recherches…), toute autre arrivée (`applyEntersReplacements`, mode `default` : les choix seulement, avec la suggestion). Chaque effet terminé est noté dans les variables de la résolution (rejouer la boucle ne le refait pas) ; une copie fait ensuite les choix « en arrivant » de son modèle (707.9 : avant, le choix par défaut) ; rien pour un permanent face cachée (708.2). `defaultChoice` et `copyCandidates` retirés : la réponse par défaut est la suggestion de la question ;
  - `chooseCopy` gagne `duration` (Cursed Mirror), `optional`, `except` (exceptions copiables, 707.9b : nom de Chameleon, nom et F/E de Superior Spider-Man), `counters` et `tapped` (s'il copie), `exile` (Superior Spider-Man : capacité réflexive, maintenant aussi hors d'une résolution) ; une carte qui revient d'un cimetière ne se copie pas elle-même ;
  - Sorcerous Spyglass et Petrified Hamlet : la règle implicite du moteur (un permanent qui a nommé une carte en arrivant interdit…) devient `chosenNameAbilities: "forbid"` (Skyseer's Chariot : `chosenNameTax` → `chosenNameAbilities: 2`), lue sur la définition effective (un Waxen Shapethief copie de Spyglass interdit aussi) ; Petrified Hamlet ne demande plus son nom deux fois (en jouant le terrain, puis par sa capacité) ;
  - cartes : Echoing Deeps, Cursed Mirror, Altered Ego, Sin, Unending Cataclysm (`chooseAmong` d'un nombre quelconque, des deux camps), Dawn-Blessed Pennant (un vrai type de créature, `subtypeChosen`), Indominus Rex, Alpha (marqueurs en arrivant, une carte par marqueur), Mox Diamond (sans terrain défaussé, il n'arrive jamais), Flesh Duplicate (marqueurs de temps en arrivant), Abuelo's Awakening (créature Esprit volante en arrivant), Arachne (libellés français des types de carte) ; `approximations.md` : 7 entrées levées (Echoing Deeps, Dawn-Blessed Pennant, Indominus Rex, Mox Diamond, Cursed Mirror, Sin, Altered Ego), 3 raccourcies (Arachne : la main n'est toujours pas montrée ; Flesh Duplicate ; Abuelo's Awakening : F/E 1/1 juste après), les deux entrées générales réécrites (Aura hors résolution ; effets « en arrivant » hors résolution : les choix seulement) ;
  - client : la fenêtre du terrain joué (`LandChoice`) nomme les cartes d'un cimetière, localise la question et propose « Aucune » ; protocole et vue inchangés ;
  - 20 tests : `rulings.test.ts` (Double Down et Visage Bandit, Phantasmal Image sur Adaptive Automaton, cape sans choix, permanent mis sous le contrôle d'un autre joueur, jeton copie sans question, émeute remise en jeu par Zombify, Waxen Shapethief copie de Spyglass), Echoing Deeps ×2, Abuelo's Awakening, Cursed Mirror ×2, Sin, Altered Ego, Flesh Duplicate, Indominus Rex, Mox Diamond, Arachne, offres de terrains (`offers.test.ts`), rejeu d'une partie (`ai/test/record.test.ts`) ; écart trouvé : une carte qui revient d'un cimetière se proposait comme modèle ;
  - parties dorées identiques ; fuzz strict `--offers 4` (300 parties, tout le pool) : `c36bb230` (`62904124` avant), 4 décisions illégales de l'IA aléatoire, les mêmes qu'avant (taxes d'attaque, menace) ; Commander à 4 joueurs, IA mixte (80 parties) : `1f783377`, 1 ; 3 joueurs « chaos » (100 parties) : `3a60020a`, 5 ; aucune erreur ;
  - dette : CardDef 98 → 91 ; Effect (champs) 632 → 639 (les exceptions de la copie passent de `CardDef` à `chooseCopy`, `devour.n`), variantes inchangées (`chooseRiot` → `asEnters`) ; singleCardKeys 63 → 62 (`options`) ;
  - écartés : un jeton copie créé par un effet et les arrivées hors résolution ne posent pas de question (choix suggérés, sans les autres effets) ; le regard de la main d'Arachne (aucune forme générique « regarder une main ») ; `shockLand` reste à part (déjà une question d'arrivée commune, `arrivalChoices`) ; les F/E 1/1 d'Abuelo's Awakening en arrivant (il faudrait des `LayerMods` dans `MoveSpec`).
- **Correctif hors plan (07/10/2026, règles 163) :** « choisissez un nom de carte » mettait en tête les cartes de la main du premier adversaire, quelle que soit la carte, et l'IA nommait la première : une information cachée (Skyseer's Chariot, The Clone Saga). Les noms proposés partent maintenant des permanents adverses, puis des vôtres ; pour Sorcerous Spyglass, la main regardée devient une approximation documentée (aucune forme « regarder une main » pour l'instant, comme Arachne). Test dans `dft.test.ts`. Reste à traiter : la liste « tous les noms » vient des définitions de la partie, donc des decks de tous les joueurs (voir le compte rendu).
- **H10 (07/10/2026, sans changement de règles) :** `ObjectFilter`, de vraies fusions (un seul évaluateur par champ) :
  - comparaisons dynamiques : 14 champs (`powerAboveSource`, `powerBelowSource`, `powerAboveOf`, `manaValueSourcePower`, `maxManaValueSourcePower`, `manaValueSourceCounters` et sa variante `atMost`, `maxManaValueManaSpent`, `maxManaValueColorsSpent`, `maxManaValueX`, `maxToughnessX`, `manaValueX`, `toughnessAbovePower`, `powerAboveBase`, `manaValueParity`) → `compare: FilterCompare[]` (`{ what: "power" | "toughness" | "manaValue", cmp: "<" | "<=" | "=" | ">=" | ">" | "odd" | "even", to?: Amount | "power" | "basePower" }` ; `cmp` plutôt que `op`, déjà le discriminant d'`Effect`, que `debt.test.ts` compte comme une opération) ; aides `cmp.power`, `cmp.toughness`, `cmp.manaValue`, `cmp.parity` (`dsl.ts`) ;
  - un seul résolveur, `resolveCompare` (`effects.ts`), remplace les deux (`withX` et `resolveFilter`) : pendant une résolution (`withX`), avec le contexte de ce qui se résout (le X de la capacité ou du sort, ses cibles) ; ailleurs (`resolveFilter`), du point de vue de la source seule, avec le X du permanent ; une comparaison au montant non résolu est ignorée par `matchesView`, comme les anciens champs ; les relations à l'objet lui-même (`"power"`, `"basePower"`) et la parité sont lues directement ; `parityChosen` (`withChosen`) produit une comparaison de parité ; Loki Laufeyson fige sa borne avec le même résolveur, sans descendre sous 0 (comme avant) ; seul écart possible, sans carte qui l'atteigne : `manaValueX` et `maxToughnessX` étaient ignorés hors d'une résolution, leur comparaison y lit maintenant le X du permanent (toutes leurs cartes passent par `withX` : `destroyAll`, `modifyAll`, `moveAll`) ;
  - montant `raw` (`what: "power" | "manaSpent"`, `of?`) : les valeurs de la source sans plancher (107.1b), d'après ses dernières informations connues (`amount.sourcePower`, `amount.sourceManaSpent`), et la force d'un objet désigné sur le champ de bataille (`amount.rawPowerOf`, aucune valeur sinon : rien ne correspond) ; `powerOf` et `spent` ne convenaient pas (plancher à 0, lecture de l'instantané de la capacité, pas de dernières informations pour le mana dépensé) ; les autres montants existaient : `amount.x`, `amount.lkiCounters`, `amount.colorsSpent` ;
  - attaches : `attachedToSource`, `notAttachedToSource`, `attachedToSelf`, `wasAttachedToSource`, `attachedToSourceHost` → `attached: "host" | "notHost" | "toSource" | "wasToSource" | "toHost"` (mêmes lieux de lecture : `matchesView` pour `toSource` et `wasToSource`, `matchesObjectFilter` pour les autres, les déclencheurs et `triggerMod` pour `host`) ; `notHost` n'est pas écrit `not: { attached: "host" }`, qui différerait hors du champ de bataille (`matchesCard`) ; équipage : `crewedBySource`, `crewedSource` → `crew: "bySource" | "source"` ;
  - restent : les bornes fixes (`minPower`, `maxManaValue`…), les champs « choisis » (`numberChosen`, `parityChosen`…, `withChosen`), `sharesCreatureTypeWith` et `nameOf` (pas des comparaisons de nombres), `equipped`, `enchanted`, `modified`, `damagedBySource` ;
  - 24 tests (`engine/test/filters.test.ts`, un par champ retiré, cas limites compris : force négative, dernières informations connues, X de la capacité ou du permanent, cible absente, borne de Loki) ; les mêmes attentes, écrites avec les anciens champs, passent sur le code d'avant ;
  - définitions des cartes comparées avant et après (toutes les cartes et jetons, une fois les anciens champs traduits) : identiques ; parties dorées identiques ; empreintes du fuzz identiques (graine 7 : `f6d9c346` sur tout le pool, 300 parties ; `3bacd5a6` en Commander, 200 parties ; `adfbe732` en Commander à 4 joueurs, 60 parties ; fuzz strict `--offers 4`, 200 parties : `b131cce1`, une décision illégale de l'IA aléatoire comme avant) ;
  - dette : ObjectFilter 89 → 71 ; singleCardKeys 62 → 54 ; `FilterCompare` suivi (3) ; Amount 34 → 35, Amount (champs) 77 → 80 (`raw`).
- **H11 (journal du tour) (07/10/2026, sans changement de règles) :** les champs « ce tour-ci » de `GameObject` deviennent des entrées du journal du tour avec l'identifiant de l'objet (`id`), de vraies fusions (un seul enregistrement, le journal) :
  - `loyaltyTurn` et `activatedTurn` → l'entrée `activate` existante, qui reçoit `id` et `index` (l'indice d'une capacité « une fois par tour », noté pour ces seules capacités, comme l'ancien champ) ; lus par `activatedThisTurn` dans `canPayNonManaCost` ;
  - `countersPutTurn`, `countersPutBy` (jamais lu) et `countersPutKinds` → l'entrée `counters` existante, avec `id` ; « la première fois ce tour-ci » et le filtre `countersPutByYouThisTurn` (`countersPutThisTurn`, aussi dans la vue des couches et les dernières informations connues) ; l'entrée est désormais notée avant l'événement de règles (comme les anciens champs), et `countersPutByYouThisTurn` est une dépendance `turnLog` du cache des couches (`scanDeps`) ;
  - `discardedTurn` → l'entrée `discard` existante, avec `id` (chaos, filtre `discardedThisTurn`) ; `tapTurn` et `tapsThisTurn` → une entrée `tap` (`first` de l'événement `tap`, Captain America) ; `saddledTurn` → une entrée `saddled` (condition `saddled`) ;
  - lectures par un index dérivé du journal (`turnlog.ts` : `objectTurnEvents`, `objectDidThisTurn`), mémorisé par tableau : le journal ne fait que grandir pendant un tour et il est remplacé au tour suivant ; un objet qui change de zone a un nouvel identifiant (400.7), il n'hérite donc pas des entrées de l'ancien, comme avec les champs ; `attackedThisTurn` passe par le même index ;
  - aucun champ gardé ; la vue des joueurs (`view.ts`) ne lisait aucun de ces champs : forme inchangée, `PROTOCOL_VERSION` inchangée ;
  - 2 tests (`engine/test/turnlog.test.ts` : loyauté une fois par tour et nouvel objet après un changement de zone ; marqueurs par joueur et par sorte, engagements, défausse) ; tests qui lisaient les champs réécrits (`dft`, `shared`, `msh`, `spm`) ;
  - parties dorées identiques ; empreintes du fuzz identiques (graine 7 : `f6d9c346` sur tout le pool, 300 parties ; `3bacd5a6` en Commander, 200 parties ; `adfbe732` en Commander à 4 joueurs, 60 parties ; fuzz strict `--offers 4`, 200 parties : `b131cce1`) ; bench dans le bruit (avant et après en alternance, `git stash`, minimum de plusieurs passes : `legalActions` 7 831 à 7 996 ms avant, 7 749 à 7 890 ms après ; IA heuristique, 14 parties, 1 586 à 1 606 ms avant, 1 549 à 1 595 ms après ; `npm run bench` dans le bruit de la machine) ;
  - dette : turnFields 7 → 0 (le garde-fou admet désormais une section vide) ; GameObject 58 → 49.
- **Correctif hors plan (07/10/2026, règles 164, protocole 4) :** nommer une carte, une carte de terrain ou un type de créature ne révèle plus les decks adverses (choix de l'utilisateur : le catalogue complet). Catalogue des noms hors de l'état (`engine/src/names.ts`, `registerNameCatalog`, enregistré par le serveur, le client et le worker) ; nouvelle question `{ type: "name", of, featured }` : noms publics en tête (permanents adverses, puis les vôtres, cimetières, exil face visible, zone de commandement), recherche dans tout le catalogue côté client (noms français, nom anglais envoyé) ; liste officielle des types de créature (205.3m, 324 types). Une réponse hors catalogue est refusée (`RulesError`) ; les anciennes réponses restent acceptées (rejeu des parties). Tests : `engine/test/names.test.ts`, audit dans `ai/test/hidden-info.test.ts`, `cards/test/names.test.ts`, `client/test/names.test.ts`.

## Bilan (07/10/2026)

- **Lots :** H0 à H11 faits le 07/10/2026 sur `dev`, règles 149 → 164. Les lots sans changement de règles (H1, H7a, H7b, H10, H11) ont gardé à l'identique les empreintes de fuzz et les parties dorées ; aucune partie dorée n'a été régénérée pendant tout le plan.
- **Dette :** clés propres à une carte 100 → 54, mesurées par la garde d'alors ; l'audit du 07/10/2026 a montré qu'elle ne voyait ni les clés écrites sans valeur par les constructeurs ni celles déclarées hors début de ligne : corrigée, elle en compte 114 (les 54, plus 60 qui existaient déjà avant le plan ; `docs/audits/2026-10-07-dette.md`) ; statiques de joueur 62 → 52 ; mots-clés non imprimés 15 → 12 ; ops 23 → 16 ; champs « ce tour-ci » 12 → 0 ; CardDef 98 → 91, GameObject 62 → 49, ObjectFilter 89 → 71, CastPermissionAbilityDef 21 → 10, Effect 154 → 149 variantes et 654 → 639 champs. Hausses justifiées dans `ceilingNotes` : PlayFromZone 17 → 21 (H7b), EventReplacement 18 → 19 (H8b), Amount 34 → 35 (H10), Ref 34 → 35 (H5), et dix structures désormais mesurées (H0).
- **Approximations :** par carte 267 → 217 (`règle` 202 → 157, `choix auto` 42 → 36, `timing` 23 → 25) ; générales 24 → 27, parce que H0, H5 et H9 ont écrit des approximations qui ne l'étaient pas.
- **Écarts avec le plan :** `GraveyardReplacement` → `then` écarté (deux évaluateurs resteraient) ; quatre statiques de combat gardées séparées (508.1 et 509.1) ; durée `while: { exiled }` d'Emrakul propre à une carte mais non comptée (nom `exiled` partagé dans un autre sens).
- **Hors plan, trouvés en route :** cibles lues sous un autre nom (Mutant Menace, règles 157, garde `target-refs.test.ts`) ; capacités d'équipement et d'épuisement non reconnues, protection de Serra's Emissary, libellés des marqueurs (règles 159, garde `ability-flags.test.ts`) ; marqueurs de poison sans `bump` (trouvé par les invariants) ; noms de cartes révélant la main puis les decks adverses (règles 163 et 164, catalogue complet, protocole 4) ; arènes Commander environ vingt fois plus rapides.
- **Reports :**
  - Nuka-Nuke Launcher : radiation sur chaque adversaire au lieu du seul joueur défenseur (il faudrait un emblème détenu par ce joueur) ;
  - faufilement : le défenseur gardé n'est pas revérifié (508.4a), comme l'était le ninjutsu avant H5 ;
  - Kíli : seule la part en mana d'un coût d'équipement est remplacée ;
  - « regarder une main » (Sorcerous Spyglass, Arachne) : aucune forme générique ;
  - Promise of Loyalty pourrait passer par `keep` ; Quilled Greatwurm par `removeCountersAmong` ;
  - arrivées hors d'une résolution (copies créées par un effet, retours d'exil lié) : choix « en arrivant » par défaut, sans question ;
  - décisions illégales de l'IA moyenne en Commander (refusées proprement, la partie continue) : à examiner ;
  - pistes de performance non faites (jetons créés par lot, sources des déclencheurs paresseuses, copie d'état moins chère, bornes de l'IA sur les très grands plateaux).

