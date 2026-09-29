/**
 * Lorwyn Eclipsed — cartes des decks du méta (phase 1 du plan P4, lot M1). L'extension n'est pas encore couverte en
 * entier : les autres cartes viendront avec elle.
 */
import { activated, amount, type CardScript, cond, fx, ref, spell, TREEFOLK_REACH, target, triggered, when } from "./common";

/** Terrains choc : la règle « payez 2 PV ou il arrive engagé » est lue dans le texte. */
const shock: CardScript = {};

export const CARDS: Record<string, CardScript> = {
  // --- Terrains --------------------------------------------------------------
  "Steam Vents": shock,
  // --- Bleu ------------------------------------------------------------------
  "Spell Snare": { spell: spell([target.spell("t", { manaValue: 2 }, "sort de valeur de mana 2")], [fx.counter(ref.target())]) },
  Sunderflock: {
    // « Ce sort coûte {X} de moins, X étant la plus grande valeur de mana parmi les Élémentaux que vous contrôlez. »
    costReduction: { generic: amount.maxManaValue({ subtype: "Elemental", controller: "you" }) },
    abilities: [
      triggered(
        when.entersSelf,
        [fx.moveAll("battlefield", ref.eachPlayer, { types: ["Creature"], notSubtype: "Elemental" }, { to: "hand" })],
        { condition: cond.wasCast, label: "Renvoie toutes les créatures non-Élémentaux" },
      ),
    ],
  },
  // --- Rouge -----------------------------------------------------------------
  Sear: { spell: spell([target.creatureOrPlaneswalker()], [fx.damage(4, ref.target())]) },
  // --- Vert ------------------------------------------------------------------
  "Sapling Nursery": {
    // Affinité pour les Forêts.
    costReduction: { generic: amount.count({ subtype: "Forest", controller: "you" }) },
    abilities: [
      triggered(when.landfall, [fx.createTokens(TREEFOLK_REACH)], { label: "Jeton Sylvin 3/4 avec la portée" }),
      activated({
        mana: "{1}{G}",
        exileSelf: true,
        effects: [
          fx.modifyAll(
            { anyOf: [{ subtype: "Treefolk" }, { subtype: "Forest" }], controller: "you" },
            { addKeywords: ["indestructible"] },
          ),
        ],
        label: "Sylvins et Forêts indestructibles",
      }),
    ],
  },
};
