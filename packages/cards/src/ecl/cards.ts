/**
 * Lorwyn Eclipsed — cartes des decks du méta (phase 1 du plan P4, lot M1). L'extension n'est pas encore couverte en
 * entier : les autres cartes viendront avec elle.
 */
import {
  activated,
  amount,
  type CardScript,
  cond,
  entersWith,
  fx,
  manaAbility,
  modal,
  mode,
  ref,
  spell,
  TREEFOLK_REACH,
  target,
  triggered,
  when,
} from "./common";

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

  // --- Lot M2 -----------------------------------------------------------------
  "Blood Crypt": shock,
  "Overgrown Tomb": shock,
  "Requiting Hex": {
    // Flétrir 1 en coût additionnel facultatif : lu dans le texte (kicker « blight »).
    spell: spell(
      [target.creature("t", { maxManaValue: 2 })],
      [fx.destroy(ref.target()), ...fx.when(cond.kicked, fx.gainLife(2))],
    ),
  },

  // --- Lot M3 -----------------------------------------------------------------
  "Hallowed Fountain": shock,
  "Temple Garden": shock,
  Deceit: {
    // Évocation lue dans le texte ; « si {U}{U} / {B}{B} a été dépensé pour le lancer » : `cond.spent`.
    abilities: [
      triggered(when.entersSelf, [fx.bounce(ref.target())], {
        condition: cond.spent("U", 2),
        targets: [target.upTo(1, target.nonland("t", { other: true }))],
        label: "{U}{U} dépensé : renvoie un permanent non-terrain",
      }),
      triggered(when.entersSelf, [fx.discard(1, ref.target(), { filter: { nonland: true }, chooser: "controller" })], {
        condition: cond.spent("B", 2),
        targets: [target.player("t", "opponent")],
        label: "{B}{B} dépensé : défausse d'une carte non-terrain choisie",
      }),
    ],
  },

  // --- Lot M4 -----------------------------------------------------------------
  "Firdoch Core": {
    abilities: [
      manaAbility(["W", "U", "B", "R", "G"]),
      activated({
        mana: "{4}",
        effects: [fx.modify(ref.self, { addTypes: ["Artifact", "Creature"], setPower: 4, setToughness: 4 })],
        label: "Devient une créature-artefact 4/4",
      }),
    ],
  },

  // --- Lot M5 -----------------------------------------------------------------
  "Pyrrhic Strike": {
    // Flétrir 2 (coût additionnel facultatif) : lu dans le texte ; payé, on choisit les deux modes.
    spell: modal(
      mode(
        "Détruit un artefact ou un enchantement",
        [target.permanent("a", ["Artifact", "Enchantment"])],
        [fx.destroy(ref.target("a"))],
      ),
      mode("Détruit une créature de VM 3 ou plus", [target.creature("c", { minManaValue: 3 })], [fx.destroy(ref.target("c"))]),
      {
        ...mode(
          "Les deux (flétrir 2 payé)",
          [target.permanent("a", ["Artifact", "Enchantment"]), target.creature("c", { minManaValue: 3 })],
          [fx.destroy(ref.target("a")), fx.destroy(ref.target("c"))],
        ),
        condition: cond.kicked,
      },
    ),
  },
  Emptiness: {
    // Évocation lue dans le texte.
    abilities: [
      triggered(when.entersSelf, [fx.toBattlefield(ref.target())], {
        condition: cond.spent("W", 2),
        targets: [
          target.cardInGraveyard("t", { types: ["Creature"], maxManaValue: 3 }, "you", "carte de créature de VM 3 ou moins"),
        ],
        label: "{W}{W} dépensé : renvoie une créature de votre cimetière",
      }),
      triggered(when.entersSelf, [fx.counters(ref.target(), "-1/-1", 3)], {
        condition: cond.spent("B", 2),
        targets: [target.upTo(1, target.creature())],
        label: "{B}{B} dépensé : trois marqueurs -1/-1",
      }),
    ],
  },
  "Iron-Shield Elf": {
    abilities: [
      activated({
        discard: 1,
        effects: [fx.modify(ref.self, { addKeywords: ["indestructible"] }), fx.tap(ref.self)],
        label: "Indestructible, engagez-la",
      }),
    ],
  },
  Moonshadow: {
    abilities: [
      entersWith({ counters: 6, counterKind: "-1/-1", label: "Arrive avec six marqueurs -1/-1" }),
      triggered(
        when.zoneChange(["battlefield", "hand", "library", "exile", "stack"], {
          to: ["graveyard"],
          whose: "you",
          // « cartes de permanent » : pas les jetons.
          filter: { types: ["Artifact", "Creature", "Enchantment", "Land", "Planeswalker", "Battle"], nontoken: true },
        }),
        [fx.removeCounters(ref.self, 1, "-1/-1")],
        { condition: cond.counterAtLeast("-1/-1", 1), batched: true, label: "Retire un marqueur -1/-1" },
      ),
    ],
  },

  // --- Lot M6 -----------------------------------------------------------------
  "Springleaf Drum": { abilities: [{ ...manaAbility(["W", "U", "B", "R", "G"]), tapAnother: "creature" }] },
};
