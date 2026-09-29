/** Aetherdrift — cartes vertes. */
import type { CardScript } from "@mtgx/engine";
import {
  activated,
  amount,
  CREATURE_OR_ARTIFACT,
  CREATURE_OR_VEHICLE,
  cond,
  ELEPHANT,
  entersWith,
  fx,
  MOUNT_OR_VEHICLE,
  manaAbility,
  modal,
  mode,
  pilot,
  ref,
  spell,
  staticAbility,
  target,
  targetCreatureOrVehicle,
  targetObj,
  triggered,
  when,
  whenCycled,
  whileSaddled,
} from "./common";

export const GREEN: Record<string, CardScript> = {
  "Agonasaur Rex": {
    abilities: [
      whenCycled([fx.addCounters(ref.target(), 2), fx.pump(ref.target(), 0, 0, ["trample", "indestructible"])], {
        targets: [target.upTo(1, targetCreatureOrVehicle())],
        label: "Deux marqueurs +1/+1, piétinement et indestructible",
      }),
    ],
  },
  "Alacrian Jaguar": { abilities: [whileSaddled([fx.pump(ref.self, 2, 2)], { label: "+2/+2" })] },
  "Autarch Mammoth": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(ELEPHANT)], { label: "Éléphant 3/3" }),
      whileSaddled([fx.createTokens(ELEPHANT)], { label: "Éléphant 3/3" }),
    ],
  },
  "Beastrider Vanguard": {
    abilities: [
      activated({
        mana: "{4}{G}",
        effects: [fx.lookAtTop(3, { filter: { permanent: true }, count: 1, rest: "bottom" })],
        label: "Regardez les trois cartes du dessus",
      }),
    ],
  },
  "Bestow Greatness": { spell: spell([target.creature("t")], [fx.pump(ref.target(), 4, 4, ["trample"])]) },
  "Defend the Rider": {
    spell: modal(
      mode(
        "Défense talismanique et indestructible",
        [targetObj("t", { permanent: true, controller: "you" }, "permanent que vous contrôlez")],
        [fx.pump(ref.target(), 0, 0, ["hexproof", "indestructible"])],
      ),
      mode("Pilote 1/1", [], [pilot()]),
    ),
  },
  "District Mascot": {
    abilities: [
      entersWith({ counters: 1 }),
      activated({
        mana: "{1}{G}",
        removeCounters: { kind: "+1/+1", n: 2 },
        targets: [target.permanent("t", ["Artifact"])],
        effects: [fx.destroy(ref.target())],
        label: "Détruisez un artefact",
      }),
      whileSaddled([fx.addCounters(ref.self, 1)], { label: "Marqueur +1/+1" }),
    ],
  },
  Earthrumbler: {
    abilities: [
      activated({
        exileFromGraveyard: { filter: CREATURE_OR_ARTIFACT },
        effects: [fx.animateVehicle()],
        label: "Devient une créature-artefact",
      }),
    ],
  },
  "Fang Guardian": {
    abilities: [
      triggered(when.entersSelf, [fx.pump(ref.target(), 2, 2)], {
        targets: [targetCreatureOrVehicle("t", { controller: "you", other: true })],
        label: "+2/+2",
      }),
    ],
  },
  "Lumbering Worldwagon": {
    cdaPower: amount.count({ types: ["Land"], controller: "you" }),
    abilities: [
      triggered(
        when.entersSelf,
        fx.may("Chercher un terrain de base ?", fx.search({ types: ["Land"], basic: true }, { to: "battlefield", tapped: true })),
        { label: "Terrain de base engagé" },
      ),
      triggered(
        when.attacksSelf,
        fx.may("Chercher un terrain de base ?", fx.search({ types: ["Land"], basic: true }, { to: "battlefield", tapped: true })),
        { label: "Terrain de base engagé" },
      ),
    ],
  },
  "Migrating Ketradon": { abilities: [triggered(when.entersSelf, [fx.gainLife(4)], { label: "+4 PV" })] },
  "Molt Tender": {
    abilities: [
      activated({ tap: true, effects: [fx.mill(1)], label: "Meulez une carte" }),
      activated({
        tap: true,
        exileFromGraveyard: { filter: {} },
        effects: [fx.addManaChoice(1)],
        label: "Un mana de n'importe quelle couleur",
      }),
    ],
  },
  "Ooze Patrol": {
    abilities: [
      triggered(when.entersSelf, [fx.mill(2), fx.addCounters(ref.self, amount.countIn("graveyard", CREATURE_OR_ARTIFACT))], {
        label: "Meulez deux cartes, marqueurs +1/+1",
      }),
    ],
  },
  "Plow Through": {
    spell: modal(
      mode(
        "Combat",
        [target.creature("a", { controller: "you" }), target.creature("b", { controller: "opponent" })],
        [fx.fight(ref.target("a"), ref.target("b"))],
      ),
      mode("Détruisez un Véhicule", [targetObj("t", { subtype: "Vehicle" }, "Véhicule")], [fx.destroy(ref.target())]),
    ),
  },
  "Pothole Mole": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.mill(3),
          fx.pickFromZone(
            "graveyard",
            { types: ["Land"] },
            { to: "hand" },
            { min: 0, prompt: "Vous pouvez reprendre un terrain" },
          ),
        ],
        { label: "Meulez trois cartes, reprenez un terrain" },
      ),
    ],
  },
  "Regal Imperiosaur": {
    abilities: [
      staticAbility({ subtype: "Dinosaur", controller: "you", other: true }, { power: 1, toughness: 1 }, { label: "+1/+1" }),
    ],
  },
  "Run Over": {
    costReduction: { generic: 1, condition: cond.targetMatches("a", MOUNT_OR_VEHICLE) },
    spell: spell(
      [target.creature("a", { controller: "you" }), target.creature("b", { controller: "opponent" })],
      [fx.damage(amount.powerOf(ref.target("a")), ref.target("b"), ref.target("a"))],
    ),
  },
  "Silken Strength": {
    enchant: { filter: CREATURE_OR_VEHICLE, label: "créature ou Véhicule" },
    abilities: [
      triggered(when.entersSelf, [fx.untap(ref.attached)], { label: "Dégagez le permanent enchanté" }),
      staticAbility("attached", { power: 1, toughness: 2, addKeywords: ["reach"] }, { label: "+1/+2 et la portée" }),
    ],
  },
  "Veloheart Bike": {
    abilities: [triggered(when.entersSelf, [fx.gainLife(2)], { label: "+2 PV" }), manaAbility(["W", "U", "B", "R", "G"])],
  },
  "Venomsac Lagac": { abilities: [whileSaddled([fx.pump(ref.self, 0, 3)], { label: "+0/+3" })] },
  "Webstrike Elite": {
    abilities: [
      // « … de valeur de mana X » : la cible est quelconque, et n'est détruite que si sa valeur de mana vaut X.
      whenCycled(
        [
          fx.when(
            cond.all(
              cond.amountAtLeast(amount.plus(amount.manaValueOf(ref.target()), amount.neg(amount.eventAmount)), 0),
              cond.amountAtLeast(amount.plus(amount.eventAmount, amount.neg(amount.manaValueOf(ref.target()))), 0),
            ),
            fx.destroy(ref.target()),
          ),
        ],
        {
          targets: [target.upTo(1, target.permanent("t", ["Artifact", "Enchantment"], {}, "artefact ou enchantement"))],
          label: "Détruisez un artefact ou un enchantement de VM X",
        },
      ),
    ],
  },
};
