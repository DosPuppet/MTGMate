/**
 * Edge of Eternities — station (702.184) : Vaisseaux, Planètes et cartes qui en parlent.
 * Les mots-clés des paliers « N+ » sont lus dans le texte ; `stationAbilities` décrit les autres capacités.
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

/** Planète : arrive engagée, « {T} : ajoutez [couleur] ». */
const planet = (color: "W" | "U" | "B" | "R" | "G", stationAbilities: CardScript["stationAbilities"]): CardScript => ({
  abilities: [entersWith({ tapped: true }), manaAbility(color)],
  stationAbilities,
});

export const STATION: Record<string, CardScript> = {
  // --- Vaisseaux ---------------------------------------------------------------
  "Atmospheric Greenhouse": {
    abilities: [
      triggered(when.entersSelf, [fx.addCountersAll(CREATURE_YOU_CONTROL, 1)], { label: "Marqueur +1/+1 sur vos créatures" }),
    ],
  },
  "Debris Field Crusher": {
    abilities: [triggered(when.entersSelf, [fx.damage(3, ref.target())], { targets: [target.any()], label: "3 blessures" })],
    stationAbilities: { 8: [activated({ mana: "{1}{R}", effects: [fx.pump(ref.self, 2, 0)], label: "+2/+0" })] },
  },
  "Dawnsire, Sunstar Dreadnought": {
    stationAbilities: {
      10: [
        triggered(when.attackWith(1), [fx.damage(100, ref.target())], {
          targets: [target.upTo(1, target.creatureOrPlaneswalker("t"))],
          label: "100 blessures",
        }),
      ],
    },
  },
  "Entropic Battlecruiser": {
    stationAbilities: {
      1: [triggered(when.discard("opponent"), [fx.loseLife(3, ref.eventPlayer)], { label: "L'adversaire perd 3 PV" })],
      8: [
        triggered(
          when.attacksSelf,
          [
            // « Chaque adversaire qui ne peut pas [défausser] perd 3 PV » : main vide avant la défausse.
            fx.when(cond.not(cond.amountAtLeast(amount.countIn("hand", {}, "opponents"), 1)), fx.loseLife(3, ref.eachOpponent)),
            fx.discard(1, ref.eachOpponent),
          ],
          { label: "Chaque adversaire défausse" },
        ),
      ],
    },
  },
  "Extinguisher Battleship": {
    abilities: [
      triggered(when.entersSelf, [fx.destroy(ref.target()), fx.damageAll(4, { types: ["Creature"] })], {
        targets: [
          target.permanent("t", ["Artifact", "Enchantment", "Land", "Planeswalker", "Battle"], {}, "permanent non-créature"),
        ],
        label: "Détruisez, 4 blessures à chaque créature",
      }),
    ],
  },
  "Fell Gravship": {
    abilities: [
      triggered(
        when.entersSelf,
        [fx.mill(3), fx.pickFromZone("graveyard", CREATURE_OR_SPACECRAFT, { to: "hand" }, { count: 1, min: 1 })],
        { label: "Meulez 3, reprenez une créature ou un Vaisseau" },
      ),
    ],
  },
  "Galvanizing Sawship": {},
  "Infinite Guideline Station": {
    abilities: [
      triggered(when.entersSelf, [fx.createTappedTokens(ROBOT, amount.count(MULTICOLORED_YOU))], {
        label: "Un Robot par permanent multicolore",
      }),
    ],
    stationAbilities: {
      12: [
        triggered(when.attacksSelf, [fx.draw(amount.count(MULTICOLORED_YOU))], { label: "Une carte par permanent multicolore" }),
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
        { label: "Sacrifiez un terrain ou un Lander : deux terrains de base" },
      ),
    ],
  },
  "Lumen-Class Frigate": {
    stationAbilities: {
      2: [
        staticAbility(
          { ...CREATURE_YOU_CONTROL, other: true },
          { power: 1, toughness: 1 },
          { label: "Vos autres créatures +1/+1" },
        ),
      ],
    },
  },
  "Pinnacle Kill-Ship": {
    abilities: [
      triggered(when.entersSelf, [fx.damage(10, ref.target())], {
        targets: [target.upTo(1, target.creature("t"))],
        label: "10 blessures",
      }),
    ],
  },
  "Rescue Skiff": {
    abilities: [
      triggered(when.entersSelf, [fx.toBattlefield(ref.target())], {
        targets: [
          target.cardInGraveyard("t", { types: ["Creature", "Enchantment"] }, "you", "carte de créature ou d'enchantement"),
        ],
        label: "Renvoyez une créature ou un enchantement",
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
              { count: 1, min: 0, prompt: "Créature à mettre sur le champ de bataille" },
            ),
          ],
          { label: "Une créature de votre main sur le champ de bataille" },
        ),
      ],
    },
  },
  "Specimen Freighter": {
    abilities: [
      triggered(when.entersSelf, [fx.bounce(ref.target())], {
        targets: [target.upTo(2, target.creature("t", { notSubtype: "Spacecraft" }))],
        label: "Renvoyez jusqu'à deux créatures",
      }),
    ],
    stationAbilities: { 9: [triggered(when.attacksSelf, [fx.mill(4, ref.defendingPlayer)], { label: "Le défenseur meule 4" })] },
  },
  "Susurian Dirgecraft": {
    abilities: [
      triggered(when.entersSelf, [fx.sacrifice(ref.eachOpponent, { types: ["Creature"], token: false })], {
        label: "Chaque adversaire sacrifie une créature",
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
            targets: [target.upTo(1, target.permanent("t", ["Artifact"], { controller: "you", other: true }, "autre artefact"))],
            label: "Un artefact devient une créature 2/2 volante",
          },
        ),
      ],
    },
  },
  "The Eternity Elevator": {
    abilities: [manaAbility("C", 3)],
    stationAbilities: {
      20: [{ ...manaAbility(["W", "U", "B", "R", "G"]), amountCounters: "charge" } satisfies ManaAbilityDef],
    },
  },
  "The Seriema": {
    abilities: [
      triggered(when.entersSelf, [fx.search({ types: ["Creature"], legendary: true })], {
        label: "Cherchez une créature légendaire",
      }),
    ],
    stationAbilities: {
      7: [
        staticAbility(
          { types: ["Creature"], controller: "you", legendary: true, tapped: true, other: true },
          { addKeywords: ["indestructible"] },
          { label: "Vos autres légendes engagées : indestructibles" },
        ),
      ],
    },
  },
  "Uthros Scanship": {
    abilities: [triggered(when.entersSelf, [fx.draw(2), fx.discard(1)], { label: "Piochez deux cartes, défaussez-en une" })],
  },
  "Warmaker Gunship": {
    abilities: [
      triggered(when.entersSelf, [fx.damage(amount.count({ types: ["Artifact"], controller: "you" }), ref.target())], {
        targets: [target.creature("t", { controller: "opponent" })],
        label: "Blessures égales à vos artefacts",
      }),
    ],
  },
  "Wedgelight Rammer": { abilities: [triggered(when.entersSelf, [fx.createTokens(ROBOT)], { label: "Robot 2/2" })] },
  "Wurmwall Sweeper": { abilities: [triggered(when.entersSelf, [fx.surveil(2)], { label: "Surveillance 2" })] },

  // --- Planètes ---------------------------------------------------------------
  "Adagia, Windswept Bastion": planet("W", {
    12: [
      activated({
        mana: "{3}{W}",
        tap: true,
        sorcerySpeed: true,
        targets: [
          target.permanent(
            "t",
            ["Artifact", "Enchantment"],
            { controller: "you" },
            "artefact ou enchantement que vous contrôlez",
          ),
        ],
        effects: [fx.copyToken(ref.target(), { legendary: true })],
        label: "Copie légendaire",
      }),
    ],
  }),
  "Evendo, Waking Haven": planet("G", {
    12: [
      activated({
        mana: "{G}",
        tap: true,
        effects: [fx.addManaTimes(amount.count(CREATURE_YOU_CONTROL), "G")],
        label: "{G} par créature",
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
        label: "Robot 2/2, vos créatures +1/+0 et la célérité",
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
        label: "Piochez autant que sa force",
      }),
    ],
  }),
  "Uthros, Titanic Godcore": planet("U", {
    12: [
      activated({
        mana: "{U}",
        tap: true,
        effects: [fx.addManaTimes(amount.count({ types: ["Artifact"], controller: "you" }), "U")],
        label: "{U} par artefact",
      }),
    ],
  }),

  // --- Cartes qui parlent de station ------------------------------------------
  "Drill Too Deep": {
    spell: modal(
      mode(
        "Cinq marqueurs de charge",
        [{ id: "t", label: "Vaisseau ou Planète que vous contrôlez", filter: { objects: SPACECRAFT_OR_PLANET } }],
        [fx.counters(ref.target(), "charge", 5)],
      ),
      mode("Détruisez un artefact", [target.permanent("t", ["Artifact"], {}, "artefact")], [fx.destroy(ref.target())]),
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
        { label: "Cherchez un Vaisseau, sinon marqueur +1/+1" },
      ),
    ],
  },
  "Systems Override": {
    spell: spell(
      [target.permanent("t", ["Artifact", "Creature"], {}, "artefact ou créature")],
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
        { label: "Blessures et station selon l'endurance si elle est plus grande" },
      ),
    ],
  },
};
