/** Marvel's Spider-Man — Web-slinging, chaos et cartes uniques (lots B et C). */
import { parseManaCost } from "@mtgx/engine";
import {
  activated,
  amount,
  type CardScript,
  chapter,
  cond,
  entersWith,
  fx,
  manaAbility,
  playerStatic,
  ref,
  SPIDER_21,
  spell,
  staticAbility,
  target,
  triggered,
  when,
} from "./common";

export const UNIQUE: Record<string, CardScript> = {
  // --- Lot B1 : Web-slinging et chaos ---------------------------------------
  "Spiders-Man, Heroic Horde": {
    // Web-slinging {4}{G}{G} : lu dans le texte.
    abilities: [
      triggered(when.entersSelf, [fx.gainLife(3), fx.createTokens(SPIDER_21, 2)], {
        condition: cond.castVia("webSlinging"),
        label: "Lancés par Web-slinging : vous gagnez 3 PV et créez deux Araignées 2/1",
      }),
    ],
  },
  "Scarlet Spider, Ben Reilly": {
    // Web-slinging {R}{G} et piétinement : lus dans le texte.
    abilities: [
      entersWith({
        counters: amount.manaValueOf(ref.costBounced),
        condition: cond.castVia("webSlinging"),
        label: "Sauvetage sensationnel — Lancé par Web-slinging : X marqueurs +1/+1 (VM de la créature renvoyée)",
      }),
    ],
  },
  "Sandman's Quicksand": {
    // Chaos {3}{B} : lu dans le texte.
    spell: spell(
      [],
      [
        ...fx.when(cond.castVia("mayhem"), fx.pumpAll({ types: ["Creature"], controller: "opponent" }, -2, -2)),
        ...fx.when(cond.not(cond.castVia("mayhem")), fx.pumpAll({ types: ["Creature"] }, -2, -2)),
      ],
    ),
  },
  "Alien Symbiosis": {
    enchant: { filter: { types: ["Creature"] }, label: "créature" },
    castFromGraveyard: { discard: 1 },
    abilities: [
      staticAbility(
        "attached",
        { power: 1, toughness: 1, addKeywords: ["menace"], addSubtypes: ["Symbiote"] },
        { label: "+1/+1, la menace, et c'est un Symbiote" },
      ),
    ],
  },
  "Oscorp Industries": {
    // Chaos (sans coût pour un terrain) : lu dans le texte.
    abilities: [
      entersWith({ tapped: true }),
      manaAbility(["U", "B", "R"]),
      triggered({ on: "enters", who: "self", fromZone: "graveyard" }, [fx.loseLife(2, ref.you)], {
        label: "Arrivé depuis un cimetière : vous perdez 2 PV",
      }),
    ],
  },
  "Norman Osborn": {
    keywords: ["unblockable"],
    abilities: [
      triggered(when.combatDamageToPlayer, [fx.connive(ref.self)], { label: "Il complote" }),
      activated({ mana: "{1}{U}{B}{R}", sorcerySpeed: true, effects: [fx.transform(ref.self)], label: "Transformez-le" }),
    ],
  },
  "Green Goblin": {
    // Vol et menace : lus dans le texte.
    abilities: [
      {
        kind: "costReduction",
        filter: {},
        generic: 2,
        fromZones: ["graveyard"],
        label: "Sorts lancés depuis votre cimetière : {2} de moins",
      },
      playerStatic({
        playFrom: { zone: "graveyard", filter: { notTypes: ["Land"], discardedThisTurn: true }, what: "spells", mayhem: true },
        label: "Formule du Gobelin — Chaque carte non-terrain de votre cimetière a le chaos (son coût de mana)",
      }),
    ],
  },
  "Peter Parker": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(SPIDER_21)], { label: "Créez une Araignée 2/1 avec la portée" }),
      activated({ mana: "{1}{G}{W}{U}", sorcerySpeed: true, effects: [fx.transform(ref.self)], label: "Transformez-le" }),
    ],
  },
  "Amazing Spider-Man": {
    // Vigilance et portée : lues dans le texte.
    abilities: [
      playerStatic({
        altCostAll: {
          mana: parseManaCost("{G}{W}{U}"),
          filter: { legendary: true, colors: ["W", "U", "B", "R", "G"] },
          webSlinging: true,
        },
        label: "Vos sorts légendaires de couleur ont le Web-slinging {G}{W}{U}",
      }),
    ],
  },
  "Urban Retreat": {
    abilities: [
      entersWith({ tapped: true }),
      manaAbility(["G", "W", "U"]),
      activated({
        mana: "{2}",
        bounceOther: { types: ["Creature"], tapped: true },
        fromHand: true,
        sorcerySpeed: true,
        effects: [fx.toBattlefield(ref.selfCard)],
        label: "Renvoyez une créature engagée : mettez ce terrain de votre main sur le champ de bataille",
      }),
    ],
  },

  // --- Lot C1 : copies et légendes ---------------------------------------------
  "Chameleon, Master of Disguise": {
    // Chaos {2}{U} : lu dans le texte.
    entersAsCopyOf: { types: ["Creature"], controller: "you" },
    entersAsCopyKeepName: true,
  },
  "The Clone Saga": {
    abilities: [
      chapter([1], [fx.surveil(3)], { label: "I — Surveillance 3" }),
      chapter(
        [2],
        [
          {
            op: "playerEffect",
            ability: { nextSpell: { filter: { types: ["Creature"] }, copy: true, copyNonlegendary: true } },
            once: true,
          },
        ],
        { label: "II — Votre prochain sort de créature ce tour-ci est copié (copie non légendaire)" },
      ),
      chapter(
        [3],
        [
          fx.chooseForSelf("cardName"),
          fx.emblem(
            "The Clone Saga",
            "Whenever a creature with the chosen name deals combat damage to a player this turn, draw a card.",
            [
              triggered(when.combatDamage({ types: ["Creature"], nameChosen: true }, true), [fx.draw(1)], {
                label: "Une créature du nom choisi blesse un joueur : piochez une carte",
              }),
            ],
            false,
            true,
          ),
        ],
        { label: "III — Choisissez un nom : ses créatures qui blessent un joueur ce tour-ci vous font piocher" },
      ),
    ],
  },
  "Jackal, Genius Geneticist": {
    // Piétinement : lu dans le texte.
    abilities: [
      triggered(
        when.castSpell("you", { types: ["Creature"], manaValueSourcePower: true }),
        [fx.copySpell(ref.eventObject, 1, { nonlegendary: true }), fx.addCounters(ref.self, 1)],
        { label: "Sort de créature de VM égale à sa force : copiez-le (non légendaire), puis un marqueur +1/+1" },
      ),
    ],
  },
  "Spider-Verse": {
    abilities: [
      playerStatic({ noLegendRule: { subtype: "Spider" }, label: "La règle des légendes ne s'applique pas à vos Araignées" }),
      triggered(
        { on: "castSpell", by: "you", notFromHand: true },
        fx.may("Copier ce sort ?", fx.copySpell(ref.eventObject, 1, { haste: true }), fx.doneOncePerTurn),
        { oncePerTurn: "ifDone", label: "Sort lancé d'ailleurs que de votre main : vous pouvez le copier (une fois par tour)" },
      ),
    ],
  },
  "Behold the Sinister Six!": {
    spell: spell(
      [
        {
          ...target.upTo(6, target.cardInGraveyard("t", { types: ["Creature"] }, "you", "carte de créature de votre cimetière")),
          differentNames: true,
        },
      ],
      [fx.toBattlefield(ref.target())],
    ),
  },
};
