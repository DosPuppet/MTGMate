/**
 * Marvel Super Heroes — cartes multicolores (lot A). Le vol, le piétinement, la vigilance, la portée, la menace, le
 * contact mortel, le lien de vie, la double initiative, le flash et la célérité sont lus dans le texte ; « ne peut pas
 * être bloquée » et « attaque à chaque combat si possible » sont écrits ici (restrictions). L'extorsion (Extort) est
 * écrite ici comme une capacité déclenchée.
 */
import type { Effect, ModeDef, ObjectFilter, TokenSpec } from "@mtgx/engine";
import {
  activated,
  amount,
  block,
  type CardScript,
  chapter,
  cmp,
  cond,
  entersWith,
  equipAbility,
  eventReplacement,
  fx,
  INSECT_G,
  mode,
  playerStatic,
  powerFor,
  ref,
  SOLDIER,
  spell,
  staticAbility,
  TREASURE,
  target,
  triggered,
  triggeredModal,
  VILLAIN,
  when,
} from "./common";

const ARTIFACT: ObjectFilter = { types: ["Artifact"] };
const YOUR_CREATURES: ObjectFilter = { types: ["Creature"], controller: "you" };
/** Carte de créature-artefact (les deux types). */
const ARTIFACT_CREATURE: ObjectFilter = { types: ["Artifact"], anyOf: [{ types: ["Creature"] }] };
const NONLAND_CARD: ObjectFilter = { notTypes: ["Land"] };

/** Alien (Alien Invasion) : créature rouge 1/1 avec la célérité, qui attaque à chaque combat si possible. */
const ALIEN: TokenSpec = {
  name: "Alien",
  colors: ["R"],
  types: ["Creature"],
  subtypes: ["Alien"],
  power: 1,
  toughness: 1,
  keywords: ["haste", "mustAttack"],
  text: "Haste\nThis token attacks each combat if able.",
};

/** Galactus (The Coming of Galactus) : créature légendaire noire 16/16 Ancien Alien, vol, piétinement. */
const GALACTUS: TokenSpec = {
  name: "Galactus",
  colors: ["B"],
  types: ["Creature"],
  subtypes: ["Elder", "Alien"],
  power: 16,
  toughness: 16,
  legendary: true,
  keywords: ["flying", "trample"],
  abilities: [
    triggered(when.attacksSelf, [fx.destroy(ref.target())], {
      targets: [target.permanent("t", ["Land"], {}, "terrain")],
      label: "Détruit un terrain",
    }),
  ],
  text: "Flying, trample\nWhenever Galactus attacks, destroy target land.",
};

/** Sturdy Shield (U.S.Agent) : Équipement incolore, « la créature équipée gagne +1/+2 », équiper {2}. */
const STURDY_SHIELD: TokenSpec = {
  name: "Sturdy Shield",
  colors: [],
  types: ["Artifact"],
  subtypes: ["Equipment"],
  abilities: [
    staticAbility("attached", { power: 1, toughness: 2 }, { label: "+1/+2" }),
    equipAbility({ mana: "{2}", label: "Équiper {2}" }),
  ],
  text: "Equipped creature gets +1/+2.\nEquip {2}",
};

/** « Choisissez pair ou impair » à la résolution (Thanos) : le choix est gardé sur la source (`parityChosen`). */
const CHOOSE_PARITY: Effect = { op: "chooseOnEnter", kind: "parity" };

/** « Vous pouvez sacrifier un artefact ou défausser une carte non-terrain. » : `s` ou `d` vaut 1 si c'est fait. */
const SACRIFICE_ARTIFACT_OR_DISCARD = [
  fx.sacrifice(ref.you, ARTIFACT, 1, { optional: true, store: "s" }),
  ...fx.when(cond.not(cond.v("s")), fx.discard(1, ref.you, { filter: NONLAND_CARD, optional: true, store: "d" })),
];

