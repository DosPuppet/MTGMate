/** Aetherdrift — multicolored and colorless cards, and lands. */
import type { CardScript, ManaType } from "@mtgx/engine";
import {
  activated,
  amount,
  CREATURE_OR_ARTIFACT,
  CREATURE_OR_VEHICLE,
  CREATURE_YOU_CONTROL,
  cond,
  entersWith,
  eventReplacement,
  fx,
  GREEN_INSECT,
  MOUNT_OR_VEHICLE,
  manaAbility,
  OTHER_CREATURE_YOU_CONTROL,
  pilot,
  ref,
  spell,
  staticAbility,
  THOPTER,
  TREASURE,
  target,
  targetCreatureOrVehicle,
  targetObj,
  triggered,
  when,
  whileSaddled,
} from "./common";

/** Verge: "{T}: Add [A]"; "{T}: Add [B]. Activate only if you control a [type] or a [type]". */
const verge = (a: ManaType, b: ManaType, types: [string, string]): CardScript => ({
  abilities: [
    manaAbility(a),
    manaAbility(b, 1, { condition: cond.controls({ anyOf: [{ subtype: types[0] }, { subtype: types[1] }] }) }),
  ],
});

/** Roads: enters tapped unless you control a Mount or Vehicle; "{1}[C], {T}, sacrifice: 1/1 Pilot". */
const road = (c: ManaType): CardScript => ({
  abilities: [
    entersWith({ tapped: true, condition: cond.not(cond.controls({ ...MOUNT_OR_VEHICLE })) }),
    manaAbility(c),
    activated({ mana: `{1}{${c}}`, tap: true, sacrifice: true, sorcerySpeed: true, effects: [pilot()], label: "1/1 Pilot" }),
  ],
});

