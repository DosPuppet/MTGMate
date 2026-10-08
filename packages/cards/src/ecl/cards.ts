/**
 * Lorwyn Eclipsed: cards of the meta decks (phase 1 of plan P4, lot M1). The other cards of the set are in the files
 * by color.
 */
import {
  activated,
  amount,
  bothIfKicked,
  type CardScript,
  cond,
  entersWith,
  fx,
  manaAbility,
  mode,
  ref,
  spell,
  TREEFOLK_REACH,
  target,
  triggered,
  when,
} from "./common";

/** Shock lands: the "pay 2 life or it enters tapped" rule is read from the text. */
const shock: CardScript = {};

export const CARDS: Record<string, CardScript> = {
  // --- Lands -----------------------------------------------------------------
  "Steam Vents": shock,
  // --- Blue ------------------------------------------------------------------
  "Spell Snare": { spell: spell([target.spell("t", { manaValue: 2 }, "spell with mana value 2")], [fx.counter(ref.target())]) },
  Sunderflock: {
    // "This spell costs {X} less to cast, where X is the greatest mana value among Elementals you control."
    costReduction: { generic: amount.maxManaValue({ subtype: "Elemental", controller: "you" }) },
    abilities: [
      triggered(
        when.entersSelf,
        [fx.moveAll("battlefield", ref.eachPlayer, { types: ["Creature"], notSubtype: "Elemental" }, { to: "hand" })],
        { condition: cond.wasCast, label: "Return all non-Elemental creatures" },
      ),
    ],
  },
  // --- Red -------------------------------------------------------------------
  Sear: { spell: spell([target.creatureOrPlaneswalker()], [fx.damage(4, ref.target())]) },
  // --- Green -----------------------------------------------------------------
  "Sapling Nursery": {
    // Affinity for Forests.
    costReduction: { generic: amount.count({ subtype: "Forest", controller: "you" }) },
    abilities: [
      triggered(when.landfall, [fx.createTokens(TREEFOLK_REACH)], { label: "3/4 Treefolk token with reach" }),
      activated({
        mana: "{1}{G}",
        exileSelf: true,
        effects: [
          fx.modifyAll(
            { anyOf: [{ subtype: "Treefolk" }, { subtype: "Forest" }], controller: "you" },
            { addKeywords: ["indestructible"] },
          ),
        ],
        label: "Treefolk and Forests gain indestructible",
      }),
    ],
  },

  // --- Lot M2 -----------------------------------------------------------------
  "Blood Crypt": shock,
  "Overgrown Tomb": shock,
  "Requiting Hex": {
    // Optional additional cost blight 1: read from the text ("blight" kicker).
    spell: spell(
      [target.creature("t", { maxManaValue: 2 })],
      [fx.destroy(ref.target()), ...fx.when(cond.kicked, fx.gainLife(2))],
    ),
  },

  // --- Lot M3 -----------------------------------------------------------------
  "Hallowed Fountain": shock,
  "Temple Garden": shock,
  Deceit: {
    // Evoke read from the text; "if {U}{U} / {B}{B} was spent to cast it": `cond.spent`.
    abilities: [
      triggered(when.entersSelf, [fx.bounce(ref.target())], {
        condition: cond.spent("U", 2),
        targets: [target.upTo(1, target.nonland("t", { other: true }))],
        label: "{U}{U} spent: return a nonland permanent",
      }),
      triggered(when.entersSelf, [fx.discard(1, ref.target(), { filter: { notTypes: ["Land"] }, chooser: "controller" })], {
        condition: cond.spent("B", 2),
        targets: [target.player("t", "opponent")],
        label: "{B}{B} spent: discard a chosen nonland card",
      }),
    ],
  },

  // --- Lot M4 -----------------------------------------------------------------
  "Firdoch Core": {
    abilities: [
      manaAbility(["W", "U", "B", "R", "G"]),
      activated({
        mana: "{4}",
        effects: [fx.modify(ref.self, { addTypes: ["Artifact", "Creature"], setPower: 4, setToughness: 4 })],
        label: "Becomes a 4/4 artifact creature",
      }),
    ],
  },

  // --- Lot M5 -----------------------------------------------------------------
  "Pyrrhic Strike": {
    // Blight 2 (optional additional cost): read from the text; when paid, both modes are chosen.
    spell: bothIfKicked(
      mode(
        "Destroy an artifact or enchantment",
        [target.permanent("a", ["Artifact", "Enchantment"])],
        [fx.destroy(ref.target("a"))],
      ),
      mode("Destroy a creature with MV 3 or greater", [target.creature("c", { minManaValue: 3 })], [fx.destroy(ref.target("c"))]),
      "Both (blight 2 paid)",
    ),
  },
  Emptiness: {
    // Evoke read from the text.
    abilities: [
      triggered(when.entersSelf, [fx.toBattlefield(ref.target())], {
        condition: cond.spent("W", 2),
        targets: [
          target.cardInGraveyard("t", { types: ["Creature"], maxManaValue: 3 }, "you", "creature card with MV 3 or less"),
        ],
        label: "{W}{W} spent: return a creature from your graveyard",
      }),
      triggered(when.entersSelf, [fx.counters(ref.target(), "-1/-1", 3)], {
        condition: cond.spent("B", 2),
        targets: [target.upTo(1, target.creature())],
        label: "{B}{B} spent: three -1/-1 counters",
      }),
    ],
  },
  "Iron-Shield Elf": {
    abilities: [
      activated({
        discard: 1,
        effects: [fx.modify(ref.self, { addKeywords: ["indestructible"] }), fx.tap(ref.self)],
        label: "Indestructible, tap it",
      }),
    ],
  },
  Moonshadow: {
    abilities: [
      entersWith({ counters: 6, counterKind: "-1/-1", label: "Enters with six -1/-1 counters" }),
      triggered(
        when.zoneChange(["battlefield", "hand", "library", "exile", "stack"], {
          to: ["graveyard"],
          whose: "you",
          // "permanent cards": not tokens.
          filter: { permanent: true, token: false },
        }),
        [fx.removeCounters(ref.self, 1, "-1/-1")],
        { condition: cond.counterAtLeast("-1/-1", 1), batched: true, label: "Remove a -1/-1 counter" },
      ),
    ],
  },

  // --- Lot M6 -----------------------------------------------------------------
  "Springleaf Drum": { abilities: [{ ...manaAbility(["W", "U", "B", "R", "G"]), tapAnother: "creature" }] },
};
