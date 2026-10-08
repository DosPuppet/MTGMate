/**
 * Edge of Eternities, lot D: the last cards (devour, control of an opponent's turn, linked exiles,
 * copied tokens, filtered doubling, total mana value targets).
 */
import type { CardScript, ObjectFilter } from "@mtgx/engine";
import {
  activated,
  amount,
  CREATURE_YOU_CONTROL,
  cmp,
  cond,
  entersWith,
  eventReplacement,
  fx,
  loyalty,
  modal,
  mode,
  ROBOT,
  ref,
  spell,
  staticAbility,
  target,
  triggered,
  when,
} from "./common";

const CREATURES: ObjectFilter = { types: ["Creature"] };
const ALL_CREATURES = ref.permanentsOf(ref.eachPlayer, CREATURES);
const WITH_P1P1 = { ...CREATURE_YOU_CONTROL, withCounter: "+1/+1" };

/** Mutinous Massacre: destroys the creatures of the chosen parity, then gains control of all creatures. */
const massacre = (parity: "odd" | "even", label: string) =>
  mode(
    label,
    [],
    [
      fx.destroyAll({ ...CREATURES, compare: [cmp.parity(parity)] }),
      fx.gainControl(ALL_CREATURES),
      fx.untap(ALL_CREATURES),
      fx.pumpAll(CREATURES, 0, 0, ["haste"]),
    ],
  );

