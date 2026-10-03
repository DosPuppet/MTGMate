/**
 * Wilds of Eldraine — cartes vertes. Les Aventures ont une entrée par face (la créature ou l'enchantement sous son nom,
 * le sort d'Aventure sous le sien) ; le Marchandage est lu dans le texte (`cond.kicked`).
 */
import type { Effect, ModeDef, ObjectFilter } from "@mtgx/engine";
import {
  ART_ENCH_OR_FLYER,
  activated,
  amount,
  BASIC_LAND,
  BEAST_3,
  block,
  blockAbility,
  type CardScript,
  CREATURE_YOU_CONTROL,
  chapter,
  cond,
  createRole,
  eventReplacement,
  FOOD,
  fx,
  HUMAN_W,
  MONSTER_ROLE,
  manaAbility,
  mode,
  playerStatic,
  ROYAL_ROLE,
  ref,
  spell,
  staticAbility,
  target,
  targetObj,
  triggered,
  when,
} from "./common";

const FOOD_YOU: ObjectFilter = { types: ["Artifact"], subtype: "Food", controller: "you" };
/** « Quand cette créature arrive, créez un jeton Nourriture. » */
const ENTERS_FOOD = triggered(when.entersSelf, [fx.createTokens(FOOD)], { label: "Un jeton Nourriture" });
/** « Chaque fois que vous lancez un sort de valeur de mana 5 ou plus » */
const CAST_MV5 = when.castSpell("you", { minManaValue: 5 });

/** « Choisissez deux — » : chaque paire de modes devient un mode (identifiants de cibles distincts d'un mode à l'autre). */
function chooseTwo(...modes: ModeDef[]): { modes: ModeDef[] } {
  const out: ModeDef[] = [];
  modes.forEach((a, i) => {
    for (const b of modes.slice(i + 1)) {
      out.push({
        label: `${a.label} + ${b.label}`,
        targets: [...a.targets, ...b.targets],
        effects: [...a.effects, ...b.effects],
      });
    }
  });
  return { modes: out };
}

/**
 * Curse of the Werefox : « créez un jeton Rôle Monstre attaché à la créature ciblée que vous contrôlez. Quand vous le
 * faites, cette créature se bat contre jusqu'à une créature ciblée que vous ne contrôlez pas » (capacité réflexive, qui
 * n'existe que si le Rôle a été créé).
 */
const WEREFOX_CURSE: Effect[] = [
  ...createRole(MONSTER_ROLE).flat(),
  ...fx.when(
    cond.refMatches(ref.target(), { types: ["Creature"] }),
    fx.reflexive(
      [target.upTo(1, { ...target.creature("f", { controller: "opponent" }), label: "créature que vous ne contrôlez pas" })],
      [fx.fight(ref.target("c"), ref.target("f"))],
      { c: ref.target() },
    ),
  ),
];

/**
 * Feral Encounter : « au début de la prochaine phase de combat de ce tour, la créature ciblée que vous contrôlez inflige
 * des blessures égales à sa force à jusqu'à une créature ciblée que vous ne contrôlez pas » — un emblème de ce tour,
 * dont la capacité ne se déclenche qu'une fois (cibles choisies quand elle se déclenche).
 */
const FERAL_ENCOUNTER_COMBAT: Effect = fx.emblem(
  "Feral Encounter",
  "Au début de la prochaine phase de combat de ce tour, une créature ciblée que vous contrôlez inflige des blessures égales à sa force à jusqu'à une créature ciblée que vous ne contrôlez pas.",
  [
    triggered(when.yourCombat, [fx.damage(amount.powerOf(ref.target("a")), ref.target("b"), ref.target("a"))], {
      targets: [
        target.creature("a", { controller: "you" }),
        target.upTo(1, { ...target.creature("b", { controller: "opponent" }), label: "créature que vous ne contrôlez pas" }),
      ],
      oncePerTurn: true,
      label: "Votre créature inflige des blessures égales à sa force",
    }),
  ],
  false,
  true,
);

