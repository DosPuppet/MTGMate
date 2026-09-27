/**
 * Éléments propres à Final Fantasy (FIN) : jetons Héros, Chevalier, Chocobo, Sorcier, Mog, Horreur, Robot Guerrier,
 * Grenouille ; filtre « Ville ». Le DSL vient de Foundations (fdn/common.ts).
 */
import { type CardScript, dsl, type Keyword, type ObjectFilter, type TokenSpec } from "@mtgx/engine";

export * from "../otj/common";

const { fx, ref, staticAbility, triggered, when } = dsl;

const creature = (
  name: string,
  colors: TokenSpec["colors"],
  subtypes: string[],
  power: number,
  toughness: number,
  extra: Partial<TokenSpec> = {},
): TokenSpec => ({ name, colors, types: ["Creature"], subtypes, power, toughness, ...extra });

export const HERO = creature("Hero", [], ["Hero"], 1, 1);
export const KNIGHT_2 = creature("Knight", ["W"], ["Knight"], 2, 2);
export const MOOGLE = creature("Moogle", ["W"], ["Moogle"], 1, 2, { keywords: ["lifelink"] });
export const HORROR = creature("Horror", ["B"], ["Horror"], 2, 2);
export const FROG = creature("Frog", ["G"], ["Frog"], 1, 1);
export const ROBOT_WARRIOR: TokenSpec = {
  name: "Robot Warrior",
  colors: ["U"],
  types: ["Artifact", "Creature"],
  subtypes: ["Robot", "Warrior"],
  power: 3,
  toughness: 3,
};
/** Chocobo : Oiseau vert 2/2, « chaque fois qu'un terrain arrive sous votre contrôle, +1/+0 ». */
export const CHOCOBO = creature("Bird", ["G"], ["Bird"], 2, 2, {
  abilities: [triggered(when.landfall, [fx.pump(ref.self, 1, 0)], { label: "Landfall : +1/+0" })],
  text: "Whenever a land you control enters, this token gets +1/+0 until end of turn.",
});
/** Sorcier : créature noire 0/1, « chaque fois que vous lancez un sort non-créature, 1 blessure à chaque adversaire ». */
export const WIZARD_0_1 = creature("Wizard", ["B"], ["Wizard"], 0, 1, {
  abilities: [
    triggered(when.castSpell("you", { notTypes: ["Creature"] }), [fx.damage(1, ref.eachOpponent)], {
      label: "1 blessure à chaque adversaire",
    }),
  ],
  text: "Whenever you cast a noncreature spell, this token deals 1 damage to each opponent.",
});

export const TOWN: ObjectFilter = { subtype: "Town" };
export const EQUIPMENT_YOU: ObjectFilter = { subtype: "Equipment", controller: "you" };

export const hero = (n: Parameters<typeof fx.createTokens>[1] = 1) => fx.createTokens(HERO, n);
export const chocobo = (n: Parameters<typeof fx.createTokens>[1] = 1) => fx.createTokens(CHOCOBO, n);
export const wizard = () => fx.createTokens(WIZARD_0_1);

/** Équipement de job : « la créature équipée gagne +F/+E, [mots-clés] et est un [type] en plus de ses autres types ». */
export const jobGear = (subtype: string, power: number, toughness: number, keywords: Keyword[] = []): CardScript["abilities"] => [
  staticAbility(
    "attached",
    { power, toughness, addSubtypes: [subtype], addKeywords: keywords },
    { label: `+${power}/+${toughness}, ${subtype}` },
  ),
];
