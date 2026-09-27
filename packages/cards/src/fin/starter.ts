/** Final Fantasy — cartes des decks de démarrage (numéros hors du set principal). */
import type { CardScript } from "@mtgx/engine";
import { amount, cond, fx, ref, spell, staticAbility, target, triggered, when } from "./common";

const EQUIPMENT_YOU = { subtype: "Equipment", controller: "you" as const };

export const STARTER: Record<string, CardScript> = {
  "Beatrix, Loyal General": {
    abilities: [
      // Approximation : tous vos Équipements ou aucun (pas de choix un par un).
      triggered(
        when.yourCombat,
        [
          fx.may(
            "Attacher tous vos Équipements à cette créature ?",
            fx.attach(ref.target(), ref.permanentsOf(ref.you, EQUIPMENT_YOU)),
          ),
        ],
        { targets: [target.creature("t", { controller: "you" })], label: "Attachez vos Équipements" },
      ),
    ],
  },
  "Rosa, Resolute White Mage": {
    abilities: [
      triggered(when.yourCombat, [fx.addCounters(ref.target(), 1), fx.pump(ref.target(), 0, 0, ["lifelink"])], {
        targets: [target.creature("t", { controller: "you" })],
        label: "Marqueur +1/+1 et le lien de vie",
      }),
    ],
  },
  "Ultimecia, Temporal Threat": {
    abilities: [
      triggered(when.entersSelf, [fx.tap(ref.permanentsOf(ref.eachOpponent, { types: ["Creature"] }))], {
        label: "Engagez les créatures adverses",
      }),
      triggered(when.combatDamage({ types: ["Creature"], controller: "you" }, true), [fx.draw(1)], { label: "Piochez" }),
    ],
  },
  "Seymour Flux": {
    abilities: [
      triggered(
        when.yourUpkeep,
        fx.mayPayLife(1, "Payer 1 point de vie pour piocher ?", fx.draw(1), fx.addCounters(ref.self, 1)),
        { label: "Payez 1 PV : piochez, marqueur +1/+1" },
      ),
    ],
  },
  "Lightning, Security Sergeant": {
    abilities: [
      triggered(
        when.combatDamageToPlayer,
        [
          fx.exileTop(ref.you, 1, "l"),
          // Approximation : jouable tant que vous contrôlez une créature nommée Lightning, Security Sergeant.
          fx.grantPlay(ref.stored("l"), {
            forever: true,
            condition: cond.controls({ types: ["Creature"], name: "Lightning, Security Sergeant" }),
          }),
        ],
        { label: "Exilez la carte du dessus, jouable" },
      ),
    ],
  },
  "Sephiroth, Planet's Heir": {
    abilities: [
      triggered(when.entersSelf, [fx.pumpAll({ types: ["Creature"], controller: "opponent" }, -2, -2)], {
        label: "Créatures adverses -2/-2",
      }),
      triggered(when.dies({ types: ["Creature"], controller: "opponent" }), [fx.addCounters(ref.self, 1)], {
        label: "Marqueur +1/+1",
      }),
    ],
  },
  "Xande, Dark Mage": {
    abilities: [
      staticAbility(
        "self",
        { power: 1, toughness: 1 },
        { perGraveyard: { notTypes: ["Creature", "Land"] }, label: "+1/+1 par carte non-créature non-terrain au cimetière" },
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
            "Attacher cet Équipement à la créature ?",
            fx.attach(ref.target()),
            fx.pump(ref.target(), 0, 0, ["firstStrike", "mustBeBlocked"]),
          ),
        ],
        { targets: [target.creature("t", { controller: "you" })], label: "Un test de vos réflexes !" },
      ),
      staticAbility("attached", { power: 2, toughness: 1 }, { label: "+2/+1" }),
    ],
  },
  "Ultima Weapon": {
    abilities: [
      triggered(when.attacks({ attachedToSource: true }), [fx.destroy(ref.target())], {
        targets: [target.creature("t", { controller: "opponent" })],
        label: "Détruisez une créature adverse",
      }),
      staticAbility("attached", { power: 7, toughness: 7 }, { label: "+7/+7" }),
    ],
  },
};
