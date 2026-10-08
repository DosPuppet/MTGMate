/** Aetherdrift — white cards. */
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
      staticAbility(CREATURE_YOU_CONTROL, { toughness: 1, addKeywords: ["vigilance"] }, { label: "+0/+1 and vigilance" }),
      triggered(
        when.step("beginCombat"),
        [
          fx.when(cond.targetMatches("t", { subtype: "Mount" }), fx.saddle(ref.target())),
          fx.when(cond.targetMatches("t", { subtype: "Vehicle" }), fx.animateVehicle(ref.target())),
        ],
        {
          targets: [target.upTo(1, targetObj("t", { ...MOUNT_OR_VEHICLE, controller: "you" }, "Mount or Vehicle"))],
          label: "Mount saddled, Vehicle animated",
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
        label: "1/1 Cat (lifelink)",
      }),
      whenCycled([fx.pumpAll({ subtype: "Cat", controller: "you" }, 0, 0, ["hexproof", "indestructible"])], {
        label: "Your Cats: hexproof and indestructible",
      }),
    ],
  },
  "Brightfield Glider": { abilities: [whileSaddled([fx.pump(ref.self, 1, 2, ["flying"])], { label: "+1/+2 and flying" })] },
  "Brightfield Mustang": {
    abilities: [whileSaddled([fx.untap(ref.self), fx.addCounters(ref.self, 1)], { label: "Untap it, +1/+1 counter" })],
  },
  "Broadcast Rambler": { abilities: [triggered(when.entersSelf, [fx.createTokens(THOPTER)], { label: "1/1 Thopter" })] },
  "Bulwark Ox": {
    abilities: [
      whileSaddled([fx.addCounters(ref.target(), 1)], { targets: [target.creature("t")], label: "+1/+1 counter" }),
      activated({
        sacrifice: true,
        effects: [fx.pumpAll({ ...CREATURE_YOU_CONTROL, withCounter: "any" }, 0, 0, ["hexproof", "indestructible"])],
        label: "Your creatures with counters: protected",
      }),
    ],
  },
  "Canyon Vaulter": {
    abilities: [
      triggered(when.crews(true), [fx.pump(ref.eventObject, 0, 0, ["flying"])], {
        label: "The Mount or Vehicle gains flying",
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
        "X damage to a creature",
        [target.creature("t")],
        [fx.damage(amount.count({ ...CREATURE_OR_VEHICLE, controller: "you" }), ref.target())],
      ),
      mode("Destroy target artifact", [target.permanent("t", ["Artifact"])], [fx.destroy(ref.target())]),
    ),
  },
  "Daring Mechanic": {
    abilities: [
      activated({
        mana: "{3}{W}",
        targets: [targetObj("t", MOUNT_OR_VEHICLE, "Mount or Vehicle")],
        effects: [fx.addCounters(ref.target(), 1)],
        label: "+1/+1 counter",
      }),
    ],
  },
  "Detention Chariot": {
    abilities: [
      triggered(when.entersSelf, [fx.exileUntilLeaves(ref.target())], {
        targets: [target.permanent("t", ["Artifact", "Creature"], { controller: "opponent" }, "artifact or creature")],
        label: "Exile an artifact or creature",
      }),
    ],
  },
  "Gallant Strike": { spell: spell([target.creature("t", { minToughness: 4 })], [fx.destroy(ref.target())]) },
  "Gloryheath Lynx": {
    abilities: [whileSaddled([fx.search({ types: ["Land"], basic: true, subtype: "Plains" })], { label: "Basic Plains" })],
  },
  "Guardian Sunmare": {
    abilities: [
      whileSaddled([fx.search({ permanent: true, notTypes: ["Land"], maxManaValue: 3 }, { to: "battlefield" })], {
        label: "A nonland permanent with mana value 3 or less",
      }),
    ],
  },
  "Guidelight Synergist": {
    abilities: [
      staticAbility("self", { power: 1 }, { per: { types: ["Artifact"], controller: "you" }, label: "+1/+0 for each artifact" }),
    ],
  },
  "Interface Ace": {
    abilities: [
      powerRuleAbility(powerFor.crewWithToughness),
      triggered(when.tapsSelf, [fx.untap(ref.self)], {
        condition: cond.yourTurn,
        oncePerTurn: true,
        label: "Untap this creature",
      }),
    ],
  },
  "Lightshield Parry": { spell: spell([target.creature("t")], [fx.pump(ref.target(), 2, 2)]) },
  "Lotusguard Disciple": {
    abilities: [
      triggered(when.entersSelf, [fx.pump(ref.target(), 0, 0, ["lifelink", "indestructible"])], {
        targets: [targetCreatureOrVehicle()],
        label: "Lifelink and indestructible",
      }),
    ],
  },
  "Ride's End": {
    costReduction: { generic: 3, condition: cond.targetMatches("t", { tapped: true }) },
    spell: spell([targetCreatureOrVehicle()], [fx.exile(ref.target())]),
  },
  "Roadside Assistance": {
    enchant: { filter: CREATURE_OR_VEHICLE, label: "creature or Vehicle" },
    abilities: [
      triggered(when.entersSelf, [pilot()], { label: "1/1 Pilot" }),
      staticAbility("attached", { power: 1, toughness: 1, addKeywords: ["lifelink"] }, { label: "+1/+1 and lifelink" }),
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
        targets: [target.upTo(1, target.cardInGraveyard("t", { types: ["Artifact"] }, "you", "artifact card"))],
        label: "Return an artifact",
      }),
    ],
  },
  "Spectacular Pileup": {
    spell: spell(
      [],
      [fx.modifyAll(CREATURE_OR_VEHICLE, { removeKeywords: ["indestructible"] }), fx.destroyAll(CREATURE_OR_VEHICLE)],
    ),
  },
  "Spotcycle Scouter": { abilities: [triggered(when.entersSelf, [fx.scry(2)], { label: "Scry 2" })] },
  "Tune Up": {
    spell: spell(
      [target.cardInGraveyard("t", { types: ["Artifact"] }, "you", "artifact card")],
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
        label: "Indestructible, untap your creatures",
      }),
    ],
  },
  "Valor's Flagship": {
    abilities: [whenCycled([fx.createTokens(PILOT, amount.eventAmount)], { label: "X 1/1 Pilots" })],
  },
  "Voyager Glidecar": {
    abilities: [
      triggered(when.entersSelf, [fx.scry(1)], { label: "Scry 1" }),
      activated({
        tapOthers: { filter: { types: ["Creature"], controller: "you", other: true }, count: 3 },
        effects: [fx.animateVehicle(), fx.pump(ref.self, 0, 0, ["flying"]), fx.addCounters(ref.self, 1)],
        label: "Becomes a flying creature, +1/+1 counter",
      }),
    ],
  },
  "Voyager Quickwelder": { abilities: [costReducer({ types: ["Artifact"] }, 1, "Artifact spells cost {1} less")] },
};
