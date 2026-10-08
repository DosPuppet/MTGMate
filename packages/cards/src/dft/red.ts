/** Aetherdrift — red cards. */
import type { CardScript } from "@mtgx/engine";
import {
  amount,
  cond,
  fx,
  MOUNT_OR_VEHICLE,
  modal,
  mode,
  powerFor,
  powerRuleAbility,
  ref,
  spell,
  TREASURE,
  target,
  targetObj,
  triggered,
  when,
  whenCycled,
  whileSaddled,
} from "./common";

export const RED: Record<string, CardScript> = {
  "Burner Rocket": {
    abilities: [
      triggered(when.entersSelf, [fx.pump(ref.target(), 2, 0, ["trample"])], {
        targets: [target.creature("t", { controller: "you" })],
        label: "+2/+0 and gains trample",
      }),
    ],
  },
  "Clamorous Ironclad": {},
  "Count on Luck": {
    abilities: [
      triggered(when.yourUpkeep, [fx.exileTop(ref.you, 1, "c"), fx.grantPlay(ref.stored("c"))], {
        label: "Exile the top card, playable this turn",
      }),
    ],
  },
  "Crash and Burn": {
    spell: modal(
      mode("Destroy target Vehicle", [targetObj("t", { subtype: "Vehicle" }, "Vehicle")], [fx.destroy(ref.target())]),
      mode("6 damage", [target.creatureOrPlaneswalker("t")], [fx.damage(6, ref.target())]),
    ),
  },
  "Dracosaur Auxiliary": {
    abilities: [whileSaddled([fx.damage(2, ref.target())], { targets: [target.any("t")], label: "2 damage" })],
  },
  "Dynamite Diver": {
    abilities: [
      powerRuleAbility(powerFor.pilot),
      triggered(when.diesSelf, [fx.damage(1, ref.target())], { targets: [target.any("t")], label: "1 damage" }),
    ],
  },
  "Fuel the Flames": { spell: spell([], [fx.damageAll(2, { types: ["Creature"] })]) },
  "Gastal Blockbuster": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.sacrifice(ref.you, { anyOf: [{ types: ["Creature"] }, { subtype: "Vehicle" }] }, 1, { optional: true, store: "s" }),
          fx.when(
            cond.v("s"),
            fx.reflexive([target.permanent("t", ["Artifact"], { controller: "opponent" })], [fx.destroy(ref.target())]),
          ),
        ],
        { label: "Sacrifice: destroy an artifact" },
      ),
    ],
  },
  "Gilded Ghoda": { abilities: [whileSaddled([fx.createTokens(TREASURE)], { label: "Treasure" })] },
  "Lightning Strike": { spell: spell([target.any("t")], [fx.damage(3, ref.target())]) },
  "Magmakin Artillerist": {
    abilities: [
      triggered(when.discardBatch(), [fx.damage(amount.eventAmount, ref.eachOpponent)], {
        label: "That much damage to each opponent",
      }),
      whenCycled([fx.damage(1, ref.eachOpponent)], { label: "1 damage to each opponent" }),
    ],
  },
  "Marauding Mako": {
    abilities: [
      triggered(when.discardBatch(), [fx.addCounters(ref.self, amount.eventAmount)], { label: "That many +1/+1 counters" }),
    ],
  },
  "Pedal to the Metal": { spell: spell([target.creature("t")], [fx.pump(ref.target(), amount.x, 0, ["firstStrike"])]) },
  "Reckless Velocitaur": {
    abilities: [
      triggered(when.crews(true), [fx.pump(ref.eventObject, 2, 0, ["trample"])], {
        label: "The Mount or Vehicle: +2/+0 and trample",
      }),
    ],
  },
  "Road Rage": {
    spell: spell(
      [target.creatureOrPlaneswalker("t")],
      [fx.damage(amount.plus(2, amount.count({ ...MOUNT_OR_VEHICLE, controller: "you" })), ref.target())],
    ),
  },
  Skycrash: { spell: spell([target.permanent("t", ["Artifact"])], [fx.destroy(ref.target())]) },
};
