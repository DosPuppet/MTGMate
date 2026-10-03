/** Lorwyn Eclipsed — cartes vertes. */
import type { Condition, Effect, ObjectFilter, TargetSpec } from "@mtgx/engine";
import {
  activated,
  amount,
  BASIC_LAND,
  beholdOrPay,
  block,
  blockAbility,
  type CardScript,
  CREATURE_YOU_CONTROL,
  champion,
  cond,
  ELF_BG,
  entersWith,
  eventReplacement,
  fx,
  MUTAVAULT,
  manaAbility,
  modal,
  mode,
  playerStatic,
  ref,
  spell,
  staticAbility,
  TREEFOLK_REACH,
  target,
  targetObj,
  triggered,
  when,
} from "./common";

/** Éclatant (Vivid) : le nombre de couleurs parmi les permanents que vous contrôlez. */
const VIVID = amount.colorsAmong();
const ELF_CARD: ObjectFilter = { subtype: "Elf" };
/** « s'il y a une carte d'Elfe dans votre cimetière » */
const ELF_IN_GRAVEYARD: Condition = cond.amountAtLeast(amount.countIn("graveyard", ELF_CARD), 1);
const ANOTHER_CREATURE_YOU_CONTROL: ObjectFilter = { ...CREATURE_YOU_CONTROL, other: true };
const ELF_YOU_CONTROL: ObjectFilter = { ...CREATURE_YOU_CONTROL, subtype: "Elf" };

/** Créatures arrivées sous votre contrôle ce tour-ci (journal du tour, jetons et créatures parties depuis compris). */
const CREATURES_ENTERED = amount.turnEvents({ event: "zone", to: "battlefield", types: ["Creature"], who: "you" });
/** « si une créature est arrivée sur le champ de bataille sous votre contrôle ce tour-ci » */
const CREATURE_ENTERED: Condition = cond.amountAtLeast(CREATURES_ENTERED, 1);
/** « tant qu'une autre créature est arrivée sur le champ de bataille sous votre contrôle ce tour-ci » */
const ANOTHER_CREATURE_ENTERED: Condition = cond.any(
  cond.amountAtLeast(CREATURES_ENTERED, 2),
  cond.all(cond.not(cond.sourceMatches({ enteredThisTurn: true })), cond.amountAtLeast(CREATURES_ENTERED, 1)),
);

/** « un autre permanent ciblé » */
const ANOTHER_PERMANENT: TargetSpec = targetObj("t", { other: true }, "autre permanent");

/** Aurora Awakener : « révélez des cartes jusqu'à révéler X cartes de permanent » (toutes vont sur le champ de bataille). */
const AURORA_REVEAL: Effect[] = [fx.revealUntilN({ permanent: true }, VIVID, { to: "battlefield" })];

/** Trystan, Callous Cultivator : « meulez trois cartes ; puis s'il y a une carte d'Elfe dans votre cimetière, 2 PV ». */
const TRYSTAN_CULTIVATOR: Effect[] = [fx.mill(3), ...fx.when(ELF_IN_GRAVEYARD, fx.gainLife(2))];
/** Trystan, Penitent Culler : « meulez trois cartes, puis vous pouvez exiler une carte d'Elfe de votre cimetière ; … ». */
const TRYSTAN_CULLER: Effect[] = [
  fx.mill(3),
  fx.pickFromZone(
    "graveyard",
    ELF_CARD,
    { to: "exile" },
    { count: 1, min: 0, store: "x", prompt: "Vous pouvez exiler une carte d'Elfe de votre cimetière" },
  ),
  ...fx.when(cond.v("x"), fx.loseLife(2, ref.eachOpponent)),
];

/** Spry and Mighty : X est la différence entre les forces des deux créatures choisies. */
const SPRY_X = amount.max(
  amount.plus(amount.powerOf(ref.stored("a")), amount.neg(amount.powerOf(ref.stored("b")))),
  amount.plus(amount.powerOf(ref.stored("b")), amount.neg(amount.powerOf(ref.stored("a")))),
);

