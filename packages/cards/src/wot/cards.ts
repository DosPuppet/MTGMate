/** Enchanting Tales (WOT) : scripts des cartes (PLAN-G). */
import { type CardScript, entersWith } from "../tdm/common";

export const CARDS: Record<string, CardScript> = {
  // Extorsion : lue dans le texte.
  "Blind Obedience": {
    abilities: [
      entersWith({
        tapped: true,
        affects: { anyOf: [{ types: ["Artifact"] }, { types: ["Creature"] }], controller: "opponent" },
        label: "Les artefacts et créatures de vos adversaires arrivent engagés",
      }),
    ],
  },
};