export const MULTI: Record<string, CardScript> = {
  "Abomination, Terrifying Titan": {
    abilities: [
      activated({
        mana: "{5}{R/G}{R/G}",
        powerUp: true,
        targets: [target.upTo(1, target.creature("t", { controller: "opponent" }))],
        effects: [fx.addCounters(ref.self, 1), fx.fight(ref.self, ref.target())],
        label: "Montée en puissance : un marqueur +1/+1, se bat contre une créature adverse",
      }),
    ],
  },
  "Alien Invasion": {
    abilities: [
      triggered(
        when.yourCombat,
        [
          fx.createTokens(ALIEN, 1, undefined, "a"),
          fx.addCounters(ref.stored("a"), amount.countersOn(ref.self, "invasion")),
          fx.counters(ref.self, "invasion"),
        ],
        { label: "Un Alien 1/1, un marqueur +1/+1 par marqueur d'invasion, puis un marqueur d'invasion" },
      ),
    ],
  },
  "Ant-Man, Colony Commander": {
    abilities: [
      triggered(
        when.attacksSelf,
        fx.mayPay(
          "{1}",
          "Payer {1} pour mettre un marqueur +1/+1 sur une créature ?",
          fx.reflexive([target.creature()], [fx.addCounters(ref.target(), 1)]),
        ),
        { label: "Payez {1} : un marqueur +1/+1 sur une créature" },
      ),
      triggered(when.youPutCounters({ types: ["Creature"] }, "+1/+1"), [fx.createTokens(INSECT_G)], {
        oncePerTurn: true,
        label: "Un Insecte 1/1 (une fois par tour)",
      }),
    ],
  },
  "Armor Wars": {
    abilities: [
      chapter(
        [1],
        fx.when(
          cond.controls(ARTIFACT),
          fx.may(
            "Piocher une carte par artefact que vous contrôlez (chaque adversaire pioche une carte) ?",
            fx.draw(amount.count({ ...ARTIFACT, controller: "you" })),
            fx.draw(1, ref.eachOpponent),
          ),
        ),
        { label: "Chapitre I — Une carte par artefact ; chaque adversaire pioche" },
      ),
      chapter([2], [fx.thisTurn({ spellCost: { filter: ARTIFACT, reduce: 1 } })], {
        label: "Chapitre II — Vos sorts d'artefact coûtent {1} de moins ce tour-ci",
      }),
      chapter([3], [fx.damage(amount.maxManaValue({ ...ARTIFACT, controller: "you" }), ref.target())], {
        targets: [target.player("t", "opponent")],
        label: "Chapitre III — X blessures à un adversaire (plus grande valeur de mana de vos artefacts)",
      }),
    ],
  },
  "Avengers: Under Siege": {
    abilities: [
      chapter([1], [fx.createTokens(VILLAIN, 2)], { label: "Chapitre I — Deux Méchants 2/1 avec la menace" }),
      chapter([2], [fx.damageAll(2, { types: ["Creature"], notSubtype: "Villain" }, ref.eachOpponent)], {
        label: "Chapitre II — 2 blessures à chaque créature non-Méchant et à chaque adversaire",
      }),
      chapter([3], [fx.createTokens(TREASURE, amount.count({ subtype: "Villain", controller: "you" }))], {
        label: "Chapitre III — Un Trésor par Méchant que vous contrôlez",
      }),
    ],
  },
  "Beast, Erudite Aerialist": {
    abilities: [
      staticAbility(
        "self",
        { addKeywords: ["flying"] },
        {
          condition: cond.sourceMatches({ countersPutByYouThisTurn: "+1/+1" }),
          label: "Vole si vous avez mis des marqueurs +1/+1 sur lui ce tour-ci",
        },
      ),
      triggered(when.combatDamageToPlayer, [fx.draw(1)], { label: "Piochez une carte" }),
    ],
  },
  "Black Panther, Vanguard": {
    abilities: [
      triggeredModal(
        when.enters({ subtype: "Hero", token: false, controller: "you", other: true }),
        [
          mode("Un Soldat 1/1", [], [fx.createTokens(SOLDIER)]),
          mode("Vos créatures gagnent +1/+1", [], [fx.pumpAll(YOUR_CREATURES, 1, 1)]),
        ],
        { label: "Un autre Héros non-jeton arrive" },
      ),
    ],
  },
  "Black Widow, Double Agent": {
    abilities: [
      triggered(when.attacksAlone(YOUR_CREATURES), [fx.pump(ref.eventObject, 0, 0, ["firstStrike", "menace"])], {
        label: "Attaque seule : initiative et menace",
      }),
    ],
  },
  "Bullseye, Death Dealer": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          ...SACRIFICE_ARTIFACT_OR_DISCARD,
          ...fx.when(cond.any(cond.v("s"), cond.v("d")), fx.reflexive([target.any()], [fx.damage(2, ref.target())])),
        ],
        { label: "Sacrifiez un artefact ou défaussez une carte non-terrain : 2 blessures" },
      ),
      // Coût « sacrifiez un artefact ou défaussez une carte non-terrain » : une capacité par branche du coût.
      activated({
        mana: "{3}",
        tap: true,
        sacrificeOther: { filter: ARTIFACT },
        targets: [target.any()],
        effects: [fx.damage(2, ref.target())],
        label: "2 blessures (sacrifiez un artefact)",
      }),
      activated({
        mana: "{3}",
        tap: true,
        discard: 1,
        discardFilter: NONLAND_CARD,
        targets: [target.any()],
        effects: [fx.damage(2, ref.target())],
        label: "2 blessures (défaussez une carte non-terrain)",
      }),
    ],
  },
  "Cloak and Dagger, Entwined": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          // Une carte non-terrain de sa main, sinon la créature choisie, jusqu'à ce que Cloak and Dagger partent.
          fx.exileFromHandLinked(ref.target("p"), NONLAND_CARD, true),
          ...fx.when(
            cond.not(cond.amountAtLeast(amount.refCount(ref.exiledWith), 1)),
            fx.may("Exiler la créature choisie ?", fx.exileUntilLeaves(ref.target("c"))),
          ),
        ],
        {
          targets: [
            target.player("p", "opponent"),
            // « Que ce joueur contrôle » n'est vérifié qu'au ciblage ; le filtre « adversaire » est revérifié à la résolution.
            target.of(
              ref.target("p"),
              target.upTo(1, target.creature("c", { controller: "opponent" })),
              "créature que contrôle cet adversaire",
            ),
          ],
          label: "Exile une carte non-terrain de sa main ou la créature choisie",
        },
      ),
    ],
  },
  "The Coming of Galactus": {
    abilities: [
      chapter([1], [fx.destroy(ref.target())], {
        targets: [target.upTo(1, target.nonland())],
        label: "Chapitre I — Détruit jusqu'à un permanent non-terrain",
      }),
      chapter([2, 3], [fx.loseLife(2, ref.eachOpponent)], { label: "Chapitres II, III — Chaque adversaire perd 2 PV" }),
      chapter([4], [fx.createTokens(GALACTUS)], { label: "Chapitre IV — Galactus 16/16" }),
    ],
  },
  "Daredevil, Man Without Fear": {
    abilities: [
      playerStatic({ lookAt: "libraryTop", label: "Sens radar — Vous pouvez regarder le dessus de votre bibliothèque" }),
      triggered(
        when.attackWith(),
        fx.may(
          "Exiler la carte du dessus de votre bibliothèque ?",
          fx.exileTop(ref.you, 1, "d"),
          fx.when(cond.refMatches(ref.stored("d"), { subtype: "Hero" }), fx.pump(ref.self, 2, 1)),
          fx.grantPlay(ref.stored("d")),
        ),
        { label: "Exile le dessus : jouable ce tour-ci (+2/+1 si c'est un Héros)" },
      ),
    ],
  },
  "Ghost, Spectral Saboteur": { keywords: ["unblockable"] },
  "Iron Man, Master of Machines": {
    abilities: [
      staticAbility(
        "self",
        { power: 1 },
        { per: { ...ARTIFACT, controller: "you", other: true }, label: "+1/+0 par autre artefact que vous contrôlez" },
      ),
      triggered(when.attacksSelf, [fx.draw(1)], {
        condition: cond.amountAtLeast(
          amount.turnEvents({ event: "zone", to: "battlefield", types: ["Artifact"], who: "you" }),
          1,
        ),
        label: "Piochez si un artefact est arrivé sous votre contrôle ce tour-ci",
      }),
    ],
  },
  "Kang, Temporal Tyrant": {
    abilities: [
      triggered(when.attacksSelf, [fx.connive(ref.self)], { label: "Complote" }),
      triggered(when.draw(2), fx.drain(1), { label: "Deuxième carte piochée : drain 1" }),
    ],
  },
  "Killmonger, Scourge of Wakanda": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.sacrifice(ref.you, { types: ["Creature"], other: true }, 1, { optional: true, store: "s" }),
          ...fx.when(cond.v("s"), fx.reflexive([target.nonland("t", { controller: "opponent" })], [fx.destroy(ref.target())])),
        ],
        { label: "Sacrifiez une autre créature : détruit un permanent non-terrain adverse" },
      ),
      staticAbility(
        "self",
        { power: 2, toughness: 1 },
        {
          condition: cond.amountAtLeast(amount.countIn("graveyard", { types: ["Creature"] }), 2),
          label: "+2/+1 avec deux cartes de créature ou plus dans votre cimetière",
        },
      ),
    ],
  },
  "King T'Challa": {
    abilities: [
      triggered(when.draw(2, "any"), [fx.draw(1)], { label: "Un joueur pioche sa deuxième carte : piochez" }),
      activated({ mana: "{4}{W}{U}", sorcerySpeed: true, effects: [fx.transform(ref.self)], label: "Transformez-le" }),
    ],
  },
  "Black Panther, Hope Enduring": {
    abilities: [
      eventReplacement({
        event: "damage",
        toFilter: { self: true },
        modify: { prevent: true },
        label: "Prévenez toutes les blessures qui lui seraient infligées",
      }),
      triggered(when.combatDamageToPlayer, [fx.draw(1)], { label: "Piochez une carte" }),
    ],
  },
  "The Kingpin of Crime": {
    // Extorsion (702.101) : lue dans le texte.
    abilities: [
      // Les créatures arrivées après la résolution ne sont pas concernées (voir docs/approximations.md).
      triggered(
        when.attackWith(),
        fx.mayPayLife(
          2,
          "Payer 2 PV : vos créatures blessent selon leur endurance si elle est plus grande ?",
          fx.modifyAll(YOUR_CREATURES, { addPowerRules: [powerFor.combatToughness] }),
        ),
        { label: "Payez 2 PV : blessures de combat selon l'endurance" },
      ),
    ],
  },
  "Madame Hydra": {
    abilities: [
      triggered(when.castSpell("you", { subtype: "Villain" }), [fx.createTokens(VILLAIN)], {
        label: "Sort de Méchant : un Méchant 2/1 avec la menace",
      }),
    ],
  },
  "The Mighty Thor, Jane Foster": {
    abilities: [
      triggered(
        when.attacksSelf,
        [fx.exileCard(ref.target(), { name: "f" }), fx.toBattlefield(ref.stored("f"), { tapped: true })],
        {
          targets: [
            target.upTo(1, target.permanent("t", ["Artifact", "Creature"], { token: false }, "artefact ou créature non-jeton")),
          ],
          label: "Exile puis renvoie engagé un artefact ou une créature",
        },
      ),
      triggered(when.enters({ subtype: "Equipment", controller: "you" }), [fx.draw(1)], {
        label: "Un Équipement arrive : piochez",
      }),
    ],
  },
  "Moon Girl and Devil Dinosaur": {
    abilities: [
      triggered(when.draw(2), [fx.modify(ref.self, { setPower: 6, setToughness: 6, addKeywords: ["trample"] })], {
        label: "Deuxième carte piochée : 6/6 et piétinement",
      }),
      triggered(when.enters({ ...ARTIFACT, controller: "you" }), [fx.draw(1)], {
        oncePerTurn: true,
        label: "Un artefact arrive : piochez (une fois par tour)",
      }),
    ],
  },
  "Speedball, New Warrior": {
    abilities: [
      triggered(
        when.castSpell("any", undefined, { objects: { self: true } }),
        [fx.pump(ref.self, 2, 2), fx.changeTarget(ref.eventObject)],
        { label: "Ciblé par un sort : +2/+2, vous pouvez changer la cible" },
      ),
    ],
  },
  "Spider-Man, To the Rescue": {
    abilities: [
      triggered(
        when.entersSelf,
        fx.when(
          cond.sourceMatches({ tapped: false }),
          fx.may(
            "Engager Spider-Man pour rendre une autre créature indestructible ?",
            fx.tap(ref.self),
            fx.reflexive(
              [target.creature("t", { controller: "you", other: true, attacking: false })],
              [fx.modify(ref.target(), { addKeywords: ["indestructible"] })],
            ),
          ),
        ),
        { label: "Personne ne meurt ! — Engagez-le : une autre créature indestructible" },
      ),
    ],
  },
  "Spider-Woman, Secret Agent": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.tap(ref.target()),
          fx.modifyWhileYouControl(ref.target(), {
            addAbilities: [
              eventReplacement({
                event: "untap",
                toFilter: { self: true },
                modify: { prevent: true },
                label: "Ne peut pas être dégagée",
              }),
            ],
          }),
        ],
        {
          targets: [target.creature("t", { controller: "opponent" })],
          label: "Engage une créature adverse, qui ne peut plus être dégagée",
        },
      ),
    ],
  },
  "The Super Hero Civil War": {
    abilities: [
      chapter([1], fx.gainControlWhileSource(ref.target()), {
        targets: [{ ...target.upTo(2, target.creature()), maxTotalManaValue: 6 }],
        label: "Chapitre I — Contrôle de jusqu'à deux créatures de valeur de mana totale 6 ou moins",
      }),
      chapter([2], [fx.pumpAll(YOUR_CREATURES, 1, 1, ["vigilance"])], {
        label: "Chapitre II — Vos créatures gagnent +1/+1 et la vigilance",
      }),
      chapter([3], [fx.fight(ref.target("a"), ref.target("b"))], {
        targets: [
          target.creature("a", { controller: "you" }),
          { ...target.upTo(1, target.creature("b")), otherThan: ["a"], label: "autre créature" },
        ],
        label: "Chapitre III — Une de vos créatures se bat contre une autre créature",
      }),
    ],
  },
  "Thanos, the Mad Titan": {
    abilities: [
      activated({
        mana: "{C}{W}{U}{B}{R}{G}",
        powerUp: true,
        effects: [
          fx.addCounters(ref.self, 2),
          CHOOSE_PARITY,
          fx.destroyAll({ types: ["Creature"], other: true, parityChosen: true }),
        ],
        label: "Montée en puissance : deux marqueurs +1/+1, détruit les créatures de la parité choisie",
      }),
    ],
  },
  "U.S.Agent, John Walker": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(STURDY_SHIELD, 1, undefined, undefined, ref.self)], {
        label: "Sturdy Shield, attaché à lui",
      }),
    ],
  },
  "Vision Quest": {
    // Cimetière d'abord, sinon bibliothèque (une seule carte en tout) ; les X marqueurs sont posés à l'arrivée (614.1c).
    spell: spell(
      [],
      [
        fx.pickFromZone(
          "graveyard",
          ARTIFACT_CREATURE,
          { to: "battlefield", counters: { kind: "+1/+1", n: amount.x } },
          {
            min: 0,
            maxManaValue: amount.x,
            store: "v",
            prompt: "Vous pouvez choisir une carte de créature-artefact de votre cimetière (sinon, de votre bibliothèque)",
          },
        ),
        ...fx.when(
          cond.not(cond.v("v")),
          fx.search(
            { ...ARTIFACT_CREATURE, compare: [cmp.manaValue("<=", amount.x)] },
            { to: "battlefield", counters: { kind: "+1/+1", n: amount.x } },
            1,
            undefined,
            "v",
          ),
        ),
        ...fx.when(cond.xAtLeast(4), fx.modify(ref.stored("v"), { addKeywords: ["haste"] })),
      ],
    ),
  },
  "War Machine, Legacy of Iron": {
    abilities: [
      triggered(when.yourCombat, [fx.pump(ref.target(), amount.powerOf(ref.self), 0)], {
        targets: [target.creature("t", { controller: "you", other: true })],
        label: "Une autre créature gagne +X/+0 (X : sa force)",
      }),
    ],
  },
  "Winter Soldier, Icy Assassin": {
    abilities: [
      staticAbility(
        "self",
        { power: 2 },
        { per: { subtype: "Equipment", attached: "toSource" }, label: "+2/+0 par Équipement attaché" },
      ),
      activated({
        mana: "{3}{W}{B}",
        fromGraveyard: true,
        effects: [
          fx.moveTo(ref.self, { to: "battlefield", counters: { kind: "finality", n: 1 } }, { name: "w" }),
          ...fx.when(
            cond.controls({ subtype: "Equipment" }),
            fx.may(
              "Attacher un Équipement que vous contrôlez à Winter Soldier ?",
              fx.chooseAmong(ref.permanentsOf(ref.you, { subtype: "Equipment" }), ref.you, "e"),
              fx.attach(ref.stored("w"), ref.stored("e")),
            ),
          ),
        ],
        label: "Revient du cimetière avec un marqueur de finalité",
      }),
    ],
  },
  // Vigilance : lue dans le texte.
  "Captain America, Living Legend": {
    abilities: [
      triggered(
        { on: "taps", who: { types: ["Creature"], controller: "you" }, firstThisTurn: true },
        [fx.untap(ref.eventObject)],
        { condition: cond.yourTurn, label: "Une de vos créatures engagée pour la première fois de votre tour : dégagez-la" },
      ),
    ],
  },
  // Portée et piétinement : lus dans le texte.
  "Hulk, Gamma Goliath": {
    abilities: [
      playerStatic({
        abilityCost: { ability: "powerUp", notSelf: true, reduce: 3, source: { types: ["Creature"] } },
        label: "Les montées en puissance de vos autres créatures coûtent {3} de moins",
      }),
      activated({
        mana: "{6}{R}{G}",
        powerUp: true,
        effects: [fx.addCounters(ref.self, 5)],
        label: "Montée en puissance : cinq marqueurs +1/+1",
      }),
    ],
  },
  "Ares, God of War": {
    keywords: ["mustAttack"],
    abilities: [
      triggered(when.dies({ types: ["Creature"], controller: "you", attacking: true }), [fx.toHand(ref.eventObject)], {
        label: "Une de vos créatures attaquantes meurt : elle revient dans la main de son propriétaire",
      }),
    ],
  },
  "The Astonishing Ant-Man": {
    abilities: [
      triggered(when.draw(), [fx.addCounters(ref.self, 1)], { label: "Vous piochez : un marqueur +1/+1" }),
      activated({
        mana: "{2}{G}",
        tap: true,
        removeCountersX: "+1/+1",
        effects: [fx.createTokens(INSECT_G, amount.x)],
        label: "Retirez X marqueurs +1/+1 : X Insectes 1/1",
      }),
    ],
  },
  // Vigilance : lue dans le texte.
  "Absorbing Man": {
    abilities: [
      triggered(
        { on: "step", step: "main1", whose: "you" },
        [
          fx.becomeCopy(ref.self, ref.target(), "untilYourNextTurn", {
            except: {
              setName: "Absorbing Man",
              addTypes: ["Creature"],
              addSubtypes: ["Human", "Villain"],
              addSupertypes: ["Legendary"],
              setPower: 4,
              setToughness: 4,
              addKeywords: ["vigilance"],
            },
          }),
        ],
        {
          targets: [
            target.upTo(1, {
              id: "t",
              label: "artefact, enchantement non-Aura ou terrain",
              filter: {
                objects: {
                  anyOf: [{ types: ["Artifact"] }, { types: ["Enchantment"], notSubtype: "Aura" }, { types: ["Land"] }],
                },
              },
            }),
          ],
          label: "Jusqu'à votre prochain tour, il devient une copie d'un artefact, enchantement non-Aura ou terrain",
        },
      ),
    ],
  },
  "Taskmaster, Mercenary Mimic": {
    abilities: [
      triggered(
        { on: "step", step: "main1", whose: "you" },
        [
          fx.becomeCopy(ref.self, ref.target(), "untilYourNextTurn", {
            except: {
              setName: "Taskmaster, Mercenary Mimic",
              addTypes: ["Creature"],
              setSubtypes: ["Human", "Mercenary", "Villain"],
              addSupertypes: ["Legendary"],
            },
          }),
        ],
        {
          targets: [
            target.upTo(1, {
              id: "t",
              label: "créature, ou carte de créature d'un cimetière",
              filter: { objects: { types: ["Creature"], other: true }, cards: { filter: { types: ["Creature"] }, whose: "any" } },
            }),
          ],
          label: "Jusqu'à votre prochain tour, il devient une copie d'une créature ou d'une carte de créature",
        },
      ),
    ],
  },
  "Scientist Supreme of A.I.M.": {
    abilities: [
      activated({
        payLife: 2,
        oncePerTurn: true,
        activationCondition: cond.yourTurn,
        targets: [
          {
            id: "t",
            label: "capacité que vous contrôlez d'une source artefact",
            filter: { stackItems: { abilitiesOnly: true, controller: "you", source: { types: ["Artifact"] } } },
          },
        ],
        effects: [fx.copySpell(ref.target(), 1)],
        label: "Payez 2 PV : copiez une capacité d'artefact que vous contrôlez",
      }),
    ],
  },
  // Vol : lu dans le texte.
  "Storm, Windrider": {
    abilities: [
      staticAbility(
        { types: ["Creature"], keyword: "flying", controller: "opponent" },
        { addBlockRules: [{ cantAttackPlayer: "you", label: "Ne peut pas attaquer le contrôleur de Storm" }] },
        { label: "Les créatures avec le vol ne peuvent pas vous attaquer" },
      ),
      staticAbility(
        { types: ["Creature"], controller: "you" },
        { addBlockRules: [block.notBy({ keyword: "flying" }, "Ne peut pas être bloquée par des créatures avec le vol")] },
        { label: "Les créatures avec le vol ne peuvent pas bloquer vos créatures" },
      ),
      triggered(
        when.castSpell("you", {}, { objects: { types: ["Creature"] } }),
        [fx.modify(ref.filtered(ref.targetsOfEventObject, { types: ["Creature"] }), { addKeywords: ["flying"] }, "endOfTurn")],
        { label: "Un sort qui cible des créatures : elles gagnent le vol" },
      ),
    ],
  },
  "The Ruinous Wrecking Crew": {
    abilities: [
      entersWith({ counters: amount.x, label: "Arrive avec X marqueurs +1/+1" }),
      triggeredModal(
        when.entersSelf,
        // « Choisissez jusqu'à X » : chaque combinaison de modes, sous la condition X ≥ son nombre de modes.
        [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]
          .map((bits): ModeDef => {
            const has = (k: number) => (bits & (1 << k)) !== 0;
            const n = [0, 1, 2, 3].filter(has).length;
            const labels = ["défausse et pioche", "un adversaire perd 2 PV", "détruire un jeton", "chacun sacrifie une créature"];
            return {
              ...mode(
                [0, 1, 2, 3]
                  .filter(has)
                  .map((k) => labels[k])
                  .join(" + "),
                [
                  ...(has(1) ? [target.player("p", "opponent")] : []),
                  ...(has(2) ? [{ id: "k", label: "jeton", filter: { objects: { token: true } } }] : []),
                ],
                [
                  ...(has(0) ? [fx.discard(1), fx.draw(1)] : []),
                  ...(has(1) ? [fx.loseLife(2, ref.target("p"))] : []),
                  ...(has(2) ? [fx.destroy(ref.target("k"))] : []),
                  ...(has(3) ? [fx.sacrifice(ref.eachPlayer, { types: ["Creature"] })] : []),
                ],
              ),
              condition: cond.amountAtLeast(amount.sourceX, n),
            };
          })
          .concat([mode("Aucun", [], [])]),
        { label: "Jusqu'à X modes" },
      ),
    ],
  },
  // Contact mortel et garde (recevez cinq marqueurs poison) : lus dans le texte.
  "The Serpent Society": {
    abilities: [
      triggered(
        when.dies({ types: ["Creature"], controller: "you", other: true, keyword: "deathtouch" }),
        [fx.sacrifice(ref.eachOpponent, { types: ["Creature"], token: false })],
        { label: "Une autre de vos créatures avec le contact mortel meurt : chaque adversaire sacrifie une créature non-jeton" },
      ),
    ],
  },
  // « Défaussez une carte ou payez {2} » (coût additionnel) et la garde du même nom : la garde est lue dans le texte.
  "Titania, Rugged Rumbler": {
    additionalCost: { discard: 1, discardOr: { mana: { generic: 2, colored: {}, x: 0 } } },
  },
  "Worlds Within Worlds": {
    spell: spell(
      [],
      [
        fx.moveTo(ref.permanentsOf(ref.eachPlayer, { types: ["Creature"] }), { to: "exile" }, { name: "w" }),
        fx.pickFromZone(
          "hand",
          { types: ["Creature"] },
          { to: "battlefield" },
          {
            count: 99,
            min: 0,
            who: ref.eachPlayer,
            prompt: "Mettez des cartes de créature de votre main sur le champ de bataille",
          },
        ),
        fx.toHand(ref.stored("w")),
        fx.exileOnResolve,
      ],
    ),
  },
};
