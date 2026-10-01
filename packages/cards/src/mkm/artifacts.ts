/** Murders at Karlov Manor — cartes incolores et terrains. */
import {
  activated,
  amount,
  BASIC_LAND,
  type CardScript,
  cond,
  entersWith,
  fx,
  investigate,
  manaAbility,
  ref,
  staticAbility,
  target,
  triggered,
  when,
} from "./common";

const FIVE_COLORS = ["W", "U", "B", "R", "G"] as const;

/** Terrains à surveillance : arrivent engagés, surveillance 1 ; le mana vient de leurs types de terrain de base. */
const surveilLand: CardScript = {
  abilities: [entersWith({ tapped: true }), triggered(when.entersSelf, [fx.surveil(1)], { label: "Surveillance 1" })],
};

/** « Équiper [Détective] {1} » : comme Équiper, mais seulement sur un Détective que vous contrôlez. */
const EQUIP_DETECTIVE = {
  ...activated({
    mana: "{1}",
    sorcerySpeed: true,
    targets: [
      {
        id: "t",
        label: "Détective que vous contrôlez",
        filter: { objects: { types: ["Creature"], subtype: "Detective", controller: "you" } },
      },
    ],
    effects: [fx.attach(ref.target())],
    label: "Équiper Détective {1}",
  }),
  equip: true,
} as ReturnType<typeof activated>;

export const ARTIFACTS: Record<string, CardScript> = {
  // --- Incolores ---------------------------------------------------------------
  "Case of the Shattered Pact": {
    abilities: [triggered(when.entersSelf, [fx.search(BASIC_LAND)], { label: "Cherchez une carte de terrain de base" })],
    caseToSolve: cond.amountAtLeast(amount.colorsAmong(), 5),
    caseSolved: [
      triggered(when.yourCombat, [fx.pump(ref.target(), 0, 0, ["flying", "doubleStrike", "vigilance"])], {
        targets: [target.creature("t", { controller: "you" })],
        label: "Le vol, la double initiative et la vigilance",
      }),
    ],
  },
  "Gravestone Strider": {
    abilities: [
      activated({
        mana: "{1}",
        oncePerTurn: true,
        effects: [fx.addManaChoice(1)],
        label: "Un mana de n'importe quelle couleur (une fois par tour)",
      }),
      activated({
        mana: "{2}",
        fromGraveyard: true,
        exileSelf: true,
        targets: [target.cardInGraveyard("t", {}, "any")],
        effects: [fx.exileCard(ref.target())],
        label: "Exilez une carte d'un cimetière",
      }),
    ],
  },
  "Lumbering Laundry": {
    abilities: [
      activated({
        mana: "{2}",
        effects: [fx.thisTurn({ seeFaceDown: true })],
        label: "Ce tour-ci, vous voyez les créatures face cachée adverses",
      }),
    ],
  },
  "Magnetic Snuffler": {
    abilities: [
      triggered(
        when.entersSelf,
        [fx.moveTo(ref.target(), { to: "battlefield" }, { name: "eq" }), fx.attach(ref.self, ref.stored("eq"))],
        {
          targets: [target.cardInGraveyard("t", { subtype: "Equipment" }, "you", "carte d'Équipement de votre cimetière")],
          label: "Renvoyez un Équipement attaché à cette créature",
        },
      ),
      triggered(when.sacrifice({ types: ["Artifact"] }), [fx.addCounters(ref.self, 1)], { label: "Un marqueur +1/+1" }),
    ],
  },
  "Magnifying Glass": {
    abilities: [manaAbility("C"), activated({ mana: "{4}", tap: true, effects: [investigate(1)], label: "Enquêtez" })],
  },
  "Sanitation Automaton": {
    abilities: [triggered(when.entersSelf, [fx.surveil(1)], { label: "Surveillance 1" })],
  },
  "Thinking Cap": {
    // « Équiper {3} » est lu dans le texte.
    abilities: [staticAbility("attached", { power: 1, toughness: 2 }, { label: "+1/+2" }), EQUIP_DETECTIVE],
  },

  // --- Terrains ----------------------------------------------------------------
  "Commercial District": surveilLand,
  "Elegant Parlor": surveilLand,
  "Hedge Maze": surveilLand,
  "Lush Portico": surveilLand,
  "Raucous Theater": surveilLand,
  "Shadowy Backstreet": surveilLand,
  "Undercity Sewers": surveilLand,
  "Public Thoroughfare": {
    abilities: [
      entersWith({ tapped: true }),
      triggered(
        when.entersSelf,
        [
          fx.tapChosen({ anyOf: [{ types: ["Artifact"] }, { types: ["Land"] }] }, "tapped", { exactly: 1 }),
          ...fx.when(cond.not(cond.v("tapped")), fx.sacrificeIt(ref.self)),
        ],
        { label: "Engagez un artefact ou un terrain dégagé, sinon sacrifiez-le" },
      ),
      manaAbility([...FIVE_COLORS]),
    ],
  },
  "Scene of the Crime": {
    abilities: [
      entersWith({ tapped: true }),
      manaAbility("C"),
      manaAbility([...FIVE_COLORS], 1, { tapAnother: "creature" }),
      activated({ mana: "{2}", sacrifice: true, effects: [fx.draw(1)], label: "Piochez une carte" }),
    ],
  },
};
