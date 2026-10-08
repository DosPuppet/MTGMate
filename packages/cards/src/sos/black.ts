/** Secrets of Strixhaven — black cards. */
import type { ObjectFilter } from "@mtgx/engine";
import {
  activated,
  amount,
  type CardScript,
  cond,
  entersWith,
  fx,
  INFUSION,
  INKLING,
  INSTANT_SORCERY,
  PEST,
  REPARTEE,
  ref,
  spell,
  staticAbility,
  target,
  triggered,
  when,
} from "./common";

const CREATURE: ObjectFilter = { types: ["Creature"] };

export const BLACK: Record<string, CardScript> = {
  "Adventurous Eater": {
    // Have a Bite.
    prepareSpell: spell([target.creature()], [fx.addCounters(ref.target(), 1), fx.gainLife(1)]),
    abilities: [entersWith({ prepared: true })],
  },
  "Arcane Omens": {
    // Converge: X = colors of mana spent.
    spell: spell([target.player()], [fx.discard(amount.colorsSpent, ref.target())]),
  },
  "Arnyn, Deathbloom Botanist": {
    abilities: [
      triggered(
        when.dies({ types: ["Creature"], controller: "you", anyOf: [{ maxPower: 1 }, { maxToughness: 1 }] }),
        [fx.loseLife(2, ref.target()), fx.gainLife(2)],
        {
          targets: [target.player("t", "opponent")],
          label: "A small creature dies: an opponent loses 2 life, you gain 2 life",
        },
      ),
    ],
  },
  "Burrog Banemaker": {
    abilities: [activated({ mana: "{1}{B}", effects: [fx.pump(ref.self, 1, 1)], label: "+1/+1 until end of turn" })],
  },
  "Cheerful Osteomancer": {
    // Raise Dead.
    prepareSpell: spell(
      [target.cardInGraveyard("t", CREATURE, "you", "creature card from your graveyard")],
      [fx.toHand(ref.target())],
    ),
    abilities: [entersWith({ prepared: true })],
  },
  "Cost of Brilliance": {
    spell: spell(
      [target.player("p"), target.upTo(1, target.creature("c"))],
      [fx.draw(2, ref.target("p")), fx.loseLife(2, ref.target("p")), fx.addCounters(ref.target("c"), 1)],
    ),
  },
  "Emeritus of Woe": {
    // Demonic Tutor.
    prepareSpell: spell([], [fx.search({}, { to: "hand" })]),
    abilities: [
      entersWith({ prepared: true }),
      triggered(when.yourEndStep, [fx.prepare(ref.self)], {
        condition: cond.creaturesDied(2),
        label: "Two creatures died this turn: becomes prepared",
      }),
    ],
  },
  "End of the Hunt": {
    // The opponent chooses among their creatures and planeswalkers with the greatest mana value, and exiles it.
    spell: spell(
      [target.player("t", "opponent")],
      [fx.sacrifice(ref.target(), { types: ["Creature", "Planeswalker"] }, 1, { greatestManaValue: true, to: "exile" })],
    ),
  },
  "Eternal Student": {
    abilities: [
      activated({
        mana: "{1}{B}",
        fromGraveyard: true,
        exileSelf: true,
        effects: [fx.createTokens(INKLING, 2)],
        label: "Two 1/1 flying Inklings",
      }),
    ],
  },
  "Foolish Fate": {
    // The life loss is applied before the destruction: nothing happens in between during resolution, and the
    // controller is thus read on the battlefield (they lose the life even if the creature isn't destroyed, as the Oracle says).
    spell: spell(
      [target.creature()],
      [...fx.when(INFUSION, fx.loseLife(3, ref.controllerOf(ref.target()))), fx.destroy(ref.target())],
    ),
  },
  "Forum Necroscribe": {
    // Ward (discard a card): read from the text.
    abilities: [
      triggered(REPARTEE, [fx.toBattlefield(ref.target())], {
        targets: [target.cardInGraveyard("t", CREATURE, "you", "creature card from your graveyard")],
        label: "Repartee: returns a creature from your graveyard to the battlefield",
      }),
    ],
  },
  "Grave Researcher": {
    // Reanimate: the life loss is read before the move (the card becomes a new object as it enters).
    prepareSpell: spell(
      [target.cardInGraveyard("t", CREATURE, "any", "creature card from a graveyard")],
      [fx.loseLife(amount.manaValueOf(ref.target())), fx.toBattlefield(ref.target(), { underYourControl: true })],
    ),
    abilities: [
      triggered(
        when.yourUpkeep,
        [fx.surveil(1), ...fx.when(cond.amountAtLeast(amount.countIn("graveyard", CREATURE), 3), fx.prepare(ref.self))],
        { label: "Surveil 1; three creature cards in the graveyard: becomes prepared" },
      ),
    ],
  },
  "Lecturing Scornmage": {
    abilities: [triggered(REPARTEE, [fx.addCounters(ref.self, 1)], { label: "Repartee: a +1/+1 counter" })],
  },
  "Leech Collector": {
    // Bloodletting.
    prepareSpell: spell([], [fx.loseLife(2, ref.eachOpponent)]),
    abilities: [
      triggered(when.gainLifeFirst, [fx.prepare(ref.self)], {
        label: "First life gained this turn: becomes prepared",
      }),
    ],
  },
  "Masterful Flourish": {
    spell: spell([target.creature("t", { controller: "you" })], [fx.pump(ref.target(), 1, 0, ["indestructible"])]),
  },
  "Melancholic Poet": {
    abilities: [triggered(REPARTEE, fx.drain(1), { label: "Repartee: each opponent loses 1 life, you gain 1 life" })],
  },
  "Poisoner's Apprentice": {
    abilities: [
      triggered(when.entersSelf, fx.when(INFUSION, fx.pump(ref.target(), -4, -4)), {
        targets: [target.creature("t", { controller: "opponent" })],
        label: "Infusion: an opponent's creature gets -4/-4",
      }),
    ],
  },
  "Postmortem Professor": {
    keywords: ["cantBlock"],
    abilities: [
      triggered(when.attacksSelf, fx.drain(1), { label: "Each opponent loses 1 life, you gain 1 life" }),
      activated({
        mana: "{1}{B}",
        fromGraveyard: true,
        exileFromGraveyard: { filter: INSTANT_SORCERY },
        effects: [fx.toBattlefield(ref.self)],
        label: "Returns from the graveyard to the battlefield",
      }),
    ],
  },
  "Pull from the Grave": {
    spell: spell(
      [target.upTo(2, target.cardInGraveyard("t", CREATURE, "you", "creature card from your graveyard"))],
      [fx.toHand(ref.target()), fx.gainLife(2)],
    ),
  },
  "Rabid Attack": {
    spell: spell(
      [target.upTo(99, target.creature("t", { controller: "you" }))],
      [
        fx.modify(ref.target(), {
          power: 1,
          addAbilities: [triggered(when.diesSelf, [fx.draw(1)], { label: "Draw a card" })],
        }),
      ],
    ),
  },
  "Scathing Shadelock": {
    // Venomous Words.
    prepareSpell: spell([target.creature("t", { controller: "you" })], [fx.pump(ref.target(), 2, 0, ["deathtouch"])]),
    abilities: [
      triggered(when.step("main1", "you"), [fx.prepare(ref.self)], {
        label: "First main phase: becomes prepared",
      }),
    ],
  },
  "Scheming Silvertongue": {
    // Sign in Blood.
    prepareSpell: spell([target.player()], [fx.draw(2, ref.target()), fx.loseLife(2, ref.target())]),
    abilities: [
      triggered(when.secondMain, [fx.prepare(ref.self)], {
        condition: cond.lifeGainedAtLeast(2),
        label: "Two or more life gained this turn: becomes prepared",
      }),
    ],
  },
  "Send in the Pest": {
    spell: spell([], [fx.discard(1, ref.eachOpponent), fx.createTokens(PEST)]),
  },
  "Sneering Shadewriter": {
    abilities: [triggered(when.entersSelf, fx.drain(2), { label: "Each opponent loses 2 life, you gain 2 life" })],
  },
  "Tragedy Feaster": {
    // Ward (discard a card): read from the text.
    abilities: [
      triggered(when.yourEndStep, fx.when(cond.not(INFUSION), fx.sacrifice(ref.you, {}, 1)), {
        label: "Infusion: sacrifice a permanent unless you gained life",
      }),
    ],
  },
  "Ulna Alley Shopkeep": {
    abilities: [staticAbility("self", { power: 2 }, { condition: INFUSION, label: "Infusion: +2/+0" })],
  },
  "Wander Off": {
    spell: spell([target.creature()], [fx.exile(ref.target())]),
  },
  "Withering Curse": {
    spell: spell(
      [],
      [...fx.when(cond.not(INFUSION), fx.pumpAll(CREATURE, -2, -2)), ...fx.when(INFUSION, fx.destroyAll(CREATURE))],
    ),
  },
  "Pox Plague": {
    spell: spell(
      [],
      [
        fx.loseHalfLife(ref.eachPlayer),
        fx.discard(0, ref.eachPlayer, { half: true }),
        fx.sacrifice(ref.eachPlayer, { permanent: true }, 0, { half: true }),
      ],
    ),
  },
};
