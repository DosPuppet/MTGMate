/** The Hobbit — cartes incolores et terrains (lot A). */
import type { ManaType } from "@mtgx/engine";
import {
  activated,
  amount,
  BASIC_LAND,
  type CardScript,
  cond,
  cost,
  costReducer,
  entersWith,
  equipAbility,
  fx,
  INSTANT_SORCERY,
  manaAbility,
  ref,
  spell,
  staticAbility,
  TREASURE,
  target,
  targetObj,
  triggered,
  wardAbility,
  when,
} from "./common";

/**
 * Terrains bicolores du cycle « arrive engagé ; {T} : ajoutez {X} ou {Y} ; {2}{X}{Y}, {T}, sacrifiez ce terrain : mettez
 * deux marqueurs +1/+1 sur une [créature du type] ciblée que vous contrôlez, en rituel ».
 */
const tribalLand = (a: ManaType, b: ManaType, subtypes: string[], label: string): CardScript => ({
  abilities: [
    entersWith({ tapped: true }),
    manaAbility([a, b]),
    activated({
      mana: `{2}{${a}}{${b}}`,
      tap: true,
      sacrifice: true,
      sorcerySpeed: true,
      targets: [
        target.permanent(
          "t",
          ["Creature"],
          { controller: "you", ...(subtypes.length > 1 ? { anySubtype: subtypes } : { subtype: subtypes[0] }) },
          `${label} que vous contrôlez`,
        ),
      ],
      effects: [fx.addCounters(ref.target(), 2)],
      label: `Deux marqueurs +1/+1 sur un(e) ${label}`,
    }),
  ],
});

