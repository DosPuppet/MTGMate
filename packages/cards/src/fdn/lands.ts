/** Foundations — terrains non de base. */
import type { ManaType } from "@mtgx/engine";
import {
  activated,
  amount,
  BASIC_LAND,
  type CardScript,
  cond,
  entersWith,
  fx,
  manaAbility,
  ref,
  target,
  triggered,
  when,
} from "./common";

/** Terrains bicolores « arrive engagé, gagnez 1 PV ». */
const gainLand = (a: ManaType, b: ManaType): CardScript => ({
  abilities: [
    entersWith({ tapped: true }),
    triggered(when.entersSelf, [fx.gainLife(1)], { label: "+1 PV" }),
    manaAbility([a, b]),
  ],
});

/** Guildgates : « arrive engagé, {T} : ajoutez {X} ou {Y} » (sous-type Porte). */
const guildgate = (a: ManaType, b: ManaType): CardScript => ({ abilities: [entersWith({ tapped: true }), manaAbility([a, b])] });

/** Temples : « arrive engagé, regard 1 en arrivant ». */
const temple = (a: ManaType, b: ManaType): CardScript => ({
  abilities: [entersWith({ tapped: true }), triggered(when.entersSelf, [fx.scry(1)], { label: "regard 1" }), manaAbility([a, b])],
});

export const LANDS: Record<string, CardScript> = {
  "Bloodfell Caves": gainLand("B", "R"),
  "Blossoming Sands": gainLand("G", "W"),
  "Dismal Backwater": gainLand("U", "B"),
  "Jungle Hollow": gainLand("B", "G"),
  "Rugged Highlands": gainLand("R", "G"),
  "Scoured Barrens": gainLand("W", "B"),
  "Swiftwater Cliffs": gainLand("U", "R"),
  "Thornwood Falls": gainLand("G", "U"),
  "Tranquil Cove": gainLand("W", "U"),
  "Wind-Scarred Crag": gainLand("R", "W"),
  "Evolving Wilds": {
    abilities: [
      activated({
        tap: true,
        sacrifice: true,
        effects: [fx.search(BASIC_LAND, { to: "battlefield", tapped: true })],
        label: "Chercher un terrain de base",
      }),
    ],
  },
  "Rogue's Passage": {
    abilities: [
      manaAbility("C"),
      activated({
        mana: "{4}",
        tap: true,
        targets: [target.creature()],
        effects: [fx.modify(ref.target(), { addKeywords: ["unblockable"] })],
        label: "Une créature ne peut pas être bloquée",
      }),
    ],
  },
  "Soulstone Sanctuary": {
    abilities: [
      manaAbility("C"),
      activated({
        mana: "{4}",
        effects: [
          fx.modify(
            ref.self,
            { addTypes: ["Creature"], setPower: 3, setToughness: 3, addKeywords: ["vigilance"], allCreatureTypes: true },
            "permanent",
          ),
        ],
        label: "Devient une créature 3/3",
      }),
    ],
  },
  "Secluded Courtyard": {
    chooseOnEnter: "creatureType",
    abilities: [
      manaAbility("C"),
      manaAbility(["W", "U", "B", "R", "G"], 1, {
        restriction: { spell: { types: ["Creature"], subtypeChosen: true }, abilityOfCreature: { subtypeChosen: true } },
      }),
    ],
  },

  // --- Réimpressions ---
  "Azorius Guildgate": guildgate("W", "U"),
  "Boros Guildgate": guildgate("R", "W"),
  "Dimir Guildgate": guildgate("U", "B"),
  "Golgari Guildgate": guildgate("B", "G"),
  "Gruul Guildgate": guildgate("R", "G"),
  "Izzet Guildgate": guildgate("U", "R"),
  "Orzhov Guildgate": guildgate("W", "B"),
  "Rakdos Guildgate": guildgate("B", "R"),
  "Selesnya Guildgate": guildgate("G", "W"),
  "Simic Guildgate": guildgate("G", "U"),
  "Temple of Abandon": temple("R", "G"),
  "Temple of Deceit": temple("U", "B"),
  "Temple of Enlightenment": temple("W", "U"),
  "Temple of Epiphany": temple("U", "R"),
  "Temple of Malady": temple("B", "G"),
  "Temple of Malice": temple("B", "R"),
  "Temple of Mystery": temple("G", "U"),
  "Temple of Plenty": temple("G", "W"),
  "Temple of Silence": temple("W", "B"),
  "Temple of Triumph": temple("R", "W"),
  "Crawling Barrens": {
    abilities: [
      manaAbility("C"),
      activated({
        mana: "{4}",
        effects: [
          fx.addCounters(ref.self, 2),
          ...fx.may(
            "Devenir une créature Élémental 0/0 jusqu'à la fin du tour ?",
            fx.modify(ref.self, { addTypes: ["Creature"], addSubtypes: ["Elemental"], setPower: 0, setToughness: 0 }),
          ),
        ],
        label: "Deux marqueurs +1/+1",
      }),
    ],
  },
  "Cryptic Caves": {
    abilities: [
      manaAbility("C"),
      activated({
        mana: "{1}",
        tap: true,
        sacrifice: true,
        activationCondition: cond.controls({ types: ["Land"] }, 5),
        effects: [fx.draw(1)],
        label: "Piochez une carte (cinq terrains)",
      }),
    ],
  },
  "Demolition Field": {
    abilities: [
      manaAbility("C"),
      activated({
        mana: "{2}",
        tap: true,
        sacrifice: true,
        targets: [target.permanent("t", ["Land"], { controller: "opponent", nonbasic: true }, "terrain non de base adverse")],
        effects: [
          fx.destroy(ref.target()),
          fx.search(BASIC_LAND, { to: "battlefield" }, 1, ref.controllerOf(ref.target())),
          fx.search(BASIC_LAND, { to: "battlefield" }),
        ],
        label: "Détruire un terrain non de base",
      }),
    ],
  },
  "Maze's End": {
    abilities: [
      entersWith({ tapped: true }),
      manaAbility("C"),
      activated({
        mana: "{3}",
        tap: true,
        bounceSelf: true,
        effects: [
          fx.search({ subtype: "Gate" }, { to: "battlefield" }),
          ...fx.when(cond.amountAtLeast(amount.distinctNames({ subtype: "Gate", controller: "you" }), 10), fx.winGame),
        ],
        label: "Chercher une Porte",
      }),
    ],
  },
  "Uncharted Haven": {
    chooseOnEnter: "color",
    abilities: [entersWith({ tapped: true }), manaAbility(["W"], 1, { produceChosen: true })],
  },
};
