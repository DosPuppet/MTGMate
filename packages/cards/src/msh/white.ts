/** Marvel Super Heroes — cartes blanches (lot A). */
import type { ObjectFilter, TokenSpec, TriggerSpec } from "@mtgx/engine";
import {
  activated,
  amount,
  type CardScript,
  CLUE,
  chapter,
  cond,
  entersWith,
  fx,
  HERO,
  investigate,
  modal,
  mode,
  playerStatic,
  ref,
  SOLDIER,
  spell,
  staticAbility,
  target,
  triggered,
  triggeredModal,
  WALL_C,
  when,
} from "./common";

const CREATURES_YOU_CONTROL: ObjectFilter = { types: ["Creature"], controller: "you" };
const OTHER_HEROES_YOU_CONTROL: ObjectFilter = { subtype: "Hero", controller: "you", other: true };
/** « Chaque fois que [cette créature] attaque seule » */
const ATTACKS_ALONE_SELF: TriggerSpec = { on: "attacks", who: "self", alone: true };
/** « un sort qui cible une créature que vous contrôlez » */
const TARGETS_YOUR_CREATURE = { objects: CREATURES_YOU_CONTROL };

/** The Void (The Sentry) : Horreur Méchant légendaire noire 5/5, vol, indestructible, attaque à chaque combat. */
const THE_VOID: TokenSpec = {
  name: "The Void",
  legendary: true,
  colors: ["B"],
  types: ["Creature"],
  subtypes: ["Horror", "Villain"],
  power: 5,
  toughness: 5,
  keywords: ["flying", "indestructible", "mustAttack"],
};

