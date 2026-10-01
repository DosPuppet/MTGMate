/**
 * Éléments de Secrets of Strixhaven (SOS) : jetons de l'extension et aides des mécaniques (Repartee, Infusion, Opus,
 * Increment). Le DSL et les jetons communs viennent de lci/common.ts.
 */
import type { Condition, dsl, Effect, TokenSpec, TriggeredAbilityDef, TriggerSpec } from "@mtgx/engine";
import { amount, cond, fx, INSTANT_SORCERY, ref, triggered, when } from "../lci/common";

export * from "../lci/common";

const creature = (
  name: string,
  colors: TokenSpec["colors"],
  power: number,
  toughness: number,
  extra: Partial<TokenSpec> = {},
): TokenSpec => ({ name, colors, types: ["Creature"], subtypes: [name], power, toughness, ...extra });

/** Nuisible : créature noire et verte 1/1 avec « chaque fois que ce jeton attaque, vous gagnez 1 point de vie ». */
export const PEST: TokenSpec = creature("Pest", ["B", "G"], 1, 1, {
  abilities: [triggered(when.attacksSelf, [fx.gainLife(1)], { label: "Gagnez 1 PV" })],
  text: "Whenever this token attacks, you gain 1 life.",
});
/** Inkling : créature blanche et noire 1/1 avec le vol. */
export const INKLING: TokenSpec = creature("Inkling", ["W", "B"], 1, 1, { keywords: ["flying"] });
/** Esprit : créature rouge et blanche 2/2. */
export const SPIRIT_RW: TokenSpec = creature("Spirit", ["R", "W"], 2, 2);
/** Fractale : créature verte et bleue 0/0 (elle reçoit des marqueurs +1/+1 en arrivant). */
export const FRACTAL: TokenSpec = creature("Fractal", ["G", "U"], 0, 0);
/** Élémental : créature bleue et rouge 3/3 avec le vol. */
export const ELEMENTAL_UR: TokenSpec = creature("Elemental", ["U", "R"], 3, 3, { keywords: ["flying"] });

/** Repartee : « chaque fois que vous lancez un sort d'éphémère ou de rituel qui cible une créature ». */
export const REPARTEE: TriggerSpec = when.castSpell("you", INSTANT_SORCERY, { objects: { types: ["Creature"] } });

/** Infusion : « si vous avez gagné des points de vie ce tour-ci ». */
export const INFUSION: Condition = cond.lifeGainedAtLeast(1);

/** Opus : « chaque fois que vous lancez un sort d'éphémère ou de rituel » ; `OPUS_BIG` : cinq mana ou plus dépensés. */
export const OPUS: TriggerSpec = when.castSpell("you", INSTANT_SORCERY);
export const OPUS_BIG: Condition = cond.amountAtLeast(amount.eventManaSpent, 5);

/**
 * Increment : « chaque fois que vous lancez un sort, si le mana dépensé pour le lancer est supérieur à la force ou à
 * l'endurance de cette créature, mettez un marqueur +1/+1 sur elle ».
 */
export const INCREMENT: TriggeredAbilityDef = triggered(when.castSpell("you"), [fx.addCounters(ref.self, 1)], {
  condition: cond.any(
    cond.amountAtLeast(amount.plus(amount.eventManaSpent, amount.neg(amount.powerOf(ref.self))), 1),
    cond.amountAtLeast(amount.plus(amount.eventManaSpent, amount.neg(amount.toughnessOf(ref.self))), 1),
  ),
  label: "Increment : un marqueur +1/+1",
});

/** Opus « …. Si cinq mana ou plus ont été dépensés pour lancer ce sort, … à la place » : l'un ou l'autre effet. */
export function opusInstead(normal: dsl.Effects, big: dsl.Effects): Effect[] {
  return [...fx.when(cond.not(OPUS_BIG), ...normal), ...fx.when(OPUS_BIG, ...big)];
}
