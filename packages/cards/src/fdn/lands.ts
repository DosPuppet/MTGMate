/** Foundations — terrains non de base. */
import type { ManaType } from "@mtgx/engine";
import { activated, BASIC_LAND, type CardScript, entersWith, fx, manaAbility, ref, target, triggered, when } from "./common";

/** Terrains bicolores « arrive engagé, gagnez 1 PV ». */
const gainLand = (a: ManaType, b: ManaType): CardScript => ({
  abilities: [
    entersWith({ tapped: true }),
    triggered(when.entersSelf, [fx.gainLife(1)], { label: "+1 PV" }),
    manaAbility([a, b]),
  ],
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
};
