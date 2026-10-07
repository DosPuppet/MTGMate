/** Secrets of Strixhaven — cartes incolores et terrains. */
import type { ManaType } from "@mtgx/engine";
import {
  activated,
  amount,
  BASIC_LAND,
  type CardScript,
  cmp,
  cond,
  entersWith,
  fx,
  INSTANT_SORCERY,
  manaAbility,
  mode,
  ref,
  target,
  triggered,
  triggeredModal,
  when,
} from "./common";

/** Terrains de l'extension : « arrive engagé ; {T} : ajoutez {X} ou {Y} ; {2}{X}{Y}, {T} : surveillance 1 ». */
const surveilLand = (a: ManaType, b: ManaType): CardScript => ({
  abilities: [
    entersWith({ tapped: true, label: "Arrive engagé" }),
    manaAbility([a, b]),
    activated({ mana: `{2}{${a}}{${b}}`, tap: true, effects: [fx.surveil(1)], label: "Surveillance 1" }),
  ],
});

/** « Arrive engagé, sauf si vous contrôlez deux autres terrains ou plus ; {T} : ajoutez {X} ou {Y} ». */
const slowLand = (a: ManaType, b: ManaType): CardScript => ({
  abilities: [
    entersWith({
      tapped: true,
      condition: cond.not(cond.controls({ types: ["Land"], other: true }, 2)),
      label: "Engagé, sauf avec deux autres terrains ou plus",
    }),
    manaAbility([a, b]),
  ],
});

export const ARTIFACTS: Record<string, CardScript> = {
  // --- Créatures Avatar (convergence) ---------------------------------------
  "The Dawning Archaic": {
    // Portée : lue dans le texte.
    costReduction: { generic: amount.countIn("graveyard", INSTANT_SORCERY) },
    abilities: [
      triggered(when.attacksSelf, [fx.castNow(ref.target(), { free: true, after: "exile" })], {
        targets: [target.cardInGraveyard("t", INSTANT_SORCERY, "you", "carte d'éphémère ou de rituel de votre cimetière")],
        label: "Lancez gratuitement un éphémère ou un rituel de votre cimetière",
      }),
    ],
  },
  "Rancorous Archaic": {
    abilities: [
      entersWith({ counters: amount.colorsSpent, label: "Convergence : un marqueur +1/+1 par couleur de mana dépensée" }),
    ],
  },
  "Sundering Archaic": {
    abilities: [
      triggered(when.entersSelf, [fx.exile(ref.target())], {
        targets: [
          target.nonland(
            "t",
            { controller: "opponent", compare: [cmp.manaValue("<=", amount.colorsSpent)] },
            "permanent non-terrain adverse de VM au plus le nombre de couleurs dépensées",
          ),
        ],
        label: "Convergence : exile un permanent non-terrain adverse de VM au plus le nombre de couleurs dépensées",
      }),
      activated({
        mana: "{2}",
        targets: [target.cardInGraveyard("t", {}, "any")],
        effects: [fx.moveTo(ref.target(), { to: "libraryBottom" })],
        label: "Met une carte d'un cimetière au-dessous de la bibliothèque de son propriétaire",
      }),
    ],
  },
  "Transcendent Archaic": {
    // Vigilance : lue dans le texte.
    abilities: [
      triggered(
        when.entersSelf,
        fx.may(
          "Piocher une carte par couleur de mana dépensée, puis défausser deux cartes ?",
          fx.draw(amount.colorsSpent),
          fx.when(cond.amountAtLeast(amount.colorsSpent, 1), fx.discard(2)),
        ),
        { label: "Convergence : piochez X cartes, puis défaussez-en deux" },
      ),
    ],
  },

  // --- Artefacts --------------------------------------------------------------
  "Biblioplex Tomekeeper": {
    // « Choisissez jusqu'à un » : chaque mode a une cible facultative (aucune cible = aucun effet).
    abilities: [
      triggeredModal(when.entersSelf, [
        mode("Une créature ciblée devient préparée", [target.optional(target.creature("t"))], [fx.prepare(ref.target())]),
        mode(
          "Une créature ciblée cesse d'être préparée",
          [target.optional(target.creature("t"))],
          [fx.prepare(ref.target(), false)],
        ),
      ]),
    ],
  },
  "Diary of Dreams": {
    abilities: [
      triggered(when.castSpell("you", INSTANT_SORCERY), [fx.counters(ref.self, "page", 1)], {
        label: "Un marqueur page",
      }),
      activated({
        mana: "{5}",
        tap: true,
        reduction: { generic: amount.countersOn(ref.self, "page") },
        effects: [fx.draw(1)],
        label: "Piochez une carte ({1} de moins par marqueur page)",
      }),
    ],
  },
  "Mage Tower Referee": {
    abilities: [
      triggered(when.castSpell("you", { multicolored: true }), [fx.addCounters(ref.self, 1)], {
        label: "Sort multicolore : un marqueur +1/+1",
      }),
    ],
  },
  "Page, Loose Leaf": {
    abilities: [
      manaAbility("C"),
      activated({
        discard: 1,
        discardFilter: { name: "Page, Loose Leaf" },
        effects: [fx.revealUntil(INSTANT_SORCERY)],
        label: "Grandeur : révélez jusqu'à un éphémère ou un rituel",
      }),
    ],
  },
  "Potioner's Trove": {
    abilities: [
      manaAbility(["W", "U", "B", "R", "G"]),
      activated({
        tap: true,
        activationCondition: cond.amountAtLeast(amount.instantSorceryCast, 1),
        effects: [fx.gainLife(2)],
        label: "Gagnez 2 PV (après un éphémère ou un rituel ce tour-ci)",
      }),
    ],
  },
  "Strixhaven Skycoach": {
    // Vol et Équipage 2 : lus dans le texte.
    abilities: [
      triggered(when.entersSelf, fx.may("Chercher une carte de terrain de base ?", fx.search(BASIC_LAND, { to: "hand" })), {
        label: "Cherchez un terrain de base",
      }),
    ],
  },

  // --- Terrains ---------------------------------------------------------------
  "Dreamroot Cascade": slowLand("G", "U"),
  "Fields of Strife": surveilLand("R", "W"),
  "Forum of Amity": surveilLand("W", "B"),
  "Paradox Gardens": surveilLand("G", "U"),
  "Skycoach Waypoint": {
    abilities: [
      manaAbility("C"),
      // « Only creatures with prepare spells can become prepared » : `fx.prepare` ignore les autres.
      activated({
        mana: "{3}",
        tap: true,
        targets: [target.creature("t")],
        effects: [fx.prepare(ref.target())],
        label: "Une créature ciblée devient préparée",
      }),
    ],
  },
  "Spectacle Summit": surveilLand("U", "R"),
  "Terramorphic Expanse": {
    abilities: [
      activated({
        tap: true,
        sacrifice: true,
        effects: [fx.search(BASIC_LAND, { to: "battlefield", tapped: true })],
        label: "Chercher un terrain de base",
      }),
    ],
  },
  "Titan's Grave": surveilLand("B", "G"),
};
