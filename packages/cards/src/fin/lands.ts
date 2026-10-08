/** Final Fantasy — lands (Towns), Adventure Towns included. */
import type { CardScript, ManaType } from "@mtgx/engine";
import {
  activated,
  amount,
  cond,
  entersWith,
  fx,
  HERO,
  manaAbility,
  ref,
  spell,
  TREASURE,
  target,
  triggered,
  when,
  wizard,
} from "./common";

/** Two-color Town that enters tapped. */
const tappedTown = (...colors: ManaType[]): CardScript => ({ abilities: [entersWith({ tapped: true }), manaAbility(colors)] });

export const LANDS: Record<string, CardScript> = {
  "Adventurer's Inn": { abilities: [triggered(when.entersSelf, [fx.gainLife(2)], { label: "+2 life" }), manaAbility("C")] },
  "Baron, Airship Kingdom": tappedTown("U", "R"),
  "Capital City": {
    abilities: [
      manaAbility("C"),
      activated({ mana: "{1}", tap: true, effects: [fx.addManaChoice(1)], label: "One mana of any color" }),
    ],
  },
  "Crossroads Village": {
    asEnters: [fx.chooseForSelf("color")],
    abilities: [entersWith({ tapped: true }), manaAbility(["W"], 1, { produceChosen: true })],
  },
  "Eden, Seat of the Sanctum": {
    abilities: [
      manaAbility("C"),
      activated({
        mana: "{5}",
        tap: true,
        effects: [
          fx.mill(2),
          fx.may(
            "Sacrifice this land to return a permanent card?",
            fx.sacrificeIt(ref.self),
            fx.reflexive(
              // "another card": not Eden itself, sacrificed just before.
              [target.cardInGraveyard("t", { permanent: true, other: true }, "you", "other permanent card")],
              [fx.toHand(ref.target())],
            ),
          ),
        ],
        label: "Mill two cards",
      }),
    ],
  },
  "Gohn, Town of Ruin": tappedTown("B", "G"),
  "The Gold Saucer": {
    abilities: [
      manaAbility("C"),
      activated({
        mana: "{2}",
        tap: true,
        effects: [fx.coinFlip("won"), fx.when(cond.v("won"), fx.createTokens(TREASURE))],
        label: "Flip a coin: Treasure",
      }),
      activated({
        mana: "{3}",
        tap: true,
        sacrificeOther: { filter: { types: ["Artifact"] }, count: 2 },
        effects: [fx.draw(1)],
        label: "Draw",
      }),
    ],
  },
  "Gongaga, Reactor Town": tappedTown("R", "G"),
  "Guadosalam, Farplane Gateway": tappedTown("G", "U"),
  "Insomnia, Crown City": tappedTown("W", "B"),
  "Rabanastre, Royal City": tappedTown("R", "W"),
  "Sharlayan, Nation of Scholars": tappedTown("W", "U"),
  "Starting Town": {
    abilities: [
      entersWith({ tapped: true, condition: cond.not(cond.all(cond.yourTurn, cond.not(cond.turnsTakenAtLeast(4)))) }),
      manaAbility("C"),
      activated({
        tap: true,
        payLife: 1,
        effects: [fx.addManaChoice(1)],
        label: "Pay 1 life: one mana of any color",
      }),
    ],
  },
  "Treno, Dark City": tappedTown("U", "B"),
  "Vector, Imperial Capital": tappedTown("B", "R"),
  "Windurst, Federation Center": tappedTown("G", "W"),
  // Adventure Towns: the land face and the Adventure face.
  "Ishgard, the Holy See": tappedTown("W"),
  "Faith & Grief": {
    spell: spell(
      [
        target.upTo(
          2,
          target.cardInGraveyard(
            "t",
            { anyOf: [{ types: ["Artifact"] }, { types: ["Enchantment"] }] },
            "you",
            "artifact or enchantment card",
          ),
        ),
      ],
      [fx.toHand(ref.target())],
    ),
  },
  "Jidoor, Aristocratic Capital": tappedTown("U"),
  Overture: { spell: spell([target.player("t", "opponent")], [fx.millHalf(ref.target())]) },
  "Lindblum, Industrial Regency": tappedTown("R"),
  "Mage Siege": { spell: spell([], [wizard()]) },
  "Midgar, City of Mako": tappedTown("B"),
  "Reactor Raid": {
    spell: spell(
      [],
      [
        fx.sacrifice(ref.you, { anyOf: [{ types: ["Artifact"] }, { types: ["Creature"] }] }, 1, { optional: true, store: "s" }),
        fx.when(cond.v("s"), fx.draw(2)),
      ],
    ),
  },
  "Zanarkand, Ancient Metropolis": tappedTown("G"),
  "Lasting Fayth": {
    spell: spell(
      [],
      [
        fx.createTokens(HERO, 1, undefined, "h"),
        fx.addCounters(ref.stored("h"), amount.count({ types: ["Land"], controller: "you" })),
      ],
    ),
  },
};
