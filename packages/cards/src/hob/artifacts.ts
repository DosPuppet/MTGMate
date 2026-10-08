/** The Hobbit — colorless cards and lands (lot A). */
import type { ManaType } from "@mtgx/engine";
import {
  activated,
  amount,
  BASIC_LAND,
  type CardScript,
  cond,
  cost,
  costReducer,
  entersWith,
  equipAbility,
  fx,
  INSTANT_SORCERY,
  manaAbility,
  ref,
  spell,
  staticAbility,
  TREASURE,
  target,
  targetObj,
  triggered,
  wardAbility,
  when,
} from "./common";

/**
 * Two-color lands of the cycle "enters tapped; {T}: Add {X} or {Y}; {2}{X}{Y}, {T}, Sacrifice this land: Put two +1/+1
 * counters on target [creature of the type] you control. Activate only as a sorcery."
 */
const tribalLand = (a: ManaType, b: ManaType, subtypes: string[], targetLabel: string, label: string): CardScript => ({
  abilities: [
    entersWith({ tapped: true }),
    manaAbility([a, b]),
    activated({
      mana: `{2}{${a}}{${b}}`,
      tap: true,
      sacrifice: true,
      sorcerySpeed: true,
      targets: [
        target.permanent(
          "t",
          ["Creature"],
          { controller: "you", ...(subtypes.length > 1 ? { anySubtype: subtypes } : { subtype: subtypes[0] }) },
          targetLabel,
        ),
      ],
      effects: [fx.addCounters(ref.target(), 2)],
      label,
    }),
  ],
});

