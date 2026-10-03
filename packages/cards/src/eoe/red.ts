/** Edge of Eternities — cartes rouges. */
import {
  activated,
  amount,
  type CardScript,
  CREATURE_OR_ARTIFACT,
  cond,
  fx,
  lander,
  MUNITIONS,
  manaAbility,
  modal,
  mode,
  OTHER_CREATURE_YOU_CONTROL,
  ROBOT,
  ref,
  spell,
  staticAbility,
  TWO_TAPPED,
  target,
  triggered,
  when,
} from "./common";

export const RED: Record<string, CardScript> = {
  Bombard: { spell: spell([target.creature("t")], [fx.damage(4, ref.target())]) },
  "Cut Propulsion": {
    spell: spell(
      [target.creature("t")],
      [
        // La créature s'inflige elle-même les blessures (deux fois plus si elle a le vol).
        fx.when(
          cond.targetMatches("t", { keyword: "flying" }),
          fx.damage(amount.plus(amount.powerOf(ref.target()), amount.powerOf(ref.target())), ref.target(), ref.target()),
        ),
        fx.when(
          cond.not(cond.targetMatches("t", { keyword: "flying" })),
          fx.damage(amount.powerOf(ref.target()), ref.target(), ref.target()),
        ),
      ],
    ),
  },
  "Devastating Onslaught": {
    spell: spell(
      [target.permanent("t", ["Artifact", "Creature"], { controller: "you" }, "artefact ou créature que vous contrôlez")],
      [fx.copyToken(ref.target(), { count: amount.x, addKeywords: ["haste"], sacrificeAtEndStep: true })],
    ),
  },
  "Frontline War-Rager": {
    abilities: [triggered(when.yourEndStep, [fx.addCounters(ref.self, 1)], { condition: TWO_TAPPED, label: "Marqueur +1/+1" })],
  },
  "Full Bore": {
    spell: spell(
      [target.creature("t", { controller: "you" })],
      [
        fx.pump(ref.target(), 3, 2),
        fx.when(cond.targetMatches("t", { warped: true }), fx.pump(ref.target(), 0, 0, ["trample", "haste"])),
      ],
    ),
  },
  "Invasive Maneuvers": {
    spell: spell(
      [target.creature("t")],
      [
        fx.when(cond.controls({ subtype: "Spacecraft" }), fx.damage(5, ref.target())),
        fx.when(cond.not(cond.controls({ subtype: "Spacecraft" })), fx.damage(3, ref.target())),
      ],
    ),
  },
  "Kavaron Skywarden": {
    abilities: [
      triggered(when.yourEndStep, [fx.addCounters(ref.self, 1)], { condition: cond.void, label: "Vide : marqueur +1/+1" }),
    ],
  },
  "Kavaron Turbodrone": {
    abilities: [
      activated({
        tap: true,
        sorcerySpeed: true,
        targets: [target.creature("t", { controller: "you" })],
        effects: [fx.pump(ref.target(), 1, 1, ["haste"])],
        label: "+1/+1 et la célérité",
      }),
    ],
  },
  Lithobraking: {
    spell: spell(
      [],
      [
        lander(),
        fx.sacrifice(ref.you, { types: ["Artifact"] }, 1, { optional: true, store: "s" }),
        fx.when(cond.v("s"), fx.damageAll(2, { types: ["Creature"] })),
      ],
    ),
  },
  "Melded Moxite": {
    abilities: [
      triggered(when.entersSelf, [fx.discard(1, ref.you, { optional: true, store: "d" }), fx.when(cond.v("d"), fx.draw(2))], {
        label: "Défaussez : piochez deux cartes",
      }),
      activated({ mana: "{3}", sacrifice: true, effects: [fx.createTappedTokens(ROBOT)], label: "Robot 2/2 engagé" }),
    ],
  },
  "Memorial Team Leader": {
    abilities: [
      staticAbility(OTHER_CREATURE_YOU_CONTROL, { power: 1 }, { condition: cond.yourTurn, label: "Pendant votre tour : +1/+0" }),
    ],
  },
  "Molecular Modifier": {
    abilities: [
      triggered(when.yourCombat, [fx.pump(ref.target(), 1, 0, ["firstStrike"])], {
        targets: [target.creature("t", { controller: "you" })],
        label: "+1/+0 et l'initiative",
      }),
    ],
  },
  "Nebula Dragon": {
    abilities: [triggered(when.entersSelf, [fx.damage(3, ref.target())], { targets: [target.any()], label: "3 blessures" })],
  },
  "Nova Hellkite": {
    abilities: [
      triggered(when.entersSelf, [fx.damage(1, ref.target())], {
        targets: [target.creature("t", { controller: "opponent" })],
        label: "1 blessure",
      }),
    ],
  },
  "Orbital Plunge": {
    spell: spell([target.creature("t")], [fx.damageStoringExcess(6, ref.target(), "x"), fx.when(cond.v("x"), lander())]),
  },
  "Oreplate Pangolin": {
    abilities: [
      triggered(
        when.enters({ types: ["Artifact"], controller: "you", other: true }),
        fx.mayPay("{1}", "payer {1} pour un marqueur +1/+1 ?", fx.addCounters(ref.self, 1)),
        { label: "Payez {1} : marqueur +1/+1" },
      ),
    ],
  },
  "Pain for All": {
    enchant: { filter: { types: ["Creature"], controller: "you" }, label: "créature que vous contrôlez" },
    abilities: [
      triggered(when.entersSelf, [fx.damage(amount.powerOf(ref.attached), ref.target(), ref.attached)], {
        // « N'importe quelle autre cible » : pas la créature enchantée.
        targets: [
          {
            ...target.any(),
            filter: { players: "any", objects: { types: ["Creature", "Planeswalker", "Battle"], notAttachedToSource: true } },
          },
        ],
        label: "Blessures égales à sa force",
      }),
      triggered(when.attachedIsDealtDamage, [fx.damage(amount.eventAmount, ref.eachOpponent, ref.attached)], {
        label: "Autant de blessures à chaque adversaire",
      }),
    ],
  },
  "Plasma Bolt": {
    spell: spell(
      [target.any()],
      [fx.when(cond.void, fx.damage(3, ref.target())), fx.when(cond.not(cond.void), fx.damage(2, ref.target()))],
    ),
  },
  "Red Tiger Mechan": {},
  "Remnant Elemental": {
    abilities: [triggered(when.landfall, [fx.pump(ref.self, 2, 0)], { label: "Landfall : +2/+0" })],
  },
  "Rig for War": {
    spell: spell([target.creature("t")], [fx.pump(ref.target(), 3, 0, ["reach", "firstStrike"])]),
  },
  "Ruinous Rampage": {
    spell: modal(
      mode("3 blessures à chaque adversaire", [], [fx.damage(3, ref.eachOpponent)]),
      mode(
        "Exilez les artefacts de valeur de mana 3 ou moins",
        [],
        [fx.moveAll("battlefield", ref.eachPlayer, { types: ["Artifact"], maxManaValue: 3 }, { to: "exile" })],
      ),
    ),
  },
  "Rust Harvester": {
    abilities: [
      activated({
        mana: "{2}",
        tap: true,
        exileFromGraveyard: { filter: { types: ["Artifact"] } },
        targets: [target.any()],
        effects: [fx.addCounters(ref.self, 1), fx.damage(amount.powerOf(ref.self), ref.target())],
        label: "Marqueur +1/+1, blessures égales à sa force",
      }),
    ],
  },
  "Slagdrill Scrapper": {
    abilities: [
      activated({
        mana: "{2}",
        tap: true,
        sacrificeOther: { filter: { types: ["Artifact", "Land"], other: true } },
        effects: [fx.draw(1)],
        label: "Piochez",
      }),
    ],
  },
  "Vaultguard Trooper": {
    abilities: [
      triggered(
        when.yourEndStep,
        fx.may("défausser votre main et piocher deux cartes ?", fx.discard(amount.cardsIn("hand")), fx.draw(2)),
        { condition: TWO_TAPPED, label: "Défaussez votre main, piochez deux cartes" },
      ),
    ],
  },
  "Weapons Manufacturing": {
    abilities: [
      triggered(when.enters({ types: ["Artifact"], controller: "you", token: false }), [fx.createTokens(MUNITIONS)], {
        label: "Jeton Munitions",
      }),
    ],
  },
  "Weftstalker Ardent": {
    abilities: [
      triggered(when.enters({ ...CREATURE_OR_ARTIFACT, controller: "you", other: true }), [fx.damage(1, ref.eachOpponent)], {
        label: "1 blessure à chaque adversaire",
      }),
    ],
  },
  "Zookeeper Mechan": {
    abilities: [
      manaAbility("R"),
      activated({
        mana: "{6}{R}",
        sorcerySpeed: true,
        targets: [target.creature("t", { controller: "you" })],
        effects: [fx.pump(ref.target(), 4, 0)],
        label: "+4/+0",
      }),
    ],
  },
};
