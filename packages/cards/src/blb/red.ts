/** Bloomburrow — red cards. */
import { msg } from "@mtgx/engine";
import {
  activated,
  amount,
  type CardScript,
  CREATURE_YOU_CONTROL,
  cond,
  costReducer,
  entersWith,
  eventReplacement,
  expend,
  fx,
  graveyardReplacement,
  kin,
  modal,
  mode,
  pawprint,
  playerStatic,
  ref,
  SWORD,
  spell,
  staticAbility,
  TREASURE,
  target,
  targetObj,
  triggered,
  valiant,
  when,
} from "./common";

const NONCREATURE = { notTypes: ["Creature" as const] };
/** "You may discard a card. If you do, draw a card." */
const mayRummage = (prompt = "Discard a card to draw?") =>
  fx.may(prompt, fx.discard(1, ref.you, { store: "d" }), ...fx.when(cond.v("d"), fx.draw(1)));

export const RED: Record<string, CardScript> = {
  "Agate Assault": {
    spell: modal(
      mode(
        "4 damage to a creature (exiled if it dies)",
        [target.creature()],
        [fx.exileIfDies(ref.target()), fx.damage(4, ref.target())],
      ),
      mode("Exiles an artifact", [target.permanent("t", ["Artifact"], {}, "artifact")], [fx.exile(ref.target())]),
    ),
  },
  "Alania's Pathmaker": {
    abilities: [triggered(when.entersSelf, [fx.impulse(1, "yourNextTurn")], { label: "Exiles the top card (playable)" })],
  },
  "Artist's Talent": {
    abilities: [triggered(when.castSpell("you", NONCREATURE), mayRummage(), { label: "Discard, then draw a card" })],
    classLevels: [
      [costReducer(NONCREATURE, 1, "Noncreature spells cost {1} less")],
      [
        eventReplacement({
          event: "damage",
          source: { controller: "you" },
          to: "opponentSide",
          combat: false,
          modify: { add: 2 },
          label: "Noncombat damage to opponents +2",
        }),
      ],
    ],
  },
  "Blacksmith's Talent": {
    abilities: [triggered(when.entersSelf, [fx.createTokens(SWORD)], { label: "Sword (Equipment)" })],
    classLevels: [
      [
        triggered(when.yourCombat, [fx.attach(ref.target("c"), ref.target("e"))], {
          targets: [
            targetObj("e", { subtype: "Equipment", controller: "you" }, "Equipment you control"),
            target.upTo(1, target.creature("c", { controller: "you" })),
          ],
          label: "Attaches an Equipment",
        }),
      ],
      [
        staticAbility(
          { types: ["Creature"], controller: "you", equipped: true },
          { addKeywords: ["doubleStrike", "haste"] },
          { condition: cond.yourTurn, label: "Double strike and haste" },
        ),
      ],
    ],
  },
  "Blooming Blast": {
    spell: spell(
      [target.creature()],
      [fx.damage(2, ref.target()), ...fx.when(cond.gift, fx.damage(3, ref.controllerOf(ref.target())))],
    ),
  },
  "Brambleguard Captain": {
    abilities: [
      triggered(when.yourCombat, [fx.pump(ref.target(), amount.powerOf(ref.self), 0)], {
        targets: [target.creature("t", { controller: "you" })],
        label: "+X/+0 (X = its power)",
      }),
    ],
  },
  "Brazen Collector": {
    abilities: [triggered(when.attacksSelf, [fx.addManaUntilEndOfTurn("R")], { label: "Adds {R}" })],
  },
  "Byway Barterer": {
    abilities: [
      expend(
        4,
        fx.may("Discard your hand to draw two cards?", fx.discard(amount.cardsIn("hand"), ref.you, { store: "d" }), fx.draw(2)),
        { label: "Discard your hand, draw two cards" },
      ),
    ],
  },
  "Conduct Electricity": {
    spell: spell(
      [target.creature("t"), target.upTo(1, targetObj("u", { types: ["Creature"], token: true }, "creature token"))],
      [fx.damage(6, ref.target()), fx.damage(2, ref.target("u"))],
    ),
  },
  "Coruscation Mage": {
    abilities: [
      triggered(when.castSpell("you", NONCREATURE), [fx.damage(1, ref.eachOpponent)], {
        label: "1 damage to each opponent",
      }),
    ],
  },
  "Dragonhawk, Fate's Tempest": {
    abilities: [
      ...[when.entersSelf, when.attacksSelf].map((w) =>
        triggered(
          w,
          [
            fx.exileTop(ref.you, amount.count({ types: ["Creature"], controller: "you", minPower: 4 }), "d"),
            // "Until your next end step": this turn's, if it is yours.
            fx.grantPlay(ref.stored("d"), { untilYourNextEndStep: true }),
            fx.delayedAt(
              "yourEndStep",
              [fx.damage(amount.plus(amount.inExile(ref.target("d")), amount.inExile(ref.target("d"))), ref.eachOpponent)],
              { d: ref.stored("d") },
            ),
          ],
          { label: "Exiles X cards (playable); 2 damage for each card left in exile" },
        ),
      ),
    ],
  },
  "Emberheart Challenger": {
    abilities: [valiant([fx.impulse(1)], { label: "Exiles the top card (playable this turn)" })],
  },
  "Festival of Embers": {
    abilities: [
      playerStatic({
        playFrom: { zone: "graveyard", filter: { types: ["Instant", "Sorcery"] }, what: "spells", payLife: 1 },
        condition: cond.yourTurn,
        label: "Instants and sorceries from the graveyard (1 life)",
      }),
      graveyardReplacement({ graveyardOf: "you", label: "Graveyard exiled" }),
      activated({ mana: "{1}{R}", sacrifice: true, effects: [], label: "Sacrifice this enchantment" }),
    ],
  },
  "Flamecache Gecko": {
    abilities: [
      triggered(when.entersSelf, [fx.addMana("B", "R")], { condition: cond.opponentLostLife, label: "Adds {B}{R}" }),
      activated({ mana: "{1}{R}", discard: 1, effects: [fx.draw(1)], label: "Discard: draw" }),
    ],
  },
  "Frilled Sparkshooter": {
    abilities: [entersWith({ counters: 1, condition: cond.opponentLostLife, label: "A +1/+1 counter" })],
  },
  "Harnesser of Storms": {
    abilities: [
      triggered(
        when.castSpell("you", { anyOf: [NONCREATURE, { subtype: "Otter" }] }),
        fx.may("Exile the top card (playable this turn)?", fx.impulse(1)),
        { oncePerTurn: true, label: "Exiles the top card" },
      ),
    ],
  },
  "Heartfire Hero": {
    abilities: [
      valiant([fx.addCounters(ref.self, 1)], { label: "+1/+1 counter" }),
      triggered(when.diesSelf, [fx.damage(amount.lkiPower, ref.eachOpponent)], { label: "Damage equal to its power" }),
    ],
  },
  "Hearthborn Battler": {
    abilities: [
      triggered({ on: "castSpell", by: "any", nth: 2 }, [fx.damage(2, ref.target())], {
        targets: [target.player("t", "opponent")],
        label: "A player's second spell: 2 damage",
      }),
    ],
  },
  "Hired Claw": {
    abilities: [
      triggered(when.attackWith(1, { subtype: "Lizard" }), [fx.damage(1, ref.target())], {
        targets: [target.player("t", "opponent")],
        label: "1 damage to an opponent",
      }),
      activated({
        mana: "{1}{R}",
        oncePerTurn: true,
        activationCondition: cond.opponentLostLife,
        effects: [fx.addCounters(ref.self, 1)],
        label: "+1/+1 counter",
      }),
    ],
  },
  "Hoarder's Overflow": {
    abilities: [
      triggered(when.entersSelf, [fx.counters(ref.self, "stash", 1)], { label: "Stash counter" }),
      expend(4, [fx.counters(ref.self, "stash", 1)], { label: "Stash counter" }),
      activated({
        mana: "{1}{R}",
        sacrifice: true,
        effects: [fx.discard(amount.cardsIn("hand")), fx.draw(amount.lkiCounters("stash"))],
        label: "Discard your hand, draw",
      }),
    ],
  },
  "Kindlespark Duo": {
    abilities: [
      activated({
        tap: true,
        targets: [target.player("t", "opponent")],
        effects: [fx.damage(1, ref.target())],
        label: "1 damage to an opponent",
      }),
      triggered(when.castSpell("you", NONCREATURE), [fx.untap(ref.self)], { label: "Untaps" }),
    ],
  },
  "Manifold Mouse": {
    abilities: [
      // The target on triggering, the "your choice" keyword on resolution (608.2d).
      triggered(
        when.yourCombat,
        fx.yourChoice("the targeted Mouse gains…", "k", [
          { label: msg("ctx:gains|double strike"), effects: [fx.pump(ref.target(), 0, 0, ["doubleStrike"])] },
          { label: msg("ctx:gains|trample"), effects: [fx.pump(ref.target(), 0, 0, ["trample"])] },
        ]),
        {
          targets: [target.creature("t", { controller: "you", subtype: "Mouse" })],
          label: "A Mouse gains double strike or trample",
        },
      ),
    ],
  },
  "Might of the Meek": {
    spell: spell(
      [target.creature()],
      [
        fx.pump(ref.target(), 0, 0, ["trample"]),
        ...fx.when(cond.controls({ types: ["Creature"], subtype: "Mouse" }), fx.pump(ref.target(), 1, 0)),
        fx.draw(1),
      ],
    ),
  },
  "Playful Shove": { spell: spell([target.any()], [fx.damage(1, ref.target()), fx.draw(1)]) },
  "Rabid Gnaw": {
    spell: spell(
      [
        target.creature("t", { controller: "you" }),
        targetObj("u", { types: ["Creature"], controller: "opponent" }, "creature you don't control"),
      ],
      [fx.pump(ref.target(), 1, 0), fx.damage(amount.powerOf(ref.target()), ref.target("u"), ref.target())],
    ),
  },
  "Raccoon Rallier": {
    abilities: [
      activated({
        tap: true,
        sorcerySpeed: true,
        targets: [target.creature("t", { controller: "you" })],
        effects: [fx.pump(ref.target(), 0, 0, ["haste"])],
        label: "Haste",
      }),
    ],
  },
  "Reptilian Recruiter": {
    abilities: [
      triggered(
        when.entersSelf,
        fx.when(
          cond.any(
            cond.refMatches(ref.target(), { maxPower: 2 }),
            cond.controls({ types: ["Creature"], subtype: "Lizard", other: true }),
          ),
          fx.gainControl(ref.target()),
          fx.untap(ref.target()),
          fx.pump(ref.target(), 0, 0, ["haste"]),
        ),
        { targets: [target.creature()], label: "Gains control of a creature" },
      ),
    ],
  },
  "Roughshod Duo": {
    abilities: [
      expend(4, [fx.pump(ref.target(), 1, 1, ["trample"])], {
        targets: [target.creature("t", { controller: "you" })],
        label: "+1/+1 and trample",
      }),
    ],
  },
  "Sazacap's Brew": {
    additionalCost: { discard: 1 },
    spell: spell(
      [target.player("p"), target.upTo(1, target.creature("t", { controller: "you" }))],
      [fx.draw(2, ref.target("p")), ...fx.when(cond.gift, fx.pump(ref.target(), 2, 0))],
    ),
  },
  "Season of the Bold": {
    spell: pawprint(
      { pips: 1, label: "Tapped Treasure", effects: [fx.createTappedTokens(TREASURE)] },
      {
        pips: 2,
        label: "Exiles the top two cards (playable)",
        effects: [fx.exileTop(ref.you, 2, "b"), fx.grantPlay(ref.stored("b"), { untilYourNextTurn: true })],
      },
      {
        pips: 3,
        label: "Each spell: 2 damage to a creature",
        effects: [
          fx.emblem(
            "Season of the Bold",
            msg("Until the end of your next turn, whenever you cast a spell, 2 damage to up to one target creature."),
            [
              triggered(when.castSpell("you"), [fx.damage(2, ref.target())], {
                targets: [target.upTo(1, target.creature())],
                label: "2 damage to a creature",
              }),
            ],
            false,
            false,
            undefined,
            true,
          ),
        ],
      },
    ),
  },
  "Steampath Charger": {
    abilities: [
      triggered(when.diesSelf, [fx.damage(1, ref.target())], { targets: [target.player()], label: "1 damage to a player" }),
    ],
  },
  Stormsplitter: {
    abilities: [
      triggered(when.castSpell("you", { types: ["Instant", "Sorcery"] }), [fx.copyToken(ref.self, { exileAtEndStep: true })], {
        label: "Copy of this creature (exiled at the end step)",
      }),
    ],
  },
  "Sunspine Lynx": {
    abilities: [
      eventReplacement({
        event: "lifeGain",
        modify: { prevent: true },
        label: "Players can't gain life",
      }),
      playerStatic({ damageUnpreventable: true, label: "Damage can't be prevented" }),
      triggered(
        when.entersSelf,
        fx.forEachPlayer(ref.eachPlayer, (p) => [
          fx.damage(amount.refCount(ref.permanentsOf(p, { types: ["Land"], basic: false })), p),
        ]),
        {
          label: "Damage equal to the nonbasic lands",
        },
      ),
    ],
  },
  "Take Out the Trash": {
    spell: spell(
      [target.creatureOrPlaneswalker()],
      [fx.damage(3, ref.target()), ...fx.when(cond.controls({ types: ["Creature"], subtype: "Raccoon" }), mayRummage())],
    ),
  },
  "Teapot Slinger": {
    abilities: [expend(4, [fx.damage(2, ref.eachOpponent)], { label: "2 damage to each opponent" })],
  },
  "Valley Flamecaller": {
    abilities: [
      eventReplacement({
        event: "damage",
        source: { ...kin(["Lizard", "Mouse", "Otter", "Raccoon"]), controller: "you" },
        modify: { add: 1 },
        label: "Lizards, Mice, Otters and Raccoons: +1 damage",
      }),
    ],
  },
  "Valley Rally": {
    spell: spell(
      [target.upTo(1, target.creature("t", { controller: "you" }))],
      [fx.pumpAll(CREATURE_YOU_CONTROL, 2, 0), ...fx.when(cond.gift, fx.pump(ref.target(), 0, 0, ["firstStrike"]))],
    ),
  },
  "War Squeak": {
    enchant: { filter: { types: ["Creature"] }, label: "creature" },
    abilities: [
      triggered(when.entersSelf, [fx.pump(ref.target(), 0, 0, ["cantBlock"])], {
        targets: [target.creature("t", { controller: "opponent" })],
        label: "Can't block",
      }),
      staticAbility("attached", { power: 1, toughness: 1, addKeywords: ["haste"] }, { label: "+1/+1, haste" }),
    ],
  },
  "Whiskerquill Scribe": {
    abilities: [valiant(mayRummage(), { label: "Discard, then draw a card" })],
  },
  "Wildfire Howl": {
    spell: spell(
      [target.upTo(1, target.any())],
      [...fx.when(cond.gift, fx.damage(1, ref.target())), fx.damageAll(2, { types: ["Creature"] })],
    ),
  },
};