export const UNIQUE: Record<string, CardScript> = {
  // --- White -----------------------------------------------------------------
  "Pinnacle Starcage": {
    abilities: [
      triggered(
        when.entersSelf,
        [fx.exileUntilLeaves(ref.permanentsOf(ref.eachPlayer, { types: ["Artifact", "Creature"], maxManaValue: 2 }))],
        { label: "Exile the artifacts and creatures with mana value 2 or less" },
      ),
      activated({
        mana: "{6}{W}{W}",
        effects: [
          fx.moveTo(ref.exiledWith, { to: "graveyard" }, { name: "g" }),
          fx.createTokens(ROBOT, amount.v("g")),
          fx.sacrificeIt(ref.self),
        ],
        label: "The exiled cards into the graveyard, a Robot for each card",
      }),
    ],
  },
  "Scout for Survivors": {
    spell: spell(
      [
        {
          ...target.upTo(3, target.cardInGraveyard("t", CREATURES, "you", "creature card")),
          maxTotalManaValue: 3,
        },
      ],
      [fx.toBattlefield(ref.target(), { counters: { kind: "+1/+1", n: 1 } })],
    ),
  },

  // --- Blue ------------------------------------------------------------------
  "Moonlit Meditation": {
    enchant: {
      filter: { types: ["Artifact", "Creature"], controller: "you" },
      label: "artifact or creature you control",
    },
    abilities: [
      eventReplacement({
        event: "tokens",
        to: "you",
        instead: { copyOfAttached: true, firstEachTurn: true, may: true },
        modify: {},
        label: "First tokens of the turn: copies",
      }),
    ],
  },

  // --- Black -----------------------------------------------------------------
  "Chorale of the Void": {
    enchant: { filter: { types: ["Creature"], controller: "you" }, label: "creature you control" },
    abilities: [
      triggered(
        when.attacks({ types: ["Creature"], attached: "host" }),
        [fx.toBattlefield(ref.target(), { underYourControl: true, tapped: true, attacking: true })],
        {
          targets: [
            target.of(
              ref.defendingPlayer,
              target.cardInGraveyard("t", CREATURES, "any", "creature card from the defending player's graveyard"),
            ),
          ],
          label: "A creature from the defending player's graveyard, attacking",
        },
      ),
      triggered(when.yourEndStep, [fx.sacrificeIt(ref.self)], {
        condition: cond.not(cond.void),
        label: "Without void: sacrifice it",
      }),
    ],
  },
  "Sothera, the Supervoid": {
    abilities: [
      triggered(
        when.dies(CREATURE_YOU_CONTROL),
        [fx.sacrifice(ref.eachOpponent, CREATURES, 1, { to: "exile", store: "x" }), fx.link(ref.stored("x"))],
        { label: "Each opponent exiles a creature they control" },
      ),
      triggered(
        when.yourEndStep,
        [
          fx.sacrificeIt(ref.self),
          fx.pickFromZone(
            "graveyard",
            CREATURES,
            { to: "battlefield", underYourControl: true, counters: { kind: "+1/+1", n: 2 } },
            { pool: ref.linked, prompt: "Choose a creature card exiled with Sothera" },
          ),
        ],
        { condition: cond.playerWithoutCreatures, label: "A player without creatures: sacrifice it, return a creature" },
      ),
    ],
  },
  "Xu-Ifit, Osteoharmonist": {
    abilities: [
      activated({
        tap: true,
        sorcerySpeed: true,
        targets: [target.cardInGraveyard("t", CREATURES, "you", "creature card")],
        effects: [
          fx.moveTo(ref.target(), { to: "battlefield" }, { name: "x" }),
          fx.modify(ref.stored("x"), { addSubtypes: ["Skeleton"], loseAllAbilities: true }, "permanent"),
        ],
        label: "Return a creature (Skeleton with no abilities)",
      }),
    ],
  },
  "Zero Point Ballad": {
    spell: spell(
      [],
      [
        fx.destroyAll({ ...CREATURES, compare: [cmp.toughness("<=", amount.x)] }, "z"),
        fx.loseLife(amount.x),
        fx.when(
          cond.xAtLeast(6),
          fx.pickFromZone(
            "graveyard",
            CREATURES,
            { to: "battlefield", underYourControl: true },
            { pool: ref.stored("z"), prompt: "Choose a destroyed creature to return" },
          ),
        ),
      ],
    ),
  },

  // --- Red -------------------------------------------------------------------
  "Terminal Velocity": {
    spell: spell(
      [],
      [
        fx.pickFromZone(
          "hand",
          { types: ["Artifact", "Creature"] },
          { to: "battlefield" },
          { min: 0, store: "v", prompt: "You may put an artifact or creature card onto the battlefield" },
        ),
        fx.modify(
          ref.stored("v"),
          {
            addKeywords: ["haste"],
            addAbilities: [
              triggered(when.leavesSelf, [fx.damageAll(amount.manaValueOf(ref.self), CREATURES)], {
                label: "Damage equal to its mana value to each creature",
              }),
              triggered(when.yourEndStep, [fx.sacrificeIt(ref.self)], { label: "Sacrifice it" }),
            ],
          },
          "permanent",
        ),
      ],
    ),
  },

  // --- Green -----------------------------------------------------------------
  "Close Encounter": {
    // Additional cost: a creature you control or a warped creature card you own in exile.
    additionalCost: { behold: { filter: CREATURES, required: true, exiled: { warped: true, own: true, filter: CREATURES } } },
    spell: spell([target.creature("t")], [fx.damage(amount.powerOf(ref.cost("beheld")), ref.target("t"))]),
  },
  "Famished Worldsire": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.lookAtTop(amount.powerOf(ref.self), {
            filter: { types: ["Land"] },
            count: amount.powerOf(ref.self),
            to: { to: "battlefield", tapped: true },
            rest: "top",
          }),
          fx.shuffle(),
        ],
        { label: "Lands among the top X cards" },
      ),
    ],
  },
  "Loading Zone": {
    abilities: [
      eventReplacement({
        event: "counters",
        to: "yourSide",
        toFilter: { anyOf: [{ types: ["Creature"] }, { subtype: "Spacecraft" }, { subtype: "Planet" }] },
        modify: { times: 2 },
        label: "Counters doubled (creatures, Spacecraft, Planets)",
      }),
    ],
  },

  // --- Multicolor ------------------------------------------------------------
  "Alpharael, Dreaming Acolyte": {
    abilities: [
      triggered(when.entersSelf, [fx.draw(2), fx.discard(2, ref.you, { unlessFilter: { types: ["Artifact"] } })], {
        label: "Draw two, discard two (or an artifact)",
      }),
      staticAbility("self", { addKeywords: ["deathtouch"] }, { condition: cond.yourTurn, label: "Deathtouch during your turn" }),
    ],
  },
  "Dyadrine, Synthesis Amalgam": {
    abilities: [
      entersWith({ counters: amount.manaSpent, label: "+1/+1 counters = mana spent" }),
      triggered(
        when.attackWith(1),
        // The player chooses the two creatures; two with a counter are needed to "do so".
        fx.when(
          cond.controls(WITH_P1P1, 2),
          fx.may(
            "Remove a +1/+1 counter from two of your creatures?",
            fx.chooseAmong(ref.permanentsOf(ref.you, WITH_P1P1), ref.you, "d1", {
              prompt: "First creature to remove a +1/+1 counter from",
            }),
            fx.chooseAmong(ref.stored("d1Rest"), ref.you, "d2", { prompt: "Second creature to remove a +1/+1 counter from" }),
            fx.removeCounters(ref.stored("d1"), 1, "+1/+1"),
            fx.removeCounters(ref.stored("d2"), 1, "+1/+1"),
            fx.draw(1),
            fx.createTokens(ROBOT),
          ),
        ),
        { label: "Remove two +1/+1 counters: draw and 2/2 Robot" },
      ),
    ],
  },
  "Mutinous Massacre": {
    spell: modal(massacre("odd", "Odd mana value"), massacre("even", "Even mana value")),
  },
  "Ragost, Deft Gastronaut": {
    abilities: [
      staticAbility(
        { types: ["Artifact"], controller: "you" },
        {
          addSubtypes: ["Food"],
          addAbilities: [activated({ mana: "{2}", tap: true, sacrifice: true, effects: [fx.gainLife(3)], label: "+3 life" })],
        },
        { label: "Your artifacts are Foods" },
      ),
      activated({
        mana: "{1}",
        tap: true,
        sacrificeOther: { filter: { subtype: "Food" } },
        effects: [fx.damage(3, ref.eachOpponent)],
        label: "3 damage to each opponent",
      }),
      triggered(when.step("end", "any"), [fx.untap(ref.self)], {
        condition: cond.lifeGainedAtLeast(1),
        label: "You gained life: untap it",
      }),
    ],
  },
  "Singularity Rupture": {
    // "Any number of target players".
    spell: spell([target.upTo(99, target.player("t"))], [fx.destroyAll(CREATURES), fx.millHalf(ref.target())]),
  },

  // --- Colorless -------------------------------------------------------------
  "Anticausal Vestige": {
    abilities: [
      triggered(
        when.leavesSelf,
        [
          fx.draw(1),
          fx.pickFromZone(
            "hand",
            { permanent: true },
            { to: "battlefield", tapped: true },
            {
              min: 0,
              maxManaValue: amount.count({ types: ["Land"], controller: "you" }),
              prompt: "You may put a permanent card (mana value ≤ your lands) onto the battlefield",
            },
          ),
        ],
        { label: "Draw, then a permanent from your hand" },
      ),
    ],
  },
  "Tezzeret, Cruel Captain": {
    abilities: [
      triggered(when.enters({ types: ["Artifact"], controller: "you" }), [fx.counters(ref.self, "loyalty", 1)], {
        label: "A loyalty counter",
      }),
      loyalty(0, {
        targets: [target.permanent("t", ["Artifact", "Creature"], {}, "artifact or creature")],
        effects: [
          fx.untap(ref.target()),
          fx.when(
            cond.targetMatches("t", { types: ["Artifact"], anyOf: [{ types: ["Creature"] }] }),
            fx.addCounters(ref.target(), 1),
          ),
        ],
        label: "Untap an artifact or creature",
      }),
      loyalty(-3, {
        effects: [fx.search({ types: ["Artifact"], maxManaValue: 1 })],
        label: "Search for an artifact with mana value 1 or less",
      }),
      loyalty(-7, {
        effects: [
          fx.emblem(
            "Tezzeret",
            "At the beginning of combat on your turn, put three +1/+1 counters on target artifact you control. If it's not a creature, it becomes a 0/0 Robot artifact creature.",
            [
              triggered(
                when.step("beginCombat"),
                [
                  fx.addCounters(ref.target(), 3),
                  fx.when(
                    cond.not(cond.targetMatches("t", CREATURES)),
                    fx.modify(
                      ref.target(),
                      { addTypes: ["Creature"], addSubtypes: ["Robot"], setPower: 0, setToughness: 0 },
                      "permanent",
                    ),
                  ),
                ],
                {
                  targets: [target.permanent("t", ["Artifact"], { controller: "you" }, "artifact you control")],
                  label: "Three +1/+1 counters on an artifact",
                },
              ),
            ],
          ),
        ],
        label: "Emblem",
      }),
    ],
  },
  "The Dominion Bracelet": {
    abilities: [
      staticAbility(
        "attached",
        {
          power: 1,
          toughness: 1,
          addAbilities: [
            activated({
              mana: "{15}",
              grantor: "exile",
              sorcerySpeed: true,
              targets: [target.player("t", "opponent")],
              effects: [fx.controlNextTurn(ref.target())],
              // "This ability costs {X} less to activate, where X is this creature's power."
              reduction: { generic: amount.powerOf(ref.self) },
              label: "Exile The Dominion Bracelet: control the opponent during their next turn",
            }),
          ],
        },
        { label: '+1/+1 and "{15}, Exile The Dominion Bracelet: control an opponent"' },
      ),
    ],
  },
};
