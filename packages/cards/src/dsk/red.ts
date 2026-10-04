/** Duskmourn — cartes rouges. */
import {
  activated,
  amount,
  type CardScript,
  CREATURE_OR_ENCHANTMENT,
  CREATURE_YOU_CONTROL,
  cond,
  cost,
  eerie,
  fx,
  GREMLIN,
  modal,
  mode,
  ref,
  spell,
  staticAbility,
  TREASURE,
  target,
  triggered,
  when,
} from "./common";

export const RED: Record<string, CardScript> = {
  "Betrayer's Bargain": {
    additionalCost: { sacrifice: { filter: CREATURE_OR_ENCHANTMENT, count: 1, orPay: cost("{2}") } },
    spell: spell([target.creature()], [fx.exileIfDies(ref.target()), fx.damage(5, ref.target())]),
  },
  "Boilerbilges Ripper": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.sacrifice(ref.you, { ...CREATURE_OR_ENCHANTMENT, other: true }, 1, { optional: true, store: "s" }),
          ...fx.when(cond.v("s"), fx.reflexive([target.any()], [fx.damage(2, ref.target())])),
        ],
        { label: "Sacrifiez une créature ou un enchantement : 2 blessures" },
      ),
    ],
  },
  Chainsaw: {
    abilities: [
      triggered(when.entersSelf, [fx.damage(3, ref.target())], {
        targets: [target.upTo(1, target.creature())],
        label: "3 blessures à une créature",
      }),
      triggered(when.dies({ types: ["Creature"] }), [fx.counters(ref.self, "rev", 1)], {
        batched: true,
        label: "Marqueur de régime",
      }),
      staticAbility("attached", { power: 1 }, { perCounter: "rev", label: "+X/+0 (marqueurs de régime)" }),
    ],
  },
  "Clockwork Percussionist": {
    abilities: [triggered(when.diesSelf, [fx.impulse(1, "yourNextTurn")], { label: "Exilez la carte du dessus, jouable" })],
  },
  "Diversion Specialist": {
    abilities: [
      activated({
        mana: "{1}",
        sacrificeOther: { filter: { ...CREATURE_OR_ENCHANTMENT, other: true } },
        effects: [fx.impulse(1)],
        label: "Exilez la carte du dessus, jouable ce tour-ci",
      }),
    ],
  },
  "Fear of Being Hunted": { keywords: ["mustBeBlocked"] },
  "Fear of Burning Alive": {
    abilities: [
      triggered(when.entersSelf, [fx.damage(4, ref.eachOpponent)], { label: "4 blessures à chaque adversaire" }),
      triggered(
        when.dealsDamage({}, { noncombatOnly: true, to: { players: "opponent" }, anySourceYouControl: true }),
        [fx.damage(amount.eventAmount, ref.target())],
        {
          condition: cond.delirium,
          targets: [target.creature("t", { controller: "opponent" })],
          label: "Délire — autant de blessures à une de ses créatures",
        },
      ),
    ],
  },
  "Fear of Missing Out": {
    abilities: [
      triggered(when.entersSelf, [fx.discard(1), fx.draw(1)], { label: "Défaussez une carte, puis piochez" }),
      triggered(when.attacksSelf, [fx.untap(ref.target()), fx.extraCombat], {
        condition: cond.delirium,
        oncePerTurn: true,
        targets: [target.creature()],
        label: "Délire — dégagez une créature, phase de combat supplémentaire",
      }),
    ],
  },
  Glassworks: {
    abilities: [
      triggered(when.unlockThisDoor, [fx.damage(4, ref.target())], {
        targets: [target.creature("t", { controller: "opponent" })],
        label: "4 blessures à une créature adverse",
      }),
    ],
  },
  "Shattered Yard": {
    abilities: [triggered(when.yourEndStep, [fx.damage(1, ref.eachOpponent)], { label: "1 blessure à chaque adversaire" })],
  },
  "Hand That Feeds": {
    abilities: [
      triggered(when.attacksSelf, [fx.pump(ref.self, 2, 0, ["menace"])], {
        condition: cond.delirium,
        label: "Délire — +2/+0 et la menace",
      }),
    ],
  },
  "Impossible Inferno": {
    spell: spell([target.creature()], [fx.damage(6, ref.target()), ...fx.when(cond.delirium, fx.impulse(1, "yourNextTurn"))]),
  },
  "Infernal Phantom": {
    abilities: [
      eerie([fx.pump(ref.self, 2, 0)], { label: "+2/+0" }),
      triggered(when.diesSelf, [fx.damage(amount.powerOf(ref.self), ref.target())], {
        targets: [target.any()],
        label: "Blessures égales à sa force",
      }),
    ],
  },
  "Irreverent Gremlin": {
    abilities: [
      triggered(
        when.enters({ types: ["Creature"], controller: "you", other: true, maxPower: 2 }),
        // « Faites ceci une seule fois par tour » : seulement si une carte a été défaussée.
        fx.may(
          "Défausser une carte pour piocher ?",
          fx.discard(1, ref.you, { store: "d" }),
          fx.when(cond.v("d"), fx.draw(1), fx.doneOncePerTurn),
        ),
        { oncePerTurn: "ifDone", label: "Défaussez, puis piochez" },
      ),
    ],
  },
  "Most Valuable Slayer": {
    abilities: [
      triggered(when.attackWith(), [fx.pump(ref.target(), 1, 0, ["firstStrike"])], {
        targets: [target.creature("t", { attacking: true })],
        label: "+1/+0 et l'initiative",
      }),
    ],
  },
  "Painter's Studio": {
    abilities: [
      triggered(when.unlockThisDoor, [fx.exileTop(ref.you, 2, "e"), fx.grantPlay(ref.stored("e"), { untilYourNextTurn: true })], {
        label: "Exilez les deux cartes du dessus, jouables",
      }),
    ],
  },
  "Defaced Gallery": {
    abilities: [
      triggered(when.attackWith(), [fx.pumpAll({ ...CREATURE_YOU_CONTROL, attacking: true }, 1, 0)], {
        label: "Vos attaquants +1/+0",
      }),
    ],
  },
  "Piggy Bank": {
    abilities: [triggered(when.diesSelf, [fx.createTokens(TREASURE)], { label: "Jeton Trésor" })],
  },
  Pyroclasm: { spell: spell([], [fx.damageAll(2, { types: ["Creature"] })]) },
  "Ragged Playmate": {
    abilities: [
      activated({
        mana: "{1}",
        tap: true,
        targets: [target.creature("t", { maxPower: 2 })],
        effects: [fx.pump(ref.target(), 0, 0, ["unblockable"])],
        label: "Une créature de force 2 ou moins ne peut pas être bloquée",
      }),
    ],
  },
  "Rampaging Soulrager": {
    abilities: [
      staticAbility(
        "self",
        { power: 3 },
        {
          condition: cond.amountAtLeast(amount.unlockedDoors, 2),
          label: "+3/+0 (deux portes déverrouillées)",
        },
      ),
    ],
  },
  "Razorkin Hordecaller": {
    abilities: [triggered(when.attackWith(), [fx.createTokens(GREMLIN)], { label: "Jeton Diablotin 1/1" })],
  },
  "Razorkin Needlehead": {
    abilities: [
      staticAbility(
        "self",
        { addKeywords: ["firstStrike"] },
        { condition: cond.yourTurn, label: "Initiative pendant votre tour" },
      ),
      triggered(when.draw(undefined, "opponent"), [fx.damage(1, ref.eventPlayer)], { label: "1 blessure au joueur qui pioche" }),
    ],
  },
  "Ripchain Razorkin": {
    abilities: [
      activated({
        mana: "{2}{R}",
        sacrificeOther: { filter: { types: ["Land"] } },
        effects: [fx.draw(1)],
        label: "Sacrifiez un terrain : piochez une carte",
      }),
    ],
  },
  "Ticket Booth": {
    abilities: [triggered(when.unlockThisDoor, [fx.manifestDread], { label: "Manifestation effroyable" })],
  },
  "Tunnel of Hate": {
    abilities: [
      triggered(when.attackWith(), [fx.pump(ref.target(), 0, 0, ["doubleStrike"])], {
        targets: [target.creature("t", { attacking: true })],
        label: "Double initiative",
      }),
    ],
  },
  "Untimely Malfunction": {
    spell: modal(
      mode("Détruisez un artefact", [target.permanent("a", ["Artifact"], {}, "artefact")], [fx.destroy(ref.target("a"))]),
      mode(
        "Changez la cible d'un sort ou d'une capacité",
        [target.stackItemSingleTarget("s")],
        [fx.changeTarget(ref.target("s"))],
      ),
      mode(
        "Une ou deux créatures ne peuvent pas bloquer",
        [target.between(1, 2, target.creature("c"))],
        [fx.pump(ref.target("c"), 0, 0, ["cantBlock"])],
      ),
    ),
  },
  "Vengeful Possession": {
    spell: spell(
      [target.creature()],
      [
        fx.gainControl(ref.target()),
        fx.untap(ref.target()),
        fx.pump(ref.target(), 0, 0, ["haste"]),
        ...fx.may("Défausser une carte pour piocher ?", fx.discard(1, ref.you, { store: "d" }), fx.when(cond.v("d"), fx.draw(1))),
      ],
    ),
  },
  "Vicious Clown": {
    abilities: [
      triggered(when.enters({ types: ["Creature"], controller: "you", other: true, maxPower: 2 }), [fx.pump(ref.self, 2, 0)], {
        label: "+2/+0",
      }),
    ],
  },
  "Violent Urge": {
    spell: spell(
      [target.creature()],
      [fx.pump(ref.target(), 1, 0, ["firstStrike"]), ...fx.when(cond.delirium, fx.pump(ref.target(), 0, 0, ["doubleStrike"]))],
    ),
  },
};
