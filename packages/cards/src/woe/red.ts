/**
 * Wilds of Eldraine — red cards (lot A). Adventures have one entry per face (the creature under its name, the
 * Adventure spell under the name of the Adventure); Bargain is read from the text (`cond.kicked`).
 */
import {
  activated,
  amount,
  type CardScript,
  CELEBRATION,
  CREATURE_YOU_CONTROL,
  chapter,
  cond,
  costReducer,
  createRole,
  fx,
  INSTANT_SORCERY,
  KNIGHT_VIGILANCE,
  MONSTER_ROLE,
  mode,
  RAT_NO_BLOCK,
  ref,
  spell,
  staticAbility,
  TREASURE,
  target,
  triggered,
  triggeredModal,
  WICKED_ROLE,
  when,
  YOUNG_HERO_ROLE,
} from "./common";

/** "Target creature you control" */
const yourCreature = (id = "t") => target.creature(id, { controller: "you" });

/** "You may discard a card. If you do, draw N cards." */
const mayRummage = (n: number) => [fx.discard(1, ref.you, { optional: true, store: "d" }), ...fx.when(cond.v("d"), fx.draw(n))];

/** Instant, sorcery and/or Adventure cards in your graveyard (Hearth Elemental, Frantic Firebolt). */
const SPELLY_CARDS = amount.plus(
  amount.countIn("graveyard", INSTANT_SORCERY),
  amount.countIn("graveyard", { notTypes: ["Instant", "Sorcery"], adventure: true }),
);

/** Ogre Chitterlord: two Rats, then +2/+0 to each Rat if you control five or more. */
const chitterlordEffects = [
  fx.createTokens(RAT_NO_BLOCK, 2),
  ...fx.when(cond.controls({ subtype: "Rat" }, 5), fx.pumpAll({ subtype: "Rat", controller: "you" }, 2, 0)),
];

