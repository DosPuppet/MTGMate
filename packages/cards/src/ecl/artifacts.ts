/** Lorwyn Eclipsed — cartes incolores et terrains. */
import type { Color } from "@mtgx/engine";
import {
  activated,
  amount,
  BASIC_LAND,
  type CardScript,
  cond,
  costReducer,
  eventReplacement,
  fx,
  manaAbility,
  ref,
  SHAPESHIFTER,
  staticAbility,
  target,
  triggered,
  when,
} from "./common";

const ANY = ["W", "U", "B", "R", "G"] as const;

/** Les couleurs, avec leur nom au féminin (« cette créature devient blanche »). */
const COLORS: { color: Color; feminine: string }[] = [
  { color: "W", feminine: "blanche" },
  { color: "U", feminine: "bleue" },
  { color: "B", feminine: "noire" },
  { color: "R", feminine: "rouge" },
  { color: "G", feminine: "verte" },
];

/** « Choisissez Elemental, Elf, Faerie, Giant, Goblin, Kithkin, Merfolk ou Treefolk » : les huit tribus de Lorwyn. */
const LORWYN_TRIBES = ["Elemental", "Elf", "Faerie", "Giant", "Goblin", "Kithkin", "Merfolk", "Treefolk"];

export const ARTIFACTS: Record<string, CardScript> = {
  // Équipement {2} lu dans le texte.
  "Mirrormind Crown": {
    abilities: [
      eventReplacement({
        event: "tokens",
        to: "you",
        instead: { copyOfAttached: true, firstEachTurn: true, may: true },
        modify: {},
        label: "Les premiers jetons de chaque tour : des copies de la créature équipée",
      }),
    ],
  },
  "Gathering Stone": {
    chooseOnEnter: "creatureType",
    abilities: [
      costReducer({ subtypeChosen: true }, 1, "Vos sorts du type choisi coûtent {1} de moins"),
      ...[when.entersSelf, when.yourUpkeep].map((w) =>
        triggered(
          w,
          [
            fx.lookAtTop(1, { filter: { subtypeChosen: true }, rest: "top", store: "g" }),
            ...fx.when(
              cond.not(cond.v("g")),
              ...fx.may(
                "Mettre la carte du dessus dans votre cimetière ?",
                fx.moveTo(ref.libraryTop(ref.you), { to: "graveyard" }),
              ),
            ),
          ],
          { label: "Regardez la carte du dessus : du type choisi, en main ; sinon, au cimetière si vous le voulez" },
        ),
      ),
    ],
  },
  // --- Changelins incolores ---------------------------------------------------
  "Changeling Wayfinder": {
    abilities: [
      triggered(when.entersSelf, fx.may("Chercher une carte de terrain de base ?", fx.search(BASIC_LAND)), {
        label: "Cherchez une carte de terrain de base et mettez-la dans votre main",
      }),
    ],
  },
  "Rooftop Percher": {
    abilities: [
      triggered(when.entersSelf, [fx.exileCard(ref.target()), fx.gainLife(3)], {
        targets: [target.upTo(2, target.cardInGraveyard("t", {}, "any", "carte d'un cimetière"))],
        label: "Exilez jusqu'à deux cartes de cimetières ; vous gagnez 3 PV",
      }),
    ],
  },

  // --- Artefacts ----------------------------------------------------------------
  "Chronicle of Victory": {
    chooseOnEnter: "creatureType",
    abilities: [
      staticAbility(
        { types: ["Creature"], controller: "you", subtypeChosen: true },
        { power: 2, toughness: 2, addKeywords: ["firstStrike", "trample"] },
        { label: "Vos créatures du type choisi : +2/+2, initiative et piétinement" },
      ),
      triggered(when.castSpell("you", { subtypeChosen: true }), [fx.draw(1)], {
        label: "Sort du type choisi : piochez une carte",
      }),
    ],
  },
  "Dawn-Blessed Pennant": {
    // Le choix est restreint aux huit tribus : un « mode » choisi en arrivant (comme les Sièges de Tarkir), chaque
    // capacité étant écrite pour chaque tribu et conditionnée par le choix.
    chooseOnEnter: "mode",
    enterModes: LORWYN_TRIBES,
    abilities: [
      ...LORWYN_TRIBES.map((tribe) =>
        triggered(when.enters({ controller: "you", subtype: tribe }), [fx.gainLife(1)], {
          condition: cond.chosenMode(tribe),
          label: `Un permanent ${tribe} arrive sous votre contrôle : vous gagnez 1 PV`,
        }),
      ),
      ...LORWYN_TRIBES.map((tribe) =>
        activated({
          mana: "{2}",
          tap: true,
          sacrifice: true,
          activationCondition: cond.chosenMode(tribe),
          targets: [target.cardInGraveyard("t", { subtype: tribe }, "you", `carte de ${tribe} de votre cimetière`)],
          effects: [fx.toHand(ref.target())],
          label: `Renvoyez une carte de ${tribe} de votre cimetière dans votre main`,
        }),
      ),
    ],
  },
  "Foraging Wickermaw": {
    abilities: [
      triggered(when.entersSelf, [fx.surveil(1)], { label: "Surveillance 1" }),
      // « {1} : ajoutez un mana de n'importe quelle couleur ; cette créature devient de cette couleur jusqu'à la fin du
      // tour. N'activez qu'une fois par tour. » Une capacité par couleur ; « une fois par tour » pour l'ensemble : la
      // créature doit encore être incolore (elle prend la couleur du mana jusqu'à la fin du tour).
      ...COLORS.map(({ color, feminine }) =>
        activated({
          mana: "{1}",
          oncePerTurn: true,
          activationCondition: cond.sourceMatches({ colorCount: 0 }),
          effects: [fx.addMana(color), fx.modify(ref.self, { setColors: [color] })],
          label: `Ajoutez {${color}} ; cette créature devient ${feminine} jusqu'à la fin du tour`,
        }),
      ),
    ],
  },
  "Puca's Eye": {
    abilities: [
      // La couleur est choisie pendant la résolution, après la pioche (Mondo Gecko : couleur figée dans l'effet).
      triggered(
        when.entersSelf,
        [fx.draw(1), fx.chooseForSelf("color"), fx.modify(ref.self, { setColorsChosen: true }, "permanent")],
        { label: "Piochez une carte, puis choisissez une couleur : cet artefact devient de cette couleur" },
      ),
      activated({
        mana: "{3}",
        tap: true,
        activationCondition: cond.amountAtLeast(amount.colorsAmong(), 5),
        effects: [fx.draw(1)],
        label: "Piochez une carte (cinq couleurs parmi vos permanents)",
      }),
    ],
  },

  // --- Équipements --------------------------------------------------------------
  "Stalactite Dagger": {
    // Équipement {2} : lu dans le texte.
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(SHAPESHIFTER)], {
        label: "Créez un jeton Changeforme 1/1 incolore avec le changelin",
      }),
      staticAbility(
        "attached",
        { power: 1, toughness: 1, allCreatureTypes: true },
        { label: "+1/+1 ; la créature équipée a tous les types de créature" },
      ),
    ],
  },

  // --- Terrain --------------------------------------------------------------------
  "Eclipsed Realms": {
    // Approximation : le type est choisi parmi tous les types de créature.
    chooseOnEnter: "creatureType",
    abilities: [
      manaAbility("C"),
      manaAbility([...ANY], 1, {
        restriction: { spell: { subtypeChosen: true }, abilityOfSource: { subtypeChosen: true } },
      }),
    ],
  },
};
