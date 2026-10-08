/**
 * Commander : terrains du deck « Nier Automata Deck » (The Vision). Terrains d'Urza (Mine, Power Plant, Tower, Cave,
 * Workshop, Saga), terrains incolores utilitaires (Buried Ruin, Emergence Zone, Sanctum of Ugin, Scorched Ruins, Shrine of
 * the Forsaken Gods, War Room, Witch's Clinic), copies (Vesuva, The Mycosynth Gardens) et Planar Nexus.
 */
import type { CardScript, ObjectFilter, TokenSpec } from "@mtgx/engine";
import { LAND_TYPES } from "@mtgx/engine";
import { activated, amount, chapter, cond, fx, manaAbility, ref, staticAbility, target, triggered, when } from "./common";

const ARTIFACTS_YOU: ObjectFilter = { types: ["Artifact"], controller: "you" };
const HISTORIC: ObjectFilter = { anyOf: [{ types: ["Artifact"] }, { legendary: true }, { subtype: "Saga" }] };
/** Types de terrain non de base (205.3i) : tous les types de terrain sauf les cinq types de base. */
const NONBASIC_LAND_TYPES = [...LAND_TYPES].filter((t) => !["Plains", "Island", "Swamp", "Mountain", "Forest"].includes(t));

/** « {1}, {T} : ajoutez un mana de n'importe quelle couleur. » */
const anyColorForOne = activated({
  mana: "{1}",
  tap: true,
  effects: [fx.addManaChoice(1)],
  label: "Un mana de n'importe quelle couleur",
});

/**
 * Terrains de Tron : « {T} : ajoutez {C}. Si vous contrôlez [les deux autres], ajoutez N à la place » ; une capacité de
 * mana dont la quantité dépend de la condition, écrite comme deux capacités aux conditions exclusives.
 */
const tron = (others: [string, string], amountIf: number): CardScript => {
  const both = cond.all(
    cond.controls({ types: ["Land"], subtype: others[0] }),
    cond.controls({ types: ["Land"], subtype: others[1] }),
  );
  return {
    abilities: [manaAbility("C", 1, { condition: cond.not(both) }), manaAbility("C", amountIf, { condition: both })],
  };
};

/** Construction 0/0 incolore : « ce jeton gagne +1/+1 pour chaque artefact que vous contrôlez » (Urza's Saga). */
const CONSTRUCT: TokenSpec = {
  name: "Construct",
  colors: [],
  types: ["Artifact", "Creature"],
  subtypes: ["Construct"],
  power: 0,
  toughness: 0,
  abilities: [staticAbility("self", { power: 1, toughness: 1 }, { per: ARTIFACTS_YOU, label: "+1/+1 par artefact" })],
  text: "This token gets +1/+1 for each artifact you control.",
};

