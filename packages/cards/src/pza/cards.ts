/** Source Material (PZA) : scripts des cartes (PLAN-G). */
import { activated, type CardScript, fx, ref, target } from "../tdm/common";

export const CARDS: Record<string, CardScript> = {
  // Modulaire 1 : lu dans le texte.
  "Arcbound Ravager": {
    abilities: [
      activated({
        sacrificeOther: { filter: { types: ["Artifact"] }, includeSelf: true },
        effects: [fx.addCounters(ref.self, 1)],
        label: "Sacrifiez un artefact : un marqueur +1/+1",
      }),
    ],
  },
  // Greffe 2 : lue dans le texte.
  "Cytoplast Manipulator": {
    abilities: [
      activated({
        mana: "{U}",
        tap: true,
        targets: [target.creature("t", { withCounter: "+1/+1" })],
        effects: [fx.gainControlWhileSource(ref.target())],
        label: "Contrôle d'une créature avec un marqueur +1/+1, tant que celle-ci reste",
      }),
    ],
  },
};
