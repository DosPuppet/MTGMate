/** Duskmourn — cartes blanches. */
import {
  type CardScript,
  CREATURE_YOU_CONTROL,
  cond,
  cost,
  eerie,
  entersWith,
  fx,
  GLIMMER_CREATURE,
  glimmer,
  modal,
  mode,
  playerStatic,
  ref,
  spell,
  staticAbility,
  survival,
  target,
  triggered,
  wardAbility,
  when,
} from "./common";

export const WHITE: Record<string, CardScript> = {
  "Acrobatic Cheerleader": {
    // « Cette capacité ne se déclenche qu'une fois » : tant qu'elle n'a pas de marqueur de vol.
    abilities: [
      survival([fx.counters(ref.self, "flying", 1)], {
        condition: cond.not(cond.counterAtLeast("flying", 1)),
        label: "Un marqueur de vol",
      }),
    ],
  },
  "Cult Healer": {
    abilities: [eerie([fx.pump(ref.self, 0, 0, ["lifelink"])], { label: "Lien de vie" })],
  },
  "Emerge from the Cocoon": {
    spell: spell(
      [target.cardInGraveyard("t", { types: ["Creature"] }, "you", "carte de créature de votre cimetière")],
      [fx.toBattlefield(ref.target()), fx.gainLife(3)],
    ),
  },
  "Ethereal Armor": {
    enchant: { filter: { types: ["Creature"] }, label: "créature" },
    abilities: [
      staticAbility(
        "attached",
        { power: 1, toughness: 1 },
        { per: { types: ["Enchantment"], controller: "you" }, label: "+1/+1 par enchantement" },
      ),
      staticAbility("attached", { addKeywords: ["firstStrike"] }, { label: "Initiative" }),
    ],
  },
  Exorcise: {
    spell: spell(
      [
        {
          id: "t",
          label: "artefact, enchantement ou créature de force 4 ou plus",
          filter: {
            objects: { anyOf: [{ types: ["Artifact"] }, { types: ["Enchantment"] }, { types: ["Creature"], minPower: 4 }] },
          },
        },
      ],
      [fx.exile(ref.target())],
    ),
  },
  "Fear of Immobility": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.tap(ref.target()),
          fx.when(cond.targetMatches("t", { controller: "opponent" }), fx.counters(ref.target(), "stun", 1)),
        ],
        { targets: [target.upTo(1, target.creature())], label: "Engagez une créature (marqueur d'étourdissement)" },
      ),
    ],
  },
  "Fear of Surveillance": {
    abilities: [triggered(when.attacksSelf, [fx.surveil(1)], { label: "Surveillance 1" })],
  },
  "Friendly Ghost": {
    abilities: [triggered(when.entersSelf, [fx.pump(ref.target(), 2, 4)], { targets: [target.creature()], label: "+2/+4" })],
  },
  "Glimmer Seeker": {
    abilities: [
      survival(
        [
          ...fx.when(cond.controls(GLIMMER_CREATURE), fx.draw(1)),
          ...fx.when(cond.not(cond.controls(GLIMMER_CREATURE)), glimmer()),
        ],
        {
          label: "Piochez, ou créez une Lueur",
        },
      ),
    ],
  },
  "Grand Entryway": {
    abilities: [triggered(when.unlockThisDoor, [glimmer()], { label: "Jeton Lueur 1/1" })],
  },
  "Elegant Rotunda": {
    abilities: [
      triggered(when.unlockThisDoor, [fx.addCounters(ref.target(), 1)], {
        targets: [target.upTo(2, target.creature())],
        label: "Marqueur +1/+1 sur jusqu'à deux créatures",
      }),
    ],
  },
  "Hardened Escort": {
    abilities: [
      triggered(when.attacksSelf, [fx.pump(ref.target(), 1, 0, ["indestructible"])], {
        targets: [target.creature("t", { controller: "you", other: true })],
        label: "+1/+0 et l'indestructible",
      }),
    ],
  },
  "Jump Scare": {
    spell: spell(
      [target.creature()],
      [fx.pump(ref.target(), 2, 2, ["flying"]), fx.modify(ref.target(), { addTypes: ["Enchantment"], addSubtypes: ["Horror"] })],
    ),
  },
  "Leyline of Hope": {
    leyline: true,
    abilities: [
      playerStatic({ lifeGainBonus: 1, label: "Gains de PV +1" }),
      staticAbility(
        CREATURE_YOU_CONTROL,
        { power: 2, toughness: 2 },
        { condition: cond.lifeAboveStart(7), label: "+2/+2 (7 PV de plus)" },
      ),
    ],
  },
  "Lionheart Glimmer": {
    abilities: [triggered(when.attackWith(), [fx.pumpAll(CREATURE_YOU_CONTROL, 1, 1)], { label: "Vos créatures +1/+1" })],
  },
  "Living Phone": {
    abilities: [
      triggered(when.diesSelf, [fx.lookAtTop(5, { filter: { types: ["Creature"], maxPower: 2 }, rest: "bottom" })], {
        label: "Créature de force 2 ou moins parmi les cinq du dessus",
      }),
    ],
  },
  "Optimistic Scavenger": {
    abilities: [eerie([fx.addCounters(ref.target(), 1)], { targets: [target.creature()], label: "Marqueur +1/+1" })],
  },
  "Patched Plaything": {
    abilities: [entersWith({ counters: 2, counterKind: "-1/-1", condition: cond.castFromHand, label: "Deux marqueurs -1/-1" })],
  },
  "Savior of the Small": {
    abilities: [
      survival([fx.toHand(ref.target())], {
        targets: [
          target.cardInGraveyard("t", { types: ["Creature"], maxManaValue: 3 }, "you", "carte de créature (VM 3 ou moins)"),
        ],
        label: "Créature de votre cimetière en main",
      }),
    ],
  },
  "Seized from Slumber": {
    costReduction: { generic: 3, condition: cond.targetMatches("t", { tapped: true }) },
    spell: spell([target.creature()], [fx.destroy(ref.target())]),
  },
  "Shardmage's Rescue": {
    enchant: { filter: { types: ["Creature"], controller: "you" }, label: "créature que vous contrôlez" },
    abilities: [
      staticAbility("attached", { power: 1, toughness: 1 }, { label: "+1/+1" }),
      staticAbility(
        "attached",
        { addKeywords: ["hexproof"] },
        {
          condition: cond.sourceMatches({ enteredThisTurn: true }),
          label: "Défense talismanique (ce tour-ci)",
        },
      ),
    ],
  },
  "Sheltered by Ghosts": {
    enchant: { filter: { types: ["Creature"], controller: "you" }, label: "créature que vous contrôlez" },
    abilities: [
      triggered(when.entersSelf, [fx.exileUntilLeaves(ref.target())], {
        targets: [target.nonland("t", { controller: "opponent" })],
        label: "Exilez un permanent jusqu'à son départ",
      }),
      staticAbility(
        "attached",
        { power: 1, addKeywords: ["lifelink", "ward"], addAbilities: [wardAbility({ mana: cost("{2}") })] },
        { label: "+1/+0, lien de vie et garde {2}" },
      ),
    ],
  },
  "Split Up": {
    spell: modal(
      mode("Détruisez les créatures engagées", [], [fx.destroyAll({ types: ["Creature"], tapped: true })]),
      mode("Détruisez les créatures dégagées", [], [fx.destroyAll({ types: ["Creature"], tapped: false })]),
    ),
  },
  "Splitskin Doll": {
    abilities: [
      triggered(
        when.entersSelf,
        [fx.draw(1), ...fx.when(cond.not(cond.controls({ types: ["Creature"], other: true, maxPower: 2 })), fx.discard(1))],
        { label: "Piochez (puis défaussez sauf créature de force 2 ou moins)" },
      ),
    ],
  },
  "Surgical Suite": {
    abilities: [
      triggered(when.unlockThisDoor, [fx.toBattlefield(ref.target())], {
        targets: [
          target.cardInGraveyard("t", { types: ["Creature"], maxManaValue: 3 }, "you", "carte de créature (VM 3 ou moins)"),
        ],
        label: "Créature de votre cimetière sur le champ de bataille",
      }),
    ],
  },
  "Hospital Room": {
    abilities: [
      triggered(when.attackWith(), [fx.addCounters(ref.target(), 1)], {
        targets: [target.creature("t", { attacking: true })],
        label: "Marqueur +1/+1 sur une créature attaquante",
      }),
    ],
  },
  "Trapped in the Screen": {
    abilities: [
      triggered(when.entersSelf, [fx.exileUntilLeaves(ref.target())], {
        targets: [
          target.permanent(
            "t",
            ["Artifact", "Creature", "Enchantment"],
            { controller: "opponent" },
            "artefact, créature ou enchantement adverse",
          ),
        ],
        label: "Exilez un permanent jusqu'à son départ",
      }),
    ],
  },
  "Unsettling Twins": {
    abilities: [triggered(when.entersSelf, [fx.manifestDread], { label: "Manifestation effroyable" })],
  },
  "Unwanted Remake": {
    spell: spell([target.creature()], [fx.destroy(ref.target()), fx.manifestDreadBy({ who: ref.controllerOf(ref.target()) })]),
  },
  "The Wandering Rescuer": {
    abilities: [
      staticAbility(
        { types: ["Creature"], controller: "you", tapped: true, other: true },
        { addKeywords: ["hexproof"] },
        { label: "Vos autres créatures engagées ont la défense talismanique" },
      ),
    ],
  },
};
