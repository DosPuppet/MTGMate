/** Edge of Eternities — cartes bleues. */
import {
  activated,
  amount,
  type CardScript,
  cond,
  DRONE,
  doesntUntap,
  fx,
  lander,
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

const ARTIFACT_OR_CREATURE = (id = "t", extra = {}) =>
  target.permanent(id, ["Artifact", "Creature"], extra, "artefact ou créature");

export const BLUE: Record<string, CardScript> = {
  Annul: {
    spell: spell(
      [target.spell("t", { types: ["Artifact", "Enchantment"] }, "sort d'artefact ou d'enchantement")],
      [fx.counter(ref.target())],
    ),
  },
  "Atomic Microsizer": {
    abilities: [
      staticAbility("attached", { power: 1 }, { label: "+1/+0" }),
      triggered(
        when.attacks({ attachedToSource: true }),
        [fx.modify(ref.target(), { addKeywords: ["unblockable"], setPower: 1, setToughness: 1 })],
        { targets: [target.upTo(1, target.creature("t"))], label: "Imblocable, 1/1 de base" },
      ),
    ],
  },
  "Cerebral Download": {
    spell: spell([], [fx.surveil(amount.count({ types: ["Artifact"], controller: "you" })), fx.draw(3)]),
  },
  "Cloudsculpt Technician": {
    abilities: [
      staticAbility("self", { power: 1 }, { condition: cond.controls({ types: ["Artifact"] }), label: "+1/+0 avec un artefact" }),
    ],
  },
  "Codecracker Hound": {
    abilities: [
      triggered(when.entersSelf, [fx.lookAtTop(2, { count: 1, rest: "graveyard" })], {
        label: "Une carte en main, l'autre au cimetière",
      }),
    ],
  },
  "Consult the Star Charts": {
    kicker: "{1}{U}",
    spell: spell(
      [],
      [fx.lookAtTop(amount.count({ types: ["Land"], controller: "you" }), { count: amount.kicked(2, 1), rest: "bottom" })],
    ),
  },
  "Cryogen Relic": {
    abilities: [
      triggered(when.entersSelf, [fx.draw(1)], { label: "Piochez" }),
      triggered(when.leavesSelf, [fx.draw(1)], { label: "Piochez" }),
      activated({
        mana: "{1}{U}",
        sacrifice: true,
        targets: [target.upTo(1, target.creature("t", { tapped: true }))],
        effects: [fx.counters(ref.target(), "stun", 1)],
        label: "Étourdissez une créature engagée",
      }),
    ],
  },
  Cryoshatter: {
    enchant: { filter: { types: ["Creature"] }, label: "créature" },
    abilities: [
      staticAbility("attached", { power: -5 }, { label: "-5/-0" }),
      triggered({ on: "taps", who: { attachedToSource: true } }, [fx.destroy(ref.attached)], { label: "Engagée : détruite" }),
      triggered(when.attachedIsDealtDamage, [fx.destroy(ref.attached)], { label: "Blessée : détruite" }),
    ],
  },
  "Desculpting Blast": {
    spell: spell(
      [target.nonland("t")],
      [fx.when(cond.targetMatches("t", { attacking: true }), fx.createTokens(DRONE)), fx.bounce(ref.target())],
    ),
  },
  "Divert Disaster": {
    spell: spell(
      [target.spell("t")],
      [
        fx.unlessPays(ref.controllerOf(ref.target()), { mana: "{2}", paidStore: "paid" }, fx.counter(ref.target())),
        fx.when(cond.v("paid"), lander()),
      ],
    ),
  },
  "Gigastorm Titan": { costReduction: { generic: 3, condition: cond.castThisTurn(1) } },
  "Illvoi Galeblade": {
    abilities: [activated({ mana: "{2}", sacrifice: true, effects: [fx.draw(1)], label: "Piochez" })],
  },
  "Illvoi Infiltrator": {
    abilities: [
      staticAbility(
        "self",
        { addKeywords: ["unblockable"] },
        { condition: cond.castThisTurn(2), label: "Imblocable (deux sorts)" },
      ),
      triggered(when.combatDamageToPlayer, [fx.draw(1)], { label: "Piochez" }),
    ],
  },
  "Illvoi Light Jammer": {
    abilities: [
      triggered(when.entersSelf, [fx.attach(ref.target()), fx.pump(ref.target(), 0, 0, ["hexproof"])], {
        targets: [target.creature("t", { controller: "you" })],
        label: "Attachez-le, défense talismanique",
      }),
      staticAbility("attached", { power: 1, toughness: 2 }, { label: "+1/+2" }),
    ],
  },
  "Illvoi Operative": {
    abilities: [triggered(when.castNthSpell(2), [fx.addCounters(ref.self, 1)], { label: "Marqueur +1/+1" })],
  },
  "Lost in Space": {
    spell: spell([ARTIFACT_OR_CREATURE()], [fx.topOrBottom(ref.target()), fx.surveil(1)]),
  },
  "Mechan Assembler": {
    abilities: [
      triggered(when.enters({ types: ["Artifact"], controller: "you", other: true }), [fx.createTokens(ROBOT)], {
        oncePerTurn: true,
        label: "Robot 2/2",
      }),
    ],
  },
  "Mechan Navigator": {
    abilities: [triggered(when.tapsSelf, fx.loot(1), { label: "Piochez, défaussez" })],
  },
  "Mechan Shieldmate": {
    abilities: [
      staticAbility(
        "self",
        { addKeywords: ["attacksDespiteDefender"] },
        {
          condition: cond.controls({ types: ["Artifact"], enteredThisTurn: true }),
          label: "Attaque (artefact arrivé ce tour-ci)",
        },
      ),
    ],
  },
  Mechanozoa: {
    abilities: [
      triggered(when.entersSelf, [fx.tap(ref.target()), fx.counters(ref.target(), "stun", 1)], {
        targets: [ARTIFACT_OR_CREATURE("t", { controller: "opponent" })],
        label: "Engagez, étourdissez",
      }),
    ],
  },
  "Mental Modulation": {
    costReduction: { generic: 1, condition: cond.yourTurn },
    spell: spell([ARTIFACT_OR_CREATURE()], [fx.tap(ref.target()), fx.draw(1)]),
  },
  "Mouth of the Storm": {
    abilities: [
      triggered(
        when.entersSelf,
        [fx.modify(ref.permanentsOf(ref.eachOpponent, { types: ["Creature"] }), { power: -3 }, "untilYourNextTurn")],
        { label: "Créatures adverses -3/-0 jusqu'à votre prochain tour" },
      ),
    ],
  },
  "Nanoform Sentinel": {
    abilities: [
      triggered(when.tapsSelf, [fx.untap(ref.target())], {
        targets: [{ id: "t", label: "autre permanent", filter: { objects: { other: true } } }],
        oncePerTurn: true,
        label: "Dégagez un autre permanent",
      }),
    ],
  },
  "Scour for Scrap": {
    spell: modal(
      mode("Cherchez un artefact", [], [fx.search({ types: ["Artifact"] })]),
      mode("Reprenez un artefact", [target.cardInGraveyard("g", { types: ["Artifact"] })], [fx.toHand(ref.target("g"))]),
      mode(
        "Les deux",
        [target.cardInGraveyard("g", { types: ["Artifact"] })],
        [fx.search({ types: ["Artifact"] }), fx.toHand(ref.target("g"))],
      ),
    ),
  },
  "Selfcraft Mechan": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.sacrifice(ref.you, { types: ["Artifact"] }, 1, { optional: true, store: "s" }),
          fx.when(cond.v("s"), fx.reflexive([target.creature("t")], [fx.addCounters(ref.target(), 1), fx.draw(1)])),
        ],
        { label: "Sacrifiez un artefact : marqueur et pioche" },
      ),
    ],
  },
  "Sinister Cryologist": {
    abilities: [
      triggered(when.entersSelf, [fx.pump(ref.target(), -3, 0)], {
        targets: [target.creature("t", { controller: "opponent" })],
        label: "-3/-0",
      }),
    ],
  },
  "Starbreach Whale": {
    abilities: [triggered(when.entersSelf, [fx.surveil(2)], { label: "Surveillance 2" })],
  },
  Starwinder: {
    abilities: [
      triggered(
        when.combatDamage({ types: ["Creature"], controller: "you" }, true),
        fx.may("piocher autant de cartes ?", fx.draw(amount.eventAmount)),
        { label: "Piochez autant de cartes" },
      ),
    ],
  },
  "Tractor Beam": {
    enchant: { filter: { anyOf: [{ types: ["Creature"] }, { subtype: "Spacecraft" }] }, label: "créature ou Vaisseau" },
    controlsEnchanted: true,
    abilities: [triggered(when.entersSelf, [fx.tap(ref.attached)], { label: "Engagez-le" }), doesntUntap("attached")],
  },
};
