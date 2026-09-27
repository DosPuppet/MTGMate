/** Final Fantasy — cartes bleues. */
import type { CardScript } from "@mtgx/engine";
import {
  activated,
  amount,
  cond,
  fx,
  hero,
  manaAbility,
  ROBOT_WARRIOR,
  ref,
  spell,
  staticAbility,
  TOWN,
  target,
  tiered,
  triggered,
  when,
} from "./common";

export const BLUE: Record<string, CardScript> = {
  "Cargo Ship": {
    abilities: [
      manaAbility("C", 1, { restriction: { spell: { types: ["Artifact"] }, abilityOfSource: { types: ["Artifact"] } } }),
    ],
  },
  "Combat Tutorial": {
    spell: spell(
      [target.player("p"), target.upTo(1, target.creature("c", { controller: "you" }))],
      [fx.draw(2, ref.target("p")), fx.addCounters(ref.target("c"), 1)],
    ),
  },
  "Dragoon's Wyvern": { abilities: [triggered(when.entersSelf, [hero()], { label: "Héros 1/1" })] },
  "Dreams of Laguna": { flashback: "{3}{U}", spell: spell([], [fx.surveil(1), fx.draw(1)]) },
  Eject: { cantBeCountered: true, spell: spell([target.nonland("t")], [fx.bounce(ref.target()), fx.draw(1)]) },
  Ether: {
    abilities: [
      activated({
        tap: true,
        exileSelf: true,
        effects: [fx.addMana("U"), fx.copyNextSpell],
        label: "{U}, copiez le prochain éphémère ou rituel",
      }),
    ],
  },
  "Ice Flan": {
    abilities: [
      triggered(when.entersSelf, [fx.tap(ref.target()), fx.counters(ref.target(), "stun", 1)], {
        targets: [target.permanent("t", ["Artifact", "Creature"], { controller: "opponent" }, "artefact ou créature")],
        label: "Engagez et étourdissez",
      }),
    ],
  },
  "Ice Magic": {
    spell: tiered(
      { cost: "{0}", label: "Glace", targets: [target.creature("t")], effects: [fx.bounce(ref.target())] },
      { cost: "{2}", label: "Extra Glace", targets: [target.creature("t")], effects: [fx.topOrBottom(ref.target())] },
      {
        cost: "{5}{U}",
        label: "Méga Glace",
        targets: [target.creature("t")],
        effects: [fx.moveTo(ref.target(), { to: "libraryTop" }), fx.shuffle(ref.controllerOf(ref.target()))],
      },
    ),
  },
  "Il Mheg Pixie": { abilities: [triggered(when.attacksSelf, [fx.surveil(1)], { label: "Surveillance 1" })] },
  "Magic Damper": {
    spell: spell(
      [target.creature("t", { controller: "you" })],
      [fx.pump(ref.target(), 1, 1, ["hexproof"]), fx.untap(ref.target())],
    ),
  },
  "Matoya, Archon Elder": { abilities: [triggered(when.scryOrSurveil, [fx.draw(1)], { label: "Piochez" })] },
  "The Prima Vista": {
    abilities: [triggered(when.castNoncreatureWithMana(4), [fx.animateVehicle()], { label: "Devient une créature-artefact" })],
  },
  "Qiqirn Merchant": {
    abilities: [
      activated({ mana: "{1}", tap: true, effects: fx.loot(1), label: "Piochez, défaussez" }),
      activated({
        mana: "{7}",
        tap: true,
        sacrifice: true,
        reduction: { generic: amount.count({ ...TOWN, controller: "you" }) },
        effects: [fx.draw(3)],
        label: "Piochez trois cartes",
      }),
    ],
  },
  "Relm's Sketching": {
    spell: spell(
      [target.permanent("t", ["Artifact", "Creature", "Land"], {}, "artefact, créature ou terrain")],
      [fx.copyToken(ref.target())],
    ),
  },
  "Retrieve the Esper": {
    flashback: "{5}{U}",
    spell: spell(
      [],
      [
        fx.createTokens(ROBOT_WARRIOR, 1, undefined, "r"),
        fx.when(cond.spellCastFromGraveyard, fx.addCounters(ref.stored("r"), 2)),
      ],
    ),
  },
  "Rook Turret": {
    abilities: [
      triggered(
        when.enters({ types: ["Artifact"], controller: "you", other: true }),
        fx.may("Piocher puis défausser ?", ...fx.loot(1)),
        {
          label: "Piochez, défaussez",
        },
      ),
    ],
  },
  Sahagin: {
    abilities: [
      triggered(when.castNoncreatureWithMana(4), [fx.addCounters(ref.self, 1), fx.pump(ref.self, 0, 0, ["unblockable"])], {
        label: "Marqueur +1/+1, imblocable",
      }),
    ],
  },
  "Scorpion Sentinel": {
    abilities: [
      staticAbility("self", { power: 3 }, { condition: cond.controls({ types: ["Land"] }, 7), label: "+3/+0 (sept terrains)" }),
    ],
  },
  "Sleep Magic": {
    enchant: { filter: { types: ["Creature"] }, label: "créature" },
    abilities: [
      triggered(when.entersSelf, [fx.tap(ref.attached)], { label: "Engagez la créature" }),
      staticAbility("attached", { addKeywords: ["doesntUntap"] }, { label: "Ne se dégage pas" }),
      triggered(when.attachedIsDealtDamage, [fx.sacrificeIt(ref.self)], { label: "Blessée : sacrifiez l'Aura" }),
    ],
  },
  Syncopate: {
    spell: spell(
      [target.spell("t")],
      fx.unlessPays(ref.controllerOf(ref.target()), { mana: "{X}" }, fx.counterExile(ref.target())),
    ),
  },
  "Travel the Overworld": {
    costReduction: { generic: amount.count({ ...TOWN, controller: "you" }) },
    spell: spell([], [fx.draw(4)]),
  },
  "Ultros, Obnoxious Octopus": {
    abilities: [
      triggered(when.castNoncreatureWithMana(4), [fx.tap(ref.target()), fx.counters(ref.target(), "stun", 1)], {
        targets: [target.creature("t", { controller: "opponent" })],
        label: "Engagez et étourdissez",
      }),
      triggered(when.castNoncreatureWithMana(8), [fx.addCounters(ref.self, 8)], { label: "Huit marqueurs +1/+1" }),
    ],
  },
  "Valkyrie Aerial Unit": {
    costReduction: { generic: amount.count({ types: ["Artifact"], controller: "you" }) },
    abilities: [triggered(when.entersSelf, [fx.surveil(2)], { label: "Surveillance 2" })],
  },
};
