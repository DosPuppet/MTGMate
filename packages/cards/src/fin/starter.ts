/** Final Fantasy — starter deck cards (numbers outside the main set). */
import type { CardScript } from "@mtgx/engine";
import { amount, cond, fx, ref, spell, staticAbility, target, triggered, when } from "./common";

const EQUIPMENT_YOU = { subtype: "Equipment", controller: "you" as const };

export const STARTER: Record<string, CardScript> = {
  "Beatrix, Loyal General": {
    abilities: [
      // "Any number of Equipment": chosen on resolution, none if you wish.
      triggered(
        when.yourCombat,
        [
          fx.chooseAmong(ref.permanentsOf(ref.you, EQUIPMENT_YOU), ref.you, "eq", {
            anyNumber: true,
            prompt: "Choose the Equipment to attach",
          }),
          fx.attach(ref.target(), ref.stored("eq")),
        ],
        { targets: [target.creature("t", { controller: "you" })], label: "Attach your Equipment" },
      ),
    ],
  },
  "Rosa, Resolute White Mage": {
    abilities: [
      triggered(when.yourCombat, [fx.addCounters(ref.target(), 1), fx.pump(ref.target(), 0, 0, ["lifelink"])], {
        targets: [target.creature("t", { controller: "you" })],
        label: "+1/+1 counter and lifelink",
      }),
    ],
  },
  "Ultimecia, Temporal Threat": {
    abilities: [
      triggered(when.entersSelf, [fx.tap(ref.permanentsOf(ref.eachOpponent, { types: ["Creature"] }))], {
        label: "Tap creatures your opponents control",
      }),
      triggered(when.combatDamage({ types: ["Creature"], controller: "you" }, true), [fx.draw(1)], { label: "Draw" }),
    ],
  },
  "Seymour Flux": {
    abilities: [
      triggered(when.yourUpkeep, fx.mayPayLife(1, "Pay 1 life to draw?", fx.draw(1), fx.addCounters(ref.self, 1)), {
        label: "Pay 1 life: draw, +1/+1 counter",
      }),
    ],
  },
  "Lightning, Security Sergeant": {
    abilities: [
      triggered(
        when.combatDamageToPlayer,
        [
          fx.exileTop(ref.you, 1, "l"),
          // "For as long as you control Lightning": that object (another Lightning does not count).
          fx.grantPlay(ref.stored("l"), { forever: true, condition: cond.controls({ self: true }) }),
        ],
        { label: "Exile the top card, playable" },
      ),
    ],
  },
  "Sephiroth, Planet's Heir": {
    abilities: [
      triggered(when.entersSelf, [fx.pumpAll({ types: ["Creature"], controller: "opponent" }, -2, -2)], {
        label: "Creatures your opponents control get -2/-2",
      }),
      triggered(when.dies({ types: ["Creature"], controller: "opponent" }), [fx.addCounters(ref.self, 1)], {
        label: "+1/+1 counter",
      }),
    ],
  },
  "Xande, Dark Mage": {
    abilities: [
      staticAbility(
        "self",
        { power: 1, toughness: 1 },
        { perGraveyard: { notTypes: ["Creature", "Land"] }, label: "+1/+1 for each noncreature, nonland card in your graveyard" },
      ),
    ],
  },
  "Deadly Embrace": {
    spell: spell(
      [target.creature("t", { controller: "opponent" })],
      [fx.destroy(ref.target()), fx.draw(amount.creaturesDiedThisTurn)],
    ),
  },
  "Judgment Bolt": {
    spell: spell(
      [target.creature("t")],
      [fx.damage(5, ref.target()), fx.damage(amount.count(EQUIPMENT_YOU), ref.controllerOf(ref.target()))],
    ),
  },
  "Magitek Scythe": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.may(
            "Attach this Equipment to the creature?",
            fx.attach(ref.target()),
            fx.pump(ref.target(), 0, 0, ["firstStrike", "mustBeBlocked"]),
          ),
        ],
        { targets: [target.creature("t", { controller: "you" })], label: "A Test of Your Reflexes!" },
      ),
      staticAbility("attached", { power: 2, toughness: 1 }, { label: "+2/+1" }),
    ],
  },
  "Ultima Weapon": {
    abilities: [
      triggered(when.attacks({ attached: "host" }), [fx.destroy(ref.target())], {
        targets: [target.creature("t", { controller: "opponent" })],
        label: "Destroy a creature an opponent controls",
      }),
      staticAbility("attached", { power: 7, toughness: 7 }, { label: "+7/+7" }),
    ],
  },
};