export const RED: Record<string, CardScript> = {
  "Imodane, the Pyrohammer": {
    abilities: [
      triggered(
        { on: "dealsDamage", who: { types: ["Instant", "Sorcery"], controller: "you" }, spellToSoleTarget: true },
        [fx.damage(amount.eventAmount, ref.eachOpponent)],
        { label: "Your single-target spell deals damage to its creature: that much damage to each opponent" },
      ),
    ],
  },
  // Reach read from the text.
  "Skewer Slinger": {
    abilities: [
      triggered({ on: "blocks", who: "self", eventObject: "attacker" }, [fx.damage(1, ref.eventObject, ref.self)], {
        label: "It blocks: 1 damage to that creature",
      }),
      triggered(
        { on: "blocks", who: { types: ["Creature"] }, attacker: { self: true } },
        [fx.damage(1, ref.eventObject, ref.self)],
        {
          label: "It becomes blocked: 1 damage to that creature",
        },
      ),
    ],
  },
  // Double strike read from the text.
  "Kellan, the Fae-Blooded": {
    abilities: [
      staticAbility(
        { types: ["Creature"], controller: "you", other: true },
        { power: 1 },
        {
          per: { attached: "toSource", anyOf: [{ subtype: "Aura" }, { subtype: "Equipment" }] },
          label: "Your other creatures: +1/+0 for each Aura and Equipment attached to Kellan",
        },
      ),
    ],
  },
  "Birthright Boon": {
    spell: spell([], [fx.search({ anyOf: [{ subtype: "Aura" }, { subtype: "Equipment" }] }, { to: "hand" })]),
  },
  "Belligerent of the Ball": {
    abilities: [
      triggered(when.yourCombat, [fx.pump(ref.target(), 1, 0, ["menace"])], {
        condition: CELEBRATION,
        targets: [yourCreature()],
        label: "Celebration: +1/+0 and menace to one of your creatures",
      }),
    ],
  },
  "Bellowing Bruiser": {},
  "Beat a Path": {
    spell: spell([target.upTo(2, target.creature())], [fx.pump(ref.target(), 0, 0, ["cantBlock"])]),
  },
  "Bespoke Battlegarb": {
    abilities: [
      staticAbility("attached", { power: 2 }, { label: "Equipped creature gets +2/+0" }),
      triggered(when.yourCombat, [fx.attach(ref.target())], {
        condition: CELEBRATION,
        targets: [target.upTo(1, yourCreature())],
        label: "Celebration: attach it to one of your creatures",
      }),
    ],
  },
  "Boundary Lands Ranger": {
    abilities: [
      triggered(when.yourCombat, mayRummage(1), {
        condition: cond.ferocious,
        label: "Power 4 or greater: discard a card to draw a card",
      }),
    ],
  },
  "Charming Scoundrel": {
    abilities: [
      triggeredModal(
        when.entersSelf,
        [
          mode("Discard a card, then draw a card", [], [fx.discard(1), fx.draw(1)]),
          mode("A Treasure token", [], [fx.createTokens(TREASURE)]),
          mode("A Wicked Role on one of your creatures", [yourCreature()], createRole(WICKED_ROLE)),
        ],
        { label: "Choose a mode" },
      ),
    ],
  },
  "Cut In": {
    spell: spell(
      [target.creature("t"), target.upTo(1, yourCreature("r"))],
      [fx.damage(4, ref.target("t")), ...createRole(YOUNG_HERO_ROLE, ref.target("r"))],
    ),
  },
  "Edgewall Pack": {
    abilities: [triggered(when.entersSelf, [fx.createTokens(RAT_NO_BLOCK)], { label: "A 1/1 Rat that can't block" })],
  },
  "Embereth Veteran": {
    abilities: [
      activated({
        mana: "{1}",
        sacrifice: true,
        targets: [target.creature("t", { other: true })],
        effects: createRole(YOUNG_HERO_ROLE),
        label: "A Young Hero Role on another creature",
      }),
    ],
  },
  "Flick a Coin": {
    spell: spell([target.any()], [fx.damage(1, ref.target()), fx.createTokens(TREASURE), fx.draw(1)]),
  },
  "Food Fight": {
    abilities: [
      staticAbility(
        { types: ["Artifact"], controller: "you" },
        {
          addAbilities: [
            activated({
              mana: "{2}",
              sacrifice: true,
              targets: [target.any()],
              // The sacrificed artifact deals the damage (last known information).
              effects: [fx.damage(amount.plus(1, amount.count({ name: "Food Fight", controller: "you" })), ref.target())],
              label: "Damage equal to 1 plus the number of Food Fights",
            }),
          ],
        },
        { label: "Your artifacts: {2}, sacrifice: damage to any target" },
      ),
    ],
  },
  "Frantic Firebolt": {
    spell: spell([target.creature()], [fx.damage(amount.plus(2, SPELLY_CARDS), ref.target())]),
  },
  "Gnawing Crescendo": {
    spell: spell(
      [],
      [
        fx.pumpAll(CREATURE_YOU_CONTROL, 2, 0),
        // "Whenever a nontoken creature you control dies this turn": emblem for the turn.
        fx.emblem(
          "Gnawing Crescendo",
          'Whenever a nontoken creature you control dies this turn, create a 1/1 black Rat creature token with "This token can\'t block."',
          [
            triggered(when.dies({ types: ["Creature"], controller: "you", token: false }), [fx.createTokens(RAT_NO_BLOCK)], {
              label: "A 1/1 Rat that can't block",
            }),
          ],
          false,
          true,
        ),
      ],
    ),
  },
  "Goddric, Cloaked Reveler": {
    abilities: [
      // Flying, quoted in the sentence, is not a printed keyword (the import does not read it): only with Celebration.
      staticAbility(
        "self",
        {
          setSubtypes: ["Dragon"],
          setPower: 4,
          setToughness: 4,
          addKeywords: ["flying"],
          addAbilities: [
            activated({
              mana: "{R}",
              effects: [fx.pumpAll({ types: ["Creature"], subtype: "Dragon", controller: "you" }, 1, 0)],
              label: "Your Dragons get +1/+0",
            }),
          ],
        },
        { condition: CELEBRATION, label: "Celebration: 4/4 Dragon with flying" },
      ),
    ],
  },
  "Grabby Giant": {
    abilities: [
      activated({
        mana: "{2}{R}",
        sacrificeOther: { filter: { anyOf: [{ types: ["Artifact"] }, { types: ["Land"] }] } },
        effects: [fx.draw(1)],
        label: "Sacrifice an artifact or a land: draw a card",
      }),
    ],
  },
  "That's Mine": { spell: spell([], [fx.createTokens(TREASURE)]) },
  "Grand Ball Guest": {
    abilities: [
      staticAbility(
        "self",
        { power: 1, toughness: 1, addKeywords: ["trample"] },
        { condition: CELEBRATION, label: "Celebration: +1/+1 and trample" },
      ),
    ],
  },
  "Harried Spearguard": {
    abilities: [triggered(when.diesSelf, [fx.createTokens(RAT_NO_BLOCK)], { label: "A 1/1 Rat that can't block" })],
  },
  "Kindled Heroism": {
    spell: spell([target.creature()], [fx.pump(ref.target(), 1, 0, ["firstStrike"]), fx.scry(1)]),
  },
  "Korvold and the Noble Thief": {
    abilities: [
      chapter([1, 2], [fx.createTokens(TREASURE)], { label: "A Treasure token" }),
      chapter([3], [fx.exileTop(ref.target(), 3, "k"), fx.grantPlay(ref.stored("k"))], {
        targets: [target.player("t", "opponent")],
        label: "Exile the top three cards of an opponent's library; playable this turn",
      }),
    ],
  },
  "Merry Bards": {
    abilities: [
      triggered(
        when.entersSelf,
        fx.mayPay("{1}", "Pay {1} for a Young Hero Role?", fx.reflexive([yourCreature()], createRole(YOUNG_HERO_ROLE))),
        { label: "Pay {1}: a Young Hero Role on one of your creatures" },
      ),
    ],
  },
  "Minecart Daredevil": {},
  "Ride the Rails": { spell: spell([target.creature()], [fx.pump(ref.target(), 2, 1)]) },
  "Monstrous Rage": {
    spell: spell([target.creature()], [fx.pump(ref.target(), 2, 0), ...createRole(MONSTER_ROLE)]),
  },
  "Raging Battle Mouse": {
    abilities: [
      costReducer({}, 1, "The second spell each turn costs {1} less", { condition: cond.castThisTurn(1, false, true) }),
      triggered(when.yourCombat, [fx.pump(ref.target(), 1, 1)], {
        condition: CELEBRATION,
        targets: [yourCreature()],
        label: "Celebration: +1/+1 to one of your creatures",
      }),
    ],
  },
  "Ratcatcher Trainee": {
    abilities: [
      staticAbility(
        "self",
        { addKeywords: ["firstStrike"] },
        { condition: cond.yourTurn, label: "Has first strike during your turn" },
      ),
    ],
  },
  "Pest Problem": { spell: spell([], [fx.createTokens(RAT_NO_BLOCK, 2)]) },
  "Realm-Scorcher Hellkite": {
    abilities: [
      // "four mana in any combination of colors": one division (PLAN-L L3).
      triggered(when.entersSelf, [fx.addManaCombination(4)], {
        condition: cond.kicked,
        label: "Bargained: four mana in any combination of colors",
      }),
      activated({
        mana: "{1}{R}",
        targets: [target.any()],
        effects: [fx.damage(1, ref.target())],
        label: "1 damage to any target",
      }),
    ],
  },
  "Redcap Thief": {
    abilities: [triggered(when.entersSelf, [fx.createTokens(TREASURE)], { label: "A Treasure token" })],
  },
  "Rotisserie Elemental": {
    abilities: [
      triggered(
        when.combatDamageToPlayer,
        [
          fx.counters(ref.self, "skewer"),
          fx.sacrifice(ref.you, { self: true }, 1, { optional: true, store: "s" }),
          // X: the skewer counters it had when it left the battlefield.
          ...fx.when(cond.v("s"), fx.exileTop(ref.you, amount.lkiCounters("skewer"), "e"), fx.grantPlay(ref.stored("e"))),
        ],
        { label: "Skewer counter; sacrifice it to exile X cards playable this turn" },
      ),
    ],
  },
  "Stonesplitter Bolt": {
    spell: spell(
      [target.creatureOrPlaneswalker()],
      [
        ...fx.when(cond.kicked, fx.damage(amount.plus(amount.x, amount.x), ref.target())),
        ...fx.when(cond.not(cond.kicked), fx.damage(amount.x, ref.target())),
      ],
    ),
  },
  "Tattered Ratter": {
    abilities: [
      triggered(when.becomesBlocked({ subtype: "Rat", controller: "you" }), [fx.pump(ref.eventObject, 2, 0)], {
        label: "The blocked Rat gets +2/+0",
      }),
    ],
  },
  "Twisted Fealty": {
    spell: spell(
      [target.creature("t"), target.upTo(1, target.creature("r"))],
      [
        fx.gainControl(ref.target("t")),
        fx.untap(ref.target("t")),
        fx.pump(ref.target("t"), 0, 0, ["haste"]),
        ...createRole(WICKED_ROLE, ref.target("r")),
      ],
    ),
  },
  "Two-Headed Hunter": {},
  "Twice the Rage": { spell: spell([target.creature()], [fx.pump(ref.target(), 0, 0, ["doubleStrike"])]) },
  "Unruly Catapult": {
    abilities: [
      activated({ tap: true, effects: [fx.damage(1, ref.eachOpponent)], label: "1 damage to each opponent" }),
      triggered(when.castSpell("you", INSTANT_SORCERY), [fx.untap(ref.self)], { label: "Untaps" }),
    ],
  },
  "Virtue of Courage": {
    abilities: [
      triggered(
        when.dealsDamage({}, { noncombatOnly: true, to: { players: "opponent" }, anySourceYouControl: true }),
        fx.may(
          "Exile that many cards from the top of your library?",
          fx.exileTop(ref.you, amount.eventAmount, "v"),
          fx.grantPlay(ref.stored("v")),
        ),
        { label: "Exile that many cards; playable this turn" },
      ),
    ],
  },
  "Embereth Blaze": { spell: spell([target.any()], [fx.damage(2, ref.target())]) },
  "Witch's Mark": {
    spell: spell([target.upTo(1, yourCreature())], [...mayRummage(2), ...createRole(WICKED_ROLE)]),
  },
  "Witchstalker Frenzy": {
    // {1} less for each creature that attacked this turn (distinct creatures of the turn log).
    costReduction: { generic: amount.turnEvents({ event: "attack", distinct: "object" }) },
    spell: spell([target.creature()], [fx.damage(5, ref.target())]),
  },
  "Decadent Dragon": {
    abilities: [triggered(when.attacksSelf, [fx.createTokens(TREASURE)], { label: "A Treasure token" })],
  },
  "Expensive Taste": {
    spell: spell(
      [target.player("t", "opponent")],
      [fx.exileTop(ref.target(), 2, "e", "you"), fx.grantPlay(ref.stored("e"), { forever: true })],
    ),
  },
  "Imodane's Recruiter": {
    abilities: [
      triggered(when.entersSelf, [fx.pumpAll(CREATURE_YOU_CONTROL, 1, 0, ["haste"])], {
        label: "Your creatures get +1/+0 and gain haste",
      }),
    ],
  },
  "Train Troops": { spell: spell([], [fx.createTokens(KNIGHT_VIGILANCE, 2)]) },
  "Picnic Ruiner": {
    abilities: [
      triggered(when.attacksSelf, [fx.pump(ref.self, 0, 0, ["doubleStrike"])], {
        condition: cond.ferocious,
        label: "Power 4 or greater: double strike",
      }),
    ],
  },
  "Stolen Goodies": {
    spell: spell([target.between(1, 3, yourCreature())], [fx.countersDivided(3, ref.target())]),
  },
  "Become Brutes": {
    // "One or two target creatures": two "target" words, the second optional and distinct from the first.
    spell: spell(
      [target.creature("a"), { ...target.optional(target.creature("b")), otherThan: ["a"] }],
      [
        fx.pump(ref.target("a"), 0, 0, ["haste"]),
        fx.pump(ref.target("b"), 0, 0, ["haste"]),
        ...createRole(MONSTER_ROLE, ref.target("a")),
        ...createRole(MONSTER_ROLE, ref.target("b")),
      ],
    ),
  },
  "Charging Hooligan": {
    abilities: [
      triggered(
        when.attacksSelf,
        [
          fx.pump(ref.self, amount.count({ types: ["Creature"], attacking: true }), 0),
          ...fx.when(cond.battlefieldCount({ subtype: "Rat", attacking: true }, 1), fx.pump(ref.self, 0, 0, ["trample"])),
        ],
        { label: "+1/+0 for each attacking creature; trample if a Rat is attacking" },
      ),
    ],
  },
  "Ogre Chitterlord": {
    abilities: [
      triggered(when.entersSelf, chitterlordEffects, { label: "Two Rats; five Rats or more: +2/+0 to your Rats" }),
      triggered(when.attacksSelf, chitterlordEffects, { label: "Two Rats; five Rats or more: +2/+0 to your Rats" }),
    ],
  },
};
