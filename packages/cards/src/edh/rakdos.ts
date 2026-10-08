/**
 * Commander : deck Rakdos, Lord of Riots (« Rakdos, Lord of Big Free Stuff », Moxfield). Faire perdre des points de vie
 * aux adversaires (blessures à chaque joueur, drains, dévotion), puis lancer à bas prix les gros sorts : Eldrazi, Démons,
 * Blightsteel Colossus.
 */
import type { Amount, CardScript, Effect, ObjectFilter, Ref, TokenSpec } from "@mtgx/engine";
import {
  activated,
  amount,
  cond,
  costReducer,
  entersWith,
  fx,
  loyalty,
  manaAbility,
  modal,
  POWERSTONE,
  protection,
  protectionAbility,
  ref,
  spell,
  staticAbility,
  TREASURE,
  target,
  triggered,
  when,
} from "./common";

const CREATURE_YOU: ObjectFilter = { types: ["Creature"], controller: "you" };
/** Points de vie perdus par vos adversaires ce tour-ci (somme). */
const OPPONENTS_LOST: Amount = amount.turnEvents({ event: "lifeLoss", who: "opponent", sum: true });
/** Chaque créature et chaque joueur. */
const EACH_CREATURE_AND_PLAYER: Ref = ref.union(ref.eachPlayer, ref.permanentsOf(ref.eachPlayer, { types: ["Creature"] }));
/** « Quand vous lancez ce sort » (Eldrazi). */
const CAST_SELF = when.castSelf;
/** « Quand [cette carte] est mise dans un cimetière depuis n'importe où, son propriétaire mélange son cimetière dans sa
 * bibliothèque » (Kozilek, Butcher of Truth ; Ulamog, the Infinite Gyre). */
const shuffleGraveyardBack = () =>
  triggered(
    {
      on: "zoneChange",
      from: ["battlefield", "hand", "library", "stack", "exile"],
      to: ["graveyard"],
      filter: { self: true },
      whose: "any",
    },
    [fx.moveAll("graveyard", ref.ownerOf(ref.selfCard), {}, { to: "libraryTop" }), fx.shuffle(ref.ownerOf(ref.selfCard))],
    { fromGraveyard: true, label: "Mise au cimetière : son propriétaire mélange son cimetière dans sa bibliothèque" },
  );

/** Diable rouge 1/1 : « quand ce jeton meurt, il inflige 1 blessure à n'importe quelle cible » (Ob Nixilis). */
const DEVIL: TokenSpec = {
  name: "Devil",
  colors: ["R"],
  types: ["Creature"],
  subtypes: ["Devil"],
  power: 1,
  toughness: 1,
  abilities: [
    triggered(when.diesSelf, [fx.damage(1, ref.target())], {
      targets: [target.any()],
      label: "Il meurt : 1 blessure à n'importe quelle cible",
    }),
  ],
  text: "When this token dies, it deals 1 damage to any target.",
};

