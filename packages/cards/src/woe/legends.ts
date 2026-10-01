/** Wilds of Eldraine — cartes légendaires et cartes uniques. */
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
  playerStatic,
  ref,
  spell,
  staticAbility,
  target,
  triggered,
  when,
} from "./common";

/** Cauchemar d'Ashiok : 1/1 noir, « au début du combat de votre tour, si une carte a été exilée ce tour-ci, un marqueur +1/+1 ». */
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
      label: "Une carte exilée ce tour-ci : un marqueur +1/+1",
    }),
  ],
  text: "At the beginning of combat on your turn, if a card was put into exile this turn, put a +1/+1 counter on this token.",
};

/** « carte [que vous possédez / que vous ne possédez pas] en exil qui a une Aventure » (Sentinel of Lost Lore). */
const exiledAdventure = (id: string, own: boolean, label: string): TargetSpec => ({
  id,
  label,
  count: 1,
  optional: true,
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
        label: "Payer des PV : exilez autant de cartes du dessus de votre bibliothèque à la place",
      }),
      loyalty(1, {
        effects: [fx.lookAtTop(2, { count: 1, exact: true, to: { to: "exile" }, rest: "hand" })],
        label: "Regardez deux cartes : exilez-en une, l'autre en main",
      }),
      loyalty(-2, { effects: [fx.createTokens(NIGHTMARE, 2)], label: "Deux Cauchemars 1/1" }),
      loyalty(-7, {
        targets: [target.player()],
        effects: [fx.exileTop(ref.target(), amount.totalManaValue({}, "exile"), "x")],
        label: "Le joueur ciblé exile X cartes (VM totale de vos cartes exilées)",
      }),
    ],
  },
  "Talion, the Kindly Lord": {
    chooseOnEnter: "number",
    abilities: [
      triggered(when.castSpell("opponent", { numberChosen: true }), [fx.loseLife(2, ref.eventPlayer), fx.draw(1)], {
        label: "Sort adverse du nombre choisi : il perd 2 PV, vous piochez",
      }),
    ],
  },
  "Sentinel of Lost Lore": {
    abilities: [
      // « Choisissez un ou plusieurs » : chaque mode est une cible facultative (approximation documentée).
      triggered(
        when.entersSelf,
        [
          fx.moveTo(ref.target("a"), { to: "hand" }),
          fx.moveTo(ref.target("b"), { to: "libraryBottom" }),
          fx.moveAll("graveyard", ref.target("p"), {}, { to: "exile" }),
        ],
        {
          targets: [
            exiledAdventure("a", true, "carte à Aventure que vous possédez en exil"),
            exiledAdventure("b", false, "carte à Aventure que vous ne possédez pas en exil"),
            { ...target.player("p"), count: 1, optional: true },
          ],
          label: "Un ou plusieurs : reprenez, renvoyez sous la bibliothèque, exilez un cimetière",
        },
      ),
    ],
  },
  "Johann, Apprentice Sorcerer": {
    abilities: [
      playerStatic({ lookAtTopCard: true, label: "Regardez la carte du dessus" }),
      playerStatic({
        playFrom: { zone: "libraryTop", filter: INSTANT_SORCERY, what: "spells", oncePerTurn: true },
        label: "Une fois par tour : éphémère ou rituel du dessus de votre bibliothèque",
      }),
    ],
  },
  "Agatha of the Vile Cauldron": {
    abilities: [
      playerStatic({
        abilityCost: {
          source: { types: ["Creature"], controller: "you" },
          reduceAmount: amount.powerOf(ref.self),
          minOneMana: true,
        },
        label: "Capacités activées de vos créatures : {X} de moins (X = sa force, au moins un mana)",
      }),
      activated({
        mana: "{4}{R}{G}",
        effects: [fx.pumpAll({ types: ["Creature"], controller: "you", other: true }, 1, 1, ["trample", "haste"])],
        label: "Vos autres créatures : +1/+1, piétinement et célérité",
      }),
    ],
  },
  "Agatha's Soul Cauldron": {
    abilities: [
      playerStatic({
        abilityCost: { source: { types: ["Creature"], controller: "you" }, anyMana: true },
        label: "Mana de n'importe quelle couleur pour les capacités de vos créatures",
      }),
      staticAbility(
        { types: ["Creature"], controller: "you", withCounter: "+1/+1" },
        { gainLinkedActivated: true },
        { label: "Vos créatures avec un marqueur +1/+1 : capacités activées des cartes de créature exilées" },
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
        label: "Exilez une carte d'un cimetière",
      }),
    ],
  },
  "Beluna Grandsquall": {
    abilities: [costReducer({ permanent: true, adventure: true }, 1, "Sorts de permanent avec une Aventure : {1} de moins")],
  },
  "Seek Thrills": {
    spell: spell(
      [],
      [fx.mill(7, ref.you, { name: "m" }), fx.moveTo(ref.filtered(ref.stored("m"), { adventure: true }), { to: "hand" })],
    ),
  },
};
