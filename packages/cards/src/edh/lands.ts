/**
 * Commander (PLAN-E, E8) : base de mana commune des decks Commander. Terrains douloureux, à contrôle, « deux terrains de
 * base », fetchs, Triomes (cycle et types de terrain lus dans le texte), terrains légendaires (Urborg, Otawara, Phyrexian
 * Tower), terrains filtres et restreints ; rocs de mana (Sol Ring, talismans) et « pas de taille maximale de main ».
 */
import type { CardScript, ManaType, TokenSpec } from "@mtgx/engine";
import {
  ANY_COLOR,
  activated,
  amount,
  cond,
  entersWith,
  fx,
  manaAbility,
  playerStatic,
  ref,
  staticAbility,
  target,
  triggered,
  when,
} from "./common";

/** Sang : « {1}, {T}, défaussez une carte, sacrifiez ce jeton : piochez une carte » (la défausse est un coût). */
export const BLOOD: TokenSpec = {
  name: "Blood",
  colors: [],
  types: ["Artifact"],
  subtypes: ["Blood"],
  abilities: [
    activated({ mana: "{1}", tap: true, discard: 1, sacrifice: true, effects: [fx.draw(1)], label: "Défaussez, piochez" }),
  ],
  text: "{1}, {T}, Discard a card, Sacrifice this token: Draw a card.",
};

/** Terrains et artefacts « douloureux » : {C}, ou l'une de deux couleurs et 1 blessure à vous. */
const painSource = (a: ManaType, b: ManaType): CardScript => ({
  abilities: [manaAbility("C"), manaAbility([a, b], 1, { drawback: { damageYou: 1 } })],
});

/** Terrains « à contrôle » : arrive engagé sauf si vous contrôlez un terrain de l'un de ces deux types. */
const checkLand = (a: ManaType, b: ManaType, typeA: string, typeB: string): CardScript => ({
  abilities: [
    entersWith({
      tapped: true,
      condition: cond.not(cond.controls({ types: ["Land"], anySubtype: [typeA, typeB] })),
      label: `Engagé, sauf si vous contrôlez une ${typeA === "Plains" ? "Plaine" : typeA} ou un ${typeB}`,
    }),
    manaAbility([a, b]),
  ],
});

/** Terrains « de bataille » (types de base lus dans le texte) : engagés sauf avec deux terrains de base ou plus. */
const battleLand: CardScript = {
  abilities: [
    entersWith({
      tapped: true,
      condition: cond.not(cond.controls({ types: ["Land"], basic: true }, 2)),
      label: "Engagé, sauf si vous contrôlez deux terrains de base ou plus",
    }),
  ],
};

/** Triomes et tours de New Capenna : arrivent engagés (types de terrain et cycle lus dans le texte). */
const tappedTriland: CardScript = { abilities: [entersWith({ tapped: true })] };

/** Terrains « fetch » : {T}, 1 PV, sacrifice : une carte de [type] ou [type] sur le champ de bataille. */
const fetchland = (a: string, b: string): CardScript => ({
  abilities: [
    activated({
      tap: true,
      payLife: 1,
      sacrifice: true,
      effects: [fx.search({ types: ["Land"], anySubtype: [a, b] }, { to: "battlefield" })],
      label: `Cherchez une carte de ${a} ou de ${b}`,
    }),
  ],
});

/** « Vous n'avez pas de taille maximale de main », et {T} : ajoutez du mana. */
const noMaxHand = (...mana: ReturnType<typeof manaAbility>[]): CardScript => ({
  abilities: [playerStatic({ noMaxHandSize: true, label: "Pas de taille maximale de main" }), ...mana],
});

