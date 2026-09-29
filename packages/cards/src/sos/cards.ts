/**
 * Secrets of Strixhaven — cartes des decks du méta (phase 1 du plan P4, lot M1). L'extension n'est pas encore
 * couverte en entier : les autres cartes viendront avec elle.
 */
import {
  activated,
  amount,
  type CardScript,
  cond,
  fx,
  INSTANT_SORCERY,
  loyalty,
  manaAbility,
  modal,
  mode,
  ref,
  spell,
  target,
  triggered,
  when,
} from "./common";

export const CARDS: Record<string, CardScript> = {
  // --- Terrains --------------------------------------------------------------
  "Great Hall of the Biblioplex": {
    abilities: [
      manaAbility("C"),
      manaAbility(["W", "U", "B", "R", "G"], 1, { payLife: 1, restriction: { spell: INSTANT_SORCERY } }),
      activated({
        mana: "{5}",
        effects: fx.when(
          cond.not(cond.sourceMatches({ types: ["Creature"] })),
          fx.modify(
            ref.self,
            {
              addTypes: ["Creature"],
              addSubtypes: ["Wizard"],
              setPower: 2,
              setToughness: 4,
              addAbilities: [
                triggered(when.castSpell("you", INSTANT_SORCERY), [fx.pump(ref.self, 1, 0)], {
                  label: "+1/+0 jusqu'à la fin du tour",
                }),
              ],
            },
            "permanent",
          ),
        ),
        label: "Devient une créature Sorcier 2/4",
      }),
    ],
  },
  // --- Rouge -----------------------------------------------------------------
  "Impractical Joke": {
    spell: spell(
      [target.optional(target.creatureOrPlaneswalker())],
      [fx.thisTurn({ damageUnpreventable: true }), fx.damage(3, ref.target())],
    ),
  },
  // --- Multicolores ----------------------------------------------------------
  "Prismari Charm": {
    spell: modal(
      mode("Surveillance 2, puis piochez une carte", [], [fx.surveil(2), fx.draw(1)]),
      mode("1 blessure à chacune d'une ou deux cibles", [target.between(1, 2, target.any())], [fx.damage(1, ref.target())]),
      mode("Renvoyez un permanent non-terrain", [target.nonland()], [fx.bounce(ref.target())]),
    ),
  },
  "Traumatic Critique": {
    spell: spell([target.any()], [fx.damage(amount.x, ref.target()), fx.draw(2), fx.discard(1)]),
  },

  // --- Lot M2 -----------------------------------------------------------------
  "Professor Dellian Fel": {
    abilities: [
      loyalty(2, { effects: [fx.gainLife(3)], label: "Gagnez 3 PV" }),
      loyalty(0, { effects: [fx.draw(1), fx.loseLife(1)], label: "Piochez, perdez 1 PV" }),
      loyalty(-3, { targets: [target.creature()], effects: [fx.destroy(ref.target())], label: "Détruit une créature" }),
      loyalty(-6, {
        effects: [
          fx.emblem("Professor Dellian Fel", "Whenever you gain life, target opponent loses that much life.", [
            triggered(when.gainLife, [fx.loseLife(amount.eventAmount, ref.target())], {
              targets: [target.player("t", "opponent")],
              label: "Un adversaire perd autant de PV",
            }),
          ]),
        ],
        label: "Emblème",
      }),
    ],
  },
  "Witherbloom Charm": {
    spell: modal(
      mode(
        "Sacrifice facultatif : piochez deux cartes",
        [],
        [fx.sacrifice(ref.you, {}, 1, { optional: true, store: "s" }), ...fx.when(cond.v("s"), fx.draw(2))],
      ),
      mode("Gagnez 5 PV", [], [fx.gainLife(5)]),
      mode(
        "Détruit un permanent non-terrain de VM 2 ou moins",
        [target.nonland("t", { maxManaValue: 2 })],
        [fx.destroy(ref.target())],
      ),
    ),
  },
};
