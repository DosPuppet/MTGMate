/** Aetherdrift — cartes multicolores, incolores et terrains. */
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

/** Verge : « {T} : ajoutez [A] » ; « {T} : ajoutez [B]. N'activez que si vous contrôlez un [type] ou un [type] ». */
const verge = (a: ManaType, b: ManaType, types: [string, string]): CardScript => ({
  abilities: [
    manaAbility(a),
    manaAbility(b, 1, { condition: cond.controls({ anyOf: [{ subtype: types[0] }, { subtype: types[1] }] }) }),
  ],
});

/** Roads : arrive engagé sauf avec une Monture ou un Véhicule ; « {1}[C], {T}, sacrifiez : Pilote 1/1 ». */
const road = (c: ManaType): CardScript => ({
  abilities: [
    entersWith({ tapped: true, condition: cond.not(cond.controls({ ...MOUNT_OR_VEHICLE })) }),
    manaAbility(c),
    activated({ mana: `{1}{${c}}`, tap: true, sacrifice: true, sorcerySpeed: true, effects: [pilot()], label: "Pilote 1/1" }),
  ],
});

export const MULTI: Record<string, CardScript> = {
  // --- Multicolores ----------------------------------------------------------
  "Aatchik, Emerald Radian": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(GREEN_INSECT, amount.countIn("graveyard", CREATURE_OR_ARTIFACT))], {
        label: "Un Insecte par carte d'artefact ou de créature du cimetière",
      }),
      triggered(
        when.dies({ subtype: "Insect", controller: "you", other: true }),
        [fx.addCounters(ref.self, 1), fx.loseLife(1, ref.eachOpponent)],
        { label: "Marqueur +1/+1, chaque adversaire perd 1 PV" },
      ),
    ],
  },
  "Apocalypse Runner": {
    abilities: [
      activated({
        tap: true,
        targets: [target.creature("t", { controller: "you", maxPower: 2 })],
        effects: [fx.pump(ref.target(), 0, 0, ["lifelink", "unblockable"])],
        label: "Lien de vie et imblocable",
      }),
    ],
  },
  "Boosted Sloop": { abilities: [triggered(when.attackWith(1), fx.loot(1), { label: "Piochez, défaussez" })] },
  "Brightglass Gearhulk": {
    abilities: [
      triggered(
        when.entersSelf,
        fx.may(
          "Chercher jusqu'à deux cartes de VM 1 ou moins ?",
          fx.search({ types: ["Artifact", "Creature", "Enchantment"], maxManaValue: 1 }, { to: "hand" }, 2),
        ),
        { label: "Deux cartes de VM 1 ou moins" },
      ),
    ],
  },
  "Broadside Barrage": {
    spell: spell([target.creatureOrPlaneswalker("t")], [fx.damage(5, ref.target()), ...fx.loot(1)]),
  },
  "Broodheart Engine": {
    abilities: [
      triggered(when.yourUpkeep, [fx.surveil(1)], { label: "Surveillance 1" }),
      activated({
        mana: "{2}{B}{G}",
        tap: true,
        sacrifice: true,
        sorcerySpeed: true,
        targets: [target.cardInGraveyard("t", CREATURE_OR_VEHICLE, "you", "carte de créature ou de Véhicule")],
        effects: [fx.toBattlefield(ref.target())],
        label: "Renvoyez une créature ou un Véhicule",
      }),
    ],
  },
  "Caradora, Heart of Alacria": {
    abilities: [
      triggered(when.entersSelf, fx.may("Chercher une Monture ou un Véhicule ?", fx.search(MOUNT_OR_VEHICLE)), {
        label: "Cherchez une Monture ou un Véhicule",
      }),
      // « … sur une créature ou un Véhicule que vous contrôlez » (un Véhicule non animé compris).
      eventReplacement({
        event: "counters",
        to: "yourSide",
        toFilter: CREATURE_OR_VEHICLE,
        counter: "+1/+1",
        modify: { add: 1 },
        label: "Un marqueur +1/+1 de plus",
      }),
    ],
  },
  "Cloudspire Skycycle": {
    abilities: [
      triggered(when.entersSelf, [fx.countersDivided(2, ref.target())], {
        targets: [target.between(1, 2, targetCreatureOrVehicle("t", { controller: "you", other: true }))],
        label: "Répartissez deux marqueurs +1/+1",
      }),
    ],
  },
  "Debris Beetle": { abilities: [triggered(when.entersSelf, fx.drain(3), { label: "Drain 3" })] },
  "Explosive Getaway": {
    spell: spell(
      [target.upTo(1, target.permanent("t", ["Artifact", "Creature"], {}, "artefact ou créature"))],
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
        label: "+1/+0, contact mortel, dégagez-la",
      }),
    ],
  },
  "Kolodin, Triumph Caster": {
    abilities: [
      staticAbility({ ...MOUNT_OR_VEHICLE, controller: "you" }, { addKeywords: ["haste"] }, { label: "Célérité" }),
      triggered(when.enters({ subtype: "Mount", controller: "you" }), [fx.saddle(ref.eventObject)], { label: "Devient montée" }),
      triggered(when.enters({ subtype: "Vehicle", controller: "you" }), [fx.animateVehicle(ref.eventObject)], {
        label: "Devient une créature-artefact",
      }),
    ],
  },
  "Lagorin, Soul of Alacria": {
    abilities: [
      whileSaddled([fx.addCounters(ref.target(), 1)], {
        targets: [target.upTo(2, targetObj("t", MOUNT_OR_VEHICLE, "Monture ou Véhicule"))],
        label: "Marqueurs +1/+1 sur des Montures ou Véhicules",
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
        { targets: [target.player("t")], label: "Regardez sa main : il défausse puis pioche" },
      ),
    ],
  },
  "Pyrewood Gearhulk": {
    abilities: [
      triggered(
        when.entersSelf,
        [fx.pumpAll(OTHER_CREATURE_YOU_CONTROL, 2, 2, ["vigilance", "menace"]), fx.thisTurn({ damageUnpreventable: true })],
        {
          label: "+2/+2, vigilance et menace",
        },
      ),
    ],
  },
  "Thundering Broodwagon": {
    abilities: [
      triggered(when.entersSelf, [fx.destroy(ref.target())], {
        targets: [target.nonland("t", { controller: "opponent", maxManaValue: 4 })],
        label: "Détruisez un permanent non-terrain de VM 4 ou moins",
      }),
    ],
  },
  "Veteran Beastrider": {
    abilities: [
      triggered(when.yourEndStep, [fx.untap(ref.permanentsOf(ref.you, { types: ["Creature"] }))], {
        label: "Dégagez vos créatures",
      }),
      activated({ mana: "{2}{G}{W}", effects: [fx.pumpAll(CREATURE_YOU_CONTROL, 1, 1)], label: "Vos créatures +1/+1" }),
    ],
  },
  "Voyage Home": {
    costReduction: { generic: amount.count({ types: ["Artifact"], controller: "you" }) },
    spell: spell([], [fx.draw(3), fx.gainLife(3)]),
  },

  // --- Incolores -------------------------------------------------------------
  Aetherjacket: {
    abilities: [
      activated({
        mana: "{2}",
        tap: true,
        sacrifice: true,
        sorcerySpeed: true,
        targets: [target.permanent("t", ["Artifact"], { other: true })],
        effects: [fx.destroy(ref.target())],
        label: "Détruisez un autre artefact",
      }),
    ],
  },
  "Guidelight Matrix": {
    abilities: [
      triggered(when.entersSelf, [fx.draw(1)], { label: "Piochez" }),
      activated({
        mana: "{2}",
        tap: true,
        sorcerySpeed: true,
        targets: [targetObj("t", { subtype: "Mount", controller: "you" }, "Monture que vous contrôlez")],
        effects: [fx.saddle(ref.target())],
        label: "Une Monture devient montée",
      }),
      activated({
        mana: "{2}",
        tap: true,
        targets: [targetObj("t", { subtype: "Vehicle", controller: "you" }, "Véhicule que vous contrôlez")],
        effects: [fx.animateVehicle(ref.target())],
        label: "Un Véhicule devient une créature-artefact",
      }),
    ],
  },
  "Marketback Walker": {
    abilities: [
      entersWith({ counters: amount.x }),
      activated({ mana: "{4}", effects: [fx.addCounters(ref.self, 1)], label: "Marqueur +1/+1" }),
      triggered(when.diesSelf, [fx.draw(amount.lkiCounters("+1/+1"))], { label: "Une carte par marqueur +1/+1" }),
    ],
  },
  "Rover Blades": {
    abilities: [staticAbility("attached", { addKeywords: ["doubleStrike"] }, { label: "Double initiative" })],
  },
  "Scrap Compactor": {
    abilities: [
      activated({
        mana: "{3}",
        tap: true,
        sacrifice: true,
        targets: [target.creature("t")],
        effects: [fx.damage(3, ref.target())],
        label: "3 blessures",
      }),
      activated({
        mana: "{6}",
        tap: true,
        sacrifice: true,
        targets: [targetCreatureOrVehicle()],
        effects: [fx.destroy(ref.target())],
        label: "Détruisez une créature ou un Véhicule",
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
        label: "Trésor",
      }),
    ],
  },
  "Wreck Remover": {
    abilities: [
      triggered(when.entersSelf, [fx.exileCard(ref.target()), fx.gainLife(1)], {
        targets: [target.upTo(1, target.cardInGraveyard("t", {}, "any", "carte"))],
        label: "Exilez une carte d'un cimetière, +1 PV",
      }),
      triggered(when.attacksSelf, [fx.exileCard(ref.target()), fx.gainLife(1)], {
        targets: [target.upTo(1, target.cardInGraveyard("t", {}, "any", "carte"))],
        label: "Exilez une carte d'un cimetière, +1 PV",
      }),
    ],
  },

  // --- Terrains --------------------------------------------------------------
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
    chooseOnEnter: "color",
    abilities: [entersWith({ tapped: true }), manaAbility(["W"], 1, { produceChosen: true })],
  },
};
