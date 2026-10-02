/**
 * Éléments propres à Duskmourn: House of Horror (DSK) : jetons Lueur, Esprit, Jouet, Horreur, Diablotin…, aides
 * Survie et Sinistre, filtres courants. Le DSL vient de Foundations (via fin/common.ts).
 */
import type { CardScript, Condition, dsl, ObjectFilter, TokenSpec } from "@mtgx/engine";
import { BASIC_LAND_TYPES } from "@mtgx/engine";
import { cond, entersWith, fx, manaAbility, triggered, when } from "../fin/common";

type Effects = dsl.Effects;

export * from "../fin/common";

const creature = (
  name: string,
  colors: TokenSpec["colors"],
  subtypes: string[],
  power: number,
  toughness: number,
  extra: Partial<TokenSpec> = {},
): TokenSpec => ({ name, colors, types: ["Creature"], subtypes, power, toughness, ...extra });

/** Lueur : créature-enchantement blanche 1/1. */
export const GLIMMER: TokenSpec = creature("Glimmer", ["W"], ["Glimmer"], 1, 1, { types: ["Enchantment", "Creature"] });
export const SPIRIT_3_1 = creature("Spirit", ["W"], ["Spirit"], 3, 1, { keywords: ["flying"] });
export const INSECT_2_1 = creature("Insect", ["W"], ["Insect"], 2, 1, { keywords: ["flying"] });
export const TOY: TokenSpec = creature("Toy", ["W"], ["Toy"], 1, 1, { types: ["Artifact", "Creature"] });
export const HORROR_ENCHANTMENT: TokenSpec = creature("Horror", ["B"], ["Horror"], 2, 2, { types: ["Enchantment", "Creature"] });
export const DEMON_6: TokenSpec = creature("Demon", ["B"], ["Demon"], 6, 6, { keywords: ["flying"] });
export const GREMLIN = creature("Gremlin", ["R"], ["Gremlin"], 1, 1);
export const SPIDER = creature("Spider", ["G"], ["Spider"], 2, 2, { keywords: ["reach"] });
/** Esprit bleu X/X volant (F/E fixées à la création). */
export const SPIRIT_BLUE = creature("Spirit", ["U"], ["Spirit"], 0, 0, { keywords: ["flying"] });
/** Everywhere : terrain incolore de tous les types de terrains de base. */
export const EVERYWHERE: TokenSpec = {
  name: "Everywhere",
  colors: [],
  types: ["Land"],
  subtypes: [...BASIC_LAND_TYPES],
  abilities: [manaAbility(["W", "U", "B", "R", "G"])],
  text: "({T}: Add {W}, {U}, {B}, {R}, or {G}.)",
};

export const glimmer = (n = 1) => fx.createTokens(GLIMMER, n);

export const GLIMMER_CREATURE: ObjectFilter = { types: ["Creature"], subtype: "Glimmer" };
export const CREATURE_OR_ENCHANTMENT: ObjectFilter = { types: ["Creature", "Enchantment"] };
export const ROOM: ObjectFilter = { subtype: "Room" };

const TAPPED: Condition = cond.sourceMatches({ tapped: true });

/** Survie : « Au début de votre seconde phase principale, si cette créature est engagée, … ». */
export const survival = (
  effects: Effects,
  opts: Omit<NonNullable<Parameters<typeof triggered>[2]>, "condition"> & { condition?: Condition } = {},
) =>
  triggered(when.secondMain, effects, {
    ...opts,
    condition: opts.condition ? cond.all(TAPPED, opts.condition) : TAPPED,
    label: `Survie — ${opts.label ?? ""}`.trim(),
  });

/** Sinistre : « Chaque fois qu'un enchantement que vous contrôlez arrive et chaque fois que vous déverrouillez entièrement une Salle, … ». */
export const eerie = (effects: Effects, opts: NonNullable<Parameters<typeof triggered>[2]> = {}) =>
  triggered(when.eerie, effects, { ...opts, label: `Sinistre — ${opts.label ?? ""}`.trim() });

/** « Ce terrain arrive engagé à moins qu'un joueur n'ait 13 points de vie ou moins. » */
const NO_PLAYER_AT_13: Condition = cond.all(cond.lifeAtLeast(14), cond.not(cond.opponentLifeAtMost(13)));
export const fastLand = (a: "W" | "U" | "B" | "R" | "G", b: "W" | "U" | "B" | "R" | "G"): CardScript => ({
  abilities: [
    entersWith({ tapped: true, condition: NO_PLAYER_AT_13, label: "Engagé sauf si un joueur a 13 PV ou moins" }),
    manaAbility([a, b]),
  ],
});