export const EDH_RAKDOS: Record<string, CardScript> = {
  // --- Commandant ---------------------------------------------------------------------------------------------------
  "Rakdos, Lord of Riots": {
    castCondition: cond.opponentLostLife,
    abilities: [
      costReducer({ types: ["Creature"] }, 0, "Vos sorts de créature coûtent {1} de moins par PV perdu par vos adversaires", {
        genericAmount: OPPONENTS_LOST,
      }),
    ],
  },

  // --- Mana ---------------------------------------------------------------------------------------------------------
  "Rakdos Signet": {
    abilities: [activated({ mana: "{1}", tap: true, effects: [fx.addMana("B", "R")], label: "{B}{R}" })],
  },
  "Priest of Gix": {
    abilities: [triggered(when.entersSelf, [fx.addMana("B", "B", "B")], { label: "Ajoutez {B}{B}{B}" })],
  },
  "Cryptolith Fragment": {
    abilities: [
      entersWith({ tapped: true }),
      activated({
        tap: true,
        effects: [fx.addManaChoice(1), fx.loseLife(1, ref.eachPlayer)],
        label: "Un mana de n'importe quelle couleur ; chaque joueur perd 1 PV",
      }),
      triggered(when.yourUpkeep, [fx.transform(ref.self)], {
        condition: cond.not(cond.amountAtLeast(amount.refCount(ref.playersWhere(ref.eachPlayer, cond.lifeAtLeast(11))), 1)),
        label: "Chaque joueur a 10 PV ou moins : transformez-le",
      }),
    ],
  },
  "Aurora of Emrakul": {
    abilities: [triggered(when.attacksSelf, [fx.loseLife(3, ref.eachOpponent)], { label: "Chaque adversaire perd 3 PV" })],
  },

  // --- Cartes modales (verso terrain) ----------------------------------------------------------------------------------
  "Agadeem's Awakening": {
    spell: spell(
      [
        {
          ...target.upTo(
            99,
            target.cardInGraveyard(
              "t",
              { types: ["Creature"] },
              "you",
              "cartes de créature de valeurs de mana différentes, X ou moins",
            ),
          ),
          distinct: "manaValue",
          maxManaValueAmount: amount.x,
        },
      ],
      [fx.toBattlefield(ref.target())],
    ),
  },
  // Versos : « vous pouvez payer 3 PV ; sinon, il arrive engagé » est lu dans le texte.
  "Agadeem, the Undercrypt": { abilities: [manaAbility("B")] },
  "Shatterskull Smashing": {
    spell: spell(
      [target.upTo(2, target.creatureOrPlaneswalker("t"))],
      [
        ...fx.when(cond.xAtLeast(6), fx.damageDivided(amount.plus(amount.x, amount.x), ref.target())),
        ...fx.when(cond.not(cond.xAtLeast(6)), fx.damageDivided(amount.x, ref.target())),
      ],
    ),
  },
  "Shatterskull, the Hammer Pass": { abilities: [manaAbility("R")] },
  "Valakut Awakening": {
    spell: spell(
      [],
      [
        fx.pickFromZone(
          "hand",
          {},
          { to: "libraryBottom" },
          { count: amount.cardsIn("hand"), min: 0, store: "va", prompt: "Cartes à mettre au-dessous de votre bibliothèque" },
        ),
        fx.draw(amount.plus(amount.v("va"), 1)),
      ],
    ),
  },
  "Valakut Stoneforge": { abilities: [entersWith({ tapped: true }), manaAbility("R")] },
  "Bloodsoaked Insight": {
    costReduction: { generic: OPPONENTS_LOST },
    spell: spell(
      [target.player("t", "opponent")],
      [fx.exileTop(ref.target(), 3, "bi"), fx.grantPlay(ref.stored("bi"), { untilYourNextTurn: true, anyMana: true })],
    ),
  },
  "Sanguine Morass": { abilities: [entersWith({ tapped: true }), manaAbility(["B", "R"])] },

  // --- Blessures et pertes de PV ----------------------------------------------------------------------------------------
  "Creeping Bloodsucker": {
    abilities: [
      triggered(when.yourUpkeep, [fx.damage(1, ref.eachOpponent), fx.gainLife(amount.refCount(ref.eachOpponent))], {
        label: "1 blessure à chaque adversaire ; vous gagnez autant de PV",
      }),
    ],
  },
  "Fanatic of Mogis": {
    abilities: [
      triggered(when.entersSelf, [fx.damage(amount.devotion("R"), ref.eachOpponent)], {
        label: "Blessures à chaque adversaire égales à votre dévotion au rouge",
      }),
    ],
  },
  "Gray Merchant of Asphodel": {
    abilities: [
      triggered(
        when.entersSelf,
        fx.forEachPlayer(ref.eachOpponent, (p) =>
          fx.when(
            cond.amountAtLeast(amount.refCount(p), 1),
            fx.loseLife(amount.devotion("B"), p),
            fx.gainLife(amount.devotion("B")),
          ),
        ),
        { label: "Chaque adversaire perd X PV (dévotion au noir), vous gagnez autant" },
      ),
    ],
  },
  "Plague Spitter": {
    abilities: [
      triggered(when.yourUpkeep, [fx.damage(1, EACH_CREATURE_AND_PLAYER)], {
        label: "1 blessure à chaque créature et à chaque joueur",
      }),
      triggered(when.diesSelf, [fx.damage(1, EACH_CREATURE_AND_PLAYER)], {
        label: "Il meurt : 1 blessure à chaque créature et à chaque joueur",
      }),
    ],
  },
  "Spear Spewer": {
    abilities: [activated({ tap: true, effects: [fx.damage(1, ref.eachPlayer)], label: "1 blessure à chaque joueur" })],
  },
  "Thermo-Alchemist": {
    abilities: [
      activated({ tap: true, effects: [fx.damage(1, ref.eachOpponent)], label: "1 blessure à chaque adversaire" }),
      triggered(when.castSpell("you", { types: ["Instant", "Sorcery"] }), [fx.untap(ref.self)], {
        label: "Éphémère ou rituel : dégagez-le",
      }),
    ],
  },
  "Shepherd of Rot": {
    abilities: [
      activated({
        tap: true,
        effects: [fx.loseLife(amount.count({ subtype: "Zombie" }), ref.eachPlayer)],
        label: "Chaque joueur perd 1 PV par Zombie sur le champ de bataille",
      }),
    ],
  },
  "Stormfist Crusader": {
    abilities: [
      triggered(when.yourUpkeep, [fx.draw(1, ref.eachPlayer), fx.loseLife(1, ref.eachPlayer)], {
        label: "Chaque joueur pioche une carte et perd 1 PV",
      }),
    ],
  },
  "Sanctum of Stone Fangs": {
    abilities: [
      triggered(
        { on: "step", step: "main", whose: "you", nth: 1 },
        [
          fx.loseLife(amount.count({ subtype: "Shrine", controller: "you" }), ref.eachOpponent),
          fx.gainLife(amount.count({ subtype: "Shrine", controller: "you" })),
        ],
        { label: "Chaque adversaire perd X PV, vous en gagnez X (X : vos Sanctuaires)" },
      ),
    ],
  },
  "Lim-Dûl's Hex": {
    abilities: [
      triggered(
        when.yourUpkeep,
        fx.forEachPlayer(ref.eachPlayer, (p) => fx.unlessPays(p, { mana: "{B}", orMana: "{3}" }, fx.damage(1, p))),
        { label: "1 blessure à chaque joueur qui ne paie pas {B} ou {3}" },
      ),
    ],
  },
  "Descent into Avernus": {
    abilities: [
      triggered(
        when.yourUpkeep,
        [
          fx.counters(ref.self, "descent", 2),
          fx.createTokens(TREASURE, amount.countersOn(ref.self, "descent"), ref.eachPlayer),
          fx.damage(amount.countersOn(ref.self, "descent"), ref.eachPlayer),
        ],
        { label: "Deux marqueurs de descente ; chaque joueur crée X Trésors et subit X blessures" },
      ),
    ],
  },
  "Keen Duelist": {
    abilities: [
      triggered(
        when.yourUpkeep,
        [
          fx.loseLife(amount.manaValueOf(ref.libraryTop(ref.target())), ref.you),
          fx.loseLife(amount.manaValueOf(ref.libraryTop(ref.you)), ref.target()),
          fx.toHand(ref.libraryTop(ref.you)),
          fx.toHand(ref.libraryTop(ref.target())),
        ],
        {
          targets: [target.player("t", "opponent")],
          label: "Vous et un adversaire révélez la carte du dessus : chacun perd la valeur de mana de l'autre, puis la prend",
        },
      ),
    ],
  },
  "Protection Racket": {
    abilities: [
      triggered(
        when.yourUpkeep,
        fx.forEachPlayer(ref.eachOpponent, (p, n) =>
          fx.when(
            cond.amountAtLeast(amount.refCount(p), 1),
            {
              op: "unlessPay",
              who: p,
              lifeAmount: amount.manaValueOf(ref.libraryTop(ref.you)),
              paidStore: `racket${n}`,
              skip: 1,
            } as Effect,
            fx.toHand(ref.libraryTop(ref.you)),
            fx.when(cond.v(`racket${n}`), fx.exileCard(ref.libraryTop(ref.you))),
          ),
        ),
        { label: "Pour chaque adversaire : votre carte du dessus, exilée s'il paie sa valeur de mana en PV, sinon en main" },
      ),
    ],
  },
  Pandemonium: {
    // Approximation : la cible est choisie par le contrôleur de Pandemonium (docs/approximations.md).
    abilities: [
      triggered(
        when.enters({ types: ["Creature"] }),
        fx.mayFor(
          ref.controllerOf(ref.eventObject),
          "Lui faire infliger des blessures égales à sa force ?",
          fx.damage(amount.powerOf(ref.eventObject), ref.target(), ref.eventObject),
        ),
        { targets: [target.any()], label: "Une créature arrive : elle peut infliger des blessures égales à sa force" },
      ),
    ],
  },
  "Screamer-Killer": {
    abilities: [
      triggered(when.castSpell("you", { types: ["Creature"], minManaValue: 5 }), [fx.damage(5, ref.target())], {
        targets: [target.any()],
        label: "Sort de créature de valeur de mana 5 ou plus : 5 blessures à n'importe quelle cible",
      }),
    ],
  },
  "Ancient Cellarspawn": {
    abilities: [
      costReducer(
        { anySubtype: ["Demon", "Horror", "Nightmare"] },
        1,
        "Vos sorts de Démon, d'Horreur et de Cauchemar coûtent {1} de moins",
      ),
      triggered(
        when.castSpell("you", { manaSpentBelowValue: true }),
        [fx.loseLife(amount.plus(amount.manaValueOf(ref.eventObject), amount.neg(amount.eventManaSpent)), ref.target())],
        {
          targets: [target.player("t", "opponent")],
          label: "Sort lancé pour moins que sa valeur de mana : un adversaire perd la différence",
        },
      ),
    ],
  },
  Exocrine: {
    abilities: [
      // Vorace : arrive avec X marqueurs +1/+1 ; si X vaut 5 ou plus, piochez une carte en arrivant.
      entersWith({ counters: amount.x, label: "Vorace" }),
      triggered(when.entersSelf, fx.when(cond.amountAtLeast(amount.sourceX, 5), fx.draw(1)), {
        label: "Vorace : si X vaut 5 ou plus, piochez une carte",
      }),
      triggered(
        when.entersSelf,
        [
          fx.damage(
            amount.sourceX,
            ref.union(ref.eachPlayer, ref.except(ref.permanentsOf(ref.eachPlayer, { types: ["Creature"] }), ref.self)),
          ),
        ],
        { label: "Barrage bioplasmique : X blessures à chaque joueur et à chaque autre créature" },
      ),
    ],
  },
  "Knollspine Dragon": {
    abilities: [
      triggered(
        when.entersSelf,
        fx.may(
          "Défausser votre main et piocher autant de cartes que de blessures infligées à cet adversaire ce tour-ci ?",
          fx.discard(99, ref.you),
          fx.draw({ kind: "turnEvents", query: { event: "damage", toPlayer: true, sum: true }, of: ref.target() }),
        ),
        { targets: [target.player("t", "opponent")], label: "Vous pouvez défausser votre main et piocher" },
      ),
    ],
  },
  "Florian, Voldaren Scion": {
    abilities: [
      triggered(
        when.secondMain,
        [
          fx.lookAtTop(OPPONENTS_LOST, { count: 1, exact: true, to: { to: "exile" }, rest: "bottom", store: "fl" }),
          fx.grantPlay(ref.stored("fl"), {}),
        ],
        { label: "Regardez X cartes (PV perdus par vos adversaires) : exilez-en une, jouable ce tour-ci" },
      ),
    ],
  },
  "Sandstone Oracle": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.chooseOpponent("o"),
          fx.draw(
            amount.plus(amount.maxOverPlayers(ref.stored("o"), amount.cardsIn("hand")), amount.neg(amount.cardsIn("hand"))),
          ),
        ],
        { label: "Choisissez un adversaire : piochez la différence s'il a plus de cartes en main que vous" },
      ),
    ],
  },

  // --- Créatures et artefacts -----------------------------------------------------------------------------------------
  "Imperial Recruiter": {
    abilities: [
      triggered(when.entersSelf, [fx.search({ types: ["Creature"], maxPower: 2 })], {
        label: "Cherchez une carte de créature de force 2 ou moins",
      }),
    ],
  },
  "Grim Servant": {
    abilities: [
      triggered(when.entersSelf, [{ ...fx.search({}), maxManaValue: amount.devotion("B") } as Effect, fx.loseLife(3)], {
        label: "Cherchez une carte de valeur de mana au plus égale à votre dévotion au noir ; vous perdez 3 PV",
      }),
    ],
  },
  "Razaketh, the Foulblooded": {
    abilities: [
      activated({
        payLife: 2,
        sacrificeOther: { filter: { types: ["Creature"], other: true } },
        effects: [fx.search({})],
        label: "Cherchez une carte",
      }),
    ],
  },
  "Tuktuk Rubblefort": {
    abilities: [staticAbility(CREATURE_YOU, { addKeywords: ["haste"] }, { label: "Vos créatures ont la célérité" })],
  },
  "Shivan Devastator": { abilities: [entersWith({ counters: amount.x })] },
  "Walking Ballista": {
    abilities: [
      entersWith({ counters: amount.x }),
      activated({ mana: "{4}", effects: [fx.addCounters(ref.self, 1)], label: "Un marqueur +1/+1" }),
      activated({
        removeCounters: { kind: "+1/+1", n: 1 },
        targets: [target.any()],
        effects: [fx.damage(1, ref.target())],
        label: "Retirez un marqueur : 1 blessure à n'importe quelle cible",
      }),
    ],
  },
  "Lightning Greaves": {
    // Équiper {0} : lu dans le texte.
    abilities: [staticAbility("attached", { addKeywords: ["haste", "shroud"] }, { label: "Célérité et défense totale" })],
  },
  "Phyrexian Reclamation": {
    abilities: [
      activated({
        mana: "{1}{B}",
        payLife: 2,
        targets: [target.cardInGraveyard("t", { types: ["Creature"] }, "you", "carte de créature de votre cimetière")],
        effects: [fx.toHand(ref.target())],
        label: "Renvoyez une carte de créature de votre cimetière dans votre main",
      }),
    ],
  },
  "Blightsteel Colossus": { shuffleIntoLibrary: true },
  "Cityscape Leveler": {
    // Exhumation {8} : lue dans le texte.
    abilities: [
      ...[CAST_SELF, when.attacksSelf].map((w) =>
        triggered(
          w,
          [
            fx.destroy(ref.target()),
            { ...fx.createTokens(POWERSTONE, 1, ref.controllerOf(ref.target())), tapped: true } as Effect,
          ],
          {
            targets: [target.upTo(1, target.nonland("t"))],
            label: "Détruisez jusqu'à un permanent non-terrain ; son contrôleur crée un Powerstone engagé",
          },
        ),
      ),
    ],
  },

  // --- Sorts ----------------------------------------------------------------------------------------------------------
  "Rakdos Charm": {
    spell: modal(
      {
        label: "Exilez le cimetière du joueur ciblé",
        targets: [target.player("p")],
        effects: [fx.exile(ref.zone("graveyard", ref.target("p")))],
      },
      {
        label: "Détruisez l'artefact ciblé",
        targets: [target.permanent("a", ["Artifact"], {}, "artefact")],
        effects: [fx.destroy(ref.target("a"))],
      },
      {
        label: "Chaque créature inflige 1 blessure à son contrôleur",
        targets: [],
        effects: fx.forEachPlayer(ref.eachPlayer, (p) => [
          {
            op: "eachDealsDamage",
            filter: {},
            from: ref.permanentsOf(p, { types: ["Creature"] }),
            to: p,
            amount: 1,
          } as Effect,
        ]),
      },
    ),
  },
  "Deflecting Swat": {
    altCost: { mana: "{0}", condition: cond.controls({ commander: true }), label: "Gratuit si vous contrôlez un commandant" },
    spell: spell([{ id: "t", label: "sort ou capacité", filter: { stackItems: {} } }], [fx.changeTarget(ref.target())]),
  },
  "Wheel of Misfortune": {
    spell: spell(
      [],
      [
        fx.chooseNumbers(ref.eachPlayer, "wheel"),
        fx.damage(amount.numberChosen("wheel"), ref.numberChoosers("wheel", "highest")),
        fx.discard(99, ref.numberChoosers("wheel", "notLowest")),
        fx.draw(7, ref.numberChoosers("wheel", "notLowest")),
      ],
    ),
  },
  "Ob Nixilis, the Adversary": {
    abilities: [
      // Victime X : sacrifiez une créature de force X en le lançant ; la copie (un jeton) n'est pas légendaire et a X loyauté
      // (la force de la créature au moment du sacrifice, modifications comprises : dernières informations connues).
      triggered(
        CAST_SELF,
        [
          fx.sacrifice(ref.you, { types: ["Creature"] }, 1, { optional: true, store: "casualty" }),
          ...fx.when(
            cond.v("casualty"),
            fx.copySpell(ref.eventObject, 1, { nonlegendary: true, loyalty: amount.powerOf(ref.stored("casualty")) }),
          ),
        ],
        { label: "Victime X : sacrifiez une créature de force X pour copier ce sort" },
      ),
      loyalty(1, {
        effects: [
          ...fx.forEachPlayer(ref.eachOpponent, (p) =>
            fx.when(
              cond.amountAtLeast(amount.refCount(p), 1),
              { op: "unlessPay", who: p, discard: true, skip: 1 } as Effect,
              fx.loseLife(2, p),
            ),
          ),
          ...fx.when(cond.controls({ anySubtype: ["Demon", "Devil"] }), fx.gainLife(2)),
        ],
        label: "Chaque adversaire perd 2 PV sauf s'il défausse une carte ; Démon ou Diable : vous gagnez 2 PV",
      }),
      loyalty(-2, { effects: [fx.createTokens(DEVIL)], label: "Diable rouge 1/1" }),
      loyalty(-7, {
        targets: [target.player("t")],
        effects: [fx.draw(7, ref.target()), fx.loseLife(7, ref.target())],
        label: "Le joueur ciblé pioche sept cartes et perd 7 PV",
      }),
    ],
  },

  // --- Eldrazi --------------------------------------------------------------------------------------------------------
  "It That Betrays": {
    // Annihilateur 2 : lu dans le texte.
    abilities: [
      triggered(when.sacrifice({ token: false }, false, true), [fx.toBattlefield(ref.eventObject, { underYourControl: true })], {
        label: "Un adversaire sacrifie un permanent non-jeton : il arrive sous votre contrôle",
      }),
    ],
  },
  "Kozilek, Butcher of Truth": {
    abilities: [triggered(CAST_SELF, [fx.draw(4)], { label: "Piochez quatre cartes" }), shuffleGraveyardBack()],
  },
  "Kozilek, the Broken Reality": {
    abilities: [
      triggered(
        CAST_SELF,
        fx.forEachPlayer(ref.target(), (p, n) => [
          fx.pickFromZone("hand", {}, { to: "battlefield", as: "manifest" }, { who: p, count: 2, store: `kozilek${n}` }),
          fx.draw(amount.v(`kozilek${n}`)),
        ]),
        {
          targets: [target.upTo(2, target.player("t"))],
          label: "Jusqu'à deux joueurs ciblés manifestent deux cartes de leur main ; vous piochez une carte par carte manifestée",
        },
      ),
      staticAbility(
        { ...CREATURE_YOU, other: true, colorCount: 0 },
        { power: 3, toughness: 2 },
        {
          label: "Vos autres créatures incolores gagnent +3/+2",
        },
      ),
    ],
  },
  "Ulamog, the Ceaseless Hunger": {
    abilities: [
      triggered(CAST_SELF, [fx.exile(ref.target())], {
        targets: [{ id: "t", label: "permanent", filter: { objects: { permanent: true } }, count: 2 }],
        label: "Exilez deux permanents ciblés",
      }),
      triggered(when.attacksSelf, [fx.exileTop(ref.defendingPlayer, 20, "ulamog")], {
        label: "Le joueur défenseur exile les vingt cartes du dessus de sa bibliothèque",
      }),
    ],
  },
  "Ulamog, the Defiler": {
    // Garde — sacrifiez deux permanents : lue dans le texte.
    abilities: [
      triggered(
        CAST_SELF,
        [
          fx.exileTop(
            ref.target(),
            amount.per(amount.plus(amount.maxOverPlayers(ref.target(), amount.cardsIn("library")), 1), 2),
            "defiler",
          ),
        ],
        { targets: [target.player("t", "opponent")], label: "L'adversaire ciblé exile la moitié de sa bibliothèque" },
      ),
      entersWith({
        counters: { kind: "aggregate", fn: "max", property: "manaValue", zone: "exile", whose: "all" } as Amount,
        label: "Arrive avec autant de marqueurs que la plus grande valeur de mana en exil",
      }),
      triggered(when.attacksSelf, [fx.sacrifice(ref.defendingPlayer, { permanent: true }, amount.countersOn(ref.self))], {
        label: "Annihilateur X (ses marqueurs +1/+1)",
      }),
    ],
  },
  "Ulamog, the Infinite Gyre": {
    // Annihilateur 4 : lu dans le texte.
    abilities: [
      triggered(CAST_SELF, [fx.destroy(ref.target())], {
        targets: [{ id: "t", label: "permanent", filter: { objects: { permanent: true } } }],
        label: "Détruisez le permanent ciblé",
      }),
      shuffleGraveyardBack(),
    ],
  },
  "Emrakul, the Promised End": {
    costReduction: { generic: amount.cardTypesInGraveyard },
    abilities: [
      triggered(CAST_SELF, [fx.controlNextTurn(ref.target(), false, true)], {
        targets: [target.player("t", "opponent")],
        label: "Vous contrôlez le prochain tour de l'adversaire ciblé ; puis il prend un tour supplémentaire",
      }),
    ],
  },
  "Emrakul, the World Anew": {
    // Folie — payez six {C} : lue dans le texte.
    abilities: [
      triggered(CAST_SELF, [fx.gainControl(ref.permanentsOf(ref.target(), { types: ["Creature"] }))], {
        targets: [target.player("t")],
        label: "Gagnez le contrôle de toutes les créatures du joueur ciblé",
      }),
      // Approximation : « contre les sorts » se lit contre les éphémères et les rituels (docs/approximations.md).
      protectionAbility(
        protection.from({ anyOf: [{ types: ["Instant"] }, { types: ["Sorcery"] }] }, "Protection contre les sorts"),
      ),
      protectionAbility(
        protection.from({ cast: true, enteredThisTurn: true }, "Protection contre les permanents lancés ce tour-ci"),
      ),
      triggered(when.leavesSelf, [fx.sacrificeIt(ref.permanentsOf(ref.you, { types: ["Creature"] }))], {
        label: "Elle quitte le champ de bataille : sacrifiez toutes vos créatures",
      }),
    ],
  },
};
