/** Éléments de Secrets of Strixhaven (SOS) : jetons. Le DSL et les jetons communs viennent de lci/common.ts. */
import type { TokenSpec } from "@mtgx/engine";
import { fx, triggered, when } from "../lci/common";

export * from "../lci/common";

/** Nuisible : créature noire et verte 1/1 avec « chaque fois que ce jeton attaque, vous gagnez 1 point de vie ». */
export const PEST: TokenSpec = {
  name: "Pest",
  colors: ["B", "G"],
  types: ["Creature"],
  subtypes: ["Pest"],
  power: 1,
  toughness: 1,
  abilities: [triggered(when.attacksSelf, [fx.gainLife(1)], { label: "Gagnez 1 PV" })],
  text: "Whenever this token attacks, you gain 1 life.",
};
