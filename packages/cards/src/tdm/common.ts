/**
 * Éléments de Tarkir: Dragonstorm (TDM) : jetons, filtres et aides des cycles (Devotees, Dragonstorms, Monuments,
 * terrains). Le DSL et les jetons communs viennent de lci/common.ts.
 */
import type { AbilityDef, dsl, ManaType, ObjectFilter, TargetSpec, TokenSpec } from "@mtgx/engine";
import { activated, cond, entersWith, fx, manaAbility, ref, target, triggered, when } from "../lci/common";

export * from "../lci/common";

const creature = (
  name: string,
  colors: TokenSpec["colors"],
  subtypes: string[],
  power: number,
  toughness: number,
  extra: Partial<TokenSpec> = {},
): TokenSpec => ({ name, colors, types: ["Creature"], subtypes, power, toughness, ...extra });

/** Moine : créature blanche 1/1 avec la prouesse. */
export const MONK: TokenSpec = creature("Monk", ["W"], ["Monk"], 1, 1, { keywords: ["prowess"] });
/** Guerrier : créature rouge 1/1 (mobilisation, Dalkovan Encampment). */
export const WARRIOR_R: TokenSpec = creature("Warrior", ["R"], ["Warrior"], 1, 1);
/** Esprit : créature blanche 1/1 sans capacité (endurance, Great Arashin City) ; X/X avec `createXXToken`. */
export const SPIRIT_W: TokenSpec = creature("Spirit", ["W"], ["Spirit"], 1, 1);
/** Soldat : créature blanche 2/2 (Teeming Dragonstorm, Signaling Roar). */
export const SOLDIER_2: TokenSpec = creature("Soldier", ["W"], ["Soldier"], 2, 2);
/** Zombie Druide : créature noire 2/2. */
export const ZOMBIE_DRUID: TokenSpec = creature("Zombie Druid", ["B"], ["Zombie", "Druid"], 2, 2);
/** Oiseau : créature blanche 1/1 avec le vol. */
export const BIRD_W: TokenSpec = creature("Bird", ["W"], ["Bird"], 1, 1, { keywords: ["flying"] });
/** Éléphant : créature verte 5/5. */
export const ELEPHANT_5: TokenSpec = creature("Elephant", ["G"], ["Elephant"], 5, 5);

/** Reliquary Dragon (Dragonbroods' Relic) : Dragon 4/4 de toutes les couleurs, vol, lien de vie, 3 blessures en arrivant. */
export const RELIQUARY_DRAGON: TokenSpec = creature("Reliquary Dragon", ["W", "U", "B", "R", "G"], ["Dragon"], 4, 4, {
  keywords: ["flying", "lifelink"],
  abilities: [
    triggered(when.entersSelf, [fx.damage(3, ref.target())], {
      targets: [target.any()],
      label: "3 blessures à n'importe quelle cible",
    }),
  ],
  text: "Flying, lifelink\nWhen this token enters, it deals 3 damage to any target.",
});

/** Dragons. */
export const DRAGON_CARD: ObjectFilter = { subtype: "Dragon" };
export const DRAGON_YOU: ObjectFilter = { subtype: "Dragon", controller: "you" };
/** « Une créature avec un marqueur » que vous contrôlez. */
export const CREATURE_WITH_COUNTER: ObjectFilter = { types: ["Creature"], controller: "you", withCounter: "any" };

/** Devotees : « {1} : ajoutez [l'une de ces couleurs]. N'activez qu'une fois par tour. » */
export function devotee(colors: ManaType[]): AbilityDef {
  return activated({
    mana: "{1}",
    oncePerTurn: true,
    effects: [fx.addManaChoice(1, colors)],
    label: `{1} : un mana ${colors.map((c) => `{${c}}`).join(", ")} (une fois par tour)`,
  });
}

/** Dragonstorms : « Quand un Dragon que vous contrôlez arrive, renvoyez cet enchantement dans la main de son propriétaire. » */
export const dragonstorm = (): AbilityDef =>
  triggered(when.enters({ subtype: "Dragon", controller: "you" }), [fx.bounce(ref.self)], {
    label: "Un Dragon arrive : renvoyez cet enchantement en main",
  });

/** Monuments : « Quand cet artefact arrive, cherchez une carte de [Plaine, Marais ou Forêt] de base ». */
export function monumentSearch(lands: string[]): AbilityDef {
  return triggered(when.entersSelf, [fx.search({ types: ["Land"], basic: true, anySubtype: lands })], {
    label: `Cherchez une carte de base (${lands.join(", ")})`,
  });
}

/** « Ce terrain arrive engagé à moins que vous ne contrôliez un(e) [type] ou un(e) [type]. » */
export function entersTappedUnless(lands: string[]): AbilityDef {
  return entersWith({
    tapped: true,
    condition: cond.not(cond.controls({ anySubtype: lands })),
    label: `Engagé, sauf si vous contrôlez : ${lands.join(" ou ")}`,
  });
}

/** Terrains tricolores : « Ce terrain arrive engagé. {T} : ajoutez [l'une de ces couleurs]. » */
export function triLand(colors: ManaType[]): AbilityDef[] {
  return [entersWith({ tapped: true, label: "Arrive engagé" }), manaAbility(colors)];
}

/** Rafale (Flurry) : « chaque fois que vous lancez votre deuxième sort de chaque tour, … ». */
export function flurry(effects: dsl.Effects, label: string, targets: TargetSpec[] = []): AbilityDef {
  return triggered(when.castNthSpell(2), effects, { targets, label: `Rafale — ${label}` });
}

/** Renouveau : « [coût], exilez cette carte de votre cimetière : … N'activez qu'en rituel. » */
export function renew(mana: string, targets: TargetSpec[], effects: dsl.Effects, label: string): AbilityDef {
  return activated({
    mana,
    fromGraveyard: true,
    exileSelf: true,
    sorcerySpeed: true,
    targets,
    effects,
    label: `Renouveau — ${label}`,
  });
}
