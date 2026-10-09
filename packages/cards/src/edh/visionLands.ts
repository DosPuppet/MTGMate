/**
 * Commander: lands of the "Weight of the World" deck (The Vision). Urza's lands (Mine, Power Plant, Tower, Cave,
 * Workshop, Saga), colorless utility lands (Buried Ruin, Emergence Zone, Sanctum of Ugin, Scorched Ruins, Shrine of
 * the Forsaken Gods, War Room, Witch's Clinic), copies (Vesuva, The Mycosynth Gardens) and Planar Nexus.
 */
import type { CardScript, ObjectFilter, TokenSpec } from "@mtgx/engine";
import { LAND_TYPES } from "@mtgx/engine";
import { activated, amount, chapter, cond, fx, manaAbility, ref, staticAbility, target, triggered, when } from "./common";

const ARTIFACTS_YOU: ObjectFilter = { types: ["Artifact"], controller: "you" };
const HISTORIC: ObjectFilter = { anyOf: [{ types: ["Artifact"] }, { legendary: true }, { subtype: "Saga" }] };
/** Nonbasic land types (205.3i): every land type except the five basic ones. */
const NONBASIC_LAND_TYPES = [...LAND_TYPES].filter((t) => !["Plains", "Island", "Swamp", "Mountain", "Forest"].includes(t));

/** "{1}, {T}: Add one mana of any color." */
const anyColorForOne = activated({
  mana: "{1}",
  tap: true,
  effects: [fx.addManaChoice(1)],
  label: "One mana of any color",
});

/**
 * Tron lands: "{T}: Add {C}. If you control [the other two], add N instead"; a mana ability whose amount depends on
 * the condition, written as two abilities with exclusive conditions.
 */
const tron = (others: [string, string], amountIf: number): CardScript => {
  const both = cond.all(
    cond.controls({ types: ["Land"], subtype: others[0] }),
    cond.controls({ types: ["Land"], subtype: others[1] }),
  );
  return {
    abilities: [manaAbility("C", 1, { condition: cond.not(both) }), manaAbility("C", amountIf, { condition: both })],
  };
};

/** 0/0 colorless Construct: "This token gets +1/+1 for each artifact you control." (Urza's Saga). */
const CONSTRUCT: TokenSpec = {
  name: "Construct",
  colors: [],
  types: ["Artifact", "Creature"],
  subtypes: ["Construct"],
  power: 0,
  toughness: 0,
  abilities: [staticAbility("self", { power: 1, toughness: 1 }, { per: ARTIFACTS_YOU, label: "+1/+1 for each artifact" })],
  text: "This token gets +1/+1 for each artifact you control.",
};

