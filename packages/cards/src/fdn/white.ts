/** Foundations — cartes blanches. */
import {
  activated,
  amount,
  CAT,
  CAT_BEAST,
  CAT_LIFELINK,
  type CardScript,
  CREATURE_OPP,
  CREATURE_YOU_CONTROL,
  cond,
  costReducer,
  DOG,
  entersWith,
  FOOD,
  fx,
  HUMAN,
  KNIGHT,
  manaAbility,
  modal,
  mode,
  OTHER_CREATURE_YOU_CONTROL,
  playerStatic,
  prevention,
  RABBIT,
  ref,
  SOLDIER,
  spell,
  staticAbility,
  target,
  targetObj,
  triggered,
  triggeredModal,
  WITH_P1P1,
  when,
} from "./common";

export const WHITE: Record<string, CardScript> = {
  "Celestial Armor": {
    abilities: [
      triggered(when.entersSelf, [fx.attach(ref.target()), fx.pump(ref.target(), 0, 0, ["hexproof", "indestructible"])], {
        targets: [target.creature("t", { controller: "you" })],
        label: "s'attache, défense talismanique et indestructible",
      }),
      staticAbility("attached", { power: 2, addKeywords: ["flying"] }, { label: "Créature équipée : +2/+0 et vol" }),
    ],
  },
  "Twinblade Blessing": {
    enchant: { filter: { types: ["Creature"] }, label: "créature" },
    abilities: [staticAbility("attached", { addKeywords: ["doubleStrike"] }, { label: "Double initiative" })],
  },
  "Fleeting Flight": {
    spell: spell(
      [target.creature()],
      [fx.addCounters(ref.target(), 1), fx.pump(ref.target(), 0, 0, ["flying"]), fx.preventCombatDamage(ref.target())],
    ),
  },
  "Arahbo, the First Fang": {
    abilities: [
      staticAbility({ types: ["Creature"], subtype: "Cat", controller: "you", other: true }, { power: 1, toughness: 1 }),
      triggered(when.enters({ types: ["Creature"], subtype: "Cat", controller: "you", nontoken: true }), [fx.createTokens(CAT)], {
        label: "Chat 1/1",
      }),
    ],
  },
  "Armasaur Guide": {
    abilities: [
      triggered(when.attackWith(3), [fx.addCounters(ref.target(), 1)], {
        targets: [target.creature("t", { controller: "you" })],
        label: "marqueur +1/+1",
      }),
    ],
  },
  "Cat Collector": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(FOOD)], { label: "Nourriture" }),
      triggered(when.gainLifeFirst, [fx.createTokens(CAT)], { condition: cond.yourTurn, label: "Chat 1/1" }),
    ],
  },
  "Claws Out": {
    costReduction: { generic: amount.count({ types: ["Creature"], subtype: "Cat", controller: "you" }) },
    spell: spell([], [fx.pumpAll({ controller: "you" }, 2, 2)]),
  },
  "Dauntless Veteran": {
    abilities: [triggered(when.attacksSelf, [fx.pumpAll({ controller: "you" }, 1, 1)], { label: "vos créatures +1/+1" })],
  },
  "Dazzling Angel": {
    abilities: [triggered(when.enters(OTHER_CREATURE_YOU_CONTROL), [fx.gainLife(1)], { label: "+1 PV" })],
  },
  "Divine Resilience": {
    kicker: "{2}{W}",
    spell: spell(
      [{ ...target.creature("t", { controller: "you" }), kickedCount: 99 }],
      [fx.pump(ref.target(), 0, 0, ["indestructible"])],
    ),
  },
  "Exemplar of Light": {
    abilities: [
      triggered(when.gainLife, [fx.addCounters(ref.self, 1)], { label: "marqueur +1/+1" }),
      triggered(when.countersPut("self", "+1/+1"), [fx.draw(1)], { oncePerTurn: true, label: "piochez une carte" }),
    ],
  },
  "Felidar Savior": {
    abilities: [
      triggered(when.entersSelf, [fx.addCounters(ref.target(), 1)], {
        targets: [target.upTo(2, target.creature("t", { controller: "you", other: true }))],
        label: "marqueurs +1/+1",
      }),
    ],
  },
  "Guarded Heir": { abilities: [triggered(when.entersSelf, [fx.createTokens(KNIGHT, 2)], { label: "deux Chevaliers 3/3" })] },
  "Hare Apparent": {
    abilities: [
      triggered(
        when.entersSelf,
        [fx.createTokens(RABBIT, amount.count({ types: ["Creature"], name: "Hare Apparent", controller: "you", other: true }))],
        { label: "Lapins 1/1" },
      ),
    ],
  },
  "Helpful Hunter": { abilities: [triggered(when.entersSelf, [fx.draw(1)], { label: "piochez une carte" })] },
  "Inspiring Paladin": {
    abilities: [
      staticAbility("self", { addKeywords: ["firstStrike"] }, { condition: cond.yourTurn }),
      staticAbility(WITH_P1P1, { addKeywords: ["firstStrike"] }, { condition: cond.yourTurn }),
    ],
  },
  "Joust Through": {
    spell: spell(
      [targetObj("t", { types: ["Creature"], inCombat: true }, "créature attaquante ou bloqueuse")],
      [fx.damage(3, ref.target()), fx.gainLife(1)],
    ),
  },
  "Prideful Parent": { abilities: [triggered(when.entersSelf, [fx.createTokens(CAT)], { label: "Chat 1/1" })] },
  "Raise the Past": {
    spell: spell([], [fx.moveAll("graveyard", ref.you, { types: ["Creature"], maxManaValue: 2 }, { to: "battlefield" })]),
  },
  "Skyknight Squire": {
    abilities: [
      triggered(when.enters(OTHER_CREATURE_YOU_CONTROL), [fx.addCounters(ref.self, 1)], { label: "marqueur +1/+1" }),
      staticAbility(
        "self",
        { addKeywords: ["flying"], addSubtypes: ["Knight"] },
        { condition: cond.counterAtLeast("+1/+1", 3), label: "Vol et Chevalier (3 marqueurs)" },
      ),
    ],
  },
  "Squad Rallier": {
    abilities: [
      activated({
        mana: "{2}{W}",
        effects: [fx.lookAtTop(4, { filter: { types: ["Creature"], maxPower: 2 } })],
        label: "Regarder les 4 cartes du dessus",
      }),
    ],
  },
  "Sun-Blessed Healer": {
    kicker: "{1}{W}",
    abilities: [
      triggered(when.entersSelf, [fx.toBattlefield(ref.target())], {
        targets: [target.cardInGraveyard("t", { permanent: true, nonland: true, maxManaValue: 2 })],
        condition: cond.kicked,
        label: "Kicker : retour d'un permanent",
      }),
    ],
  },
  "Valkyrie's Call": {
    abilities: [
      triggered(
        when.dies({ types: ["Creature"], controller: "you", nontoken: true, notSubtype: "Angel" }),
        [
          fx.toBattlefield(ref.eventObject, {
            counters: { kind: "+1/+1", n: 1 },
            addKeywords: ["flying"],
            addSubtypes: ["Angel"],
          }),
        ],
        { label: "revient en Ange" },
      ),
    ],
  },
  "Vanguard Seraph": { abilities: [triggered(when.gainLifeFirst, [fx.surveil(1)], { label: "surveillance 1" })] },
  "Ajani's Pridemate": { abilities: [triggered(when.gainLife, [fx.addCounters(ref.self, 1)], { label: "marqueur +1/+1" })] },
  "Angel of Finality": {
    abilities: [
      triggered(when.entersSelf, [fx.moveAll("graveyard", ref.target(), {}, { to: "exile" })], {
        targets: [target.player()],
        label: "exile un cimetière",
      }),
    ],
  },
  "Authority of the Consuls": {
    abilities: [
      entersWith({ tapped: true, affects: CREATURE_OPP, label: "Les créatures adverses arrivent engagées" }),
      triggered(when.enters(CREATURE_OPP), [fx.gainLife(1)], { label: "+1 PV" }),
    ],
  },
  "Banishing Light": {
    abilities: [
      triggered(when.entersSelf, [fx.exileUntilLeaves(ref.target())], {
        targets: [target.nonland("t", { controller: "opponent" }, "permanent non-terrain adverse")],
        label: "exile jusqu'à son départ",
      }),
    ],
  },
  "Cathar Commando": {
    abilities: [
      activated({
        mana: "{1}",
        sacrifice: true,
        targets: [target.permanent("t", ["Artifact", "Enchantment"], {}, "artefact ou enchantement")],
        effects: [fx.destroy(ref.target())],
        label: "Détruire un artefact ou un enchantement",
      }),
    ],
  },
  "Day of Judgment": { spell: spell([], [fx.destroyAll({ types: ["Creature"] })]) },
  "Make Your Move": {
    spell: spell(
      [
        targetObj(
          "t",
          { anyOf: [{ types: ["Artifact"] }, { types: ["Enchantment"] }, { types: ["Creature"], minPower: 4 }] },
          "artefact, enchantement ou créature de force 4 ou plus",
        ),
      ],
      [fx.destroy(ref.target())],
    ),
  },
  "Mischievous Pup": {
    abilities: [
      triggered(when.entersSelf, [fx.toHand(ref.target())], {
        targets: [target.optional(targetObj("t", { controller: "you", other: true }, "autre permanent que vous contrôlez"))],
        label: "renvoie un permanent",
      }),
    ],
  },
  "Resolute Reinforcements": { abilities: [triggered(when.entersSelf, [fx.createTokens(SOLDIER)], { label: "Soldat 1/1" })] },
  "Stroke of Midnight": {
    spell: spell([target.nonland()], [fx.destroy(ref.target()), fx.createTokens(HUMAN, 1, ref.controllerOf(ref.target()))]),
  },
  "Youthful Valkyrie": {
    abilities: [
      triggered(when.enters({ ...CREATURE_YOU_CONTROL, subtype: "Angel", other: true }), [fx.addCounters(ref.self, 1)], {
        label: "marqueur +1/+1",
      }),
    ],
  },
  "Crystal Barricade": {
    abilities: [
      playerStatic({ hexproof: true, label: "Vous avez la défense talismanique" }),
      prevention(
        { types: ["Creature"], controller: "you", other: true },
        { noncombatOnly: true, label: "Prévient les blessures non de combat" },
      ),
    ],
  },
  "Herald of Eternal Dawn": {
    abilities: [playerStatic({ cantLose: true, label: "Vous ne pouvez pas perdre la partie" })],
  },
  "Luminous Rebuke": {
    costReduction: { generic: 3, condition: cond.targetMatches("t", { tapped: true }) },
    spell: spell([target.creature()], [fx.destroy(ref.target())]),
  },
  "Giada, Font of Hope": {
    abilities: [
      entersWith({
        counters: amount.count({ types: ["Creature"], subtype: "Angel", controller: "you" }),
        affects: { types: ["Creature"], subtype: "Angel", controller: "you", other: true },
        label: "Les autres Anges arrivent avec des marqueurs",
      }),
      manaAbility("W", 1, { restriction: { spell: { subtype: "Angel" } } }),
    ],
  },

  // --- Réimpressions ---
  "Adamant Will": { spell: spell([target.creature()], [fx.pump(ref.target(), 2, 2, ["indestructible"])]) },
  "Ancestor Dragon": {
    abilities: [triggered(when.attackWith(1), [fx.gainLife(amount.eventAmount)], { label: "1 PV par attaquant" })],
  },
  "Angel of Vitality": {
    abilities: [
      playerStatic({ lifeGainBonus: 1, label: "Gains de vie +1" }),
      staticAbility("self", { power: 2, toughness: 2 }, { condition: cond.lifeAtLeast(25), label: "+2/+2 à 25 PV ou plus" }),
    ],
  },
  "Angelic Destiny": {
    enchant: { filter: { types: ["Creature"] }, label: "créature" },
    abilities: [
      staticAbility(
        "attached",
        { power: 4, toughness: 4, addKeywords: ["flying", "firstStrike"], addSubtypes: ["Angel"] },
        { label: "+4/+4, vol, initiative, Ange" },
      ),
      triggered(when.dies({ attachedToSource: true }), [fx.toHand(ref.selfCard)], { label: "revient en main" }),
    ],
  },
  "Angelic Edict": {
    spell: spell(
      [targetObj("t", { types: ["Creature", "Enchantment"] }, "créature ou enchantement")],
      [fx.exileCard(ref.target())],
    ),
  },
  "Archway Angel": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.gainLife(
            amount.plus(
              amount.count({ subtype: "Gate", controller: "you" }),
              amount.count({ subtype: "Gate", controller: "you" }),
            ),
          ),
        ],
        {
          label: "2 PV par Porte",
        },
      ),
    ],
  },
  "Ballyrush Banneret": {
    abilities: [costReducer({ anySubtype: ["Kithkin", "Soldier"] }, 1, "Kithkins et Soldats : {1} de moins")],
  },
  "Charming Prince": {
    abilities: [
      triggeredModal(when.entersSelf, [
        mode("Regard 2", [], [fx.scry(2)]),
        mode("Vous gagnez 3 PV", [], [fx.gainLife(3)]),
        mode(
          "Exiler une autre créature (retour à l'étape de fin)",
          [target.creature("t", { controller: "you", other: true })],
          [
            fx.exileCard(ref.target(), { name: "p" }),
            fx.delayed([fx.toBattlefield(ref.target("p"), { underYourControl: true })], { p: ref.stored("p") }),
          ],
        ),
      ]),
    ],
  },
  "Crusader of Odric": { cdaPT: amount.count({ types: ["Creature"], controller: "you" }) },
  "Dawnwing Marshal": {
    abilities: [activated({ mana: "{4}{W}", effects: [fx.pumpAll({ controller: "you" }, 1, 1)], label: "Vos créatures +1/+1" })],
  },
  "Deadly Riposte": {
    spell: spell(
      [targetObj("t", { types: ["Creature"], tapped: true }, "créature engagée")],
      [fx.damage(3, ref.target()), fx.gainLife(2)],
    ),
  },
  "Devout Decree": {
    spell: spell(
      [targetObj("t", { types: ["Creature", "Planeswalker"], colors: ["B", "R"] }, "créature ou planeswalker noir ou rouge")],
      [fx.exileCard(ref.target()), fx.scry(1)],
    ),
  },
  Disenchant: {
    spell: spell(
      [target.permanent("t", ["Artifact", "Enchantment"], {}, "artefact ou enchantement")],
      [fx.destroy(ref.target())],
    ),
  },
  "Elspeth's Smite": {
    spell: spell(
      [targetObj("t", { types: ["Creature"], inCombat: true }, "créature attaquante ou bloqueuse")],
      [fx.exileIfDies(ref.target()), fx.damage(3, ref.target())],
    ),
  },
  "Felidar Cub": {
    abilities: [
      activated({
        sacrifice: true,
        targets: [target.permanent("t", ["Enchantment"], {}, "enchantement")],
        effects: [fx.destroy(ref.target())],
        label: "Détruire un enchantement",
      }),
    ],
  },
  "Felidar Retreat": {
    abilities: [
      triggeredModal(when.landfall, [
        mode("Chat Bête 2/2", [], [fx.createTokens(CAT_BEAST)]),
        mode(
          "Marqueur +1/+1 sur chaque créature, vigilance",
          [],
          [fx.addCountersAll(CREATURE_YOU_CONTROL), fx.modifyAll(CREATURE_YOU_CONTROL, { addKeywords: ["vigilance"] })],
        ),
      ]),
    ],
  },
  Fumigate: { spell: spell([], [fx.destroyAll({ types: ["Creature"] }, "dead"), fx.gainLife(amount.v("dead"))]) },
  "Herald of Faith": { abilities: [triggered(when.attacksSelf, [fx.gainLife(2)], { label: "+2 PV" })] },
  "Hinterland Sanctifier": {
    abilities: [triggered(when.enters(OTHER_CREATURE_YOU_CONTROL), [fx.gainLife(1)], { label: "+1 PV" })],
  },
  "Ingenious Leonin": {
    abilities: [
      activated({
        mana: "{3}{W}",
        targets: [
          targetObj(
            "t",
            { types: ["Creature"], controller: "you", attacking: true, other: true },
            "autre créature attaquante à vous",
          ),
        ],
        effects: [
          fx.addCounters(ref.target(), 1),
          ...fx.when(cond.refMatches(ref.target(), { subtype: "Cat" }), fx.pump(ref.target(), 0, 0, ["firstStrike"])),
        ],
        label: "Marqueur +1/+1 (initiative si Chat)",
      }),
    ],
  },
  "Inspiring Overseer": {
    abilities: [triggered(when.entersSelf, [fx.gainLife(1), fx.draw(1)], { label: "+1 PV, piochez" })],
  },
  "Jazal Goldmane": {
    abilities: [
      activated({
        mana: "{3}{W}{W}",
        effects: [
          fx.pumpAll(
            { controller: "you", attacking: true },
            amount.count({ types: ["Creature"], controller: "you", attacking: true }),
            amount.count({ types: ["Creature"], controller: "you", attacking: true }),
          ),
        ],
        label: "Attaquants +X/+X",
      }),
    ],
  },
  "Knight of Grace": {
    keywords: ["hexproofFromBlack"],
    abilities: [
      staticAbility(
        "self",
        { power: 1 },
        { condition: cond.battlefieldCount({ colors: ["B"] }, 1), label: "+1/+0 (permanent noir)" },
      ),
    ],
  },
  "Leonin Vanguard": {
    abilities: [
      triggered(when.yourCombat, [fx.pump(ref.self, 1, 1), fx.gainLife(1)], {
        condition: cond.controls({ types: ["Creature"] }, 3),
        label: "+1/+1 et +1 PV",
      }),
    ],
  },
  "Linden, the Steadfast Queen": {
    abilities: [
      triggered(when.attacks({ types: ["Creature"], controller: "you", colors: ["W"] }), [fx.gainLife(1)], { label: "+1 PV" }),
    ],
  },
  "Lyra Dawnbringer": {
    abilities: [
      staticAbility(
        { ...OTHER_CREATURE_YOU_CONTROL, subtype: "Angel" },
        { power: 1, toughness: 1, addKeywords: ["lifelink"] },
        {
          label: "Autres Anges +1/+1 et lien de vie",
        },
      ),
    ],
  },
  "Make a Stand": {
    spell: spell([], [fx.pumpAll({ controller: "you" }, 1, 0, ["indestructible"])]),
  },
  "Mentor of the Meek": {
    abilities: [
      triggered(
        when.enters({ ...OTHER_CREATURE_YOU_CONTROL, maxPower: 2 }),
        fx.mayPay("{1}", "Payer {1} pour piocher une carte ?", fx.draw(1)),
        { label: "{1} : piochez" },
      ),
    ],
  },
  "Moment of Triumph": { spell: spell([target.creature()], [fx.pump(ref.target(), 2, 2), fx.gainLife(2)]) },
  Pacifism: {
    enchant: { filter: { types: ["Creature"] }, label: "créature" },
    abilities: [
      staticAbility("attached", { addKeywords: ["cantAttack", "cantBlock"] }, { label: "Ne peut ni attaquer ni bloquer" }),
    ],
  },
  "Prayer of Binding": {
    abilities: [
      triggered(when.entersSelf, [fx.exileUntilLeaves(ref.target()), fx.gainLife(2)], {
        targets: [target.optional(target.nonland("t", { controller: "opponent" }, "permanent non-terrain adverse"))],
        label: "exile jusqu'à son départ, +2 PV",
      }),
    ],
  },
  "Regal Caracal": {
    abilities: [
      staticAbility(
        { ...OTHER_CREATURE_YOU_CONTROL, subtype: "Cat" },
        { power: 1, toughness: 1, addKeywords: ["lifelink"] },
        {
          label: "Autres Chats +1/+1 et lien de vie",
        },
      ),
      triggered(when.entersSelf, [fx.createTokens(CAT_LIFELINK, 2)], { label: "deux Chats 1/1" }),
    ],
  },
  "Release the Dogs": { spell: spell([], [fx.createTokens(DOG, 4)]) },
  "Stasis Snare": {
    abilities: [
      triggered(when.entersSelf, [fx.exileUntilLeaves(ref.target())], {
        targets: [target.creature("t", { controller: "opponent" })],
        label: "exile jusqu'à son départ",
      }),
    ],
  },
  "Syr Alin, the Lion's Claw": {
    abilities: [
      triggered(when.attacksSelf, [fx.pumpAll({ controller: "you", other: true }, 1, 1)], { label: "autres créatures +1/+1" }),
    ],
  },
  "Twinblade Paladin": {
    abilities: [
      triggered(when.gainLife, [fx.addCounters(ref.self, 1)], { label: "marqueur +1/+1" }),
      staticAbility(
        "self",
        { addKeywords: ["doubleStrike"] },
        { condition: cond.lifeAtLeast(25), label: "Double initiative à 25 PV" },
      ),
    ],
  },
  "Valorous Stance": {
    spell: modal(
      mode("Indestructible", [target.creature()], [fx.pump(ref.target(), 0, 0, ["indestructible"])]),
      mode(
        "Détruire une créature d'endurance 4 ou plus",
        [target.creature("t", { minToughness: 4 })],
        [fx.destroy(ref.target())],
      ),
    ),
  },
};
