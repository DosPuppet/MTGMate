/**
 * Marvel Super Heroes — green cards (lot A). Power-up is written `activated({ powerUp: true })`; Teamwork is read from
 * the text (kicker), and `cond.kicked` / `amount.kicked` read whether it was paid.
 */
import { type ModeDef, msg, type ObjectFilter, type TokenSpec } from "@mtgx/engine";
import {
  activated,
  amount,
  BASIC_LAND,
  block,
  blockAbility,
  bothIfKicked,
  type CardScript,
  chapter,
  cond,
  cost,
  eventReplacement,
  FOOD,
  fx,
  HERO,
  manaAbility,
  modal,
  mode,
  playerStatic,
  ref,
  SQUIRREL,
  spell,
  staticAbility,
  TREASURE,
  target,
  triggered,
  triggeredModal,
  wardAbility,
  when,
} from "./common";

const ANY_COLOR = ["W", "U", "B", "R", "G"] as const;
const CREATURES_YOU_CONTROL: ObjectFilter = { types: ["Creature"], controller: "you" };
const YOUR_CREATURE = (id = "t") => target.creature(id, { controller: "you" });
const OPPONENT_CREATURE = (id = "t") => ({
  ...target.creature(id, { controller: "opponent" }),
  label: "creature controlled by an opponent",
});
/** Two or more creature cards in your graveyard. */
const TWO_CREATURE_CARDS = cond.amountAtLeast(amount.countIn("graveyard", { types: ["Creature"] }), 2);

/** Zabu (Ka-Zar): legendary 2/2 green Cat, "Landfall — put a +1/+1 counter on Zabu". */
const ZABU: TokenSpec = {
  name: "Zabu",
  colors: ["G"],
  types: ["Creature"],
  subtypes: ["Cat"],
  power: 2,
  toughness: 2,
  legendary: true,
  abilities: [triggered(when.landfall, [fx.addCounters(ref.self, 1)], { label: "Landfall — a +1/+1 counter on Zabu" })],
  text: "Landfall — Whenever a land you control enters, put a +1/+1 counter on Zabu.",
};

/** Moloid (Mole Man): 1/1 green Minion, "whenever this token attacks, you may mill a card". */
const MOLOID: TokenSpec = {
  name: "Moloid",
  colors: ["G"],
  types: ["Creature"],
  subtypes: ["Minion"],
  power: 1,
  toughness: 1,
  abilities: [triggered(when.attacksSelf, [...fx.may("Mill a card?", fx.mill(1))], { label: "You may mill a card" })],
  text: "Whenever this token attacks, you may mill a card.",
};

/** The Tiger God (White Tiger): legendary 4/4 green Cat God, blocked by at most one creature. */
const TIGER_GOD: TokenSpec = {
  name: "The Tiger God",
  colors: ["G"],
  types: ["Creature"],
  subtypes: ["Cat", "God"],
  power: 4,
  toughness: 4,
  legendary: true,
  abilities: [blockAbility(block.atMost(1))],
  text: "The Tiger God can't be blocked by more than one creature.",
};

/** "Choose up to two": each mode alone, then each pair (target ids distinct from one mode to another). */
function upToTwo(...modes: ModeDef[]): ModeDef[] {
  const pairs: ModeDef[] = [];
  modes.forEach((a, i) => {
    for (const b of modes.slice(i + 1))
      pairs.push({
        label: msg("{a} + {b}", { a: a.label ?? "", b: b.label ?? "" }),
        targets: [...a.targets, ...b.targets],
        effects: [...a.effects, ...b.effects],
      });
  });
  return [...modes, ...pairs];
}

/** Power-up: "put N +1/+1 counters on [this creature]" and other effects. */
const powerUp = (mana: string, label: string, effects: Parameters<typeof activated>[0]["effects"], extra = {}) =>
  activated({ mana, powerUp: true, effects, label: msg("Power-up: {effect}", { effect: label }), ...extra });

