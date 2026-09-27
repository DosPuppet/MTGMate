/** Final Fantasy — cartes transformables (dont Sagas au verso) et assemblage (lot C). Scripts par nom de face. */
import type { CardScript } from "@mtgx/engine";
import {
  activated,
  amount,
  chapter,
  chocobo,
  cond,
  entersWith,
  FOOD,
  fx,
  KNIGHT_2,
  manaAbility,
  ref,
  staticAbility,
  TOWN,
  TREASURE,
  target,
  targetObj,
  triggered,
  when,
} from "./common";

const PERMANENT_CARD = {
  anyOf: (["Artifact", "Creature", "Enchantment", "Land", "Planeswalker", "Battle"] as const).map((t) => ({ types: [t] })),
};
const YOURS = { types: ["Creature" as const], controller: "you" as const };
const OTHERS = { ...YOURS, other: true };
const CREATURE_OR_ARTIFACT = { anyOf: [{ types: ["Creature" as const] }, { types: ["Artifact" as const] }] };

/** « Exilez [cette carte], puis renvoyez-la sur le champ de bataille transformée sous le contrôle de son propriétaire. » */
const flipOut = () => [fx.exileCard(ref.self, { name: "flip" }), fx.toBattlefield(ref.stored("flip"), { transformed: true })];
/** « Exilez [ce verso], puis renvoyez-le sur le champ de bataille » : il revient sur son recto. */
const flipBack = () => [fx.exileCard(ref.self, { name: "flip" }), fx.toBattlefield(ref.stored("flip"))];
/** Capacité « {coût}, {T} : exilez-la, puis renvoyez-la transformée. N'activez qu'en rituel. » */
const transformAbility = (mana: string, label = "Exilez-la, puis renvoyez-la transformée") =>
  activated({ mana, tap: true, sorcerySpeed: true, effects: flipOut(), label });

