/** Foundations — cartes noires. */
import {
  activated,
  amount,
  type CardScript,
  CREATURE_OPP,
  CREATURE_YOU_CONTROL,
  castPermission,
  cond,
  cost,
  entersWith,
  FOOD,
  fx,
  INSECT,
  modal,
  mode,
  RAT,
  ref,
  spell,
  staticAbility,
  TREASURE,
  target,
  targetObj,
  triggered,
  triggeredModal,
  when,
  ZOMBIE,
} from "./common";

const ANOTHER_CREATURE = { types: ["Creature" as const], other: true };

export const BLACK: Record<string, CardScript> = {
  "Arbiter of Woe": {
    additionalCost: { sacrifice: { filter: { types: ["Creature"] }, count: 1 } },
    abilities: [
      triggered(
        when.entersSelf,
        [fx.discard(1, ref.eachOpponent), fx.loseLife(2, ref.eachOpponent), fx.draw(1), fx.gainLife(2)],
        { label: "défausse, -2 PV ; vous piochez, +2 PV" },
      ),
    ],
  },
  "Diregraf Ghoul": { abilities: [entersWith({ tapped: true })] },
  "Billowing Shriekmass": {
    abilities: [
      triggered(when.entersSelf, [fx.mill(3)], { label: "meule 3" }),
      staticAbility("self", { power: 2, toughness: 1 }, { condition: cond.threshold, label: "Seuil : +2/+1" }),
    ],
  },
  "Bloodthirsty Conqueror": {
    abilities: [triggered(when.loseLife("opponent"), [fx.gainLife(amount.eventAmount)], { label: "gagnez autant de PV" })],
  },
  "Crypt Feaster": {
    abilities: [triggered(when.attacksSelf, [fx.pump(ref.self, 2, 0)], { condition: cond.threshold, label: "Seuil : +2/+0" })],
  },
  "Gutless Plunderer": {
    abilities: [
      triggered(when.entersSelf, [fx.lookAtTop(3, { count: 1, to: { to: "libraryTop" }, rest: "graveyard" })], {
        condition: cond.raid,
        label: "Raid : regard 3",
      }),
    ],
  },
  "High-Society Hunter": {
    abilities: [
      triggered(
        when.attacksSelf,
        [
          fx.sacrifice(ref.you, ANOTHER_CREATURE, 1, { optional: true, store: "sac" }),
          ...fx.when(cond.v("sac"), fx.addCounters(ref.self, 1)),
        ],
        { label: "sacrifice possible : marqueur +1/+1" },
      ),
      triggered(when.dies({ types: ["Creature"], nontoken: true, other: true }), [fx.draw(1)], { label: "piochez une carte" }),
    ],
  },
  "Hungry Ghoul": {
    abilities: [
      activated({
        mana: "{1}",
        sacrificeOther: { filter: { types: ["Creature"] } },
        effects: [fx.addCounters(ref.self, 1)],
        label: "Sacrifier une créature : marqueur +1/+1",
      }),
    ],
  },
  "Infernal Vessel": {
    abilities: [
      triggered(
        when.dies({ self: true, notSubtype: "Demon" }),
        [fx.toBattlefield(ref.eventObject, { counters: { kind: "+1/+1", n: 2 }, addSubtypes: ["Demon"] })],
        { label: "revient en Démon" },
      ),
    ],
  },
  "Infestation Sage": { abilities: [triggered(when.diesSelf, [fx.createTokens(INSECT)], { label: "Insecte 1/1 volant" })] },
  "Midnight Snack": {
    abilities: [
      triggered(when.yourEndStep, [fx.createTokens(FOOD)], { condition: cond.raid, label: "Raid : Nourriture" }),
      activated({
        mana: "{2}{B}",
        sacrifice: true,
        targets: [target.player("t", "opponent")],
        effects: [fx.loseLife(amount.lifeGainedThisTurn, ref.target())],
        label: "L'adversaire perd la vie gagnée ce tour",
      }),
    ],
  },
  "Revenge of the Rats": {
    flashback: "{2}{B}{B}",
    spell: spell([], [fx.createTokens({ ...RAT, tapped: true }, amount.countIn("graveyard", { types: ["Creature"] }))]),
  },
  "Sanguine Syphoner": { abilities: [triggered(when.attacksSelf, fx.drain(1), { label: "draine 1" })] },
  "Seeker's Folly": {
    spell: modal(
      mode("L'adversaire ciblé défausse deux cartes", [target.player("t", "opponent")], [fx.discard(2, ref.target())]),
      mode("Créatures adverses -1/-1", [], [fx.pumpAll({ controller: "opponent" }, -1, -1)]),
    ),
  },
  "Soul-Shackled Zombie": {
    abilities: [
      triggered(
        when.entersSelf,
        [fx.exileCard(ref.target(), { name: "ex", filter: { types: ["Creature"] } }), ...fx.when(cond.v("ex"), fx.drain(2))],
        {
          targets: [
            { ...target.upTo(2, target.cardInGraveyard("t", {}, "any")), samePlayer: true, label: "cartes d'un même cimetière" },
          ],
          label: "exile jusqu'à deux cartes",
        },
      ),
    ],
  },
  Stab: { spell: spell([target.creature()], [fx.pump(ref.target(), -2, -2)]) },
  "Tragic Banshee": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          ...fx.when(cond.not(cond.morbid), fx.pump(ref.target(), -1, -1)),
          ...fx.when(cond.morbid, fx.pump(ref.target(), -13, -13)),
        ],
        { targets: [target.creature("t", { controller: "opponent" })], label: "-1/-1 (Morbide : -13/-13)" },
      ),
    ],
  },
  "Vampire Gourmand": {
    abilities: [
      triggered(
        when.attacksSelf,
        [
          fx.sacrifice(ref.you, ANOTHER_CREATURE, 1, { optional: true, store: "sac" }),
          ...fx.when(cond.v("sac"), fx.draw(1), fx.modify(ref.self, { addKeywords: ["unblockable"] })),
        ],
        { label: "sacrifice possible : pioche, imblocable" },
      ),
    ],
  },
  "Vampire Soulcaller": {
    keywords: ["cantBlock"],
    abilities: [
      triggered(when.entersSelf, [fx.toHand(ref.target())], {
        targets: [target.cardInGraveyard("t", { types: ["Creature"] })],
        label: "récupère une créature",
      }),
    ],
  },
  "Vengeful Bloodwitch": {
    abilities: [
      triggered(when.dies(CREATURE_YOU_CONTROL), fx.drain(1, ref.target()), {
        targets: [target.player("t", "opponent")],
        label: "draine 1",
      }),
    ],
  },
  "Bake into a Pie": { spell: spell([target.creature()], [fx.destroy(ref.target()), fx.createTokens(FOOD)]) },
  "Burglar Rat": {
    abilities: [triggered(when.entersSelf, [fx.discard(1, ref.eachOpponent)], { label: "chaque adversaire défausse" })],
  },
  Exsanguinate: {
    spell: spell([], [fx.loseLife(amount.x, ref.eachOpponent, "lost"), fx.gainLife(amount.v("lost"))]),
  },
  "Fake Your Own Death": {
    spell: spell(
      [target.creature()],
      [
        fx.pump(ref.target(), 2, 0),
        fx.modify(ref.target(), {
          addAbilities: [
            triggered(when.diesSelf, [fx.toBattlefield(ref.eventObject, { tapped: true }), fx.createTokens(TREASURE)], {
              label: "revient engagée, Trésor",
            }),
          ],
        }),
      ],
    ),
  },
  "Hero's Downfall": { spell: spell([target.creatureOrPlaneswalker()], [fx.destroy(ref.target())]) },
  "Macabre Waltz": {
    spell: spell(
      [target.upTo(2, target.cardInGraveyard("t", { types: ["Creature"] }, "you", "cartes de créature de votre cimetière"))],
      [fx.toHand(ref.target()), fx.discard(1)],
    ),
  },
  "Marauding Blight-Priest": {
    abilities: [triggered(when.gainLife, [fx.loseLife(1, ref.eachOpponent)], { label: "chaque adversaire perd 1 PV" })],
  },
  "Painful Quandary": {
    abilities: [
      triggered(when.castSpell("opponent"), [fx.punisher(ref.eventPlayer, 5, { discard: true })], {
        label: "perd 5 PV sauf défausse",
      }),
    ],
  },
  "Phyrexian Arena": {
    abilities: [triggered(when.yourUpkeep, [fx.draw(1), fx.loseLife(1)], { label: "piochez, perdez 1 PV" })],
  },
  Pilfer: {
    spell: spell(
      [target.player("t", "opponent")],
      [fx.discard(1, ref.target(), { filter: { nonland: true }, chooser: "controller" })],
    ),
  },
  "Reassembling Skeleton": {
    abilities: [
      activated({
        mana: "{1}{B}",
        fromGraveyard: true,
        effects: [fx.toBattlefield(ref.self, { tapped: true })],
        label: "Revenir du cimetière",
      }),
    ],
  },
  "Rise of the Dark Realms": {
    spell: spell(
      [],
      [fx.moveAll("graveyard", ref.eachPlayer, { types: ["Creature"] }, { to: "battlefield", underYourControl: true })],
    ),
  },
  "Rune-Scarred Demon": {
    abilities: [triggered(when.entersSelf, [fx.search({})], { label: "cherche une carte" })],
  },
  "Stromkirk Bloodthief": {
    abilities: [
      triggered(when.yourEndStep, [fx.addCounters(ref.target(), 1)], {
        targets: [target.creature("t", { controller: "you", subtype: "Vampire" })],
        condition: cond.opponentLostLife,
        label: "marqueur +1/+1 sur un Vampire",
      }),
    ],
  },
  "Zul Ashur, Lich Lord": {
    abilities: [
      activated({
        tap: true,
        targets: [target.cardInGraveyard("t", { types: ["Creature"], subtype: "Zombie" }, "you", "carte de créature Zombie")],
        effects: [fx.allowCastFromGraveyard(ref.target())],
        label: "Permettre de lancer un Zombie du cimetière",
      }),
    ],
  },
  Zombify: { spell: spell([target.cardInGraveyard("t", { types: ["Creature"] })], [fx.toBattlefield(ref.target())]) },
  "Abyssal Harvester": {
    abilities: [
      activated({
        tap: true,
        targets: [
          target.cardInGraveyard(
            "t",
            { types: ["Creature"], enteredThisTurn: true },
            "any",
            "carte de créature mise dans un cimetière ce tour-ci",
          ),
        ],
        effects: [
          // « Puis exilez tous les autres jetons Cauchemar que vous contrôlez » : fait avant la création (même résultat).
          fx.moveAll("battlefield", ref.you, { subtype: "Nightmare", token: true }, { to: "exile" }),
          fx.exileCard(ref.target(), { name: "h" }),
          fx.copyToken(ref.stored("h"), { addSubtypes: ["Nightmare"] }),
        ],
        label: "Exiler et copier une créature morte ce tour-ci",
      }),
    ],
  },
  "Blasphemous Edict": {
    altCost: {
      mana: "{B}",
      condition: cond.battlefieldCount({ types: ["Creature"] }, 13),
      label: "Payer {B} (13 créatures ou plus en jeu)",
    },
    spell: spell([], [fx.sacrifice(ref.eachPlayer, { types: ["Creature"] }, 13)]),
  },
  "Nine-Lives Familiar": {
    abilities: [
      entersWith({ counters: 8, counterKind: "revival", condition: cond.wasCast, label: "Huit marqueurs de résurrection" }),
      triggered(
        when.diesSelf,
        [
          fx.delayed(
            [
              fx.moveTo(ref.target("k"), { to: "battlefield" }, { name: "back" }),
              fx.counters(ref.stored("back"), "revival", amount.v("rev")),
            ],
            { k: ref.eventObject },
            { rev: amount.plus(amount.lkiCounters("revival"), -1) },
          ),
        ],
        { condition: cond.counterAtLeast("revival", 1), label: "revient à l'étape de fin" },
      ),
    ],
  },
  "Tinybones, Bauble Burglar": {
    abilities: [
      triggered(when.discard("opponent"), [fx.moveTo(ref.eventObject, { to: "exile", counters: { kind: "stash", n: 1 } })], {
        label: "exile avec un marqueur de butin",
      }),
      castPermission({ stash: true, label: "Jouer les cartes de butin" }),
      activated({
        mana: "{3}{B}",
        tap: true,
        sorcerySpeed: true,
        effects: [fx.discard(1, ref.eachOpponent)],
        label: "Chaque adversaire défausse une carte",
      }),
    ],
  },
  "Eaten Alive": {
    additionalCost: { sacrifice: { filter: { types: ["Creature"] }, count: 1, orPay: cost("{3}{B}") } },
    spell: spell([target.creatureOrPlaneswalker()], [fx.exileCard(ref.target())]),
  },

  // --- Réimpressions ---
  "Bloodtithe Collector": {
    abilities: [
      triggered(when.entersSelf, [fx.discard(1, ref.eachOpponent)], {
        condition: cond.opponentLostLife,
        label: "chaque adversaire défausse",
      }),
    ],
  },
  "Cemetery Recruitment": {
    spell: spell(
      [target.cardInGraveyard("t", { types: ["Creature"] })],
      [
        fx.moveTo(ref.target(), { to: "hand" }, { name: "z", filter: { subtype: "Zombie" } }),
        ...fx.when(cond.v("z"), fx.draw(1)),
      ],
    ),
  },
  "Crossway Troublemakers": {
    abilities: [
      staticAbility(
        { types: ["Creature"], subtype: "Vampire", controller: "you", attacking: true },
        { addKeywords: ["deathtouch", "lifelink"] },
        {
          label: "Vampires attaquants : contact mortel, lien de vie",
        },
      ),
      triggered(
        when.dies({ types: ["Creature"], subtype: "Vampire", controller: "you" }),
        fx.mayPayLife(2, "Payer 2 PV pour piocher ?", fx.draw(1)),
        { label: "2 PV : piochez" },
      ),
    ],
  },
  "Crow of Dark Tidings": {
    abilities: [
      triggered(when.entersSelf, [fx.mill(2)], { label: "meule 2" }),
      triggered(when.diesSelf, [fx.mill(2)], { label: "meule 2" }),
    ],
  },
  "Deadly Plot": {
    spell: modal(
      mode("Détruire une créature ou un planeswalker", [target.creatureOrPlaneswalker()], [fx.destroy(ref.target())]),
      mode(
        "Réanimer un Zombie engagé",
        [target.cardInGraveyard("t", { types: ["Creature"], subtype: "Zombie" }, "you", "carte de créature Zombie")],
        [fx.toBattlefield(ref.target(), { tapped: true })],
      ),
    ),
  },
  "Death Baron": {
    abilities: [
      staticAbility(
        { types: ["Creature"], subtype: "Skeleton", controller: "you" },
        { power: 1, toughness: 1, addKeywords: ["deathtouch"] },
      ),
      staticAbility(
        { types: ["Creature"], subtype: "Zombie", controller: "you", other: true },
        { power: 1, toughness: 1, addKeywords: ["deathtouch"] },
      ),
    ],
  },
  Deathmark: {
    spell: spell(
      [targetObj("t", { types: ["Creature"], colors: ["G", "W"] }, "créature verte ou blanche")],
      [fx.destroy(ref.target())],
    ),
  },
  "Demonic Pact": {
    abilities: [
      triggeredModal(
        when.yourUpkeep,
        [
          mode("4 blessures et +4 PV", [target.any()], [fx.damage(4, ref.target(), ref.self), fx.gainLife(4)]),
          mode("Un adversaire défausse deux cartes", [target.player("t", "opponent")], [fx.discard(2, ref.target())]),
          mode("Piochez deux cartes", [], [fx.draw(2)]),
          mode("Vous perdez la partie", [], [fx.loseGame]),
        ],
        { uniqueModes: true, label: "mode pas encore choisi" },
      ),
    ],
  },
  "Desecration Demon": {
    abilities: [
      triggered(
        when.step("beginCombat", "any"),
        [
          fx.sacrifice(ref.eachOpponent, { types: ["Creature"] }, 1, { optional: true, store: "sac" }),
          ...fx.when(cond.v("sac"), fx.tap(ref.self), fx.addCounters(ref.self, 1)),
        ],
        { label: "un adversaire peut sacrifier une créature" },
      ),
    ],
  },
  "Dread Summons": {
    spell: spell(
      [],
      [
        fx.mill(amount.x, ref.eachPlayer, { name: "c", filter: { types: ["Creature"] } }),
        fx.createTokens({ ...ZOMBIE, tapped: true }, amount.v("c")),
      ],
    ),
  },
  "Driver of the Dead": {
    abilities: [
      triggered(when.diesSelf, [fx.toBattlefield(ref.target())], {
        targets: [target.cardInGraveyard("t", { types: ["Creature"], maxManaValue: 2 })],
        label: "réanime une créature de valeur 2 ou moins",
      }),
    ],
  },
  Duress: {
    spell: spell(
      [target.player("t", "opponent")],
      [fx.discard(1, ref.target(), { filter: { notTypes: ["Creature", "Land"] }, chooser: "controller" })],
    ),
  },
  "Feed the Swarm": {
    spell: spell(
      [targetObj("t", { types: ["Creature", "Enchantment"], controller: "opponent" }, "créature ou enchantement adverse")],
      [fx.destroy(ref.target()), fx.loseLife(amount.manaValueOf(ref.target()))],
    ),
  },
  "Gatekeeper of Malakir": {
    kicker: "{B}",
    abilities: [
      triggered(when.entersSelf, [fx.sacrifice(ref.target(), { types: ["Creature"] })], {
        targets: [target.player()],
        condition: cond.kicked,
        label: "Kicker : le joueur sacrifie une créature",
      }),
    ],
  },
  "Kalastria Highborn": {
    abilities: [
      triggered(
        when.dies({ types: ["Creature"], subtype: "Vampire", controller: "you" }),
        fx.mayPay("{B}", "Payer {B} : le joueur ciblé perd 2 PV et vous en gagnez 2 ?", fx.drain(2, ref.target())),
        { targets: [target.player()], label: "{B} : draine 2" },
      ),
    ],
  },
  "Knight of Malice": {
    keywords: ["hexproofFromWhite"],
    abilities: [
      staticAbility(
        "self",
        { power: 1 },
        { condition: cond.battlefieldCount({ colors: ["W"] }, 1), label: "+1/+0 (permanent blanc)" },
      ),
    ],
  },
  "Maalfeld Twins": { abilities: [triggered(when.diesSelf, [fx.createTokens(ZOMBIE, 2)], { label: "deux Zombies 2/2" })] },
  "Massacre Wurm": {
    abilities: [
      triggered(when.entersSelf, [fx.pumpAll({ controller: "opponent" }, -2, -2)], { label: "créatures adverses -2/-2" }),
      triggered(when.dies(CREATURE_OPP), [fx.loseLife(2, ref.eventPlayer)], { label: "son contrôleur perd 2 PV" }),
    ],
  },
  "Midnight Reaper": {
    abilities: [
      triggered(when.dies({ ...CREATURE_YOU_CONTROL, nontoken: true }), [fx.damage(1, ref.you, ref.self), fx.draw(1)], {
        label: "1 blessure, piochez",
      }),
    ],
  },
  "Moment of Craving": { spell: spell([target.creature()], [fx.pump(ref.target(), -2, -2), fx.gainLife(2)]) },
  "Myojin of Night's Reach": {
    abilities: [
      entersWith({ counters: 1, counterKind: "divinity", condition: cond.castFromHand, label: "Marqueur de divinité" }),
      staticAbility(
        "self",
        { addKeywords: ["indestructible"] },
        { condition: cond.counterAtLeast("divinity", 1), label: "Indestructible" },
      ),
      activated({
        removeCounters: { kind: "divinity", n: 1 },
        effects: [fx.discard(99, ref.eachOpponent)],
        label: "Chaque adversaire défausse sa main",
      }),
    ],
  },
  "Nullpriest of Oblivion": {
    kicker: "{3}{B}",
    abilities: [
      triggered(when.entersSelf, [fx.toBattlefield(ref.target())], {
        targets: [target.cardInGraveyard("t", { types: ["Creature"] })],
        condition: cond.kicked,
        label: "Kicker : réanime une créature",
      }),
    ],
  },
  "Offer Immortality": { spell: spell([target.creature()], [fx.pump(ref.target(), 0, 0, ["deathtouch", "indestructible"])]) },
  "Pulse Tracker": {
    abilities: [triggered(when.attacksSelf, [fx.loseLife(1, ref.eachOpponent)], { label: "chaque adversaire perd 1 PV" })],
  },
  "Sanguine Indulgence": {
    costReduction: { generic: 3, condition: cond.lifeGainedAtLeast(3) },
    spell: spell(
      [target.upTo(2, target.cardInGraveyard("t", { types: ["Creature"] }, "you", "cartes de créature de votre cimetière"))],
      [fx.toHand(ref.target())],
    ),
  },
  "Skeleton Archer": {
    abilities: [
      triggered(when.entersSelf, [fx.damage(1, ref.target(), ref.self)], { targets: [target.any()], label: "1 blessure" }),
    ],
  },
  "Suspicious Shambler": {
    abilities: [
      activated({
        mana: "{4}{B}{B}",
        fromGraveyard: true,
        exileSelf: true,
        sorcerySpeed: true,
        effects: [fx.createTokens(ZOMBIE, 2)],
        label: "Exiler du cimetière : deux Zombies",
      }),
    ],
  },
  "Tribute to Hunger": {
    spell: spell(
      [target.player("t", "opponent")],
      [fx.sacrifice(ref.target(), { types: ["Creature"] }, 1, { store: "s" }), fx.gainLife(amount.toughnessOf(ref.stored("s")))],
    ),
  },
  "Undying Malice": {
    spell: spell(
      [target.creature()],
      [
        fx.modify(ref.target(), {
          addAbilities: [
            triggered(when.diesSelf, [fx.toBattlefield(ref.eventObject, { tapped: true, counters: { kind: "+1/+1", n: 1 } })], {
              label: "revient engagée avec un marqueur",
            }),
          ],
        }),
      ],
    ),
  },
  "Untamed Hunger": {
    enchant: { filter: { types: ["Creature"] }, label: "créature" },
    abilities: [staticAbility("attached", { power: 2, toughness: 1, addKeywords: ["menace"] }, { label: "+2/+1 et menace" })],
  },
  "Vampire Interloper": { keywords: ["cantBlock"] },
  "Vampire Neonate": {
    abilities: [activated({ mana: "{2}", tap: true, effects: fx.drain(1), label: "Draine 1" })],
  },
  "Vampire Spawn": { abilities: [triggered(when.entersSelf, fx.drain(2), { label: "draine 2" })] },
  "Vampiric Rites": {
    abilities: [
      activated({
        mana: "{1}{B}",
        sacrificeOther: { filter: { types: ["Creature"] } },
        effects: [fx.gainLife(1), fx.draw(1)],
        label: "Sacrifier une créature : +1 PV, piochez",
      }),
    ],
  },
  "Vile Entomber": {
    abilities: [triggered(when.entersSelf, [fx.search({}, { to: "graveyard" })], { label: "une carte au cimetière" })],
  },
  "Wishclaw Talisman": {
    abilities: [
      entersWith({ counters: 3, counterKind: "wish", label: "Trois marqueurs de souhait" }),
      activated({
        mana: "{1}",
        tap: true,
        removeCounters: { kind: "wish", n: 1 },
        activationCondition: cond.yourTurn,
        effects: [fx.search({}), fx.giveControl(ref.self, ref.eachOpponent)],
        label: "Chercher une carte (un adversaire prend le talisman)",
      }),
    ],
  },
};