export const GREEN: Record<string, CardScript> = {
  "Ant-Man's Army": {
    abilities: [
      triggeredModal(
        when.entersSelf,
        [mode("A Food token", [], [fx.createTokens(FOOD)]), mode("A Treasure token", [], [fx.createTokens(TREASURE)])],
        { label: "A Food or a Treasure" },
      ),
    ],
  },
  "Call Damage Control": {
    spell: modal(
      ...upToTwo(
        mode(
          "An artifact card",
          [target.cardInGraveyard("a", { types: ["Artifact"] }, "you", "artifact card from your graveyard")],
          [fx.toHand(ref.target("a"))],
        ),
        mode(
          "A creature card",
          [target.cardInGraveyard("c", { types: ["Creature"] }, "you", "creature card from your graveyard")],
          [fx.toHand(ref.target("c"))],
        ),
        mode(
          "An enchantment card",
          [target.cardInGraveyard("e", { types: ["Enchantment"] }, "you", "enchantment card from your graveyard")],
          [fx.toHand(ref.target("e"))],
        ),
        mode(
          "A land card",
          [target.cardInGraveyard("l", { types: ["Land"] }, "you", "land card from your graveyard")],
          [fx.toHand(ref.target("l"))],
        ),
      ),
    ),
  },
  "Claim the Kingdom": {
    abilities: [
      triggered(when.landfall, [fx.addCounters(ref.target(), 1), fx.counters(ref.self, "plan")], {
        targets: [YOUR_CREATURE()],
        label: "Landfall — a +1/+1 counter on a creature you control and a plan counter",
      }),
      triggered(
        when.countersPut("self", "plan"),
        [fx.sacrificeIt(ref.self), fx.reflexive([YOUR_CREATURE("u")], [fx.counters(ref.target("u"), "indestructible")])],
        {
          condition: cond.counterAtLeast("plan", 4),
          label: "Fourth counter: sacrifice it, an indestructible counter on a creature you control",
        },
      ),
    ],
  },
  "Doc Samson, Super Psychiatrist": {
    abilities: [
      eventReplacement({
        event: "counters",
        to: "yourSide",
        toFilter: { permanent: true, controller: "you" },
        modify: { add: 1 },
        label: "One more counter of each kind on your permanents",
      }),
      manaAbility([...ANY_COLOR], 1, { selfPower: true }),
    ],
  },
  "Earth's Mightiest Heroes": {
    // Teamwork 5: read from the text; paid, any number of creature cards.
    spell: spell(
      [],
      [
        fx.lookAtTop(8, {
          filter: { types: ["Creature"] },
          count: amount.kicked(8, 1),
          to: { to: "battlefield" },
          rest: "graveyard",
        }),
      ],
    ),
  },
  "Epic Fight": {
    spell: modal(
      mode("Double power and toughness", [target.creature("t")], [fx.doublePT(ref.target("t"))]),
      mode("Fight", [YOUR_CREATURE("a"), OPPONENT_CREATURE("b")], [fx.fight(ref.target("a"), ref.target("b"))]),
      mode(
        "Both",
        [target.creature("t"), YOUR_CREATURE("a"), OPPONENT_CREATURE("b")],
        [fx.doublePT(ref.target("t")), fx.fight(ref.target("a"), ref.target("b"))],
      ),
    ),
  },
  "Go Nuts!": {
    // Teamwork 3: read from the text; paid, both modes are chosen.
    spell: bothIfKicked(
      mode("A +1/+1 counter", [target.creature("t")], [fx.addCounters(ref.target("t"), 1)]),
      mode("Fight", [YOUR_CREATURE("a"), OPPONENT_CREATURE("b")], [fx.fight(ref.target("a"), ref.target("b"))]),
      "Both (teamwork paid)",
    ),
  },
  "Guerrilla Gorilla": {
    abilities: [
      activated({
        sacrifice: true,
        sorcerySpeed: true,
        targets: [
          target.permanent(
            "t",
            ["Artifact", "Enchantment"],
            { notTypes: ["Creature"] },
            "noncreature artifact or noncreature enchantment",
          ),
        ],
        effects: [fx.destroy(ref.target())],
        label: "Sacrifice it: destroy a noncreature artifact or enchantment",
      }),
    ],
  },
  "Hellcat, Undying Vigilante": {
    abilities: [
      triggered(
        when.diesSelf,
        [
          fx.moveTo(ref.selfCard, { to: "battlefield", counters: { kind: "+1/+1", n: 1 } }, { name: "h" }),
          fx.modify(ref.stored("h"), { loseAllAbilities: true, addKeywords: ["haste"] }, "permanent"),
        ],
        { label: "Returns with a +1/+1 counter, with no abilities but with haste" },
      ),
    ],
  },
  "Hercules, Prince of Power": {
    abilities: [
      powerUp("{4}{G}", "a +1/+1 counter, vigilance, indestructible and haste", [
        fx.addCounters(ref.self, 1),
        fx.modify(ref.self, { addKeywords: ["vigilance", "indestructible", "haste"] }),
      ]),
    ],
  },
  "Heroic Feast": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(FOOD)], { label: "A Food token" }),
      triggered(when.gainLife, [fx.addCounters(ref.target(), 1)], {
        targets: [{ ...target.upTo(1, YOUR_CREATURE()), countAmount: amount.eventAmount }],
        label: "A +1/+1 counter on up to that many creatures you control as life gained",
      }),
    ],
  },
  "Hulkling, Burgeoning Bruiser": {
    abilities: [
      triggered(when.enters({ ...CREATURES_YOU_CONTROL, other: true }), [fx.addCounters(ref.self, 1)], {
        condition: cond.any(
          cond.amountAtLeast(amount.plus(amount.powerOf(ref.eventObject), amount.neg(amount.powerOf(ref.self))), 1),
          cond.amountAtLeast(amount.plus(amount.toughnessOf(ref.eventObject), amount.neg(amount.toughnessOf(ref.self))), 1),
        ),
        label: "A creature with greater power or toughness enters: a +1/+1 counter",
      }),
    ],
  },
  "Ka-Zar of the Savage Land": {
    abilities: [
      playerStatic({ lookAt: "libraryTop", label: "You may look at the top card" }),
      playerStatic({ playFrom: { zone: "libraryTop", what: "lands" }, label: "Play lands from the top" }),
      triggered(when.entersSelf, [fx.createTokens(ZABU)], { label: "Zabu, legendary 2/2 Cat" }),
    ],
  },
  "Knight of Wundagore": {
    abilities: [
      triggered(when.youPutCounters({ types: ["Creature"], other: true }, "+1/+1"), [fx.addCounters(ref.self, 1)], {
        oncePerTurn: true,
        label: "A +1/+1 counter on another creature: one on this one (once each turn)",
      }),
    ],
  },
  "Mister Hyde, Monster Within": {
    abilities: [
      triggeredModal(
        when.yourUpkeep,
        [
          mode("A +1/+1 counter on Mister Hyde", [], [fx.addCounters(ref.self, 1)]),
          mode(
            "Remove a counter from a creature you control: draw",
            [],
            [
              fx.chooseAmong(ref.permanentsOf(ref.you, { types: ["Creature"], withCounter: "any" }), ref.you, "c"),
              fx.removeCounters(ref.stored("c"), 1, undefined, "removed"),
              ...fx.when(cond.v("removed"), fx.draw(1)),
            ],
          ),
        ],
        { label: "A +1/+1 counter, or remove a counter to draw" },
      ),
    ],
  },
  "Mole Man, Moloid Master": {
    abilities: [
      playerStatic({ playFrom: { zone: "graveyard", what: "lands" }, label: "Play lands from your graveyard" }),
      triggered(when.landfall, [fx.createTokens(MOLOID)], { label: "Landfall — a 1/1 Moloid" }),
    ],
  },
  "Pet Avengers": {
    abilities: [powerUp("{6}{G}", "a +1/+1 counter and a 3/2 Hero", [fx.addCounters(ref.self, 1), fx.createTokens(HERO)])],
  },
  "Punishing Punch": {
    costReduction: { generic: 2, condition: TWO_CREATURE_CARDS },
    spell: spell(
      [YOUR_CREATURE("a"), OPPONENT_CREATURE("b")],
      [
        fx.damage(
          amount.plus(amount.powerOf(ref.target("a")), amount.powerOf(ref.target("a"))),
          ref.target("b"),
          ref.target("a"),
        ),
      ],
    ),
  },
  "Rapid Rescue": {
    spell: spell(
      [],
      [
        fx.mill(2, ref.you, { name: "m" }),
        fx.pickFromZone(
          "graveyard",
          { permanent: true },
          { to: "hand" },
          { count: 1, min: 0, pool: ref.stored("m"), prompt: "You may take a milled permanent card" },
        ),
        fx.gainLife(2),
      ],
    ),
  },
  "Reptil, Dinomorpher": {
    abilities: [
      activated({
        mana: "{3}",
        effects: [
          fx.modify(ref.self, {
            setSubtypes: ["Dinosaur", "Hero"],
            setPower: 3,
            setToughness: 5,
            addKeywords: ["reach", "vigilance"],
          }),
        ],
        label: "Brontosaurus — 3/5 Dinosaur Hero with reach and vigilance",
      }),
      activated({
        mana: "{6}",
        effects: [
          fx.modify(ref.self, { setSubtypes: ["Dinosaur", "Hero"], setPower: 6, setToughness: 6, addKeywords: ["trample"] }),
        ],
        label: "Tyrannosaurus — 6/6 Dinosaur Hero with trample",
      }),
    ],
  },
  "Restorative Technique": {
    spell: spell(
      [target.player("p"), target.upTo(1, target.creature("c"))],
      [
        fx.gainLife(2, ref.target("p")),
        fx.search(BASIC_LAND, { to: "battlefield", tapped: true }, 1, ref.target("p")),
        fx.addCounters(ref.target("c"), 1),
      ],
    ),
  },
  "Rick Jones, Destined Sidekick": {
    abilities: [
      activated({
        mana: "{3}",
        tap: true,
        effects: [
          fx.mill(4, ref.you, { name: "m" }),
          fx.pickFromZone(
            "graveyard",
            { anyOf: [{ subtype: "Hero" }, { types: ["Enchantment"] }] },
            { to: "hand" },
            {
              count: 1,
              min: 0,
              pool: ref.stored("m"),
              prompt: "You may take a milled Hero or enchantment card",
            },
          ),
        ],
        label: "Mill four cards, a Hero or an enchantment into your hand",
      }),
    ],
  },
  "Serpent Specialist": {
    abilities: [powerUp("{3}{G}", "two +1/+1 counters", [fx.addCounters(ref.self, 2)])],
  },
  "She-Hulk, Jade Defender": {
    abilities: [
      powerUp(
        "{4}{G}{G}",
        "destroy an artifact or enchantment, a +1/+1 counter",
        [fx.destroy(ref.target()), fx.addCounters(ref.self, 1)],
        { targets: [target.upTo(1, target.permanent("t", ["Artifact", "Enchantment"], {}, "artifact or enchantment"))] },
      ),
    ],
  },
  "Super Strength": {
    enchant: { filter: { types: ["Creature"] }, label: "creature" },
    abilities: [
      staticAbility(
        "attached",
        { power: 4, toughness: 4, addKeywords: ["trample", "ward"], addAbilities: [wardAbility({ mana: cost("{1}") })] },
        { label: "+4/+4, trample and ward {1}" },
      ),
    ],
  },
  "The Thing, Ben Grimm": {
    abilities: [
      triggered(
        when.dealsDamage({ subtype: "Hero", controller: "you" }, { to: { players: "any" } }),
        [fx.addCounters(ref.self, 2)],
        {
          batched: true,
          label: "Heroes deal damage to a player: two +1/+1 counters",
        },
      ),
    ],
  },
  "Tigra, Feline Fury": {
    abilities: [triggered(when.gainLife, [fx.addCounters(ref.self, 1)], { label: "You gain life: a +1/+1 counter" })],
  },
  "Training Regimen": {
    abilities: [
      staticAbility(
        { ...CREATURES_YOU_CONTROL, withCounter: "+1/+1" },
        { addKeywords: ["trample"] },
        { label: "Creatures you control with a +1/+1 counter have trample" },
      ),
      triggered(when.yourCombat, [fx.addCounters(ref.target(), 1)], {
        targets: [YOUR_CREATURE()],
        label: "A +1/+1 counter on a creature you control",
      }),
    ],
  },
  "The Unbeatable Squirrel Girl": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(SQUIRREL)], { label: "A 1/1 Squirrel" }),
      triggered(when.attacksSelf, [fx.createTokens(SQUIRREL)], { label: "A 1/1 Squirrel" }),
      activated({
        mana: "{1}{G}{G}{G}",
        effects: [fx.createTokens(SQUIRREL, amount.count({ subtype: "Squirrel", controller: "you" }))],
        label: "As many 1/1 Squirrels as Squirrels you control",
      }),
    ],
  },
  "Undercover Skrull": {
    abilities: [
      staticAbility(
        "self",
        { power: 2, toughness: 2, allCreatureTypes: true },
        { condition: TWO_CREATURE_CARDS, label: "+2/+2 and all creature types (two creature cards in graveyard)" },
      ),
      manaAbility([...ANY_COLOR]),
    ],
  },
  "Wakandan Royal Guard": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          ...fx.when(cond.targetMatches("t", { subtype: "Hero", other: true }), fx.addCounters(ref.target(), 2)),
          ...fx.when(cond.not(cond.targetMatches("t", { subtype: "Hero", other: true })), fx.addCounters(ref.target(), 1)),
        ],
        { targets: [target.creature()], label: "A +1/+1 counter (two on another Hero)" },
      ),
    ],
  },
  "White Tiger, Ava Ayala": {
    abilities: [
      powerUp("{5}{G}", "a +1/+1 counter and The Tiger God, a 4/4 Cat God", [
        fx.addCounters(ref.self, 1),
        fx.createTokens(TIGER_GOD),
      ]),
    ],
  },
  "World War Hulk": {
    abilities: [
      // From any zone; the next red or green creature spell uses up the effect, whether it is paid or not.
      chapter([1], [fx.nextCreatureSpell({ free: true }, { types: ["Creature"], colors: ["R", "G"] })], {
        label: "The next red or green creature spell without paying its cost",
      }),
      chapter([2], [fx.addCounters(ref.target(), 3)], {
        targets: [YOUR_CREATURE()],
        label: "Three +1/+1 counters on a creature you control",
      }),
      chapter([3], [fx.doublePT(ref.target(), ["trample"])], {
        targets: [YOUR_CREATURE()],
        label: "Double the power and toughness of a creature you control, which gains trample",
      }),
    ],
  },
  "Shang-Chi, Master of Kung Fu": {
    abilities: [
      playerStatic({
        activateAsThoughHaste: { types: ["Creature"], controller: "you" },
        label: "You activate abilities of creatures you control as though they had haste",
      }),
      manaAbility([...ANY_COLOR], 2, { restriction: { abilityOfCreature: {} } }),
    ],
  },
  "Powerful Broker": {
    abilities: [
      activated({
        tap: true,
        sorcerySpeed: true,
        targets: [{ id: "t", label: "permanent or player", filter: { objects: { permanent: true }, players: "any" } }],
        effects: [fx.proliferate(1, ref.target())],
        label: "One more counter of each kind on the target permanent or player",
      }),
    ],
  },
};