export const EDH_VISION_LANDS: Record<string, CardScript> = {
  "Abstergo Entertainment": {
    abilities: [
      manaAbility("C"),
      anyColorForOne,
      activated({
        mana: "{3}",
        tap: true,
        exileSelf: true,
        targets: [target.optional(target.cardInGraveyard("t", HISTORIC, "you", "historic card in your graveyard"))],
        effects: [fx.toHand(ref.target()), fx.moveAll("graveyard", ref.eachPlayer, {}, { to: "exile" })],
        label: "A historic card returns to your hand, then exile all graveyards",
      }),
    ],
  },
  "Buried Ruin": {
    abilities: [
      manaAbility("C"),
      activated({
        mana: "{2}",
        tap: true,
        sacrifice: true,
        targets: [target.cardInGraveyard("t", { types: ["Artifact"] }, "you", "artifact card in your graveyard")],
        effects: [fx.toHand(ref.target())],
        label: "An artifact card in your graveyard returns to your hand",
      }),
    ],
  },
  // Indestructible: read from the text.
  "Darksteel Citadel": { abilities: [manaAbility("C")] },
  "Emergence Zone": {
    abilities: [
      manaAbility("C"),
      activated({
        mana: "{1}",
        tap: true,
        sacrifice: true,
        effects: [fx.thisTurn({ spellKeywords: { filter: {}, keywords: ["flash"] } })],
        label: "You may cast spells this turn as though they had flash",
      }),
    ],
  },
  "Planar Nexus": {
    abilities: [
      staticAbility("self", { addSubtypes: NONBASIC_LAND_TYPES }, { label: "Has each nonbasic land type" }),
      manaAbility("C"),
      anyColorForOne,
    ],
  },
  "Sanctum of Ugin": {
    abilities: [
      manaAbility("C"),
      triggered(
        when.castSpell("you", { colorCount: 0, minManaValue: 7 }),
        fx.may(
          "Sacrifice Sanctum of Ugin to search for a colorless creature card?",
          fx.sacrifice(ref.you, { self: true }, 1, { store: "sanctum" }),
          fx.when(cond.v("sanctum"), fx.search({ types: ["Creature"], colorCount: 0 }, { to: "hand" })),
        ),
        { label: "Colorless spell with mana value 7 or greater: sacrifice this land to search for a colorless creature" },
      ),
    ],
  },
  // "If this land would enter, sacrifice two untapped lands instead. If you do, put this land onto the battlefield.
  // Otherwise, put it into its owner's graveyard": as it enters (614.1c), like Mox Diamond; without two untapped lands,
  // nothing is sacrificed.
  "Scorched Ruins": {
    asEnters: [
      ...fx.when(
        cond.controls({ types: ["Land"], tapped: false }, 2),
        fx.sacrifice(ref.you, { types: ["Land"], tapped: false }, 2, { store: "ruins" }),
      ),
      ...fx.when(cond.not(cond.v("ruins", 2)), fx.moveTo(ref.self, { to: "graveyard" })),
    ],
    abilities: [manaAbility("C", 4)],
  },
  "Shrine of the Forsaken Gods": {
    abilities: [
      manaAbility("C"),
      manaAbility("C", 2, {
        restriction: { spell: { colorCount: 0 } },
        condition: cond.controls({ types: ["Land"] }, 7),
      }),
    ],
  },
  "The Grey Havens": {
    abilities: [
      triggered(when.entersSelf, [fx.scry(1)], { label: "Scry 1" }),
      manaAbility("C"),
      manaAbility(["W", "U", "B", "R", "G"], 1, {
        colorsOf: { types: ["Creature"], legendary: true },
        colorsZone: "graveyard",
      }),
    ],
  },
  "The Mycosynth Gardens": {
    abilities: [
      manaAbility("C"),
      anyColorForOne,
      activated({
        mana: "{X}",
        tap: true,
        // "Target nontoken artifact you control with mana value X": checked with the announced X, and again on resolution.
        targets: [
          {
            ...target.permanent("t", ["Artifact"], { controller: "you", token: false }, "nontoken artifact you control"),
            manaValueAmount: amount.x,
          },
        ],
        effects: [fx.becomeCopy(ref.self, ref.target(), "permanent", { ifManaValue: amount.x })],
        label: "Becomes a copy of a nontoken artifact you control with mana value X",
      }),
    ],
  },
  "Urza's Cave": {
    abilities: [
      manaAbility("C"),
      activated({
        mana: "{3}",
        tap: true,
        sacrifice: true,
        effects: [fx.search({ types: ["Land"] }, { to: "battlefield", tapped: true })],
        label: "Search for a land card, put onto the battlefield tapped",
      }),
    ],
  },
  "Urza's Mine": tron(["Power-Plant", "Tower"], 2),
  "Urza's Power Plant": tron(["Mine", "Tower"], 2),
  "Urza's Tower": tron(["Mine", "Power-Plant"], 3),
  // Saga (lore): a counter as it enters and after your draw step; sacrificed after chapter III.
  "Urza's Saga": {
    abilities: [
      chapter([1], [fx.modify(ref.self, { addAbilities: [manaAbility("C")] }, "permanent")], {
        label: 'Chapter I — gains "{T}: Add {C}."',
      }),
      chapter(
        [2],
        [
          fx.modify(
            ref.self,
            {
              addAbilities: [
                activated({
                  mana: "{2}",
                  tap: true,
                  effects: [fx.createTokens(CONSTRUCT)],
                  label: "A 0/0 Construct artifact creature token",
                }),
              ],
            },
            "permanent",
          ),
        ],
        { label: 'Chapter II — gains "{2}, {T}: a Construct token"' },
      ),
      // "An artifact card with mana cost {0} or {1}": a card without a mana cost (an artifact land) or with {X} has
      // neither.
      chapter(
        [3],
        [fx.search({ types: ["Artifact"], notTypes: ["Land"], maxManaValue: 1, hasX: false }, { to: "battlefield" })],
        { label: "Chapter III — search for an artifact with mana cost {0} or {1}" },
      ),
    ],
  },
  "Mishra's Workshop": {
    abilities: [manaAbility("C", 3, { restriction: { spell: { types: ["Artifact"] } } })],
  },
  "Urza's Workshop": {
    abilities: [
      manaAbility("C"),
      // Metalcraft: three or more artifacts.
      manaAbility("C", 1, {
        per: { types: ["Land"], subtype: "Urza's", controller: "you" },
        condition: cond.controls({ types: ["Artifact"] }, 3),
      }),
    ],
  },
  // "You may have this land enter tapped as a copy of any land on the battlefield."
  Vesuva: { asEnters: [fx.chooseCopy({ types: ["Land"] }, { anyController: true, tapped: true })] },
  "War Room": {
    abilities: [
      manaAbility("C"),
      activated({
        mana: "{3}",
        tap: true,
        payLife: amount.commanderColors,
        effects: [fx.draw(1)],
        label: "Life equal to the number of colors in your commanders' identity: draw a card",
      }),
    ],
  },
  "Witch's Clinic": {
    abilities: [
      manaAbility("C"),
      activated({
        mana: "{2}",
        tap: true,
        targets: [target.permanent("t", [], { commander: true }, "commander")],
        effects: [fx.pump(ref.target(), 0, 0, ["lifelink"])],
        label: "Target commander gains lifelink until end of turn",
      }),
    ],
  },
};
