/**
 * The Hobbit — cartes noires (lot A). Le vol, le contact mortel, la menace, l'équipement et « ne peut pas bloquer » (mot-clé
 * technique) sont lus dans le texte ou écrits ici ; amasser des Gobelins : `fx.amass`.
 */
import type { ObjectFilter } from "@mtgx/engine";
import {
  activated,
  amount,
  type CardScript,
  chapter,
  cond,
  cost,
  fx,
  modal,
  mode,
  ref,
  spell,
  staticAbility,
  target,
  triggered,
  when,
} from "./common";

/** « un artefact ou une créature » (coûts de sacrifice). */
const ARTIFACT_OR_CREATURE: ObjectFilter = { anyOf: [{ types: ["Artifact"] }, { types: ["Creature"] }] };
const CREATURE_CARD = target.cardInGraveyard("t", { types: ["Creature"] }, "you", "carte de créature de votre cimetière");

export const BLACK: Record<string, CardScript> = {
  "Along the Crooked Way": {
    abilities: [
      triggered(when.entersSelf, [fx.toHand(ref.target())], {
        targets: [CREATURE_CARD],
        label: "Une carte de créature de votre cimetière revient en main",
      }),
      triggered(
        when.zoneChange(["graveyard"], { filter: { types: ["Creature"] }, whose: "you" }),
        [fx.amass(ref.you, "Goblin", 1)],
        { label: "Une carte de créature quitte votre cimetière : amassez des Gobelins 1" },
      ),
      activated({
        mana: "{1}{B}",
        effects: [
          fx.modifyAll({ types: ["Creature"], anySubtype: ["Goblin", "Orc"], controller: "you" }, { addKeywords: ["menace"] }),
        ],
        label: "Vos Gobelins et vos Orques gagnent la menace",
      }),
    ],
  },
  "Bilbo's Deadly Slice": { spell: spell([target.creature()], [fx.destroy(ref.target())]) },
  "Crude Bent Blade": {
    // Équiper {2} : lu dans le texte.
    abilities: [
      triggered(when.entersSelf, [fx.sacrifice(ref.target(), { types: ["Creature"] })], {
        targets: [target.player("t", "opponent")],
        label: "Un adversaire sacrifie une créature",
      }),
      staticAbility("attached", { power: 2, toughness: 1 }, { label: "+2/+1" }),
    ],
  },
  "Down, Down to Goblin-town": {
    abilities: [
      chapter([1], [fx.discard(1, ref.target(), { chooser: "controller", filter: { notTypes: ["Land"] } })], {
        targets: [target.player("t", "opponent")],
        label: "Chapitre I — Un adversaire défausse la carte non-terrain de votre choix",
      }),
      chapter([2], [fx.amass(ref.you, "Goblin", 1)], { label: "Chapitre II — Amassez des Gobelins 1" }),
      chapter([3, 4], [fx.loseLife(1, ref.target()), fx.gainLife(1)], {
        targets: [target.player("t", "opponent")],
        label: "Chapitres III, IV — Un adversaire perd 1 PV, vous gagnez 1 PV",
      }),
    ],
  },
  "Dreaded Bat-Cloud": { costReduction: { generic: 3, condition: cond.morbid } },
  "Front Porch Sentries": {
    abilities: [
      triggered(when.diesSelf, [fx.pump(ref.target(), -1, -1)], {
        targets: [target.creature("t", { controller: "opponent" })],
        label: "Une créature adverse gagne -1/-1",
      }),
    ],
  },
  "Gathering of Darkness": {
    spell: spell([target.upTo(1, CREATURE_CARD)], [fx.toHand(ref.target()), fx.amass(ref.you, "Goblin", 3)]),
  },
  "Gnashing of Teeth": {
    spell: modal(
      mode(
        "Une créature gagne -5/-5 (exilée si elle meurt)",
        [target.creature("c")],
        [fx.exileIfDies(ref.target("c")), fx.pump(ref.target("c"), -5, -5)],
      ),
      mode(
        "Les créatures d'un joueur gagnent -1/-1",
        [target.player("p")],
        [fx.pump(ref.permanentsOf(ref.target("p"), { types: ["Creature"] }), -1, -1)],
      ),
    ),
  },
  // --- Gollum, Silent Slinker // Meager Meal : la menace est lue dans le texte. ---
  "Gollum, Silent Slinker": {},
  "Meager Meal": {
    spell: spell(
      [target.upTo(1, target.creature("c")), target.player("p")],
      [fx.addCounters(ref.target("c"), 1), fx.gainLife(2, ref.target("p"))],
    ),
  },
  "Gollum the Abandoned": {
    keywords: ["cantBlock"],
    abilities: [
      triggered(when.entersSelf, [fx.exileCard(ref.target()), fx.loseLife(2, ref.eachOpponent)], {
        targets: [target.upTo(1, target.cardInGraveyard("t", {}, "opponent", "carte du cimetière d'un adversaire"))],
        label: "Exilez une carte d'un cimetière adverse ; chaque adversaire perd 2 PV",
      }),
      activated({
        mana: "{2}",
        sacrificeOther: { filter: ARTIFACT_OR_CREATURE },
        fromGraveyard: true,
        sorcerySpeed: true,
        effects: [fx.toHand(ref.selfCard)],
        label: "Revient du cimetière en main",
      }),
    ],
  },
  "Great Fierce Bee": {
    abilities: [
      triggered(when.dies({ types: ["Creature"], other: true }), [fx.scry(1)], {
        batched: true,
        label: "Une ou plusieurs autres créatures meurent : regard 1",
      }),
    ],
  },
  // --- Great Ugly-Looking Goblin // Clap! Snap! ---
  "Great Ugly-Looking Goblin": {
    abilities: [
      staticAbility(
        { types: ["Creature"], controller: "you", withCounter: "+1/+1" },
        { addKeywords: ["menace"] },
        { label: "Vos créatures avec un marqueur +1/+1 ont la menace" },
      ),
    ],
  },
  "Clap! Snap!": { spell: spell([], [fx.amass(ref.you, "Goblin", 2)]) },
  "Rage into the Valley": {
    spell: spell([], [fx.draw(1), fx.loseLife(1), fx.amass(ref.you, "Goblin", 2)]),
  },
  "Ravening Warg": {
    abilities: [
      triggered(when.attacksSelf, [fx.gainLife(2)], {
        condition: cond.ferocious,
        label: "Férocité : vous gagnez 2 PV",
      }),
    ],
  },
  "Reverent Howl": {
    spell: modal(
      mode(
        "Un joueur pioche deux cartes et perd 2 PV",
        [target.player("p")],
        [fx.draw(2, ref.target("p")), fx.loseLife(2, ref.target("p"))],
      ),
      mode("Une créature gagne +2/+2 et le lien de vie", [target.creature("c")], [fx.pump(ref.target("c"), 2, 2, ["lifelink"])]),
    ),
  },
  "Rhovanion Rampager": {
    abilities: [
      triggered(
        when.attacksSelf,
        [
          fx.sacrifice(ref.you, { types: ["Creature"], other: true }, 1, { optional: true, store: "s" }),
          ...fx.when(cond.v("s"), fx.addCounters(ref.self, amount.powerOf(ref.stored("s")))),
        ],
        { label: "Sacrifice facultatif : des marqueurs +1/+1 égaux à sa force" },
      ),
      triggered(when.diesSelf, [fx.amass(ref.you, "Goblin", amount.lkiPower)], {
        label: "Amassez des Gobelins X (sa force)",
      }),
    ],
  },
  "Stir Up Trouble": {
    additionalCost: { sacrifice: { filter: ARTIFACT_OR_CREATURE, count: 1, orPay: cost("{4}") } },
    spell: spell([target.creature()], [fx.destroy(ref.target())]),
  },
  "Stony-Voiced Goblins": {
    abilities: [triggered(when.entersSelf, [fx.discard(1, ref.eachOpponent)], { label: "Chaque adversaire défausse une carte" })],
  },
};
