/** Final Fantasy — multicolored cards. */
import type { CardScript, TokenSpec } from "@mtgx/engine";
import { activated, amount, cond, FOOD, fx, ref, target, triggered, when } from "./common";

const PERMANENT_CARD = { permanent: true };
const CREATURE_OR_ARTIFACT = { anyOf: [{ types: ["Creature" as const] }, { types: ["Artifact" as const] }] };

const ANGELO: TokenSpec = {
  name: "Angelo",
  colors: ["G", "W"],
  types: ["Creature"],
  subtypes: ["Dog"],
  power: 1,
  toughness: 1,
  legendary: true,
};
const DARKSTAR: TokenSpec = {
  name: "Darkstar",
  colors: ["W", "B"],
  types: ["Creature"],
  subtypes: ["Dog"],
  power: 2,
  toughness: 2,
  legendary: true,
};

export const MULTI: Record<string, CardScript> = {
  "Black Waltz No. 3": {
    abilities: [
      triggered(when.castSpell("you", { notTypes: ["Creature"] }), [fx.damage(2, ref.eachOpponent)], {
        label: "2 damage to each opponent",
      }),
    ],
  },
  "Cloud of Darkness": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.pump(
            ref.target(),
            amount.neg(amount.countIn("graveyard", PERMANENT_CARD)),
            amount.neg(amount.countIn("graveyard", PERMANENT_CARD)),
          ),
        ],
        { targets: [target.creature("t", { controller: "opponent" })], label: "-X/-X" },
      ),
    ],
  },
  "Giott, King of the Dwarves": {
    abilities: [
      triggered(
        when.enters({ anyOf: [{ types: ["Creature"], subtype: "Dwarf" }, { subtype: "Equipment" }], controller: "you" }),
        fx.may("Discard a card to draw?", fx.discard(1, ref.you, { store: "d" }), fx.when(cond.v("d"), fx.draw(1))),
        { label: "Discard, then draw" },
      ),
    ],
  },
  "Gladiolus Amicitia": {
    abilities: [
      triggered(when.entersSelf, [fx.search({ types: ["Land"] }, { to: "battlefield", tapped: true })], {
        label: "Search for a land",
      }),
      triggered(when.landfall, [fx.pump(ref.target(), 2, 2, ["trample"])], {
        targets: [target.creature("t", { controller: "you", other: true })],
        label: "+2/+2 and trample",
      }),
    ],
  },
  "Hope Estheim": {
    abilities: [
      triggered(when.yourEndStep, [fx.mill(amount.lifeGainedThisTurn, ref.eachOpponent)], {
        label: "Each opponent mills X cards",
      }),
    ],
  },
  "Ignis Scientia": {
    abilities: [
      triggered(
        when.entersSelf,
        [fx.lookAtTop(6, { filter: { types: ["Land"] }, count: 1, to: { to: "battlefield", tapped: true }, rest: "bottom" })],
        { label: "A land among the top six" },
      ),
      activated({
        mana: "{1}{G}{U}",
        tap: true,
        targets: [target.cardInGraveyard("t", {}, "any", "card")],
        // `exile` only handles permanents: a card in a graveyard goes through `exileCard`.
        effects: [
          fx.exileCard(ref.target(), { name: "c", filter: { types: ["Creature"] } }),
          fx.when(cond.v("c"), fx.createTokens(FOOD)),
        ],
        label: "Exile a card from a graveyard",
      }),
    ],
  },
  "Jenova, Ancient Calamity": {
    abilities: [
      triggered(
        when.yourCombat,
        [
          fx.addCounters(ref.target(), amount.powerOf(ref.self)),
          fx.modify(ref.target(), { addSubtypes: ["Mutant"] }, "permanent"),
        ],
        { targets: [target.upTo(1, target.creature("t", { other: true }))], label: "Counters, becomes a Mutant" },
      ),
      triggered(
        when.dies({ types: ["Creature"], subtype: "Mutant", controller: "you" }),
        [fx.draw(amount.powerOf(ref.eventObject))],
        {
          condition: cond.yourTurn,
          label: "Draw cards equal to its power",
        },
      ),
    ],
  },
  "Judge Magister Gabranth": {
    abilities: [
      triggered(when.dies({ ...CREATURE_OR_ARTIFACT, controller: "you", other: true }), [fx.addCounters(ref.self, 1)], {
        label: "+1/+1 counter",
      }),
    ],
  },
  "Locke Cole": { abilities: [triggered(when.combatDamageToPlayer, fx.loot(1), { label: "Draw, then discard" })] },
  "Rinoa Heartilly": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(ANGELO)], { label: "Angelo" }),
      triggered(
        when.attacksSelf,
        [
          fx.pump(
            ref.target(),
            amount.count({ types: ["Creature"], controller: "you" }),
            amount.count({ types: ["Creature"], controller: "you" }),
          ),
        ],
        { targets: [target.creature("t", { controller: "you", other: true })], label: "+1/+1 for each creature" },
      ),
    ],
  },
  "Rufus Shinra": {
    abilities: [
      triggered(when.attacksSelf, [fx.createTokens(DARKSTAR)], {
        condition: cond.not(cond.controls({ name: "Darkstar", types: ["Creature"] })),
        label: "Darkstar",
      }),
    ],
  },
  "Tidus, Blitzball Star": {
    abilities: [
      triggered(when.enters({ types: ["Artifact"], controller: "you" }), [fx.addCounters(ref.self, 1)], {
        label: "+1/+1 counter",
      }),
      triggered(when.attacksSelf, [fx.tap(ref.target())], {
        targets: [target.creature("t", { controller: "opponent" })],
        label: "Tap a creature",
      }),
    ],
  },
};