export const ARTIFACTS: Record<string, CardScript> = {
  // --- Créatures incolores --------------------------------------------------------
  "Long-Bodied Grey Dog": {
    // Flash et portée : lus dans le texte.
    abilities: [triggered(when.entersSelf, [fx.createTappedTokens(TREASURE)], { label: "Un Trésor engagé" })],
  },
  "Old Thrush": {
    // Vol : lu dans le texte. La recherche est facultative (« jusqu'à une ») ; la carte est mise sur le dessus après le
    // mélange.
    abilities: [
      triggered(when.entersSelf, [fx.gainLife(2), fx.search(BASIC_LAND, { to: "libraryTop" })], {
        label: "2 PV ; un terrain de base sur le dessus de votre bibliothèque",
      }),
    ],
  },
  "Troop of Ponies": {
    abilities: [
      activated({
        mana: "{2}",
        tap: true,
        sacrifice: true,
        effects: [
          // Les terrains trouvés passent par la main ; l'un d'eux va ensuite sur le champ de bataille engagé.
          fx.search(BASIC_LAND, { to: "hand" }, 2, undefined, "lands"),
          fx.pickFromZone(
            "hand",
            BASIC_LAND,
            { to: "battlefield", tapped: true },
            { pool: ref.stored("lands"), prompt: "Le terrain à mettre sur le champ de bataille engagé" },
          ),
        ],
        label: "Deux terrains de base : l'un sur le champ de bataille engagé, l'autre en main",
      }),
    ],
  },

  // --- Artefacts --------------------------------------------------------------------
  "The Arkenstone": {
    abilities: [
      staticAbility({ types: ["Creature"], controller: "you" }, { power: 1, toughness: 1 }, { label: "Vos créatures : +1/+1" }),
      triggered(when.yourEndStep, [fx.draw(1)], { label: "Piochez une carte" }),
    ],
  },
  "Seek the Heart": {
    spell: spell([], [fx.search({ types: ["Creature"], legendary: true })]),
  },
  "The Black Arrow": {
    // Flash et Équiper {1} : lus dans le texte. « Blessée de cette façon » : la cible a reçu des blessures de la Flèche.
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.damage(1, ref.target()),
          ...fx.when(cond.targetMatches("t", { subtype: "Dragon", damagedBySource: true }), fx.destroy(ref.target())),
        ],
        { targets: [target.any()], label: "1 blessure ; un Dragon ainsi blessé est détruit" },
      ),
      staticAbility("attached", { power: 1, toughness: 1, addKeywords: ["reach"] }, { label: "+1/+1 et la portée" }),
    ],
  },
  "Dwarven Mattock": {
    // Équiper {3} : lu dans le texte.
    abilities: [
      triggered(when.entersSelf, [fx.attach(ref.target())], {
        targets: [target.permanent("t", ["Creature"], { subtype: "Dwarf", controller: "you" }, "Nain que vous contrôlez")],
        label: "Attachez-le à un Nain",
      }),
      staticAbility(
        "attached",
        { power: 2, toughness: 2, addAbilities: [wardAbility({ mana: cost("{1}") })] },
        { label: "+2/+2 et la garde {1}" },
      ),
    ],
  },
  "Giant's Boulder": {
    abilities: [
      triggered(when.entersSelf, [fx.scry(2)], { label: "Regard 2" }),
      activated({ mana: "{1}", tap: true, effects: [fx.addManaChoice(1)], label: "Un mana de n'importe quelle couleur" }),
      activated({
        mana: "{7}",
        tap: true,
        sacrifice: true,
        targets: [targetObj("t", { permanent: true }, "permanent")],
        effects: [fx.destroy(ref.target())],
        label: "Détruisez un permanent",
      }),
    ],
  },
  "Glamdring, Foe-hammer": {
    // Équiper {2} : lu dans le texte. Une force négative ne rend pas les sorts plus chers.
    abilities: [
      costReducer(INSTANT_SORCERY, 0, "Éphémères et rituels : {X} de moins (force de la créature équipée)", {
        genericAmount: amount.max(0, amount.powerOf(ref.attached)),
      }),
    ],
  },
  "Gleam of Death": {
    spell: spell([], [fx.mill(6, ref.you, { name: "m" }), fx.toHand(ref.filtered(ref.stored("m"), INSTANT_SORCERY))]),
  },
  "My Precious": {
    abilities: [
      staticAbility(
        "attached",
        { addKeywords: ["hexproof", "unblockable"] },
        { label: "Défense talismanique, ne peut pas être bloquée" },
      ),
      // « Équiper—{2}, payez 2 points de vie » : non lu dans le texte (coût composé).
      equipAbility({ mana: "{2}", payLife: 2, label: "Équiper {2}, 2 PV" }),
    ],
  },
  "Allure of Power": {
    additionalCost: { sacrifice: { filter: { types: ["Creature"] }, count: 1 } },
    spell: spell([], [fx.draw(2)]),
  },
  "Orcrist, Goblin-cleaver": {
    // Équiper {3} : lu dans le texte. Le type choisi est gardé sur Orcrist, et choisi de nouveau à chaque fois.
    abilities: [
      staticAbility("attached", { power: 2, toughness: 2, addKeywords: ["trample"] }, { label: "+2/+2 et le piétinement" }),
      triggered(
        when.attachedDealsCombatDamageToPlayer,
        [
          fx.chooseForSelf("creatureType"),
          fx.createTokens(TREASURE, amount.count({ types: ["Creature"], controller: "you", subtypeChosen: true })),
        ],
        { label: "Choisissez un type : un Trésor par créature de ce type que vous contrôlez" },
      ),
    ],
  },
  "Sting, Bilbo's Sword": {
    // Flash et Équiper {3} : lus dans le texte. Marqueurs d'affûtage : règle générale du moteur (+1/+0 à la créature
    // équipée par marqueur sur l'Équipement).
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.counters(ref.self, "hone", amount.refCount(ref.permanentsOf(ref.target("o"), { types: ["Creature"] }))),
          fx.attach(ref.target("c")),
        ],
        {
          targets: [target.player("o", "opponent"), target.upTo(1, target.creature("c", { controller: "you" }))],
          label: "Un marqueur d'affûtage par créature adverse ; attachez Dard",
        },
      ),
    ],
  },
  "Thrór's Map": {
    abilities: [
      triggered(when.entersSelf, [fx.search(BASIC_LAND)], { label: "Un terrain de base en main" }),
      activated({ mana: "{2}", tap: true, effects: fx.loot(1), label: "Piochez une carte, puis défaussez-en une" }),
    ],
  },
  "Well-Worn Spatula": {
    // Équiper {1} : lu dans le texte.
    abilities: [
      triggered(when.entersSelf, [fx.gainLife(2)], { label: "Vous gagnez 2 PV" }),
      staticAbility("attached", { power: 1, toughness: 1 }, { label: "+1/+1" }),
    ],
  },

  // --- Terrains ---------------------------------------------------------------------
  "Elvenking's Halls": tribalLand("G", "U", ["Elf"], "Elfe"),
  "Goblin-town": tribalLand("B", "R", ["Goblin", "Orc"], "Gobelin ou Orque"),
  "Iron Hills": tribalLand("R", "W", ["Dwarf"], "Nain"),
  "Lake-town": tribalLand("W", "U", ["Human"], "Humain"),
  Mirkwood: tribalLand("B", "G", ["Bear", "Spider", "Wolf"], "Ours, Araignée ou Loup"),
  "Hobbit Hole": {
    // Cycle de Hobbit {4} : lu dans le texte.
    abilities: [
      activated({
        tap: true,
        sacrifice: true,
        effects: [fx.search(BASIC_LAND, { to: "battlefield", tapped: true })],
        label: "Un terrain de base engagé",
      }),
    ],
  },
};
