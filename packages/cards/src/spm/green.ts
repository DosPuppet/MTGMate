/**
 * Marvel's Spider-Man — green cards (lot A). Web-slinging, convoke, reach and the other keywords are read from the
 * text.
 */
import type { ObjectFilter } from "@mtgx/engine";
import {
  activated,
  amount,
  BASIC_LAND,
  block,
  blockAbility,
  type CardScript,
  cond,
  FOOD,
  fx,
  manaAbility,
  modal,
  mode,
  ref,
  SPIDER_21,
  spell,
  staticAbility,
  TREASURE,
  target,
  triggered,
  triggeredModal,
  when,
} from "./common";

const SPIDERS_YOU_CONTROL: ObjectFilter = { types: ["Creature"], subtype: "Spider", controller: "you" };
const YOUR_CREATURE = (id = "t") => target.creature(id, { controller: "you" });
const OPPONENT_CREATURE = (id = "t") => ({
  ...target.creature(id, { controller: "opponent" }),
  label: "creature controlled by an opponent",
});
const YOUR_SPIDER = (id = "t") => ({
  ...target.creature(id, { subtype: "Spider", controller: "you" }),
  label: "Spider you control",
});

/** Spider-Ham: the creature types that get +1/+1 ("Animal May-Ham"). */
const MAY_HAM_TYPES = [
  "Spider",
  "Boar",
  "Bat",
  "Bear",
  "Bird",
  "Cat",
  "Dog",
  "Frog",
  "Jackal",
  "Lizard",
  "Mouse",
  "Otter",
  "Rabbit",
  "Raccoon",
  "Rat",
  "Squirrel",
  "Turtle",
  "Wolf",
];

