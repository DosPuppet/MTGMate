/** Tarkir: Dragonstorm — cartes bleues. */
import {
  activated,
  amount,
  BIRD_W,
  type CardScript,
  CREATURE_OPP,
  cond,
  costReducer,
  devotee,
  dragonstorm,
  flurry,
  fx,
  INSTANT_SORCERY,
  modal,
  mode,
  playerStatic,
  ref,
  renew,
  spell,
  staticAbility,
  target,
  triggered,
  when,
  ZOMBIE_DRUID,
} from "./common";

const CREATURE = { filter: { types: ["Creature" as const] }, label: "créature" };

export const BLUE: Record<string, CardScript> = {
  "Aegis Sculptor": {
    abilities: [
      triggered(
        when.yourUpkeep,
        [
          ...fx.may(
            "exiler deux cartes de votre cimetière pour un marqueur +1/+1 ?",
            fx.pickFromZone("graveyard", {}, { to: "exile" }, { count: 2, min: 2, store: "x" }),
          ),
          ...fx.when(cond.v("x", 2), fx.addCounters(ref.self, 1)),
        ],
        {
          condition: cond.amountAtLeast(amount.cardsIn("graveyard"), 2),
          label: "Exilez deux cartes de votre cimetière : marqueur +1/+1",
        },
      ),
    ],
  },
  "Ambling Stormshell": {
    abilities: [
      triggered(when.attacksSelf, [fx.counters(ref.self, "stun", 3), fx.draw(3)], {
        label: "Trois marqueurs d'étourdissement, piochez trois cartes",
      }),
      triggered(when.castSpell("you", { subtype: "Turtle" }), [fx.untap(ref.self)], { label: "Sort de Tortue : se dégage" }),
    ],
  },
  "Bewildering Blizzard": { spell: spell([], [fx.draw(3), fx.pumpAll(CREATURE_OPP, -3, 0)]) },
  Dragonologist: {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.lookAtTop(6, {
            filter: { anyOf: [{ types: ["Instant", "Sorcery"] }, { subtype: "Dragon" }] },
            count: 1,
            rest: "bottom",
          }),
        ],
        { label: "Regardez six cartes : un éphémère, un rituel ou un Dragon en main" },
      ),
      staticAbility(
        { subtype: "Dragon", controller: "you", tapped: false },
        { addKeywords: ["hexproof"] },
        { label: "Vos Dragons dégagés ont la défense talismanique" },
      ),
    ],
  },
  "Dragonstorm Forecaster": {
    abilities: [
      activated({
        mana: "{2}",
        tap: true,
        effects: [fx.search({ anyOf: [{ name: "Dragonstorm Globe" }, { name: "Boulderborn Dragon" }] })],
        label: "Cherchez Dragonstorm Globe ou Boulderborn Dragon",
      }),
    ],
  },
  "Essence Anchor": {
    abilities: [
      triggered(when.yourUpkeep, [fx.surveil(1)], { label: "Surveillance 1" }),
      activated({
        tap: true,
        activationCondition: cond.all(cond.yourTurn, cond.amountAtLeast(amount.cardsLeftGraveyardThisTurn, 1)),
        effects: [fx.createTokens(ZOMBIE_DRUID)],
        label: "Un Zombie Druide 2/2 (une carte a quitté votre cimetière ce tour-ci)",
      }),
    ],
  },
  "Focus the Mind": {
    costReduction: { generic: 2, condition: cond.castThisTurn(1) },
    spell: spell([], [fx.draw(3), fx.discard(1)]),
  },
  "Fresh Start": {
    enchant: CREATURE,
    abilities: [staticAbility("attached", { power: -5, loseAllAbilities: true }, { label: "-5/-0, perd toutes ses capacités" })],
  },
  "Highspire Bell-Ringer": {
    abilities: [
      costReducer({}, 1, "Le deuxième sort de chaque tour coûte {1} de moins", { condition: cond.castThisTurn(1, false, true) }),
    ],
  },
  "Humbling Elder": {
    abilities: [
      triggered(when.entersSelf, [fx.pump(ref.target(), -2, 0)], {
        targets: [target.creature("t", { controller: "opponent" })],
        label: "Une créature adverse gagne -2/-0",
      }),
    ],
  },
  "Iceridge Serpent": {
    abilities: [
      triggered(when.entersSelf, [fx.bounce(ref.target())], {
        targets: [target.creature("t", { controller: "opponent" })],
        label: "Renvoie une créature adverse",
      }),
    ],
  },
  "Kishla Trawlers": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          ...fx.may(
            "exiler une carte de créature de votre cimetière ?",
            fx.pickFromZone("graveyard", { types: ["Creature"] }, { to: "exile" }, { count: 1, min: 1, store: "x" }),
          ),
          ...fx.when(
            cond.v("x"),
            fx.reflexive(
              [target.cardInGraveyard("t", INSTANT_SORCERY, "you", "carte d'éphémère ou de rituel")],
              [fx.toHand(ref.target())],
            ),
          ),
        ],
        { label: "Exilez une créature de votre cimetière : un éphémère ou un rituel revient en main" },
      ),
    ],
  },
  "Ringing Strike Mastery": {
    enchant: CREATURE,
    abilities: [
      triggered(when.entersSelf, [fx.tap(ref.attached)], { label: "Engage la créature enchantée" }),
      staticAbility(
        "attached",
        {
          addKeywords: ["doesntUntap"],
          addAbilities: [activated({ mana: "{5}", effects: [fx.untap(ref.self)], label: "{5} : dégagez cette créature" })],
        },
        { label: "Ne se dégage pas ; « {5} : dégagez cette créature »" },
      ),
    ],
  },
  "Riverwalk Technique": {
    spell: modal(
      mode("Au-dessus ou au-dessous de la bibliothèque", [target.nonland()], [fx.topOrBottom(ref.target())]),
      mode(
        "Contrecarrez un sort non-créature",
        [target.spell("s", { notTypes: ["Creature"] }, "sort non-créature")],
        [fx.counter(ref.target("s"))],
      ),
    ),
  },
  "Roiling Dragonstorm": {
    abilities: [
      triggered(when.entersSelf, [fx.draw(2), fx.discard(1)], { label: "Piochez deux cartes, puis défaussez-en une" }),
      dragonstorm(),
    ],
  },
  "Sibsig Appraiser": {
    abilities: [
      triggered(when.entersSelf, [fx.lookAtTop(2, { count: 1, rest: "graveyard", exact: true })], {
        label: "Regardez deux cartes : une en main, l'autre au cimetière",
      }),
    ],
  },
  "Snowmelt Stag": {
    abilities: [
      staticAbility(
        "self",
        { setPower: 5, setToughness: 2 },
        { condition: cond.yourTurn, label: "5/2 de base pendant votre tour" },
      ),
      activated({
        mana: "{5}{U}{U}",
        effects: [fx.modify(ref.self, { addKeywords: ["unblockable"] })],
        label: "Ne peut pas être bloquée ce tour-ci",
      }),
    ],
  },
  "Spectral Denial": {
    costReduction: { generic: amount.count({ types: ["Creature"], controller: "you", minPower: 4 }) },
    spell: spell(
      [target.spell()],
      [...fx.unlessPays(ref.controllerOf(ref.target()), { genericAmount: amount.x }, fx.counter(ref.target()))],
    ),
  },
  "Stillness in Motion": {
    abilities: [
      triggered(
        when.yourUpkeep,
        [
          fx.mill(3),
          ...fx.when(
            cond.not(cond.amountAtLeast(amount.cardsIn("library"), 1)),
            fx.exile(ref.self),
            fx.pickFromZone(
              "graveyard",
              {},
              { to: "libraryTop" },
              { count: 5, min: 5, prompt: "Cinq cartes à remettre sur votre bibliothèque" },
            ),
          ),
        ],
        { label: "Meulez trois cartes ; bibliothèque vide : cinq cartes reviennent dessus" },
      ),
    ],
  },
  "Temur Devotee": { abilities: [devotee(["G", "U", "R"])] },
  "Unending Whisper": { spell: spell([], [fx.draw(1)]) },
  "Ureni's Rebuff": { spell: spell([target.creature()], [fx.bounce(ref.target())]) },
  "Veteran Ice Climber": {
    keywords: ["unblockable"],
    abilities: [
      triggered(when.attacksSelf, [fx.mill(amount.powerOf(ref.self), ref.target())], {
        targets: [target.optional(target.player())],
        label: "Un joueur meule autant que sa force",
      }),
    ],
  },
  "Wingspan Stride": {
    enchant: CREATURE,
    abilities: [
      staticAbility("attached", { power: 1, toughness: 1, addKeywords: ["flying"] }, { label: "+1/+1 et le vol" }),
      activated({ mana: "{2}{U}", effects: [fx.bounce(ref.self)], label: "Renvoyez cette Aura en main" }),
    ],
  },

  // --- Lot B ------------------------------------------------------------------
  "Agent of Kotis": {
    abilities: [renew("{3}{U}", [target.creature()], [fx.addCounters(ref.target(), 2)], "deux marqueurs +1/+1 sur une créature")],
  },
  "Constrictor Sage": {
    abilities: [
      triggered(when.entersSelf, [fx.tap(ref.target()), fx.counters(ref.target(), "stun")], {
        targets: [target.creature("t", { controller: "opponent" })],
        label: "Engage une créature adverse, marqueur d'étourdissement",
      }),
      renew(
        "{2}{U}",
        [target.creature("t", { controller: "opponent" })],
        [fx.tap(ref.target()), fx.counters(ref.target(), "stun")],
        "engagez une créature adverse, marqueur d'étourdissement",
      ),
    ],
  },
  "Skimming Strike": { spell: spell([target.optional(target.creature())], [fx.tap(ref.target()), fx.draw(1)]) },
  "Marang River Regent": {
    abilities: [
      triggered(when.entersSelf, [fx.bounce(ref.target())], {
        targets: [target.upTo(2, target.nonland("t", { other: true }, "autre permanent non-terrain"))],
        label: "Renvoie jusqu'à deux autres permanents non-terrain",
      }),
    ],
  },
  "Coil and Catch": { spell: spell([], [fx.draw(3), fx.discard(1)]) },
  "Naga Fleshcrafter": {
    entersAsCopyOf: { types: ["Creature"] },
    entersAsCopyAnyController: true,
    abilities: [
      renew(
        "{2}{U}",
        [target.creature("t", { controller: "you", legendary: false })],
        [
          fx.addCounters(ref.target(), 1),
          fx.becomeCopy(ref.except(ref.permanentsOf(ref.you, { types: ["Creature"] }), ref.target()), ref.target()),
        ],
        "marqueur +1/+1 ; vos autres créatures deviennent des copies de celle-ci",
      ),
    ],
  },
  "Wingblade Disciple": { abilities: [flurry([fx.createTokens(BIRD_W)], "un Oiseau 1/1 volant")] },
  "Whirlwing Stormbrood": {
    abilities: [
      playerStatic({
        flashFor: { anyOf: [{ types: ["Sorcery"] }, { subtype: "Dragon" }] },
        label: "Vos rituels et vos sorts de Dragon ont le flash",
      }),
    ],
  },
  "Dynamic Soar": {
    spell: spell([target.creature("t", { controller: "you" })], [fx.addCounters(ref.target(), 3)]),
  },
};