export const ARTIFACTS: Record<string, CardScript> = {
  // --- Colorless creatures --------------------------------------------------------
  "Long-Bodied Grey Dog": {
    // Flash and reach: read from the text.
    abilities: [triggered(when.entersSelf, [fx.createTappedTokens(TREASURE)], { label: "A tapped Treasure" })],
  },
  "Old Thrush": {
    // Flying: read from the text. The search is optional ("up to one"); the card is put on top after the shuffle.
    abilities: [
      triggered(when.entersSelf, [fx.gainLife(2), fx.search(BASIC_LAND, { to: "libraryTop" })], {
        label: "2 life; a basic land on top of your library",
      }),
    ],
  },
  "Troop of Ponies": {
    abilities: [
      activated({
        mana: "{2}",
        tap: true,
        sacrifice: true,
        effects: [
          // The lands found go through the hand; one of them then goes onto the battlefield tapped.
          fx.search(BASIC_LAND, { to: "hand" }, 2, undefined, "lands"),
          fx.pickFromZone(
            "hand",
            BASIC_LAND,
            { to: "battlefield", tapped: true },
            { pool: ref.stored("lands"), prompt: "The land to put onto the battlefield tapped" },
          ),
        ],
        label: "Two basic lands: one onto the battlefield tapped, the other to hand",
      }),
    ],
  },

  // --- Artifacts --------------------------------------------------------------------
  "The Arkenstone": {
    abilities: [
      staticAbility({ types: ["Creature"], controller: "you" }, { power: 1, toughness: 1 }, { label: "Your creatures: +1/+1" }),
      triggered(when.yourEndStep, [fx.draw(1)], { label: "Draw a card" }),
    ],
  },
  "Seek the Heart": {
    spell: spell([], [fx.search({ types: ["Creature"], legendary: true })]),
  },
  "The Black Arrow": {
    // Flash and Equip {1}: read from the text. "Dealt damage this way": the target was dealt damage by the Arrow.
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.damage(1, ref.target()),
          ...fx.when(cond.targetMatches("t", { subtype: "Dragon", damagedBySource: true }), fx.destroy(ref.target())),
        ],
        { targets: [target.any()], label: "1 damage; a Dragon dealt damage this way is destroyed" },
      ),
      staticAbility("attached", { power: 1, toughness: 1, addKeywords: ["reach"] }, { label: "+1/+1 and reach" }),
    ],
  },
  "Dwarven Mattock": {
    // Equip {3}: read from the text.
    abilities: [
      triggered(when.entersSelf, [fx.attach(ref.target())], {
        targets: [target.permanent("t", ["Creature"], { subtype: "Dwarf", controller: "you" }, "Dwarf you control")],
        label: "Attach it to a Dwarf",
      }),
      staticAbility(
        "attached",
        { power: 2, toughness: 2, addAbilities: [wardAbility({ mana: cost("{1}") })] },
        { label: "+2/+2 and ward {1}" },
      ),
    ],
  },
  "Giant's Boulder": {
    abilities: [
      triggered(when.entersSelf, [fx.scry(2)], { label: "Scry 2" }),
      activated({ mana: "{1}", tap: true, effects: [fx.addManaChoice(1)], label: "One mana of any color" }),
      activated({
        mana: "{7}",
        tap: true,
        sacrifice: true,
        targets: [targetObj("t", { permanent: true }, "permanent")],
        effects: [fx.destroy(ref.target())],
        label: "Destroy a permanent",
      }),
    ],
  },
  "Glamdring, Foe-hammer": {
    // Equip {2}: read from the text. A negative power doesn't make spells cost more.
    abilities: [
      costReducer(INSTANT_SORCERY, 0, "Instants and sorceries: {X} less (power of the equipped creature)", {
        genericAmount: amount.max(0, amount.powerOf(ref.attached)),
      }),
    ],
  },
  "Gleam of Death": {
    spell: spell([], [fx.mill(6, ref.you, { name: "m" }), fx.toHand(ref.filtered(ref.stored("m"), INSTANT_SORCERY))]),
  },
  "My Precious": {
    abilities: [
      staticAbility("attached", { addKeywords: ["hexproof", "unblockable"] }, { label: "Hexproof, can't be blocked" }),
      // "Equip—{2}, Pay 2 life": not read from the text (compound cost).
      equipAbility({ mana: "{2}", payLife: 2, label: "Equip {2}, 2 life" }),
    ],
  },
  "Allure of Power": {
    additionalCost: { sacrifice: { filter: { types: ["Creature"] }, count: 1 } },
    spell: spell([], [fx.draw(2)]),
  },
  "Orcrist, Goblin-cleaver": {
    // Equip {3}: read from the text. The chosen type is kept on Orcrist, and chosen again each time.
    abilities: [
      staticAbility("attached", { power: 2, toughness: 2, addKeywords: ["trample"] }, { label: "+2/+2 and trample" }),
      triggered(
        when.attachedDealsCombatDamageToPlayer,
        [
          fx.chooseForSelf("creatureType"),
          fx.createTokens(TREASURE, amount.count({ types: ["Creature"], controller: "you", subtypeChosen: true })),
        ],
        { label: "Choose a type: a Treasure for each creature of that type you control" },
      ),
    ],
  },
  "Sting, Bilbo's Sword": {
    // Flash and Equip {3}: read from the text. Hone counters: general engine rule (+1/+0 to the equipped creature for
    // each counter on the Equipment).
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.counters(ref.self, "hone", amount.refCount(ref.permanentsOf(ref.target("o"), { types: ["Creature"] }))),
          fx.attach(ref.target("c")),
        ],
        {
          targets: [target.player("o", "opponent"), target.upTo(1, target.creature("c", { controller: "you" }))],
          label: "A hone counter for each opponent's creature; attach Sting",
        },
      ),
    ],
  },
  "Thrór's Map": {
    abilities: [
      triggered(when.entersSelf, [fx.search(BASIC_LAND)], { label: "A basic land to hand" }),
      activated({ mana: "{2}", tap: true, effects: fx.loot(1), label: "Draw a card, then discard a card" }),
    ],
  },
  "Well-Worn Spatula": {
    // Equip {1}: read from the text.
    abilities: [
      triggered(when.entersSelf, [fx.gainLife(2)], { label: "You gain 2 life" }),
      staticAbility("attached", { power: 1, toughness: 1 }, { label: "+1/+1" }),
    ],
  },

  // --- Lands ------------------------------------------------------------------------
  "Elvenking's Halls": tribalLand("G", "U", ["Elf"], "Elf you control", "Two +1/+1 counters on an Elf"),
  "Goblin-town": tribalLand("B", "R", ["Goblin", "Orc"], "Goblin or Orc you control", "Two +1/+1 counters on a Goblin or Orc"),
  "Iron Hills": tribalLand("R", "W", ["Dwarf"], "Dwarf you control", "Two +1/+1 counters on a Dwarf"),
  "Lake-town": tribalLand("W", "U", ["Human"], "Human you control", "Two +1/+1 counters on a Human"),
  Mirkwood: tribalLand(
    "B",
    "G",
    ["Bear", "Spider", "Wolf"],
    "Bear, Spider or Wolf you control",
    "Two +1/+1 counters on a Bear, Spider or Wolf",
  ),
  "Hobbit Hole": {
    // Hobbitcycling {4}: read from the text.
    abilities: [
      activated({
        tap: true,
        sacrifice: true,
        effects: [fx.search(BASIC_LAND, { to: "battlefield", tapped: true })],
        label: "A basic land tapped",
      }),
    ],
  },
};
