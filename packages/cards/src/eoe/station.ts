/**
 * Edge of Eternities — station (702.184): Spacecraft, Planets and the cards that refer to them.
 * The keywords of the "N+" thresholds are read from the text; `stationAbilities` describes the other abilities.
 */
import type { CardScript, ManaAbilityDef } from "@mtgx/engine";
import {
  activated,
  amount,
  CREATURE_OR_SPACECRAFT,
  CREATURE_YOU_CONTROL,
  cond,
  entersWith,
  fx,
  manaAbility,
  modal,
  mode,
  powerFor,
  ROBOT,
  ref,
  spell,
  staticAbility,
  target,
  triggered,
  when,
} from "./common";

const MULTICOLORED_YOU = { controller: "you" as const, multicolored: true, permanent: true };
const SPACECRAFT_OR_PLANET = { anyOf: [{ subtype: "Spacecraft" }, { subtype: "Planet" }], controller: "you" as const };

/** Planet: enters tapped, "{T}: Add [color]". */
const planet = (color: "W" | "U" | "B" | "R" | "G", stationAbilities: CardScript["stationAbilities"]): CardScript => ({
  abilities: [entersWith({ tapped: true }), manaAbility(color)],
  stationAbilities,
});

export const STATION: Record<string, CardScript> = {
  // --- Spacecraft --------------------------------------------------------------
  "Atmospheric Greenhouse": {
    abilities: [
      triggered(when.entersSelf, [fx.addCountersAll(CREATURE_YOU_CONTROL, 1)], { label: "+1/+1 counter on your creatures" }),
    ],
  },
  "Debris Field Crusher": {
    abilities: [triggered(when.entersSelf, [fx.damage(3, ref.target())], { targets: [target.any()], label: "3 damage" })],
    stationAbilities: { 8: [activated({ mana: "{1}{R}", effects: [fx.pump(ref.self, 2, 0)], label: "+2/+0" })] },
  },
  "Dawnsire, Sunstar Dreadnought": {
    stationAbilities: {
      10: [
        triggered(when.attackWith(1), [fx.damage(100, ref.target())], {
          targets: [target.upTo(1, target.creatureOrPlaneswalker("t"))],
          label: "100 damage",
        }),
      ],
    },
  },
  "Entropic Battlecruiser": {
    stationAbilities: {
      1: [triggered(when.discard("opponent"), [fx.loseLife(3, ref.eventPlayer)], { label: "The opponent loses 3 life" })],
      8: [
        triggered(
          when.attacksSelf,
          [
            // "Each opponent who can't [discard] loses 3 life": empty hand before the discard.
            fx.when(cond.not(cond.amountAtLeast(amount.countIn("hand", {}, "opponents"), 1)), fx.loseLife(3, ref.eachOpponent)),
            fx.discard(1, ref.eachOpponent),
          ],
          { label: "Each opponent discards" },
        ),
      ],
    },
  },
  "Extinguisher Battleship": {
    abilities: [
      triggered(when.entersSelf, [fx.destroy(ref.target()), fx.damageAll(4, { types: ["Creature"] })], {
        targets: [
          target.permanent("t", ["Artifact", "Enchantment", "Land", "Planeswalker", "Battle"], {}, "noncreature permanent"),
        ],
        label: "Destroy, 4 damage to each creature",
      }),
    ],
  },
  "Fell Gravship": {
    abilities: [
      triggered(
        when.entersSelf,
        [fx.mill(3), fx.pickFromZone("graveyard", CREATURE_OR_SPACECRAFT, { to: "hand" }, { count: 1, min: 1 })],
        { label: "Mill 3, return a creature or Spacecraft" },
      ),
    ],
  },
  "Galvanizing Sawship": {},
  "Infinite Guideline Station": {
    abilities: [
      triggered(when.entersSelf, [fx.createTappedTokens(ROBOT, amount.count(MULTICOLORED_YOU))], {
        label: "A Robot for each multicolored permanent",
      }),
    ],
    stationAbilities: {
      12: [
        triggered(when.attacksSelf, [fx.draw(amount.count(MULTICOLORED_YOU))], {
          label: "A card for each multicolored permanent",
        }),
      ],
    },
  },
  "Larval Scoutlander": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.sacrifice(ref.you, { anyOf: [{ types: ["Land"] }, { subtype: "Lander" }] }, 1, { optional: true, store: "s" }),
          fx.when(cond.v("s"), fx.search({ types: ["Land"], basic: true }, { to: "battlefield", tapped: true }, 2)),
        ],
        { label: "Sacrifice a land or a Lander: two basic lands" },
      ),
    ],
  },
  "Lumen-Class Frigate": {
    stationAbilities: {
      2: [
        staticAbility(
          { ...CREATURE_YOU_CONTROL, other: true },
          { power: 1, toughness: 1 },
          { label: "Your other creatures +1/+1" },
        ),
      ],
    },
  },
  "Pinnacle Kill-Ship": {
    abilities: [
      triggered(when.entersSelf, [fx.damage(10, ref.target())], {
        targets: [target.upTo(1, target.creature("t"))],
        label: "10 damage",
      }),
    ],
  },
  "Rescue Skiff": {
    abilities: [
      triggered(when.entersSelf, [fx.toBattlefield(ref.target())], {
        targets: [target.cardInGraveyard("t", { types: ["Creature", "Enchantment"] }, "you", "creature or enchantment card")],
        label: "Return a creature or enchantment",
      }),
    ],
  },
  "Sledge-Class Seedship": {
    stationAbilities: {
      7: [
        triggered(
          when.attacksSelf,
          [
            fx.pickFromZone(
              "hand",
              { types: ["Creature"] },
              { to: "battlefield" },
              { count: 1, min: 0, prompt: "Creature to put onto the battlefield" },
            ),
          ],
          { label: "A creature from your hand onto the battlefield" },
        ),
      ],
    },
  },
  "Specimen Freighter": {
    abilities: [
      triggered(when.entersSelf, [fx.bounce(ref.target())], {
        targets: [target.upTo(2, target.creature("t", { notSubtype: "Spacecraft" }))],
        label: "Return up to two creatures",
      }),
    ],
    stationAbilities: {
      9: [triggered(when.attacksSelf, [fx.mill(4, ref.defendingPlayer)], { label: "The defending player mills 4" })],
    },
  },
  "Susurian Dirgecraft": {
    abilities: [
      triggered(when.entersSelf, [fx.sacrifice(ref.eachOpponent, { types: ["Creature"], token: false })], {
        label: "Each opponent sacrifices a creature",
      }),
    ],
  },
  "Synthesizer Labship": {
    stationAbilities: {
      2: [
        triggered(
          when.yourCombat,
          [
            fx.modify(ref.target(), {
              addTypes: ["Artifact", "Creature"],
              setPower: 2,
              setToughness: 2,
              addKeywords: ["flying"],
            }),
          ],
          {
            targets: [target.upTo(1, target.permanent("t", ["Artifact"], { controller: "you", other: true }, "other artifact"))],
            label: "An artifact becomes a 2/2 flying creature",
          },
        ),
      ],
    },
  },
  "The Eternity Elevator": {
    abilities: [manaAbility("C", 3)],
    stationAbilities: {
      20: [
        {
          ...manaAbility(["W", "U", "B", "R", "G"]),
          amountOf: { kind: "countersOn", ref: { kind: "self" }, counter: "charge" },
        } satisfies ManaAbilityDef,
      ],
    },
  },
  "The Seriema": {
    abilities: [
      triggered(when.entersSelf, [fx.search({ types: ["Creature"], legendary: true })], {
        label: "Search for a legendary creature",
      }),
    ],
    stationAbilities: {
      7: [
        staticAbility(
          { types: ["Creature"], controller: "you", legendary: true, tapped: true, other: true },
          { addKeywords: ["indestructible"] },
          { label: "Your other tapped legends: indestructible" },
        ),
      ],
    },
  },
  "Uthros Scanship": {
    abilities: [triggered(when.entersSelf, [fx.draw(2), fx.discard(1)], { label: "Draw two cards, discard one" })],
  },
  "Warmaker Gunship": {
    abilities: [
      triggered(when.entersSelf, [fx.damage(amount.count({ types: ["Artifact"], controller: "you" }), ref.target())], {
        targets: [target.creature("t", { controller: "opponent" })],
        label: "Damage equal to your artifacts",
      }),
    ],
  },
  "Wedgelight Rammer": { abilities: [triggered(when.entersSelf, [fx.createTokens(ROBOT)], { label: "2/2 Robot" })] },
  "Wurmwall Sweeper": { abilities: [triggered(when.entersSelf, [fx.surveil(2)], { label: "Surveil 2" })] },

  // --- Planets ----------------------------------------------------------------
  "Adagia, Windswept Bastion": planet("W", {
    12: [
      activated({
        mana: "{3}{W}",
        tap: true,
        sorcerySpeed: true,
        targets: [
          target.permanent("t", ["Artifact", "Enchantment"], { controller: "you" }, "artifact or enchantment you control"),
        ],
        effects: [fx.copyToken(ref.target(), { legendary: true })],
        label: "Legendary copy",
      }),
    ],
  }),
  "Evendo, Waking Haven": planet("G", {
    12: [
      activated({
        mana: "{G}",
        tap: true,
        effects: [fx.addManaTimes(amount.count(CREATURE_YOU_CONTROL), "G")],
        label: "{G} for each creature",
      }),
    ],
  }),
  "Kavaron, Memorial World": planet("R", {
    12: [
      activated({
        mana: "{1}{R}",
        tap: true,
        sacrificeOther: { filter: { types: ["Land"] } },
        effects: [fx.createTokens(ROBOT), fx.pumpAll(CREATURE_YOU_CONTROL, 1, 0, ["haste"])],
        label: "2/2 Robot, your creatures +1/+0 and haste",
      }),
    ],
  }),
  "Susur Secundi, Void Altar": planet("B", {
    12: [
      activated({
        mana: "{1}{B}",
        tap: true,
        payLife: 2,
        sorcerySpeed: true,
        sacrificeOther: { filter: { types: ["Creature"] } },
        effects: [fx.draw(amount.powerOf(ref.costSacrificed))],
        label: "Draw as many as its power",
      }),
    ],
  }),
  "Uthros, Titanic Godcore": planet("U", {
    12: [
      activated({
        mana: "{U}",
        tap: true,
        effects: [fx.addManaTimes(amount.count({ types: ["Artifact"], controller: "you" }), "U")],
        label: "{U} for each artifact",
      }),
    ],
  }),

  // --- Cards that refer to station --------------------------------------------
  "Drill Too Deep": {
    spell: modal(
      mode(
        "Five charge counters",
        [{ id: "t", label: "Spacecraft or Planet you control", filter: { objects: SPACECRAFT_OR_PLANET } }],
        [fx.counters(ref.target(), "charge", 5)],
      ),
      mode("Destroy an artifact", [target.permanent("t", ["Artifact"], {}, "artifact")], [fx.destroy(ref.target())]),
    ),
  },
  "Pulsar Squadron Ace": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.lookAtTop(5, { filter: { subtype: "Spacecraft" }, count: 1, rest: "bottom", store: "n" }),
          fx.when(cond.not(cond.v("n")), fx.addCounters(ref.self, 1)),
        ],
        { label: "Search for a Spacecraft, otherwise +1/+1 counter" },
      ),
    ],
  },
  "Systems Override": {
    spell: spell(
      [target.permanent("t", ["Artifact", "Creature"], {}, "artifact or creature")],
      [
        fx.gainControl(ref.target()),
        fx.untap(ref.target()),
        fx.pump(ref.target(), 0, 0, ["haste"]),
        ...fx.when(cond.targetMatches("t", { subtype: "Spacecraft" }), [
          fx.counters(ref.target(), "charge", 10),
          fx.delayed([fx.counters(ref.target("s"), "charge", -10)], { s: ref.target() }),
        ]),
      ],
    ),
  },
  "Tapestry Warden": {
    abilities: [
      staticAbility(
        CREATURE_YOU_CONTROL,
        { addPowerRules: [{ ...powerFor.combatToughness, uses: ["combatDamage", "station"] }] },
        { label: "Damage and station by toughness if it is greater" },
      ),
    ],
  },
};
