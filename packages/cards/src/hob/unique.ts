/** The Hobbit — unique cards (lot C). */
import {
  activated,
  amount,
  type CardScript,
  FOOD,
  fx,
  ref,
  spell,
  staticAbility,
  TREASURE,
  target,
  triggered,
  when,
} from "./common";

export const UNIQUE: Record<string, CardScript> = {
  "Elrond, Moon-Reader": {
    abilities: [
      triggered({ on: "activateAbility", source: { types: ["Creature"] } }, [fx.draw(1)], {
        oncePerTurn: true,
        label: "You activate an ability of a creature: draw a card (once per turn)",
      }),
      activated({
        mana: "{5}{U}{U}",
        targets: [target.upTo(2, target.nonland("t", { controller: "you", other: true }, "other nonland permanent of yours"))],
        effects: [
          fx.exileCard(ref.target(), { name: "k" }),
          fx.delayed([fx.toBattlefield(ref.target("k"))], { k: ref.stored("k") }),
        ],
        label: "Exile up to two of your other nonland permanents; they return at the next end step",
      }),
    ],
  },
  "Master's Councillors": {
    // Vigilance: read from the text.
    abilities: [
      staticAbility(
        "self",
        { power: 2 },
        {
          perAmount: amount.graveyardsWithAtLeast(7),
          label: "+2/+0 for each graveyard with seven or more cards",
        },
      ),
      triggered(when.draw(2), [fx.mill(3, ref.target())], {
        targets: [target.player("t")],
        label: "Your second card drawn this turn: target player mills three cards",
      }),
    ],
  },
  "Thranduil's Decree": {
    spell: spell(
      [target.spell("t", {}, "spell")],
      [
        { op: "counter", what: ref.target(), exilePermanents: true, storeMoved: "d" },
        fx.grantPlay(ref.stored("d"), { free: true, forever: true }),
      ],
    ),
  },
  "Inside Information": {
    spell: spell(
      [target.player("t", "opponent")],
      [fx.exileTop(ref.target(), amount.x, "e"), fx.grantPlay(ref.stored("e"), { payLifeManaValue: true })],
    ),
  },
  "The Master of Lake-town": {
    // Deathtouch: read from the text.
    abilities: [
      triggered(when.loseLife("any"), [fx.mill(amount.eventAmount, ref.eventPlayer)], {
        label: "A player loses life: they mill that many cards",
      }),
      triggered(when.diesSelf, [fx.draw(amount.graveyardsWithAtLeast(7))], {
        label: "Draw a card for each graveyard with seven or more cards",
      }),
    ],
  },
  "Supper for Spiders": {
    spell: spell(
      [],
      [
        fx.moveAll(
          "graveyard",
          ref.eachOpponent,
          { types: ["Creature"], fromBattlefieldThisTurn: true },
          { to: "battlefield", underYourControl: true, setTypes: ["Artifact"], setSubtypes: ["Food"] },
          "f",
        ),
        fx.modify(ref.stored("f"), { addAbilities: FOOD.abilities }, "permanent"),
      ],
    ),
  },
  "Getaway Barrel": {
    abilities: [
      triggered(
        when.putIntoGraveyardSelf,
        [
          fx.lookAtTop(13, {
            filter: { types: ["Creature"] },
            count: 1,
            exact: true,
            random: true,
            to: { to: "battlefield" },
            rest: "bottom",
          }),
        ],
        { label: "Reveal the top thirteen cards: a random creature card onto the battlefield" },
      ),
    ],
  },
  "Dwalin, Weaponmaster": {
    // First strike: read from the text.
    abilities: [when.entersSelf, when.attacksSelf].map((trigger) =>
      triggered(trigger, [fx.addCountersAll({ subtype: "Equipment", controller: "you" }, 1, "hone")], {
        label: "A hone counter on each of your Equipment",
      }),
    ),
  },
  "Smaug, Wicked Worm": {
    // Flying: read from the text.
    abilities: [
      triggered(
        when.entersSelf,
        [fx.createTappedTokens(TREASURE, amount.count({ types: ["Artifact"], controller: "opponent" }))],
        {
          label: "A tapped Treasure for each opponent's artifact",
        },
      ),
      triggered({ on: "castSpell", by: "you", usingManaFrom: { subtype: "Treasure" } }, [fx.draw(1), fx.loseLife(1)], {
        label: "Spell paid with mana from a Treasure: draw a card and lose 1 life",
      }),
    ],
  },
  "Thranduil, the Elvenking": {
    abilities: [
      staticAbility(
        "self",
        { gainActivatedFromGraveyard: { subtype: "Elf" } },
        {
          label: "The activated abilities of Elf cards in your graveyard",
        },
      ),
      triggered(when.enters({ subtype: "Elf", legendary: true, controller: "you", other: true }), [fx.draw(2), fx.discard(1)], {
        label: "Another legendary Elf enters: draw two cards, then discard one",
      }),
    ],
  },
  "Key to the Side-Door": {
    abilities: [
      activated({
        mana: "{2}",
        tap: true,
        targets: [target.creature()],
        effects: [fx.pump(ref.target(), 0, 0, ["unblockable"])],
        label: "A creature can't be blocked this turn",
      }),
      activated({
        mana: "{1}",
        tap: true,
        discard: 1,
        discardFilter: { legendary: true, sameNameAs: { legendary: true, controller: "you" } },
        effects: [fx.draw(2)],
        label: "Discard a legendary card with the same name as one of your legends: draw two cards",
      }),
    ],
  },
};
