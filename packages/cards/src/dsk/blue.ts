/** Duskmourn — cartes bleues. */
import {
  amount,
  type CardScript,
  cond,
  eerie,
  entersWith,
  fx,
  glimmer,
  modal,
  mode,
  ref,
  SPIRIT_BLUE,
  spell,
  staticAbility,
  target,
  triggered,
  triggeredModal,
  when,
} from "./common";

export const BLUE: Record<string, CardScript> = {
  "Bottomless Pool": {
    abilities: [
      triggered(when.unlockThisDoor, [fx.bounce(ref.target())], {
        targets: [target.upTo(1, target.creature())],
        label: "Renvoyez une créature",
      }),
    ],
  },
  "Locker Room": {
    abilities: [
      triggered(when.combatDamageBatch({ types: ["Creature"], controller: "you" }), [fx.draw(1)], {
        label: "Piochez une carte",
      }),
    ],
  },
  "Clammy Prowler": {
    abilities: [
      triggered(when.attacksSelf, [fx.pump(ref.target(), 0, 0, ["unblockable"])], {
        targets: [target.creature("t", { attacking: true, other: true })],
        label: "Une autre créature attaquante ne peut pas être bloquée",
      }),
    ],
  },
  "Don't Make a Sound": {
    spell: spell(
      [target.spell()],
      [
        ...fx.unlessPays(ref.controllerOf(ref.target()), { mana: "{2}", paidStore: "paid" }, fx.counter(ref.target())),
        ...fx.when(cond.v("paid"), fx.surveil(2)),
      ],
    ),
  },
  "Duskmourn's Domination": {
    enchant: { filter: { types: ["Creature"] }, label: "créature" },
    controlsEnchanted: true,
    abilities: [staticAbility("attached", { power: -3, loseAllAbilities: true }, { label: "-3/-0, perd toutes ses capacités" })],
  },
  "Enter the Enigma": {
    spell: spell([target.creature()], [fx.pump(ref.target(), 0, 0, ["unblockable"]), fx.draw(1)]),
  },
  "Entity Tracker": {
    abilities: [eerie([fx.draw(1)], { label: "Piochez une carte" })],
  },
  "Erratic Apparition": {
    abilities: [eerie([fx.pump(ref.self, 1, 1)], { label: "+1/+1" })],
  },
  "Fear of Failed Tests": {
    abilities: [triggered(when.combatDamageToPlayer, [fx.draw(amount.eventAmount)], { label: "Piochez autant de cartes" })],
  },
  "Fear of Falling": {
    abilities: [
      triggered(when.attacksSelf, [fx.modify(ref.target(), { power: -2, removeKeywords: ["flying"] }, "untilYourNextTurn")], {
        targets: [target.of(ref.defendingPlayer, target.creature("t"), "créature du joueur défenseur")],
        label: "-2/-0 et perd le vol",
      }),
    ],
  },
  "Get Out": {
    spell: modal(
      mode(
        "Contrecarrez un sort de créature ou d'enchantement",
        [target.spell("t", { types: ["Creature", "Enchantment"] }, "sort de créature ou d'enchantement")],
        [fx.counter(ref.target())],
      ),
      mode(
        "Renvoyez une ou deux créatures ou enchantements",
        [
          target.between(
            1,
            2,
            target.permanent("b", ["Creature", "Enchantment"], { owner: "you" }, "créature ou enchantement que vous possédez"),
          ),
        ],
        [fx.bounce(ref.target("b"))],
      ),
    ),
  },
  Glimmerburst: { spell: spell([], [fx.draw(2), glimmer()]) },
  "Meat Locker": {
    abilities: [
      triggered(when.unlockThisDoor, [fx.tap(ref.target()), fx.counters(ref.target(), "stun", 2)], {
        targets: [target.upTo(1, target.creature())],
        label: "Engagez une créature, deux marqueurs d'étourdissement",
      }),
    ],
  },
  "Drowned Diner": {
    abilities: [triggered(when.unlockThisDoor, [fx.draw(3), fx.discard(1)], { label: "Piochez trois cartes, défaussez-en une" })],
  },
  "Piranha Fly": { abilities: [entersWith({ tapped: true })] },
  "Scrabbling Skullcrab": {
    abilities: [eerie([fx.mill(2, ref.target())], { targets: [target.player()], label: "Meule 2" })],
  },
  "Silent Hallcreeper": {
    keywords: ["unblockable"],
    abilities: [
      triggeredModal(
        when.combatDamageToPlayer,
        [
          mode("Deux marqueurs +1/+1", [], [fx.addCounters(ref.self, 2)]),
          mode("Piochez une carte", [], [fx.draw(1)]),
          mode(
            "Devient une copie d'une autre créature",
            [target.creature("t", { controller: "you", other: true })],
            [fx.becomeCopy(ref.self, ref.target(), "permanent")],
          ),
        ],
        { uniqueModes: true, label: "Un mode pas encore choisi" },
      ),
    ],
  },
  "Stalked Researcher": {
    abilities: [eerie([fx.pump(ref.self, 0, 0, ["attacksDespiteDefender"])], { label: "Peut attaquer ce tour-ci" })],
  },
  "Tunnel Surveyor": {
    abilities: [triggered(when.entersSelf, [glimmer()], { label: "Jeton Lueur 1/1" })],
  },
  "Twist Reality": {
    spell: modal(
      mode("Contrecarrez un sort", [target.spell()], [fx.counter(ref.target())]),
      mode("Manifestation effroyable", [], [fx.manifestDread]),
    ),
  },
  "Unnerving Grasp": {
    spell: spell([target.upTo(1, target.nonland())], [fx.bounce(ref.target()), fx.manifestDread]),
  },
  "Unwilling Vessel": {
    abilities: [
      eerie([fx.counters(ref.self, "possession", 1)], { label: "Marqueur de possession" }),
      triggered(when.diesSelf, [fx.createXXToken(SPIRIT_BLUE, amount.lkiCounters("any"))], { label: "Esprit X/X volant" }),
    ],
  },
  "Vanish from Sight": {
    spell: spell([target.nonland()], [fx.topOrBottom(ref.target()), fx.surveil(1)]),
  },
};
