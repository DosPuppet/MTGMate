/** Bloomburrow — cartes rouges. */
import {
  activated,
  amount,
  type CardScript,
  CREATURE_YOU_CONTROL,
  cond,
  costReducer,
  entersWith,
  expend,
  fx,
  graveyardReplacement,
  kin,
  modal,
  mode,
  pawprint,
  playerStatic,
  ref,
  SWORD,
  spell,
  staticAbility,
  TREASURE,
  target,
  targetObj,
  triggered,
  triggeredModal,
  valiant,
  when,
} from "./common";

const NONCREATURE = { notTypes: ["Creature" as const] };
/** « Vous pouvez défausser une carte. Si vous le faites, piochez une carte. » */
const mayRummage = (prompt = "Défausser une carte pour piocher ?") =>
  fx.may(prompt, fx.discard(1, ref.you, { store: "d" }), ...fx.when(cond.v("d"), fx.draw(1)));

export const RED: Record<string, CardScript> = {
  "Agate Assault": {
    spell: modal(
      mode(
        "4 blessures à une créature (exilée si elle meurt)",
        [target.creature()],
        [fx.exileIfDies(ref.target()), fx.damage(4, ref.target())],
      ),
      mode("Exile un artefact", [target.permanent("t", ["Artifact"], {}, "artefact")], [fx.exile(ref.target())]),
    ),
  },
  "Alania's Pathmaker": {
    abilities: [triggered(when.entersSelf, [fx.impulse(1, "yourNextTurn")], { label: "Exile la carte du dessus (jouable)" })],
  },
  "Artist's Talent": {
    abilities: [triggered(when.castSpell("you", NONCREATURE), mayRummage(), { label: "Défaussez, puis piochez" })],
    classLevels: [
      [costReducer(NONCREATURE, 1, "Sorts non-créature {1} de moins")],
      [playerStatic({ noncombatDamageBonusAmount: 2, label: "Blessures non de combat aux adversaires +2" })],
    ],
  },
  "Blacksmith's Talent": {
    abilities: [triggered(when.entersSelf, [fx.createTokens(SWORD)], { label: "Épée (Équipement)" })],
    classLevels: [
      [
        triggered(when.yourCombat, [fx.attach(ref.target("c"), ref.target("e"))], {
          targets: [
            targetObj("e", { subtype: "Equipment", controller: "you" }, "Équipement que vous contrôlez"),
            target.upTo(1, target.creature("c", { controller: "you" })),
          ],
          label: "Attache un Équipement",
        }),
      ],
      [
        staticAbility(
          { types: ["Creature"], controller: "you", equipped: true },
          { addKeywords: ["doubleStrike", "haste"] },
          { condition: cond.yourTurn, label: "Double initiative et célérité" },
        ),
      ],
    ],
  },
  "Blooming Blast": {
    spell: spell(
      [target.creature()],
      [fx.damage(2, ref.target()), ...fx.when(cond.gift, fx.damage(3, ref.controllerOf(ref.target())))],
    ),
  },
  "Brambleguard Captain": {
    abilities: [
      triggered(when.yourCombat, [fx.pump(ref.target(), amount.powerOf(ref.self), 0)], {
        targets: [target.creature("t", { controller: "you" })],
        label: "+X/+0 (X = sa force)",
      }),
    ],
  },
  "Brazen Collector": {
    abilities: [triggered(when.attacksSelf, [fx.addManaUntilEndOfTurn("R")], { label: "Ajoute {R}" })],
  },
  "Byway Barterer": {
    abilities: [
      expend(
        4,
        fx.may(
          "Défausser votre main pour piocher deux cartes ?",
          fx.discard(amount.cardsIn("hand"), ref.you, { store: "d" }),
          fx.draw(2),
        ),
        { label: "Défaussez votre main, piochez deux cartes" },
      ),
    ],
  },
  "Conduct Electricity": {
    spell: spell(
      [target.creature("t"), target.upTo(1, targetObj("u", { types: ["Creature"], token: true }, "jeton de créature"))],
      [fx.damage(6, ref.target()), fx.damage(2, ref.target("u"))],
    ),
  },
  "Coruscation Mage": {
    abilities: [
      triggered(when.castSpell("you", NONCREATURE), [fx.damage(1, ref.eachOpponent)], {
        label: "1 blessure à chaque adversaire",
      }),
    ],
  },
  "Dragonhawk, Fate's Tempest": {
    abilities: [
      ...[when.entersSelf, when.attacksSelf].map((w) =>
        triggered(
          w,
          [
            fx.exileTop(ref.you, amount.count({ types: ["Creature"], controller: "you", minPower: 4 }), "d"),
            fx.grantPlay(ref.stored("d"), { untilYourNextTurn: true }),
            fx.delayedAt(
              "yourNextEndStep",
              [fx.damage(amount.plus(amount.inExile(ref.target("d")), amount.inExile(ref.target("d"))), ref.eachOpponent)],
              { d: ref.stored("d") },
            ),
          ],
          { label: "Exile X cartes (jouables) ; 2 blessures par carte restée en exil" },
        ),
      ),
    ],
  },
  "Emberheart Challenger": {
    abilities: [valiant([fx.impulse(1)], { label: "Exile la carte du dessus (jouable ce tour-ci)" })],
  },
  "Festival of Embers": {
    abilities: [
      playerStatic({
        playFrom: { zone: "graveyard", filter: { types: ["Instant", "Sorcery"] }, what: "spells", payLife: 1 },
        condition: cond.yourTurn,
        label: "Éphémères et rituels depuis le cimetière (1 PV)",
      }),
      graveyardReplacement({ graveyardOf: "you", label: "Cimetière exilé" }),
      activated({ mana: "{1}{R}", sacrifice: true, effects: [], label: "Sacrifiez cet enchantement" }),
    ],
  },
  "Flamecache Gecko": {
    abilities: [
      triggered(when.entersSelf, [fx.addMana("B", "R")], { condition: cond.opponentLostLife, label: "Ajoute {B}{R}" }),
      activated({ mana: "{1}{R}", discard: 1, effects: [fx.draw(1)], label: "Défaussez : piochez" }),
    ],
  },
  "Frilled Sparkshooter": {
    abilities: [entersWith({ counters: 1, condition: cond.opponentLostLife, label: "Un marqueur +1/+1" })],
  },
  "Harnesser of Storms": {
    abilities: [
      triggered(
        when.castSpell("you", { anyOf: [NONCREATURE, { subtype: "Otter" }] }),
        fx.may("Exiler la carte du dessus (jouable ce tour-ci) ?", fx.impulse(1)),
        { oncePerTurn: true, label: "Exile la carte du dessus" },
      ),
    ],
  },
  "Heartfire Hero": {
    abilities: [
      valiant([fx.addCounters(ref.self, 1)], { label: "Marqueur +1/+1" }),
      triggered(when.diesSelf, [fx.damage(amount.lkiPower, ref.eachOpponent)], { label: "Blessures égales à sa force" }),
    ],
  },
  "Hearthborn Battler": {
    abilities: [
      triggered({ on: "castSpell", by: "any", nth: 2 }, [fx.damage(2, ref.target())], {
        targets: [target.player("t", "opponent")],
        label: "Deuxième sort d'un joueur : 2 blessures",
      }),
    ],
  },
  "Hired Claw": {
    abilities: [
      triggered(when.attackWith(1, { subtype: "Lizard" }), [fx.damage(1, ref.target())], {
        targets: [target.player("t", "opponent")],
        label: "1 blessure à un adversaire",
      }),
      activated({
        mana: "{1}{R}",
        oncePerTurn: true,
        activationCondition: cond.opponentLostLife,
        effects: [fx.addCounters(ref.self, 1)],
        label: "Marqueur +1/+1",
      }),
    ],
  },
  "Hoarder's Overflow": {
    abilities: [
      triggered(when.entersSelf, [fx.counters(ref.self, "stash", 1)], { label: "Marqueur de réserve" }),
      expend(4, [fx.counters(ref.self, "stash", 1)], { label: "Marqueur de réserve" }),
      activated({
        mana: "{1}{R}",
        sacrifice: true,
        effects: [fx.discard(amount.cardsIn("hand")), fx.draw(amount.lkiCounters("stash"))],
        label: "Défaussez votre main, piochez",
      }),
    ],
  },
  "Kindlespark Duo": {
    abilities: [
      activated({
        tap: true,
        targets: [target.player("t", "opponent")],
        effects: [fx.damage(1, ref.target())],
        label: "1 blessure à un adversaire",
      }),
      triggered(when.castSpell("you", NONCREATURE), [fx.untap(ref.self)], { label: "Se dégage" }),
    ],
  },
  "Manifold Mouse": {
    abilities: [
      triggeredModal(when.yourCombat, [
        mode(
          "Double initiative",
          [target.creature("t", { controller: "you", subtype: "Mouse" })],
          [fx.pump(ref.target(), 0, 0, ["doubleStrike"])],
        ),
        mode(
          "Piétinement",
          [target.creature("t", { controller: "you", subtype: "Mouse" })],
          [fx.pump(ref.target(), 0, 0, ["trample"])],
        ),
      ]),
    ],
  },
  "Might of the Meek": {
    spell: spell(
      [target.creature()],
      [
        fx.pump(ref.target(), 0, 0, ["trample"]),
        ...fx.when(cond.controls({ types: ["Creature"], subtype: "Mouse" }), fx.pump(ref.target(), 1, 0)),
        fx.draw(1),
      ],
    ),
  },
  "Playful Shove": { spell: spell([target.any()], [fx.damage(1, ref.target()), fx.draw(1)]) },
  "Rabid Gnaw": {
    spell: spell(
      [
        target.creature("t", { controller: "you" }),
        targetObj("u", { types: ["Creature"], controller: "opponent" }, "créature que vous ne contrôlez pas"),
      ],
      [fx.pump(ref.target(), 1, 0), fx.damage(amount.powerOf(ref.target()), ref.target("u"), ref.target())],
    ),
  },
  "Raccoon Rallier": {
    abilities: [
      activated({
        tap: true,
        sorcerySpeed: true,
        targets: [target.creature("t", { controller: "you" })],
        effects: [fx.pump(ref.target(), 0, 0, ["haste"])],
        label: "Célérité",
      }),
    ],
  },
  "Reptilian Recruiter": {
    abilities: [
      triggered(
        when.entersSelf,
        fx.when(
          cond.any(
            cond.refMatches(ref.target(), { maxPower: 2 }),
            cond.controls({ types: ["Creature"], subtype: "Lizard", other: true }),
          ),
          fx.gainControl(ref.target()),
          fx.untap(ref.target()),
          fx.pump(ref.target(), 0, 0, ["haste"]),
        ),
        { targets: [target.creature()], label: "Prend le contrôle d'une créature" },
      ),
    ],
  },
  "Roughshod Duo": {
    abilities: [
      expend(4, [fx.pump(ref.target(), 1, 1, ["trample"])], {
        targets: [target.creature("t", { controller: "you" })],
        label: "+1/+1 et piétinement",
      }),
    ],
  },
  "Sazacap's Brew": {
    additionalCost: { discard: 1 },
    spell: spell(
      [target.player("p"), target.upTo(1, target.creature("t", { controller: "you" }))],
      [fx.draw(2, ref.target("p")), ...fx.when(cond.gift, fx.pump(ref.target(), 2, 0))],
    ),
  },
  "Season of the Bold": {
    spell: pawprint(
      { pips: 1, label: "Trésor engagé", effects: [fx.createTappedTokens(TREASURE)] },
      {
        pips: 2,
        label: "Exile les deux cartes du dessus (jouables)",
        effects: [fx.exileTop(ref.you, 2, "b"), fx.grantPlay(ref.stored("b"), { untilYourNextTurn: true })],
      },
      {
        pips: 3,
        label: "Chaque sort : 2 blessures à une créature",
        effects: [
          fx.emblem(
            "Season of the Bold",
            "Jusqu'à la fin de votre prochain tour, chaque fois que vous lancez un sort, 2 blessures à jusqu'à une créature ciblée.",
            [
              triggered(when.castSpell("you"), [fx.damage(2, ref.target())], {
                targets: [target.upTo(1, target.creature())],
                label: "2 blessures à une créature",
              }),
            ],
            true,
          ),
        ],
      },
    ),
  },
  "Steampath Charger": {
    abilities: [
      triggered(when.diesSelf, [fx.damage(1, ref.target())], { targets: [target.player()], label: "1 blessure à un joueur" }),
    ],
  },
  Stormsplitter: {
    abilities: [
      triggered(when.castSpell("you", { types: ["Instant", "Sorcery"] }), [fx.copyToken(ref.self, { exileAtEndStep: true })], {
        label: "Copie de cette créature (exilée à l'étape de fin)",
      }),
    ],
  },
  "Sunspine Lynx": {
    abilities: [
      playerStatic({ noLifeGainForAll: true, label: "Les joueurs ne peuvent pas gagner de points de vie" }),
      playerStatic({ damageUnpreventable: true, label: "Les blessures ne peuvent pas être prévenues" }),
      triggered(when.entersSelf, [fx.damageEachPlayerPer({ types: ["Land"], nonbasic: true })], {
        label: "Blessures selon les terrains non de base",
      }),
    ],
  },
  "Take Out the Trash": {
    spell: spell(
      [target.creatureOrPlaneswalker()],
      [fx.damage(3, ref.target()), ...fx.when(cond.controls({ types: ["Creature"], subtype: "Raccoon" }), mayRummage())],
    ),
  },
  "Teapot Slinger": {
    abilities: [expend(4, [fx.damage(2, ref.eachOpponent)], { label: "2 blessures à chaque adversaire" })],
  },
  "Valley Flamecaller": {
    abilities: [
      playerStatic({
        damagePlusOneFrom: kin(["Lizard", "Mouse", "Otter", "Raccoon"]),
        label: "Lézards, Souris, Loutres et Ratons laveurs : +1 blessure",
      }),
    ],
  },
  "Valley Rally": {
    spell: spell(
      [target.upTo(1, target.creature("t", { controller: "you" }))],
      [fx.pumpAll(CREATURE_YOU_CONTROL, 2, 0), ...fx.when(cond.gift, fx.pump(ref.target(), 0, 0, ["firstStrike"]))],
    ),
  },
  "War Squeak": {
    enchant: { filter: { types: ["Creature"] }, label: "créature" },
    abilities: [
      triggered(when.entersSelf, [fx.pump(ref.target(), 0, 0, ["cantBlock"])], {
        targets: [target.creature("t", { controller: "opponent" })],
        label: "Ne peut pas bloquer",
      }),
      staticAbility("attached", { power: 1, toughness: 1, addKeywords: ["haste"] }, { label: "+1/+1 et célérité" }),
    ],
  },
  "Whiskerquill Scribe": {
    abilities: [valiant(mayRummage(), { label: "Défaussez, puis piochez" })],
  },
  "Wildfire Howl": {
    spell: spell(
      [target.upTo(1, target.any())],
      [...fx.when(cond.gift, fx.damage(1, ref.target())), fx.damageAll(2, { types: ["Creature"] })],
    ),
  },
};
