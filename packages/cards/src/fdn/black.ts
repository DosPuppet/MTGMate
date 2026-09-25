/** Foundations — cartes noires. */
import {
  activated,
  amount,
  type CardScript,
  CREATURE_YOU_CONTROL,
  cond,
  entersWith,
  FOOD,
  fx,
  INSECT,
  modal,
  mode,
  RAT,
  ref,
  spell,
  staticAbility,
  TREASURE,
  target,
  triggered,
  when,
} from "./common";

const ANOTHER_CREATURE = { types: ["Creature" as const], other: true };

export const BLACK: Record<string, CardScript> = {
  "Arbiter of Woe": {
    additionalCost: { sacrifice: { filter: { types: ["Creature"] }, count: 1 } },
    abilities: [
      triggered(
        when.entersSelf,
        [fx.discard(1, ref.eachOpponent), fx.loseLife(2, ref.eachOpponent), fx.draw(1), fx.gainLife(2)],
        { label: "défausse, -2 PV ; vous piochez, +2 PV" },
      ),
    ],
  },
  "Diregraf Ghoul": { abilities: [entersWith({ tapped: true })] },
  "Billowing Shriekmass": {
    abilities: [
      triggered(when.entersSelf, [fx.mill(3)], { label: "meule 3" }),
      staticAbility("self", { power: 2, toughness: 1 }, { condition: cond.threshold, label: "Seuil : +2/+1" }),
    ],
  },
  "Bloodthirsty Conqueror": {
    abilities: [triggered(when.loseLife("opponent"), [fx.gainLife(amount.eventAmount)], { label: "gagnez autant de PV" })],
  },
  "Crypt Feaster": {
    abilities: [triggered(when.attacksSelf, [fx.pump(ref.self, 2, 0)], { condition: cond.threshold, label: "Seuil : +2/+0" })],
  },
  "Gutless Plunderer": {
    abilities: [
      triggered(when.entersSelf, [fx.lookAtTop(3, { count: 1, to: { to: "libraryTop" }, rest: "graveyard" })], {
        condition: cond.raid,
        label: "Raid : regard 3",
      }),
    ],
  },
  "High-Society Hunter": {
    abilities: [
      triggered(
        when.attacksSelf,
        [
          fx.sacrifice(ref.you, ANOTHER_CREATURE, 1, { optional: true, store: "sac" }),
          ...fx.when(cond.v("sac"), fx.addCounters(ref.self, 1)),
        ],
        { label: "sacrifice possible : marqueur +1/+1" },
      ),
      triggered(when.dies({ types: ["Creature"], nontoken: true, other: true }), [fx.draw(1)], { label: "piochez une carte" }),
    ],
  },
  "Hungry Ghoul": {
    abilities: [
      activated({
        mana: "{1}",
        sacrificeOther: { filter: { types: ["Creature"] } },
        effects: [fx.addCounters(ref.self, 1)],
        label: "Sacrifier une créature : marqueur +1/+1",
      }),
    ],
  },
  "Infernal Vessel": {
    abilities: [
      triggered(
        when.dies({ self: true, notSubtype: "Demon" }),
        [fx.toBattlefield(ref.eventObject, { counters: { kind: "+1/+1", n: 2 }, addSubtypes: ["Demon"] })],
        { label: "revient en Démon" },
      ),
    ],
  },
  "Infestation Sage": { abilities: [triggered(when.diesSelf, [fx.createTokens(INSECT)], { label: "Insecte 1/1 volant" })] },
  "Midnight Snack": {
    abilities: [
      triggered(when.yourEndStep, [fx.createTokens(FOOD)], { condition: cond.raid, label: "Raid : Nourriture" }),
      activated({
        mana: "{2}{B}",
        sacrifice: true,
        targets: [target.player("t", "opponent")],
        effects: [fx.loseLife(amount.lifeGainedThisTurn, ref.target())],
        label: "L'adversaire perd la vie gagnée ce tour",
      }),
    ],
  },
  "Revenge of the Rats": {
    flashback: "{2}{B}{B}",
    spell: spell([], [fx.createTokens({ ...RAT, tapped: true }, amount.countIn("graveyard", { types: ["Creature"] }))]),
  },
  "Sanguine Syphoner": { abilities: [triggered(when.attacksSelf, fx.drain(1), { label: "draine 1" })] },
  "Seeker's Folly": {
    spell: modal(
      mode("L'adversaire ciblé défausse deux cartes", [target.player("t", "opponent")], [fx.discard(2, ref.target())]),
      mode("Créatures adverses -1/-1", [], [fx.pumpAll({ controller: "opponent" }, -1, -1)]),
    ),
  },
  "Soul-Shackled Zombie": {
    abilities: [
      triggered(
        when.entersSelf,
        [fx.exileCard(ref.target(), { name: "ex", filter: { types: ["Creature"] } }), ...fx.when(cond.v("ex"), fx.drain(2))],
        {
          targets: [
            { ...target.upTo(2, target.cardInGraveyard("t", {}, "any")), samePlayer: true, label: "cartes d'un même cimetière" },
          ],
          label: "exile jusqu'à deux cartes",
        },
      ),
    ],
  },
  Stab: { spell: spell([target.creature()], [fx.pump(ref.target(), -2, -2)]) },
  "Tragic Banshee": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          ...fx.when(cond.not(cond.morbid), fx.pump(ref.target(), -1, -1)),
          ...fx.when(cond.morbid, fx.pump(ref.target(), -13, -13)),
        ],
        { targets: [target.creature("t", { controller: "opponent" })], label: "-1/-1 (Morbide : -13/-13)" },
      ),
    ],
  },
  "Vampire Gourmand": {
    abilities: [
      triggered(
        when.attacksSelf,
        [
          fx.sacrifice(ref.you, ANOTHER_CREATURE, 1, { optional: true, store: "sac" }),
          ...fx.when(cond.v("sac"), fx.draw(1), fx.modify(ref.self, { addKeywords: ["unblockable"] })),
        ],
        { label: "sacrifice possible : pioche, imblocable" },
      ),
    ],
  },
  "Vampire Soulcaller": {
    keywords: ["cantBlock"],
    abilities: [
      triggered(when.entersSelf, [fx.toHand(ref.target())], {
        targets: [target.cardInGraveyard("t", { types: ["Creature"] })],
        label: "récupère une créature",
      }),
    ],
  },
  "Vengeful Bloodwitch": {
    abilities: [
      triggered(when.dies(CREATURE_YOU_CONTROL), fx.drain(1, ref.target()), {
        targets: [target.player("t", "opponent")],
        label: "draine 1",
      }),
    ],
  },
  "Bake into a Pie": { spell: spell([target.creature()], [fx.destroy(ref.target()), fx.createTokens(FOOD)]) },
  "Burglar Rat": {
    abilities: [triggered(when.entersSelf, [fx.discard(1, ref.eachOpponent)], { label: "chaque adversaire défausse" })],
  },
  Exsanguinate: {
    spell: spell([], [fx.loseLife(amount.x, ref.eachOpponent, "lost"), fx.gainLife(amount.v("lost"))]),
  },
  "Fake Your Own Death": {
    spell: spell(
      [target.creature()],
      [
        fx.pump(ref.target(), 2, 0),
        fx.modify(ref.target(), {
          addAbilities: [
            triggered(when.diesSelf, [fx.toBattlefield(ref.eventObject, { tapped: true }), fx.createTokens(TREASURE)], {
              label: "revient engagée, Trésor",
            }),
          ],
        }),
      ],
    ),
  },
  "Hero's Downfall": { spell: spell([target.creatureOrPlaneswalker()], [fx.destroy(ref.target())]) },
  "Macabre Waltz": {
    spell: spell(
      [target.upTo(2, target.cardInGraveyard("t", { types: ["Creature"] }, "you", "cartes de créature de votre cimetière"))],
      [fx.toHand(ref.target()), fx.discard(1)],
    ),
  },
  "Marauding Blight-Priest": {
    abilities: [triggered(when.gainLife, [fx.loseLife(1, ref.eachOpponent)], { label: "chaque adversaire perd 1 PV" })],
  },
  "Painful Quandary": {
    abilities: [
      triggered(when.castSpell("opponent"), [fx.punisher(ref.eventPlayer, 5, { discard: true })], {
        label: "perd 5 PV sauf défausse",
      }),
    ],
  },
  "Phyrexian Arena": {
    abilities: [triggered(when.yourUpkeep, [fx.draw(1), fx.loseLife(1)], { label: "piochez, perdez 1 PV" })],
  },
  Pilfer: {
    spell: spell(
      [target.player("t", "opponent")],
      [fx.discard(1, ref.target(), { filter: { nonland: true }, chooser: "controller" })],
    ),
  },
  "Reassembling Skeleton": {
    abilities: [
      activated({
        mana: "{1}{B}",
        fromGraveyard: true,
        effects: [fx.toBattlefield(ref.self, { tapped: true })],
        label: "Revenir du cimetière",
      }),
    ],
  },
  "Rise of the Dark Realms": {
    spell: spell(
      [],
      [fx.moveAll("graveyard", ref.eachPlayer, { types: ["Creature"] }, { to: "battlefield", underYourControl: true })],
    ),
  },
  "Rune-Scarred Demon": {
    abilities: [triggered(when.entersSelf, [fx.search({})], { label: "cherche une carte" })],
  },
  "Stromkirk Bloodthief": {
    abilities: [
      triggered(when.yourEndStep, [fx.addCounters(ref.target(), 1)], {
        targets: [target.creature("t", { controller: "you", subtype: "Vampire" })],
        condition: cond.opponentLostLife,
        label: "marqueur +1/+1 sur un Vampire",
      }),
    ],
  },
  Zombify: { spell: spell([target.cardInGraveyard("t", { types: ["Creature"] })], [fx.toBattlefield(ref.target())]) },
};
