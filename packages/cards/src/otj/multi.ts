/** Outlaws of Thunder Junction — cartes multicolores, incolores et terrains. */
import type { CardScript, ManaType } from "@mtgx/engine";
import {
  ANGEL_3,
  activated,
  amount,
  CREATURE_YOU_CONTROL,
  cond,
  entersWith,
  fx,
  investigate,
  MOUNT_OR_VEHICLE,
  manaAbility,
  mercenary,
  OTHER_CREATURE_YOU_CONTROL,
  OUTLAW_CREATURE,
  OX,
  ref,
  SPIRIT_2,
  spell,
  staticAbility,
  TREASURE,
  target,
  triggered,
  VAMPIRE_ROGUE,
  wardAbility,
  when,
  whileSaddled,
} from "./common";

const NO_HAND_SPELL = cond.not(cond.handSpellThisTurn);
const LEGENDARY_CREATURE_YOU = { types: ["Creature" as const], controller: "you" as const, legendary: true };
const ALL_COLORS: ManaType[] = ["W", "U", "B", "R", "G"];

/** Désert bicolore : arrive engagé, 1 blessure à un adversaire ciblé. */
const desertDual = (a: ManaType, b: ManaType): CardScript => ({
  abilities: [
    entersWith({ tapped: true }),
    triggered(when.entersSelf, [fx.damage(1, ref.target())], { targets: [target.player("t", "opponent")], label: "1 blessure" }),
    manaAbility([a, b]),
  ],
});
/** Terrain rapide : arrive engagé sauf si vous contrôlez deux autres terrains ou moins. */
const fastland = (a: ManaType, b: ManaType): CardScript => ({
  abilities: [entersWith({ tapped: true, condition: cond.controls({ types: ["Land"], other: true }, 3) }), manaAbility([a, b])],
});

