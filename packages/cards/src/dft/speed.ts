/**
 * Aetherdrift, lot B : la vitesse (« Start your engines! », « Max speed — … », 702.179) et l'exhaust (702.177).
 * « Start your engines! » est lu dans le texte ; « Max speed — [capacité] » est une capacité sous condition.
 */
import type { Amount, CardScript, LayerMods, ObjectFilter } from "@mtgx/engine";
import {
  activated,
  amount,
  CREATURE_OR_VEHICLE,
  CREATURE_YOU_CONTROL,
  cond,
  costReducer,
  DINOSAUR_DRAGON,
  ELEPHANT,
  entersWith,
  exhaust,
  fx,
  GOBLIN,
  MOUNT_OR_VEHICLE,
  manaAbility,
  OTHER_CREATURE_YOU_CONTROL,
  playerStatic,
  ref,
  SERVO,
  staticAbility,
  THOPTER,
  TREASURE,
  target,
  targetCreatureOrVehicle,
  triggered,
  when,
  ZOMBIE,
} from "./common";

const MAX = cond.maxSpeed;
/** « Max speed — [cette créature a…] » */
const atMax = (mods: LayerMods, label: string, affects: "self" | "attached" | ObjectFilter = "self") =>
  staticAbility(affects, mods, { condition: MAX, label: `Vitesse max : ${label}` });
/** « Max speed — {3}, exilez cette carte de votre cimetière : piochez une carte. » */
const surveyorDraw = activated({
  mana: "{3}",
  fromGraveyard: true,
  exileSelf: true,
  activationCondition: MAX,
  effects: [fx.draw(1)],
  label: "Vitesse max : exilez-la, piochez",
});
const counters = (n: Amount) => fx.addCounters(ref.self, n);

