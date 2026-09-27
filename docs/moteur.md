# Le moteur : carte des fichiers et recettes d'extension

Moteur pur et déterministe (`packages/engine/src`). L'état est sérialisable ; les effets sont des données (DSL), jamais des fonctions.

## Fichiers

| Fichier | Rôle |
|---|---|
| `types.ts` | Tous les types : `GameState`, `GameObject`, `CardDef`, `Effect` (union `op`), `TriggerSpec` (union `on`), `Condition`, `Amount`, `Ref`, `ObjectFilter`, `TargetSpec`, statiques de joueur, `Keyword`… |
| `dsl.ts` | Constructeurs pour les scripts de cartes : `fx.*`, `when.*`, `cond.*`, `amount.*`, `ref.*`, `target.*`, `activated`, `triggered`, `staticAbility`, `playerStatic`, `manaAbility`, `chapter`, `spree`, `tiered`… Plus `CardScript` (champs du script d'une carte). |
| `effects.ts` | `runEffect` : aiguillage vers la table `op → traitement` ; `evalAmount` (`switch (a.kind)`) ; `resolveRef` ; `evalCondition` ; aides partagées (`store`, `damageSource`, `moveWithSpec`, `grantPlay`, `addEffect`…). |
| `ops/*.ts` | Les traitements des effets, par domaine : `damage`, `players`, `counters`, `zones`, `spells` (pile, permissions de lancer), `permanents` (modifications, contrôle, copies, jetons), `mana`, `flow` (si, peut, réflexif, retardé). Chaque fichier exporte `HANDLERS: OpHandlers`. |
| `triggers.ts` | Détection des déclencheurs (`switch (t.on)` sur les `RulesEvent`), doublements de déclenchements, `checkCondition` (`switch (c.kind)`), capacités retardées. |
| `stack.ts` | Lancer (`castTerms`, `castableFaces`, `castSpell`), coûts, activer (`activateAbility`, `canPayNonManaCost`), résoudre, contrecarrer, jouer un terrain. |
| `legal.ts` | `legalActions` : options proposées aux joueurs et à l'IA (doit refléter `stack.ts`). |
| `layers.ts` | Couches 613 (`chars`, cache par `s.version` → `bump(s)`), `copiedDefId` (face active, copie), `snapshot`/`view` (vue d'un objet pour les filtres). |
| `targets.ts` | `matchesView` (filtres d'objets), légalité et validation des cibles. |
| `actions.ts` | Blessures (`dealDamage` : préventions, doublements, redirection), pioche, PV, jetons, sacrifice. |
| `state.ts` | Objets, zones (`moveObject` et remplacements de destination), marqueurs, `RulesEvent`, `setController`. |
| `replacement.ts` | Remplacements d'arrivée (`applyEntersReplacements`) et de destination (`replaceDestination`). |
| `turn.ts` | Étapes, actions basées sur l'état (Sagas, Auras…), combat, élimination, tours et étapes supplémentaires. |
| `mana.ts` | Capacités de mana, solveur de paiement, mana restreint. |
| `statics.ts` | Index des capacités par contrôleur (`controlledAbilitiesWithSource`, `playerStatic`, `doublers`). |
| `view.ts` | Projection de l'état pour un joueur (information cachée). |

## Recettes

- **Nouvel effet :** ajouter la variante `{ op: "…" }` à `Effect` (`types.ts`), son traitement `op(s, r, e, ctx, key) { … }` dans le `HANDLERS` du bon fichier `ops/<domaine>.ts` (`e` y est typé selon `op` ; `r` et `key` servent aux choix et aux variables mémorisées), puis son constructeur `fx.…` (`dsl.ts`). Si l'effet change des caractéristiques, appeler `bump(s)`.
- **Nouveau déclencheur :** une variante de `TriggerSpec`, un `case` dans `triggers.ts` (renvoyer `{ objectId, player, amount }` pour `ref.eventObject`, `ref.eventPlayer` et `amount.eventAmount`), puis `when.…`. Si l'événement n'existe pas, ajouter un `RulesEvent` (`state.ts`) et l'émettre avec `rulesEvent(s, …)`.
- **Nouvelle condition ou nouveau montant :** `Condition` + `checkCondition` + `cond.…` ; `Amount` + `evalAmount` + `amount.…`.
- **Filtre d'objet :** un champ de `ObjectFilter`, calculé dans `view()` (`layers.ts`) si besoin, et testé dans `matchesView` (`targets.ts`).
- **Statique de joueur :** un champ de `PlayerStaticAbilityDef`, lu avec `playerStatic(s, p, "clé")` ou `controlledAbilitiesWithSource` là où la règle s'applique.
- **Restriction, mot-clé technique :** ajouter à `Keyword` et `RESTRICTIONS` (`types.ts`), avec son libellé dans `client/src/i18n.ts` (sinon `tsc` échoue).
- **Champ de script de carte :** dans `CardScript` (`dsl.ts`), `CardDef` (`types.ts`) et la recopie dans `toCardDef` (`cards/src/scryfall.ts`).
- **Nouveau champ de `GameState` :** l'initialiser dans `game.ts` et, si besoin, dans `engine/test/helpers.ts`. Les champs de tour se remettent à zéro au changement de tour (`turn.ts`).

## Règles de conception

- Une décision illégale lève une `RulesError` (l'IA et le fuzz en dépendent).
- Tout ce dont une statique ou une F/E variable dépend fait avancer la version d'état (`bump`). Le fuzz détecte les oublis (« cache des caractéristiques périmé »).
- Préférer un mécanisme générique et nommé à un drapeau « pour une carte » :
  - réutiliser les doublements (`doubler`, multiplicateurs de déclenchements dans `triggers.ts`) ;
  - réutiliser les permissions de lancer (`grantPlay`, `castTerms`) et les modifications à l'arrivée (`StackItem.arrival`).
- Une capacité d'un permanent inflige ses blessures avec ce permanent pour source (`damageSource`).
- Les scripts de cartes vont dans `packages/cards/src/<ext>/`. Les textes des cartes manquantes s'obtiennent avec `npm run coverage -- --set <ext> --text`.
