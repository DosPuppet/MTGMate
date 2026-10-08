/** Foundations — nonbasic lands. */
import type { ManaType } from "@mtgx/engine";
import {
  activated,
  amount,
  BASIC_LAND,
  type CardScript,
  cond,
  entersWith,
  fx,
  manaAbility,
  ref,
  target,
  triggered,
  when,
} from "./common";

/** Two-color lands "enters tapped, gain 1 life". */
const gainLand = (a: ManaType, b: ManaType): CardScript => ({
  abilities: [
    entersWith({ tapped: true }),
    triggered(when.entersSelf, [fx.gainLife(1)], { label: "+1 life" }),
    manaAbility([a, b]),
  ],
});

/** Guildgates: "enters tapped, {T}: Add {X} or {Y}" (Gate subtype). */
const guildgate = (a: ManaType, b: ManaType): CardScript => ({ abilities: [entersWith({ tapped: true }), manaAbility([a, b])] });

/** Temples: "enters tapped, scry 1 when it enters". */
const temple = (a: ManaType, b: ManaType): CardScript => ({
  abilities: [entersWith({ tapped: true }), triggered(when.entersSelf, [fx.scry(1)], { label: "scry 1" }), manaAbility([a, b])],
});

export const LANDS: Record<string, CardScript> = {
  "Bloodfell Caves": gainLand("B", "R"),
  "Blossoming Sands": gainLand("G", "W"),
  "Dismal Backwater": gainLand("U", "B"),
  "Jungle Hollow": gainLand("B", "G"),
  "Rugged Highlands": gainLand("R", "G"),
  "Scoured Barrens": gainLand("W", "B"),
  "Swiftwater Cliffs": gainLand("U", "R"),
  "Thornwood Falls": gainLand("G", "U"),
  "Tranquil Cove": gainLand("W", "U"),
  "Wind-Scarred Crag": gainLand("R", "W"),
  "Evolving Wilds": {
    abilities: [
      activated({
        tap: true,
        sacrifice: true,
        effects: [fx.search(BASIC_LAND, { to: "battlefield", tapped: true })],
        label: "Search for a basic land, put onto the battlefield tapped",
      }),
    ],
  },
  "Rogue's Passage": {
    abilities: [
      manaAbility("C"),
      activated({
        mana: "{4}",
        tap: true,
        targets: [target.creature()],
        effects: [fx.modify(ref.target(), { addKeywords: ["unblockable"] })],
        label: "A creature can't be blocked",
      }),
    ],
  },
  "Soulstone Sanctuary": {
    abilities: [
      manaAbility("C"),
      activated({
        mana: "{4}",
        effects: [
          fx.modify(
            ref.self,
            { addTypes: ["Creature"], setPower: 3, setToughness: 3, addKeywords: ["vigilance"], allCreatureTypes: true },
            "permanent",
          ),
        ],
        label: "Becomes a 3/3 creature",
      }),
    ],
  },
  "Secluded Courtyard": {
    asEnters: [fx.chooseForSelf("creatureType")],
    abilities: [
      manaAbility("C"),
      manaAbility(["W", "U", "B", "R", "G"], 1, {
        restriction: { spell: { types: ["Creature"], subtypeChosen: true }, abilityOfCreature: { subtypeChosen: true } },
      }),
    ],
  },

  // --- Reprints ---
  "Azorius Guildgate": guildgate("W", "U"),
  "Boros Guildgate": guildgate("R", "W"),
  "Dimir Guildgate": guildgate("U", "B"),
  "Golgari Guildgate": guildgate("B", "G"),
  "Gruul Guildgate": guildgate("R", "G"),
  "Izzet Guildgate": guildgate("U", "R"),
  "Orzhov Guildgate": guildgate("W", "B"),
  "Rakdos Guildgate": guildgate("B", "R"),
  "Selesnya Guildgate": guildgate("G", "W"),
  "Simic Guildgate": guildgate("G", "U"),
  "Temple of Abandon": temple("R", "G"),
  "Temple of Deceit": temple("U", "B"),
  "Temple of Enlightenment": temple("W", "U"),
  "Temple of Epiphany": temple("U", "R"),
  "Temple of Malady": temple("B", "G"),
  "Temple of Malice": temple("B", "R"),
  "Temple of Mystery": temple("G", "U"),
  "Temple of Plenty": temple("G", "W"),
  "Temple of Silence": temple("W", "B"),
  "Temple of Triumph": temple("R", "W"),
  "Crawling Barrens": {
    abilities: [
      manaAbility("C"),
      activated({
        mana: "{4}",
        effects: [
          fx.addCounters(ref.self, 2),
          ...fx.may(
            "Become a 0/0 Elemental creature until end of turn?",
            fx.modify(ref.self, { addTypes: ["Creature"], addSubtypes: ["Elemental"], setPower: 0, setToughness: 0 }),
          ),
        ],
        label: "Two +1/+1 counters",
      }),
    ],
  },
  "Cryptic Caves": {
    abilities: [
      manaAbility("C"),
      activated({
        mana: "{1}",
        tap: true,
        sacrifice: true,
        activationCondition: cond.controls({ types: ["Land"] }, 5),
        effects: [fx.draw(1)],
        label: "Draw a card (five lands)",
      }),
    ],
  },
  "Demolition Field": {
    abilities: [
      manaAbility("C"),
      activated({
        mana: "{2}",
        tap: true,
        sacrifice: true,
        targets: [target.permanent("t", ["Land"], { controller: "opponent", basic: false }, "opponent's nonbasic land")],
        effects: [
          fx.destroy(ref.target()),
          fx.search(BASIC_LAND, { to: "battlefield" }, 1, ref.controllerOf(ref.target())),
          fx.search(BASIC_LAND, { to: "battlefield" }),
        ],
        label: "Destroy a nonbasic land",
      }),
    ],
  },
  "Maze's End": {
    abilities: [
      entersWith({ tapped: true }),
      manaAbility("C"),
      activated({
        mana: "{3}",
        tap: true,
        bounceSelf: true,
        effects: [
          fx.search({ subtype: "Gate" }, { to: "battlefield" }),
          ...fx.when(cond.amountAtLeast(amount.distinctNames({ subtype: "Gate", controller: "you" }), 10), fx.winGame),
        ],
        label: "Search for a Gate",
      }),
    ],
  },
  "Uncharted Haven": {
    asEnters: [fx.chooseForSelf("color")],
    abilities: [entersWith({ tapped: true }), manaAbility(["W"], 1, { produceChosen: true })],
  },
};
