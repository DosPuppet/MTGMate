/**
 * Marvel's Spider-Man — black cards (lot A). Flash, menace, deathtouch, lifelink, flying, trample, haste,
 * indestructible and Mayhem are read from the text.
 */
import {
  activated,
  amount,
  type CardScript,
  chapter,
  cond,
  costReducer,
  entersWith,
  fx,
  ref,
  spell,
  TREASURE,
  target,
  triggered,
  when,
} from "./common";

const VILLAIN_CARD = target.cardInGraveyard("t", { subtype: "Villain" }, "you", "Villain card in your graveyard");

export const BLACK: Record<string, CardScript> = {
  "Agent Venom": {
    abilities: [
      triggered(when.dies({ types: ["Creature"], controller: "you", other: true, token: false }), [fx.draw(1), fx.loseLife(1)], {
        label: "Draw a card and lose 1 life",
      }),
    ],
  },
  "Common Crook": {
    abilities: [triggered(when.diesSelf, [fx.createTokens(TREASURE)], { label: "A Treasure token" })],
  },
  "The Death of Gwen Stacy": {
    abilities: [
      chapter([1], [fx.destroy(ref.target())], { targets: [target.creature()], label: "I — Destroys a creature" }),
      // "Each player may discard a card. Each player who doesn't loses 3 life."
      chapter([2], [fx.punisher(ref.eachPlayer, 3, { discard: true })], {
        label: "II — Each player discards a card or loses 3 life",
      }),
      chapter([3], [fx.moveAll("graveyard", ref.target("p"), {}, { to: "exile" })], {
        targets: [target.upTo(4, target.player("p"))],
        label: "III — Exiles the graveyards of the target players",
      }),
    ],
  },
  "Eddie Brock": {
    abilities: [
      triggered(when.entersSelf, [fx.toBattlefield(ref.target())], {
        targets: [
          target.cardInGraveyard("t", { types: ["Creature"], maxManaValue: 1 }, "you", "creature card with mana value 1 or less"),
        ],
        label: "Returns a creature with mana value 1 or less from your graveyard",
      }),
      activated({ mana: "{3}{B}{R}{G}", sorcerySpeed: true, effects: [fx.transform(ref.self)], label: "Transform it" }),
    ],
  },
  "Venom, Lethal Protector": {
    abilities: [
      triggered(
        when.attacksSelf,
        [
          fx.sacrifice(ref.you, { types: ["Creature"], other: true }, 1, { optional: true, store: "s" }),
          // X: the mana value of the sacrificed creature (last known information).
          ...fx.when(
            cond.v("s"),
            fx.draw(amount.manaValueOf(ref.stored("s"))),
            fx.pickFromZone(
              "hand",
              { permanent: true },
              { to: "battlefield" },
              {
                min: 0,
                maxManaValue: amount.manaValueOf(ref.stored("s")),
                prompt: "A permanent with mana value X or less from your hand",
              },
            ),
          ),
        ],
        { label: "Sacrifice another creature: draw X, then a permanent with mana value X or less from your hand" },
      ),
    ],
  },
  "Inner Demons Gangsters": {
    abilities: [
      activated({
        discard: 1,
        sorcerySpeed: true,
        effects: [fx.pump(ref.self, 1, 0, ["menace"])],
        label: "+1/+0 and menace until end of turn",
      }),
    ],
  },
  "Merciless Enforcers": {
    abilities: [activated({ mana: "{3}{B}", effects: [fx.damage(1, ref.eachOpponent)], label: "1 damage to each opponent" })],
  },
  "Morlun, Devourer of Spiders": {
    abilities: [
      entersWith({ counters: amount.x, label: "Enters with X +1/+1 counters" }),
      triggered(when.entersSelf, [fx.damage(amount.sourceX, ref.target())], {
        targets: [target.player("t", "opponent")],
        label: "X damage to an opponent",
      }),
    ],
  },
  "Parker Luck": {
    abilities: [
      triggered(
        when.yourEndStep,
        [
          // Each reveals their top card, loses life equal to the mana value of the other's, then puts it into their hand.
          fx.reveal(ref.libraryTop(ref.target("a"))),
          fx.reveal(ref.libraryTop(ref.target("b"))),
          fx.loseLife(amount.manaValueOf(ref.libraryTop(ref.target("b"))), ref.target("a")),
          fx.loseLife(amount.manaValueOf(ref.libraryTop(ref.target("a"))), ref.target("b")),
          fx.toHand(ref.libraryTop(ref.target("a"))),
          fx.toHand(ref.libraryTop(ref.target("b"))),
        ],
        {
          targets: [
            { ...target.player("a"), label: "first player" },
            { ...target.player("b"), label: "second player", otherThan: ["a"] },
          ],
          label: "Two players reveal their top card and lose life equal to the mana value of the other's",
        },
      ),
    ],
  },
  "Prison Break": {
    // Mayhem {3}{B}: read from the text.
    spell: spell(
      [target.cardInGraveyard("t", { types: ["Creature"] }, "you", "creature card in your graveyard")],
      [fx.toBattlefield(ref.target(), { counters: { kind: "+1/+1", n: 1 } })],
    ),
  },
  "Risky Research": { spell: spell([], [fx.surveil(2), fx.draw(2), fx.loseLife(2)]) },
  "Scorpion, Seething Striker": {
    abilities: [
      triggered(when.yourEndStep, [fx.connive(ref.target())], {
        condition: cond.morbid,
        targets: [target.creature("t", { controller: "you" })],
        label: "A creature died this turn: a creature you control connives",
      }),
    ],
  },
  "Scorpion's Sting": { spell: spell([target.creature()], [fx.pump(ref.target(), -3, -3)]) },
  "Spider-Man Noir": {
    abilities: [
      triggered(
        when.attacksAlone({ types: ["Creature"], controller: "you" }),
        [fx.addCounters(ref.eventObject, 1), fx.surveil(amount.countersOn(ref.eventObject, "any"))],
        { label: "+1/+1 counter on the lone attacker, then surveil X (its counters)" },
      ),
    ],
  },
  "The Spot's Portal": {
    spell: spell(
      [target.creature()],
      [
        fx.moveTo(ref.target(), { to: "libraryBottom" }),
        ...fx.when(cond.not(cond.controls({ subtype: "Villain" })), fx.loseLife(2)),
      ],
    ),
  },
  // Flash, flying, Mayhem {B}: read from the text.
  "Swarm, Being of Bees": {},
  "Tombstone, Career Criminal": {
    abilities: [
      triggered(when.entersSelf, [fx.toHand(ref.target())], {
        targets: [VILLAIN_CARD],
        label: "Returns a Villain from your graveyard to your hand",
      }),
      costReducer({ subtype: "Villain" }, 1, "Villain spells cost {1} less"),
    ],
  },
  "Venom, Evil Unleashed": {
    abilities: [
      activated({
        mana: "{2}{B}",
        fromGraveyard: true,
        exileSelf: true,
        sorcerySpeed: true,
        targets: [target.creature()],
        effects: [fx.addCounters(ref.target(), 2), fx.pump(ref.target(), 0, 0, ["deathtouch"])],
        label: "From the graveyard: two +1/+1 counters and deathtouch",
      }),
    ],
  },
  "Venomized Cat": {
    abilities: [triggered(when.entersSelf, [fx.mill(2)], { label: "Mill two cards" })],
  },
  "Venom's Hunger": {
    costReduction: { generic: 2, condition: cond.controls({ subtype: "Villain" }) },
    spell: spell([target.creature()], [fx.destroy(ref.target()), fx.gainLife(2)]),
  },
  "Villainous Wrath": {
    spell: spell(
      [target.player("t", "opponent")],
      [
        fx.loseLife(amount.refCount(ref.permanentsOf(ref.target(), { types: ["Creature"] })), ref.target()),
        fx.destroyAll({ types: ["Creature"] }),
      ],
    ),
  },
};
