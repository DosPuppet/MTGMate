/** Éléments de Teenage Mutant Ninja Turtles (TMT) : jeton Mutagène. Le DSL et les jetons communs viennent de lci/common.ts. */
import type { TokenSpec } from "@mtgx/engine";
import { activated, fx, ref, target } from "../lci/common";

export * from "../lci/common";

/** Mutagène : artefact avec « {1}, {T}, sacrifiez ce jeton : un marqueur +1/+1 sur la créature ciblée (rituel) ». */
export const MUTAGEN: TokenSpec = {
  name: "Mutagen",
  colors: [],
  types: ["Artifact"],
  subtypes: ["Mutagen"],
  abilities: [
    activated({
      mana: "{1}",
      tap: true,
      sacrifice: true,
      sorcerySpeed: true,
      targets: [target.creature()],
      effects: [fx.addCounters(ref.target(), 1)],
      label: "Un marqueur +1/+1",
    }),
  ],
  text: "{1}, {T}, Sacrifice this token: Put a +1/+1 counter on target creature. Activate only as a sorcery.",
};
