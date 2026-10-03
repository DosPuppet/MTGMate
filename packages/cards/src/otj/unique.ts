/**
 * Outlaws of Thunder Junction, lot B : légendaires, rares et cartes uniques (taxes d'attaque, copies de sorts et de
 * capacités, créatures qui ont monté la Monture, pile ou face, cimetières adverses…).
 */
import type { CardScript, Effect, TokenSpec } from "@mtgx/engine";
import {
  activated,
  amount,
  BIRD_1,
  block,
  CREATURE_YOU_CONTROL,
  cond,
  ELK,
  eventReplacement,
  fx,
  loyalty,
  manaAbility,
  mercenary,
  mode,
  OUTLAW,
  OUTLAW_CREATURE,
  playerStatic,
  protection,
  protectionAbility,
  ref,
  spell,
  spree,
  staticAbility,
  TREASURE,
  target,
  targetObj,
  triggered,
  triggeredModal,
  when,
  whileSaddled,
} from "./common";

const ALL_COLORS = ["W", "U", "B", "R", "G"] as const;
const LEGENDARY_CREATURE_YOU = { types: ["Creature" as const], controller: "you" as const, legendary: true };
const PLAYERS = (id = "t") => target.upTo(4, target.player(id));

/** Beau : Bœuf bleu légendaire, F/E égales au nombre de terrains que vous contrôlez. */
const BEAU: TokenSpec = {
  name: "Beau",
  colors: ["U"],
  types: ["Creature"],
  subtypes: ["Ox"],
  legendary: true,
  power: 0,
  toughness: 0,
  cdaPT: amount.count({ types: ["Land"], controller: "you" }),
  text: "Beau's power and toughness are each equal to the number of lands you control.",
};

/** Météorite : artefact incolore, « quand il arrive, 2 blessures » et « {T} : un mana de n'importe quelle couleur ». */
const METEORITE: TokenSpec = {
  name: "Meteorite",
  colors: [],
  types: ["Artifact"],
  subtypes: [],
  abilities: [
    triggered(when.entersSelf, [fx.damage(2, ref.target())], { targets: [target.any("t")], label: "2 blessures" }),
    manaAbility([...ALL_COLORS]),
  ],
  text: "When this token enters, it deals 2 damage to any target. {T}: Add one mana of any color.",
};

const freeFlashback = (what: ReturnType<typeof ref.target>): Effect => ({ op: "grantFlashback", what, free: true });