export const TRANSFORM: Record<string, CardScript> = {
  // --- Blanc ------------------------------------------------------------------
  "Dion, Bahamut's Dominant": {
    abilities: [
      staticAbility(
        { types: ["Creature"], controller: "you", anyOf: [{ self: true }, { subtype: "Knight" }] },
        { addKeywords: ["flying"] },
        { condition: cond.yourTurn, label: "Plongeon draconique : le vol pendant votre tour" },
      ),
      triggered(when.entersSelf, [fx.createTokens(KNIGHT_2)], { label: "Chevalier 2/2" }),
      transformAbility("{4}{W}{W}"),
    ],
  },
  "Bahamut, Warden of Light": {
    abilities: [
      chapter([1, 2], [fx.addCountersAll(OTHERS, 1), fx.pumpAll(OTHERS, 0, 0, ["flying"])], { label: "Ailes de lumière" }),
      chapter([3], [fx.destroy(ref.target()), ...flipBack()], {
        targets: [targetObj("t", { permanent: true }, "permanent")],
        label: "Gigaflare",
      }),
    ],
  },
  "Sidequest: Catch a Fish": {
    abilities: [
      triggered(
        when.yourUpkeep,
        [
          fx.lookAtTop(1, {
            filter: { anyOf: [{ types: ["Artifact"] }, { types: ["Creature"] }] },
            count: 1,
            rest: "top",
            store: "fish",
          }),
          fx.when(cond.v("fish"), fx.createTokens(FOOD), fx.transform()),
        ],
        { label: "Carte du dessus : artefact ou créature en main" },
      ),
    ],
  },
  "Cooking Campsite": {
    abilities: [
      manaAbility("W"),
      activated({
        mana: "{3}",
        tap: true,
        sacrificeOther: { filter: { types: ["Artifact"] } },
        sorcerySpeed: true,
        effects: [fx.addCountersAll(YOURS, 1)],
        label: "Un marqueur +1/+1 sur chaque créature",
      }),
    ],
  },
  "Venat, Heart of Hydaelyn": {
    abilities: [
      triggered(when.castSpell("you", { legendary: true }), [fx.draw(1)], { oncePerTurn: true, label: "Piochez" }),
      activated({
        mana: "{7}",
        tap: true,
        sorcerySpeed: true,
        targets: [target.nonland("t")],
        effects: [fx.exile(ref.target()), fx.transform()],
        label: "Division du héros",
      }),
    ],
  },
  "Hydaelyn, the Mothercrystal": {
    abilities: [
      triggered(
        when.yourCombat,
        [
          fx.addCounters(ref.target(), 1),
          fx.modify(ref.target(), { addKeywords: ["indestructible"] }, "untilYourNextTurn"),
          fx.when(cond.targetMatches("t", { legendary: true }), fx.draw(1)),
        ],
        { targets: [target.creature("t", { controller: "you", other: true })], label: "Bénédiction de lumière" },
      ),
    ],
  },

  // --- Bleu -------------------------------------------------------------------
  "Jill, Shiva's Dominant": {
    abilities: [
      triggered(when.entersSelf, [fx.bounce(ref.target())], {
        targets: [target.upTo(1, target.nonland("t", { other: true }))],
        label: "Renvoyez un autre permanent non-terrain",
      }),
      transformAbility("{3}{U}{U}"),
    ],
  },
  "Shiva, Warden of Ice": {
    abilities: [
      chapter([1, 2], [fx.pump(ref.target(), 0, 0, ["unblockable"])], {
        targets: [target.creature("t")],
        label: "Envoûtement : imblocable",
      }),
      chapter([3], [fx.tap(ref.permanentsOf(ref.eachOpponent, { types: ["Land"] })), ...flipBack()], {
        label: "Vague de froid",
      }),
    ],
  },
  "Sidequest: Card Collection": {
    abilities: [
      triggered(when.entersSelf, [fx.draw(3), fx.discard(2)], { label: "Piochez trois, défaussez deux" }),
      triggered(when.yourEndStep, [fx.transform()], {
        condition: cond.amountAtLeast(amount.countIn("graveyard"), 8),
        label: "Transformez (huit cartes au cimetière)",
      }),
    ],
  },
  "Magicked Card": {},

  // --- Noir -------------------------------------------------------------------
  "Cecil, Dark Knight": {
    abilities: [
      triggered(
        when.dealsDamage("self"),
        [fx.loseLife(amount.eventAmount), fx.when(cond.not(cond.lifeAtLeast(11)), fx.untap(ref.self), fx.transform())],
        { label: "Ténèbres : perdez autant de PV" },
      ),
    ],
  },
  "Cecil, Redeemed Paladin": {
    abilities: [
      triggered(when.attacksSelf, [fx.pumpAll({ types: ["Creature"], attacking: true, other: true }, 0, 0, ["indestructible"])], {
        label: "Protection : les autres attaquants sont indestructibles",
      }),
    ],
  },
  "Jecht, Reluctant Guardian": {
    abilities: [
      triggered(when.combatDamageToPlayer, [fx.may("Exiler Jecht et le renvoyer transformé ?", ...flipOut())], {
        label: "Transformez",
      }),
    ],
  },
  "Braska's Final Aeon": {
    abilities: [
      chapter([1, 2], [fx.discard(1, ref.eachOpponent), fx.draw(1)], { label: "Rayon de Jecht" }),
      chapter([3], [fx.sacrifice(ref.eachOpponent, { types: ["Creature"] }, 2)], { label: "Tir ultime de Jecht" }),
    ],
  },
  "Sidequest: Hunt the Mark": {
    abilities: [
      triggered(when.entersSelf, [fx.destroy(ref.target())], {
        targets: [target.upTo(1, target.creature("t"))],
        label: "Détruisez jusqu'à une créature",
      }),
      triggered(
        when.yourEndStep,
        [fx.createTokens(TREASURE), fx.when(cond.controls({ subtype: "Treasure" }, 3), fx.transform())],
        { condition: cond.creaturesDied(1, true), label: "Trésor, puis transformez (trois Trésors)" },
      ),
    ],
  },
  "Yiazmat, Ultimate Mark": {
    abilities: [
      activated({
        mana: "{1}{B}",
        sacrificeOther: { filter: { ...CREATURE_OR_ARTIFACT, other: true } },
        effects: [fx.pump(ref.self, 0, 0, ["indestructible"]), fx.tap(ref.self)],
        label: "Indestructible, engagez-la",
      }),
    ],
  },
  "Vincent Valentine": {
    abilities: [
      triggered(
        when.dies({ types: ["Creature"], controller: "opponent" }),
        [fx.addCounters(ref.self, amount.powerOf(ref.eventObject))],
        {
          label: "Marqueurs égaux à sa force",
        },
      ),
      triggered(when.attacksSelf, [fx.may("Transformer Vincent Valentine ?", fx.transform())], { label: "Transformez" }),
    ],
  },
  "Galian Beast": {
    abilities: [triggered(when.diesSelf, [fx.toBattlefield(ref.selfCard, { tapped: true })], { label: "Revient engagée" })],
  },

  // --- Vert -------------------------------------------------------------------
  "Sidequest: Raise a Chocobo": {
    abilities: [
      triggered(when.entersSelf, [chocobo()], { label: "Chocobo 2/2" }),
      // Approximation : la recherche de Black Chocobo (« quand il se transforme ») est faite par le même effet.
      triggered(when.step("main1"), [fx.transform(), fx.search({ types: ["Land"] }, { to: "battlefield", tapped: true })], {
        condition: cond.controls({ types: ["Creature"], subtype: "Bird" }, 4),
        label: "Transformez (quatre Oiseaux)",
      }),
    ],
  },
  "Black Chocobo": {
    abilities: [
      triggered(when.landfall, [fx.pumpAll({ ...YOURS, subtype: "Bird" }, 1, 0)], { label: "Landfall : Oiseaux +1/+0" }),
    ],
  },

  // --- Multicolore ------------------------------------------------------------
  "Joshua, Phoenix's Dominant": {
    abilities: [
      triggered(when.entersSelf, [fx.discard(2, ref.you, { optional: true, store: "d" }), fx.draw(amount.v("d"))], {
        label: "Défaussez jusqu'à deux cartes, piochez-en autant",
      }),
      transformAbility("{3}{R}{W}"),
    ],
  },
  "Phoenix, Warden of Fire": {
    abilities: [
      chapter([1, 2], [fx.damage(2, ref.eachOpponent)], { label: "Flammes ascendantes" }),
      chapter([3], [fx.toBattlefield(ref.target()), ...flipBack()], {
        targets: [
          {
            ...target.upTo(20, target.cardInGraveyard("t", { types: ["Creature"] }, "you", "carte de créature")),
            maxTotalManaValue: 6,
          },
        ],
        label: "Flammes de la renaissance",
      }),
    ],
  },
  "The Emperor of Palamecia": {
    abilities: [
      manaAbility(["U", "R"], 1, { restriction: { spell: { notTypes: ["Creature"] } } }),
      triggered(
        when.castNoncreatureWithMana(4),
        [fx.addCounters(ref.self, 1), fx.when(cond.counterAtLeast("+1/+1", 3), fx.transform())],
        { label: "Marqueur +1/+1, puis transformez (trois)" },
      ),
    ],
  },
  "The Lord Master of Hell": {
    abilities: [
      triggered(
        when.attacksSelf,
        [fx.damage(amount.countIn("graveyard", { notTypes: ["Creature", "Land"] }), ref.eachOpponent)],
        { label: "Pluie d'étoiles" },
      ),
    ],
  },
  "Exdeath, Void Warlock": {
    abilities: [
      triggered(when.entersSelf, [fx.gainLife(3)], { label: "+3 PV" }),
      triggered(when.yourEndStep, [fx.transform()], {
        condition: cond.amountAtLeast(amount.countIn("graveyard", PERMANENT_CARD), 6),
        label: "Transformez (six cartes de permanent au cimetière)",
      }),
    ],
  },
  "Neo Exdeath, Dimension's End": { cdaPower: amount.countIn("graveyard", PERMANENT_CARD) },
  "Garland, Knight of Cornelia": {
    abilities: [
      triggered(when.castSpell("you", { notTypes: ["Creature"] }), [fx.surveil(1)], { label: "Surveillance 1" }),
      activated({
        mana: "{3}{B}{B}{R}{R}",
        fromGraveyard: true,
        sorcerySpeed: true,
        effects: [fx.toBattlefield(ref.self, { transformed: true })],
        label: "Revient transformée du cimetière",
      }),
    ],
  },
  "Chaos, the Endless": {
    abilities: [
      triggered(when.diesSelf, [fx.moveTo(ref.selfCard, { to: "libraryBottom" })], { label: "Au-dessous de la bibliothèque" }),
    ],
  },

  // --- Terrain ----------------------------------------------------------------
  "Balamb Garden, SeeD Academy": {
    abilities: [
      entersWith({ tapped: true }),
      manaAbility(["G", "U"]),
      activated({
        mana: "{5}{G}{U}",
        tap: true,
        reduction: { generic: amount.count({ ...TOWN, controller: "you", other: true }) },
        effects: [fx.transform()],
        label: "Transformez",
      }),
    ],
  },
  "Balamb Garden, Airborne": { abilities: [triggered(when.attacksSelf, [fx.draw(1)], { label: "Piochez" })] },

  // --- Assemblage -------------------------------------------------------------
  "Fang, Fearless l'Cie": {
    abilities: [
      triggered(when.zoneChange(["graveyard"], { whose: "you" }), [fx.draw(1), fx.loseLife(1)], {
        oncePerTurn: true,
        label: "Piochez, perdez 1 PV",
      }),
    ],
  },
  "Vanille, Cheerful l'Cie": {
    abilities: [
      triggered(
        when.entersSelf,
        [fx.mill(2), fx.pickFromZone("graveyard", PERMANENT_CARD, { to: "hand" }, { prompt: "Une carte de permanent en main" })],
        { label: "Meulez deux, une carte de permanent en main" },
      ),
      triggered(
        when.step("main1"),
        fx.mayPay("{3}{B}{G}", "Payer {3}{B}{G} pour assembler Vanille et Fang ?", fx.meld("Fang, Fearless l'Cie")),
        {
          condition: cond.controls({ types: ["Creature"], name: "Fang, Fearless l'Cie" }),
          label: "Assemblez-les en Ragnarok",
        },
      ),
    ],
  },
  "Ragnarok, Divine Deliverance": {
    abilities: [
      triggered(when.diesSelf, [fx.destroy(ref.target("p")), fx.toBattlefield(ref.target("c"))], {
        targets: [
          targetObj("p", { permanent: true }, "permanent"),
          target.cardInGraveyard("c", { ...PERMANENT_CARD, legendary: false }, "you", "carte de permanent non légendaire"),
        ],
        label: "Détruisez un permanent, renvoyez une carte de permanent",
      }),
    ],
  },
};
