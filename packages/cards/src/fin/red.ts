/** Final Fantasy — cartes rouges. */
import type { CardScript } from "@mtgx/engine";
import {
  activated,
  amount,
  chocobo,
  cond,
  fx,
  jobGear,
  manaAbility,
  modal,
  mode,
  ref,
  spell,
  staticAbility,
  TREASURE,
  target,
  targetObj,
  tiered,
  triggered,
  when,
  wizard,
} from "./common";

export const RED: Record<string, CardScript> = {
  "Blazing Bomb": {
    abilities: [
      triggered(when.castNoncreatureWithMana(4), [fx.addCounters(ref.self, 1)], { label: "Marqueur +1/+1" }),
      activated({
        tap: true,
        sacrifice: true,
        sorcerySpeed: true,
        targets: [target.creature("t")],
        effects: [fx.damage(amount.powerOf(ref.self), ref.target())],
        label: "Blessures égales à sa force",
      }),
    ],
  },
  "Call the Mountain Chocobo": {
    flashback: "{5}{R}",
    spell: spell([], [fx.search({ types: ["Land"], subtype: "Mountain" }), chocobo()]),
  },
  "Choco-Comet": { spell: spell([target.any("t")], [fx.damage(amount.x, ref.target()), chocobo()]) },
  "Coral Sword": {
    abilities: [
      triggered(when.entersSelf, [fx.attach(ref.target()), fx.pump(ref.target(), 0, 0, ["firstStrike"])], {
        targets: [target.creature("t", { controller: "you" })],
        label: "Attachez, initiative",
      }),
      staticAbility("attached", { power: 1 }, { label: "+1/+0" }),
    ],
  },
  "Fire Magic": {
    spell: tiered(
      { cost: "{0}", label: "Feu (1 blessure)", effects: [fx.damageAll(1, { types: ["Creature"] })] },
      { cost: "{2}", label: "Extra Feu (2 blessures)", effects: [fx.damageAll(2, { types: ["Creature"] })] },
      { cost: "{5}", label: "Méga Feu (3 blessures)", effects: [fx.damageAll(3, { types: ["Creature"] })] },
    ),
  },
  "Freya Crescent": {
    abilities: [
      staticAbility("self", { addKeywords: ["flying"] }, { condition: cond.yourTurn, label: "Saut : vol pendant votre tour" }),
      // Approximation : le mana sert à toute capacité d'un Équipement (et pas seulement à Équiper).
      manaAbility("R", 1, { restriction: { spell: { subtype: "Equipment" }, abilityOfSource: { subtype: "Equipment" } } }),
    ],
  },
  "Haste Magic": {
    spell: spell([target.creature("t")], [fx.pump(ref.target(), 3, 1, ["haste"]), fx.impulse(1, "yourNextEndStep")]),
  },
  "Laughing Mad": { additionalCost: { discard: 1 }, flashback: "{3}{R}", spell: spell([], [fx.draw(2)]) },
  "Light of Judgment": {
    spell: spell(
      [
        target.creature("c"),
        { ...target.upTo(1, targetObj("e", { subtype: "Equipment" }, "Équipement attaché")), attachedToTarget: "c" },
      ],
      [fx.damage(6, ref.target("c")), fx.destroy(ref.target("e"))],
    ),
  },
  "Mysidian Elder": { abilities: [triggered(when.entersSelf, [wizard()], { label: "Sorcier 0/1" })] },
  "Opera Love Song": {
    spell: modal(
      mode("Exilez les deux cartes du dessus, jouables", [], [fx.impulse(2, "yourNextEndStep")]),
      mode("Une ou deux créatures gagnent +2/+0", [target.upTo(2, target.creature("t"))], [fx.pump(ref.target(), 2, 0)]),
    ),
  },
  "Prompto Argentum": {
    abilities: [triggered(when.castNoncreatureWithMana(4), [fx.createTokens(TREASURE)], { label: "Trésor" })],
  },
  "Queen Brahne": { abilities: [triggered(when.attacksSelf, [wizard()], { label: "Sorcier 0/1" })] },
  "Red Mage's Rapier": {
    abilities: [
      staticAbility(
        "attached",
        {
          addSubtypes: ["Wizard"],
          addAbilities: [
            triggered(when.castSpell("you", { notTypes: ["Creature"] }), [fx.pump(ref.self, 2, 0)], { label: "+2/+0" }),
          ],
        },
        { label: "Sorcier, +2/+0 par sort non-créature" },
      ),
    ],
  },
  Sabotender: {
    abilities: [triggered(when.landfall, [fx.damage(1, ref.eachOpponent)], { label: "1 blessure à chaque adversaire" })],
  },
  "Samurai's Katana": { abilities: jobGear("Samurai", 2, 2, ["trample", "haste"]) },
  Sandworm: {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.destroy(ref.target()),
          fx.search({ types: ["Land"], basic: true }, { to: "battlefield", tapped: true }, 1, ref.controllerOf(ref.target())),
        ],
        { targets: [targetObj("t", { types: ["Land"] }, "terrain")], label: "Détruisez un terrain" },
      ),
    ],
  },
  "Self-Destruct": {
    spell: spell(
      [target.creature("s", { controller: "you" }), { ...target.any("t"), otherThan: ["s"] }],
      [
        fx.damage(amount.powerOf(ref.target("s")), ref.target("t"), ref.target("s")),
        fx.damage(amount.powerOf(ref.target("s")), ref.target("s"), ref.target("s")),
      ],
    ),
  },
  "Sorceress's Schemes": {
    flashback: "{4}{R}",
    // Approximation : seulement une carte d'éphémère ou de rituel du cimetière (pas une carte exilée avec flashback).
    spell: spell(
      [target.cardInGraveyard("t", { types: ["Instant", "Sorcery"] }, "you", "carte d'éphémère ou de rituel")],
      [fx.toHand(ref.target()), fx.addMana("R")],
    ),
  },
  Suplex: {
    spell: modal(
      mode(
        "3 blessures, exilée si elle meurt",
        [target.creature("t")],
        [fx.exileIfDies(ref.target()), fx.damage(3, ref.target())],
      ),
      mode("Exilez un artefact", [targetObj("t", { types: ["Artifact"] }, "artefact")], [fx.exile(ref.target())]),
    ),
  },
  "Thunder Magic": {
    spell: tiered(
      { cost: "{0}", label: "Foudre (2 blessures)", targets: [target.creature("t")], effects: [fx.damage(2, ref.target())] },
      {
        cost: "{3}",
        label: "Extra Foudre (4 blessures)",
        targets: [target.creature("t")],
        effects: [fx.damage(4, ref.target())],
      },
      {
        cost: "{5}{R}",
        label: "Méga Foudre (8 blessures)",
        targets: [target.creature("t")],
        effects: [fx.damage(8, ref.target())],
      },
    ),
  },
  "Warrior's Sword": { abilities: jobGear("Warrior", 3, 2) },
};
