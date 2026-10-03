/**
 * Éléments propres à Bloomburrow (BLB) : jetons Loutre, Chauve-souris, Escargot, Écureuil, Mur, Épée…, aides
 * Vaillance, Dépense et Fourrager, filtres des familles d'animaux. Le DSL vient de Foundations (via dsk/common.ts).
 */
import type { AbilityDef, dsl, ObjectFilter, TokenSpec } from "@mtgx/engine";
import { activated, cond, fx, ref, staticAbility, target, triggered, when } from "../dsk/common";

type Effects = dsl.Effects;
type TriggerOpts = NonNullable<Parameters<typeof triggered>[2]>;

export * from "../dsk/common";

const creature = (
  name: string,
  colors: TokenSpec["colors"],
  subtypes: string[],
  power: number,
  toughness: number,
  extra: Partial<TokenSpec> = {},
): TokenSpec => ({ name, colors, types: ["Creature"], subtypes, power, toughness, ...extra });

/** Loutre : créature bleu et rouge 1/1 avec la prouesse. */
export const OTTER = creature("Otter", ["U", "R"], ["Otter"], 1, 1, { keywords: ["prowess"] });
export const BAT_1 = creature("Bat", ["B"], ["Bat"], 1, 1, { keywords: ["flying"] });
export const SNAIL = creature("Snail", ["B"], ["Snail"], 1, 1);
export const SQUIRREL = creature("Squirrel", ["G"], ["Squirrel"], 1, 1);
export const WALL = creature("Wall", ["W"], ["Wall"], 0, 4, { keywords: ["defender"] });
/** Rat de Vren : « ce jeton gagne +1/+1 pour chaque autre Rat que vous contrôlez ». */
export const VREN_RAT = creature("Rat", ["B"], ["Rat"], 1, 1, {
  abilities: [
    staticAbility(
      "self",
      { power: 1, toughness: 1 },
      { per: { types: ["Creature"], subtype: "Rat", controller: "you", other: true }, label: "+1/+1 par autre Rat" },
    ),
  ],
  text: "This token gets +1/+1 for each other Rat you control.",
});

const equip = (mana: string): AbilityDef =>
  activated({
    mana,
    sorcerySpeed: true,
    targets: [target.creature("t", { controller: "you" })],
    effects: [fx.attach(ref.target())],
    label: `Équiper ${mana}`,
  });

/** Épée (Blacksmith's Talent) : Équipement incolore, « +1/+1 », équiper {2}. */
export const SWORD: TokenSpec = {
  name: "Sword",
  colors: [],
  types: ["Artifact"],
  subtypes: ["Equipment"],
  abilities: [staticAbility("attached", { power: 1, toughness: 1 }, { label: "+1/+1" }), equip("{2}")],
  text: "Equipped creature gets +1/+1.\nEquip {2}",
};
/** Cragflame (Mabel) : Équipement légendaire, « +1/+1, vigilance, piétinement et célérité », équiper {2}. */
export const CRAGFLAME: TokenSpec = {
  name: "Cragflame",
  colors: [],
  types: ["Artifact"],
  subtypes: ["Equipment"],
  legendary: true,
  abilities: [
    staticAbility(
      "attached",
      { power: 1, toughness: 1, addKeywords: ["vigilance", "trample", "haste"] },
      { label: "+1/+1, vigilance, piétinement, célérité" },
    ),
    equip("{2}"),
  ],
  text: "Equipped creature gets +1/+1 and has vigilance, trample, and haste.\nEquip {2}",
};

/** Capacité de Nourriture : « {2}, {T}, sacrifiez ce permanent : vous gagnez 3 points de vie. » */
export const FOOD_ABILITY: AbilityDef = activated({
  mana: "{2}",
  tap: true,
  sacrifice: true,
  effects: [fx.gainLife(3)],
  label: "+3 PV",
});

export const otter = (n: Parameters<typeof fx.createTokens>[1] = 1) => fx.createTokens(OTTER, n);

/** Familles d'animaux (« Rabbits, Bats, Birds, and/or Mice you control »). */
export const kin = (subtypes: string[], extra: ObjectFilter = {}): ObjectFilter => ({
  types: ["Creature"],
  anySubtype: subtypes,
  controller: "you",
  ...extra,
});
export const FLYER_YOU: ObjectFilter = { types: ["Creature"], controller: "you", keyword: "flying" };
export const NONFLYER_YOU: ObjectFilter = { types: ["Creature"], controller: "you", not: { keyword: "flying" } };
export const TOKEN_YOU: ObjectFilter = { token: true, controller: "you" };

/** Vaillance : « chaque fois que cette créature devient la cible d'un sort ou d'une capacité que vous contrôlez pour la première fois chaque tour ». */
export const valiant = (effects: Effects, opts: TriggerOpts = {}) =>
  triggered(when.valiant, effects, { ...opts, oncePerTurn: true, label: `Vaillance — ${opts.label ?? ""}`.trim() });

/** Dépense N : « chaque fois que vous dépensez votre N-ième mana total pour lancer des sorts pendant un tour ». */
export const expend = (n: 4 | 8, effects: Effects, opts: TriggerOpts = {}) =>
  triggered(when.expend(n), effects, { ...opts, label: `Dépense ${n} — ${opts.label ?? ""}`.trim() });

/** « Vous avez gagné ou perdu des points de vie ce tour-ci. » */
export const GAINED_OR_LOST = cond.any(cond.lifeGainedAtLeast(1), cond.lostLife);

/** Seuil : « tant qu'il y a sept cartes ou plus dans votre cimetière ». */
export const THRESHOLD = cond.threshold;

/** « Quand ce permanent arrive et quand vous le sacrifiez, … » (Carrot Cake, Heaped Harvest). */
export const entersAndSacrificed = (effects: Effects, label: string): AbilityDef[] => [
  triggered(when.entersSelf, effects, { label }),
  triggered(when.sacrifice({ self: true }), effects, { label }),
];