export const UNIQUE: Record<string, CardScript> = {
  // --- Blanc -----------------------------------------------------------------
  "Another Round": {
    spell: spell([], [fx.flickerChosen({ types: ["Creature"] }, amount.plus(amount.x, 1))]),
  },
  "Archangel of Tithes": {
    abilities: [
      playerStatic({ attackTax: 1, condition: cond.sourceMatches({ tapped: false }), label: "Attaquer : {1} par créature" }),
      playerStatic({ blockTax: 1, condition: cond.sourceMatches({ attacking: true }), label: "Bloquer : {1} par créature" }),
    ],
  },
  "Aven Interrupter": {
    abilities: [
      triggered(when.entersSelf, [fx.plot(ref.target())], {
        targets: [target.spell("t")],
        label: "Exilez un sort, il devient comploté",
      }),
      {
        kind: "costReduction",
        filter: {},
        generic: -2,
        opponents: true,
        fromZones: ["graveyard", "exile"],
        label: "Sorts adverses depuis un cimetière ou l'exil : {2} de plus",
      },
    ],
  },
  "Fortune, Loyal Steed": {
    abilities: [
      triggered(when.entersSelf, [fx.scry(2)], { label: "Regard 2" }),
      // Approximation : toutes les créatures qui l'ont montée (et non une au plus).
      whileSaddled(
        [
          fx.delayedAt(
            "endOfCombat",
            [
              fx.exileCard(ref.target("f"), { name: "x" }),
              fx.exileCard(ref.target("c"), { name: "y" }),
              fx.toBattlefield(ref.stored("x")),
              fx.toBattlefield(ref.stored("y")),
            ],
            { f: ref.self, c: ref.crewedBy },
          ),
        ],
        { label: "Fin du combat : exilez-la avec qui l'a montée, puis renvoyez-les" },
      ),
    ],
  },
  "High Noon": {
    abilities: [
      playerStatic({ castLimit: { who: "each", maxSpells: 1 }, label: "Un seul sort par joueur et par tour" }),
      activated({
        mana: "{4}{R}",
        sacrifice: true,
        targets: [target.any("t")],
        effects: [fx.damage(5, ref.target())],
        label: "5 blessures",
      }),
    ],
  },
  "Prairie Dog": {
    abilities: [
      triggered(when.yourEndStep, [fx.addCounters(ref.self, 1)], {
        condition: cond.not(cond.handSpellThisTurn),
        label: "Marqueur +1/+1",
      }),
      activated({
        mana: "{4}{W}",
        effects: [
          fx.emblem(
            "Prairie Dog",
            "Until end of turn, if you would put one or more +1/+1 counters on a creature you control, put that many plus one instead.",
            [
              eventReplacement({
                event: "counters",
                to: "yourSide",
                toFilter: { types: ["Creature"] },
                counter: "+1/+1",
                modify: { add: 1 },
              }),
            ],
            false,
            true,
          ),
        ],
        label: "Un marqueur +1/+1 de plus ce tour-ci",
      }),
    ],
  },

  // --- Bleu ------------------------------------------------------------------
  "Archmage's Newt": {
    abilities: [
      triggered(
        when.combatDamage("self", true),
        [fx.when(cond.saddled, freeFlashback(ref.target())), fx.when(cond.not(cond.saddled), fx.grantFlashback(ref.target()))],
        {
          targets: [target.cardInGraveyard("t", { types: ["Instant", "Sorcery"] }, "you", "éphémère ou rituel")],
          label: "Flashback accordé ({0} si montée)",
        },
      ),
    ],
  },
  "Double Down": {
    abilities: [
      triggered(when.castSpell("you", OUTLAW), [fx.copySpell(ref.eventObject, 1)], { label: "Copiez le sort de hors-la-loi" }),
    ],
  },
  "Fblthp, Lost on the Range": {
    abilities: [
      playerStatic({ lookAtTopCard: true, label: "Vous regardez la carte du dessus" }),
      // Approximation : une capacité (qui passe par la pile) paie le coût de mana de la carte du dessus pour la comploter.
      activated({
        sorcerySpeed: true,
        effects: [
          fx.when(
            cond.refMatches(ref.libraryTop(ref.you), { nonland: true }),
            fx.payCostOf(ref.libraryTop(ref.you), "p", "Payer le coût de mana de la carte du dessus pour la comploter ?"),
            fx.when(cond.v("p"), fx.plot(ref.libraryTop(ref.you))),
          ),
        ],
        label: "Complotez la carte du dessus",
      }),
    ],
  },
  "The Key to the Vault": {
    abilities: [
      triggered(
        when.combatDamage({ types: ["Creature"], attachedToSource: true }, true),
        [
          fx.lookAtTop(amount.eventAmount, {
            filter: { nonland: true },
            count: 1,
            to: { to: "exile" },
            rest: "bottom",
            store: "k",
          }),
          fx.castNow(ref.stored("k"), { free: true }),
        ],
        { label: "Exilez une carte non-terrain, lancez-la gratuitement" },
      ),
    ],
  },
  "Step Between Worlds": { exileOnResolve: true, spell: spell([], [fx.mayShuffleHandGraveyardDraw(7)]) },
  "Visage Bandit": {
    entersAsCopyOf: { types: ["Creature"], controller: "you" },
    entersAsCopyAddSubtypes: ["Shapeshifter", "Rogue"],
  },
  "Jace Reawakened": {
    castCondition: cond.turnsTakenAtLeast(4),
    abilities: [
      loyalty(1, { effects: fx.loot(1), label: "Piochez, défaussez" }),
      loyalty(1, {
        effects: [
          fx.pickFromZone(
            "hand",
            { nonland: true, maxManaValue: 3 },
            { to: "exile" },
            { min: 0, store: "j", prompt: "Vous pouvez comploter une carte" },
          ),
          fx.plot(ref.stored("j")),
        ],
        label: "Complotez une carte de votre main",
      }),
      loyalty(-6, {
        effects: [
          fx.emblem(
            "Jace Reawakened",
            "Until end of turn, whenever you cast a spell, copy it.",
            [triggered(when.castSpell("you"), [fx.copySpell(ref.eventObject, 1)], { label: "Copiez le sort" })],
            false,
            true,
          ),
        ],
        label: "Emblème : copiez vos sorts ce tour-ci",
      }),
    ],
  },

  // --- Noir ------------------------------------------------------------------
  "Binding Negotiation": {
    spell: spell(
      [target.player("t", "opponent")],
      [
        fx.discard(1, ref.target(), { filter: { nonland: true }, chooser: "controller", optional: true, store: "d" }),
        fx.when(
          cond.not(cond.v("d")),
          fx.pickFromZone(
            "graveyard",
            {},
            { to: "graveyard" },
            {
              pool: ref.exiledCardsOf(ref.target()),
              min: 0,
              prompt: "Vous pouvez mettre une de ses cartes exilées dans son cimetière",
            },
          ),
        ),
      ],
    ),
  },
  "Caustic Bronco": {
    abilities: [
      triggered(
        when.attacksSelf,
        [
          fx.moveTo(ref.libraryTop(ref.you), { to: "hand" }, { name: "c" }),
          fx.when(cond.saddled, fx.loseLife(amount.manaValueOf(ref.stored("c")), ref.eachOpponent)),
          fx.when(cond.not(cond.saddled), fx.loseLife(amount.manaValueOf(ref.stored("c")))),
        ],
        { label: "Carte du dessus en main, perte de PV" },
      ),
    ],
  },
  "Kaervek, the Punisher": {
    abilities: [
      triggered(
        when.crime,
        [
          fx.exileCard(ref.target(), { name: "k" }),
          fx.castCopiesFree([ref.stored("k")], 99, { paid: true, storeCast: "kc" }),
          fx.when(cond.v("kc"), fx.loseLife(2)),
        ],
        {
          targets: [target.upTo(1, target.cardInGraveyard("t", { colors: ["B"] }, "you", "carte noire"))],
          label: "Copiez une carte noire de votre cimetière",
        },
      ),
    ],
  },
  "Tinybones Joins Up": {
    abilities: [
      triggered(when.entersSelf, [fx.discard(1, ref.target())], { targets: [PLAYERS()], label: "Chaque joueur ciblé défausse" }),
      triggered(when.enters(LEGENDARY_CREATURE_YOU), [fx.mill(1, ref.target()), fx.loseLife(1, ref.target())], {
        targets: [PLAYERS()],
        label: "Meulez une carte, perdez 1 PV",
      }),
    ],
  },
  "Tinybones, the Pickpocket": {
    abilities: [
      triggered(when.combatDamage("self", true), [fx.castNow(ref.target(), { anyMana: true })], {
        targets: [target.cardInGraveyard("t", { permanent: true, nonland: true }, "opponent", "carte de permanent non-terrain")],
        label: "Lancez une carte de son cimetière",
      }),
    ],
  },

  // --- Rouge -----------------------------------------------------------------
  "Calamity, Galloping Inferno": {
    abilities: [
      // Deux fois : une créature non légendaire qui l'a montée, au choix, et une copie engagée et attaquante.
      whileSaddled(
        ["a", "b"].flatMap((k) => [
          fx.chooseAmong(ref.filtered(ref.crewedBy, { types: ["Creature"], legendary: false }), ref.you, k, {
            prompt: "Choisissez une créature non légendaire qui l'a montée",
          }),
          fx.copyToken(ref.stored(k), { tapped: true, attacking: true, sacrificeAtEndStep: true }),
        ]),
        { label: "Deux copies attaquantes d'une créature qui l'a montée" },
      ),
    ],
  },
  "Great Train Heist": {
    spell: spree(
      {
        cost: "{2}{R}",
        label: "Dégagez vos créatures, combat supplémentaire",
        effects: [fx.untap(ref.permanentsOf(ref.you, { types: ["Creature"] })), fx.extraCombat],
      },
      { cost: "{2}", label: "+1/+0 et l'initiative", effects: [fx.pumpAll(CREATURE_YOU_CONTROL, 1, 0, ["firstStrike"])] },
      {
        cost: "{R}",
        label: "Blessures de combat : Trésors",
        targets: [target.player("p", "opponent")],
        effects: [
          fx.emblem(
            "Great Train Heist",
            "Whenever a creature you control deals combat damage to that player this turn, create a tapped Treasure token.",
            [
              triggered(when.combatDamageToOpponent(CREATURE_YOU_CONTROL), [fx.createTappedTokens(TREASURE)], {
                label: "Trésor engagé",
              }),
            ],
            false,
            true,
          ),
        ],
      },
    ),
  },
  "Magebane Lizard": {
    abilities: [
      triggered(
        when.castSpell("any", { notTypes: ["Creature"] }),
        [fx.damage(amount.noncreatureCastBy(ref.eventPlayer), ref.eventPlayer)],
        {
          label: "Blessures au lanceur",
        },
      ),
    ],
  },
  "Resilient Roadrunner": {
    abilities: [
      protectionAbility(protection.from({ subtype: "Coyote" }, "Protection contre les Coyotes")),
      activated({
        mana: "{3}",
        effects: [
          fx.modify(ref.self, {
            addBlockRules: [block.notBy({ notKeyword: "haste" }, "Ne peut être bloquée que par des créatures avec la célérité")],
          }),
        ],
        label: "Bloquée seulement par la célérité",
      }),
    ],
  },
  "Return the Favor": {
    spell: spree(
      {
        cost: "{1}",
        label: "Copiez un sort ou une capacité",
        targets: [{ id: "c", label: "sort ou capacité", filter: { stackItems: {} } }],
        effects: [fx.copySpell(ref.target("c"), 1)],
      },
      {
        cost: "{1}",
        label: "Changez la cible",
        targets: [target.stackItemSingleTarget("b")],
        effects: [fx.changeTarget(ref.target("b"))],
      },
    ),
  },
  "Terror of the Peaks": {
    abilities: [
      playerStatic({ targetLifeTax: 3, label: "Sorts adverses qui la ciblent : 3 PV de plus" }),
      triggered(
        when.enters({ types: ["Creature"], controller: "you", other: true }),
        [fx.damage(amount.powerOf(ref.eventObject), ref.target())],
        {
          targets: [target.any("t")],
          label: "Blessures égales à sa force",
        },
      ),
    ],
  },

  // --- Multicolores ----------------------------------------------------------
  "Annie Joins Up": {
    abilities: [
      triggered(when.entersSelf, [fx.damage(5, ref.target())], {
        targets: [target.creatureOrPlaneswalker("t", { controller: "opponent" })],
        label: "5 blessures",
      }),
      playerStatic({
        triggerMod: { effect: "again", sources: { types: ["Creature"], legendary: true } },
        label: "Déclencheurs de vos légendaires doublés",
      }),
    ],
  },
  "Assimilation Aegis": {
    abilities: [
      triggered(when.entersSelf, [fx.exileUntilLeaves(ref.target())], {
        targets: [target.upTo(1, target.creature("t"))],
        label: "Exilez une créature",
      }),
      staticAbility("attached", { copyLinkedExile: true }, { label: "Copie de la créature exilée" }),
    ],
  },
  "Bonny Pall, Clearcutter": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(BEAU)], { label: "Beau" }),
      triggered(
        when.attackWith(1),
        [
          fx.draw(1),
          fx.pickFromZone(
            "hand",
            { types: ["Land"] },
            { to: "battlefield" },
            { min: 0, store: "h", prompt: "Un terrain de votre main" },
          ),
          fx.when(
            cond.not(cond.v("h")),
            fx.pickFromZone(
              "graveyard",
              { types: ["Land"] },
              { to: "battlefield" },
              { min: 0, prompt: "Un terrain de votre cimetière" },
            ),
          ),
        ],
        { label: "Piochez, puis un terrain" },
      ),
    ],
  },
  "Breeches, the Blastmaker": {
    abilities: [
      triggered(
        when.castNthSpell(2),
        [
          fx.sacrifice(ref.you, { types: ["Artifact"] }, 1, { optional: true, store: "s" }),
          fx.when(cond.v("s"), fx.coinFlip("w")),
          fx.when(cond.all(cond.v("s"), cond.v("w")), fx.copySpell(ref.eventObject, 1)),
          fx.when(cond.all(cond.v("s"), cond.not(cond.v("w"))), fx.damage(amount.manaValueOf(ref.eventObject), ref.target())),
        ],
        { targets: [target.any("t")], label: "Sacrifiez un artefact : pile ou face" },
      ),
    ],
  },
  "Doc Aurlock, Grizzled Genius": {
    abilities: [
      {
        kind: "costReduction",
        filter: {},
        generic: 2,
        fromZones: ["graveyard", "exile"],
        label: "Sorts depuis un cimetière ou l'exil : {2} de moins",
      },
      playerStatic({ abilityCost: { ability: "plot", reduce: 2 }, label: "Comploter coûte {2} de moins" }),
    ],
  },
  "Eriette, the Beguiler": {
    abilities: [playerStatic({ auraStealsCheaper: true, label: "Vos Auras volent les permanents moins chers" })],
  },
  "Ertha Jo, Frontier Mentor": {
    abilities: [
      triggered(when.entersSelf, [mercenary()], { label: "Mercenaire 1/1" }),
      triggered(when.activateTargeting, [fx.copySpell(ref.eventObject, 1)], { label: "Copiez la capacité" }),
    ],
  },
  "Ghired, Mirror of the Wilds": {
    abilities: [
      staticAbility(
        { types: ["Creature"], controller: "you", nontoken: true },
        {
          addAbilities: [
            activated({
              tap: true,
              targets: [targetObj("t", { token: true, controller: "you", enteredThisTurn: true }, "jeton arrivé ce tour-ci")],
              effects: [fx.copyToken(ref.target())],
              label: "Copiez un jeton arrivé ce tour-ci",
            }),
          ],
        },
        { label: "« {T} : copiez un jeton » " },
      ),
    ],
  },
  "The Gitrog, Ravenous Ride": {
    abilities: [
      // Approximation : les créatures qui l'ont montée sont sacrifiées ensemble ; X est leur force totale.
      triggered(
        when.combatDamage("self", true),
        fx.may(
          "Sacrifier une créature qui l'a montée ?",
          fx.draw(amount.powerOf(ref.crewedBy)),
          fx.pickFromZone(
            "hand",
            { types: ["Land"] },
            { to: "battlefield", tapped: true },
            { count: amount.powerOf(ref.crewedBy), min: 0 },
          ),
          fx.sacrificeIt(ref.crewedBy),
        ),
        { condition: cond.amountAtLeast(amount.refCount(ref.crewedBy), 1), label: "Sacrifiez : piochez, terrains" },
      ),
    ],
  },
  "Kambal, Profiteering Mayor": {
    abilities: [
      triggered(
        when.enters({ token: true, controller: "opponent" }),
        [fx.copyToken(ref.permanentsOf(ref.eachOpponent, { token: true, enteredThisTurn: true }), { tapped: true })],
        { oncePerTurn: true, batched: true, label: "Copies engagées des jetons adverses" },
      ),
      triggered(when.enters({ token: true, controller: "you" }), fx.drain(1), { batched: true, label: "Drain 1" }),
    ],
  },
  "Kellan, the Kid": {
    abilities: [
      // Approximation : le sort de permanent est mis sur le champ de bataille (et non lancé).
      triggered(
        { on: "castSpell", by: "you", notFromHand: true },
        [
          fx.pickFromZone(
            "hand",
            { permanent: true, nonland: true },
            { to: "battlefield" },
            {
              min: 0,
              store: "k",
              maxManaValue: amount.manaValueOf(ref.eventObject),
              prompt: "Un permanent de votre main (VM inférieure ou égale)",
            },
          ),
          fx.when(cond.not(cond.v("k")), fx.pickFromZone("hand", { types: ["Land"] }, { to: "battlefield" }, { min: 0 })),
        ],
        { label: "Un permanent gratuit, sinon un terrain" },
      ),
    ],
  },
  "Laughing Jasper Flint": {
    abilities: [
      staticAbility(
        { types: ["Creature"], controller: "you", notOwned: true },
        { addSubtypes: ["Mercenary"] },
        {
          label: "Vos créatures volées sont des Mercenaires",
        },
      ),
      triggered(
        when.yourUpkeep,
        [
          fx.exileTop(ref.target(), amount.count({ ...OUTLAW_CREATURE, controller: "you" }), "j"),
          fx.grantPlay(ref.stored("j"), { anyMana: true }),
        ],
        { targets: [target.player("t", "opponent")], label: "Exilez ses cartes du dessus, lançables" },
      ),
    ],
  },
  "Lazav, Familiar Stranger": {
    abilities: [
      triggered(
        when.crime,
        [
          fx.addCounters(ref.self, 1),
          fx.pickFromZone(
            "graveyard",
            {},
            { to: "exile" },
            { pool: ref.allGraveyards, min: 0, store: "l", prompt: "Vous pouvez exiler une carte d'un cimetière" },
          ),
          fx.when(
            cond.refMatches(ref.stored("l"), { types: ["Creature"] }),
            fx.may(
              "Lazav devient-il une copie de cette carte jusqu'à la fin du tour ?",
              fx.becomeCopy(ref.self, ref.stored("l")),
            ),
          ),
        ],
        { oncePerTurn: true, label: "Marqueur, exilez une carte, copiez-la" },
      ),
    ],
  },
  "Lilah, Undefeated Slickshot": {
    abilities: [
      // « lancé depuis votre main » : lu sur le sort au moment du lancement (la condition `spellCastFromHand` porterait
      // sur la capacité qui se résout).
      triggered(
        { on: "castSpell", by: "you", filter: { types: ["Instant", "Sorcery"], multicolored: true }, fromHand: true },
        [fx.plotOnResolve(ref.eventObject)],
        { label: "Le sort sera comploté" },
      ),
    ],
  },
  "Make Your Own Luck": {
    spell: spell(
      [],
      [
        fx.lookAtTop(3, { filter: { nonland: true }, count: 1, to: { to: "exile" }, rest: "hand", store: "m" }),
        fx.plot(ref.stored("m")),
      ],
    ),
  },
  "Obeka, Splitter of Seconds": {
    abilities: [
      triggered(when.combatDamage("self", true), [fx.extraUpkeeps(amount.eventAmount)], {
        label: "Étapes d'entretien supplémentaires",
      }),
    ],
  },
  "Oko, the Ringleader": {
    abilities: [
      triggered(when.step("beginCombat"), [fx.becomeCopy(ref.self, ref.target(), "endOfTurn", { addKeywords: ["hexproof"] })], {
        targets: [target.upTo(1, target.creature("t", { controller: "you" }))],
        label: "Devient une copie d'une de vos créatures",
      }),
      loyalty(1, {
        effects: [fx.draw(2), fx.when(cond.crime, fx.discard(1)), fx.when(cond.not(cond.crime), fx.discard(2))],
        label: "Piochez deux, défaussez",
      }),
      loyalty(-1, { effects: [fx.createTokens(ELK)], label: "Élan 3/3" }),
      loyalty(-5, {
        effects: [fx.copyToken(ref.permanentsOf(ref.you, { nonland: true, other: true }))],
        label: "Copiez vos autres permanents non-terrain",
      }),
    ],
  },
  "Rakdos, the Muscle": {
    abilities: [
      triggered(
        when.sacrifice({ types: ["Creature"], other: true }),
        [
          fx.exileTop(ref.target(), amount.manaValueOf(ref.eventObject), "r"),
          fx.grantPlay(ref.stored("r"), { untilYourNextEndStep: true, anyMana: true }),
        ],
        { targets: [target.player("t")], label: "Exilez des cartes de sa bibliothèque, jouables" },
      ),
      activated({
        sacrificeOther: { filter: { types: ["Creature"], other: true } },
        oncePerTurn: true,
        effects: [fx.pump(ref.self, 0, 0, ["indestructible"]), fx.tap(ref.self)],
        label: "Indestructible, engagez-le",
      }),
    ],
  },
  "Riku of Many Paths": {
    abilities: [
      // Approximation : un seul mode, quel que soit le nombre de modes choisis pour le sort.
      triggeredModal({ on: "castSpell", by: "you", modal: true }, [
        mode(
          "Exilez la carte du dessus, jouable",
          [],
          [fx.exileTop(ref.you, 1, "k"), fx.grantPlay(ref.stored("k"), { untilYourNextTurn: true })],
        ),
        mode("Marqueur +1/+1 et piétinement", [], [fx.addCounters(ref.self, 1), fx.pump(ref.self, 0, 0, ["trample"])]),
        mode("Oiseau 1/1 volant", [], [fx.createTokens(BIRD_1)]),
      ]),
    ],
  },
  "Roxanne, Starfall Savant": {
    abilities: [
      triggered(when.entersSelf, [fx.createTappedTokens(METEORITE)], { label: "Météorite" }),
      triggered(when.attacksSelf, [fx.createTappedTokens(METEORITE)], { label: "Météorite" }),
      eventReplacement({
        event: "mana",
        to: "you",
        source: { types: ["Artifact"], token: true },
        modify: { add: 1 },
        label: "Jetons d'artefact : un mana de plus",
      }),
    ],
  },
  "Satoru, the Infiltrator": {
    abilities: [
      triggered(
        when.enters({ types: ["Creature"], controller: "you", nontoken: true }),
        [fx.when(cond.eventObjectMatches({ noManaSpent: true }), fx.draw(1))],
        { batched: true, label: "Piochez" },
      ),
    ],
  },
  "Taii Wakeen, Perfect Shot": {
    abilities: [
      triggered(
        { on: "dealsDamage", who: {}, anySourceYouControl: true, noncombatOnly: true, exactToughness: true },
        [fx.draw(1)],
        {
          label: "Piochez",
        },
      ),
      activated({ mana: "{X}", tap: true, effects: [fx.noncombatBonusThisTurn(amount.x)], label: "Blessures non de combat +X" }),
    ],
  },
  "Vraska, the Silencer": {
    abilities: [
      triggered(
        when.dies({ types: ["Creature"], controller: "opponent", nontoken: true }),
        fx.mayPay(
          "{1}",
          "Payer {1} pour la ramener en Trésor ?",
          fx.moveTo(ref.eventObject, { to: "battlefield", underYourControl: true, tapped: true }, { name: "v" }),
          fx.modify(
            ref.stored("v"),
            {
              setTypes: ["Artifact"],
              setSubtypes: ["Treasure"],
              addAbilities: [manaAbility([...ALL_COLORS], 1, { sacrifice: true })],
            },
            "permanent",
          ),
        ),
        { label: "Ramenez-la en Trésor" },
      ),
    ],
  },

  // --- Incolores -------------------------------------------------------------
  "Luxurious Locomotive": {
    abilities: [
      triggered(when.attacksSelf, [fx.createTokens(TREASURE, amount.refCount(ref.crewedBy))], {
        label: "Un Trésor par créature qui l'a équipé",
      }),
    ],
  },
};