export const MULTI: Record<string, CardScript> = {
  // --- Multicolored ----------------------------------------------------------
  "Aatchik, Emerald Radian": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(GREEN_INSECT, amount.countIn("graveyard", CREATURE_OR_ARTIFACT))], {
        label: "An Insect for each artifact or creature card in your graveyard",
      }),
      triggered(
        when.dies({ subtype: "Insect", controller: "you", other: true }),
        [fx.addCounters(ref.self, 1), fx.loseLife(1, ref.eachOpponent)],
        { label: "+1/+1 counter, each opponent loses 1 life" },
      ),
    ],
  },
  "Apocalypse Runner": {
    abilities: [
      activated({
        tap: true,
        targets: [target.creature("t", { controller: "you", maxPower: 2 })],
        effects: [fx.pump(ref.target(), 0, 0, ["lifelink", "unblockable"])],
        label: "Lifelink and can't be blocked",
      }),
    ],
  },
  "Boosted Sloop": { abilities: [triggered(when.attackWith(1), fx.loot(1), { label: "Draw, then discard" })] },
  "Brightglass Gearhulk": {
    abilities: [
      triggered(
        when.entersSelf,
        fx.may(
          "Search for up to two cards with mana value 1 or less?",
          fx.search({ types: ["Artifact", "Creature", "Enchantment"], maxManaValue: 1 }, { to: "hand" }, 2),
        ),
        { label: "Two cards with mana value 1 or less" },
      ),
    ],
  },
  "Broadside Barrage": {
    spell: spell([target.creatureOrPlaneswalker("t")], [fx.damage(5, ref.target()), ...fx.loot(1)]),
  },
  "Broodheart Engine": {
    abilities: [
      triggered(when.yourUpkeep, [fx.surveil(1)], { label: "Surveil 1" }),
      activated({
        mana: "{2}{B}{G}",
        tap: true,
        sacrifice: true,
        sorcerySpeed: true,
        targets: [target.cardInGraveyard("t", CREATURE_OR_VEHICLE, "you", "creature or Vehicle card")],
        effects: [fx.toBattlefield(ref.target())],
        label: "Return a creature or Vehicle",
      }),
    ],
  },
  "Caradora, Heart of Alacria": {
    abilities: [
      triggered(when.entersSelf, fx.may("Search for a Mount or Vehicle?", fx.search(MOUNT_OR_VEHICLE)), {
        label: "Search for a Mount or Vehicle",
      }),
      // "… on a creature or Vehicle you control" (a Vehicle that is not a creature included).
      eventReplacement({
        event: "counters",
        to: "yourSide",
        toFilter: CREATURE_OR_VEHICLE,
        counter: "+1/+1",
        modify: { add: 1 },
        label: "One additional +1/+1 counter",
      }),
    ],
  },
  "Cloudspire Skycycle": {
    abilities: [
      triggered(when.entersSelf, [fx.countersDivided(2, ref.target())], {
        targets: [target.between(1, 2, targetCreatureOrVehicle("t", { controller: "you", other: true }))],
        label: "Distribute two +1/+1 counters",
      }),
    ],
  },
  "Debris Beetle": { abilities: [triggered(when.entersSelf, fx.drain(3), { label: "Drain 3 life" })] },
  "Explosive Getaway": {
    spell: spell(
      [target.upTo(1, target.permanent("t", ["Artifact", "Creature"], {}, "artifact or creature"))],
      [
        fx.exileCard(ref.target(), { name: "g" }),
        fx.delayed([fx.toBattlefield(ref.target("g"))], { g: ref.stored("g") }),
        fx.damageAll(4, { types: ["Creature"] }),
      ],
    ),
  },
  "Haunt the Network": {
    spell: spell(
      [target.player("t", "opponent")],
      [
        fx.createTokens(THOPTER, 2),
        fx.loseLife(amount.count({ types: ["Artifact"], controller: "you" }), ref.target()),
        fx.gainLife(amount.count({ types: ["Artifact"], controller: "you" })),
      ],
    ),
  },
  "Haunted Hellride": {
    abilities: [
      triggered(when.attackWith(1), [fx.pump(ref.target(), 1, 0, ["deathtouch"]), fx.untap(ref.target())], {
        targets: [target.creature("t", { controller: "you" })],
        label: "+1/+0, deathtouch, untap it",
      }),
    ],
  },
  "Kolodin, Triumph Caster": {
    abilities: [
      staticAbility({ ...MOUNT_OR_VEHICLE, controller: "you" }, { addKeywords: ["haste"] }, { label: "Haste" }),
      triggered(when.enters({ subtype: "Mount", controller: "you" }), [fx.saddle(ref.eventObject)], { label: "Becomes saddled" }),
      triggered(when.enters({ subtype: "Vehicle", controller: "you" }), [fx.animateVehicle(ref.eventObject)], {
        label: "Becomes an artifact creature",
      }),
    ],
  },
  "Lagorin, Soul of Alacria": {
    abilities: [
      whileSaddled([fx.addCounters(ref.target(), 1)], {
        targets: [target.upTo(2, targetObj("t", MOUNT_OR_VEHICLE, "Mount or Vehicle"))],
        label: "+1/+1 counters on Mounts or Vehicles",
      }),
    ],
  },
  "Oildeep Gearhulk": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.discard(1, ref.target(), { chooser: "controller", optional: true, store: "d" }),
          fx.when(cond.v("d"), fx.draw(1, ref.target())),
        ],
        { targets: [target.player("t")], label: "Look at their hand: they discard, then draw" },
      ),
    ],
  },
  "Pyrewood Gearhulk": {
    abilities: [
      triggered(
        when.entersSelf,
        [fx.pumpAll(OTHER_CREATURE_YOU_CONTROL, 2, 2, ["vigilance", "menace"]), fx.thisTurn({ damageUnpreventable: true })],
        {
          label: "+2/+2, vigilance and menace",
        },
      ),
    ],
  },
  "Thundering Broodwagon": {
    abilities: [
      triggered(when.entersSelf, [fx.destroy(ref.target())], {
        targets: [target.nonland("t", { controller: "opponent", maxManaValue: 4 })],
        label: "Destroy a nonland permanent with mana value 4 or less",
      }),
    ],
  },
  "Veteran Beastrider": {
    abilities: [
      triggered(when.yourEndStep, [fx.untap(ref.permanentsOf(ref.you, { types: ["Creature"] }))], {
        label: "Untap your creatures",
      }),
      activated({ mana: "{2}{G}{W}", effects: [fx.pumpAll(CREATURE_YOU_CONTROL, 1, 1)], label: "Your creatures +1/+1" }),
    ],
  },
  "Voyage Home": {
    costReduction: { generic: amount.count({ types: ["Artifact"], controller: "you" }) },
    spell: spell([], [fx.draw(3), fx.gainLife(3)]),
  },

  // --- Colorless -------------------------------------------------------------
  Aetherjacket: {
    abilities: [
      activated({
        mana: "{2}",
        tap: true,
        sacrifice: true,
        sorcerySpeed: true,
        targets: [target.permanent("t", ["Artifact"], { other: true })],
        effects: [fx.destroy(ref.target())],
        label: "Destroy another artifact",
      }),
    ],
  },
  "Guidelight Matrix": {
    abilities: [
      triggered(when.entersSelf, [fx.draw(1)], { label: "Draw" }),
      activated({
        mana: "{2}",
        tap: true,
        sorcerySpeed: true,
        targets: [targetObj("t", { subtype: "Mount", controller: "you" }, "Mount you control")],
        effects: [fx.saddle(ref.target())],
        label: "A Mount becomes saddled",
      }),
      activated({
        mana: "{2}",
        tap: true,
        targets: [targetObj("t", { subtype: "Vehicle", controller: "you" }, "Vehicle you control")],
        effects: [fx.animateVehicle(ref.target())],
        label: "A Vehicle becomes an artifact creature",
      }),
    ],
  },
  "Marketback Walker": {
    abilities: [
      entersWith({ counters: amount.x }),
      activated({ mana: "{4}", effects: [fx.addCounters(ref.self, 1)], label: "+1/+1 counter" }),
      triggered(when.diesSelf, [fx.draw(amount.lkiCounters("+1/+1"))], { label: "A card for each +1/+1 counter" }),
    ],
  },
  "Rover Blades": {
    abilities: [staticAbility("attached", { addKeywords: ["doubleStrike"] }, { label: "Double strike" })],
  },
  "Scrap Compactor": {
    abilities: [
      activated({
        mana: "{3}",
        tap: true,
        sacrifice: true,
        targets: [target.creature("t")],
        effects: [fx.damage(3, ref.target())],
        label: "3 damage",
      }),
      activated({
        mana: "{6}",
        tap: true,
        sacrifice: true,
        targets: [targetCreatureOrVehicle()],
        effects: [fx.destroy(ref.target())],
        label: "Destroy a creature or Vehicle",
      }),
    ],
  },
  "Skybox Ferry": {},
  "Ticket Tortoise": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(TREASURE)], {
        condition: cond.amountAtLeast(
          amount.plus(
            amount.count({ types: ["Land"], controller: "opponent" }),
            amount.neg(amount.count({ types: ["Land"], controller: "you" })),
          ),
          1,
        ),
        label: "Treasure",
      }),
    ],
  },
  "Wreck Remover": {
    abilities: [
      triggered(when.entersSelf, [fx.exileCard(ref.target()), fx.gainLife(1)], {
        targets: [target.upTo(1, target.cardInGraveyard("t", {}, "any", "card"))],
        label: "Exile a card from a graveyard, +1 life",
      }),
      triggered(when.attacksSelf, [fx.exileCard(ref.target()), fx.gainLife(1)], {
        targets: [target.upTo(1, target.cardInGraveyard("t", {}, "any", "card"))],
        label: "Exile a card from a graveyard, +1 life",
      }),
    ],
  },

  // --- Lands -----------------------------------------------------------------
  "Bleachbone Verge": verge("B", "W", ["Plains", "Swamp"]),
  "Riverpyre Verge": verge("R", "U", ["Island", "Mountain"]),
  "Sunbillow Verge": verge("W", "R", ["Mountain", "Plains"]),
  "Wastewood Verge": verge("G", "B", ["Swamp", "Forest"]),
  "Willowrush Verge": verge("U", "G", ["Forest", "Island"]),
  "Country Roads": road("W"),
  "Foul Roads": road("B"),
  "Reef Roads": road("U"),
  "Rocky Roads": road("R"),
  "Wild Roads": road("G"),
  "Night Market": {
    asEnters: [fx.chooseForSelf("color")],
    abilities: [entersWith({ tapped: true }), manaAbility(["W"], 1, { produceChosen: true })],
  },
};
