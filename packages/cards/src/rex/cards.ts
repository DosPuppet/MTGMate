/** Jurassic World Collection (REX) : scripts des cartes (PLAN-G). */
import type { Effect, Keyword, TokenSpec } from "@mtgx/engine";
import {
  activated,
  amount,
  type CardScript,
  chapter,
  cond,
  cost,
  entersWith,
  fx,
  manaAbility,
  playerStatic,
  ref,
  spell,
  staticAbility,
  TREASURE,
  target,
  triggered,
  when,
} from "../tdm/common";

/** Partenaire avec (702.124j) : à l'arrivée, le joueur ciblé peut chercher le partenaire dans sa bibliothèque. */
const partnerWith = (name: string) =>
  triggered(
    when.entersSelf,
    fx.mayFor(ref.target("p"), `Chercher ${name} ?`, fx.search({ name }, { to: "hand" }, 1, ref.target("p"))),
    { targets: [target.player("p")], label: `Partenaire avec ${name}` },
  );

/** Indominus Rex, Alpha : les capacités qui donnent un marqueur (702.xx, marqueurs de mot-clé). */
const INDOMINUS_KEYWORDS: Keyword[] = [
  "flying",
  "firstStrike",
  "doubleStrike",
  "deathtouch",
  "hexproof",
  "haste",
  "indestructible",
  "lifelink",
  "menace",
  "reach",
  "trample",
  "vigilance",
];

/** Welcome to . . . : un Dinosaure 3/3 vert avec le piétinement. */
const DINOSAUR_TRAMPLE: TokenSpec = {
  name: "Dinosaur",
  colors: ["G"],
  types: ["Creature"],
  subtypes: ["Dinosaur"],
  power: 3,
  toughness: 3,
  keywords: ["trample"],
};