export const EDH_LANDS: Record<string, CardScript> = {
  // --- Terrains douloureux et talismans ---
  "Adarkar Wastes": painSource("W", "U"),
  "Caves of Koilos": painSource("W", "B"),
  "Underground River": painSource("U", "B"),
  "Talisman of Dominance": painSource("U", "B"),
  "Talisman of Hierarchy": painSource("W", "B"),
  "Talisman of Progress": painSource("W", "U"),
  "Sulfurous Springs": painSource("B", "R"),
  "Talisman of Indulgence": painSource("B", "R"),

  // --- Terrains à contrôle ---
  "Dragonskull Summit": checkLand("B", "R", "Swamp", "Mountain"),
  "Drowned Catacomb": checkLand("U", "B", "Island", "Swamp"),
  "Glacial Fortress": checkLand("W", "U", "Plains", "Island"),
  "Isolated Chapel": checkLand("W", "B", "Plains", "Swamp"),

  // --- Deux terrains de base, Triomes, terrains tricolores ---
  "Prairie Stream": battleLand,
  "Smoldering Marsh": battleLand,
  "Blackcleave Cliffs": {
    abilities: [
      entersWith({
        tapped: true,
        condition: cond.controls({ types: ["Land"], other: true }, 3),
        label: "Engagé, sauf si vous contrôlez deux autres terrains ou moins",
      }),
      manaAbility(["B", "R"]),
    ],
  },
  // Choix automatique : une carte de Marais ou de Montagne de la main est révélée si possible (docs/approximations.md).
  "Foreboding Ruins": {
    abilities: [
      entersWith({
        tapped: true,
        condition: cond.not(cond.amountAtLeast(amount.countIn("hand", { anySubtype: ["Swamp", "Mountain"] }), 1)),
        label: "Engagé, sauf si vous révélez une carte de Marais ou de Montagne de votre main",
      }),
      manaAbility(["B", "R"]),
    ],
  },
  "Graven Cairns": {
    abilities: [
      manaAbility("C"),
      activated({
        mana: "{B/R}",
        tap: true,
        effects: [fx.addManaCombination(2, ["B", "R"])],
        label: "{B}{B}, {B}{R} ou {R}{R}",
      }),
    ],
  },
  "Blightstep Pathway": { abilities: [manaAbility("B")] },
  "Searstep Pathway": { abilities: [manaAbility("R")] },
  "Sunken Hollow": battleLand,
  "Raffine's Tower": tappedTriland,
  "Savai Triome": tappedTriland,
  "Ketria Triome": tappedTriland,
  "Arcane Sanctum": { abilities: [entersWith({ tapped: true }), manaAbility(["W", "U", "B"])] },

  // --- Fetchs ---
  "Bloodstained Mire": fetchland("Swamp", "Mountain"),
  "Flooded Strand": fetchland("Plains", "Island"),
  "Polluted Delta": fetchland("Island", "Swamp"),
  "Windswept Heath": fetchland("Forest", "Plains"),
  "Wooded Foothills": fetchland("Mountain", "Forest"),

  // --- Terrains à capacité ---
  "Bojuka Bog": {
    abilities: [
      entersWith({ tapped: true }),
      triggered(when.entersSelf, [fx.moveTo(ref.graveyardOf(ref.target("p")), { to: "exile" })], {
        targets: [target.player("p")],
        label: "Exilez le cimetière du joueur ciblé",
      }),
      manaAbility("B"),
    ],
  },
  "Otawara, Soaring City": {
    abilities: [
      manaAbility("U"),
      // Canalisation : depuis la main, en défaussant la carte ; {1} de moins par créature légendaire que vous contrôlez.
      activated({
        mana: "{3}{U}",
        fromHand: true,
        discardSelf: true,
        reduction: { generic: amount.count({ types: ["Creature"], legendary: true, controller: "you" }) },
        targets: [
          target.permanent(
            "t",
            ["Artifact", "Creature", "Enchantment", "Planeswalker"],
            {},
            "artefact, créature, enchantement ou planeswalker",
          ),
        ],
        effects: [fx.toHand(ref.target())],
        label: "Canalisation — renvoyez le permanent ciblé dans la main de son propriétaire",
      }),
    ],
  },
  "Phyrexian Tower": {
    abilities: [
      manaAbility("C"),
      activated({
        tap: true,
        sacrificeOther: { filter: { types: ["Creature"] } },
        effects: [fx.addMana("B", "B")],
        label: "Sacrifiez une créature : ajoutez {B}{B}",
      }),
    ],
  },
  "Reliquary Tower": noMaxHand(manaAbility("C")),
  "Sunken Ruins": {
    abilities: [
      manaAbility("C"),
      activated({
        mana: "{U/B}",
        tap: true,
        effects: [fx.addManaCombination(2, ["U", "B"])],
        label: "Ajoutez {U}{U}, {U}{B} ou {B}{B}",
      }),
    ],
  },
  "Unclaimed Territory": {
    chooseOnEnter: "creatureType",
    abilities: [
      manaAbility("C"),
      manaAbility(ANY_COLOR, 1, { restriction: { spell: { types: ["Creature"], subtypeChosen: true } } }),
    ],
  },
  "Urborg, Tomb of Yawgmoth": {
    abilities: [staticAbility({ types: ["Land"] }, { addSubtypes: ["Swamp"] }, { label: "Chaque terrain est aussi un Marais" })],
  },
  "Voldaren Estate": {
    abilities: [
      manaAbility("C"),
      manaAbility(ANY_COLOR, 1, { payLife: 1, restriction: { spell: { subtype: "Vampire" } } }),
      activated({
        mana: "{5}",
        tap: true,
        reduction: { generic: amount.count({ subtype: "Vampire", controller: "you" }) },
        effects: [fx.createTokens(BLOOD)],
        label: "Créez un jeton Sang",
      }),
    ],
  },

  // --- Artefacts ---
  "Sol Ring": { abilities: [manaAbility("C", 2)] },
  "Thought Vessel": noMaxHand(manaAbility("C")),
  "Decanter of Endless Water": noMaxHand(manaAbility(ANY_COLOR)),
  "Relic of Legends": {
    abilities: [
      manaAbility(ANY_COLOR),
      manaAbility(ANY_COLOR, 1, { noTap: true, tapAnother: { types: ["Creature"], legendary: true } }),
    ],
  },
};