export const GREEN: Record<string, CardScript> = {
  "Damage Control Crew": {
    abilities: [
      triggeredModal(
        when.entersSelf,
        [
          mode(
            "Repair: a card with mana value 4 or greater from your graveyard to your hand",
            [target.cardInGraveyard("c", { minManaValue: 4 }, "you", "card with mana value 4 or greater in your graveyard")],
            [fx.toHand(ref.target("c"))],
          ),
          mode(
            "Impound: exiles an artifact or an enchantment",
            [target.permanent("p", ["Artifact", "Enchantment"], {}, "artifact or enchantment")],
            [fx.exile(ref.target("p"))],
          ),
        ],
        { label: "Repair or impound" },
      ),
    ],
  },
  "Ezekiel Sims, Spider-Totem": {
    abilities: [
      triggered(when.yourCombat, [fx.pump(ref.target(), 2, 2)], {
        targets: [YOUR_SPIDER()],
        label: "A Spider you control gets +2/+2",
      }),
    ],
  },
  "Grow Extra Arms": {
    costReduction: { generic: 1, condition: cond.targetMatches("t", { subtype: "Spider" }) },
    spell: spell([target.creature()], [fx.pump(ref.target(), 4, 4)]),
  },
  "Guy in the Chair": {
    abilities: [
      manaAbility(["W", "U", "B", "R", "G"]),
      activated({
        mana: "{2}{G}",
        tap: true,
        sorcerySpeed: true,
        targets: [{ ...target.creature("t", { subtype: "Spider" }), label: "Spider" }],
        effects: [fx.addCounters(ref.target(), 1)],
        label: "Web Support: a +1/+1 counter on a Spider",
      }),
    ],
  },
  "Kapow!": {
    spell: spell(
      [YOUR_CREATURE("a"), OPPONENT_CREATURE("b")],
      [fx.addCounters(ref.target("a"), 1), fx.fight(ref.target("a"), ref.target("b"))],
    ),
  },
  "Kraven's Cats": {
    abilities: [
      activated({ mana: "{2}{G}", oncePerTurn: true, effects: [fx.pump(ref.self, 2, 2)], label: "+2/+2 (once each turn)" }),
    ],
  },
  "Lizard, Connors's Curse": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.modify(
            ref.target(),
            { loseAllAbilities: true, setColors: ["G"], setSubtypes: ["Lizard"], setPower: 4, setToughness: 4 },
            "permanent",
          ),
        ],
        {
          targets: [target.upTo(1, { ...target.creature("t", { other: true }), label: "other creature" })],
          label: "Lizard Formula: another creature becomes a green 4/4 Lizard with no abilities",
        },
      ),
    ],
  },
  "Lurking Lizards": {
    abilities: [
      triggered(when.castSpell("you", { minManaValue: 4 }), [fx.addCounters(ref.self, 1)], {
        label: "Spell with mana value 4 or greater: a +1/+1 counter",
      }),
    ],
  },

  // --- Miles Morales // Ultimate Spider-Man -------------------------------------
  "Miles Morales": {
    abilities: [
      triggered(when.entersSelf, [fx.addCounters(ref.target(), 1)], {
        targets: [target.upTo(2, target.creature())],
        label: "A +1/+1 counter on each of up to two creatures",
      }),
      activated({ mana: "{3}{R}{G}{W}", sorcerySpeed: true, effects: [fx.transform(ref.self)], label: "Transform it" }),
    ],
  },
  "Ultimate Spider-Man": {
    abilities: [
      activated({
        mana: "{2}",
        effects: [fx.addCounters(ref.self, 1), fx.modify(ref.self, { addKeywords: ["hexproof"], setColors: [] })],
        label: "Camouflage: a +1/+1 counter, hexproof and colorless until end of turn",
      }),
      triggered(
        when.attackWith(1),
        [
          fx.doubleAllCounters(
            ref.permanentsOf(ref.you, { types: ["Creature"], anyOf: [{ subtype: "Spider" }, { legendary: true }] }),
          ),
        ],
        { label: "Double the counters on your Spiders and legendary creatures" },
      ),
    ],
  },

  "Pictures of Spider-Man": {
    abilities: [
      triggered(when.entersSelf, [fx.lookAtTop(5, { filter: { types: ["Creature"] }, count: 2 })], {
        label: "Look at the top five cards: up to two creature cards to your hand",
      }),
      activated({
        mana: "{1}",
        tap: true,
        sacrifice: true,
        effects: [fx.createTokens(TREASURE)],
        label: "Sacrifice it: a Treasure token",
      }),
    ],
  },
  "Professional Wrestler": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(TREASURE)], { label: "A Treasure token" }),
      blockAbility(block.atMost(1)),
    ],
  },
  "Radioactive Spider": {
    abilities: [
      activated({
        mana: "{2}",
        sacrifice: true,
        sorcerySpeed: true,
        effects: [fx.search({ subtype: "Spider", anySubtype: ["Hero"] })],
        label: "Fateful Bite: search for a Spider Hero card",
      }),
    ],
  },
  "Scout the City": {
    spell: modal(
      mode(
        "Look Around: mill three cards, a permanent card to your hand, gain 3 life",
        [],
        [
          fx.mill(3, ref.you, { name: "m" }),
          fx.pickFromZone(
            "graveyard",
            { permanent: true },
            { to: "hand" },
            { count: 1, min: 0, pool: ref.stored("m"), prompt: "You may take a milled permanent card" },
          ),
          fx.gainLife(3),
        ],
      ),
      mode(
        "Bring Down: destroys a creature with flying",
        [{ ...target.creature("t", { keyword: "flying" }), label: "creature with flying" }],
        [fx.destroy(ref.target("t"))],
      ),
    ),
  },
  "Spider-Ham, Peter Porker": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(FOOD)], { label: "A Food token" }),
      staticAbility(
        { types: ["Creature"], anySubtype: MAY_HAM_TYPES, controller: "you", other: true },
        { power: 1, toughness: 1 },
        { label: "Animal May-Ham: your other animals get +1/+1" },
      ),
    ],
  },
  "Spider-Man, Brooklyn Visionary": {
    // Web-slinging {2}{G}: read from the text.
    abilities: [
      triggered(when.entersSelf, [fx.search(BASIC_LAND, { to: "battlefield", tapped: true })], {
        label: "A tapped basic land",
      }),
    ],
  },
  "Strength of Will": {
    spell: spell(
      [YOUR_CREATURE()],
      [
        fx.modify(ref.target(), {
          addKeywords: ["indestructible"],
          addAbilities: [
            triggered(when.isDealtDamage, [fx.addCounters(ref.self, amount.eventAmount)], {
              label: "Damaged: that many +1/+1 counters",
            }),
          ],
        }),
      ],
    ),
  },
  "Supportive Parents": {
    abilities: [
      activated({
        tapOthers: { filter: { types: ["Creature"] }, count: 2, includeSelf: true },
        effects: [fx.addManaChoice(1)],
        label: "Tap two creatures: one mana of any color",
      }),
    ],
  },
  "Terrific Team-Up": {
    costReduction: { generic: 2, condition: cond.controls({ permanent: true, minManaValue: 4 }) },
    spell: spell(
      [target.between(1, 2, YOUR_CREATURE("a")), OPPONENT_CREATURE("b")],
      [fx.pump(ref.target("a"), 1, 0), fx.eachOfDealsDamage(ref.target("a"), ref.target("b"))],
    ),
  },
  "Wall Crawl": {
    abilities: [
      triggered(
        when.entersSelf,
        [fx.createTokens(SPIDER_21), fx.gainLife(amount.count({ subtype: "Spider", controller: "you" }))],
        { label: "A 2/1 Spider, then 1 life for each Spider you control" },
      ),
      staticAbility(
        SPIDERS_YOU_CONTROL,
        {
          power: 1,
          toughness: 1,
          addBlockRules: [block.notBy({ keyword: "defender" }, "Can't be blocked by creatures with defender")],
        },
        { label: "Your Spiders get +1/+1 and can't be blocked by defenders" },
      ),
    ],
  },
  "Web of Life and Destiny": {
    // Convoke: read from the text.
    abilities: [
      triggered(
        when.yourCombat,
        [fx.lookAtTop(5, { filter: { types: ["Creature"] }, to: { to: "battlefield" }, rest: "bottom" })],
        { label: "Look at the top five cards: a creature card onto the battlefield" },
      ),
    ],
  },
};