export const CARDS: Record<string, CardScript> = {
  "Don't Move": {
    spell: spell(
      [],
      [
        fx.destroyAll({ types: ["Creature"], tapped: true }),
        fx.emblem(
          "Don't Move",
          "Jusqu'à votre prochain tour, chaque fois qu'une créature devient engagée, détruisez-la.",
          [
            triggered({ on: "taps", who: { types: ["Creature"] } }, [fx.destroy(ref.eventObject)], {
              label: "Une créature devient engagée : détruisez-la",
            }),
          ],
          true,
        ),
      ],
    ),
  },
  "Spitting Dilophosaurus": {
    abilities: [
      triggered(when.entersSelf, [fx.counters(ref.target(), "-1/-1")], {
        targets: [target.optional(target.creature())],
        label: "Un marqueur −1/−1 sur jusqu'à une créature",
      }),
      triggered(when.attacksSelf, [fx.counters(ref.target(), "-1/-1")], {
        targets: [target.optional(target.creature())],
        label: "Un marqueur −1/−1 sur jusqu'à une créature",
      }),
      staticAbility(
        { types: ["Creature"], controller: "opponent", withCounter: "-1/-1" },
        { addKeywords: ["cantBlock"] },
        {
          label: "Les créatures adverses avec un marqueur −1/−1 ne peuvent pas bloquer",
        },
      ),
    ],
  },
  "Life Finds a Way": {
    abilities: [
      triggered(
        when.enters({ types: ["Creature"], controller: "you", token: false, minPower: 4 }),
        [
          // Peuplement (701.30) : une copie d'un jeton de créature que vous contrôlez.
          fx.chooseAmong(ref.permanentsOf(ref.you, { types: ["Creature"], token: true }), ref.you, "p", {
            prompt: "Peuplez : un jeton de créature",
          }),
          fx.copyToken(ref.stored("p")),
        ],
        { label: "Une de vos créatures non-jetons de force 4 ou plus arrive : peuplez" },
      ),
    ],
  },
  "Savage Order": {
    additionalCost: { sacrifice: { filter: { types: ["Creature"], minPower: 4 }, count: 1 } },
    spell: spell(
      [],
      [
        fx.search({ types: ["Creature"], subtype: "Dinosaur" }, { to: "battlefield" }, 1, undefined, "d"),
        fx.modify(ref.stored("d"), { addKeywords: ["indestructible"] }, "untilYourNextTurn"),
      ],
    ),
  },
  "Compy Swarm": {
    abilities: [
      triggered(when.step("end"), [fx.copyToken(ref.self, { tapped: true })], {
        condition: cond.morbid,
        label: "Une créature est morte ce tour-ci : un jeton copie engagé",
      }),
    ],
  },
  "Ellie and Alan, Paleontologists": {
    abilities: [
      activated({
        tap: true,
        exileFromGraveyard: { filter: { types: ["Creature"] }, count: 1 },
        sorcerySpeed: true,
        effects: [fx.discover(amount.manaValueOf(ref.costExiled))],
        label: "Découverte X (la valeur de mana de la carte exilée)",
      }),
    ],
  },
  "Permission Denied": {
    spell: spell(
      [target.spell("t", { notTypes: ["Creature"] }, "sort non-créature")],
      [
        fx.counter(ref.target()),
        fx.thisTurn({ castLimit: { who: "opponents", maxSpells: 0, spellTypes: { notTypes: ["Creature"] } } }),
      ],
    ),
  },
  "Ravenous Tyrannosaurus": {
    // Dévorer 3 : lu dans le texte.
    abilities: [
      triggered(
        when.attacksSelf,
        [
          { op: "damage", amount: amount.powerOf(ref.self), to: ref.target(), storeExcess: "ex" },
          fx.damage(amount.v("ex"), ref.controllerOf(ref.target())),
        ],
        {
          targets: [target.optional(target.creature("t", { other: true }))],
          label: "Blessures égales à sa force à une autre créature ; l'excès à son contrôleur",
        },
      ),
    ],
  },
  // — G4e : sous-lot difficile —
  "Grim Giganotosaurus": {
    abilities: [
      // Monstruosité 10 (701.37) : « monstrueuse » est noté par un marqueur, qui déclenche la capacité suivante.
      activated({
        mana: "{10}{B}{G}",
        reduction: { generic: amount.count({ types: ["Creature"], controller: "opponent", minPower: 4 }) },
        activationCondition: cond.not(cond.amountAtLeast(amount.countersOn(ref.self, "monstrous"), 1)),
        effects: [fx.addCounters(ref.self, 10), fx.counters(ref.self, "monstrous")],
        label: "Monstruosité 10",
      }),
      triggered(
        { on: "countersPut", who: "self", kind: "monstrous" },
        [fx.destroyAll({ anyOf: [{ types: ["Artifact"] }, { types: ["Creature"] }], other: true })],
        {
          label: "Devient monstrueuse : détruisez tous les autres artefacts et créatures",
        },
      ),
    ],
  },
  // Menace : lue dans le texte.
  "Indoraptor, the Perfect Hybrid": {
    abilities: [
      // Soif de sang X (702.54) : X, les blessures infligées à vos adversaires ce tour-ci.
      entersWith({
        counters: amount.turnEvents({ event: "damage", who: "opponent", toPlayer: true, sum: true }),
        label: "Soif de sang X",
      }),
      triggered(
        when.isDealtDamage,
        [
          fx.chooseOpponent("o", { random: true }),
          {
            op: "unlessPay",
            who: ref.stored("o"),
            sacrifice: 1,
            sacrificeFilter: { types: ["Creature"], token: false },
            skip: 1,
          } as Effect,
          fx.damage(amount.powerOf(ref.self), ref.stored("o")),
        ],
        {
          label:
            "Rage : un adversaire au hasard subit des blessures égales à sa force, à moins de sacrifier une créature non-jeton",
        },
      ),
    ],
  },
  "Henry Wu, InGen Geneticist": {
    abilities: [
      staticAbility(
        { types: ["Creature"], subtype: "Human", controller: "you" },
        {
          addAbilities: [
            // Exploitation (702.110) : « vous pouvez sacrifier une créature » ; Henry Wu en tire une carte (et un Trésor).
            triggered(
              when.entersSelf,
              [
                fx.sacrifice(ref.you, { types: ["Creature"] }, 1, { optional: true, store: "x" }),
                ...fx.when(cond.refMatches(ref.stored("x"), { notSubtype: "Human" }), fx.draw(1)),
                ...fx.when(cond.refMatches(ref.stored("x"), { notSubtype: "Human", minPower: 3 }), fx.createTokens(TREASURE)),
              ],
              { label: "Exploitation" },
            ),
          ],
        },
        { label: "Henry Wu et vos autres Humains ont l'exploitation" },
      ),
    ],
  },
  "Swooping Pteranodon": {
    abilities: [
      triggered(
        when.enters({ types: ["Creature"], subtype: "Dinosaur", controller: "you", keyword: "flying" }),
        [
          fx.gainControl(ref.target()),
          fx.untap(ref.target()),
          fx.pump(ref.target(), 0, 0, ["flying", "haste"]),
          fx.delayed(
            [
              fx.reflexive([target.permanent("l", ["Land"], {}, "terrain")], [fx.damage(3, ref.target("c"), ref.target("l"))], {
                c: ref.target("c"),
              }),
            ],
            { c: ref.target() },
          ),
        ],
        {
          targets: [target.creature("t", { controller: "opponent" })],
          label:
            "Un Dinosaure volant arrive : prenez le contrôle d'une créature adverse ; à l'étape de fin, un terrain lui inflige 3 blessures",
        },
      ),
    ],
  },
  "Owen Grady, Raptor Trainer": {
    abilities: [
      partnerWith("Blue, Loyal Raptor"),
      activated({
        tap: true,
        sorcerySpeed: true,
        targets: [target.creature("t", { subtype: "Dinosaur" })],
        effects: fx.yourChoice(
          "Quel marqueur ?",
          "k",
          ["reach", "menace", "trample", "haste"].map((k) => ({ label: k, effects: [fx.counters(ref.target(), k)] })),
        ),
        label: "{T} : un marqueur portée, menace, piétinement ou célérité sur un Dinosaure (rituel)",
      }),
    ],
  },
  "Blue, Loyal Raptor": {
    abilities: [
      partnerWith("Owen Grady, Raptor Trainer"),
      entersWith({
        counters: 1,
        counterKind: "*",
        affects: { types: ["Creature"], subtype: "Dinosaur", controller: "you", other: true },
        label: "Vos autres Dinosaures arrivent avec un marqueur de chaque sorte présente sur Blue",
      }),
    ],
  },
  "Cresting Mosasaurus": {
    abilities: [
      triggered(
        when.entersSelf,
        [fx.bounce(ref.zone("battlefield", ref.eachPlayer, { types: ["Creature"], notSubtype: "Dinosaur" }))],
        {
          condition: cond.wasCast,
          label: "Arrivée, si vous l'avez lancée : renvoyez chaque créature non-Dinosaure",
        },
      ),
    ],
  },
  "Hunting Velociraptor": {
    abilities: [
      playerStatic({
        altCostAll: { mana: cost("{2}{R}"), filter: { subtype: "Dinosaur" } },
        condition: cond.amountAtLeast(
          amount.turnEvents({
            event: "damage",
            combat: true,
            toPlayer: true,
            source: { controller: "you", subtype: "Dinosaur" },
          }),
          1,
        ),
        label: "Vos sorts de Dinosaure ont la maraude {2}{R}",
      }),
    ],
  },
  "Dino DNA": {
    abilities: [
      activated({
        mana: "{1}",
        tap: true,
        sorcerySpeed: true,
        targets: [target.cardInGraveyard("t", { types: ["Creature"] }, "any", "carte de créature d'un cimetière")],
        effects: [fx.exileCard(ref.target(), { name: "e" }), fx.link(ref.stored("e"))],
        label: "Empreinte — {1}, {T} : exilez une carte de créature d'un cimetière (rituel)",
      }),
      activated({
        mana: "{6}",
        sorcerySpeed: true,
        targets: [
          {
            id: "t",
            label: "carte de créature exilée avec Dino DNA",
            filter: { exiled: { linked: true, filter: { types: ["Creature"] } } },
          },
        ],
        effects: [fx.copyToken(ref.target(), { pt: 6, setColors: ["G"], setSubtypes: ["Dinosaur"], addKeywords: ["trample"] })],
        label: "{6} : un jeton copie, sauf que c'est un Dinosaure vert 6/6 avec le piétinement (rituel)",
      }),
    ],
  },
  "Ian Malcolm, Chaotician": {
    abilities: [
      triggered(
        { on: "draw", whose: "any", nth: 2 },
        [
          fx.exileTop(ref.eventPlayer, 1, "i"),
          fx.link(ref.stored("i")),
          fx.grantPlay(ref.stored("i"), { forever: true, anyMana: true, for: "nonOwners", condition: cond.yourTurn }),
        ],
        { label: "Un joueur pioche sa deuxième carte du tour : il exile la carte du dessus de sa bibliothèque" },
      ),
    ],
  },
  "Indominus Rex, Alpha": {
    // « En arrivant, défaussez un nombre quelconque de cartes de créature. Il arrive avec un marqueur de vol si une carte
    // défaussée ainsi a le vol » (de même pour chaque capacité de la liste).
    asEnters: [
      fx.discard(99, ref.you, { filter: { types: ["Creature"] }, optional: true, store: "d" }),
      ...INDOMINUS_KEYWORDS.flatMap((k) =>
        fx.when(cond.amountAtLeast(amount.refCount(ref.filtered(ref.stored("d"), { keyword: k })), 1), fx.counters(ref.self, k)),
      ),
    ],
    abilities: [
      triggered(when.entersSelf, [fx.draw(amount.countersOn(ref.self, "any"))], {
        label: "Piochez une carte pour chaque marqueur sur Indominus Rex",
      }),
    ],
  },
  "Welcome to . . .": {
    abilities: [
      chapter(
        [1],
        [
          fx.modifyWhileYouControl(ref.target(), {
            addTypes: ["Creature"],
            addSubtypes: ["Wall"],
            setPower: 0,
            setToughness: 4,
            addKeywords: ["defender"],
          }),
        ],
        {
          // « Pour chaque adversaire, jusqu'à un artefact non-créature ciblé qu'il contrôle. »
          targets: [
            {
              ...target.upTo(
                1,
                target.permanent(
                  "t",
                  ["Artifact"],
                  { controller: "opponent", notTypes: ["Creature"] },
                  "artefact non-créature adverse (un par adversaire)",
                ),
              ),
              differentPlayers: true,
              countAmount: amount.refCount(ref.eachOpponent),
            },
          ],
          label:
            "I — Jusqu'à un artefact non-créature de chaque adversaire devient un Mur 0/4 avec le défenseur, tant que vous contrôlez la Saga",
        },
      ),
      chapter([2], [fx.createTokens(DINOSAUR_TRAMPLE, 1, undefined, "d"), fx.pump(ref.stored("d"), 0, 0, ["haste"])], {
        label: "II — Un Dinosaure 3/3 vert avec le piétinement, qui a la célérité ce tour-ci",
      }),
      chapter(
        [3],
        [
          fx.destroyAll({ subtype: "Wall" }),
          fx.exileCard(ref.self, { name: "flip" }),
          fx.toBattlefield(ref.stored("flip"), { transformed: true, underYourControl: true }),
        ],
        { label: "III — Détruisez tous les Murs ; la Saga revient transformée" },
      ),
    ],
  },
  "Jurassic Park": {
    abilities: [
      playerStatic({
        playFrom: { zone: "graveyard", filter: { subtype: "Dinosaur" }, what: "spells", exileOthers: 3 },
        label: "Les cartes de Dinosaure de votre cimetière ont l'évasion",
      }),
      manaAbility("G", 1, { per: { types: ["Creature"], subtype: "Dinosaur", controller: "you" } }),
    ],
  },
};
