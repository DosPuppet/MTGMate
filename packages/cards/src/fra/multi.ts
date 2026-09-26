/** Reality Fracture — cartes multicolores. */
import {
  activated,
  amount,
  CADET,
  type CardScript,
  CREATURE_YOU_CONTROL,
  cond,
  costReducer,
  empower,
  entersWith,
  fx,
  HEARTWOOD,
  LEVIATHAN,
  LOTUS,
  loyalty,
  modal,
  mode,
  OMIT_VARIABLES,
  PEER_REVIEW,
  ref,
  SCULPTURE_TREASURE,
  SEED_SUTURE,
  SOUL_TETHER,
  spell,
  staticAbility,
  THOPTER,
  TREASURE,
  target,
  targetObj,
  triggered,
  triggeredModal,
  VICIOUS_VERSE,
  walkersHave,
  when,
} from "./common";

/** « Renvoyez cette carte du cimetière sur le champ de bataille avec un marqueur de finalité. » */
const returnWithFinality = (mana: string, activationCondition: Parameters<typeof activated>[0]["activationCondition"]) =>
  activated({
    mana,
    fromGraveyard: true,
    activationCondition,
    effects: [fx.toBattlefield(ref.self, { counters: { kind: "finality", n: 1 } })],
    label: "Revenir avec un marqueur de finalité",
  });

