/** Bloomburrow — cartes multicolores (dont les légendaires). */
import {
  activated,
  amount,
  BAT_1,
  type CardScript,
  CRAGFLAME,
  CREATURE_YOU_CONTROL,
  cond,
  costReducer,
  entersWith,
  expend,
  FLYER_YOU,
  FOOD,
  FOOD_ABILITY,
  fx,
  GAINED_OR_LOST,
  graveyardReplacement,
  INSTANT_SORCERY,
  kin,
  loyalty,
  manaAbility,
  mode,
  NONFLYER_YOU,
  otter,
  playerStatic,
  RABBIT,
  ref,
  SQUIRREL,
  staticAbility,
  THRESHOLD,
  target,
  targetObj,
  triggered,
  triggeredModal,
  VREN_RAT,
  valiant,
  when,
} from "./common";

const NONCREATURE = { notTypes: ["Creature" as const] };
const blinkWithCounter = [
  fx.exileCard(ref.target(), { name: "b" }),
  fx.toBattlefield(ref.stored("b"), { counters: { kind: "+1/+1", n: 1 } }),
];

export const MULTI: Record<string, CardScript> = {
  "Alania, Divergent Storm": {
    // Approximation : les sorts de Loutre (des sorts de créature) ne sont pas copiés.
    abilities: [
      triggered(
        { on: "castSpell", by: "you", firstOf: ["Instant", "Sorcery"] },
        fx.may(
          "Un adversaire pioche une carte pour copier ce sort ?",
          fx.draw(1, ref.target()),
          fx.copySpell(ref.eventObject, 1),
        ),
        { targets: [target.player("t", "opponent")], label: "Copie le sort (un adversaire pioche)" },
      ),
    ],
  },
  "Baylen, the Haymaker": {
    abilities: [
      // Approximation : capacité activée (pas de mana).
      activated({
        tapOthers: { filter: { token: true }, count: 2 },
        effects: [fx.addManaChoice(1)],
        label: "Engagez deux jetons : un mana",
      }),
      activated({
        tapOthers: { filter: { token: true }, count: 3 },
        effects: [fx.draw(1)],
        label: "Engagez trois jetons : piochez",
      }),
      activated({
        tapOthers: { filter: { token: true }, count: 4 },
        effects: [fx.addCounters(ref.self, 3), fx.pump(ref.self, 0, 0, ["trample"])],
        label: "Engagez quatre jetons : trois marqueurs +1/+1",
      }),
    ],
  },
  "Burrowguard Mentor": { cdaPT: amount.count(CREATURE_YOU_CONTROL) },
  "Camellia, the Seedmiser": {
    abilities: [
      staticAbility(kin(["Squirrel"], { other: true }), { addKeywords: ["menace"] }, { label: "Menace" }),
      triggered(when.sacrifice({ subtype: "Food" }), [fx.createTokens(SQUIRREL)], { batched: true, label: "Écureuil 1/1" }),
      activated({
        mana: "{2}",
        forage: true,
        effects: [fx.addCountersAll(kin(["Squirrel"], { other: true }), 1)],
        label: "Fourrager : marqueur +1/+1 sur chaque autre Écureuil",
      }),
    ],
  },
  "Cindering Cutthroat": {
    abilities: [
      entersWith({ counters: 1, condition: cond.opponentLostLife, label: "Un marqueur +1/+1" }),
      activated({ mana: "{1}{B/R}", effects: [fx.pump(ref.self, 0, 0, ["menace"])], label: "Menace" }),
    ],
  },
  "Clement, the Worrywort": {
    abilities: [
      triggered(
        when.enters(CREATURE_YOU_CONTROL),
        fx.when(
          cond.amountAtLeast(amount.plus(amount.manaValueOf(ref.eventObject), amount.neg(amount.manaValueOf(ref.target()))), 1),
          fx.bounce(ref.target()),
        ),
        {
          targets: [target.upTo(1, target.creature("t", { controller: "you" }))],
          label: "Renvoie une créature de VM inférieure",
        },
      ),
      staticAbility(
        kin(["Frog"]),
        { addAbilities: [manaAbility(["G", "U"], 1, { restriction: { spell: { types: ["Creature"] } } })] },
        { label: "{T} : {G} ou {U} (sorts de créature)" },
      ),
    ],
  },
  "Corpseberry Cultivator": {
    abilities: [
      triggered(when.yourCombat, fx.mayForage("Fourrager ?"), { label: "Fourrager" }),
      triggered(when.forage, [fx.addCounters(ref.self, 1)], { label: "Marqueur +1/+1" }),
    ],
  },
  "Dreamdew Entrancer": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.tap(ref.target()),
          fx.counters(ref.target(), "stun", 3),
          ...fx.when(cond.refMatches(ref.target(), { controller: "you" }), fx.draw(2)),
        ],
        { targets: [target.upTo(1, target.creature())], label: "Engage une créature (trois marqueurs d'étourdissement)" },
      ),
    ],
  },
  "Finneas, Ace Archer": {
    abilities: [
      triggered(
        when.attacksSelf,
        [
          fx.addCountersAll({ ...CREATURE_YOU_CONTROL, other: true, anyOf: [{ token: true }, { subtype: "Rabbit" }] }, 1),
          ...fx.when(cond.amountAtLeast(amount.totalPower(CREATURE_YOU_CONTROL), 10), fx.draw(1)),
        ],
        { label: "Marqueurs sur les jetons et Lapins ; piochez à force 10" },
      ),
    ],
  },
  "Fireglass Mentor": {
    abilities: [
      triggered(when.secondMain, [fx.impulse(2)], {
        condition: cond.opponentLostLife,
        label: "Exile deux cartes, jouez-en une",
      }),
    ],
  },
  "Gev, Scaled Scorch": {
    abilities: [
      entersWith({
        affects: { types: ["Creature"], other: true },
        counters: amount.opponentsLostLife,
        label: "Marqueurs par adversaire ayant perdu des PV",
      }),
      triggered(when.castSpell("you", { subtype: "Lizard" }), [fx.damage(1, ref.target())], {
        targets: [target.player("t", "opponent")],
        label: "1 blessure à un adversaire",
      }),
    ],
  },
  "Glarb, Calamity's Augur": {
    abilities: [
      playerStatic({ lookAtTopCard: true, label: "Regardez la carte du dessus" }),
      playerStatic({
        playTopCard: true,
        playTopFilter: { anyOf: [{ types: ["Land"] }, { minManaValue: 4, notTypes: ["Land"] }] },
        label: "Terrains et sorts de VM 4 ou plus depuis le dessus",
      }),
      activated({ tap: true, effects: [fx.surveil(2)], label: "Surveillance 2" }),
    ],
  },
  "Head of the Homestead": {
    abilities: [triggered(when.entersSelf, [fx.createTokens(RABBIT, 2)], { label: "Deux Lapins 1/1" })],
  },
  "Helga, Skittish Seer": {
    abilities: [
      triggered(
        when.castSpell("you", { types: ["Creature"], minManaValue: 4 }),
        [fx.draw(1), fx.gainLife(1), fx.addCounters(ref.self, 1)],
        { label: "Piochez, +1 PV, marqueur +1/+1" },
      ),
      // Approximation : pas pour les sorts de créature avec {X} de VM inférieure à 4.
      manaAbility(["W", "U", "B", "R", "G"], 1, {
        selfPower: true,
        restriction: { spell: { types: ["Creature"], minManaValue: 4 } },
      }),
    ],
  },
  "Hugs, Grisly Guardian": {
    abilities: [
      triggered(
        when.entersSelf,
        [fx.exileTop(ref.you, amount.sourceX, "h"), fx.grantPlay(ref.stored("h"), { untilYourNextTurn: true })],
        { label: "Exile X cartes (jouables jusqu'à votre prochain tour)" },
      ),
      playerStatic({ extraLands: 1, label: "Un terrain supplémentaire" }),
    ],
  },
  "The Infamous Cruelclaw": {
    // Approximation : la défausse précède le lancement (gratuit, ce tour-ci).
    abilities: [
      triggered(
        when.combatDamageToPlayer,
        [
          fx.exileUntil({ nonland: true }, "c"),
          ...fx.may(
            "Défausser une carte pour lancer la carte exilée ?",
            fx.discard(1, ref.you, { store: "d" }),
            ...fx.when(cond.v("d"), fx.castNow(ref.stored("c"), { free: true })),
          ),
        ],
        { label: "Exile jusqu'à une carte non-terrain ; lancez-la en défaussant" },
      ),
    ],
  },
  "Junkblade Bruiser": {
    abilities: [expend(4, [fx.pump(ref.self, 2, 1)], { label: "+2/+1" })],
  },
  "Kastral, the Windcrested": {
    abilities: [
      triggeredModal(when.combatDamageBatch(kin(["Bird"])), [
        mode(
          "Un Oiseau de votre main ou cimetière",
          [],
          [
            fx.pickFromZone(
              "hand",
              { types: ["Creature"], subtype: "Bird" },
              { to: "battlefield", counters: { kind: "finality", n: 1 } },
              {
                min: 0,
                store: "k",
                prompt: "Oiseau de votre main (ou aucun)",
              },
            ),
            ...fx.when(
              cond.not(cond.v("k")),
              fx.pickFromZone(
                "graveyard",
                { types: ["Creature"], subtype: "Bird" },
                { to: "battlefield", counters: { kind: "finality", n: 1 } },
                { min: 0, prompt: "Oiseau de votre cimetière" },
              ),
            ),
          ],
        ),
        mode("Marqueur +1/+1 sur chaque Oiseau", [], [fx.addCountersAll(kin(["Bird"]), 1)]),
        mode("Piochez une carte", [], [fx.draw(1)]),
      ]),
    ],
  },
  "Lilysplash Mentor": {
    abilities: [
      activated({
        mana: "{1}{G}{U}",
        sorcerySpeed: true,
        targets: [target.creature("t", { controller: "you", other: true })],
        effects: blinkWithCounter,
        label: "Exile et renvoie une créature (marqueur +1/+1)",
      }),
    ],
  },
  "Lunar Convocation": {
    abilities: [
      triggered(when.yourEndStep, [fx.loseLife(1, ref.eachOpponent)], {
        condition: cond.lifeGainedAtLeast(1),
        label: "Chaque adversaire perd 1 PV",
      }),
      triggered(when.yourEndStep, [fx.createTokens(BAT_1)], {
        condition: cond.all(cond.lifeGainedAtLeast(1), cond.lostLife),
        label: "Chauve-souris 1/1 volante",
      }),
      activated({ mana: "{1}{B}", payLife: 2, effects: [fx.draw(1)], label: "Piochez une carte" }),
    ],
  },
  "Mabel, Heir to Cragflame": {
    abilities: [
      staticAbility(kin(["Mouse"], { other: true }), { power: 1, toughness: 1 }, { label: "Souris +1/+1" }),
      triggered(when.entersSelf, [fx.createTokens(CRAGFLAME)], { label: "Cragflame (Équipement)" }),
    ],
  },
  "Mind Drill Assailant": {
    abilities: [
      staticAbility("self", { power: 3 }, { condition: THRESHOLD, label: "Seuil : +3/+0" }),
      activated({ mana: "{2}{U/B}", effects: [fx.surveil(1)], label: "Surveillance 1" }),
    ],
  },
  "Moonrise Cleric": {
    abilities: [triggered(when.attacksSelf, [fx.gainLife(1)], { label: "+1 PV" })],
  },
  "Muerra, Trash Tactician": {
    abilities: [
      // Approximation : le mana est d'une seule couleur, au choix.
      triggered(when.step("main1", "you"), [fx.addManaChoice(amount.count(kin(["Raccoon"])))], {
        label: "{R} ou {G} par Raton laveur",
      }),
      expend(4, [fx.gainLife(3)], { label: "+3 PV" }),
      expend(8, [fx.exileTop(ref.you, 2, "m"), fx.grantPlay(ref.stored("m"), { untilYourNextTurn: true })], {
        label: "Exile deux cartes (jouables)",
      }),
    ],
  },
  "Plumecreed Mentor": {
    abilities: [
      triggered(when.enters(FLYER_YOU), [fx.addCounters(ref.target(), 1)], {
        targets: [targetObj("t", NONFLYER_YOU, "créature sans le vol que vous contrôlez")],
        label: "Marqueur +1/+1",
      }),
    ],
  },
  "Pond Prophet": { abilities: [triggered(when.entersSelf, [fx.draw(1)], { label: "Piochez une carte" })] },
  "Ral, Crackling Wit": {
    abilities: [
      triggered(when.castSpell("you", NONCREATURE), [fx.counters(ref.self, "loyalty", 1)], { label: "Marqueur de loyauté" }),
      loyalty(1, { effects: [otter()], label: "Loutre 1/1 avec la prouesse" }),
      loyalty(-3, { effects: [fx.draw(3), fx.discard(2)], label: "Piochez trois cartes, défaussez-en deux" }),
      loyalty(-10, {
        effects: [
          fx.draw(3),
          fx.emblem("Ral", "Les éphémères et les rituels que vous lancez ont la réplique.", [
            triggered(
              when.castSpell("you", INSTANT_SORCERY),
              [fx.copySpell(ref.eventObject, amount.plus(amount.spellsCastThisTurn, -1))],
              {
                label: "Réplique",
              },
            ),
          ]),
        ],
        label: "Piochez trois cartes, emblème (réplique)",
      }),
    ],
  },
  "Seedglaive Mentor": { abilities: [valiant([fx.addCounters(ref.self, 1)], { label: "Marqueur +1/+1" })] },
  "Seedpod Squire": {
    abilities: [
      triggered(when.attacksSelf, [fx.pump(ref.target(), 1, 1)], {
        targets: [targetObj("t", NONFLYER_YOU, "créature sans le vol que vous contrôlez")],
        label: "+1/+1",
      }),
    ],
  },
  "Starseer Mentor": {
    abilities: [
      triggered(when.yourEndStep, [fx.punisher(ref.target(), 3, { discard: true, sacrifice: { nonland: true } })], {
        condition: GAINED_OR_LOST,
        targets: [target.player("t", "opponent")],
        label: "Perd 3 PV sauf sacrifice ou défausse",
      }),
    ],
  },
  "Stormcatch Mentor": { abilities: [costReducer(INSTANT_SORCERY, 1, "Éphémères et rituels {1} de moins")] },
  "Tempest Angler": {
    abilities: [triggered(when.castSpell("you", NONCREATURE), [fx.addCounters(ref.self, 1)], { label: "Marqueur +1/+1" })],
  },
  "Tidecaller Mentor": {
    abilities: [
      triggered(when.entersSelf, [fx.bounce(ref.target())], {
        condition: THRESHOLD,
        targets: [target.upTo(1, target.nonland("t"))],
        label: "Seuil — renvoie un permanent non-terrain",
      }),
    ],
  },
  "Veteran Guardmouse": {
    abilities: [valiant([fx.pump(ref.self, 1, 0, ["firstStrike"]), fx.scry(1)], { label: "+1/+0, initiative, regard 1" })],
  },
  "Vinereap Mentor": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(FOOD)], { label: "Nourriture" }),
      triggered(when.diesSelf, [fx.createTokens(FOOD)], { label: "Nourriture" }),
    ],
  },
  "Vren, the Relentless": {
    abilities: [
      graveyardReplacement({
        fromBattlefield: true,
        filter: { types: ["Creature"], controller: "opponent" },
        label: "Les créatures adverses sont exilées",
      }),
      triggered(when.eachEndStep, [fx.createTokens(VREN_RAT, amount.opponentCreaturesExiledThisTurn)], {
        label: "Rats pour chaque créature adverse exilée",
      }),
    ],
  },
  "Wandertale Mentor": {
    abilities: [expend(4, [fx.addCounters(ref.self, 1)], { label: "Marqueur +1/+1" }), manaAbility(["R", "G"])],
  },
  "Ygra, Eater of All": {
    abilities: [
      staticAbility(
        { types: ["Creature"], other: true },
        { addTypes: ["Artifact"], addSubtypes: ["Food"], addAbilities: [FOOD_ABILITY] },
        { label: "Les autres créatures sont des Nourritures" },
      ),
      triggered(when.dies({ types: ["Artifact"], subtype: "Food" }), [fx.addCounters(ref.self, 2)], {
        label: "Deux marqueurs +1/+1",
      }),
    ],
  },
  "Zoraline, Cosmos Caller": {
    abilities: [
      triggered(when.attacks(kin(["Bat"])), [fx.gainLife(1)], { label: "+1 PV" }),
      ...[when.entersSelf, when.attacksSelf].map((w) =>
        triggered(
          w,
          fx.mayPayWithLife(
            "{W}{B}",
            2,
            "Payer {W}{B} et 2 PV pour réanimer un permanent ?",
            fx.reflexive(
              [
                target.cardInGraveyard(
                  "t",
                  { nonland: true, permanent: true, maxManaValue: 3 },
                  "you",
                  "permanent non-terrain de VM 3 ou moins",
                ),
              ],
              [fx.toBattlefield(ref.target(), { counters: { kind: "finality", n: 1 } })],
            ),
          ),
          { label: "Réanime un permanent (marqueur de finalité)" },
        ),
      ),
    ],
  },
  "Bria, Riptide Rogue": {
    abilities: [
      staticAbility({ types: ["Creature"], controller: "you", other: true }, { addKeywords: ["prowess"] }, { label: "Prouesse" }),
      triggered(when.castSpell("you", NONCREATURE), [fx.pump(ref.target(), 0, 0, ["unblockable"])], {
        targets: [target.creature("t", { controller: "you" })],
        label: "Ne peut pas être bloquée",
      }),
    ],
  },
  "Byrke, Long Ear of the Law": {
    abilities: [
      triggered(when.entersSelf, [fx.addCounters(ref.target(), 1)], {
        targets: [target.upTo(2, target.creature())],
        label: "Un marqueur +1/+1 sur jusqu'à deux créatures",
      }),
      triggered(
        when.attacks({ types: ["Creature"], controller: "you", withCounter: "+1/+1" }),
        [fx.doubleCounters(ref.eventObject)],
        {
          label: "Double ses marqueurs +1/+1",
        },
      ),
    ],
  },
};
