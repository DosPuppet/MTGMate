/**
 * Duskmourn, lot C : légendaires, Salles et cartes uniques (convocation accordée, portes, face cachée, délire à modes,
 * copies de sorts, remplacements de blessures…).
 */
import type { TokenSpec } from "@mtgx/engine";
import {
  activated,
  amount,
  BASIC_LAND,
  block,
  blockAbility,
  type CardScript,
  CREATURE_OR_ENCHANTMENT,
  CREATURE_YOU_CONTROL,
  chapter,
  cond,
  costReducer,
  eerie,
  eventReplacement,
  fx,
  graveyardReplacement,
  INSTANT_SORCERY,
  manaAbility,
  modal,
  mode,
  playerStatic,
  ref,
  spell,
  staticAbility,
  survival,
  TOY,
  target,
  triggered,
  triggeredModal,
  when,
} from "./common";

const TAPPED = cond.sourceMatches({ tapped: true });
const ANY_COLOR = ["W", "U", "B", "R", "G"] as const;

/** Toby : Bête blanche 4/4 « ce jeton ne peut ni attaquer ni bloquer seul ». */
const TOBY_BEAST: TokenSpec = {
  name: "Beast",
  colors: ["W"],
  types: ["Creature"],
  subtypes: ["Beast"],
  power: 4,
  toughness: 4,
  abilities: [blockAbility(block.notAlone)],
  text: "This token can't attack or block alone.",
};

/** Zimone : Primo, the Indivisible, Fractale légendaire verte et bleue 0/0. */
const PRIMO: TokenSpec = {
  name: "Primo, the Indivisible",
  colors: ["G", "U"],
  types: ["Creature"],
  subtypes: ["Fractal"],
  power: 0,
  toughness: 0,
  legendary: true,
};

/** Niko : Éclat, enchantement « {2}, sacrifiez ce jeton : regard 1, puis piochez une carte ». */
const SHARD: TokenSpec = {
  name: "Shard",
  colors: [],
  types: ["Enchantment"],
  subtypes: ["Shard"],
  abilities: [activated({ mana: "{2}", sacrifice: true, effects: [fx.scry(1), fx.draw(1)], label: "Regard 1, piochez" })],
  text: "{2}, Sacrifice this token: Scry 1, then draw a card.",
};

const LETS_PLAY = {
  minus: [fx.pumpAll({ types: ["Creature"], controller: "opponent" }, -1, -1)],
  discard: [fx.discard(2, ref.eachOpponent)],
  drain: fx.drain(3),
};

