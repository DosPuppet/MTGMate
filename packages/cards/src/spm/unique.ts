/** Marvel's Spider-Man — Web-slinging, chaos et cartes uniques (lots B et C). */
import { parseManaCost } from "@mtgx/engine";
import {
  activated,
  amount,
  type CardScript,
  chapter,
  cmp,
  cond,
  entersWith,
  eventReplacement,
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
    asEnters: [
      fx.chooseCopy({ types: ["Creature"], controller: "you" }, { except: { setName: "Chameleon, Master of Disguise" } }),
    ],
  },
  "The Clone Saga": {
    abilities: [
      chapter([1], [fx.surveil(3)], { label: "I — Surveillance 3" }),
      chapter(
        [2],
        [
          {
            op: "playerEffect",
            ability: { nextSpell: { filter: { types: ["Creature"] }, copy: true, nonlegendary: true } },
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
        when.castSpell("you", { types: ["Creature"], compare: [cmp.manaValue("=", amount.sourcePower)] }),
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
          distinct: "name",
        },
      ],
      [fx.toBattlefield(ref.target())],
    ),
  },

  // --- Lot C2 : coûts, montants et joueurs --------------------------------------
  "The Soul Stone": {
    // Indestructible : lu dans le texte.
    abilities: [
      manaAbility("B"),
      activated({
        mana: "{6}{B}",
        tap: true,
        exileOther: { types: ["Creature"] },
        effects: [fx.harness],
        label: "Exilez une créature : exploiter la Gemme de l'Âme",
      }),
      triggered(when.yourUpkeep, [fx.toBattlefield(ref.target())], {
        condition: cond.harnessed,
        targets: [target.cardInGraveyard("t", { types: ["Creature"] }, "you", "carte de créature de votre cimetière")],
        label: "∞ — Une carte de créature de votre cimetière revient sur le champ de bataille",
      }),
    ],
  },
  "Iron Spider, Stark Upgrade": {
    // Vigilance : lue dans le texte.
    abilities: [
      activated({
        tap: true,
        effects: [
          fx.addCountersAll({
            controller: "you",
            anyOf: [{ types: ["Artifact"], anyOf: [{ types: ["Creature"] }, { subtype: "Vehicle" }] }],
          }),
        ],
        label: "Un marqueur +1/+1 sur chacun de vos artefacts-créatures et Véhicules",
      }),
      activated({
        mana: "{2}",
        removeCounterFrom: { filter: { types: ["Artifact"] }, kind: "+1/+1", n: 2 },
        effects: [fx.draw(1)],
        label: "Retirez deux marqueurs +1/+1 de vos artefacts : piochez une carte",
      }),
    ],
  },
  "Cheering Crowd": {
    abilities: [
      triggered(
        when.step("main1", "any"),
        fx.mayFor(ref.eventPlayer, "Mettre un marqueur +1/+1 sur Cheering Crowd ?", fx.addCounters(ref.self, 1), {
          op: "addMana",
          mana: ["C"],
          times: amount.countersOn(ref.self),
          who: ref.eventPlayer,
        }),
        { label: "Ce joueur peut y mettre un marqueur +1/+1 ; il ajoute alors {C} par marqueur" },
      ),
    ],
  },
  "Mister Negative": {
    // Vigilance et lien de vie : lus dans le texte.
    abilities: [
      triggered(
        when.entersSelf,
        fx.may(
          "Échanger vos points de vie avec l'adversaire ciblé ?",
          fx.exchangeLife(ref.you, ref.target(), "lost"),
          fx.draw(amount.v("lost")),
        ),
        {
          targets: [target.player("t", "opponent")],
          label: "Inversion de la Force noire — Échangez vos PV avec un adversaire ; piochez autant que vous en avez perdu",
        },
      ),
    ],
  },
  "Rhino, Barreling Brute": {
    // Vigilance, piétinement et célérité : lus dans le texte.
    abilities: [
      triggered(when.attacksSelf, [fx.draw(1)], {
        condition: cond.amountAtLeast(amount.turnEvents({ event: "cast", who: "you", minManaValue: 4 }), 1),
        label: "Si vous avez lancé un sort de VM 4 ou plus ce tour-ci : piochez une carte",
      }),
    ],
  },
  "Kraven's Last Hunt": {
    abilities: [
      chapter(
        [1],
        [
          fx.mill(5),
          fx.reflexive([target.creature()], [fx.damage(amount.maxPower({ types: ["Creature"] }, "graveyard"), ref.target())]),
        ],
        { label: "I — Meulez cinq cartes ; blessures égales à la plus grande force de votre cimetière à une créature" },
      ),
      chapter([2], [fx.pump(ref.target(), 2, 2)], {
        targets: [target.creature("t", { controller: "you" })],
        label: "II — +2/+2 jusqu'à la fin du tour",
      }),
      chapter([3], [fx.moveTo(ref.target(), { to: "hand" })], {
        targets: [target.cardInGraveyard("t", { types: ["Creature"] }, "you", "carte de créature de votre cimetière")],
        label: "III — Une carte de créature de votre cimetière en main",
      }),
    ],
  },
  "Kraven the Hunter": {
    // Piétinement : lu dans le texte.
    abilities: [
      triggered(when.dies({ types: ["Creature"], controller: "opponent" }), [fx.draw(1), fx.addCounters(ref.self, 1)], {
        condition: cond.eventObjectGreatestPower,
        label: "La plus grande créature d'un adversaire meurt : piochez une carte et un marqueur +1/+1",
      }),
    ],
  },

  // --- Lot C3 : cartes uniques --------------------------------------------------
  "Arachne, Psionic Weaver": {
    // Web-slinging {W} : lu dans le texte. Le type de carte est choisi comme un mode d'arrivée.
    asEnters: [
      fx.chooseForSelf("mode", {
        options: ["Artifact", "Battle", "Enchantment", "Instant", "Kindred", "Planeswalker", "Sorcery"],
      }),
    ],
    abilities: [
      {
        kind: "costReduction",
        filter: { typeChosen: true },
        generic: -1,
        everyone: true,
        label: "Les sorts du type choisi coûtent {1} de plus",
      },
    ],
  },
  "With Great Power . . .": {
    enchant: { filter: { types: ["Creature"], controller: "you" }, label: "créature que vous contrôlez" },
    abilities: [
      staticAbility(
        "attached",
        { power: 2, toughness: 2 },
        {
          per: { anyOf: [{ subtype: "Aura" }, { subtype: "Equipment" }], attached: "toHost" },
          label: "+2/+2 pour chaque Aura et Équipement attachés à elle",
        },
      ),
      eventReplacement({
        event: "damage",
        to: "you",
        modify: {},
        redirectToAttached: true,
        label: "Les blessures qui vous seraient infligées sont infligées à la créature enchantée à la place",
      }),
    ],
  },
  "Spider-Punk": {
    // Émeute : lue dans le texte.
    abilities: [
      staticAbility(
        { subtype: "Spider", controller: "you", other: true },
        { addKeywords: ["riot"] },
        {
          label: "Vos autres Araignées ont l'émeute",
        },
      ),
      playerStatic({
        uncounterable: { abilities: true, everyone: true },
        label: "Les sorts et les capacités ne peuvent pas être contrecarrés",
      }),
      playerStatic({ damageUnpreventable: true, label: "Les blessures ne peuvent pas être prévenues" }),
    ],
  },
  "Superior Foes of Spider-Man": {
    // Piétinement : lu dans le texte.
    abilities: [
      triggered(
        when.castSpell("you", { minManaValue: 4 }),
        fx.may(
          "Exiler la carte du dessus de votre bibliothèque ?",
          fx.exileTop(ref.you, 1, "e"),
          fx.grantPlay(ref.stored("e"), { forever: true, replacePrevious: true }),
        ),
        { label: "Sort de VM 4 ou plus : exilez la carte du dessus, jouable jusqu'à la prochaine exilée ainsi" },
      ),
    ],
  },
  "Black Cat, Cunning Thief": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.lookAtTop(9, {
            who: ref.target(),
            count: 2,
            exact: true,
            to: { to: "exile", faceDown: "you" },
            rest: "bottom",
            store: "bc",
          }),
          fx.grantPlay(ref.stored("bc"), { forever: true, anyMana: true }),
        ],
        {
          targets: [target.player("t", "opponent")],
          label: "Regardez les neuf cartes du dessus d'un adversaire : exilez-en deux, jouables (mana de n'importe quel type)",
        },
      ),
    ],
  },
  "Gwenom, Remorseless": {
    // Contact mortel et lien de vie : lus dans le texte.
    abilities: [
      triggered(when.attacksSelf, [fx.thisTurn({ playFrom: { zone: "libraryTop", payLifeManaValue: true } })], {
        label: "Jusqu'à la fin du tour, jouez les cartes du dessus de votre bibliothèque (sorts : des PV égaux à leur VM)",
      }),
    ],
  },
};
