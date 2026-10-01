# Le moteur : carte des fichiers et recettes d'extension

Moteur pur et déterministe (`packages/engine/src`). L'état est sérialisable ; les effets sont des données (DSL), jamais des fonctions.

## Fichiers

| Fichier | Rôle |
|---|---|
| `types.ts` | Types de base (`Color`, `ManaCost`, `CardType`, `Keyword`, `RESTRICTIONS`) ; réexporte `model/*`. On importe toujours depuis `types.ts`. |
| `model/cards.ts` | `CardDef`, capacités (activées, déclenchées, statiques, de mana, de joueur, remplacements, doublements), coûts, `LayerMods`, `TokenSpec`, `MoveSpec`. |
| `model/rules.ts` | `ObjectFilter`, `TargetSpec`/`TargetFilter`, `TriggerSpec` (union `on`), `Condition`, `Ref`, `Amount`. |
| `model/effects.ts` | `Effect` (union `op`). |
| `model/state.ts` | `GameState`, `GameObject`, `PlayerState`, `StackItem`, combat, déclencheurs en attente, `LkiSnapshot`. |
| `model/decisions.ts` | Décisions, choix, options d'action, `GameEvent`. |
| `dsl.ts` | Constructeurs pour les scripts de cartes : `fx.*`, `when.*`, `cond.*`, `amount.*`, `ref.*`, `target.*`, `activated`, `triggered`, `staticAbility`, `playerStatic`, `manaAbility`, `chapter`, `spree`, `tiered`… Plus `CardScript` (champs du script d'une carte). |
| `effects.ts` | `runEffect` : aiguillage vers la table `op → traitement` ; `evalAmount` (`switch (a.kind)`) ; `resolveRef` ; `evalCondition` ; aides partagées (`store`, `damageSource`, `moveWithSpec`, `grantPlay`, `addEffect`…). |
| `ops/*.ts` | Les traitements des effets, par domaine : `damage`, `players`, `counters`, `zones`, `spells` (pile, permissions de lancer), `permanents` (modifications, contrôle, copies, jetons), `mana`, `flow` (si, peut, réflexif, retardé). Chaque fichier exporte `HANDLERS: OpHandlers`. |
| `triggers.ts` | Détection des déclencheurs (`switch (t.on)` sur les `RulesEvent`), doublements de déclenchements, `checkCondition` (`switch (c.kind)`), capacités retardées. |
| `stack.ts` | Lancer (`castTerms`, `castableFaces`, `castSpell`), coûts, activer (`activateAbility`, `canPayNonManaCost`), résoudre, contrecarrer, jouer un terrain. |
| `control.ts` | Couche 2 : contrôleur de base (`baseController`), effets de contrôle horodatés (`addControlEffect`), Auras qui donnent le contrôle ; `syncControl` recalcule le contrôleur de chaque permanent (actions basées sur l'état, nettoyage, 800.4a). |
| `stackChoices.ts` | Copies de sorts et de capacités (`copyStackItem` : une copie de sort est un objet sur la pile) ; choix d'un élément déjà sur la pile, posés avant la priorité (`announceNext`) : nouvelles cibles d'une copie (707.10c), répartition (601.2d, gardée dans `StackItem.division`). |
| `legal.ts` | `legalActions` : options proposées aux joueurs et à l'IA (doit refléter `stack.ts`). |
| `layers.ts` | Couches 613 (`chars`, cache par `s.version` → `bump(s)`), dépendances 613.8 par point fixe (`collectStatics`, `applyLayers`), `copiedDefId` (face active, copie) et `copiableExceptions` (707.9b), `snapshot`/`view` (vue d'un objet pour les filtres). |
| `targets.ts` | `matchesView` (filtres d'objets), légalité et validation des cibles. |
| `actions.ts` | Blessures (`dealDamage` : préventions, doublements, redirection), pioche, PV, jetons, sacrifice. |
| `state.ts` | Objets, zones (`moveObject` et remplacements de destination), marqueurs, `RulesEvent`, `setController`. |
| `modifiers.ts` | Remplacements qui modifient un nombre (« autant plus N », « le double », « au moins N ») : ordre choisi pour le joueur affecté (616.1, `chooseReplacementOrder`). |
| `replacement.ts` | Remplacements d'arrivée (`applyEntersReplacements`) et de destination (`replaceDestination`). |
| `turn.ts` | Étapes, actions basées sur l'état (Sagas, Auras…), combat, élimination, tours et étapes supplémentaires. |
| `mana.ts` | Capacités de mana, solveur de paiement, mana restreint. |
| `statics.ts` | Index des capacités par contrôleur (`controlledAbilitiesWithSource`, `playerStatic`) ; remplacements d'événements chiffrés en vigueur (`eventReplacements`, `quantityMods`, `recipientMatches`). |
| `view.ts` | Projection de l'état pour un joueur (information cachée). |
| `scenario.ts` | `createScenario` : partie mise en scène (bibliothèques dans l'ordre, mains, permanents, tour de départ, mulligan facultatif) pour le tutoriel ; l'état vide vient de `blankState` (`game.ts`). |
| `host.ts` | `GameHost` : IA, automatisme et humains ; l'option `gate` met l'IA en pause (explications du tutoriel). |
| `decisionShape.ts` | Forme d'une décision reçue (types des champs, objets inconnus, doublons), vérifiée par `apply` (`game.ts`) avant les règles. |
| `errors.ts` | `RulesError` et `rethrowAsRules`. |
| `turnlog.ts` | Journal des événements du tour (`s.turnLog` : déplacements publics, sorts lancés, sacrifices, blessures) et requêtes (`countTurnEvents`). |

## Recettes

- **Nouvel effet :** ajouter la variante `{ op: "…" }` à `Effect` (`model/effects.ts`), son traitement `op(s, r, e, ctx, key) { … }` dans le `HANDLERS` du bon fichier `ops/<domaine>.ts` (`e` y est typé selon `op` ; `r` et `key` servent aux choix et aux variables mémorisées), puis son constructeur `fx.…` (`dsl.ts`). Si l'effet change des caractéristiques, appeler `bump(s)`.
- **Nouveau déclencheur :** une variante de `TriggerSpec` (`model/rules.ts`), un `case` dans `triggers.ts` (renvoyer `{ objectId, player, amount }` pour `ref.eventObject`, `ref.eventPlayer` et `amount.eventAmount`), puis `when.…`. Si l'événement n'existe pas, ajouter un `RulesEvent` (`state.ts`) et l'émettre avec `rulesEvent(s, …)`.
- **« … ce tour-ci » (compter ce qui s'est passé pendant le tour) :** pas de nouveau compteur dans `TurnStats` ; utiliser le journal du tour, `amount.turnEvents({ event, who, types, from, to, … })` (`turnlog.ts`), avec `cond.amountAtLeast`. S'il manque un événement ou un champ, l'ajouter à `TurnLogEntry` (`model/state.ts`) et à son enregistrement.
- **Nouvelle condition ou nouveau montant :** `Condition` + `checkCondition` + `cond.…` ; `Amount` + `evalAmount` + `amount.…`.
- **Filtre d'objet :** un champ de `ObjectFilter`, calculé dans `view()` (`layers.ts`) si besoin, et testé dans `matchesView` (`targets.ts`).
- **Statique de joueur :** un champ de `PlayerStaticAbilityDef` (seulement si aucune forme générique ne convient : règle en fin de CLAUDE.md), lu avec `playerStatic`, `playerStaticTotal` ou `playerStatics(s, p, "clé")` (`statics.ts`), qui vérifient la condition et comptent les effets sur les joueurs. Jamais en filtrant `controlledAbilitiesWithSource` sur `kind === "playerStatic"`.
- **Restriction, mot-clé technique :** ajouter à `Keyword` et `RESTRICTIONS` (`types.ts`), avec son libellé dans `client/src/i18n.ts` (sinon `tsc` échoue).
- **Champ de script de carte :** dans `CardScript` (`dsl.ts`), `CardDef` (`types.ts`) et la recopie dans `toCardDef` (`cards/src/scryfall.ts`).
- **Capacité de mana à coût (« {1}, {T} : ajoutez un mana de n'importe quelle couleur ») :** une capacité `activated` ordinaire suffit ; `isManaAbility` (605.1a) la résout sans la pile.
- **Remplacement qui modifie un nombre** (blessures, marqueurs, PV, pioche) : l'ajouter comme `AmountMod` (`add`, `times`, `atLeast`) dans la liste de l'événement (`dealDamage`, `changeCounters`, `gainLife`, `drawCards`), jamais en modifiant la quantité directement ; l'ordre est choisi par `chooseReplacementOrder`. Une pioche passe par `drawCards` (sauf la main de départ).
- **Blessures et perte de PV : remplacements et préventions** (R1, familles E et F) : une capacité `eventReplacement({ event: "damage" | "lifeLoss", source, to, toFilter, combat, modify: { add, times, atLeastSourcePower, prevent }, onPrevent, condition })`, ou un effet `fx.thisTurn({ replacement })` ; bouclier « la prochaine fois que » : `fx.shield(remplacement, choixDeLaSource)`. Collecteur : `eventReplacements` (`statics.ts`) ; application : `dealDamage` et `loseLife` (`actions.ts`), préventions d'un autre joueur que le blessé avant les modifications, les siennes après (616.1).
- **« Si [un objet] devait être mis dans un cimetière, exilez-le à la place » :** une capacité `graveyardReplacement({ filter, fromBattlefield, graveyardOf, notControlledByYou, link, gainLife, condition })`, et non un drapeau de `playerStatic`. L'ordre de 616.1 est appliqué par `replaceGraveyard` (`replacement.ts`), appelé par `moveObject`.
- **« Vous pouvez lancer [cette carte] » pendant une résolution (608.2g) :** `fx.castNow(ref, { free, many, exileAfter, anyMana, storeCast, storeRest })`, et non `fx.grantPlay` (qui laisse la carte lançable plus tard dans le tour). Depuis un traitement d'effet, la boucle `castNowLoop` (`ops/spells.ts`) renvoie `{ castNow: … }`, qui suspend la résolution sur une priorité restreinte (`PendingDecision.castNow`).
- **Effet sur un joueur jusqu'à la fin du tour** (« les blessures ne peuvent pas être prévenues ce tour-ci ») : `fx.thisTurn({ clé: valeur })`, avec une clé de `PlayerStaticAbilityDef` déjà lue par le moteur ; pas de nouvel effet.
- **Coûts lus dans le texte :** Harmonie (`CardDef.harmonize`, coût dans `flashback`, créature engagée par `CastChoices.tap`) et Marchandage (kicker {0} avec `kickerCost.sacrifice`, permanent choisi par `CastChoices.sacrifice`) sont déduits dans `scryfall.ts` ; une carte qui les a n'a rien à écrire.
- **Contempler, maîtrise de la terre :** `cond.behold(filtre)` ; `fx.earthbend(ref, n)`.
- **Tarkir: Dragonstorm :** endurance `fx.endure(ref, n)` ; rafale `when.castNthSpell(2)` ; mode choisi en arrivant (Sièges) `chooseOnEnter: "mode"`, `enterModes` et `cond.chosenMode` ; suspension `fx.suspend(ref, n)` ; cave accordée `playerStatic({ delveSpells })` ; décomposition (mot-clé et marqueur `decayed`).
- **Nouveau champ de `GameState` :** l'initialiser dans `game.ts` et, si besoin, dans `engine/test/helpers.ts`. Les champs de tour se remettent à zéro au changement de tour (`turn.ts`).

## Règles de conception

- **Erreurs :**
  - une décision illégale ou mal formée lève une `RulesError` (l'IA, le serveur et le fuzz en dépendent) ;
  - toute autre `Error` est un bug du moteur ;
  - on ne convertit jamais une erreur quelconque en `RulesError`. Autour d'une étape qui peut être illégale (paiement, cibles), on passe par `rethrowAsRules(e, message)`, qui laisse remonter les autres erreurs ;
  - l'IA n'avale que les `RulesError` dans ses simulations ;
  - le fuzz « chaos » (`npm run fuzz -- --ai chaos`) soumet des variantes corrompues de chaque décision : elles doivent être refusées par une `RulesError`, sans modifier l'état reçu.
- **Invariants du fuzz** (`checkInvariants`, `ai/src/selfplay.ts`) :
  - zones, conservation des cartes, cache des couches ;
  - nombres finis ;
  - références (attachements, combattants) ;
  - aucune décision demandée à un joueur éliminé ;
  - état en JSON pur.
  
  Un nouveau champ d'état doit les respecter.
- Tout ce dont une statique ou une F/E variable dépend fait avancer la version d'état (`bump`). Le fuzz détecte les oublis (« cache des caractéristiques périmé »).
- Pas de nouveau drapeau, mot-clé ou opération propre à une carte sans justification : règle en fin de CLAUDE.md, vérifiée par `cards/test/debt.test.ts` (référence `cards/data/debt-baseline.json`).
- Préférer un mécanisme générique et nommé à un drapeau « pour une carte » :
  - réutiliser les remplacements d'événements chiffrés (`eventReplacement` : blessures, perte et gain de PV, pioche, meule, marqueurs, jetons, mana, dégagement ; R1) et les multiplicateurs de déclenchements (`triggers.ts`) ;
  - réutiliser les permissions de lancer (`grantPlay`, `castTerms`) et les modifications à l'arrivée (`StackItem.arrival`).
- Une capacité d'un permanent inflige ses blessures avec ce permanent pour source (`damageSource`).
- Les scripts de cartes vont dans `packages/cards/src/<ext>/`. Les textes des cartes manquantes s'obtiennent avec `npm run coverage -- --set <ext> --text`.
