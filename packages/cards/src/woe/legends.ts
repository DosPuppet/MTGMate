/** Wilds of Eldraine — cartes légendaires et cartes uniques. */
import {
  activated,
  amount,
  type CardScript,
  cond,
  costReducer,
  fx,
  INSTANT_SORCERY,
  playerStatic,
  ref,
  spell,
  staticAbility,
  target,
} from "./common";

export const LEGENDS: Record<string, CardScript> = {
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