export const MULTI: Record<string, CardScript> = {
  // --- Multicolores ----------------------------------------------------------
  "Akul the Unrepentant": {
    abilities: [
      activated({
        sacrificeOther: { filter: { types: ["Creature"], other: true }, count: 3 },
        sorcerySpeed: true,
        oncePerTurn: true,
        effects: [
          fx.pickFromZone(
            "hand",
            { types: ["Creature"] },
            { to: "battlefield" },
            { min: 0, prompt: "Une créature de votre main" },
          ),
        ],
        label: "Une créature de votre main",
      }),
    ],
  },
  "Annie Flash, the Veteran": {
    abilities: [
      triggered(when.entersSelf, [fx.toBattlefield(ref.target(), { tapped: true })], {
        condition: cond.wasCast,
        targets: [target.cardInGraveyard("t", { permanent: true, maxManaValue: 3 }, "you", "carte de permanent")],
        label: "Un permanent de VM 3 ou moins revient engagé",
      }),
      triggered(when.tapsSelf, [fx.exileTop(ref.you, 2, "a"), fx.grantPlay(ref.stored("a"))], {
        label: "Exilez deux cartes, jouables ce tour-ci",
      }),
    ],
  },
  "At Knifepoint": {
    abilities: [
      staticAbility(
        { ...OUTLAW_CREATURE, controller: "you" },
        { addKeywords: ["firstStrike"] },
        { condition: cond.yourTurn, label: "Initiative" },
      ),
      triggered(when.crime, [mercenary()], { oncePerTurn: true, label: "Mercenaire 1/1" }),
    ],
  },
  "Badlands Revival": {
    spell: spell(
      [
        target.upTo(1, target.cardInGraveyard("c", { types: ["Creature"] }, "you", "carte de créature")),
        { ...target.upTo(1, target.cardInGraveyard("p", { permanent: true }, "you", "carte de permanent")), otherThan: ["c"] },
      ],
      [fx.toBattlefield(ref.target("c")), fx.toHand(ref.target("p"))],
    ),
  },
  "Baron Bertram Graywater": {
    abilities: [
      triggered(when.enters({ token: true, controller: "you" }), [fx.createTokens(VAMPIRE_ROGUE)], {
        oncePerTurn: true,
        label: "Vampire Voleur 1/1",
      }),
      activated({
        mana: "{1}{B}",
        sacrificeOther: { filter: { types: ["Creature", "Artifact"], other: true } },
        effects: [fx.draw(1)],
        label: "Piochez",
      }),
    ],
  },
  "Bruse Tarl, Roving Rancher": {
    abilities: [
      staticAbility(
        { subtype: "Ox", controller: "you" },
        { addKeywords: ["doubleStrike"] },
        { label: "Vos Bœufs : double initiative" },
      ),
      ...(["entersSelf", "attacksSelf"] as const).map((w) =>
        triggered(
          when[w],
          [
            fx.exileTop(ref.you, 1, "b"),
            fx.when(cond.refMatches(ref.stored("b"), { types: ["Land"] }), fx.createTokens(OX)),
            fx.when(
              cond.not(cond.refMatches(ref.stored("b"), { types: ["Land"] })),
              fx.grantPlay(ref.stored("b"), { untilYourNextTurn: true }),
            ),
          ],
          { label: "Exilez la carte du dessus : Bœuf, ou lançable" },
        ),
      ),
    ],
  },
  "Cactusfolk Sureshot": {
    abilities: [
      triggered(
        when.step("beginCombat"),
        [fx.pumpAll({ ...OTHER_CREATURE_YOU_CONTROL, minPower: 4 }, 0, 0, ["trample", "haste"])],
        {
          label: "Piétinement et célérité (force 4)",
        },
      ),
    ],
  },
  "Congregation Gryff": {
    abilities: [
      whileSaddled(
        [
          fx.pump(
            ref.self,
            amount.count({ subtype: "Mount", controller: "you" }),
            amount.count({ subtype: "Mount", controller: "you" }),
          ),
        ],
        { label: "+X/+X (vos Montures)" },
      ),
    ],
  },
  "Form a Posse": { spell: spell([], [mercenary(amount.x)]) },
  "Honest Rutstein": {
    abilities: [
      triggered(when.entersSelf, [fx.toHand(ref.target())], {
        targets: [target.cardInGraveyard("t", { types: ["Creature"] }, "you", "carte de créature")],
        label: "Reprenez une créature",
      }),
      { kind: "costReduction", filter: { types: ["Creature"] }, generic: 1, label: "Sorts de créature : {1} de moins" },
    ],
  },
  "Intimidation Campaign": {
    abilities: [
      triggered(when.entersSelf, [...fx.drain(1), fx.draw(1)], { label: "Drain 1, piochez" }),
      triggered(when.crime, fx.may("Renvoyer cet enchantement en main ?", fx.bounce(ref.self)), { label: "Renvoyez-le en main" }),
    ],
  },
  "Jem Lightfoote, Sky Explorer": {
    abilities: [triggered(when.yourEndStep, [fx.draw(1)], { condition: NO_HAND_SPELL, label: "Piochez" })],
  },
  "Jolene, Plundering Pugilist": {
    abilities: [
      triggered(when.attackWith(1), [fx.createTokens(TREASURE)], {
        condition: cond.controls({ types: ["Creature"], attacking: true, minPower: 4 }),
        label: "Trésor",
      }),
      activated({
        mana: "{1}{R}",
        sacrificeOther: { filter: { subtype: "Treasure" } },
        targets: [target.any("t")],
        effects: [fx.damage(1, ref.target())],
        label: "1 blessure",
      }),
    ],
  },
  "Kellan Joins Up": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.pickFromZone(
            "hand",
            { nonland: true, maxManaValue: 3 },
            { to: "exile" },
            { min: 0, store: "k", prompt: "Vous pouvez comploter une carte" },
          ),
          fx.plot(ref.stored("k")),
        ],
        { label: "Complotez une carte de votre main" },
      ),
      triggered(when.enters(LEGENDARY_CREATURE_YOU), [fx.addCountersAll(CREATURE_YOU_CONTROL, 1)], {
        label: "Un marqueur +1/+1 sur chaque créature",
      }),
    ],
  },
  "Kraum, Violent Cacophony": {
    abilities: [triggered(when.castNthSpell(2), [fx.addCounters(ref.self, 1), fx.draw(1)], { label: "Marqueur +1/+1, piochez" })],
  },
  "Malcolm, the Eyes": { abilities: [triggered(when.castNthSpell(2), [investigate()], { label: "Enquêtez" })] },
  "Marchesa, Dealer of Death": {
    abilities: [
      triggered(when.crime, fx.mayPay("{1}", "Payer {1} ?", fx.lookAtTop(2, { count: 1, rest: "graveyard" })), {
        label: "Une des deux cartes du dessus en main",
      }),
    ],
  },
  "Miriam, Herd Whisperer": {
    abilities: [
      staticAbility(
        { ...MOUNT_OR_VEHICLE, controller: "you" },
        { addKeywords: ["hexproof"] },
        { condition: cond.yourTurn, label: "Défense talismanique" },
      ),
      triggered(when.attacks({ ...MOUNT_OR_VEHICLE, controller: "you" }), [fx.addCounters(ref.eventObject, 1)], {
        label: "Marqueur +1/+1",
      }),
    ],
  },
  "Pillage the Bog": {
    spell: spell(
      [],
      [
        fx.lookAtTop(
          amount.plus(amount.count({ types: ["Land"], controller: "you" }), amount.count({ types: ["Land"], controller: "you" })),
          { count: 1, rest: "bottom" },
        ),
      ],
    ),
  },
  "Rakdos Joins Up": {
    abilities: [
      triggered(when.entersSelf, [fx.toBattlefield(ref.target(), { counters: { kind: "+1/+1", n: 2 } })], {
        targets: [target.cardInGraveyard("t", { types: ["Creature"] }, "you", "carte de créature")],
        label: "Une créature revient avec deux marqueurs",
      }),
      triggered(when.dies(LEGENDARY_CREATURE_YOU), [fx.damage(amount.powerOf(ref.eventObject), ref.target())], {
        targets: [target.player("t", "opponent")],
        label: "Blessures égales à sa force",
      }),
    ],
  },
  "Ruthless Lawbringer": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.sacrifice(ref.you, { types: ["Creature"], other: true }, 1, { optional: true, store: "s" }),
          fx.when(cond.v("s"), fx.reflexive([target.nonland("t")], [fx.destroy(ref.target())])),
        ],
        { label: "Sacrifiez une créature : détruisez un permanent non-terrain" },
      ),
    ],
  },
  "Selvala, Eager Trailblazer": {
    abilities: [
      triggered(when.castSpell("you", { types: ["Creature"] }), [mercenary()], { label: "Mercenaire 1/1" }),
      manaAbility(ALL_COLORS, 1, { distinctPowers: true }),
    ],
  },
  "Seraphic Steed": { abilities: [whileSaddled([fx.createTokens(ANGEL_3)], { label: "Ange 3/3 volant" })] },
  "Slick Sequence": {
    spell: spell([target.any("t")], [fx.damage(2, ref.target()), fx.when(cond.castThisTurn(2), fx.draw(1))]),
  },
  "Vial Smasher, Gleeful Grenadier": {
    abilities: [
      triggered(when.enters({ ...OUTLAW_CREATURE, controller: "you", other: true }), [fx.damage(1, ref.target())], {
        targets: [target.player("t", "opponent")],
        label: "1 blessure",
      }),
    ],
  },
  "Vraska Joins Up": {
    abilities: [
      triggered(when.entersSelf, [fx.addCountersAll(CREATURE_YOU_CONTROL, 1, "deathtouch")], {
        label: "Marqueur contact mortel",
      }),
      triggered(when.combatDamage(LEGENDARY_CREATURE_YOU, true), [fx.draw(1)], { label: "Piochez" }),
    ],
  },
  "Wrangler of the Damned": {
    abilities: [
      triggered(when.yourEndStep, [fx.createTokens(SPIRIT_2)], { condition: NO_HAND_SPELL, label: "Esprit 2/2 volant" }),
    ],
  },
  "Wylie Duke, Atiin Hero": {
    abilities: [triggered(when.tapsSelf, [fx.gainLife(1), fx.draw(1)], { label: "+1 PV, piochez" })],
  },

  // --- Incolores -------------------------------------------------------------
  "Bandit's Haul": {
    abilities: [
      triggered(when.crime, [fx.counters(ref.self, "loot", 1)], { oncePerTurn: true, label: "Marqueur de butin" }),
      manaAbility(ALL_COLORS),
      activated({ mana: "{2}", tap: true, removeCounters: { kind: "loot", n: 2 }, effects: [fx.draw(1)], label: "Piochez" }),
    ],
  },
  "Boom Box": {
    abilities: [
      activated({
        mana: "{6}",
        tap: true,
        sacrifice: true,
        targets: [
          target.upTo(1, target.permanent("a", ["Artifact"])),
          target.upTo(1, target.creature("c")),
          target.upTo(1, target.permanent("l", ["Land"])),
        ],
        effects: [fx.destroy(ref.target("a")), fx.destroy(ref.target("c")), fx.destroy(ref.target("l"))],
        label: "Détruisez un artefact, une créature et un terrain",
      }),
    ],
  },
  "Gold Pan": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(TREASURE)], { label: "Trésor" }),
      staticAbility("attached", { power: 1, toughness: 1 }, { label: "+1/+1" }),
    ],
  },
  "Lavaspur Boots": {
    abilities: [
      staticAbility(
        "attached",
        { power: 1, addKeywords: ["haste"], addAbilities: [wardAbility({ mana: { generic: 1, colored: {}, x: 0 } })] },
        {
          label: "+1/+0, célérité et garde {1}",
        },
      ),
    ],
  },
  "Mobile Homestead": {
    abilities: [
      staticAbility(
        "self",
        { addKeywords: ["haste"] },
        { condition: cond.controls({ subtype: "Mount" }), label: "Célérité (Monture)" },
      ),
      triggered(
        when.attacksSelf,
        [fx.lookAtTop(1, { filter: { types: ["Land"] }, count: 1, to: { to: "battlefield", tapped: true }, rest: "top" })],
        { label: "Un terrain du dessus, engagé" },
      ),
    ],
  },
  "Oasis Gardener": {
    abilities: [triggered(when.entersSelf, [fx.gainLife(2)], { label: "+2 PV" }), manaAbility(ALL_COLORS)],
  },
  "Redrock Sentinel": {
    abilities: [
      activated({
        mana: "{2}",
        tap: true,
        sacrificeOther: { filter: { types: ["Land"] } },
        effects: [fx.draw(1), fx.createTokens(TREASURE)],
        label: "Piochez, Trésor",
      }),
    ],
  },
  "Silver Deputy": {
    abilities: [
      triggered(
        when.entersSelf,
        fx.may(
          "Chercher un terrain de base ou un Désert ?",
          fx.search({ types: ["Land"], anyOf: [{ basic: true }, { subtype: "Desert" }] }, { to: "libraryTop" }),
        ),
        { label: "Terrain au-dessus de la bibliothèque" },
      ),
      activated({
        tap: true,
        sorcerySpeed: true,
        targets: [target.creature("t", { controller: "you" })],
        effects: [fx.pump(ref.target(), 1, 0)],
        label: "+1/+0",
      }),
    ],
  },
  "Sterling Hound": { abilities: [triggered(when.entersSelf, [fx.surveil(2)], { label: "Surveillance 2" })] },
  "Tomb Trawler": {
    abilities: [
      activated({
        mana: "{2}",
        targets: [target.cardInGraveyard("t", {}, "you", "carte")],
        effects: [fx.moveTo(ref.target(), { to: "libraryBottom" })],
        label: "Une carte au-dessous de la bibliothèque",
      }),
    ],
  },

  // --- Terrains --------------------------------------------------------------
  "Abraded Bluffs": desertDual("R", "W"),
  "Bristling Backwoods": desertDual("R", "G"),
  "Creosote Heath": desertDual("G", "W"),
  "Eroded Canyon": desertDual("U", "R"),
  "Festering Gulch": desertDual("B", "G"),
  "Forlorn Flats": desertDual("W", "B"),
  "Jagged Barrens": desertDual("B", "R"),
  "Lonely Arroyo": desertDual("W", "U"),
  "Lush Oasis": desertDual("G", "U"),
  "Soured Springs": desertDual("U", "B"),
  "Arid Archway": {
    abilities: [
      entersWith({ tapped: true }),
      // Le terrain n'est pas ciblé (choisi à la résolution) et peut être celui-ci ; un autre Désert renvoyé : surveillance 1.
      triggered(
        when.entersSelf,
        [
          fx.chooseAmong(ref.permanentsOf(ref.you, { types: ["Land"] }), ref.you, "land", {
            prompt: "Choisissez le terrain à renvoyer en main",
          }),
          fx.bounce(ref.stored("land")),
          fx.when(cond.refMatches(ref.stored("land"), { subtype: "Desert", other: true }), fx.surveil(1)),
        ],
        { label: "Renvoyez un terrain" },
      ),
      manaAbility("C", 2),
    ],
  },
  "Conduit Pylons": {
    abilities: [
      triggered(when.entersSelf, [fx.surveil(1)], { label: "Surveillance 1" }),
      manaAbility("C"),
      activated({ mana: "{1}", tap: true, effects: [fx.addManaChoice(1)], label: "Un mana de n'importe quelle couleur" }),
    ],
  },
  "Mirage Mesa": {
    chooseOnEnter: "color",
    abilities: [entersWith({ tapped: true }), manaAbility(["W"], 1, { produceChosen: true })],
  },
  "Sandstorm Verge": {
    abilities: [
      manaAbility("C"),
      activated({
        mana: "{3}",
        tap: true,
        sorcerySpeed: true,
        targets: [target.creature("t")],
        effects: [fx.pump(ref.target(), 0, 0, ["cantBlock"])],
        label: "Ne peut pas bloquer",
      }),
    ],
  },
  "Bucolic Ranch": {
    abilities: [
      manaAbility("C"),
      manaAbility(ALL_COLORS, 1, { restriction: { spell: { subtype: "Mount" } } }),
      activated({
        mana: "{3}",
        tap: true,
        effects: [fx.lookAtTop(1, { filter: { subtype: "Mount" }, count: 1, rest: "top" })],
        label: "Une Monture du dessus en main",
      }),
    ],
  },
  "Blooming Marsh": fastland("B", "G"),
  "Botanical Sanctum": fastland("G", "U"),
  "Concealed Courtyard": fastland("W", "B"),
  "Inspiring Vantage": fastland("R", "W"),
  "Spirebluff Canal": fastland("U", "R"),
};
