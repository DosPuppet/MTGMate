/**
 * Éléments partagés par les scripts du pseudo-ensemble Commander (EDH, PLAN-E) : le DSL et les jetons des autres
 * extensions (par Tarkir: Dragonstorm), plus ceux des decks Commander.
 */
import type { AbilityDef, ManaType, TokenSpec } from "@mtgx/engine";
import { activated, amount, cond, fx, manaAbility, ref, triggered, when } from "../tdm/common";

export * from "../tdm/common";

const creature = (
  name: string,
  colors: TokenSpec["colors"],
  subtypes: string[],
  power: number,
  toughness: number,
  extra: Partial<TokenSpec> = {},
): TokenSpec => ({ name, colors, types: ["Creature"], subtypes, power, toughness, ...extra });

/** Vampire noir 1/1 (Edgar Markov). */
export const VAMPIRE_BLACK: TokenSpec = creature("Vampire", ["B"], ["Vampire"], 1, 1);
/** Vampire noir 2/2 avec le vol (Bloodline Keeper). */
export const VAMPIRE_FLYING: TokenSpec = creature("Vampire", ["B"], ["Vampire"], 2, 2, { keywords: ["flying"] });
/** Vampire blanc et noir 1/1 avec le lien de vie (Edgar Markov's Coffin). */
export const VAMPIRE_WB_LIFELINK: TokenSpec = creature("Vampire", ["W", "B"], ["Vampire"], 1, 1, { keywords: ["lifelink"] });
/** Powerstone : artefact « {T} : ajoutez {C}. Ce mana ne peut pas servir à lancer un sort non-artefact ». */
export const POWERSTONE: TokenSpec = {
  name: "Powerstone",
  colors: [],
  types: ["Artifact"],
  subtypes: ["Powerstone"],
  abilities: [manaAbility("C", 1, { restriction: { spell: { types: ["Artifact"] }, abilityOfSource: {} } })],
  text: "{T}: Add {C}. This mana can't be spent to cast a nonartifact spell.",
};
/** Les cinq couleurs, pour « un mana de n'importe quelle couleur ». */
export const ANY_COLOR: ManaType[] = ["W", "U", "B", "R", "G"];

/**
 * Évolution (702.100) : « chaque fois qu'une créature arrive sous votre contrôle, si elle a une force ou une endurance plus
 * grande que celle-ci, mettez un marqueur +1/+1 sur celle-ci » (vérifiée au déclenchement et à la résolution).
 */
export const evolve = triggered(
  when.enters({ types: ["Creature"], controller: "you", other: true }),
  [fx.addCounters(ref.self, 1)],
  {
    condition: cond.any(
      cond.amountGreater(amount.powerOf(ref.eventObject), amount.powerOf(ref.self)),
      cond.amountGreater(amount.toughnessOf(ref.eventObject), amount.toughnessOf(ref.self)),
    ),
    label: "Évolution",
  },
);

/**
 * Ninjutsu (702.49) : « [coût], renvoyez en main un attaquant non bloqué que vous contrôlez : mettez cette carte sur le
 * champ de bataille depuis votre main, engagée et attaquante » ; elle attaque ce qu'attaquait la créature renvoyée (702.49c).
 */
export const ninjutsu = (cost: string): AbilityDef =>
  activated({
    mana: cost,
    fromHand: true,
    returnUnblockedAttacker: true,
    effects: [fx.toBattlefield(ref.self, { tapped: true, attacking: ref.cost("defender") })],
    label: `Ninjutsu ${cost}`,
  });