export const GREEN: Record<string, CardScript> = {
  "Shimmerwilds Growth": {
    enchant: { filter: { types: ["Land"] }, label: "terrain" },
    chooseOnEnter: "color",
    abilities: [
      staticAbility("attached", { setColorsChosen: true }, { label: "Le terrain enchanté est de la couleur choisie" }),
      eventReplacement({
        event: "mana",
        source: { attachedToSource: true },
        extraMana: "chosen",
        modify: { add: 1 },
        label: "Le terrain enchanté engagé pour du mana : un mana de plus de la couleur choisie",
      }),
    ],
  },
  "Celestial Reunion": {
    // Le coût additionnel facultatif (choisir un type, contempler deux créatures de ce type) est vérifié à la résolution,
    // pour un type de la carte trouvée (approximation : le joueur paie toujours ce coût quand il le peut).
    spell: spell(
      [],
      [
        fx.search({ types: ["Creature"], maxManaValueX: true }, { to: "hand" }, 1, undefined, "f"),
        ...fx.when(cond.beholdSharingType(ref.stored("f"), 2), fx.moveTo(ref.stored("f"), { to: "battlefield" })),
      ],
    ),
  },
  // Flash et convocation lus dans le texte.
  "Selfless Safewright": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.chooseForSelf("creatureType"),
          fx.modifyAll(
            { permanent: true, controller: "you", other: true, subtypeChosen: true },
            { addKeywords: ["hexproof", "indestructible"] },
          ),
        ],
        { label: "Choisissez un type : vos autres permanents de ce type gagnent la défense talismanique et l'indestructible" },
      ),
    ],
  },
  "Champions of the Perfect": champion("Elf", [
    triggered(when.castSpell("you", { types: ["Creature"] }), [fx.draw(1)], { label: "Piochez une carte" }),
  ]),
  "Assert Perfection": {
    spell: spell(
      [target.creature("a", { controller: "you" }), target.upTo(1, target.creature("b", { controller: "opponent" }))],
      [fx.pump(ref.target("a"), 1, 0), fx.damage(amount.powerOf(ref.target("a")), ref.target("b"), ref.target("a"))],
    ),
  },
  "Aurora Awakener": {
    abilities: [
      triggered(when.entersSelf, AURORA_REVEAL, {
        label: "Éclatant — révélez jusqu'à X cartes de permanent et mettez-les sur le champ de bataille",
      }),
    ],
  },
  "Bloom Tender": {
    abilities: [
      activated({
        tap: true,
        effects: [fx.addManaColorsAmong({ permanent: true, controller: "you" })],
        label: "Éclatant — un mana de chaque couleur parmi vos permanents",
      }),
    ],
  },
  "Blossoming Defense": {
    spell: spell([target.creature("t", { controller: "you" })], [fx.pump(ref.target(), 2, 2, ["hexproof"])]),
  },
  "Bristlebane Battler": {
    abilities: [
      entersWith({ counters: 5, counterKind: "-1/-1", label: "Arrive avec cinq marqueurs -1/-1" }),
      triggered(when.enters(ANOTHER_CREATURE_YOU_CONTROL), [fx.removeCounters(ref.self, 1, "-1/-1")], {
        condition: cond.counterAtLeast("-1/-1", 1),
        label: "Une autre créature arrive : retirez un marqueur -1/-1",
      }),
    ],
  },
  "Bristlebane Outrider": {
    abilities: [
      blockAbility(block.notByPowerLE2),
      staticAbility(
        "self",
        { power: 2 },
        { condition: ANOTHER_CREATURE_ENTERED, label: "+2/+0 si une autre créature est arrivée sous votre contrôle ce tour-ci" },
      ),
    ],
  },
  "Chomping Changeling": {
    abilities: [
      triggered(when.entersSelf, [fx.destroy(ref.target())], {
        targets: [target.upTo(1, target.permanent("t", ["Artifact", "Enchantment"], {}, "artefact ou enchantement"))],
        label: "Détruisez jusqu'à un artefact ou enchantement",
      }),
    ],
  },
  "Crossroads Watcher": {
    abilities: [
      triggered(when.enters(ANOTHER_CREATURE_YOU_CONTROL), [fx.pump(ref.self, 1, 0)], {
        label: "Une autre créature arrive : +1/+0",
      }),
    ],
  },
  "Dundoolin Weaver": {
    abilities: [
      triggered(when.entersSelf, [fx.toHand(ref.target())], {
        condition: cond.controls(CREATURE_YOU_CONTROL, 3),
        targets: [target.cardInGraveyard("t", { permanent: true }, "you", "carte de permanent de votre cimetière")],
        label: "Trois créatures ou plus : une carte de permanent revient en main",
      }),
    ],
  },
  "Formidable Speaker": {
    abilities: [
      triggered(
        when.entersSelf,
        [fx.discard(1, ref.you, { optional: true, store: "d" }), ...fx.when(cond.v("d"), fx.search({ types: ["Creature"] }))],
        { label: "Vous pouvez défausser une carte : cherchez une carte de créature" },
      ),
      activated({
        mana: "{1}",
        tap: true,
        targets: [ANOTHER_PERMANENT],
        effects: [fx.untap(ref.target())],
        label: "Dégagez un autre permanent",
      }),
    ],
  },
  "Gilt-Leaf's Embrace": {
    enchant: { filter: { types: ["Creature"] }, label: "créature" },
    abilities: [
      triggered(when.entersSelf, [fx.modify(ref.attached, { addKeywords: ["trample", "indestructible"] })], {
        label: "Piétinement et indestructible jusqu'à la fin du tour",
      }),
      staticAbility("attached", { power: 2 }, { label: "+2/+0" }),
    ],
  },
  "Great Forest Druid": { abilities: [manaAbility(["W", "U", "B", "R", "G"])] },
  Luminollusk: {
    abilities: [triggered(when.entersSelf, [fx.gainLife(VIVID)], { label: "Éclatant — gagnez X points de vie" })],
  },
  "Lys Alana Dignitary": {
    additionalCost: beholdOrPay("Elf", 2),
    abilities: [manaAbility("G", 2, { condition: ELF_IN_GRAVEYARD })],
  },
  "Lys Alana Informant": {
    abilities: [
      triggered(when.entersSelf, [fx.surveil(1)], { label: "Surveillance 1" }),
      triggered(when.diesSelf, [fx.surveil(1)], { label: "Surveillance 1" }),
    ],
  },
  "Midnight Tilling": {
    spell: spell(
      [],
      [
        fx.mill(4, ref.you, { name: "m" }),
        fx.pickFromZone(
          "graveyard",
          { permanent: true },
          { to: "hand" },
          { count: 1, min: 0, pool: ref.stored("m"), prompt: "Vous pouvez reprendre une carte de permanent meulée" },
        ),
      ],
    ),
  },
  "Mistmeadow Council": {
    costReduction: { generic: 1, condition: cond.controls({ subtype: "Kithkin" }) },
    abilities: [triggered(when.entersSelf, [fx.draw(1)], { label: "Piochez une carte" })],
  },
  "Moon-Vigil Adherents": {
    abilities: [
      staticAbility("self", { power: 1, toughness: 1 }, { per: CREATURE_YOU_CONTROL, label: "+1/+1 par créature" }),
      staticAbility(
        "self",
        { power: 1, toughness: 1 },
        { perGraveyard: { types: ["Creature"] }, label: "+1/+1 par carte de créature de votre cimetière" },
      ),
    ],
  },
  "Morcant's Eyes": {
    abilities: [
      triggered(when.yourUpkeep, [fx.surveil(1)], { label: "Surveillance 1" }),
      activated({
        mana: "{4}{G}{G}",
        sacrifice: true,
        sorcerySpeed: true,
        effects: [fx.createTokens(ELF_BG, amount.countIn("graveyard", ELF_CARD))],
        label: "Un Elfe 2/2 par carte d'Elfe de votre cimetière",
      }),
    ],
  },
  "Mutable Explorer": {
    abilities: [triggered(when.entersSelf, [fx.createTappedTokens(MUTAVAULT)], { label: "Jeton Mutavault engagé" })],
  },
  "Pitiless Fists": {
    enchant: { filter: { types: ["Creature"], controller: "you" }, label: "créature que vous contrôlez" },
    abilities: [
      triggered(when.entersSelf, [fx.fight(ref.attached, ref.target())], {
        targets: [target.upTo(1, target.creature("t", { controller: "opponent" }))],
        label: "La créature enchantée se bat contre une créature adverse",
      }),
      staticAbility("attached", { power: 2, toughness: 2 }, { label: "+2/+2" }),
    ],
  },
  Prismabasher: {
    abilities: [
      // « jusqu'à X créatures ciblées » : X est évalué au ciblage (`countAmount`).
      triggered(when.entersSelf, [fx.pump(ref.target(), VIVID, VIVID)], {
        targets: [{ ...target.upTo(1, target.creature("t", { controller: "you" })), countAmount: VIVID }],
        label: "Éclatant — jusqu'à X créatures gagnent +X/+X",
      }),
    ],
  },
  "Prismatic Undercurrents": {
    abilities: [
      triggered(when.entersSelf, [fx.search(BASIC_LAND, { to: "hand" }, VIVID)], {
        label: "Éclatant — jusqu'à X cartes de terrain de base en main",
      }),
      playerStatic({ extraLands: 1, label: "Un terrain supplémentaire à chacun de vos tours" }),
    ],
  },
  "Pummeler for Hire": {
    abilities: [
      triggered(when.entersSelf, [fx.gainLife(amount.maxPower({ types: ["Creature"], subtype: "Giant", controller: "you" }))], {
        label: "Gagnez X points de vie (plus grande force parmi vos Géants)",
      }),
    ],
  },
  "Safewright Cavalry": {
    abilities: [
      blockAbility(block.atMost(1)),
      activated({
        mana: "{5}",
        targets: [target.creature("t", { subtype: "Elf", controller: "you" })],
        effects: [fx.pump(ref.target(), 2, 2)],
        label: "Un Elfe que vous contrôlez gagne +2/+2",
      }),
    ],
  },
  "Spry and Mighty": {
    spell: spell(
      [],
      [
        ...fx.when(
          cond.controls(CREATURE_YOU_CONTROL, 2),
          fx.chooseAmong(ref.permanentsOf(ref.you, { types: ["Creature"] }), ref.you, "a"),
          fx.chooseAmong(ref.stored("aRest"), ref.you, "b"),
          fx.draw(SPRY_X),
          fx.pump(ref.union(ref.stored("a"), ref.stored("b")), SPRY_X, SPRY_X, ["trample"]),
        ),
      ],
    ),
  },
  "Surly Farrier": {
    abilities: [
      activated({
        tap: true,
        sorcerySpeed: true,
        targets: [target.creature("t", { controller: "you" })],
        effects: [fx.pump(ref.target(), 1, 1, ["vigilance"])],
        label: "+1/+1 et vigilance",
      }),
    ],
  },
  "Tend the Sprigs": {
    spell: spell(
      [],
      [
        fx.search(BASIC_LAND, { to: "battlefield", tapped: true }),
        ...fx.when(cond.controls({ anyOf: [{ types: ["Land"] }, { subtype: "Treefolk" }] }, 7), fx.createTokens(TREEFOLK_REACH)),
      ],
    ),
  },
  "Thoughtweft Charge": {
    spell: spell([target.creature()], [fx.pump(ref.target(), 3, 3), ...fx.when(CREATURE_ENTERED, fx.draw(1))]),
  },
  // Recto-verso : le déclencheur « quand elle se transforme en [l'autre face] » est résolu avec la capacité qui la
  // transforme (seule façon de la transformer), sans passer par la pile.
  "Trystan, Callous Cultivator": {
    abilities: [
      ...[when.entersSelf, when.transformsSelf].map((w) =>
        triggered(w, TRYSTAN_CULTIVATOR, { label: "Meulez trois cartes ; Elfe au cimetière : 2 PV" }),
      ),
      triggered(when.step("main1", "you"), fx.mayPay("{B}", "Payer {B} pour transformer Trystan ?", fx.transform()), {
        label: "Vous pouvez payer {B} : transformez Trystan",
      }),
    ],
  },
  "Trystan, Penitent Culler": {
    abilities: [
      triggered(when.transformsSelf, TRYSTAN_CULLER, {
        label: "Meulez trois cartes ; exilez un Elfe de votre cimetière : chaque adversaire perd 2 PV",
      }),
      triggered(when.step("main1", "you"), fx.mayPay("{G}", "Payer {G} pour transformer Trystan ?", fx.transform()), {
        label: "Vous pouvez payer {G} : transformez Trystan",
      }),
    ],
  },
  "Unforgiving Aim": {
    spell: modal(
      mode("Détruisez une créature avec le vol", [target.creature("t", { keyword: "flying" })], [fx.destroy(ref.target())]),
      mode("Détruisez un enchantement", [target.permanent("t", ["Enchantment"], {}, "enchantement")], [fx.destroy(ref.target())]),
      mode("Créez un jeton Elfe 2/2", [], [fx.createTokens(ELF_BG)]),
    ),
  },
  "Vinebred Brawler": {
    keywords: ["mustBeBlocked"],
    abilities: [
      triggered(when.attacksSelf, [fx.pump(ref.target(), 2, 1)], {
        targets: [target.creature("t", { ...ELF_YOU_CONTROL, other: true })],
        label: "Un autre Elfe gagne +2/+1",
      }),
    ],
  },
  "Virulent Emissary": {
    abilities: [
      triggered(when.enters(ANOTHER_CREATURE_YOU_CONTROL), [fx.gainLife(1)], {
        label: "Une autre créature arrive : 1 point de vie",
      }),
    ],
  },
  "Wildvine Pummeler": {
    // Éclatant : {1} de moins par couleur parmi vos permanents.
    costReduction: { generic: VIVID },
  },
};