export const MULTI: Record<string, CardScript> = {
  "Aerid Konstrari": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(HEARTWOOD)], { label: "Heartwood" }),
      triggered(when.diesSelf, [fx.createTokens(HEARTWOOD)], { label: "Heartwood" }),
      activated({
        mana: "{6}",
        effects: [fx.createTokens(HEARTWOOD), fx.pump(ref.self, amount.count({ types: ["Artifact"], controller: "you" }), 0)],
        label: "Heartwood, puis +X/+0",
      }),
    ],
  },
  "Blessed Ghoul": {
    abilities: [activated({ mana: "{2}{W/B}", fromGraveyard: true, effects: [fx.toHand(ref.self)], label: "Revenir en main" })],
  },
  Bloombrute: {
    abilities: [
      triggered(when.gainLife, [fx.draw(1)], { oncePerTurn: true, label: "piochez une carte" }),
      activated({
        mana: "{4}{G}{W}",
        targets: [target.creature("t")],
        effects: [fx.modify(ref.target(), { addKeywords: ["trample", "lifelink"] })],
        label: "Piétinement et lien de vie",
      }),
    ],
  },
  "Charge the Sanctum": {
    spell: modal(
      mode("Vos créatures +2/+0", [], [fx.pumpAll(CREATURE_YOU_CONTROL, 2, 0)]),
      mode(
        "+2/+0, initiative et marqueur +1/+1",
        [target.creature("t")],
        [fx.pump(ref.target(), 2, 0, ["firstStrike"]), fx.addCounters(ref.target(), 1)],
      ),
    ),
  },
  "Denzilore Fatehold": {
    abilities: [
      triggered(when.scryOrSurveil, [fx.addCountersAll(CREATURE_YOU_CONTROL, 1)], {
        label: "regard/surveillance : marqueur sur chaque créature",
      }),
    ],
  },
  "Desperate Futurescribe": {
    abilities: [
      triggered(
        when.yourCombat,
        [
          ...fx.when(cond.scried, fx.addCounters(ref.target(), 1)),
          ...fx.when(cond.not(cond.scried), fx.pump(ref.target(), 1, 1)),
        ],
        { targets: [target.creature("t", { controller: "you", other: true })], label: "+1/+1 (ou marqueur)" },
      ),
    ],
  },
  "Ferocity of the Hunt": {
    enchant: { filter: { types: ["Creature"] }, label: "créature" },
    abilities: [
      staticAbility("attached", { power: 1, addKeywords: ["deathtouch"] }, { label: "+1/+0 et contact mortel" }),
      triggered(when.dies({ attachedToSource: true }), [fx.toBattlefield(ref.eventObject, { tapped: true })], {
        label: "revient engagée",
      }),
    ],
  },
  "Frostbite Pyromental": {
    abilities: [
      triggered(when.combatDamageToPlayer, [fx.draw(2)], { label: "piochez deux cartes" }),
      triggered(when.eachEndStep, [fx.sacrificeIt(ref.self)], { label: "sacrifiée" }),
    ],
  },
  "Grim Repriser": { abilities: [returnWithFinality("{B}{R}", cond.opponentDealtNoncombatDamage)] },
  "Ingris Stingerquill": {
    abilities: [
      triggered(when.attacks({ types: ["Creature"], controller: "you" }), [fx.damage(1, ref.eachOpponent, ref.eventObject)], {
        label: "l'attaquant inflige 1 blessure",
      }),
      activated({
        mana: "{4}",
        effects: [fx.createTokens(CADET), fx.pumpAll(CREATURE_YOU_CONTROL, 0, 0, ["haste"])],
        label: "Cadet, puis célérité",
      }),
    ],
  },
  "Konstrari Charm": {
    spell: modal(
      mode("6 blessures à une créature volante", [target.creature("t", { keyword: "flying" })], [fx.damage(6, ref.target())]),
      mode(
        "Deux marqueurs +1/+1 et piétinement",
        [target.creature("t")],
        [fx.addCounters(ref.target(), 2), fx.modify(ref.target(), { addKeywords: ["trample"] })],
      ),
      mode("Ajoutez {C}{C}{C}", [], [fx.addMana("C", "C", "C")]),
    ),
  },
  "Kwia Vigorbloom": {
    abilities: [triggered(when.gainLife, [fx.createTokens(LOTUS)], { oncePerTurn: true, label: "Lotus" })],
  },
  "Primal Witchstalker": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.mill(4),
          fx.reflexive(
            [target.cardInGraveyard("t", { types: ["Land"] }, "you", "carte de terrain de votre cimetière")],
            [fx.toBattlefield(ref.target(), { tapped: true })],
          ),
        ],
        { label: "meule 4, puis un terrain revient" },
      ),
    ],
  },
  "Proctor of Potential": {
    abilities: [
      triggered(when.enters({ types: ["Creature"], controller: "you" }), [fx.surveil(1)], { label: "surveillance 1" }),
      returnWithFinality("{W}{U}", cond.scried),
    ],
  },
  "Solarium Sentry": {
    abilities: [triggered(when.castSpell("opponent", { maxManaValue: 2 }), [fx.gainLife(2)], { label: "+2 PV" })],
  },
  "Solitary Cell": {
    abilities: [
      triggered(when.entersSelf, [fx.exileUntilLeaves(ref.target())], {
        targets: [
          target.nonland("t", { controller: "opponent", maxManaValue: 3 }, "permanent non-terrain adverse (VM 3 ou moins)"),
        ],
        label: "exile jusqu'à son départ",
      }),
      // Approximation : la défausse d'une carte légendaire est faite à la résolution (pas comme coût).
      activated({
        mana: "{1}",
        tap: true,
        effects: [fx.discard(1, ref.you, { filter: { legendary: true }, store: "d" }), ...fx.when(cond.v("d"), fx.draw(1))],
        label: "Défausser une carte légendaire : piochez",
      }),
    ],
  },
  "Stingerquill Charm": {
    spell: modal(
      mode("3 blessures", [target.any()], [fx.damage(3, ref.target())]),
      mode(
        "Initiative et contact mortel",
        [target.creature("t")],
        [fx.modify(ref.target(), { addKeywords: ["firstStrike", "deathtouch"] })],
      ),
      mode(
        "Cadet avec célérité",
        [],
        [fx.createTokens(CADET, 1, undefined, "cadet"), fx.modify(ref.stored("cadet"), { addKeywords: ["haste"] })],
      ),
    ),
  },
  "Stinging Vitriol": {
    spell: spell(
      [target.player("t", "opponent")],
      [fx.damage(2, ref.target()), fx.discard(1, ref.target(), { filter: { nonland: true }, chooser: "controller" })],
    ),
  },
  "Tenured Tethermage": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.sacrifice(ref.you, { types: ["Land"] }, 1, { optional: true, store: "s" }),
          ...fx.when(cond.v("s"), fx.createTokens({ ...HEARTWOOD, tapped: true }, 2)),
        ],
        { label: "sacrifier un terrain : deux Heartwood" },
      ),
      activated({
        tapOthers: { filter: { types: ["Artifact"], controller: "you" }, count: 2 },
        effects: [fx.addCounters(ref.self, 2)],
        label: "Deux marqueurs +1/+1",
      }),
    ],
  },
  "Theorix Charm": {
    spell: modal(
      mode(
        "Contrecarrer un sort non-créature, sauf {2}",
        [target.spell("t", { notTypes: ["Creature"] }, "sort non-créature")],
        fx.unlessPays(ref.controllerOf(ref.target()), { mana: "{2}" }, fx.counter(ref.target())),
      ),
      mode("-2/-2", [target.creature("t")], [fx.pump(ref.target(), -2, -2)]),
      mode("Meule 3, puis piochez", [], [fx.mill(3), fx.draw(1)]),
    ),
  },
  "Vigorbloom Charm": {
    spell: modal(
      mode(
        "Défense talismanique et indestructible",
        [targetObj("t", { permanent: true, controller: "you" }, "permanent que vous contrôlez")],
        [fx.modify(ref.target(), { addKeywords: ["hexproof", "indestructible"] })],
      ),
      mode("Piochez une carte, +3 PV", [], [fx.draw(1), fx.gainLife(3)]),
      mode(
        "Marqueur +1/+1, puis combat",
        [target.creature("a", { controller: "you" }), target.creature("b", { controller: "opponent" })],
        [fx.addCounters(ref.target("a"), 1), fx.fight(ref.target("a"), ref.target("b"))],
      ),
    ),
  },
  "Mabel, Valley Hero": {
    abilities: [
      triggered(when.enters({ types: ["Creature"], controller: "you" }), [fx.addCounters(ref.target(), 1)], {
        targets: [target.creature("t", { enteredThisTurn: true })],
        label: "marqueur sur une créature arrivée ce tour-ci",
      }),
    ],
  },
  "Saheeli, Jewel of Avishkar": {
    abilities: [
      staticAbility({ subtype: "Thopter", controller: "you" }, { addKeywords: ["haste"] }, { label: "Célérité (Thopters)" }),
      triggered(when.castSpell("you", { notTypes: ["Creature"] }), [fx.createTokens(THOPTER)], { label: "Thopter" }),
    ],
  },
  "Vraska, Soul of Stone": {
    abilities: [
      staticAbility(
        { types: ["Artifact"], controller: "you", anyOf: [{ types: ["Creature"] }] },
        { addKeywords: ["vigilance"] },
        {
          label: "Vigilance (créatures-artefacts)",
        },
      ),
      triggered(when.castSpell("you", { notTypes: ["Creature"] }), [fx.createTokens(SCULPTURE_TREASURE)], {
        label: "Sculpture Trésor",
      }),
    ],
  },
  "Vraska, the Cutting Glare": {
    abilities: [
      triggered(when.entersSelf, [fx.destroy(ref.target()), fx.createTokens(TREASURE, 1, ref.controllerOf(ref.target()))], {
        targets: [targetObj("t", { permanent: true, controller: "opponent" }, "permanent adverse")],
        condition: cond.controls({ types: ["Land"] }, 6),
        label: "six terrains : détruire un permanent",
      }),
    ],
  },
  "Emergency Phytomedic": { prepareSpell: SEED_SUTURE, abilities: [entersWith({ prepared: true })] },
  "Fatehold Chronologist": { prepareSpell: PEER_REVIEW, abilities: [entersWith({ prepared: true })] },
  "Konstrari Improviser": { prepareSpell: SOUL_TETHER, abilities: [entersWith({ prepared: true })] },
  "Paradox Shaper": {
    prepareSpell: OMIT_VARIABLES,
    abilities: [
      triggered(when.yourUpkeep, [fx.prepare(ref.self)], { condition: cond.not(cond.prepared), label: "devient préparée" }),
      activated({
        mana: "{2}",
        targets: [target.cardInGraveyard("t", {}, "you")],
        effects: [fx.moveTo(ref.target(), { to: "libraryBottom" })],
        label: "Carte du cimetière au-dessous de la bibliothèque",
      }),
    ],
  },
  "Prudent Fateseer": {
    prepareSpell: PEER_REVIEW,
    abilities: [
      entersWith({ prepared: true }),
      triggered(when.scryOrSurveil, [fx.pumpAll(CREATURE_YOU_CONTROL, 1, 0)], {
        oncePerTurn: true,
        label: "vos créatures +1/+0",
      }),
    ],
  },
  "Stingerquill Voxmancer": {
    prepareSpell: VICIOUS_VERSE,
    abilities: [
      triggered(when.yourUpkeep, [fx.prepare(ref.self)], { condition: cond.not(cond.prepared), label: "devient préparée" }),
    ],
  },
  "Theorix Metamage": {
    prepareSpell: OMIT_VARIABLES,
    abilities: [
      entersWith({ prepared: true }),
      staticAbility("self", { power: 1, addKeywords: ["flying"] }, { condition: cond.threshold, label: "Seuil : +1/+0 et vol" }),
    ],
  },
  "Vigorbloom Vanguard": {
    prepareSpell: SEED_SUTURE,
    abilities: [
      entersWith({ prepared: true }),
      staticAbility(
        { types: ["Creature"], controller: "you", withCounter: "+1/+1" },
        { addKeywords: ["vigilance"] },
        {
          label: "Vigilance (avec un marqueur +1/+1)",
        },
      ),
    ],
  },
  "Whiplash Wordsmith": {
    prepareSpell: VICIOUS_VERSE,
    abilities: [
      entersWith({ prepared: true }),
      staticAbility(
        "self",
        { addKeywords: ["flying", "haste"] },
        {
          condition: cond.opponentDealtNoncombatDamage,
          label: "Vol et célérité (blessures non de combat)",
        },
      ),
    ],
  },
  "Woodwork Prodigy": {
    prepareSpell: SOUL_TETHER,
    abilities: [
      triggered(when.yourUpkeep, [fx.prepare(ref.self)], { condition: cond.not(cond.prepared), label: "devient préparée" }),
    ],
  },
  "Avatar of Burgeoning Echoes": {
    abilities: [
      triggered(when.landfall, [empower(2)], { label: "Landfall : renforcez Jace 2" }),
      walkersHave(
        loyalty(-10, {
          targets: [target.creature("t")],
          effects: [fx.addCounters(ref.target(), amount.count({ types: ["Land"], controller: "you" }))],
          label: "Un marqueur par terrain",
        }),
        "Planeswalkers : [−10]",
      ),
    ],
  },
  "Mind Meanderer": {
    abilities: [
      staticAbility(
        "self",
        { addKeywords: ["vigilance"] },
        {
          condition: cond.controls({ types: ["Planeswalker"], subtype: "Jace" }),
          label: "Vigilance (avec un Jace)",
        },
      ),
      triggered(when.entersSelf, [fx.fight(ref.self, ref.target())], {
        targets: [target.upTo(1, target.creature("t", { controller: "opponent" }))],
        label: "combat",
      }),
    ],
  },
  "Tam's Resistance": {
    spell: spell(
      [target.upTo(1, target.creature("t"))],
      [fx.addCounters(ref.target(), 1), fx.modify(ref.target(), { addKeywords: ["vigilance"] }), empower(4)],
    ),
  },
  "Craftwork Crusher": {
    // « Choisissez deux — » : les trois paires possibles.
    abilities: [
      triggeredModal(when.entersSelf, [
        mode(
          "4 blessures et un Cadet",
          [target.creatureOrPlaneswalker("t")],
          [fx.damage(4, ref.target()), fx.createTokens(CADET)],
        ),
        mode("4 blessures et piochez", [target.creatureOrPlaneswalker("t")], [fx.damage(4, ref.target()), fx.draw(1)]),
        mode("Un Cadet et piochez", [], [fx.createTokens(CADET), fx.draw(1)]),
      ]),
    ],
  },
  "Entrust the Spark": {
    spell: spell(
      [],
      [
        fx.sacrifice(ref.you, { types: ["Planeswalker"] }, 1, { optional: true, store: "s" }),
        ...fx.when(cond.v("s"), fx.search({ types: ["Planeswalker"] }, { to: "battlefield" })),
      ],
    ),
  },
  "Vindictive Triumph": {
    spell: spell(
      [target.creatureOrPlaneswalker("t")],
      [
        fx.exileCard(ref.target(), { name: "x", filter: { maxManaValue: 3 } }),
        ...fx.when(
          cond.v("x"),
          fx.moveTo(ref.stored("x"), { to: "battlefield", tapped: true, underYourControl: true }, { name: "y" }),
          fx.delayed([fx.exile(ref.target("y"))], { y: ref.stored("y") }),
        ),
      ],
    ),
  },
  "Edgar, Ancient Bloodlord": {
    abilities: [
      triggered(
        when.dies({ ...{ anyOf: [{ types: ["Creature"] }, { types: ["Planeswalker"] }] }, controller: "you", other: true }),
        [fx.gainLife(1)],
        { label: "+1 PV" },
      ),
      activated({
        mana: "{2}",
        sacrificeOther: {
          filter: { ...{ anyOf: [{ types: ["Creature"] }, { types: ["Planeswalker"] }] }, controller: "you", other: true },
        },
        effects: [fx.addCounters(ref.self, 1), fx.modify(ref.self, { addKeywords: ["menace"] })],
        label: "Marqueur +1/+1 et menace",
      }),
    ],
  },
  "Kiora of Salt and Sand": {
    abilities: [
      triggered(when.attackWith(), [fx.untap(ref.target()), fx.modify(ref.target(), { addKeywords: ["unblockable"] })], {
        targets: [target.creature("t", { attacking: true })],
        condition: cond.activatedLoyalty,
        label: "dégage un attaquant, imblocable",
      }),
      walkersHave(
        loyalty(-8, { effects: [fx.createTokens(LEVIATHAN)], label: "Léviathan 8/8" }),
        "Planeswalkers : [−8] Léviathan",
      ),
    ],
  },
  "Tam, the Possibility": {
    abilities: [
      costReducer({ types: ["Planeswalker"] }, 1, "Planeswalkers : {1} de moins"),
      activated({
        mana: "{W}{U}{B}{R}{G}",
        tap: true,
        effects: [fx.proliferate(amount.distinctSubtypes({ types: ["Planeswalker"], controller: "you" }))],
        label: "Proliférez X fois",
      }),
    ],
  },
};