export const GREEN: Record<string, CardScript> = {
  // Marchandage et piétinement lus dans le texte.
  "Hamlet Glutton": {
    costReduction: { generic: 2, condition: cond.kicked },
    abilities: [triggered(when.entersSelf, [fx.gainLife(3)], { label: "Vous gagnez 3 points de vie" })],
  },
  "Graceful Takedown": {
    spell: spell(
      [
        target.upTo(99, {
          ...target.creature("e", { controller: "you", enchanted: true }),
          label: "créature enchantée que vous contrôlez",
        }),
        {
          ...target.upTo(1, { ...target.creature("o", { controller: "you" }), label: "autre créature que vous contrôlez" }),
          otherThan: ["e"],
        },
        { ...target.creature("t", { controller: "opponent" }), label: "créature que vous ne contrôlez pas" },
      ],
      [fx.eachOfDealsDamage(ref.target("e"), ref.target("t")), fx.eachOfDealsDamage(ref.target("o"), ref.target("t"))],
    ),
  },
  "Agatha's Champion": {
    abilities: [
      triggered(when.entersSelf, [fx.fight(ref.self, ref.target())], {
        targets: [
          target.upTo(1, { ...target.creature("t", { controller: "opponent" }), label: "créature que vous ne contrôlez pas" }),
        ],
        condition: cond.kicked,
        label: "Marchandée : se bat contre une créature",
      }),
    ],
  },

  // --- Beanstalk Wurm // Plant Beans ------------------------------------------
  "Beanstalk Wurm": {},
  "Plant Beans": { spell: spell([], [fx.extraLandThisTurn]) },

  "Bestial Bloodline": {
    enchant: { filter: { types: ["Creature"] }, label: "créature" },
    abilities: [
      staticAbility("attached", { power: 2, toughness: 2 }, { label: "+2/+2" }),
      activated({
        mana: "{4}{G}",
        fromGraveyard: true,
        effects: [fx.toHand(ref.self)],
        label: "Revient du cimetière dans la main",
      }),
    ],
  },
  "Blossoming Tortoise": {
    abilities: [
      ...[when.entersSelf, when.attacksSelf].map((trigger) =>
        triggered(
          trigger,
          [
            fx.mill(3),
            fx.pickFromZone(
              "graveyard",
              { types: ["Land"] },
              { to: "battlefield", tapped: true },
              { count: 1, prompt: "Une carte de terrain de votre cimetière revient engagée" },
            ),
          ],
          { label: "Meulez trois cartes, puis un terrain de votre cimetière revient engagé" },
        ),
      ),
      playerStatic({
        abilityCost: { source: { types: ["Land"] }, reduce: 1 },
        label: "Les capacités activées de vos terrains coûtent {1} de moins",
      }),
      // « créatures-terrains » : créature qui a aussi le type terrain.
      staticAbility(
        { types: ["Creature"], controller: "you", not: { notTypes: ["Land"] } },
        { power: 1, toughness: 1 },
        { label: "Vos créatures-terrains gagnent +1/+1" },
      ),
    ],
  },
  "Brave the Wilds": {
    // Approximation : la cible (« si ce sort a été marchandé, un terrain ciblé ») est facultative, et proposée même
    // sans marchandage (elle n'est alors pas affectée).
    spell: spell(
      [target.optional(target.permanent("t", ["Land"], { controller: "you" }, "terrain que vous contrôlez"))],
      [
        ...fx.when(
          cond.kicked,
          fx.modify(
            ref.target(),
            { addTypes: ["Creature"], addSubtypes: ["Elemental"], setPower: 3, setToughness: 3, addKeywords: ["haste"] },
            "permanent",
          ),
        ),
        fx.search(BASIC_LAND),
      ],
    ),
  },
  "Commune with Nature": {
    spell: spell([], [fx.lookAtTop(5, { filter: { types: ["Creature"] }, count: 1, to: { to: "hand" }, rest: "bottom" })]),
  },
  "Curse of the Werefox": { spell: spell([target.creature("t", { controller: "you" })], WEREFOX_CURSE) },
  "Elvish Archivist": {
    abilities: [
      triggered(when.enters({ types: ["Artifact"], controller: "you" }), [fx.addCounters(ref.self, 2)], {
        batched: true,
        oncePerTurn: true,
        label: "Deux marqueurs +1/+1 (une fois par tour)",
      }),
      triggered(when.enters({ types: ["Enchantment"], controller: "you" }), [fx.draw(1)], {
        batched: true,
        oncePerTurn: true,
        label: "Piochez une carte (une fois par tour)",
      }),
    ],
  },
  "Feral Encounter": {
    spell: spell(
      [],
      [
        fx.lookAtTop(5, { filter: { types: ["Creature"] }, count: 1, to: { to: "exile" }, rest: "bottom", store: "e" }),
        fx.grantPlay(ref.stored("e")),
        FERAL_ENCOUNTER_COMBAT,
      ],
    ),
  },

  // --- Ferocious Werefox // Guard Change --------------------------------------
  "Ferocious Werefox": {},
  "Guard Change": { spell: spell([target.creature("t", { controller: "you" })], createRole(MONSTER_ROLE)) },

  "Gruff Triplets": {
    abilities: [
      triggered(when.entersSelf, [fx.copyToken(ref.self, { count: 2 })], {
        condition: cond.sourceMatches({ token: false }),
        label: "Deux jetons copies d'elle",
      }),
      triggered(
        when.diesSelf,
        [fx.addCountersAll({ types: ["Creature"], controller: "you", name: "Gruff Triplets" }, amount.lkiPower)],
        { label: "Autant de marqueurs +1/+1 que sa force sur chacune de vos Gruff Triplets" },
      ),
    ],
  },

  // --- Hollow Scavenger // Bakery Raid ----------------------------------------
  "Hollow Scavenger": {
    abilities: [
      activated({
        mana: "{1}",
        sacrificeOther: { filter: { types: ["Artifact"], subtype: "Food" } },
        oncePerTurn: true,
        effects: [fx.pump(ref.self, 2, 2)],
        label: "+2/+2 jusqu'à la fin du tour",
      }),
    ],
  },
  "Bakery Raid": { spell: spell([], [fx.createTokens(FOOD)]) },

  "Howling Galefang": {
    abilities: [
      staticAbility(
        "self",
        { addKeywords: ["haste"] },
        {
          condition: cond.amountAtLeast(amount.countExiled({ adventure: true }), 1),
          label: "Célérité tant que vous possédez une carte avec une Aventure en exil",
        },
      ),
    ],
  },
  "The Huntsman's Redemption": {
    abilities: [
      chapter([1], [fx.createTokens(BEAST_3)], { label: "Un jeton Bête 3/3" }),
      chapter(
        [2],
        [
          fx.sacrifice(ref.you, { types: ["Creature"] }, 1, { optional: true, store: "s" }),
          ...fx.when(cond.v("s"), fx.search({ anyOf: [{ types: ["Creature"] }, BASIC_LAND] })),
        ],
        { label: "Sacrifiez une créature : cherchez une créature ou un terrain de base" },
      ),
      chapter([3], [fx.pump(ref.target(), 2, 2, ["trample"])], {
        targets: [target.upTo(2, target.creature())],
        label: "Jusqu'à deux créatures : +2/+2 et le piétinement",
      }),
    ],
  },
  "Leaping Ambush": {
    spell: spell([target.creature()], [fx.pump(ref.target(), 1, 3, ["reach"]), fx.untap(ref.target())]),
  },
  "Night of the Sweets' Revenge": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(FOOD)], { label: "Un jeton Nourriture" }),
      staticAbility(FOOD_YOU, { addAbilities: [manaAbility("G")] }, { label: "Vos Nourritures ont « {T} : ajoutez {G} »" }),
      activated({
        mana: "{5}{G}{G}",
        sacrifice: true,
        sorcerySpeed: true,
        effects: [fx.pumpAll(CREATURE_YOU_CONTROL, amount.count(FOOD_YOU), amount.count(FOOD_YOU))],
        label: "Vos créatures gagnent +X/+X (X : vos Nourritures)",
      }),
    ],
  },
  "Redtooth Genealogist": {
    abilities: [
      triggered(when.entersSelf, createRole(ROYAL_ROLE), {
        targets: [{ ...target.creature("t", { controller: "you", other: true }), label: "autre créature que vous contrôlez" }],
        label: "Un Rôle Royal attaché à une autre de vos créatures",
      }),
    ],
  },
  "Redtooth Vanguard": {
    abilities: [
      triggered(
        when.enters({ types: ["Enchantment"], controller: "you" }),
        fx.mayPay("{2}", "Payer {2} pour renvoyer Redtooth Vanguard dans votre main ?", fx.toHand(ref.self)),
        { fromGraveyard: true, label: "Payez {2} : revient du cimetière dans la main" },
      ),
    ],
  },
  "Return from the Wilds": {
    spell: chooseTwo(
      mode("Un terrain de base, engagé", [], [fx.search(BASIC_LAND, { to: "battlefield", tapped: true })]),
      mode("Un Humain 1/1", [], [fx.createTokens(HUMAN_W)]),
      mode("Une Nourriture", [], [fx.createTokens(FOOD)]),
    ),
  },
  "Rootrider Faun": {
    abilities: [
      manaAbility("G"),
      activated({ mana: "{1}", tap: true, effects: [fx.addManaChoice(1)], label: "Un mana de n'importe quelle couleur" }),
    ],
  },
  "Royal Treatment": {
    spell: spell(
      [target.creature("t", { controller: "you" })],
      [fx.modify(ref.target(), { addKeywords: ["hexproof"] }), ...createRole(ROYAL_ROLE)],
    ),
  },
  "Skybeast Tracker": {
    abilities: [triggered(CAST_MV5, [fx.createTokens(FOOD)], { label: "Un jeton Nourriture" })],
  },
  "Spider Food": {
    spell: spell(
      [target.optional(targetObj("t", ART_ENCH_OR_FLYER, "artefact, enchantement ou créature avec le vol"))],
      [fx.destroy(ref.target()), fx.createTokens(FOOD)],
    ),
  },

  // --- Stormkeld Vanguard // Bear Down ----------------------------------------
  "Stormkeld Vanguard": { abilities: [blockAbility(block.notByPowerLE2)] },
  "Bear Down": {
    spell: spell(
      [target.permanent("t", ["Artifact", "Enchantment"], {}, "artefact ou enchantement")],
      [fx.destroy(ref.target())],
    ),
  },

  "Tanglespan Lookout": {
    abilities: [triggered(when.enters({ subtype: "Aura", controller: "you" }), [fx.draw(1)], { label: "Piochez une carte" })],
  },
  "Territorial Witchstalker": {
    abilities: [
      triggered(when.yourCombat, [fx.pump(ref.self, 1, 0, ["attacksDespiteDefender"])], {
        condition: cond.ferocious,
        label: "+1/+0 et peut attaquer malgré le défenseur",
      }),
    ],
  },
  "Thunderous Debut": {
    spell: spell(
      [],
      [
        ...fx.when(
          cond.kicked,
          fx.lookAtTop(20, { filter: { types: ["Creature"] }, count: 2, to: { to: "battlefield" }, rest: "top" }),
        ),
        ...fx.when(
          cond.not(cond.kicked),
          fx.lookAtTop(20, { filter: { types: ["Creature"] }, count: 2, to: { to: "hand" }, rest: "top" }),
        ),
        fx.shuffle(),
      ],
    ),
  },
  "Titanic Growth": { spell: spell([target.creature()], [fx.pump(ref.target(), 4, 4)]) },
  "Toadstool Admirer": {
    abilities: [activated({ mana: "{3}{G}", effects: [fx.addCounters(ref.self, 1)], label: "Un marqueur +1/+1" })],
  },
  "Tough Cookie": {
    abilities: [
      ENTERS_FOOD,
      activated({
        mana: "{2}{G}",
        targets: [
          targetObj(
            "t",
            { types: ["Artifact"], notTypes: ["Creature"], controller: "you" },
            "artefact non-créature que vous contrôlez",
          ),
        ],
        effects: [fx.modify(ref.target(), { addTypes: ["Artifact", "Creature"], setPower: 4, setToughness: 4 })],
        label: "Un artefact non-créature devient une créature-artefact 4/4",
      }),
      activated({ mana: "{2}", tap: true, sacrifice: true, effects: [fx.gainLife(3)], label: "+3 PV" }),
    ],
  },
  "Troublemaker Ouphe": {
    abilities: [
      triggered(when.entersSelf, [fx.exile(ref.target())], {
        targets: [
          target.permanent("t", ["Artifact", "Enchantment"], { controller: "opponent" }, "artefact ou enchantement adverse"),
        ],
        condition: cond.kicked,
        label: "Marchandée : exilez un artefact ou un enchantement adverse",
      }),
    ],
  },
  "Up the Beanstalk": {
    abilities: [
      triggered(when.entersSelf, [fx.draw(1)], { label: "Piochez une carte" }),
      triggered(CAST_MV5, [fx.draw(1)], { label: "Sort de VM 5 ou plus : piochez une carte" }),
    ],
  },
  "Verdant Outrider": {
    abilities: [
      activated({
        mana: "{1}{G}",
        effects: [fx.modify(ref.self, { addBlockRules: [block.notByPowerLE2] })],
        label: "Imblocable par les créatures de force 2 ou moins ce tour-ci",
      }),
    ],
  },

  // --- Virtue of Strength // Garenbrig Growth ---------------------------------
  "Virtue of Strength": {
    abilities: [
      // Approximation : « trois fois plus » est écrit « deux de plus » (un terrain de base produit un seul mana), car les
      // remplacements de mana n'appliquent que `add` ; l'ordre avec un autre remplacement de mana peut donc différer.
      eventReplacement({
        event: "mana",
        source: { types: ["Land"], basic: true },
        to: "you",
        modify: { add: 2 },
        label: "Vos terrains de base engagés pour du mana en produisent trois fois plus",
      }),
    ],
  },
  "Garenbrig Growth": {
    spell: spell(
      [
        target.cardInGraveyard(
          "t",
          { anyOf: [{ types: ["Creature"] }, { types: ["Land"] }] },
          "you",
          "carte de créature ou de terrain de votre cimetière",
        ),
      ],
      [fx.toHand(ref.target())],
    ),
  },

  "Welcome to Sweettooth": {
    abilities: [
      chapter([1], [fx.createTokens(HUMAN_W)], { label: "Un jeton Humain 1/1" }),
      chapter([2], [fx.createTokens(FOOD)], { label: "Un jeton Nourriture" }),
      chapter([3], [fx.addCounters(ref.target(), amount.plus(1, amount.count(FOOD_YOU)))], {
        targets: [target.creature("t", { controller: "you" })],
        label: "Un marqueur +1/+1, plus un par Nourriture que vous contrôlez",
      }),
    ],
  },

  // --- Gingerbread Hunter // Puny Snack ---------------------------------------
  "Gingerbread Hunter": { abilities: [ENTERS_FOOD] },
  "Puny Snack": { spell: spell([target.creature()], [fx.pump(ref.target(), -2, -2)]) },

  // --- Questing Druid // Seek the Beast ---------------------------------------
  "Questing Druid": {
    abilities: [
      triggered(when.castSpell("you", { colors: ["W", "U", "B", "R"] }), [fx.addCounters(ref.self, 1)], {
        label: "Sort blanc, bleu, noir ou rouge : un marqueur +1/+1",
      }),
    ],
  },
  "Seek the Beast": {
    spell: spell([], [fx.exileTop(ref.you, 2, "e"), fx.grantPlay(ref.stored("e"), { untilYourNextEndStep: true })]),
  },

  // --- Tempest Hart // Scan the Clouds ----------------------------------------
  "Tempest Hart": {
    abilities: [triggered(CAST_MV5, [fx.addCounters(ref.self, 1)], { label: "Sort de VM 5 ou plus : un marqueur +1/+1" })],
  },
  "Scan the Clouds": { spell: spell([], [fx.draw(2), fx.discard(2)]) },

  // --- Intrepid Trufflesnout // Go Hog Wild -----------------------------------
  "Intrepid Trufflesnout": {
    abilities: [
      triggered({ on: "attacks", who: "self", alone: true }, [fx.createTokens(FOOD)], {
        label: "Attaque seule : un jeton Nourriture",
      }),
    ],
  },
  "Go Hog Wild": { spell: spell([target.creature()], [fx.pump(ref.target(), 2, 2)]) },

  "Provisions Merchant": {
    abilities: [
      ENTERS_FOOD,
      triggered(
        when.attacksSelf,
        [
          fx.sacrifice(ref.you, FOOD_YOU, 1, { optional: true, store: "f" }),
          ...fx.when(cond.v("f"), fx.pumpAll({ types: ["Creature"], attacking: true }, 1, 1, ["trample"])),
        ],
        { label: "Sacrifiez une Nourriture : les attaquants gagnent +1/+1 et le piétinement" },
      ),
    ],
  },
  "Wildwood Mentor": {
    abilities: [
      triggered(when.enters({ token: true, controller: "you" }), [fx.addCounters(ref.self, 1)], {
        label: "Un jeton arrive : un marqueur +1/+1",
      }),
      triggered(when.attacksSelf, [fx.pump(ref.target(), amount.powerOf(ref.self), amount.powerOf(ref.self))], {
        targets: [{ ...target.creature("t", { attacking: true, other: true }), label: "autre créature attaquante" }],
        label: "Une autre attaquante gagne +X/+X (X : sa force)",
      }),
    ],
  },
};
