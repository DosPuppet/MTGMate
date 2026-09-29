/**
 * Avatar: The Last Airbender — cartes des decks du méta (phase 1 du plan P4, lot M1) : maîtrise de la terre
 * (`fx.earthbend`). L'extension n'est pas encore couverte en entier.
 */
import {
  ALLY,
  activated,
  amount,
  BASIC_LAND,
  type CardScript,
  CLUE,
  chapter,
  cond,
  cost,
  costReducer,
  DRAGON_FIREBENDING,
  entersWith,
  fx,
  manaAbility,
  modal,
  mode,
  ref,
  SPIRIT_KOH,
  spell,
  staticAbility,
  target,
  triggered,
  when,
} from "./common";

const LAND_YOU_CONTROL = target.permanent("t", ["Land"], { controller: "you" }, "terrain que vous contrôlez");

export const CARDS: Record<string, CardScript> = {
  // --- Terrains --------------------------------------------------------------
  "Ba Sing Se": {
    abilities: [
      entersWith({
        tapped: true,
        condition: cond.not(cond.controls({ types: ["Land"], basic: true })),
        label: "Engagé, sauf si vous contrôlez un terrain de base",
      }),
      manaAbility("G"),
      activated({
        mana: "{2}{G}",
        tap: true,
        sorcerySpeed: true,
        targets: [LAND_YOU_CONTROL],
        effects: fx.earthbend(ref.target(), 2),
        label: "Maîtrise de la terre 2",
      }),
    ],
  },
  // --- Vert ------------------------------------------------------------------
  "Earthbender Ascension": {
    abilities: [
      triggered(when.entersSelf, [...fx.earthbend(ref.target(), 2), fx.search(BASIC_LAND, { to: "battlefield", tapped: true })], {
        targets: [LAND_YOU_CONTROL],
        label: "Maîtrise de la terre 2, puis un terrain de base",
      }),
      triggered(
        when.landfall,
        [
          fx.counters(ref.self, "quest"),
          ...fx.when(
            cond.counterAtLeast("quest", 4),
            fx.reflexive(
              [target.creature("t", { controller: "you" })],
              [fx.addCounters(ref.target(), 1), fx.modify(ref.target(), { addKeywords: ["trample"] })],
            ),
          ),
        ],
        { label: "Marqueur de quête ; à 4 ou plus, +1/+1 et piétinement" },
      ),
    ],
  },

  // --- Lot M2 -----------------------------------------------------------------
  "Callous Inspector": {
    abilities: [
      triggered(when.diesSelf, [fx.damage(1, ref.you), fx.createTokens(CLUE)], { label: "1 blessure à vous, un Indice" }),
    ],
  },
  "Deadly Precision": {
    additionalCost: {
      sacrifice: { filter: { anyOf: [{ types: ["Artifact"] }, { types: ["Creature"] }] }, count: 1, orPay: cost("{4}") },
    },
    spell: spell([target.creature()], [fx.destroy(ref.target())]),
  },
  "Obsessive Pursuit": {
    abilities: [
      triggered(when.entersSelf, [fx.loseLife(1), fx.createTokens(CLUE)], { label: "Perdez 1 PV, un Indice" }),
      triggered(when.yourUpkeep, [fx.loseLife(1), fx.createTokens(CLUE)], { label: "Perdez 1 PV, un Indice" }),
      triggered(
        when.attackWith(1),
        [
          fx.addCounters(ref.target(), amount.sacrificedThisTurn),
          ...fx.when(cond.amountAtLeast(amount.sacrificedThisTurn, 3), fx.modify(ref.target(), { addKeywords: ["lifelink"] })),
        ],
        {
          targets: [target.creature("t", { attacking: true })],
          label: "X marqueurs +1/+1 (permanents sacrifiés ce tour-ci)",
        },
      ),
    ],
  },
  "Wan Shi Tong, Librarian": {
    abilities: [
      triggered(when.entersSelf, [fx.addCounters(ref.self, amount.sourceX), fx.draw(amount.per(amount.sourceX, 2))], {
        label: "X marqueurs +1/+1, piochez X/2 cartes",
      }),
      triggered(when.search("opponent"), [fx.addCounters(ref.self, 1), fx.draw(1)], { label: "Marqueur +1/+1, piochez" }),
    ],
  },
  "Day of Black Sun": {
    spell: spell(
      [],
      [
        fx.modifyAll({ types: ["Creature"], maxManaValueX: true }, { loseAllAbilities: true }),
        fx.destroyAll({ types: ["Creature"], maxManaValueX: true }),
      ],
    ),
  },
  "Raven Eagle": {
    abilities: [
      ...[when.entersSelf, when.attacksSelf].map((w) =>
        triggered(
          w,
          [
            fx.exileCard(ref.target(), { name: "c", filter: { types: ["Creature"] } }),
            ...fx.when(cond.v("c"), fx.createTokens(CLUE)),
          ],
          { targets: [target.optional(target.cardInGraveyard("t", {}, "any"))], label: "Exiler une carte d'un cimetière" },
        ),
      ),
      triggered(when.draw(2), fx.drain(1), { label: "Chaque adversaire perd 1 PV, vous en gagnez 1" }),
    ],
  },

  // --- Lot M3 -----------------------------------------------------------------
  "Shared Roots": { spell: spell([], [fx.search(BASIC_LAND, { to: "battlefield", tapped: true })]) },

  // --- Lot M4 -----------------------------------------------------------------
  "Momo, Friendly Flier": {
    abilities: [
      costReducer(
        { types: ["Creature"], keyword: "flying", notSubtype: "Lemur" },
        1,
        "Premier sort de créature volante du tour : {1} de moins",
        {
          condition: cond.all(
            cond.yourTurn,
            cond.not(cond.amountAtLeast(amount.turnEvents({ event: "cast", who: "you", types: ["Creature"] }), 1)),
          ),
        },
      ),
      triggered(
        when.enters({ types: ["Creature"], controller: "you", keyword: "flying", other: true }),
        [fx.pump(ref.self, 1, 1)],
        {
          label: "+1/+1 jusqu'à la fin du tour",
        },
      ),
    ],
  },
  "The Legend of Roku": {
    abilities: [
      chapter([1], [fx.exileTop(ref.you, 3, "r"), fx.grantPlay(ref.stored("r"), { untilYourNextTurn: true })], {
        label: "Exile les trois cartes du dessus, jouables jusqu'à la fin de votre prochain tour",
      }),
      chapter([2], [fx.addManaChoice(1)], { label: "Un mana de n'importe quelle couleur" }),
      chapter([3], [fx.exileCard(ref.self, { name: "flip" }), fx.toBattlefield(ref.stored("flip"), { transformed: true })], {
        label: "Revient transformée",
      }),
    ],
  },
  "Avatar Roku": {
    // Maîtrise du feu 4 : lue dans le texte.
    abilities: [
      activated({
        mana: "{8}",
        effects: [fx.createTokens(DRAGON_FIREBENDING)],
        label: "Un Dragon 4/4 volant, maîtrise du feu 4",
      }),
    ],
  },

  // --- Lot M6 -----------------------------------------------------------------
  "Abandoned Air Temple": {
    abilities: [
      entersWith({
        tapped: true,
        condition: cond.not(cond.controls({ types: ["Land"], basic: true })),
        label: "Engagé, sauf si vous contrôlez un terrain de base",
      }),
      manaAbility("W"),
      activated({
        mana: "{3}{W}",
        tap: true,
        effects: [fx.addCountersAll({ types: ["Creature"], controller: "you" }, 1)],
        label: "Un marqueur +1/+1 sur chacune de vos créatures",
      }),
    ],
  },
  "Avatar's Wrath": {
    exileOnResolve: true,
    spell: spell(
      [target.upTo(1, target.creature())],
      [
        fx.airbend(ref.except(ref.permanentsOf(ref.eachPlayer, { types: ["Creature"] }), ref.target())),
        fx.untilYourNextTurn({ castOnlyFromHand: true }, ref.eachOpponent),
      ],
    ),
  },
  "Aang, at the Crossroads": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.lookAtTop(5, {
            count: 1,
            filter: { types: ["Creature"], maxManaValue: 4 },
            to: { to: "battlefield" },
            rest: "bottom",
          }),
        ],
        { label: "Une créature de VM 4 ou moins parmi les cinq du dessus" },
      ),
      triggered(
        when.leaves({ types: ["Creature"], controller: "you", other: true }),
        [fx.delayedAt("nextUpkeep", [fx.transform(ref.self)])],
        {
          label: "Se transforme au début du prochain entretien",
        },
      ),
    ],
  },
  "Aang, Destined Savior": {
    abilities: [
      staticAbility(
        { types: ["Land"], controller: "you", anyOf: [{ types: ["Creature"] }] },
        { addKeywords: ["vigilance"] },
        {
          label: "Vos créatures-terrains ont la vigilance",
        },
      ),
      triggered(when.yourCombat, fx.earthbend(ref.target(), 2), {
        targets: [target.permanent("t", ["Land"], { controller: "you" }, "terrain que vous contrôlez")],
        label: "Maîtrise de la terre 2",
      }),
    ],
  },
  "Aang, Swift Savior": {
    abilities: [
      triggered(when.entersSelf, [fx.airbend(ref.target())], {
        targets: [
          target.upTo(1, {
            id: "t",
            label: "autre créature ou sort",
            filter: { objects: { types: ["Creature"], other: true }, spells: {} },
          }),
        ],
        label: "Maîtrise de l'air",
      }),
      // Maîtrise de l'eau {8} : payée en mana (les artefacts et créatures engagés n'aident pas).
      activated({ mana: "{8}", effects: [fx.transform(ref.self)], label: "Maîtrise de l'eau 8 : transformez Aang" }),
    ],
  },
  "Aang and La, Ocean's Fury": {
    abilities: [
      triggered(when.attacksSelf, [fx.addCountersAll({ types: ["Creature"], controller: "you", tapped: true }, 1)], {
        label: "+1/+1 sur chacune de vos créatures engagées",
      }),
    ],
  },
  "Airbender Ascension": {
    abilities: [
      triggered(when.entersSelf, [fx.airbend(ref.target())], {
        targets: [target.upTo(1, target.creature())],
        label: "Maîtrise de l'air",
      }),
      triggered(when.enters({ types: ["Creature"], controller: "you" }), [fx.counters(ref.self, "quest")], {
        label: "Un marqueur de quête",
      }),
      triggered(when.yourEndStep, [fx.exileCard(ref.target(), { name: "f" }), fx.toBattlefield(ref.stored("f"))], {
        condition: cond.counterAtLeast("quest", 4),
        targets: [target.upTo(1, target.creature("t", { controller: "you" }))],
        label: "Exile puis renvoie une de vos créatures",
      }),
    ],
  },
  "Appa, Steadfast Guardian": {
    abilities: [
      triggered(when.entersSelf, [fx.airbend(ref.target())], {
        targets: [{ ...target.nonland("t", { controller: "you", other: true }), count: 20, optional: true }],
        label: "Maîtrise de l'air de vos permanents non-terrains",
      }),
      triggered({ on: "castSpell", by: "you", fromExile: true }, [fx.createTokens(ALLY)], { label: "Un Allié 1/1" }),
    ],
  },
  "Heartless Act": {
    spell: modal(
      mode("Détruit une créature sans marqueur", [target.creature("t", { noCounters: true })], [fx.destroy(ref.target())]),
      mode("Retire jusqu'à trois marqueurs", [target.creature("u")], [fx.removeCounters(ref.target("u"), 3)]),
    ),
  },
  "Price of Freedom": {
    spell: spell(
      [target.permanent("t", ["Artifact", "Land"], { controller: "opponent" }, "artefact ou terrain adverse")],
      [
        fx.destroy(ref.target()),
        fx.search(BASIC_LAND, { to: "battlefield", tapped: true }, 1, ref.controllerOf(ref.target())),
        fx.draw(1),
      ],
    ),
  },
  "Combustion Technique": {
    spell: spell(
      [target.creature()],
      [fx.exileIfDies(ref.target()), fx.damage(amount.plus(2, amount.countIn("graveyard", { subtype: "Lesson" })), ref.target())],
    ),
  },
  "Iroh's Demonstration": {
    spell: modal(
      mode("1 blessure à chaque créature adverse", [], [fx.damageAll(1, { types: ["Creature"], controller: "opponent" })]),
      mode("4 blessures à une créature", [target.creature()], [fx.damage(4, ref.target())]),
    ),
  },
  "Firebending Lesson": {
    kicker: "{4}",
    spell: spell([target.creature()], [fx.damage(amount.kicked(5, 2), ref.target())]),
  },
  "Accumulate Wisdom": {
    spell: spell(
      [],
      [
        ...fx.when(
          cond.amountAtLeast(amount.countIn("graveyard", { subtype: "Lesson" }), 3),
          fx.lookAtTop(3, { count: 3, to: { to: "hand" }, rest: "bottom" }),
        ),
        ...fx.when(
          cond.not(cond.amountAtLeast(amount.countIn("graveyard", { subtype: "Lesson" }), 3)),
          fx.lookAtTop(3, { count: 1, to: { to: "hand" }, rest: "bottom" }),
        ),
      ],
    ),
  },
  "Abandon Attachments": {
    spell: spell([], [fx.discard(1, ref.you, { optional: true, store: "d" }), ...fx.when(cond.v("d"), fx.draw(2))]),
  },
  "It'll Quench Ya!": {
    spell: spell([target.spell()], fx.unlessPays(ref.controllerOf(ref.target()), { mana: "{2}" }, fx.counter(ref.target()))),
  },
  "Realm of Koh": {
    abilities: [
      entersWith({
        tapped: true,
        condition: cond.not(cond.controls({ types: ["Land"], basic: true })),
        label: "Engagé, sauf si vous contrôlez un terrain de base",
      }),
      manaAbility("B"),
      activated({ mana: "{3}{B}", tap: true, effects: [fx.createTokens(SPIRIT_KOH)], label: "Un Esprit 1/1" }),
    ],
  },
};