export const EDH_VISION_LANDS: Record<string, CardScript> = {
  "Abstergo Entertainment": {
    abilities: [
      manaAbility("C"),
      anyColorForOne,
      activated({
        mana: "{3}",
        tap: true,
        exileSelf: true,
        targets: [target.optional(target.cardInGraveyard("t", HISTORIC, "you", "carte historique de votre cimetière"))],
        effects: [fx.toHand(ref.target()), fx.moveAll("graveyard", ref.eachPlayer, {}, { to: "exile" })],
        label: "Une carte historique revient en main, puis exilez tous les cimetières",
      }),
    ],
  },
  "Buried Ruin": {
    abilities: [
      manaAbility("C"),
      activated({
        mana: "{2}",
        tap: true,
        sacrifice: true,
        targets: [target.cardInGraveyard("t", { types: ["Artifact"] }, "you", "carte d'artefact de votre cimetière")],
        effects: [fx.toHand(ref.target())],
        label: "Une carte d'artefact de votre cimetière revient en main",
      }),
    ],
  },
  // Indestructible : lu dans le texte.
  "Darksteel Citadel": { abilities: [manaAbility("C")] },
  "Emergence Zone": {
    abilities: [
      manaAbility("C"),
      activated({
        mana: "{1}",
        tap: true,
        sacrifice: true,
        effects: [fx.thisTurn({ spellKeywords: { filter: {}, keywords: ["flash"] } })],
        label: "Vous pouvez lancer des sorts comme s'ils avaient le flash ce tour-ci",
      }),
    ],
  },
  "Planar Nexus": {
    abilities: [
      staticAbility("self", { addSubtypes: NONBASIC_LAND_TYPES }, { label: "A chaque type de terrain non de base" }),
      manaAbility("C"),
      anyColorForOne,
    ],
  },
  "Sanctum of Ugin": {
    abilities: [
      manaAbility("C"),
      triggered(
        when.castSpell("you", { colorCount: 0, minManaValue: 7 }),
        fx.may(
          "Sacrifier Sanctum of Ugin pour chercher une carte de créature incolore ?",
          fx.sacrifice(ref.you, { self: true }, 1, { store: "sanctum" }),
          fx.when(cond.v("sanctum"), fx.search({ types: ["Creature"], colorCount: 0 }, { to: "hand" })),
        ),
        { label: "Sort incolore de valeur de mana 7 ou plus : sacrifiez ce terrain pour chercher une créature incolore" },
      ),
    ],
  },
  // « Si ce terrain devait arriver, sacrifiez deux terrains dégagés à la place. Si vous le faites, mettez-le sur le champ
  // de bataille. Sinon, mettez-le dans le cimetière » : en arrivant (614.1c), comme Mox Diamond ; sans deux terrains
  // dégagés, rien n'est sacrifié.
  "Scorched Ruins": {
    asEnters: [
      ...fx.when(
        cond.controls({ types: ["Land"], tapped: false }, 2),
        fx.sacrifice(ref.you, { types: ["Land"], tapped: false }, 2, { store: "ruins" }),
      ),
      ...fx.when(cond.not(cond.v("ruins", 2)), fx.moveTo(ref.self, { to: "graveyard" })),
    ],
    abilities: [manaAbility("C", 4)],
  },
  "Shrine of the Forsaken Gods": {
    abilities: [
      manaAbility("C"),
      manaAbility("C", 2, {
        restriction: { spell: { colorCount: 0 } },
        condition: cond.controls({ types: ["Land"] }, 7),
      }),
    ],
  },
  "The Grey Havens": {
    abilities: [
      triggered(when.entersSelf, [fx.scry(1)], { label: "Regard 1" }),
      manaAbility("C"),
      manaAbility(["W", "U", "B", "R", "G"], 1, {
        colorsOf: { types: ["Creature"], legendary: true },
        colorsZone: "graveyard",
      }),
    ],
  },
  "The Mycosynth Gardens": {
    abilities: [
      manaAbility("C"),
      anyColorForOne,
      activated({
        mana: "{X}",
        tap: true,
        targets: [
          target.permanent("t", ["Artifact"], { controller: "you", token: false }, "artefact non-jeton que vous contrôlez"),
        ],
        effects: [fx.becomeCopy(ref.self, ref.target(), "permanent", { ifManaValue: amount.x })],
        label: "Devient une copie d'un artefact non-jeton de valeur de mana X que vous contrôlez",
      }),
    ],
  },
  "Urza's Cave": {
    abilities: [
      manaAbility("C"),
      activated({
        mana: "{3}",
        tap: true,
        sacrifice: true,
        effects: [fx.search({ types: ["Land"] }, { to: "battlefield", tapped: true })],
        label: "Cherchez une carte de terrain, mise sur le champ de bataille engagée",
      }),
    ],
  },
  "Urza's Mine": tron(["Power-Plant", "Tower"], 2),
  "Urza's Power Plant": tron(["Mine", "Tower"], 2),
  "Urza's Tower": tron(["Mine", "Power-Plant"], 3),
  // Saga (lore) : un marqueur en arrivant et après votre étape de pioche ; sacrifiée après le chapitre III.
  "Urza's Saga": {
    abilities: [
      chapter([1], [fx.modify(ref.self, { addAbilities: [manaAbility("C")] }, "permanent")], {
        label: "Chapitre I — gagne « {T} : ajoutez {C} »",
      }),
      chapter(
        [2],
        [
          fx.modify(
            ref.self,
            {
              addAbilities: [
                activated({
                  mana: "{2}",
                  tap: true,
                  effects: [fx.createTokens(CONSTRUCT)],
                  label: "Un jeton de créature-artefact Construction 0/0",
                }),
              ],
            },
            "permanent",
          ),
        ],
        { label: "Chapitre II — gagne « {2}, {T} : un jeton Construction »" },
      ),
      // « Une carte d'artefact au coût de mana {0} ou {1} » : une carte sans coût de mana (un terrain-artefact) ou avec {X}
      // n'en a pas.
      chapter(
        [3],
        [fx.search({ types: ["Artifact"], notTypes: ["Land"], maxManaValue: 1, hasX: false }, { to: "battlefield" })],
        { label: "Chapitre III — cherchez un artefact au coût de mana {0} ou {1}" },
      ),
    ],
  },
  "Urza's Workshop": {
    abilities: [
      manaAbility("C"),
      // Métallurgie : trois artefacts ou plus.
      manaAbility("C", 1, {
        per: { types: ["Land"], subtype: "Urza's", controller: "you" },
        condition: cond.controls({ types: ["Artifact"] }, 3),
      }),
    ],
  },
  // « Vous pouvez faire arriver ce terrain engagé comme une copie de n'importe quel terrain sur le champ de bataille. »
  Vesuva: { asEnters: [fx.chooseCopy({ types: ["Land"] }, { anyController: true, tapped: true })] },
  "War Room": {
    abilities: [
      manaAbility("C"),
      activated({
        mana: "{3}",
        tap: true,
        payLife: amount.commanderColors,
        effects: [fx.draw(1)],
        label: "PV égaux au nombre de couleurs de l'identité de vos commandants : piochez une carte",
      }),
    ],
  },
  "Witch's Clinic": {
    abilities: [
      manaAbility("C"),
      activated({
        mana: "{2}",
        tap: true,
        targets: [target.permanent("t", [], { commander: true }, "commandant")],
        effects: [fx.pump(ref.target(), 0, 0, ["lifelink"])],
        label: "Le commandant ciblé gagne le lien de vie jusqu'à la fin du tour",
      }),
    ],
  },
};
