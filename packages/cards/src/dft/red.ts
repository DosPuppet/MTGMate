/** Aetherdrift — cartes rouges. */
import type { CardScript } from "@mtgx/engine";
import {
  amount,
  cond,
  fx,
  MOUNT_OR_VEHICLE,
  modal,
  mode,
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
        label: "+2/+0 et le piétinement",
      }),
    ],
  },
  "Clamorous Ironclad": {},
  "Count on Luck": {
    abilities: [
      triggered(when.yourUpkeep, [fx.exileTop(ref.you, 1, "c"), fx.grantPlay(ref.stored("c"))], {
        label: "Exilez la carte du dessus, jouable ce tour-ci",
      }),
    ],
  },
  "Crash and Burn": {
    spell: modal(
      mode("Détruisez un Véhicule", [targetObj("t", { subtype: "Vehicle" }, "Véhicule")], [fx.destroy(ref.target())]),
      mode("6 blessures", [target.creatureOrPlaneswalker("t")], [fx.damage(6, ref.target())]),
    ),
  },
  "Dracosaur Auxiliary": {
    abilities: [whileSaddled([fx.damage(2, ref.target())], { targets: [target.any("t")], label: "2 blessures" })],
  },
  "Dynamite Diver": {
    keywords: ["crewPlus2"],
    abilities: [triggered(when.diesSelf, [fx.damage(1, ref.target())], { targets: [target.any("t")], label: "1 blessure" })],
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
        { label: "Sacrifiez : détruisez un artefact" },
      ),
    ],
  },
  "Gilded Ghoda": { abilities: [whileSaddled([fx.createTokens(TREASURE)], { label: "Trésor" })] },
  "Lightning Strike": { spell: spell([target.any("t")], [fx.damage(3, ref.target())]) },
  "Magmakin Artillerist": {
    abilities: [
      triggered(when.discardBatch(), [fx.damage(amount.eventAmount, ref.eachOpponent)], {
        label: "Autant de blessures à chaque adversaire",
      }),
      whenCycled([fx.damage(1, ref.eachOpponent)], { label: "1 blessure à chaque adversaire" }),
    ],
  },
  "Marauding Mako": {
    abilities: [
      triggered(when.discardBatch(), [fx.addCounters(ref.self, amount.eventAmount)], { label: "Autant de marqueurs +1/+1" }),
    ],
  },
  "Pedal to the Metal": { spell: spell([target.creature("t")], [fx.pump(ref.target(), amount.x, 0, ["firstStrike"])]) },
  "Reckless Velocitaur": {
    abilities: [
      triggered(when.crews(true), [fx.pump(ref.eventObject, 2, 0, ["trample"])], {
        label: "La Monture ou le Véhicule : +2/+0 et le piétinement",
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
