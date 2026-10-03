/** Aetherdrift — cartes blanches. */
import type { CardScript } from "@mtgx/engine";
import {
  activated,
  amount,
  CAT_LIFELINK,
  CREATURE_OR_VEHICLE,
  CREATURE_YOU_CONTROL,
  cond,
  costReducer,
  fx,
  MOUNT_OR_VEHICLE,
  modal,
  mode,
  PILOT,
  pilot,
  powerFor,
  powerRuleAbility,
  ref,
  spell,
  staticAbility,
  THOPTER,
  target,
  targetCreatureOrVehicle,
  targetObj,
  triggered,
  when,
  whenCycled,
  whileSaddled,
} from "./common";

export const WHITE: Record<string, CardScript> = {
  "Air Response Unit": {},
  "Alacrian Armory": {
    abilities: [
      staticAbility(CREATURE_YOU_CONTROL, { toughness: 1, addKeywords: ["vigilance"] }, { label: "+0/+1 et la vigilance" }),
      triggered(
        when.step("beginCombat"),
        [
          fx.when(cond.targetMatches("t", { subtype: "Mount" }), fx.saddle(ref.target())),
          fx.when(cond.targetMatches("t", { subtype: "Vehicle" }), fx.animateVehicle(ref.target())),
        ],
        {
          targets: [target.upTo(1, targetObj("t", { ...MOUNT_OR_VEHICLE, controller: "you" }, "Monture ou Véhicule"))],
          label: "Monture montée, Véhicule animé",
        },
      ),
    ],
  },
  "Basri, Tomorrow's Champion": {
    abilities: [
      activated({
        mana: "{W}",
        tap: true,
        exert: true,
        effects: [fx.createTokens(CAT_LIFELINK)],
        label: "Chat 1/1 (lien de vie)",
      }),
      whenCycled([fx.pumpAll({ subtype: "Cat", controller: "you" }, 0, 0, ["hexproof", "indestructible"])], {
        label: "Vos Chats : défense talismanique et indestructible",
      }),
    ],
  },
  "Brightfield Glider": { abilities: [whileSaddled([fx.pump(ref.self, 1, 2, ["flying"])], { label: "+1/+2 et le vol" })] },
  "Brightfield Mustang": {
    abilities: [whileSaddled([fx.untap(ref.self), fx.addCounters(ref.self, 1)], { label: "Dégagez-la, marqueur +1/+1" })],
  },
  "Broadcast Rambler": { abilities: [triggered(when.entersSelf, [fx.createTokens(THOPTER)], { label: "Thopter 1/1" })] },
  "Bulwark Ox": {
    abilities: [
      whileSaddled([fx.addCounters(ref.target(), 1)], { targets: [target.creature("t")], label: "Marqueur +1/+1" }),
      activated({
        sacrifice: true,
        effects: [fx.pumpAll({ ...CREATURE_YOU_CONTROL, withCounter: "any" }, 0, 0, ["hexproof", "indestructible"])],
        label: "Vos créatures avec des marqueurs : protégées",
      }),
    ],
  },
  "Canyon Vaulter": {
    abilities: [
      triggered(when.crews(true), [fx.pump(ref.eventObject, 0, 0, ["flying"])], {
        label: "La Monture ou le Véhicule gagne le vol",
      }),
    ],
  },
  "Cloudspire Captain": {
    abilities: [
      powerRuleAbility(powerFor.pilot),
      staticAbility({ ...MOUNT_OR_VEHICLE, controller: "you" }, { power: 1, toughness: 1 }, { label: "+1/+1" }),
    ],
  },
  "Collision Course": {
    spell: modal(
      mode(
        "X blessures à une créature",
        [target.creature("t")],
        [fx.damage(amount.count({ ...CREATURE_OR_VEHICLE, controller: "you" }), ref.target())],
      ),
      mode("Détruisez un artefact", [target.permanent("t", ["Artifact"])], [fx.destroy(ref.target())]),
    ),
  },
  "Daring Mechanic": {
    abilities: [
      activated({
        mana: "{3}{W}",
        targets: [targetObj("t", MOUNT_OR_VEHICLE, "Monture ou Véhicule")],
        effects: [fx.addCounters(ref.target(), 1)],
        label: "Marqueur +1/+1",
      }),
    ],
  },
  "Detention Chariot": {
    abilities: [
      triggered(when.entersSelf, [fx.exileUntilLeaves(ref.target())], {
        targets: [target.permanent("t", ["Artifact", "Creature"], { controller: "opponent" }, "artefact ou créature")],
        label: "Exilez un artefact ou une créature",
      }),
    ],
  },
  "Gallant Strike": { spell: spell([target.creature("t", { minToughness: 4 })], [fx.destroy(ref.target())]) },
  "Gloryheath Lynx": {
    abilities: [whileSaddled([fx.search({ types: ["Land"], basic: true, subtype: "Plains" })], { label: "Plaine de base" })],
  },
  "Guardian Sunmare": {
    abilities: [
      whileSaddled([fx.search({ permanent: true, notTypes: ["Land"], maxManaValue: 3 }, { to: "battlefield" })], {
        label: "Un permanent non-terrain de VM 3 ou moins",
      }),
    ],
  },
  "Guidelight Synergist": {
    abilities: [
      staticAbility("self", { power: 1 }, { per: { types: ["Artifact"], controller: "you" }, label: "+1/+0 par artefact" }),
    ],
  },
  "Interface Ace": {
    abilities: [
      powerRuleAbility(powerFor.crewWithToughness),
      triggered(when.tapsSelf, [fx.untap(ref.self)], { condition: cond.yourTurn, oncePerTurn: true, label: "Dégagez-la" }),
    ],
  },
  "Lightshield Parry": { spell: spell([target.creature("t")], [fx.pump(ref.target(), 2, 2)]) },
  "Lotusguard Disciple": {
    abilities: [
      triggered(when.entersSelf, [fx.pump(ref.target(), 0, 0, ["lifelink", "indestructible"])], {
        targets: [targetCreatureOrVehicle()],
        label: "Lien de vie et indestructible",
      }),
    ],
  },
  "Ride's End": {
    costReduction: { generic: 3, condition: cond.targetMatches("t", { tapped: true }) },
    spell: spell([targetCreatureOrVehicle()], [fx.exile(ref.target())]),
  },
  "Roadside Assistance": {
    enchant: { filter: CREATURE_OR_VEHICLE, label: "créature ou Véhicule" },
    abilities: [
      triggered(when.entersSelf, [pilot()], { label: "Pilote 1/1" }),
      staticAbility("attached", { power: 1, toughness: 1, addKeywords: ["lifelink"] }, { label: "+1/+1 et le lien de vie" }),
    ],
  },
  "Salvation Engine": {
    abilities: [
      staticAbility(
        { types: ["Artifact"], controller: "you", other: true, anyOf: [{ types: ["Creature"] }] },
        {
          power: 2,
          toughness: 2,
        },
      ),
      triggered(when.attacksSelf, [fx.toBattlefield(ref.target())], {
        targets: [target.upTo(1, target.cardInGraveyard("t", { types: ["Artifact"] }, "you", "carte d'artefact"))],
        label: "Renvoyez un artefact",
      }),
    ],
  },
  "Spectacular Pileup": {
    spell: spell(
      [],
      [fx.modifyAll(CREATURE_OR_VEHICLE, { removeKeywords: ["indestructible"] }), fx.destroyAll(CREATURE_OR_VEHICLE)],
    ),
  },
  "Spotcycle Scouter": { abilities: [triggered(when.entersSelf, [fx.scry(2)], { label: "Regard 2" })] },
  "Tune Up": {
    spell: spell(
      [target.cardInGraveyard("t", { types: ["Artifact"] }, "you", "carte d'artefact")],
      [
        fx.moveTo(ref.target(), { to: "battlefield" }, { name: "a" }),
        fx.when(
          cond.refMatches(ref.stored("a"), { subtype: "Vehicle" }),
          fx.modify(ref.stored("a"), { addTypes: ["Artifact", "Creature"] }, "permanent"),
        ),
      ],
    ),
  },
  "Unswerving Sloth": {
    abilities: [
      whileSaddled([fx.pump(ref.self, 0, 0, ["indestructible"]), fx.untap(ref.permanentsOf(ref.you, { types: ["Creature"] }))], {
        label: "Indestructible, dégagez vos créatures",
      }),
    ],
  },
  "Valor's Flagship": {
    abilities: [whenCycled([fx.createTokens(PILOT, amount.eventAmount)], { label: "X Pilotes 1/1" })],
  },
  "Voyager Glidecar": {
    abilities: [
      triggered(when.entersSelf, [fx.scry(1)], { label: "Regard 1" }),
      activated({
        tapOthers: { filter: { types: ["Creature"], controller: "you", other: true }, count: 3 },
        effects: [fx.animateVehicle(), fx.pump(ref.self, 0, 0, ["flying"]), fx.addCounters(ref.self, 1)],
        label: "Devient une créature volante, marqueur +1/+1",
      }),
    ],
  },
  "Voyager Quickwelder": { abilities: [costReducer({ types: ["Artifact"] }, 1, "Sorts d'artefact : {1} de moins")] },
};
