/** Wilds of Eldraine — legendary cards and unique cards. */
import type { TargetSpec, TokenSpec } from "@mtgx/engine";
import {
  activated,
  amount,
  type CardScript,
  cond,
  costReducer,
  eventReplacement,
  fx,
  INSTANT_SORCERY,
  loyalty,
  oneOrMore,
  playerStatic,
  ref,
  spell,
  staticAbility,
  target,
  triggered,
  triggeredModal,
  when,
} from "./common";

/** Ashiok's Nightmare: 1/1 black, "at the beginning of combat on your turn, if a card was exiled this turn, a +1/+1 counter". */
const NIGHTMARE: TokenSpec = {
  name: "Nightmare",
  colors: ["B"],
  types: ["Creature"],
  subtypes: ["Nightmare"],
  power: 1,
  toughness: 1,
  abilities: [
    triggered(when.yourCombat, [fx.addCounters(ref.self, 1)], {
      condition: cond.amountAtLeast(amount.turnEvents({ event: "zone", to: "exile" }), 1),
      label: "A card exiled this turn: a +1/+1 counter",
    }),
  ],
  text: "At the beginning of combat on your turn, if a card was put into exile this turn, put a +1/+1 counter on this token.",
};

/** "card [you own / you don't own] in exile that has an Adventure" (Sentinel of Lost Lore). */
const exiledAdventure = (id: string, own: boolean, label: string): TargetSpec => ({
  id,
  label,
  filter: { exiled: { filter: { adventure: true }, own } },
});

export const LEGENDS: Record<string, CardScript> = {
  "Ashiok, Wicked Manipulator": {
    abilities: [
      eventReplacement({
        event: "payLife",
        to: "you",
        modify: {},
        instead: { exileFromLibrary: true },
        label: "Pay life: exile that many cards from the top of your library instead",
      }),
      loyalty(1, {
        effects: [fx.lookAtTop(2, { count: 1, exact: true, to: { to: "exile" }, rest: "hand" })],
        label: "Look at two cards: exile one, the other to hand",
      }),
      loyalty(-2, { effects: [fx.createTokens(NIGHTMARE, 2)], label: "Two 1/1 Nightmares" }),
      loyalty(-7, {
        targets: [target.player()],
        effects: [fx.exileTop(ref.target(), amount.totalManaValue({}, "exile"), "x")],
        label: "Target player exiles X cards (total MV of your exiled cards)",
      }),
    ],
  },
  "Talion, the Kindly Lord": {
    asEnters: [fx.chooseForSelf("number")],
    abilities: [
      triggered(when.castSpell("opponent", { numberChosen: true }), [fx.loseLife(2, ref.eventPlayer), fx.draw(1)], {
        label: "Opponent's spell of the chosen number: they lose 2 life, you draw",
      }),
    ],
  },
  "Sentinel of Lost Lore": {
    abilities: [
      // "Choose one or more —": every combination of modes (700.2).
      triggeredModal(
        when.entersSelf,
        oneOrMore(
          {
            label: "Return an Adventure card you own in exile",
            targets: [exiledAdventure("a", true, "Adventure card you own in exile")],
            effects: [fx.moveTo(ref.target("a"), { to: "hand" })],
          },
          {
            label: "Put an Adventure card in exile you don't own on the bottom of its library",
            targets: [exiledAdventure("b", false, "Adventure card you don't own in exile")],
            effects: [fx.moveTo(ref.target("b"), { to: "libraryBottom" })],
          },
          {
            label: "Exile target player's graveyard",
            targets: [target.player("p")],
            effects: [fx.moveAll("graveyard", ref.target("p"), {}, { to: "exile" })],
          },
        ),
        { label: "One or more: return, put on the bottom of the library, exile a graveyard" },
      ),
    ],
  },
  "Johann, Apprentice Sorcerer": {
    abilities: [
      playerStatic({ lookAt: "libraryTop", label: "Look at the top card" }),
      playerStatic({
        playFrom: { zone: "libraryTop", filter: INSTANT_SORCERY, what: "spells", oncePerTurn: true },
        label: "Once each turn: instant or sorcery from the top of your library",
      }),
    ],
  },
  "Agatha of the Vile Cauldron": {
    abilities: [
      playerStatic({
        abilityCost: {
          source: { types: ["Creature"], controller: "you" },
          reduce: amount.powerOf(ref.self),
          minOneMana: true,
        },
        label: "Activated abilities of your creatures: {X} less (X = its power, at least one mana)",
      }),
      activated({
        mana: "{4}{R}{G}",
        effects: [fx.pumpAll({ types: ["Creature"], controller: "you", other: true }, 1, 1, ["trample", "haste"])],
        label: "Your other creatures: +1/+1, trample and haste",
      }),
    ],
  },
  "Agatha's Soul Cauldron": {
    abilities: [
      playerStatic({
        abilityCost: { source: { types: ["Creature"], controller: "you" }, anyMana: true },
        label: "Mana of any color for the abilities of your creatures",
      }),
      staticAbility(
        { types: ["Creature"], controller: "you", withCounter: "+1/+1" },
        { gainLinkedActivated: true },
        { label: "Your creatures with a +1/+1 counter: activated abilities of the exiled creature cards" },
      ),
      activated({
        tap: true,
        targets: [target.cardInGraveyard("t", {}, "any")],
        effects: [
          fx.exileCard(ref.target(), { name: "e" }),
          fx.when(
            cond.refMatches(ref.stored("e"), { types: ["Creature"] }),
            fx.link(ref.stored("e")),
            fx.reflexive([target.creature("c", { controller: "you" })], [fx.addCounters(ref.target("c"), 1)]),
          ),
        ],
        label: "Exile a card from a graveyard",
      }),
    ],
  },
  "Beluna Grandsquall": {
    abilities: [costReducer({ permanent: true, adventure: true }, 1, "Permanent spells with an Adventure: {1} less")],
  },
  "Seek Thrills": {
    spell: spell(
      [],
      [fx.mill(7, ref.you, { name: "m" }), fx.moveTo(ref.filtered(ref.stored("m"), { adventure: true }), { to: "hand" })],
    ),
  },
};
