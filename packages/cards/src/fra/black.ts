/** Reality Fracture — cartes noires. */
import {
  activated,
  amount,
  type CardScript,
  CREATURE_YOU_CONTROL,
  cond,
  fx,
  modal,
  mode,
  ref,
  spell,
  target,
  triggered,
  when,
} from "./common";

export const BLACK: Record<string, CardScript> = {
  "Cast Away Doubt": { spell: spell([], [fx.draw(2), fx.damage(2, ref.eachPlayer)]) },
  "Darklight Phoenix": {
    abilities: [
      triggered(when.yourCombat, [fx.toBattlefield(ref.self)], {
        condition: cond.creaturesDied(2),
        fromGraveyard: true,
        label: "Deux créatures mortes : revient du cimetière",
      }),
    ],
  },
  "Last Gasp": { spell: spell([target.creature("t")], [fx.pump(ref.target(), -3, -3)]) },
  "Multiply by Zero": {
    spell: spell([target.creature("t")], [fx.modify(ref.target(), { setPower: 0, setToughness: 0 })]),
  },
  "Rampart Hunter": {
    abilities: [
      triggered(when.entersSelf, [fx.pump(ref.target(), 2, 2, ["deathtouch"])], {
        targets: [target.creature("t")],
        label: "+2/+2 et contact mortel",
      }),
    ],
  },
  "Rank Rat": {
    abilities: [triggered(when.entersSelf, [fx.discard(1, ref.eachOpponent)], { label: "chaque adversaire défausse" })],
  },
  "Rise of the Deathbringer": {
    spell: modal(
      mode(
        "Piocher selon la plus grande force, perdre autant de PV",
        [],
        [fx.draw(amount.maxPower(CREATURE_YOU_CONTROL)), fx.loseLife(amount.maxPower(CREATURE_YOU_CONTROL))],
      ),
      mode("Toutes les créatures -3/-3", [], [fx.pumpAll({ types: ["Creature"] }, -3, -3)]),
    ),
  },
  "Screeching Soulbreaker": {
    abilities: [triggered(when.attacksSelf, [fx.damage(1, ref.eachOpponent), fx.gainLife(1)], { label: "1 blessure, +1 PV" })],
  },
  "Theoretical Necromancer": {
    abilities: [
      activated({
        mana: "{3}{B}",
        fromGraveyard: true,
        exileSelf: true,
        targets: [target.cardInGraveyard("t", { types: ["Creature"], other: true }, "you", "autre carte de créature")],
        effects: [fx.toHand(ref.target())],
        label: "Récupérer une créature",
      }),
    ],
  },
  "Tinybones, Pocket Nuisance": {
    abilities: [
      triggered(when.entersSelf, [fx.discard(1, ref.eachOpponent)], { label: "chaque adversaire défausse" }),
      triggered(when.discard("any"), [fx.damage(1, ref.eachOpponent)], { label: "défausse : 1 blessure" }),
    ],
  },
};
