/** Stellar Sights (EOS) : scripts des cartes (PLAN-G). */
import { type CardScript, entersWith, manaAbility } from "../tdm/common";

const TAPPED = entersWith({ tapped: true, label: "Arrive engagé" });

export const CARDS: Record<string, CardScript> = {
  // Exaltation : lue dans le texte.
  "Cathedral of War": { abilities: [TAPPED, manaAbility("C")] },
  // Modulaire 1 : lu dans le texte.
  "Power Depot": {
    abilities: [
      TAPPED,
      manaAbility("C"),
      manaAbility(["W", "U", "B", "R", "G"], 1, {
        restriction: { spell: { types: ["Artifact"] }, abilityOfSource: { types: ["Artifact"] } },
      }),
    ],
  },
};