export const LEGENDS: Record<string, CardScript> = {
  // Blanc
  "Dazzling Theater": {
    abilities: [playerStatic({ convokeCreatureSpells: true, label: "Vos sorts de créature ont la convocation" })],
  },
  "Prop Room": {
    abilities: [
      playerStatic({ untapCreaturesOnOthersUntap: true, label: "Vos créatures se dégagent pendant le dégagement des autres" }),
    ],
  },
  "Dollmaker's Shop": {
    // « une ou plusieurs créatures non-Jouets attaquent un joueur » : approximé par « chaque fois que vous attaquez ».
    abilities: [triggered(when.attackWith(), [fx.createTokens(TOY)], { label: "Jeton Jouet 1/1" })],
  },
  "Porcelain Gallery": {
    abilities: [
      staticAbility(
        CREATURE_YOU_CONTROL,
        { setPower: 1, setToughness: 1 },
        { per: CREATURE_YOU_CONTROL, label: "F/E de base égales au nombre de vos créatures" },
      ),
    ],
  },
  "Orphans of the Wheat": {
    abilities: [
      triggered(
        when.attacksSelf,
        [fx.tapChosen({ types: ["Creature"], other: true }, "n"), fx.pump(ref.self, amount.v("n"), amount.v("n"))],
        { label: "Engagez des créatures : +1/+1 pour chacune" },
      ),
    ],
  },
  "Possessed Goat": {
    abilities: [
      activated({
        mana: "{3}",
        discard: 1,
        once: true,
        effects: [fx.addCounters(ref.self, 3), fx.modify(ref.self, { addColors: ["B"], addSubtypes: ["Demon"] }, "permanent")],
        label: "Trois marqueurs +1/+1, devient un Démon noir",
      }),
    ],
  },
  "Reluctant Role Model": {
    abilities: [
      triggeredModal(
        when.secondMain,
        [
          mode("Un marqueur de vol", [], [fx.counters(ref.self, "flying", 1)]),
          mode("Un marqueur de lien de vie", [], [fx.counters(ref.self, "lifelink", 1)]),
          mode("Un marqueur +1/+1", [], [fx.addCounters(ref.self, 1)]),
        ],
        { condition: TAPPED, label: "Survie — un marqueur" },
      ),
      triggered(when.dies(CREATURE_YOU_CONTROL), [fx.lkiCountersTo(ref.target())], {
        condition: cond.eventObjectMatches({ withCounter: "any" }),
        targets: [target.upTo(1, target.creature())],
        label: "Ses marqueurs sur une créature",
      }),
    ],
  },
  "Toby, Beastie Befriender": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(TOBY_BEAST)], { label: "Jeton Bête 4/4" }),
      staticAbility(
        { ...CREATURE_YOU_CONTROL, token: true },
        { addKeywords: ["flying"] },
        {
          condition: cond.controls({ types: ["Creature"], token: true }, 4),
          label: "Vos jetons de créature ont le vol (quatre ou plus)",
        },
      ),
    ],
  },
  "Unidentified Hovership": {
    abilities: [
      triggered(when.entersSelf, [fx.exileCard(ref.target(), { name: "x" }), fx.link(ref.stored("x"))], {
        targets: [target.upTo(1, target.creature("t", { maxToughness: 5 }))],
        label: "Exilez une créature d'endurance 5 ou moins",
      }),
      triggered(when.leavesSelf, [fx.manifestDreadBy({ who: ref.controllerOf(ref.linked) })], {
        label: "Son propriétaire manifeste l'effroi",
      }),
    ],
  },
  "Veteran Survivor": {
    abilities: [
      survival([fx.exileCard(ref.target(), { name: "x" }), fx.link(ref.stored("x"))], {
        targets: [target.upTo(1, target.cardInGraveyard("t", {}, "any"))],
        label: "Exilez une carte d'un cimetière",
      }),
      staticAbility(
        "self",
        { power: 3, toughness: 3, addKeywords: ["hexproof"] },
        {
          condition: cond.amountAtLeast(amount.refCount(ref.linked), 3),
          label: "+3/+3 et la défense talismanique (trois cartes exilées)",
        },
      ),
    ],
  },

  // Bleu
  "Central Elevator": {
    // « qui n'a pas le même nom qu'une Salle que vous contrôlez » : non vérifié.
    abilities: [triggered(when.unlockThisDoor, [fx.search({ subtype: "Room" })], { label: "Cherchez une Salle" })],
  },
  "Promising Stairs": {
    abilities: [
      triggered(when.yourUpkeep, [fx.surveil(1), ...fx.when(cond.amountAtLeast(amount.unlockedDoorNames, 8), fx.winGame)], {
        label: "Surveillance 1 ; huit portes : vous gagnez la partie",
      }),
    ],
  },
  "Creeping Peeper": {
    abilities: [
      manaAbility("U", 1, {
        restriction: { spell: { types: ["Enchantment"] }, abilityOfSource: { anyOf: [{ subtype: "Room" }, { faceDown: true }] } },
      }),
    ],
  },
  "Fear of Impostors": {
    abilities: [
      triggered(when.entersSelf, [fx.counter(ref.target()), fx.manifestDreadBy({ who: ref.controllerOf(ref.target()) })], {
        targets: [target.spell()],
        label: "Contrecarrez un sort ; son contrôleur manifeste l'effroi",
      }),
    ],
  },
  "Floodpits Drowner": {
    abilities: [
      triggered(when.entersSelf, [fx.tap(ref.target()), fx.counters(ref.target(), "stun", 1)], {
        targets: [target.creature("t", { controller: "opponent" })],
        label: "Engagez une créature, marqueur d'étourdissement",
      }),
      activated({
        mana: "{1}{U}",
        tap: true,
        targets: [target.creature("t", { withCounter: "stun" })],
        effects: [
          fx.moveTo(ref.self, { to: "libraryTop", shuffle: true }),
          fx.moveTo(ref.target(), { to: "libraryTop", shuffle: true }),
        ],
        label: "Mélangez-la avec une créature étourdie dans les bibliothèques",
      }),
    ],
  },
  "Leyline of Transformation": {
    leyline: true,
    chooseOnEnter: "creatureType",
    // Sorts et cartes hors du champ de bataille : non gérés.
    abilities: [staticAbility(CREATURE_YOU_CONTROL, { addChosenSubtype: true }, { label: "Vos créatures sont du type choisi" })],
  },
  "Marina Vendrell's Grimoire": {
    abilities: [
      triggered(when.entersSelf, [fx.draw(5)], { condition: cond.wasCast, label: "Piochez cinq cartes" }),
      playerStatic({ noMaxHandSize: true, noLoseForLife: true, label: "Pas de main maximale ; pas de défaite à 0 PV" }),
      triggered(when.gainLife, [fx.draw(amount.eventAmount)], { label: "Piochez autant de cartes" }),
      triggered(
        when.loseLife("you"),
        [fx.discard(amount.eventAmount), ...fx.when(cond.not(cond.amountAtLeast(amount.cardsIn("hand"), 1)), fx.loseGame)],
        { label: "Défaussez autant de cartes ; sans carte en main, vous perdez" },
      ),
    ],
  },
  "The Mindskinner": {
    keywords: ["unblockable"],
    abilities: [
      eventReplacement({
        event: "damage",
        source: { controller: "you" },
        to: "opponent",
        modify: { prevent: true },
        onPrevent: { opponentsMill: true },
        label: "Blessures aux adversaires prévenues : ils meulent autant",
      }),
    ],
  },
  "Mirror Room": {
    abilities: [
      triggered(when.unlockThisDoor, [fx.copyToken(ref.target(), { addSubtypes: ["Reflection"] })], {
        targets: [target.creature("t", { controller: "you" })],
        label: "Jeton copie (Reflet)",
      }),
    ],
  },
  "Fractured Realm": {
    abilities: [
      playerStatic({ triggerMod: { effect: "again" }, label: "Vos capacités déclenchées se déclenchent une fois de plus" }),
    ],
  },
  "Paranormal Analyst": {
    abilities: [
      triggered(when.manifestDread, [fx.toHand(ref.eventObject)], { label: "La carte mise au cimetière revient en main" }),
    ],
  },
  "Stay Hidden, Stay Silent": {
    enchant: { filter: { types: ["Creature"] }, label: "créature" },
    abilities: [
      triggered(when.entersSelf, [fx.tap(ref.attached)], { label: "Engagez la créature enchantée" }),
      staticAbility("attached", { addKeywords: ["doesntUntap"] }, { label: "Ne se dégage pas" }),
      activated({
        mana: "{4}{U}{U}",
        sorcerySpeed: true,
        effects: [fx.moveTo(ref.attached, { to: "libraryTop", shuffle: true }), fx.manifestDread],
        label: "Mélangez la créature enchantée, manifestation effroyable",
      }),
    ],
  },
  "The Tale of Tamiyo": {
    abilities: [
      chapter([1, 2, 3], [fx.millWhileShared], { label: "Meulez deux cartes (et recommencez si elles partagent un type)" }),
      chapter([4], [fx.exileCard(ref.target(), { name: "c" }), fx.castCopiesFree([ref.stored("c")], 99)], {
        targets: [
          target.upTo(
            20,
            target.cardInGraveyard(
              "t",
              { anyOf: [{ types: ["Instant", "Sorcery"] }, { types: ["Planeswalker"], subtype: "Tamiyo" }] },
              "you",
              "éphémère, rituel ou carte de Tamiyo",
            ),
          ),
        ],
      }),
    ],
  },
  "Unable to Scream": {
    enchant: { filter: { types: ["Creature"] }, label: "créature" },
    abilities: [
      staticAbility(
        "attached",
        { loseAllAbilities: true, addTypes: ["Artifact", "Creature"], addSubtypes: ["Toy"], setPower: 0, setToughness: 2 },
        { label: "Perd ses capacités, Jouet 0/2" },
      ),
    ],
  },

  // Noir
  "Come Back Wrong": {
    spell: spell(
      [target.creature()],
      [
        fx.destroy(ref.target(), "d"),
        fx.moveTo(ref.stored("d"), { to: "battlefield", underYourControl: true }, { name: "b", filter: { types: ["Creature"] } }),
        fx.delayed([fx.sacrificeIt(ref.target("b"))], { b: ref.stored("b") }),
      ],
    ),
  },
  "Cynical Loner": {
    abilities: [
      blockAbility(block.notBy({ subtype: "Glimmer" }, "Imblocable par les Lueurs")),
      survival([...fx.may("Chercher une carte à mettre au cimetière ?", fx.search({}, { to: "graveyard" }))], {
        label: "Une carte de votre bibliothèque au cimetière",
      }),
    ],
  },
  "Doomsday Excruciator": {
    abilities: [
      triggered(when.entersSelf, [fx.exileLibraryButBottom(ref.eachPlayer, 6)], {
        condition: cond.wasCast,
        label: "Chaque joueur exile sa bibliothèque sauf les six cartes du dessous",
      }),
      triggered(when.yourUpkeep, [fx.draw(1)], { label: "Piochez une carte" }),
    ],
  },
  "Let's Play a Game": {
    spell: modal(
      mode("Créatures adverses -1/-1", [], LETS_PLAY.minus),
      mode("Chaque adversaire défausse deux cartes", [], LETS_PLAY.discard),
      mode("Drain de 3", [], LETS_PLAY.drain),
      { ...mode("-1/-1 et défausse", [], [...LETS_PLAY.minus, ...LETS_PLAY.discard]), condition: cond.delirium },
      { ...mode("-1/-1 et drain", [], [...LETS_PLAY.minus, ...LETS_PLAY.drain]), condition: cond.delirium },
      { ...mode("Défausse et drain", [], [...LETS_PLAY.discard, ...LETS_PLAY.drain]), condition: cond.delirium },
      {
        ...mode("Les trois modes", [], [...LETS_PLAY.minus, ...LETS_PLAY.discard, ...LETS_PLAY.drain]),
        condition: cond.delirium,
      },
    ),
  },
  "Leyline of the Void": {
    leyline: true,
    abilities: [graveyardReplacement({ graveyardOf: "opponent", label: "Ce qui irait au cimetière adverse est exilé" })],
  },
  "Meathook Massacre II": {
    abilities: [
      triggered(when.entersSelf, [fx.sacrifice(ref.eachPlayer, { types: ["Creature"] }, amount.sourceX)], {
        label: "Chaque joueur sacrifie X créatures",
      }),
      triggered(
        when.dies(CREATURE_YOU_CONTROL),
        [
          ...fx.mayPayLife(
            3,
            "Payer 3 PV pour la renvoyer ?",
            fx.toBattlefield(ref.eventObject, { underYourControl: true, counters: { kind: "finality", n: 1 } }),
          ),
        ],
        { label: "Payez 3 PV : elle revient (finalité)" },
      ),
      triggered(
        when.dies({ types: ["Creature"], controller: "opponent" }),
        [
          ...fx.unlessPays(
            ref.eventPlayer,
            { life: 3 },
            fx.toBattlefield(ref.eventObject, { underYourControl: true, counters: { kind: "finality", n: 1 } }),
          ),
        ],
        { label: "Sauf s'il paie 3 PV, elle revient sous votre contrôle" },
      ),
    ],
  },
  "Nowhere to Run": {
    abilities: [
      triggered(when.entersSelf, [fx.pump(ref.target(), -3, -3)], {
        targets: [target.creature("t", { controller: "opponent" })],
        label: "-3/-3",
      }),
      playerStatic({ ignoreOpponentsHexproofWard: true, label: "Ignore la défense talismanique et la garde adverses" }),
    ],
  },
  "Osseous Sticktwister": {
    abilities: [
      triggered(
        when.yourEndStep,
        [fx.punisher(ref.eachOpponent, 0, { discard: true, sacrifice: { nonland: true }, damage: amount.powerOf(ref.self) })],
        { condition: cond.delirium, label: "Délire — sacrifice, défausse ou blessures" },
      ),
    ],
  },
  "Sporogenic Infection": {
    enchant: { filter: { types: ["Creature"] }, label: "créature" },
    abilities: [
      triggered(when.entersSelf, [fx.sacrifice(ref.target(), { types: ["Creature"], notAttachedToSource: true })], {
        targets: [target.player()],
        label: "Il sacrifie une autre créature",
      }),
      triggered(when.attachedIsDealtDamage, [fx.destroy(ref.attached)], { label: "Détruisez la créature enchantée" }),
    ],
  },

  // Rouge
  "Charred Foyer": {
    abilities: [triggered(when.yourUpkeep, [fx.impulse(1)], { label: "Exilez la carte du dessus, jouable ce tour-ci" })],
  },
  "Cursed Recording": {
    abilities: [
      triggered(
        when.castSpell("you", INSTANT_SORCERY),
        [
          fx.counters(ref.self, "time", 1),
          ...fx.when(cond.counterAtLeast("time", 7), fx.removeCounters(ref.self, 99, "time"), fx.damage(20, ref.you)),
        ],
        { label: "Marqueur de temps ; à sept, 20 blessures" },
      ),
      activated({ tap: true, effects: [fx.copyNextSpell], label: "Copiez le prochain éphémère ou rituel" }),
    ],
  },
  "Grab the Prize": {
    additionalCost: { discard: 1 },
    spell: spell(
      [],
      [fx.draw(2), ...fx.when(cond.refMatches(ref.costDiscarded, { notTypes: ["Land"] }), fx.damage(2, ref.eachOpponent))],
    ),
  },
  "Leyline of Resonance": {
    leyline: true,
    // « qui ne cible qu'une seule créature que vous contrôlez » : approximé par « qui cible une créature que vous contrôlez ».
    abilities: [
      triggered(when.castSpell("you", INSTANT_SORCERY, { objects: CREATURE_YOU_CONTROL }), [fx.copySpell(ref.eventObject, 1)], {
        label: "Copiez ce sort",
      }),
    ],
  },
  "Screaming Nemesis": {
    abilities: [
      triggered(when.isDealtDamage, [fx.damage(amount.eventAmount, ref.target()), fx.cantGainLife(ref.target())], {
        targets: [
          {
            id: "t",
            label: "une autre cible",
            filter: { players: "any", objects: { types: ["Creature", "Planeswalker", "Battle"], other: true } },
          },
        ],
        label: "Autant de blessures ; ce joueur ne gagne plus de PV",
      }),
    ],
  },
  "Waltz of Rage": {
    spell: spell(
      [target.creature("t", { controller: "you" })],
      [
        fx.damageAll(amount.powerOf(ref.target()), { types: ["Creature"] }, undefined, ref.target()),
        fx.emblem(
          "Waltz of Rage",
          "Until end of turn, whenever a creature you control dies, exile the top card of your library. You may play it until the end of your next turn.",
          [triggered(when.dies(CREATURE_YOU_CONTROL), [fx.impulse(1, "yourNextTurn")], { label: "Exilez la carte du dessus" })],
          false,
          true,
        ),
      ],
    ),
  },

  // Vert
  Anthropede: {
    abilities: [
      triggered(
        when.entersSelf,
        [
          ...fx.may(
            "Défausser une carte pour détruire une Salle ?",
            fx.discard(1, ref.you, { store: "d" }),
            ...fx.when(
              cond.v("d"),
              fx.reflexive([target.permanent("t", ["Enchantment"], { subtype: "Room" }, "Salle")], [fx.destroy(ref.target())]),
            ),
          ),
          ...fx.when(
            cond.not(cond.v("d")),
            fx.mayPay(
              "{2}",
              "Payer {2} pour détruire une Salle ?",
              fx.reflexive([target.permanent("t", ["Enchantment"], { subtype: "Room" }, "Salle")], [fx.destroy(ref.target())]),
            ),
          ),
        ],
        { label: "Défaussez ou payez {2} : détruisez une Salle" },
      ),
    ],
  },
  "Cathartic Parting": {
    spell: spell(
      [
        target.permanent("t", ["Artifact", "Enchantment"], { controller: "opponent" }, "artefact ou enchantement adverse"),
        target.upTo(4, target.cardInGraveyard("g")),
      ],
      [
        fx.moveTo(ref.target(), { to: "libraryTop", shuffle: true }),
        fx.moveTo(ref.target("g"), { to: "libraryTop", shuffle: true }),
      ],
    ),
  },
  "Coordinated Clobbering": {
    spell: spell(
      [
        target.upTo(2, target.creature("a", { controller: "you", tapped: false })),
        target.creature("t", { controller: "opponent" }),
      ],
      [fx.tap(ref.target("a")), fx.eachOfDealsDamage(ref.target("a"), ref.target("t"))],
    ),
  },
  "Cryptid Inspector": {
    abilities: [
      triggered(when.enters({ controller: "you", faceDown: true }), [fx.addCounters(ref.self, 1)], { label: "Marqueur +1/+1" }),
      triggered(when.permanentTurnedFaceUp({ controller: "you" }), [fx.addCounters(ref.self, 1)], { label: "Marqueur +1/+1" }),
    ],
  },
  "Hauntwoods Shrieker": {
    abilities: [
      triggered(when.attacksSelf, [fx.manifestDread], { label: "Manifestation effroyable" }),
      activated({
        mana: "{1}{G}",
        targets: [{ id: "t", label: "permanent face cachée", filter: { objects: { faceDown: true } } }],
        effects: [fx.revealFaceDown(ref.target())],
        label: "Révélez un permanent face cachée",
      }),
    ],
  },
  "Hedge Shredder": {
    abilities: [
      triggered(when.attacksSelf, [...fx.may("Meuler deux cartes ?", fx.mill(2))], { label: "Meulez deux cartes" }),
      triggered(
        when.zoneChange(["library"], { to: ["graveyard"], filter: { types: ["Land"] }, whose: "you" }),
        [fx.toBattlefield(ref.eventObject, { tapped: true })],
        { label: "Le terrain meulé arrive engagé" },
      ),
    ],
  },
  "Insidious Fungus": {
    abilities: [
      activated({
        mana: "{2}",
        sacrifice: true,
        targets: [target.permanent("t", ["Artifact"], {}, "artefact")],
        effects: [fx.destroy(ref.target())],
        label: "Détruisez un artefact",
      }),
      activated({
        mana: "{2}",
        sacrifice: true,
        targets: [target.permanent("t", ["Enchantment"], {}, "enchantement")],
        effects: [fx.destroy(ref.target())],
        label: "Détruisez un enchantement",
      }),
      activated({
        mana: "{2}",
        sacrifice: true,
        effects: [
          fx.draw(1),
          fx.pickFromZone("hand", { types: ["Land"] }, { to: "battlefield", tapped: true }, { min: 0, prompt: "Un terrain" }),
        ],
        label: "Piochez, puis un terrain de votre main engagé",
      }),
    ],
  },
  "Omnivorous Flytrap": {
    abilities: [
      ...[when.entersSelf, when.attacksSelf].map((w) =>
        triggered(
          w,
          [
            fx.countersDivided(2, ref.target()),
            ...fx.when(cond.amountAtLeast(amount.cardTypesInGraveyard, 6), fx.doubleCounters(ref.target())),
          ],
          {
            condition: cond.delirium,
            targets: [target.upTo(2, target.creature())],
            label: "Délire — deux marqueurs +1/+1 répartis",
          },
        ),
      ),
    ],
  },
  "Overgrown Zealot": {
    abilities: [
      manaAbility([...ANY_COLOR]),
      manaAbility([...ANY_COLOR], 2, { restriction: { abilityOfSource: { faceDown: true } } }),
    ],
  },
  "Rootwise Survivor": {
    abilities: [
      survival(
        [
          fx.addCounters(ref.target(), 3),
          fx.modify(
            ref.target(),
            { addTypes: ["Creature"], addSubtypes: ["Elemental"], setPower: 0, setToughness: 0 },
            "permanent",
          ),
          fx.modify(ref.target(), { addKeywords: ["haste"] }, "untilYourNextTurn"),
        ],
        {
          targets: [target.upTo(1, target.permanent("t", ["Land"], { controller: "you" }, "terrain que vous contrôlez"))],
          label: "Un terrain devient une créature 0/0 avec trois marqueurs",
        },
      ),
    ],
  },
  "Say Its Name": {
    spell: spell(
      [],
      [
        fx.mill(3),
        fx.pickFromZone(
          "graveyard",
          { types: ["Creature", "Land"] },
          { to: "hand" },
          { min: 0, prompt: "Une créature ou un terrain" },
        ),
      ],
    ),
    abilities: [
      activated({
        fromGraveyard: true,
        exileSelf: true,
        exileFromGraveyard: { filter: { name: "Say Its Name" }, count: 2 },
        sorcerySpeed: true,
        effects: [
          fx.pickFromZone("graveyard", { name: "Altanak, the Thrice-Called" }, { to: "battlefield" }, { min: 0, store: "g" }),
          ...fx.when(
            cond.not(cond.v("g")),
            fx.pickFromZone("hand", { name: "Altanak, the Thrice-Called" }, { to: "battlefield" }, { min: 0, store: "h" }),
          ),
          ...fx.when(
            cond.all(cond.not(cond.v("g")), cond.not(cond.v("h"))),
            fx.search({ name: "Altanak, the Thrice-Called" }, { to: "battlefield" }),
          ),
        ],
        label: "Cherchez Altanak",
      }),
    ],
  },
  "Threats Around Every Corner": {
    abilities: [
      triggered(when.entersSelf, [fx.manifestDread], { label: "Manifestation effroyable" }),
      triggered(
        when.enters({ controller: "you", faceDown: true }),
        [fx.search(BASIC_LAND, { to: "battlefield", tapped: true })],
        {
          label: "Un terrain de base engagé",
        },
      ),
    ],
  },
  "Tyvar, the Pummeler": {
    abilities: [
      activated({
        tapOthers: { filter: { types: ["Creature"] }, count: 1 },
        effects: [fx.pump(ref.self, 0, 0, ["indestructible"]), fx.tap(ref.self)],
        label: "Engagez une autre créature : indestructible",
      }),
      activated({
        mana: "{3}{G}{G}",
        effects: [fx.pumpAll(CREATURE_YOU_CONTROL, amount.maxPower(CREATURE_YOU_CONTROL), amount.maxPower(CREATURE_YOU_CONTROL))],
        label: "Vos créatures +X/+X (plus grande force)",
      }),
    ],
  },
  "Valgavoth's Onslaught": {
    spell: spell([], [fx.manifestDreadBy({ times: amount.x, store: "m" }), fx.addCounters(ref.stored("m"), amount.x)]),
  },
  "Walk-In Closet": {
    abilities: [
      playerStatic({
        playFrom: { zone: "graveyard", what: "lands" },
        label: "Vous pouvez jouer des terrains depuis votre cimetière",
      }),
    ],
  },
  "Forgotten Cellar": {
    abilities: [
      triggered(
        when.unlockThisDoor,
        [
          fx.emblem(
            "Forgotten Cellar",
            "This turn, you may cast spells from your graveyard, and if a card would be put into your graveyard from anywhere, exile it instead.",
            [playerStatic({ playFrom: { zone: "graveyard", what: "spells" } }), graveyardReplacement({ graveyardOf: "you" })],
            false,
            true,
          ),
        ],
        { label: "Sorts depuis le cimetière ce tour-ci" },
      ),
    ],
  },

  // Multicolores
  "Beastie Beatdown": {
    spell: spell(
      [target.creature("a", { controller: "you" }), target.creature("t", { controller: "opponent" })],
      [
        ...fx.when(cond.delirium, fx.addCounters(ref.target("a"), 2)),
        fx.damage(amount.powerOf(ref.target("a")), ref.target("t"), ref.target("a")),
      ],
    ),
  },
  "Disturbing Mirth": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.sacrifice(ref.you, { ...CREATURE_OR_ENCHANTMENT, other: true }, 1, { optional: true, store: "s" }),
          ...fx.when(cond.v("s"), fx.draw(2)),
        ],
        { label: "Sacrifiez : piochez deux cartes" },
      ),
      triggered(when.sacrifice({ self: true }), [fx.manifestDread], { label: "Manifestation effroyable" }),
    ],
  },
  "Growing Dread": {
    abilities: [
      triggered(when.entersSelf, [fx.manifestDread], { label: "Manifestation effroyable" }),
      triggered(when.permanentTurnedFaceUp({ controller: "you" }), [fx.addCounters(ref.eventObject, 1)], {
        label: "Marqueur +1/+1",
      }),
    ],
  },
  "Inquisitive Glimmer": {
    abilities: [
      costReducer({ types: ["Enchantment"] }, 1, "Vos sorts d'enchantement coûtent {1} de moins"),
      playerStatic({ abilityCost: { ability: "unlock", reduce: 1 }, label: "Déverrouiller vous coûte {1} de moins" }),
    ],
  },
  "Nashi, Searcher in the Dark": {
    abilities: [
      triggered(
        when.combatDamageToPlayer,
        [
          fx.mill(amount.eventAmount, ref.you, { name: "m" }),
          fx.pickFromZone(
            "graveyard",
            { anyOf: [{ legendary: true }, { types: ["Enchantment"] }] },
            { to: "hand" },
            {
              count: amount.eventAmount,
              min: 0,
              pool: ref.stored("m"),
              store: "p",
              prompt: "Cartes légendaires ou d'enchantement",
            },
          ),
          ...fx.when(cond.not(cond.v("p")), fx.addCounters(ref.self, 1)),
        ],
        { label: "Meulez autant ; légendaires et enchantements en main" },
      ),
    ],
  },
  "Niko, Light of Hope": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(SHARD, 2)], { label: "Deux jetons Éclat" }),
      activated({
        mana: "{2}",
        tap: true,
        targets: [target.creature("t", { controller: "you", legendary: false })],
        effects: [
          fx.exileCard(ref.target(), { name: "x" }),
          fx.becomeCopy(ref.permanentsOf(ref.you, { subtype: "Shard" }), ref.stored("x")),
          fx.delayed([fx.toBattlefield(ref.target("x"))], { x: ref.stored("x") }),
        ],
        label: "Exilez une créature : vos Éclats en deviennent des copies",
      }),
    ],
  },
  "Oblivious Bookworm": {
    abilities: [
      triggered(
        when.yourEndStep,
        [...fx.may("Piocher une carte ?", fx.draw(1), ...fx.when(cond.not(cond.faceDownOrUp), fx.discard(1)))],
        { label: "Piochez (puis défaussez, sauf face cachée ce tour-ci)" },
      ),
    ],
  },
  "Rip, Spawn Hunter": {
    // « avec des forces différentes » : non vérifié.
    abilities: [
      survival(
        [
          fx.lookAtTop(amount.powerOf(ref.self), {
            filter: { anyOf: [{ types: ["Creature"] }, { subtype: "Vehicle" }] },
            count: amount.powerOf(ref.self),
            rest: "bottom",
          }),
        ],
        { label: "Créatures et Véhicules parmi les X du dessus" },
      ),
    ],
  },
  "Sawblade Skinripper": {
    abilities: [
      activated({
        mana: "{2}",
        sacrificeOther: { filter: { ...CREATURE_OR_ENCHANTMENT, other: true } },
        effects: [fx.addCounters(ref.self, 1)],
        label: "Sacrifiez : marqueur +1/+1",
      }),
      triggered(when.yourEndStep, [fx.damage(amount.sacrificedThisTurn, ref.target())], {
        condition: cond.sacrificedThisTurn,
        targets: [target.any()],
        label: "Blessures égales aux permanents sacrifiés",
      }),
    ],
  },
  "Misty Salon": {
    abilities: [
      triggered(
        when.unlockThisDoor,
        [
          fx.createXXToken(
            { name: "Spirit", colors: ["U"], types: ["Creature"], subtypes: ["Spirit"], keywords: ["flying"] },
            amount.unlockedDoors,
          ),
        ],
        { label: "Esprit X/X volant" },
      ),
    ],
  },
  "Victor, Valgavoth's Seneschal": {
    abilities: [
      eerie(
        [
          fx.countResolution("n"),
          ...fx.when(cond.all(cond.v("n", 1), cond.not(cond.v("n", 2))), fx.surveil(2)),
          ...fx.when(cond.all(cond.v("n", 2), cond.not(cond.v("n", 3))), fx.discard(1, ref.eachOpponent)),
          ...fx.when(
            cond.all(cond.v("n", 3), cond.not(cond.v("n", 4))),
            fx.pickFromZone(
              "graveyard",
              { types: ["Creature"] },
              { to: "battlefield", underYourControl: true },
              {
                pool: ref.allGraveyards,
                prompt: "Une carte de créature d'un cimetière",
              },
            ),
          ),
        ],
        { label: "Surveillance 2, défausse, puis réanimation" },
      ),
    ],
  },
  "Zimone, All-Questioning": {
    abilities: [
      triggered(
        when.yourEndStep,
        [
          fx.createTokens(PRIMO, 1, undefined, "p"),
          fx.addCounters(ref.stored("p"), amount.count({ types: ["Land"], controller: "you" })),
        ],
        {
          condition: cond.all(
            cond.amountAtLeast(amount.landsEnteredThisTurn, 1),
            cond.prime(amount.count({ types: ["Land"], controller: "you" })),
          ),
          label: "Primo, avec autant de marqueurs que de terrains",
        },
      ),
    ],
  },

  // Artefacts
  "Found Footage": {
    abilities: [
      playerStatic({ seeFaceDown: true, label: "Vous voyez les créatures face cachée adverses" }),
      activated({ mana: "{2}", sacrifice: true, effects: [fx.surveil(2), fx.draw(1)], label: "Surveillance 2, piochez" }),
    ],
  },
  Saw: {
    abilities: [
      staticAbility("attached", { power: 2 }, { label: "+2/+0" }),
      triggered(
        when.attacks({ attachedToSource: true }),
        [
          fx.sacrifice(ref.you, { other: true, notAttachedToSource: true }, 1, { optional: true, store: "s" }),
          ...fx.when(cond.v("s"), fx.draw(1)),
        ],
        { label: "Sacrifiez un autre permanent : piochez" },
      ),
    ],
  },
};
