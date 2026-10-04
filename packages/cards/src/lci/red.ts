/** The Lost Caverns of Ixalan — cartes rouges. */
import {
  ARTIFACT_OR_CREATURE_YOURS,
  activated,
  amount,
  CAVES,
  type CardScript,
  cond,
  DINOSAUR_3_1,
  DINOSAUR_YOU,
  fx,
  manaAbility,
  mode,
  ref,
  spell,
  staticAbility,
  TREASURE,
  target,
  targetObj,
  triggered,
  triggeredModal,
  when,
} from "./common";

const ARTIFACT_YOU = { types: ["Artifact" as const], controller: "you" as const };

export const RED: Record<string, CardScript> = {
  "Ancestors' Aid": {
    spell: spell([target.creature()], [fx.pump(ref.target(), 2, 0, ["firstStrike"]), fx.createTokens(TREASURE)]),
  },
  "Bonehoard Dracosaur": {
    abilities: [
      triggered(
        when.yourUpkeep,
        [
          fx.exileTop(ref.you, 2, "x"),
          fx.grantPlay(ref.stored("x")),
          ...fx.when(
            cond.amountAtLeast(amount.refCount(ref.filtered(ref.stored("x"), { types: ["Land"] })), 1),
            fx.createTokens(DINOSAUR_3_1),
          ),
          ...fx.when(
            cond.amountAtLeast(amount.refCount(ref.filtered(ref.stored("x"), { notTypes: ["Land"] })), 1),
            fx.createTokens(TREASURE),
          ),
        ],
        { label: "Exilez deux cartes, jouables ce tour-ci" },
      ),
    ],
  },
  "Brazen Blademaster": {
    abilities: [
      triggered(when.attacksSelf, [fx.pump(ref.self, 2, 1)], {
        condition: cond.controls({ types: ["Artifact"] }, 2),
        label: "+2/+1",
      }),
    ],
  },
  "Breeches, Eager Pillager": {
    abilities: [
      triggeredModal(
        when.attacks({ types: ["Creature"], subtype: "Pirate", controller: "you" }),
        [
          mode("Trésor", [], [fx.createTokens(TREASURE)]),
          mode("Une créature ne peut pas bloquer", [target.creature()], [fx.pump(ref.target(), 0, 0, ["cantBlock"])]),
          mode("Exilez la carte du dessus, jouable ce tour-ci", [], [fx.impulse(1)]),
        ],
        { uniqueModes: "turn", label: "Un Pirate attaque" },
      ),
    ],
  },
  "Burning Sun Cavalry": {
    abilities: [when.attacksSelf, when.blocks("self")].map((t) =>
      triggered(t, [fx.pump(ref.self, 1, 1)], { condition: cond.controls(DINOSAUR_YOU), label: "+1/+1 (Dinosaure)" }),
    ),
  },
  "Calamitous Cave-In": {
    spell: spell([], [fx.damageAll(CAVES, { types: ["Creature", "Planeswalker"] })]),
  },
  "Diamond Pick-Axe": {
    abilities: [
      staticAbility(
        "attached",
        {
          power: 1,
          toughness: 1,
          addAbilities: [triggered(when.attacksSelf, [fx.createTokens(TREASURE)], { label: "Trésor" })],
        },
        { label: "+1/+1 et un Trésor en attaquant" },
      ),
    ],
  },
  Dinotomaton: {
    abilities: [
      triggered(when.entersSelf, [fx.pump(ref.target(), 0, 0, ["menace"])], {
        targets: [target.creature("t", { controller: "you" })],
        label: "Menace",
      }),
    ],
  },
  "Dowsing Device": {
    abilities: [
      triggered(
        when.enters(ARTIFACT_YOU),
        [fx.pump(ref.target(), 1, 0, ["haste"]), ...fx.when(cond.controls({ types: ["Artifact"] }, 4), fx.transform())],
        {
          targets: [target.optional(target.creature("t", { controller: "you" }))],
          label: "+1/+0 et célérité ; transformation (quatre artefacts)",
        },
      ),
    ],
  },
  "Geode Grotto": {
    abilities: [
      manaAbility("R"),
      activated({
        mana: "{2}{R}",
        tap: true,
        sorcerySpeed: true,
        targets: [target.creature()],
        effects: [fx.pump(ref.target(), amount.count(ARTIFACT_YOU), 0, ["haste"])],
        label: "+X/+0 et célérité",
      }),
    ],
  },
  "Dreadmaw's Ire": {
    spell: spell(
      [target.creature("t", { attacking: true })],
      [
        fx.modify(ref.target(), {
          power: 2,
          toughness: 2,
          addKeywords: ["trample"],
          addAbilities: [
            triggered(when.combatDamageToPlayer, [fx.destroy(ref.target("a"))], {
              targets: [target.of(ref.eventPlayer, targetObj("a", { types: ["Artifact"] }, "artefact de ce joueur"))],
              label: "Détruisez un artefact",
            }),
          ],
        }),
      ],
    ),
  },
  "Goblin Tomb Raider": {
    abilities: [
      staticAbility(
        "self",
        { power: 1, addKeywords: ["haste"] },
        { condition: cond.controls({ types: ["Artifact"] }), label: "+1/+0 et célérité (artefact)" },
      ),
    ],
  },
  "Goldfury Strider": {
    abilities: [
      activated({
        tapOthers: { filter: ARTIFACT_OR_CREATURE_YOURS, count: 2, includeSelf: true },
        sorcerySpeed: true,
        targets: [target.creature()],
        effects: [fx.pump(ref.target(), 2, 0)],
        label: "+2/+0",
      }),
    ],
  },
  "Hotfoot Gnome": {
    abilities: [
      activated({
        tap: true,
        targets: [target.creature("t", { other: true })],
        effects: [fx.pump(ref.target(), 0, 0, ["haste"])],
        label: "Célérité",
      }),
    ],
  },
  "Inti, Seneschal of the Sun": {
    abilities: [
      triggered(
        when.attackWith(1),
        [
          fx.discard(1, ref.you, { optional: true, store: "d" }),
          ...fx.when(
            cond.v("d"),
            fx.reflexive(
              [target.creature("t", { attacking: true })],
              [fx.addCounters(ref.target(), 1), fx.pump(ref.target(), 0, 0, ["trample"])],
            ),
          ),
        ],
        { label: "Défaussez : marqueur +1/+1 et piétinement" },
      ),
      triggered(when.discardBatch("you"), [fx.impulse(1, "yourNextTurn")], { label: "Exilez la carte du dessus" }),
    ],
  },
  "Magmatic Galleon": {
    abilities: [
      triggered(when.entersSelf, [fx.damage(5, ref.target())], {
        targets: [target.creature("t", { controller: "opponent" })],
        label: "5 blessures",
      }),
      triggered(when.excessDamage({ types: ["Creature"], controller: "opponent" }, true), [fx.createTokens(TREASURE)], {
        batched: true,
        label: "Blessures en excès : un Trésor",
      }),
    ],
  },
  "Panicked Altisaur": {
    abilities: [activated({ tap: true, effects: [fx.damage(2, ref.eachOpponent)], label: "2 blessures à chaque adversaire" })],
  },
  "Plundering Pirate": { abilities: [triggered(when.entersSelf, [fx.createTokens(TREASURE)], { label: "Trésor" })] },
  "Poetic Ingenuity": {
    abilities: [
      triggered(when.attackWith(1, DINOSAUR_YOU), [fx.createTokens(TREASURE, amount.eventAmount)], {
        label: "Un Trésor par Dinosaure attaquant",
      }),
      triggered(when.castSpell("you", { types: ["Artifact"] }), [fx.createTokens(DINOSAUR_3_1)], {
        oncePerTurn: true,
        label: "Dinosaure 3/1",
      }),
    ],
  },
  "Rumbling Rockslide": {
    spell: spell([target.creature()], [fx.damage(amount.count({ types: ["Land"], controller: "you" }), ref.target())]),
  },
  "Scytheclaw Raptor": {
    abilities: [triggered(when.castSpellOffTurn("any"), [fx.damage(4, ref.eventPlayer)], { label: "4 blessures" })],
  },
  "Seismic Monstrosaur": {
    abilities: [
      activated({
        mana: "{2}{R}",
        sacrificeOther: { filter: { types: ["Land"] } },
        effects: [fx.draw(1)],
        label: "Piochez une carte",
      }),
    ],
  },
  "Sunfire Torch": {
    abilities: [
      staticAbility("attached", { power: 1 }, { label: "+1/+0" }),
      triggered(
        when.attacks({ attachedToSource: true }),
        [
          ...fx.may(
            "Sacrifier Sunfire Torch ?",
            fx.sacrificeIt(ref.self),
            // La créature attaquante, liée à la capacité réflexive (l'objet de l'événement n'y est plus connu).
            fx.reflexive([target.any()], [fx.damage(2, ref.target(), ref.target("a"))], { a: ref.eventObject }),
          ),
        ],
        { label: "Sacrifiez-la : 2 blessures" },
      ),
    ],
  },
  "Sunshot Militia": {
    abilities: [
      activated({
        tapOthers: { filter: ARTIFACT_OR_CREATURE_YOURS, count: 2, includeSelf: true },
        sorcerySpeed: true,
        effects: [fx.damage(1, ref.eachOpponent)],
        label: "1 blessure à chaque adversaire",
      }),
    ],
  },
  "Tectonic Hazard": {
    spell: spell([], [fx.damageAll(1, { types: ["Creature"], controller: "opponent" }, ref.eachOpponent)]),
  },
  "Triumphant Chomp": {
    spell: spell([target.creature()], [fx.damage(amount.max(2, amount.maxPower(DINOSAUR_YOU)), ref.target())]),
  },
  "Volatile Wanderglyph": {
    abilities: [
      triggered(when.tapsSelf, [fx.discard(1, ref.you, { optional: true, store: "d" }), ...fx.when(cond.v("d"), fx.draw(1))], {
        label: "Défaussez, puis piochez",
      }),
    ],
  },
  "Brass's Tunnel-Grinder": {
    abilities: [
      triggered(
        when.entersSelf,
        [fx.discard(60, ref.you, { optional: true, store: "d" }), fx.draw(amount.plus(amount.v("d"), 1))],
        { label: "Défaussez autant de cartes que voulu, piochez-en autant plus une" },
      ),
      triggered(
        when.yourEndStep,
        [
          fx.counters(ref.self, "bore", 1),
          ...fx.when(cond.counterAtLeast("bore", 3), fx.removeCounters(ref.self, 3, "bore"), fx.transform()),
        ],
        { condition: cond.descended, label: "Descente — marqueur de forage" },
      ),
    ],
  },
  "Tecutlan, the Searing Rift": {
    abilities: [
      manaAbility("R"),
      triggered(
        { on: "castSpell", by: "you", filter: { permanent: true }, usingManaFromSelf: true },
        [fx.discover(amount.manaValueOf(ref.eventObject))],
        { label: "Découverte X" },
      ),
    ],
  },
  "Child of the Volcano": {
    abilities: [
      triggered(when.yourEndStep, [fx.addCounters(ref.self, 1)], {
        condition: cond.descended,
        label: "Descente — marqueur +1/+1",
      }),
    ],
  },
  "Curator of Sun's Creation": {
    abilities: [
      triggered(when.discover, [fx.discover(amount.eventAmount)], { oncePerTurn: true, label: "Découvrez de nouveau" }),
    ],
  },
  "Daring Discovery": {
    spell: spell([target.upTo(3, target.creature())], [fx.pump(ref.target(), 0, 0, ["cantBlock"]), fx.discover(4)]),
  },
  "Enterprising Scallywag": {
    abilities: [
      triggered(when.yourEndStep, [fx.createTokens(TREASURE)], { condition: cond.descended, label: "Descente — Trésor" }),
    ],
  },
  "Etali's Favor": {
    enchant: { filter: { types: ["Creature"], controller: "you" }, label: "créature que vous contrôlez" },
    abilities: [
      triggered(when.entersSelf, [fx.discover(3)], { label: "Découverte 3" }),
      staticAbility("attached", { power: 1, toughness: 1, addKeywords: ["trample"] }, { label: "+1/+1 et piétinement" }),
    ],
  },
  "Geological Appraiser": {
    abilities: [triggered(when.entersSelf, [fx.discover(3)], { condition: cond.wasCast, label: "Découverte 3" })],
  },
  "Hit the Mother Lode": {
    spell: spell(
      [],
      [
        fx.discover(10, { store: "d" }),
        ...fx.when(
          cond.v("d"),
          fx.createTappedTokens(TREASURE, amount.plus(10, amount.neg(amount.manaValueOf(ref.stored("d"))))),
        ),
      ],
    ),
  },
  "Trumpeting Carnosaur": {
    abilities: [
      triggered(when.entersSelf, [fx.discover(5)], { label: "Découverte 5" }),
      activated({
        mana: "{2}{R}",
        discardSelf: true,
        fromHand: true,
        targets: [target.creatureOrPlaneswalker()],
        effects: [fx.damage(3, ref.target())],
        label: "Défaussez-la : 3 blessures",
      }),
    ],
  },
  "Zoyowa's Justice": {
    spell: spell(
      [
        targetObj(
          "t",
          { anyOf: [{ types: ["Artifact"] }, { types: ["Creature"] }], minManaValue: 1 },
          "artefact ou créature de VM 1 ou plus",
        ),
      ],
      [
        fx.moveTo(ref.target(), { to: "libraryTop", shuffle: true }, { name: "z" }),
        // Le propriétaire de la carte mélangée découvre (fixé au premier passage de la découverte).
        fx.discover(amount.manaValueOf(ref.stored("z")), { who: ref.ownerOf(ref.stored("z")) }),
      ],
    ),
  },
};
