/**
 * Duskmourn, lot D : les 18 dernières cartes (Aura de joueur, Valgavoth, ninjutsu de Kaito, Leylines, doublement des
 * blessures sous délire, cibles en nombre variable, Marvin…).
 */
import {
  activated,
  amount,
  type CardScript,
  CREATURE_YOU_CONTROL,
  cond,
  cost,
  entersWith,
  eventReplacement,
  fx,
  graveyardReplacement,
  loyalty,
  manaAbility,
  playerStatic,
  ref,
  SPIDER,
  spell,
  staticAbility,
  target,
  triggered,
  when,
} from "./common";

const ANY_COLOR = ["W", "U", "B", "R", "G"] as const;

export const LEGENDS2: Record<string, CardScript> = {
  "Grievous Wound": {
    enchant: { filter: {}, label: "joueur", player: true },
    abilities: [
      playerStatic({ enchantedPlayerCantGainLife: true, label: "Le joueur enchanté ne peut pas gagner de points de vie" }),
      triggered(when.attachedPlayerDamaged, [fx.loseLife(amount.halfLife(ref.attached), ref.attached)], {
        label: "Il perd la moitié de ses PV",
      }),
    ],
  },
  "Miasma Demon": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.discard(amount.cardsIn("hand"), ref.you, { optional: true, store: "d" }),
          ...fx.when(
            cond.v("d"),
            fx.reflexive([{ ...target.upTo(1, target.creature()), countAmount: amount.v("d") }], [fx.pump(ref.target(), -2, -2)]),
          ),
        ],
        { label: "Défaussez des cartes : autant de créatures -2/-2" },
      ),
    ],
  },
  "Valgavoth, Terror Eater": {
    abilities: [
      graveyardReplacement({
        graveyardOf: "opponent",
        notControlledByYou: true,
        filter: { token: false },
        link: "object",
        label: "Les cartes adverses sont exilées",
      }),
      playerStatic({
        playLinkedPayLife: true,
        label: "Les cartes adverses sont exilées ; jouables pendant votre tour contre des PV",
      }),
    ],
  },
  "Warped Space": {
    abilities: [
      playerStatic({ freeFromExileOncePerTurn: true, label: "Une fois par tour, {0} pour un sort lancé depuis l'exil" }),
    ],
  },
  "Norin, Swift Survivalist": {
    keywords: ["cantBlock"],
    abilities: [
      triggered(
        when.becomesBlocked(CREATURE_YOU_CONTROL),
        [
          ...fx.may(
            "Exiler cette créature (jouable ce tour-ci) ?",
            fx.exileCard(ref.eventObject, { name: "x" }),
            fx.grantPlay(ref.stored("x")),
          ),
        ],
        { label: "Exilez la créature bloquée, jouable ce tour-ci" },
      ),
    ],
  },
  "The Rollercrusher Ride": {
    abilities: [
      eventReplacement({
        event: "damage",
        source: { controller: "you" },
        combat: false,
        modify: { times: 2 },
        condition: cond.delirium,
        label: "Délire — blessures non de combat doublées",
      }),
      triggered(when.entersSelf, [fx.damage(amount.sourceX, ref.target())], {
        targets: [{ ...target.upTo(1, target.creature()), countAmount: amount.sourceX }],
        label: "X blessures à chacune de jusqu'à X créatures",
      }),
    ],
  },
  "Trial of Agony": {
    spell: spell(
      [{ ...target.exactly(2, target.creature("t", { controller: "opponent" })), samePlayer: true }],
      [
        fx.chooseAmong(ref.target(), ref.controllerOf(ref.target()), "c"),
        fx.damage(5, ref.stored("c")),
        fx.pump(ref.stored("cRest"), 0, 0, ["cantBlock"]),
      ],
    ),
  },
  "Turn Inside Out": {
    spell: spell(
      [target.creature()],
      [
        fx.pump(ref.target(), 3, 0),
        fx.whenThisTurn(when.dies({}), ref.target(), [fx.manifestDread], { label: "Manifestation effroyable" }),
      ],
    ),
  },
  "Leyline of Mutation": {
    leyline: true,
    abilities: [
      playerStatic({ altCostAll: { mana: cost("{W}{U}{B}{R}{G}") }, label: "Vos sorts : {W}{U}{B}{R}{G} au lieu de leur coût" }),
    ],
  },
  "Monstrous Emergence": {
    // Coût additionnel : contempler une créature (choisie par le joueur), dont la force est lue à la résolution.
    additionalCost: { behold: { filter: { types: ["Creature"] }, required: true } },
    spell: spell([target.creature()], [fx.damage(amount.powerOf(ref.cost("beheld")), ref.target())]),
  },
  "Twitching Doll": {
    abilities: [
      manaAbility([...ANY_COLOR], 1, { addCounter: "nest" }),
      activated({
        tap: true,
        sacrifice: true,
        sorcerySpeed: true,
        effects: [fx.createTokens(SPIDER, amount.lkiCounters("any"))],
        label: "Une Araignée 2/2 par marqueur",
      }),
    ],
  },
  "Kaito, Bane of Nightmares": {
    abilities: [
      activated({
        mana: "{1}{U}{B}",
        fromHand: true,
        returnUnblockedAttacker: true,
        effects: [fx.toBattlefield(ref.self, { tapped: true, attacking: true })],
        label: "Ninjutsu {1}{U}{B}",
      }),
      staticAbility(
        "self",
        { addTypes: ["Creature"], addSubtypes: ["Ninja"], setPower: 3, setToughness: 4, addKeywords: ["hexproof"] },
        { condition: cond.all(cond.yourTurn, cond.counterAtLeast("loyalty", 1)), label: "Pendant votre tour : Ninja 3/4" },
      ),
      loyalty(1, {
        effects: [
          fx.emblem("Kaito, Bane of Nightmares", "Ninjas you control get +1/+1.", [
            staticAbility({ types: ["Creature"], subtype: "Ninja", controller: "you" }, { power: 1, toughness: 1 }),
          ]),
        ],
        label: "Emblème : vos Ninjas +1/+1",
      }),
      loyalty(0, { effects: [fx.surveil(2), fx.draw(amount.opponentsLostLife)], label: "Surveillance 2, piochez" }),
      loyalty(-2, {
        targets: [target.creature()],
        effects: [fx.tap(ref.target()), fx.counters(ref.target(), "stun", 2)],
        label: "Engagez une créature, deux marqueurs d'étourdissement",
      }),
    ],
  },
  "Smoky Lounge": {
    abilities: [
      // {R}{R} ajouté au début de votre première phase principale (mana restreint de la réserve).
      triggered(when.step("main1", "you"), [fx.addManaChoice(2, ["R"], { spell: { subtype: "Room" }, ability: ["unlock"] })], {
        label: "Ajoutez {R}{R}, pour des sorts de Salle et déverrouiller des portes",
      }),
    ],
  },
  "Undead Sprinter": {
    castFromGraveyard: { condition: cond.creatureDiedMatching({ types: ["Creature"], notSubtype: "Zombie" }) },
    abilities: [entersWith({ counters: 1, condition: cond.castFromGraveyard, label: "Marqueur +1/+1 (lancée du cimetière)" })],
  },
  "Winter, Misanthropic Guide": {
    abilities: [
      triggered(when.yourUpkeep, [fx.draw(2, ref.eachPlayer)], { label: "Chaque joueur pioche deux cartes" }),
      playerStatic({
        maxHandSize: amount.plus(7, amount.neg(amount.cardTypesInGraveyard)),
        affects: "opponents",
        condition: cond.delirium,
        label: "Délire — main maximale adverse : 7 moins les types",
      }),
    ],
  },
  "Ghost Vacuum": {
    abilities: [
      activated({
        tap: true,
        targets: [target.cardInGraveyard("t", {}, "any")],
        effects: [fx.exileCard(ref.target(), { name: "x" }), fx.link(ref.stored("x"))],
        label: "Exilez une carte d'un cimetière",
      }),
      activated({
        mana: "{6}",
        tap: true,
        sacrifice: true,
        sorcerySpeed: true,
        effects: [
          fx.moveTo(
            ref.filtered(ref.linked, { types: ["Creature"] }),
            { to: "battlefield", underYourControl: true, counters: { kind: "flying", n: 1 }, addSubtypes: ["Spirit"] },
            { name: "s" },
          ),
          fx.modify(ref.stored("s"), { setPower: 1, setToughness: 1 }, "permanent"),
        ],
        label: "Les créatures exilées reviennent en Esprits 1/1 volants",
      }),
    ],
  },
  "Haunted Screen": {
    abilities: [
      manaAbility(["W", "B"]),
      manaAbility(["G", "U", "R"], 1, { payLife: 1 }),
      activated({
        mana: "{7}",
        once: true,
        effects: [
          fx.addCounters(ref.self, 7),
          fx.modify(ref.self, { addTypes: ["Creature"], addSubtypes: ["Spirit"], setPower: 0, setToughness: 0 }, "permanent"),
        ],
        label: "Sept marqueurs +1/+1 : devient un Esprit 0/0",
      }),
    ],
  },
  "Marvin, Murderous Mimic": {
    abilities: [
      staticAbility(
        "self",
        { gainActivatedFrom: { types: ["Creature"], controller: "you" } },
        {
          label: "A les capacités activées de vos autres créatures",
        },
      ),
    ],
  },
};
