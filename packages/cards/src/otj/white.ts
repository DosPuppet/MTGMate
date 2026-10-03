/** Outlaws of Thunder Junction — cartes blanches. */
import type { CardScript } from "@mtgx/engine";
import {
  activated,
  amount,
  CREATURE_YOU_CONTROL,
  cond,
  entersWith,
  fx,
  mercenary,
  OTHER_CREATURE_YOU_CONTROL,
  OX,
  ref,
  SHEEP,
  spell,
  spree,
  staticAbility,
  target,
  triggered,
  when,
  whileSaddled,
} from "./common";

const OPP_HAS_MORE_LANDS = cond.amountAtLeast(
  amount.plus(
    amount.count({ types: ["Land"], controller: "opponent" }),
    amount.neg(amount.count({ types: ["Land"], controller: "you" })),
  ),
  1,
);
const PLAINS = { types: ["Land" as const], subtype: "Plains" };

export const WHITE: Record<string, CardScript> = {
  "Armored Armadillo": {
    abilities: [
      activated({
        mana: "{3}{W}",
        effects: [fx.pump(ref.self, amount.toughnessOf(ref.self), 0)],
        label: "+X/+0 (son endurance)",
      }),
    ],
  },
  "Bounding Felidar": {
    abilities: [
      whileSaddled([fx.addCountersAll(OTHER_CREATURE_YOU_CONTROL, 1), fx.gainLife(amount.count(OTHER_CREATURE_YOU_CONTROL))], {
        label: "Marqueur sur vos autres créatures, +1 PV chacune",
      }),
    ],
  },
  "Bovine Intervention": {
    spell: spell(
      [target.permanent("t", ["Artifact", "Creature"], {}, "artefact ou créature")],
      [fx.destroy(ref.target()), fx.createTokens(OX, 1, ref.controllerOf(ref.target()))],
    ),
  },
  "Bridled Bighorn": { abilities: [whileSaddled([fx.createTokens(SHEEP)], { label: "Mouton 1/1" })] },
  "Claim Jumper": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.search(PLAINS, { to: "battlefield", tapped: true }),
          fx.when(OPP_HAS_MORE_LANDS, fx.search(PLAINS, { to: "battlefield", tapped: true })),
        ],
        { condition: OPP_HAS_MORE_LANDS, label: "Plaine engagée (deux fois au plus)" },
      ),
    ],
  },
  "Dust Animus": {
    abilities: [
      entersWith({ counters: 2, condition: cond.controls({ types: ["Land"], tapped: false }, 5) }),
      entersWith({ counters: 1, counterKind: "lifelink", condition: cond.controls({ types: ["Land"], tapped: false }, 5) }),
    ],
  },
  "Eriette's Lullaby": {
    spell: spell([target.creature("t", { tapped: true })], [fx.destroy(ref.target()), fx.gainLife(2)]),
  },
  "Final Showdown": {
    spell: spree(
      {
        cost: "{1}",
        label: "Les créatures perdent leurs capacités",
        effects: [fx.modifyAll({ types: ["Creature"] }, { loseAllAbilities: true })],
      },
      {
        cost: "{1}",
        label: "Une de vos créatures devient indestructible",
        // « Choisissez » : pas de cible, le choix se fait à la résolution.
        effects: [
          fx.chooseAmong(ref.permanentsOf(ref.you, { types: ["Creature"] }), ref.you, "i", {
            prompt: "Choisissez une créature que vous contrôlez",
          }),
          fx.pump(ref.stored("i"), 0, 0, ["indestructible"]),
        ],
      },
      { cost: "{3}{W}{W}", label: "Détruisez toutes les créatures", effects: [fx.destroyAll({ types: ["Creature"] })] },
    ),
  },
  "Frontier Seeker": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.lookAtTop(5, {
            filter: { anyOf: [{ types: ["Creature"], subtype: "Mount" }, { subtype: "Plains" }] },
            count: 1,
            rest: "bottom",
          }),
        ],
        { label: "Une Monture ou une Plaine parmi les cinq du dessus" },
      ),
    ],
  },
  "Getaway Glamer": {
    spell: spree(
      {
        cost: "{1}",
        label: "Exilez une créature non-jeton, elle revient",
        targets: [target.creature("e", { token: false })],
        effects: [
          fx.exileCard(ref.target("e"), { name: "g" }),
          fx.delayed([fx.toBattlefield(ref.target("g"))], { g: ref.stored("g") }),
        ],
      },
      {
        cost: "{2}",
        label: "Détruisez la créature de plus grande force",
        targets: [target.creature("d")],
        effects: [
          fx.when(
            cond.amountAtLeast(
              amount.plus(amount.powerOf(ref.target("d")), amount.neg(amount.maxPower({ types: ["Creature"] }))),
              0,
            ),
            fx.destroy(ref.target("d")),
          ),
        ],
      },
    ),
  },
  "Holy Cow": { abilities: [triggered(when.entersSelf, [fx.gainLife(2), fx.scry(1)], { label: "+2 PV, regard 1" })] },
  "Inventive Wingsmith": {
    abilities: [
      triggered(when.yourEndStep, [fx.counters(ref.self, "flying", 1)], {
        condition: cond.all(cond.not(cond.handSpellThisTurn), cond.not(cond.counterAtLeast("flying", 1))),
        label: "Marqueur vol",
      }),
    ],
  },
  "Lassoed by the Law": {
    abilities: [
      triggered(when.entersSelf, [fx.exileUntilLeaves(ref.target())], {
        targets: [target.nonland("t", { controller: "opponent" })],
        label: "Exilez un permanent non-terrain",
      }),
      triggered(when.entersSelf, [mercenary()], { label: "Mercenaire 1/1" }),
    ],
  },
  "Mystical Tether": {
    flashExtraCost: "{2}",
    abilities: [
      triggered(when.entersSelf, [fx.exileUntilLeaves(ref.target())], {
        targets: [target.permanent("t", ["Artifact", "Creature"], { controller: "opponent" }, "artefact ou créature")],
        label: "Exilez un artefact ou une créature",
      }),
    ],
  },
  "Nurturing Pixie": {
    abilities: [
      triggered(when.entersSelf, [fx.when(cond.targetMatches("t", {}), fx.bounce(ref.target()), fx.addCounters(ref.self, 1))], {
        targets: [target.upTo(1, target.nonland("t", { controller: "you", notSubtype: "Faerie" }))],
        label: "Renvoyez un permanent, marqueur +1/+1",
      }),
    ],
  },
  "Omenport Vigilante": {
    abilities: [
      staticAbility("self", { addKeywords: ["doubleStrike"] }, { condition: cond.crime, label: "Double initiative (crime)" }),
    ],
  },
  "One Last Job": {
    spell: spree(
      {
        cost: "{2}",
        label: "Une créature",
        targets: [target.cardInGraveyard("c", { types: ["Creature"] }, "you", "carte de créature")],
        effects: [fx.toBattlefield(ref.target("c"))],
      },
      {
        cost: "{1}",
        label: "Une Monture ou un Véhicule",
        targets: [
          target.cardInGraveyard(
            "m",
            { anyOf: [{ subtype: "Mount" }, { subtype: "Vehicle" }] },
            "you",
            "carte de Monture ou de Véhicule",
          ),
        ],
        effects: [fx.toBattlefield(ref.target("m"))],
      },
      {
        cost: "{1}",
        label: "Une Aura ou un Équipement attaché",
        targets: [
          target.cardInGraveyard(
            "a",
            { anyOf: [{ subtype: "Aura" }, { subtype: "Equipment" }] },
            "you",
            "carte d'Aura ou d'Équipement",
          ),
        ],
        // La créature est choisie à la résolution (pas ciblée) : celle que renvoie le premier mode peut l'être.
        effects: [
          fx.chooseAmong(ref.permanentsOf(ref.you, { types: ["Creature"] }), ref.you, "h", {
            prompt: "One Last Job : la créature à laquelle l'attacher",
          }),
          fx.moveTo(ref.target("a"), { to: "battlefield" }, undefined, ref.stored("h")),
        ],
      },
    ),
  },
  "Outlaw Medic": { abilities: [triggered(when.diesSelf, [fx.draw(1)], { label: "Piochez" })] },
  "Prosperity Tycoon": {
    abilities: [
      triggered(when.entersSelf, [mercenary()], { label: "Mercenaire 1/1" }),
      activated({
        mana: "{2}",
        sacrificeOther: { filter: { token: true } },
        effects: [fx.pump(ref.self, 0, 0, ["indestructible"]), fx.tap(ref.self)],
        label: "Indestructible, engagez-la",
      }),
    ],
  },
  "Requisition Raid": {
    spell: spree(
      {
        cost: "{1}",
        label: "Détruisez un artefact",
        targets: [target.permanent("a", ["Artifact"])],
        effects: [fx.destroy(ref.target("a"))],
      },
      {
        cost: "{1}",
        label: "Détruisez un enchantement",
        targets: [target.permanent("e", ["Enchantment"])],
        effects: [fx.destroy(ref.target("e"))],
      },
      {
        cost: "{1}",
        label: "Marqueur +1/+1 sur les créatures d'un joueur",
        targets: [target.player("p")],
        effects: [fx.addCounters(ref.permanentsOf(ref.target("p"), { types: ["Creature"] }), 1)],
      },
    ),
  },
  "Rustler Rampage": {
    spell: spree(
      {
        cost: "{1}",
        label: "Dégagez les créatures d'un joueur",
        targets: [target.player("p")],
        effects: [fx.untap(ref.permanentsOf(ref.target("p"), { types: ["Creature"] }))],
      },
      {
        cost: "{1}",
        label: "Double initiative",
        targets: [target.creature("c")],
        effects: [fx.pump(ref.target("c"), 0, 0, ["doubleStrike"])],
      },
    ),
  },
  "Shepherd of the Clouds": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.when(cond.controls({ subtype: "Mount" }), fx.toBattlefield(ref.target())),
          fx.when(cond.not(cond.controls({ subtype: "Mount" })), fx.toHand(ref.target())),
        ],
        {
          targets: [target.cardInGraveyard("t", { permanent: true, maxManaValue: 3 }, "you", "carte de permanent")],
          label: "Reprenez un permanent de VM 3 ou moins",
        },
      ),
    ],
  },
  "Sheriff of Safe Passage": {
    abilities: [entersWith({ counters: amount.plus(1, amount.count(OTHER_CREATURE_YOU_CONTROL)) })],
  },
  "Stagecoach Security": {
    abilities: [
      triggered(when.entersSelf, [fx.pumpAll(CREATURE_YOU_CONTROL, 1, 1, ["vigilance"])], { label: "+1/+1 et vigilance" }),
    ],
  },
  "Steer Clear": {
    // « si vous contrôliez une Monture en lançant ce sort » : vérifié au lancement.
    whenCast: cond.controls({ subtype: "Mount" }),
    spell: spell(
      [target.creature("t", { anyOf: [{ attacking: true }, { blocking: true }] })],
      [fx.when(cond.metWhenCast, fx.damage(4, ref.target())), fx.when(cond.not(cond.metWhenCast), fx.damage(2, ref.target()))],
    ),
  },
  "Sterling Keykeeper": {
    abilities: [
      activated({
        mana: "{2}",
        tap: true,
        targets: [target.creature("t", { notSubtype: "Mount" })],
        effects: [fx.tap(ref.target())],
        label: "Engagez une créature non-Monture",
      }),
    ],
  },
  "Sterling Supplier": {
    abilities: [
      triggered(when.entersSelf, [fx.addCounters(ref.target(), 1)], {
        targets: [target.creature("t", { controller: "you", other: true })],
        label: "Marqueur +1/+1",
      }),
    ],
  },
  "Take Up the Shield": {
    spell: spell(
      [target.creature("t")],
      [fx.addCounters(ref.target(), 1), fx.pump(ref.target(), 0, 0, ["lifelink", "indestructible"])],
    ),
  },
  "Thunder Lasso": {
    abilities: [
      triggered(when.entersSelf, [fx.attach(ref.target())], {
        targets: [target.creature("t", { controller: "you" })],
        label: "Attachez-le",
      }),
      staticAbility("attached", { power: 1, toughness: 1 }, { label: "+1/+1" }),
      triggered(when.attacks({ types: ["Creature"], attachedToSource: true }), [fx.tap(ref.target())], {
        targets: [target.creature("t", { controller: "opponent" })],
        label: "Engagez une créature du défenseur",
      }),
    ],
  },
  "Trained Arynx": {
    abilities: [whileSaddled([fx.pump(ref.self, 0, 0, ["firstStrike"]), fx.scry(1)], { label: "Initiative, regard 1" })],
  },
  "Vengeful Townsfolk": {
    abilities: [
      triggered(when.dies(OTHER_CREATURE_YOU_CONTROL), [fx.addCounters(ref.self, 1)], { batched: true, label: "Marqueur +1/+1" }),
    ],
  },
  "Wanted Griffin": { abilities: [triggered(when.diesSelf, [mercenary()], { label: "Mercenaire 1/1" })] },
};