export const SPEED: Record<string, CardScript> = {
  // --- Blanc -----------------------------------------------------------------
  "Leonin Surveyor": {
    abilities: [
      staticAbility(
        "self",
        { addKeywords: ["firstStrike"] },
        { condition: cond.yourTurn, label: "Initiative pendant votre tour" },
      ),
      surveyorDraw,
    ],
  },
  "Lightwheel Enhancements": {
    enchant: { filter: CREATURE_OR_VEHICLE, label: "créature ou Véhicule" },
    castFromGraveyard: { condition: MAX },
    abilities: [
      staticAbility("attached", { power: 1, toughness: 1, addKeywords: ["vigilance"] }, { label: "+1/+1 et la vigilance" }),
    ],
  },
  "Nesting Bot": {
    abilities: [triggered(when.diesSelf, [fx.createTokens(SERVO)], { label: "Servo 1/1" }), atMax({ power: 1 }, "+1/+0")],
  },
  "Perilous Snare": {
    abilities: [
      triggered(when.entersSelf, [fx.exileUntilLeaves(ref.target())], {
        targets: [target.nonland("t", { controller: "opponent" })],
        label: "Exilez un permanent non-terrain",
      }),
      activated({
        tap: true,
        sorcerySpeed: true,
        activationCondition: MAX,
        targets: [targetCreatureOrVehicle("t", { controller: "you" })],
        effects: [fx.addCounters(ref.target(), 1)],
        label: "Vitesse max : marqueur +1/+1",
      }),
    ],
  },
  "Pride of the Road": {
    abilities: [
      triggered(when.step("beginCombat"), [fx.pump(ref.target(), 0, 0, ["doubleStrike"])], {
        condition: MAX,
        targets: [targetCreatureOrVehicle("t", { controller: "you" })],
        label: "Vitesse max : double initiative",
      }),
    ],
  },
  "Swiftwing Assailant": { abilities: [atMax({ toughness: 1, addKeywords: ["vigilance"] }, "+0/+1 et la vigilance")] },

  // --- Bleu ------------------------------------------------------------------
  "Aether Syphon": {
    abilities: [
      activated({ mana: "{2}", tap: true, effects: [fx.draw(1)], label: "Piochez" }),
      triggered(when.draw(), [fx.mill(2, ref.eachOpponent)], {
        condition: MAX,
        label: "Vitesse max : chaque adversaire meule deux cartes",
      }),
    ],
  },
  "Glitch Ghost Surveyor": { abilities: [surveyorDraw] },
  "Keen Buccaneer": {
    abilities: [exhaust({ mana: "{1}{U}", effects: [...fx.loot(1), counters(1)], label: "piochez, défaussez, marqueur +1/+1" })],
  },
  "Mindspring Merfolk": {
    abilities: [
      exhaust({
        mana: "{X}{U}{U}",
        tap: true,
        effects: [fx.draw(amount.x), fx.addCountersAll({ types: ["Creature"], subtype: "Merfolk", controller: "you" }, 1)],
        label: "piochez X cartes, marqueurs sur vos Ondins",
      }),
    ],
  },
  "Rangers' Refueler": {
    abilities: [
      triggered(when.exhaustActivated, [fx.draw(1)], { label: "Piochez" }),
      exhaust({ mana: "{4}", effects: [fx.animateVehicle(), counters(1)], label: "créature-artefact, marqueur +1/+1" }),
    ],
  },
  "Riverchurn Monument": {
    abilities: [
      activated({
        mana: "{1}",
        tap: true,
        targets: [target.upTo(4, target.player("t"))],
        effects: [fx.mill(2, ref.target())],
        label: "Les joueurs ciblés meulent deux cartes",
      }),
      exhaust({
        mana: "{2}{U}{U}",
        tap: true,
        targets: [target.upTo(4, target.player("t"))],
        effects: [fx.millGraveyardSize(ref.target())],
        label: "chacun meule autant que son cimetière",
      }),
    ],
  },
  "Sabotage Strategist": {
    abilities: [
      triggered(when.attacksYou({ types: ["Creature"] }), [fx.pump(ref.eventObject, -1, 0)], { label: "L'attaquant -1/-0" }),
      exhaust({ mana: "{5}{U}{U}", effects: [counters(3)], label: "trois marqueurs +1/+1" }),
    ],
  },
  "Skystreak Engineer": { abilities: [exhaust({ mana: "{4}{U}", effects: [counters(2)], label: "deux marqueurs +1/+1" })] },
  "Slick Imitator": {
    abilities: [
      activated({
        mana: "{1}",
        sacrifice: true,
        activationCondition: MAX,
        targets: [target.spell("t", { controller: "you" }, "sort que vous contrôlez")],
        effects: [fx.copySpell(ref.target(), 1)],
        label: "Vitesse max : copiez un sort",
      }),
    ],
  },
  "Spikeshell Harrier": {
    abilities: [
      triggered(when.entersSelf, [fx.reduceSpeed(ref.controllerOf(ref.target())), fx.bounce(ref.target())], {
        targets: [targetCreatureOrVehicle("t", { controller: "opponent" })],
        label: "Renvoyez une créature ou un Véhicule, sa vitesse baisse",
      }),
    ],
  },
  "Vnwxt, Verbose Host": {
    abilities: [
      playerStatic({ noMaxHandSize: true, label: "Pas de taille de main maximale" }),
      playerStatic({ drawDouble: true, condition: MAX, label: "Vitesse max : piochez deux cartes au lieu d'une" }),
    ],
  },

  // --- Noir ------------------------------------------------------------------
  "Gas Guzzler": {
    abilities: [
      entersWith({ tapped: true }),
      activated({
        mana: "{B}",
        sacrificeOther: { filter: { ...CREATURE_OR_VEHICLE, other: true } },
        activationCondition: MAX,
        effects: [fx.draw(1)],
        label: "Vitesse max : piochez",
      }),
    ],
  },
  "Gastal Raider": {
    abilities: [
      triggered(
        when.entersSelf,
        [fx.discard(1, ref.target(), { filter: { types: ["Instant", "Sorcery"] }, chooser: "controller" })],
        { targets: [target.player("t", "opponent")], label: "Il défausse un éphémère ou un rituel" },
      ),
      atMax({ power: 1, toughness: 1, addKeywords: ["menace"] }, "+1/+1 et la menace"),
    ],
  },
  "Hour of Victory": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(ZOMBIE)], { label: "Zombie 2/2" }),
      activated({
        mana: "{1}{B}",
        sacrifice: true,
        sorcerySpeed: true,
        activationCondition: MAX,
        effects: [fx.search({})],
        label: "Vitesse max : cherchez une carte",
      }),
    ],
  },
  "Momentum Breaker": {
    abilities: [
      triggered(when.entersSelf, [fx.sacrificeElseDiscard(ref.eachOpponent, CREATURE_OR_VEHICLE)], {
        label: "Chaque adversaire sacrifie une créature ou un Véhicule (sinon défausse)",
      }),
      activated({ mana: "{2}", sacrifice: true, effects: [fx.gainLife(amount.speed)], label: "PV égaux à votre vitesse" }),
    ],
  },
  "Mutant Surveyor": {
    abilities: [activated({ mana: "{2}", effects: [fx.pump(ref.self, 1, 1)], label: "+1/+1" }), surveyorDraw],
  },
  "Risen Necroregent": {
    abilities: [triggered(when.yourEndStep, [fx.createTokens(ZOMBIE)], { condition: MAX, label: "Vitesse max : Zombie 2/2" })],
  },
  "The Speed Demon": {
    abilities: [
      triggered(when.yourEndStep, [fx.draw(amount.speed), fx.loseLife(amount.speed)], {
        label: "Piochez X cartes, perdez X PV (votre vitesse)",
      }),
    ],
  },
  "Streaking Oilgorger": { abilities: [atMax({ addKeywords: ["lifelink"] }, "lien de vie")] },

  // --- Rouge -----------------------------------------------------------------
  "Adrenaline Jockey": {
    abilities: [
      triggered(when.castSpellOffTurn("any"), [fx.damage(4, ref.eventPlayer)], { label: "4 blessures au lanceur" }),
      triggered(when.exhaustActivated, [counters(1)], { label: "Marqueur +1/+1" }),
    ],
  },
  Boommobile: {
    abilities: [
      // Approximation : le mana n'est pas restreint aux capacités.
      triggered(when.entersSelf, [fx.addManaChoice(4)], { label: "Quatre mana d'une couleur" }),
      exhaust({
        mana: "{X}{2}{R}",
        targets: [target.any("t")],
        effects: [fx.damage(amount.x, ref.target()), counters(1)],
        label: "X blessures, marqueur +1/+1",
      }),
    ],
  },
  "Burnout Bashtronaut": {
    abilities: [
      activated({ mana: "{2}", effects: [fx.pump(ref.self, 1, 0)], label: "+1/+0" }),
      atMax({ addKeywords: ["doubleStrike"] }, "double initiative"),
    ],
  },
  "Draconautics Engineer": {
    abilities: [
      exhaust({
        mana: "{R}",
        effects: [fx.pumpAll(OTHER_CREATURE_YOU_CONTROL, 0, 0, ["haste"]), counters(1)],
        label: "célérité, marqueur +1/+1",
      }),
      exhaust({ mana: "{3}{R}", effects: [fx.createTokens(DINOSAUR_DRAGON)], label: "Dinosaure Dragon 4/4" }),
    ],
  },
  "Endrider Catalyzer": { abilities: [manaAbility("R", 2, { condition: MAX })] },
  "Endrider Spikespitter": {
    abilities: [
      triggered(when.yourUpkeep, [fx.exileTop(ref.you, 1, "c"), fx.grantPlay(ref.stored("c"))], {
        condition: MAX,
        label: "Vitesse max : exilez la carte du dessus, jouable ce tour-ci",
      }),
    ],
  },
  "Goblin Surveyor": { abilities: [surveyorDraw] },
  "Greasewrench Goblin": {
    abilities: [
      exhaust({
        mana: "{2}{R}",
        effects: [fx.discard(2, ref.you, { optional: true, store: "d" }), fx.draw(amount.v("d")), counters(1)],
        label: "défaussez jusqu'à deux cartes, piochez autant",
      }),
    ],
  },
  "Hazoret, Godseeker": {
    abilities: [
      staticAbility(
        "self",
        { addKeywords: ["cantAttack", "cantBlock"] },
        { condition: cond.not(MAX), label: "Sans vitesse max : n'attaque ni ne bloque" },
      ),
      activated({
        mana: "{1}",
        tap: true,
        targets: [target.creature("t", { maxPower: 2 })],
        effects: [fx.pump(ref.target(), 0, 0, ["unblockable"])],
        label: "Imblocable",
      }),
    ],
  },
  "Howlsquad Heavy": {
    abilities: [
      staticAbility({ subtype: "Goblin", controller: "you", other: true }, { addKeywords: ["haste"] }, { label: "Célérité" }),
      triggered(
        when.step("beginCombat"),
        [fx.createTokens(GOBLIN, 1, undefined, "g"), fx.modify(ref.stored("g"), { addKeywords: ["mustAttack"] })],
        { label: "Gobelin 1/1 qui attaque" },
      ),
      manaAbility("R", 1, { per: { subtype: "Goblin", controller: "you" }, condition: MAX }),
    ],
  },
  "Kickoff Celebrations": {
    abilities: [
      triggered(when.entersSelf, [fx.discard(1, ref.you, { optional: true, store: "d" }), fx.when(cond.v("d"), fx.draw(2))], {
        label: "Défaussez une carte, piochez-en deux",
      }),
      activated({
        sacrifice: true,
        activationCondition: MAX,
        effects: [fx.pumpAll({ ...CREATURE_OR_VEHICLE, controller: "you" }, 0, 0, ["haste"])],
        label: "Vitesse max : célérité",
      }),
    ],
  },
  "Outpace Oblivion": {
    abilities: [
      triggered(when.entersSelf, [fx.damage(5, ref.target())], {
        targets: [target.upTo(1, target.creatureOrPlaneswalker("t"))],
        label: "5 blessures",
      }),
      activated({
        mana: "{2}",
        sacrifice: true,
        effects: [fx.damage(2, ref.playersWithoutMaxSpeed)],
        label: "2 blessures à chaque joueur sans vitesse max",
      }),
    ],
  },
  "Pacesetter Paragon": {
    abilities: [
      exhaust({
        mana: "{2}{R}",
        effects: [counters(1), fx.pump(ref.self, 0, 0, ["doubleStrike"])],
        label: "marqueur, double initiative",
      }),
    ],
  },
  "Prowcatcher Specialist": { abilities: [exhaust({ mana: "{3}{R}", effects: [counters(2)], label: "deux marqueurs +1/+1" })] },
  "Spire Mechcycle": {
    abilities: [
      exhaust({
        tapOthers: { filter: { ...MOUNT_OR_VEHICLE, controller: "you", other: true }, count: 1 },
        effects: [fx.animateVehicle(), counters(amount.count({ ...MOUNT_OR_VEHICLE, controller: "you", other: true }))],
        label: "créature-artefact, marqueurs",
      }),
    ],
  },
  "Thunderhead Gunner": {
    abilities: [
      // Approximation : la défausse a lieu à la résolution (comme Solitary Cell).
      activated({
        sorcerySpeed: true,
        oncePerTurn: true,
        activationCondition: cond.amountAtLeast(amount.cardsIn("hand"), 1),
        effects: [fx.discard(1), fx.draw(1)],
        label: "Défaussez une carte : piochez",
      }),
    ],
  },

  // --- Vert ------------------------------------------------------------------
  "Afterburner Expert": {
    abilities: [
      exhaust({ mana: "{2}{G}{G}", effects: [counters(2)], label: "deux marqueurs +1/+1" }),
      triggered(when.exhaustActivated, [fx.toBattlefield(ref.self)], { fromGraveyard: true, label: "Revient du cimetière" }),
    ],
  },
  "Elvish Refueler": {
    abilities: [
      playerStatic({ exhaustReuse: true, label: "Exhaust réactivable (un par tour)" }),
      exhaust({ mana: "{1}{G}", effects: [counters(1)], label: "marqueur +1/+1" }),
    ],
  },
  "Greenbelt Guardian": {
    abilities: [
      activated({
        mana: "{G}",
        targets: [target.creature("t")],
        effects: [fx.pump(ref.target(), 0, 0, ["trample"])],
        label: "Piétinement",
      }),
      exhaust({ mana: "{3}{G}", effects: [counters(3)], label: "trois marqueurs +1/+1" }),
    ],
  },
  "Hazard of the Dunes": { abilities: [exhaust({ mana: "{6}{G}", effects: [counters(3)], label: "trois marqueurs +1/+1" })] },
  "Loxodon Surveyor": { abilities: [surveyorDraw] },
  "Point the Way": {
    abilities: [
      activated({
        mana: "{3}{G}",
        sacrifice: true,
        effects: [fx.search({ types: ["Land"], basic: true }, { to: "battlefield", tapped: true }, amount.speed)],
        label: "Jusqu'à X terrains de base (votre vitesse)",
      }),
    ],
  },
  "Stampeding Scurryfoot": {
    abilities: [exhaust({ mana: "{3}{G}", effects: [counters(1), fx.createTokens(ELEPHANT)], label: "marqueur, Éléphant 3/3" })],
  },

  // --- Multicolores ----------------------------------------------------------
  "Boom Scholar": {
    abilities: [
      playerStatic({ exhaustReduction: 2, label: "Exhaust de vos autres permanents : {2} de moins" }),
      exhaust({
        mana: "{4}{R}{G}",
        effects: [fx.pumpAll({ ...CREATURE_OR_VEHICLE, controller: "you" }, 0, 0, ["trample"]), counters(2)],
        label: "piétinement, deux marqueurs",
      }),
    ],
  },
  "Embalmed Ascendant": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(ZOMBIE)], { label: "Zombie 2/2" }),
      triggered(when.dies(CREATURE_YOU_CONTROL), fx.drain(1), { condition: MAX, label: "Vitesse max : drain 1" }),
    ],
  },
  "Far Fortune, End Boss": {
    abilities: [
      triggered(when.attackWith(1), [fx.damage(1, ref.eachOpponent)], { label: "1 blessure à chaque adversaire" }),
      playerStatic({ damagePlusOneToOpponents: true, condition: MAX, label: "Vitesse max : +1 blessure aux adversaires" }),
    ],
  },
  "Gastal Thrillseeker": {
    abilities: [
      triggered(when.entersSelf, [fx.damage(1, ref.target()), fx.gainLife(1)], {
        targets: [target.player("t", "opponent")],
        label: "1 blessure, +1 PV",
      }),
      atMax({ addKeywords: ["deathtouch", "haste"] }, "contact mortel et célérité"),
    ],
  },
  "Loot, the Pathfinder": {
    abilities: [
      exhaust({ mana: "{G}", tap: true, effects: [fx.addManaChoice(3)], label: "trois mana d'une couleur" }),
      exhaust({ mana: "{U}", tap: true, effects: [fx.draw(3)], label: "piochez trois cartes" }),
      exhaust({
        mana: "{R}",
        tap: true,
        targets: [target.any("t")],
        effects: [fx.damage(3, ref.target())],
        label: "3 blessures",
      }),
    ],
  },
  "Mendicant Core, Guidelight": {
    cdaPower: amount.count({ types: ["Artifact"], controller: "you" }),
    abilities: [
      triggered(
        when.castSpell("you", { types: ["Artifact"] }),
        fx.mayPay("{1}", "Payer {1} pour copier ce sort ?", fx.copySpell(ref.eventObject, 1)),
        { condition: MAX, label: "Vitesse max : copiez le sort d'artefact" },
      ),
    ],
  },
  "Rangers' Aetherhive": {
    abilities: [triggered(when.exhaustActivated, [fx.createTokens(THOPTER)], { label: "Thopter 1/1" })],
  },
  "Rocketeer Boostbuggy": {
    abilities: [
      triggered(when.attacksSelf, [fx.createTokens(TREASURE)], { label: "Trésor" }),
      exhaust({ mana: "{3}", effects: [fx.animateVehicle(), counters(1)], label: "créature-artefact, marqueur +1/+1" }),
    ],
  },
  "Samut, the Driving Force": {
    abilities: [
      staticAbility(OTHER_CREATURE_YOU_CONTROL, { power: 1 }, { perSpeed: true, label: "+X/+0 (votre vitesse)" }),
      costReducer({ notTypes: ["Creature"] }, 0, "Sorts non-créature : {X} de moins (votre vitesse)", {
        genericAmount: amount.speed,
      }),
    ],
  },
  "Zahur, Glory's Past": {
    abilities: [
      activated({
        sacrificeOther: { filter: { types: ["Creature"], other: true } },
        oncePerTurn: true,
        effects: [fx.surveil(1)],
        label: "Surveillance 1",
      }),
      triggered(when.dies({ types: ["Creature"], controller: "you", nontoken: true }), [fx.createTappedTokens(ZOMBIE)], {
        condition: MAX,
        label: "Vitesse max : Zombie 2/2 engagé",
      }),
    ],
  },

  // --- Incolores et terrains -------------------------------------------------
  "Camera Launcher": {
    abilities: [exhaust({ mana: "{3}", effects: [counters(1), fx.createTokens(THOPTER)], label: "marqueur, Thopter 1/1" })],
  },
  "Marshals' Pathcruiser": {
    abilities: [
      triggered(when.entersSelf, [fx.search({ types: ["Land"], basic: true })], { label: "Terrain de base en main" }),
      exhaust({
        mana: "{W}{U}{B}{R}{G}",
        effects: [fx.animateVehicle(), counters(2)],
        label: "créature-artefact, deux marqueurs",
      }),
    ],
  },
  "Racers' Scoreboard": {
    abilities: [
      triggered(when.entersSelf, [fx.draw(2), fx.discard(1)], { label: "Piochez deux cartes, défaussez-en une" }),
      costReducer({}, 1, "Vitesse max : sorts {1} de moins", { condition: MAX }),
    ],
  },
  "Starting Column": {
    abilities: [
      manaAbility(["W", "U", "B", "R", "G"]),
      activated({
        tap: true,
        sacrifice: true,
        activationCondition: MAX,
        effects: [fx.draw(2), fx.discard(1)],
        label: "Vitesse max : piochez deux cartes, défaussez-en une",
      }),
    ],
  },
  "Walking Sarcophagus": { abilities: [atMax({ power: 1, toughness: 2 }, "+1/+2")] },
  "Amonkhet Raceway": {
    abilities: [
      manaAbility("C"),
      activated({
        tap: true,
        activationCondition: MAX,
        targets: [target.creature("t")],
        effects: [fx.pump(ref.target(), 0, 0, ["haste"])],
        label: "Vitesse max : célérité",
      }),
    ],
  },
  "Avishkar Raceway": {
    abilities: [
      manaAbility("C"),
      // Approximation : la défausse a lieu à la résolution.
      activated({
        mana: "{3}",
        tap: true,
        activationCondition: cond.all(MAX, cond.amountAtLeast(amount.cardsIn("hand"), 1)),
        effects: [fx.discard(1), fx.draw(1)],
        label: "Vitesse max : défaussez, piochez",
      }),
    ],
  },
  "Muraganda Raceway": { abilities: [manaAbility("C"), manaAbility("C", 2, { condition: MAX })] },
};
