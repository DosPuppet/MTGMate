/**
 * Comportement des cartes de Foundations (FDN).
 * Les caractéristiques (coût, types, F/E, mots-clés) viennent de Scryfall ;
 * on ne décrit ici que ce qui ne se déduit pas des mots-clés.
 */
import { type CardScript, dsl, type TokenSpec } from "@mtgx/engine";

const { target, ref, fx, amount, spell, modal, mode, manaAbility, activated } = dsl;

const GOBLIN: TokenSpec = { name: "Goblin", colors: ["R"], types: ["Creature"], subtypes: ["Goblin"], power: 1, toughness: 1 };

export const FDN_SCRIPTS: Record<string, CardScript> = {
  // --- Vert ---
  "Llanowar Elves": { abilities: [manaAbility("G")] },
  "Druid of the Cowl": { abilities: [manaAbility("G")] },
  "Giant Growth": { spell: spell([target.creature()], [fx.pump(ref.target(), 3, 3)]) },
  "Bite Down": {
    spell: spell(
      [
        target.creature("a", { controller: "you" }),
        target.permanent("b", ["Creature", "Planeswalker"], { controller: "opponent" }, "créature ou planeswalker adverse"),
      ],
      [fx.damage(amount.powerOf(ref.target("a")), ref.target("b"), ref.target("a"))],
    ),
  },
  Overrun: { spell: spell([], [fx.pumpAll({ controller: "you" }, 3, 3, ["trample"])]) },
  "Primal Might": {
    spell: spell(
      [target.creature("a", { controller: "you" }), target.optional(target.creature("b", { controller: "opponent" }))],
      [fx.pump(ref.target("a"), amount.x, amount.x), fx.fight(ref.target("a"), ref.target("b"))],
    ),
  },
  "Wildheart Invoker": {
    abilities: [
      activated({
        mana: "{8}",
        targets: [target.creature()],
        effects: [fx.pump(ref.target(), 5, 5, ["trample"])],
        label: "+5/+5 et piétinement",
      }),
    ],
  },

  // --- Rouge ---
  "Fanatical Firebrand": {
    abilities: [
      activated({
        tap: true,
        sacrifice: true,
        targets: [target.any()],
        effects: [fx.damage(1, ref.target(), ref.self)],
        label: "1 blessure",
      }),
    ],
  },
  "Shivan Dragon": { abilities: [activated({ mana: "{R}", effects: [fx.pump(ref.self, 1, 0)], label: "+1/+0" })] },
  "Burst Lightning": { kicker: "{4}", spell: spell([target.any()], [fx.damage(amount.kicked(4, 2), ref.target())]) },
  Boltwave: { spell: spell([], [fx.damage(3, ref.eachOpponent)]) },
  Abrade: {
    spell: modal(
      mode("3 blessures à une créature", [target.creature()], [fx.damage(3, ref.target())]),
      mode("Détruire un artefact", [target.permanent("t", ["Artifact"], {}, "artefact")], [fx.destroy(ref.target())]),
    ),
  },
  "Sure Strike": { spell: spell([target.creature()], [fx.pump(ref.target(), 3, 0, ["firstStrike"])]) },
  "Kindled Fury": { spell: spell([target.creature()], [fx.pump(ref.target(), 1, 0, ["firstStrike"])]) },
  "Dragon Fodder": { spell: spell([], [fx.createTokens(GOBLIN, 2)]) },
};
