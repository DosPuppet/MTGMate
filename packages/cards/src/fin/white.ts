/** Final Fantasy — cartes blanches. */
import type { CardScript } from "@mtgx/engine";
import {
  activated,
  amount,
  CREATURE_YOU_CONTROL,
  cond,
  EQUIPMENT_YOU,
  fx,
  hero,
  KNIGHT_2,
  MOOGLE,
  manaAbility,
  modal,
  mode,
  ref,
  spell,
  staticAbility,
  target,
  targetObj,
  tiered,
  triggered,
  when,
} from "./common";

export const WHITE: Record<string, CardScript> = {
  "Adelbert Steiner": {
    abilities: [staticAbility("self", { power: 1, toughness: 1 }, { per: EQUIPMENT_YOU, label: "+1/+1 par Équipement" })],
  },
  "Aerith Rescue Mission": {
    spell: modal(
      mode("Trois Héros 1/1", [], [hero(3)]),
      mode(
        "Engagez jusqu'à trois créatures, étourdissez-en une",
        [target.upTo(1, target.creature("s")), { ...target.upTo(2, target.creature("t")), otherThan: ["s"] }],
        [fx.tap(ref.target("s")), fx.counters(ref.target("s"), "stun", 1), fx.tap(ref.target("t"))],
      ),
    ),
  },
  "Ambrosia Whiteheart": {
    abilities: [
      triggered(when.entersSelf, [fx.bounce(ref.target())], {
        targets: [
          target.upTo(
            1,
            targetObj("t", { permanent: true, controller: "you", other: true }, "autre permanent que vous contrôlez"),
          ),
        ],
        label: "Renvoyez un autre permanent",
      }),
      triggered(when.landfall, [fx.pump(ref.self, 1, 0)], { label: "Landfall : +1/+0" }),
    ],
  },
  "Ashe, Princess of Dalmasca": {
    abilities: [
      triggered(when.attacksSelf, [fx.lookAtTop(5, { filter: { types: ["Artifact"] }, count: 1, rest: "bottom" })], {
        label: "Un artefact parmi les cinq du dessus",
      }),
    ],
  },
  "Auron's Inspiration": {
    flashback: "{2}{W}{W}",
    spell: spell([], [fx.pumpAll({ types: ["Creature"], attacking: true }, 2, 0)]),
  },
  "Battle Menu": {
    spell: modal(
      mode("Attaque : Chevalier 2/2", [], [fx.createTokens(KNIGHT_2)]),
      mode("Capacité : +0/+4", [target.creature("t")], [fx.pump(ref.target(), 0, 4)]),
      mode(
        "Magie : détruisez une créature de force 4 ou plus",
        [target.creature("t", { minPower: 4 })],
        [fx.destroy(ref.target())],
      ),
      mode("Objet : +4 PV", [], [fx.gainLife(4)]),
    ),
  },
  "Cloudbound Moogle": {
    abilities: [
      triggered(when.entersSelf, [fx.addCounters(ref.target(), 1)], { targets: [target.creature("t")], label: "Marqueur +1/+1" }),
    ],
  },
  Coeurl: {
    abilities: [
      activated({
        mana: "{1}{W}",
        tap: true,
        targets: [target.creature("t", { notTypes: ["Enchantment"] })],
        effects: [fx.tap(ref.target())],
        label: "Engagez une créature non-enchantement",
      }),
    ],
  },
  "The Crystal's Chosen": { spell: spell([], [hero(4), fx.addCountersAll(CREATURE_YOU_CONTROL, 1)]) },
  "Delivery Moogle": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.pickFromZone("graveyard", { types: ["Artifact"], maxManaValue: 2 }, { to: "hand" }, { min: 0, store: "g" }),
          fx.when(cond.not(cond.v("g")), fx.search({ types: ["Artifact"], maxManaValue: 2 })),
        ],
        { label: "Un artefact de VM 2 ou moins" },
      ),
    ],
  },
  "Dwarven Castle Guard": { abilities: [triggered(when.diesSelf, [hero()], { label: "Héros 1/1" })] },
  "Fate of the Sun-Cryst": {
    costReduction: { generic: 2, condition: cond.targetMatches("t", { tapped: true }) },
    spell: spell([target.nonland("t")], [fx.destroy(ref.target())]),
  },
  "From Father to Son": {
    flashback: "{4}{W}{W}{W}",
    spell: spell(
      [],
      [
        fx.when(cond.spellCastFromGraveyard, fx.search({ subtype: "Vehicle" }, { to: "battlefield" })),
        fx.when(cond.not(cond.spellCastFromGraveyard), fx.search({ subtype: "Vehicle" })),
      ],
    ),
  },
  "G'raha Tia": {
    abilities: [
      triggered(when.dies({ types: ["Creature", "Artifact"], controller: "you", other: true }), [fx.draw(1)], {
        oncePerTurn: true,
        label: "Piochez",
      }),
    ],
  },
  Gaelicat: {
    abilities: [
      staticAbility(
        "self",
        { power: 2 },
        { condition: cond.controls({ types: ["Artifact"] }, 2), label: "+2/+0 (deux artefacts)" },
      ),
    ],
  },
  "Magitek Armor": { abilities: [triggered(when.entersSelf, [hero()], { label: "Héros 1/1" })] },
  "Magitek Infantry": {
    abilities: [
      staticAbility(
        "self",
        { power: 1 },
        { condition: cond.controls({ types: ["Artifact"], other: true }), label: "+1/+0 (autre artefact)" },
      ),
      activated({
        mana: "{2}{W}",
        effects: [fx.search({ name: "Magitek Infantry" }, { to: "battlefield", tapped: true })],
        label: "Cherchez une Magitek Infantry",
      }),
    ],
  },
  "Minwu, White Mage": {
    abilities: [
      triggered(when.gainLife, [fx.addCountersAll({ types: ["Creature"], subtype: "Cleric", controller: "you" }, 1)], {
        label: "Un marqueur sur chaque Clerc",
      }),
    ],
  },
  "Moogles' Valor": {
    spell: spell(
      [],
      [fx.createTokens(MOOGLE, amount.count(CREATURE_YOU_CONTROL)), fx.pumpAll(CREATURE_YOU_CONTROL, 0, 0, ["indestructible"])],
    ),
  },
  "Phoenix Down": {
    abilities: [
      activated({
        mana: "{1}{W}",
        tap: true,
        exileSelf: true,
        targets: [target.cardInGraveyard("t", { types: ["Creature"], maxManaValue: 4 }, "you", "carte de créature")],
        effects: [fx.toBattlefield(ref.target(), { tapped: true })],
        label: "Renvoyez une créature de VM 4 ou moins",
      }),
      activated({
        mana: "{1}{W}",
        tap: true,
        exileSelf: true,
        targets: [targetObj("t", { anySubtype: ["Skeleton", "Spirit", "Zombie"] }, "Squelette, Esprit ou Zombie")],
        effects: [fx.exile(ref.target())],
        label: "Exilez un Squelette, un Esprit ou un Zombie",
      }),
    ],
  },
  "Restoration Magic": {
    spell: tiered(
      {
        cost: "{0}",
        label: "Soin",
        targets: [targetObj("t", { permanent: true }, "permanent")],
        effects: [fx.pump(ref.target(), 0, 0, ["hexproof", "indestructible"])],
      },
      {
        cost: "{1}",
        label: "Extra Soin",
        targets: [targetObj("t", { permanent: true }, "permanent")],
        effects: [fx.pump(ref.target(), 0, 0, ["hexproof", "indestructible"]), fx.gainLife(3)],
      },
      {
        cost: "{3}{W}",
        label: "Méga Soin",
        effects: [fx.pumpAll({ permanent: true, controller: "you" }, 0, 0, ["hexproof", "indestructible"]), fx.gainLife(6)],
      },
    ),
  },
  "Slash of Light": {
    spell: spell(
      [target.creature("t")],
      [fx.damage(amount.plus(amount.count(CREATURE_YOU_CONTROL), amount.count(EQUIPMENT_YOU)), ref.target())],
    ),
  },
  "Snow Villiers": { cdaPower: amount.count(CREATURE_YOU_CONTROL) },
  Ultima: { spell: spell([], [fx.destroyAll({ types: ["Artifact", "Creature"] }), fx.endTurn]) },
  "Weapons Vendor": {
    abilities: [
      triggered(when.entersSelf, [fx.draw(1)], { label: "Piochez" }),
      triggered(
        when.step("beginCombat"),
        fx.mayPay(
          "{1}",
          "Payer {1} pour attacher un Équipement ?",
          fx.reflexive(
            [targetObj("e", EQUIPMENT_YOU, "Équipement que vous contrôlez"), target.creature("c", { controller: "you" })],
            [fx.attach(ref.target("c"), ref.target("e"))],
          ),
        ),
        { condition: cond.controls(EQUIPMENT_YOU), label: "Attachez un Équipement" },
      ),
    ],
  },
  "White Auracite": {
    abilities: [
      triggered(when.entersSelf, [fx.exileUntilLeaves(ref.target())], {
        targets: [target.nonland("t", { controller: "opponent" })],
        label: "Exilez un permanent non-terrain",
      }),
      manaAbility("W"),
    ],
  },
  "You're Not Alone": {
    spell: spell(
      [target.creature("t")],
      [
        fx.when(cond.controls(CREATURE_YOU_CONTROL, 3), fx.pump(ref.target(), 4, 4)),
        fx.when(cond.not(cond.controls(CREATURE_YOU_CONTROL, 3)), fx.pump(ref.target(), 2, 2)),
      ],
    ),
  },
};