export const WHITE: Record<string, CardScript> = {
  "Agent 13, Sharon Carter": {
    abilities: [
      triggered(when.attacksAlone(CREATURES_YOU_CONTROL), [investigate()], {
        label: "Une de vos créatures attaque seule : enquêtez",
      }),
    ],
  },
  "Agent Phil Coulson": {
    abilities: [
      activated({
        tap: true,
        effects: [fx.addCountersAll(OTHER_HEROES_YOU_CONTROL, 1)],
        label: "Un marqueur +1/+1 sur chacun de vos autres Héros",
      }),
    ],
  },
  "Agents of S.H.I.E.L.D.": {
    abilities: [
      triggered(when.attacksAlone(CREATURES_YOU_CONTROL), [fx.pump(ref.eventObject, 1, 1)], {
        label: "La créature qui attaque seule gagne +1/+1",
      }),
    ],
  },
  "Avengers Assemble!": {
    // Flash : lu dans le texte.
    abilities: [
      staticAbility({ subtype: "Hero", controller: "you" }, { power: 2, toughness: 2 }, { label: "Vos Héros ont +2/+2" }),
      triggered(when.eachEndStep, [fx.draw(1)], {
        condition: cond.any(
          cond.attackedWith("Hero"),
          cond.amountAtLeast(amount.turnEvents({ event: "zone", to: "battlefield", subtype: "Hero", who: "you" }), 1),
        ),
        label: "Piochez une carte (Héros qui a attaqué ou qui est arrivé ce tour-ci)",
      }),
    ],
  },
  "Borough Backup": {
    // Cycle de terrain de base {2} : lu dans le texte.
    spell: spell([], [fx.createTokens(HERO, 2)]),
  },
  "Brave Brawler": {
    abilities: [
      activated({
        mana: "{4}{W}",
        powerUp: true,
        effects: [fx.addCounters(ref.self, 2)],
        label: "Montée en puissance : deux marqueurs +1/+1",
      }),
    ],
  },
  "Captain America, Wings of Freedom": {
    abilities: [
      triggered(
        when.attacksSelf,
        [fx.pumpAll(OTHER_HEROES_YOU_CONTROL, amount.toughnessOf(ref.self), amount.toughnessOf(ref.self))],
        { label: "Vos autres Héros gagnent +X/+X (X : son endurance)" },
      ),
    ],
  },
  "Captain Mar-Vell, Space-Born": {
    abilities: [
      playerStatic({
        spellKeywords: { filter: {}, keywords: ["flash"] },
        condition: cond.amountAtLeast(amount.turnEvents({ event: "cast", who: "opponent" }), 1),
        label: "Conscience cosmique — vos sorts ont le flash si un adversaire a lancé un sort ce tour-ci",
      }),
    ],
  },
  "Colleen Wing, Street Samurai": {
    abilities: [
      triggered(when.castSpell("you", undefined, TARGETS_YOUR_CREATURE), [fx.addCounters(ref.self, 1), fx.scry(1)], {
        label: "Un marqueur +1/+1, regard 1",
      }),
    ],
  },
  "Crowd of True Believers": {
    abilities: [
      activated({
        tap: true,
        // « attaquant seule » : la seule créature attaquante (approché : elle attaque un joueur, `cond.attackingAlone`).
        activationCondition: cond.attackingAlone,
        targets: [
          {
            id: "t",
            label: "créature que vous contrôlez qui attaque seule",
            filter: { objects: { ...CREATURES_YOU_CONTROL, attacking: true } },
          },
        ],
        effects: [fx.pump(ref.target(), 1, 0), fx.gainLife(1)],
        label: "+1/+0 à votre créature qui attaque seule, gagnez 1 PV",
      }),
    ],
  },
  "Helicarrier Strike": {
    // Travail d'équipe 2 : lu dans le texte.
    spell: spell(
      [{ id: "t", label: "créature attaquante ou bloqueuse", filter: { objects: { types: ["Creature"], inCombat: true } } }],
      [fx.damage(amount.kicked(4, 2), ref.target())],
    ),
  },
  "Hero in Training": {
    abilities: [
      triggered(when.entersSelf, [fx.draw(1), ...fx.when(cond.controls({ subtype: "Hero", other: true }), fx.gainLife(2))], {
        label: "Piochez ; 2 PV si vous contrôlez un autre Héros",
      }),
    ],
  },
  "Invisible Woman, Sue Storm": {
    abilities: [
      triggered(
        when.youPutCounters(OTHER_HEROES_YOU_CONTROL, "+1/+1"),
        fx.may("Créer un Mur 0/4 avec le défenseur ?", fx.createTokens(WALL_C)),
        { batched: true, label: "Un Mur 0/4 avec le défenseur" },
      ),
    ],
  },
  "Luke Cage, Power Man": {
    abilities: [
      triggered(ATTACKS_ALONE_SELF, [fx.pump(ref.self, 2, 0, ["indestructible"])], {
        label: "Peau incassable — +2/+0 et l'indestructible",
      }),
    ],
  },
  "Mockingbird, Ace Agent": {
    abilities: [
      triggered(when.castSpell("you", undefined, TARGETS_YOUR_CREATURE), [fx.addCounters(ref.self, 1)], {
        label: "Un marqueur +1/+1",
      }),
    ],
  },
  "Monica Rambeau": {
    abilities: [
      activated({ mana: "{2}{R}{W}{W}", sorcerySpeed: true, effects: [fx.transform(ref.self)], label: "Transformez-la" }),
    ],
  },
  "Photon, Living Light": {
    abilities: [
      triggered(
        when.castSpell("you", { notTypes: ["Creature"] }),
        [fx.addCountersAll({ ...CREATURES_YOU_CONTROL, other: true }, 1)],
        { label: "Un marqueur +1/+1 sur chacune de vos autres créatures" },
      ),
    ],
  },
  "Murdock's Crusade": {
    // Travail d'équipe 4 : lu dans le texte ; « choisissez les deux » demande le travail d'équipe.
    spell: modal(
      mode(
        "Justice de la rue — exile une créature d'endurance 4 ou plus",
        [target.creature("t", { minToughness: 4 })],
        [fx.exile(ref.target())],
      ),
      mode(
        "Justice légale — exile un enchantement de valeur de mana 4 ou plus",
        [target.permanent("u", ["Enchantment"], { minManaValue: 4 }, "enchantement de valeur de mana 4 ou plus")],
        [fx.exile(ref.target("u"))],
      ),
      {
        ...mode(
          "Les deux (travail d'équipe)",
          [
            target.creature("t", { minToughness: 4 }),
            target.permanent("u", ["Enchantment"], { minManaValue: 4 }, "enchantement de valeur de mana 4 ou plus"),
          ],
          [fx.exile(ref.target()), fx.exile(ref.target("u"))],
        ),
        condition: cond.kicked,
      },
    ),
  },
  "Nick Fury, Agent of S.H.I.E.L.D.": {
    abilities: [
      activated({
        mana: "{W}{U}{B}{R}{G}",
        powerUp: true,
        effects: [
          fx.addCounters(ref.self, 2),
          // « Si c'est une carte recto-verso, vous pouvez la transformer » : approché, elle arrive sur sa face recto.
          fx.lookAtTop(7, {
            filter: { anyOf: [{ subtype: "Hero" }, { subtype: "Equipment" }, { subtype: "Vehicle" }] },
            to: { to: "battlefield" },
            rest: "bottom",
          }),
        ],
        label: "Montée en puissance : deux marqueurs +1/+1, un Héros, Équipement ou Véhicule parmi les sept du dessus",
      }),
    ],
  },
  "Night Nurse, Healer of Heroes": {
    abilities: [
      triggered(when.entersSelf, [fx.toHand(ref.target())], {
        targets: [
          target.cardInGraveyard(
            "t",
            { permanent: true, enteredThisTurn: true },
            "you",
            "carte de permanent mise dans votre cimetière ce tour-ci",
          ),
        ],
        label: "Renvoie en main une carte de permanent mise dans votre cimetière ce tour-ci",
      }),
    ],
  },
  "Okoye, Dora Milaje Leader": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(SOLDIER, 2)], { label: "Deux Soldats 1/1" }),
      staticAbility(
        { ...CREATURES_YOU_CONTROL, token: true, attacking: true },
        { addKeywords: ["firstStrike"] },
        { label: "Vos jetons de créature attaquants ont l'initiative" },
      ),
    ],
  },
  "Origin of the Avengers": {
    abilities: [
      chapter([1], [fx.scry(2)], { label: "Regard 2" }),
      chapter(
        [2],
        [
          fx.pickFromZone(
            "hand",
            { types: ["Creature"], subtype: "Hero", maxManaValue: 3 },
            { to: "battlefield" },
            { min: 0, store: "h", prompt: "Un Héros de valeur de mana 3 ou moins de votre main" },
          ),
          ...fx.when(cond.not(cond.v("h")), fx.draw(1)),
        ],
        { label: "Un Héros de votre main sur le champ de bataille, sinon piochez" },
      ),
      chapter([3], [fx.addCountersAll(CREATURES_YOU_CONTROL, 1)], { label: "Un marqueur +1/+1 sur chacune de vos créatures" }),
    ],
  },
  "Panther Pounce": {
    spell: spell(
      [target.player("p"), target.creature()],
      [fx.createTokens(CLUE, 1, ref.target("p")), fx.pump(ref.target(), 1, 0, ["flying"]), fx.untap(ref.target())],
    ),
  },
  "Patriot, Shield Wielder": {
    abilities: [
      activated({
        mana: "{2}",
        tap: true,
        targets: [target.creature("t", { controller: "you", other: true })],
        effects: [fx.pump(ref.target(), 2, 0, ["hexproof"])],
        label: "Une autre de vos créatures gagne +2/+0 et la défense talismanique",
      }),
    ],
  },
  "Quake, Agent of S.H.I.E.L.D.": {
    abilities: [
      triggered(when.castSpell("you", { notTypes: ["Creature"] }), [fx.tap(ref.target())], {
        targets: [target.permanent("t", ["Creature", "Land"], {}, "créature ou terrain")],
        label: "Mise à terre sismique — engage une créature ou un terrain",
      }),
    ],
  },
  "Raft Security Officer": {
    // « Coûte {1} de moins si elle cible une créature de force 3 ou moins » : deux capacités, selon la cible.
    abilities: [
      activated({
        mana: "{1}",
        tap: true,
        targets: [target.creature("t", { maxPower: 3 })],
        effects: [fx.tap(ref.target())],
        label: "Engage une créature de force 3 ou moins",
      }),
      activated({
        mana: "{2}",
        tap: true,
        targets: [target.creature()],
        effects: [fx.tap(ref.target())],
        label: "Engage une créature",
      }),
    ],
  },
  "Red Guardian, Super-Soldier": {
    abilities: [
      triggered(when.entersSelf, [fx.destroy(ref.target())], {
        targets: [
          {
            id: "t",
            label: "créature adverse qui a infligé des blessures ce tour-ci",
            filter: { objects: { types: ["Creature"], controller: "opponent", dealtDamageThisTurn: true } },
          },
        ],
        label: "Détruit une créature adverse qui a infligé des blessures ce tour-ci",
      }),
    ],
  },
  "The Sentry, Golden Guardian": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(THE_VOID, 1, ref.target("p"))], {
        targets: [target.player("p", "opponent")],
        label: "Un adversaire crée The Void, 5/5",
      }),
    ],
  },
  "S.H.I.E.L.D. Spy Kit": {
    // Équiper {1} : lu dans le texte.
    abilities: [
      staticAbility("attached", { power: 1, toughness: 1 }, { label: "+1/+1" }),
      triggered(when.attacksAlone({ attachedToSource: true }), [fx.untap(ref.attached), fx.scry(1)], {
        label: "La créature équipée attaque seule : dégagez-la, regard 1",
      }),
    ],
  },
  "Super Villain Lockup": {
    // Flash : lu dans le texte.
    abilities: [
      triggered(when.entersSelf, [fx.exileUntilLeaves(ref.target())], {
        targets: [target.creature("t", { controller: "opponent", tapped: true })],
        label: "Exile une créature adverse engagée jusqu'à son départ",
      }),
    ],
  },
  "Super-Soldier Serum": {
    enchant: { filter: { types: ["Creature"] }, label: "créature" },
    abilities: [
      staticAbility(
        "attached",
        {
          power: 2,
          toughness: 2,
          addKeywords: ["firstStrike", "vigilance"],
          addSupertypes: ["Legendary"],
          addSubtypes: ["Soldier"],
        },
        { label: "+2/+2, l'initiative et la vigilance ; Soldat légendaire" },
      ),
      ...[when.attacks({ attachedToSource: true }), when.blocks({ attachedToSource: true })].map((w) =>
        triggered(w, [fx.attach(ref.attached, ref.target())], {
          targets: [
            target.upTo(
              99,
              target.permanent("t", ["Artifact"], { subtype: "Equipment", controller: "you" }, "Équipement que vous contrôlez"),
            ),
          ],
          label: "Attache vos Équipements ciblés à la créature enchantée",
        }),
      ),
    ],
  },
  "Wakandan Drone Flock": {
    abilities: [triggered(when.entersSelf, [fx.scry(2)], { label: "Regard 2" })],
  },
  "White Widow, Free Agent": {
    abilities: [
      triggeredModal(
        when.entersSelf,
        [
          mode(
            "Un marqueur +1/+1 sur chacune de jusqu'à deux créatures",
            [target.upTo(2, target.creature())],
            [fx.addCounters(ref.target(), 1)],
          ),
          mode(
            "Renvoie en main une carte d'artefact ou d'enchantement de votre cimetière",
            [
              target.cardInGraveyard(
                "u",
                { anyOf: [{ types: ["Artifact"] }, { types: ["Enchantment"] }] },
                "you",
                "carte d'artefact ou d'enchantement de votre cimetière",
              ),
            ],
            [fx.toHand(ref.target("u"))],
          ),
        ],
        { label: "Marqueurs +1/+1, ou un artefact ou un enchantement de votre cimetière" },
      ),
    ],
  },
  "Agent Maria Hill": {
    abilities: [
      triggered({ on: "taps", who: "self", cause: "teamwork" }, [fx.addCounters(ref.self, 1), fx.draw(1)], {
        label: "Engagée pour un travail d'équipe : un marqueur +1/+1 et piochez une carte",
      }),
    ],
  },
  // Initiative : lue dans le texte.
  "Captain America, Super-Soldier": {
    abilities: [
      entersWith({ counters: 1, counterKind: "shield", label: "Arrive avec un marqueur de bouclier" }),
      playerStatic({
        hexproof: true,
        condition: cond.counterAtLeast("shield", 1),
        label: "Vous avez la défense talismanique tant qu'il a un marqueur de bouclier",
      }),
      staticAbility(
        { types: ["Creature"], subtype: "Hero", controller: "you", other: true },
        { addKeywords: ["hexproof"] },
        { condition: cond.counterAtLeast("shield", 1), label: "Vos autres Héros ont la défense talismanique" },
      ),
    ],
  },
};
