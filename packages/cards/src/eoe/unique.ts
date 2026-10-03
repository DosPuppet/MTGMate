/**
 * Edge of Eternities, lot D : les dernières cartes (dévorer, contrôle du tour d'un adversaire, exils liés,
 * jetons copiés, doublement filtré, cibles de valeur de mana totale).
 */
import type { CardScript, ObjectFilter } from "@mtgx/engine";
import {
  activated,
  amount,
  CREATURE_YOU_CONTROL,
  cond,
  entersWith,
  eventReplacement,
  fx,
  loyalty,
  modal,
  mode,
  ROBOT,
  ref,
  spell,
  staticAbility,
  target,
  triggered,
  when,
} from "./common";

const CREATURES: ObjectFilter = { types: ["Creature"] };
const ALL_CREATURES = ref.permanentsOf(ref.eachPlayer, CREATURES);

/** Mutinous Massacre : détruit les créatures de la parité choisie, puis prend le contrôle de toutes les créatures. */
const massacre = (parity: "odd" | "even", label: string) =>
  mode(
    label,
    [],
    [
      fx.destroyAll({ ...CREATURES, manaValueParity: parity }),
      fx.gainControl(ALL_CREATURES),
      fx.untap(ALL_CREATURES),
      fx.pumpAll(CREATURES, 0, 0, ["haste"]),
    ],
  );

export const UNIQUE: Record<string, CardScript> = {
  // --- Blanc -----------------------------------------------------------------
  "Pinnacle Starcage": {
    abilities: [
      triggered(
        when.entersSelf,
        [fx.exileUntilLeaves(ref.permanentsOf(ref.eachPlayer, { types: ["Artifact", "Creature"], maxManaValue: 2 }))],
        { label: "Exilez les artefacts et créatures de VM 2 ou moins" },
      ),
      activated({
        mana: "{6}{W}{W}",
        effects: [
          fx.moveTo(ref.exiledWith, { to: "graveyard" }, { name: "g" }),
          fx.createTokens(ROBOT, amount.v("g")),
          fx.sacrificeIt(ref.self),
        ],
        label: "Les cartes exilées au cimetière, un Robot par carte",
      }),
    ],
  },
  "Scout for Survivors": {
    spell: spell(
      [
        {
          ...target.upTo(3, target.cardInGraveyard("t", CREATURES, "you", "carte de créature")),
          maxTotalManaValue: 3,
        },
      ],
      [fx.toBattlefield(ref.target(), { counters: { kind: "+1/+1", n: 1 } })],
    ),
  },

  // --- Bleu ------------------------------------------------------------------
  "Moonlit Meditation": {
    enchant: {
      filter: { types: ["Artifact", "Creature"], controller: "you" },
      label: "artefact ou créature que vous contrôlez",
    },
    abilities: [
      eventReplacement({
        event: "tokens",
        to: "you",
        instead: { copyOfAttached: true, firstEachTurn: true, may: true },
        modify: {},
        label: "Premiers jetons du tour : copies",
      }),
    ],
  },

  // --- Noir ------------------------------------------------------------------
  "Chorale of the Void": {
    enchant: { filter: { types: ["Creature"], controller: "you" }, label: "créature que vous contrôlez" },
    abilities: [
      triggered(
        when.attacks({ types: ["Creature"], attachedToSource: true }),
        [fx.toBattlefield(ref.target(), { underYourControl: true, tapped: true, attacking: true })],
        {
          targets: [target.cardInGraveyard("t", CREATURES, "opponent", "carte de créature")],
          label: "Une créature du cimetière adverse, attaquante",
        },
      ),
      triggered(when.yourEndStep, [fx.sacrificeIt(ref.self)], {
        condition: cond.not(cond.void),
        label: "Sans vide : sacrifiez-la",
      }),
    ],
  },
  "Sothera, the Supervoid": {
    abilities: [
      triggered(
        when.dies(CREATURE_YOU_CONTROL),
        [fx.sacrifice(ref.eachOpponent, CREATURES, 1, { exile: true, store: "x" }), fx.link(ref.stored("x"))],
        { label: "Chaque adversaire exile une de ses créatures" },
      ),
      triggered(
        when.yourEndStep,
        [
          fx.sacrificeIt(ref.self),
          fx.pickFromZone(
            "graveyard",
            CREATURES,
            { to: "battlefield", underYourControl: true, counters: { kind: "+1/+1", n: 2 } },
            { pool: ref.linked, prompt: "Choisissez une carte de créature exilée avec Sothera" },
          ),
        ],
        { condition: cond.playerWithoutCreatures, label: "Un joueur sans créature : sacrifiez-la, reprenez une créature" },
      ),
    ],
  },
  "Xu-Ifit, Osteoharmonist": {
    abilities: [
      activated({
        tap: true,
        sorcerySpeed: true,
        targets: [target.cardInGraveyard("t", CREATURES, "you", "carte de créature")],
        effects: [
          fx.moveTo(ref.target(), { to: "battlefield" }, { name: "x" }),
          fx.modify(ref.stored("x"), { addSubtypes: ["Skeleton"], loseAllAbilities: true }, "permanent"),
        ],
        label: "Renvoyez une créature (Squelette sans capacité)",
      }),
    ],
  },
  "Zero Point Ballad": {
    spell: spell(
      [],
      [
        fx.destroyAll({ ...CREATURES, maxToughnessX: true }, "z"),
        fx.loseLife(amount.x),
        fx.when(
          cond.xAtLeast(6),
          fx.pickFromZone(
            "graveyard",
            CREATURES,
            { to: "battlefield", underYourControl: true },
            { pool: ref.stored("z"), prompt: "Choisissez une créature détruite à renvoyer" },
          ),
        ),
      ],
    ),
  },

  // --- Rouge -----------------------------------------------------------------
  "Terminal Velocity": {
    spell: spell(
      [],
      [
        fx.pickFromZone(
          "hand",
          { types: ["Artifact", "Creature"] },
          { to: "battlefield" },
          { min: 0, store: "v", prompt: "Vous pouvez mettre une carte d'artefact ou de créature sur le champ de bataille" },
        ),
        fx.modify(
          ref.stored("v"),
          {
            addKeywords: ["haste"],
            addAbilities: [
              triggered(when.leavesSelf, [fx.damageAll(amount.manaValueOf(ref.self), CREATURES)], {
                label: "Blessures égales à sa VM à chaque créature",
              }),
              triggered(when.yourEndStep, [fx.sacrificeIt(ref.self)], { label: "Sacrifiez-le" }),
            ],
          },
          "permanent",
        ),
      ],
    ),
  },

  // --- Vert ------------------------------------------------------------------
  "Close Encounter": {
    spell: modal(
      mode(
        "Force d'une créature que vous contrôlez",
        [target.creature("c", { controller: "you" }), target.creature("t")],
        [fx.damage(amount.powerOf(ref.target("c")), ref.target("t"))],
      ),
      mode(
        "Force d'une carte de créature exilée avec la distorsion",
        [
          {
            id: "c",
            label: "carte de créature exilée avec la distorsion",
            filter: { exiled: { withWarp: true, own: true, filter: CREATURES } },
          },
          target.creature("t"),
        ],
        [fx.damage(amount.powerOf(ref.target("c")), ref.target("t"))],
      ),
    ),
  },
  "Famished Worldsire": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.lookAtTop(amount.powerOf(ref.self), {
            filter: { types: ["Land"] },
            count: amount.powerOf(ref.self),
            to: { to: "battlefield", tapped: true },
            rest: "top",
          }),
          fx.shuffle(),
        ],
        { label: "Terrains parmi les X cartes du dessus" },
      ),
    ],
  },
  "Loading Zone": {
    abilities: [
      eventReplacement({
        event: "counters",
        to: "yourSide",
        toFilter: { anyOf: [{ types: ["Creature"] }, { subtype: "Spacecraft" }, { subtype: "Planet" }] },
        modify: { times: 2 },
        label: "Marqueurs doublés (créatures, Vaisseaux, Planètes)",
      }),
    ],
  },

  // --- Multicolores ----------------------------------------------------------
  "Alpharael, Dreaming Acolyte": {
    abilities: [
      triggered(when.entersSelf, [fx.draw(2), fx.discard(2, ref.you, { unlessFilter: { types: ["Artifact"] } })], {
        label: "Piochez deux, défaussez deux (ou un artefact)",
      }),
      staticAbility(
        "self",
        { addKeywords: ["deathtouch"] },
        { condition: cond.yourTurn, label: "Contact mortel pendant votre tour" },
      ),
    ],
  },
  "Dyadrine, Synthesis Amalgam": {
    abilities: [
      entersWith({ counters: amount.manaSpent, label: "Marqueurs +1/+1 = mana dépensé" }),
      triggered(
        when.attackWith(1),
        [
          ...fx.may(
            "Retirer un marqueur +1/+1 de deux de vos créatures ?",
            fx.removeCounterFromEach(CREATURE_YOU_CONTROL, 2, "d"),
          ),
          ...fx.when(cond.v("d"), fx.draw(1), fx.createTokens(ROBOT)),
        ],
        {
          condition: cond.controls({ ...CREATURE_YOU_CONTROL, withCounter: "+1/+1" }, 2),
          label: "Piochez et Robot 2/2",
        },
      ),
    ],
  },
  "Mutinous Massacre": {
    spell: modal(massacre("odd", "Valeur de mana impaire"), massacre("even", "Valeur de mana paire")),
  },
  "Ragost, Deft Gastronaut": {
    abilities: [
      staticAbility(
        { types: ["Artifact"], controller: "you" },
        {
          addSubtypes: ["Food"],
          addAbilities: [activated({ mana: "{2}", tap: true, sacrifice: true, effects: [fx.gainLife(3)], label: "+3 PV" })],
        },
        { label: "Vos artefacts sont des Nourritures" },
      ),
      activated({
        mana: "{1}",
        tap: true,
        sacrificeOther: { filter: { subtype: "Food" } },
        effects: [fx.damage(3, ref.eachOpponent)],
        label: "3 blessures à chaque adversaire",
      }),
      triggered(when.step("end", "any"), [fx.untap(ref.self)], {
        condition: cond.lifeGainedAtLeast(1),
        label: "Vous avez gagné des PV : dégagez-le",
      }),
    ],
  },
  "Singularity Rupture": {
    spell: spell([target.upTo(4, target.player("t"))], [fx.destroyAll(CREATURES), fx.millHalf(ref.target())]),
  },

  // --- Incolores -------------------------------------------------------------
  "Anticausal Vestige": {
    abilities: [
      triggered(
        when.leavesSelf,
        [
          fx.draw(1),
          fx.pickFromZone(
            "hand",
            { permanent: true },
            { to: "battlefield", tapped: true },
            {
              min: 0,
              maxManaValue: amount.count({ types: ["Land"], controller: "you" }),
              prompt: "Vous pouvez mettre une carte de permanent (VM ≤ vos terrains) sur le champ de bataille",
            },
          ),
        ],
        { label: "Piochez, puis un permanent de votre main" },
      ),
    ],
  },
  "Tezzeret, Cruel Captain": {
    abilities: [
      triggered(when.enters({ types: ["Artifact"], controller: "you" }), [fx.counters(ref.self, "loyalty", 1)], {
        label: "Un marqueur de loyauté",
      }),
      loyalty(0, {
        targets: [target.permanent("t", ["Artifact", "Creature"], {}, "artefact ou créature")],
        effects: [
          fx.untap(ref.target()),
          fx.when(
            cond.targetMatches("t", { types: ["Artifact"], anyOf: [{ types: ["Creature"] }] }),
            fx.addCounters(ref.target(), 1),
          ),
        ],
        label: "Dégagez un artefact ou une créature",
      }),
      loyalty(-3, {
        effects: [fx.search({ types: ["Artifact"], maxManaValue: 1 })],
        label: "Cherchez un artefact de VM 1 ou moins",
      }),
      loyalty(-7, {
        effects: [
          fx.emblem(
            "Tezzeret",
            "At the beginning of combat on your turn, put three +1/+1 counters on target artifact you control. If it's not a creature, it becomes a 0/0 Robot artifact creature.",
            [
              triggered(
                when.step("beginCombat"),
                [
                  fx.addCounters(ref.target(), 3),
                  fx.when(
                    cond.not(cond.targetMatches("t", CREATURES)),
                    fx.modify(
                      ref.target(),
                      { addTypes: ["Creature"], addSubtypes: ["Robot"], setPower: 0, setToughness: 0 },
                      "permanent",
                    ),
                  ),
                ],
                {
                  targets: [target.permanent("t", ["Artifact"], { controller: "you" }, "artefact que vous contrôlez")],
                  label: "Trois marqueurs +1/+1 sur un artefact",
                },
              ),
            ],
          ),
        ],
        label: "Emblème",
      }),
    ],
  },
  "The Dominion Bracelet": {
    abilities: [
      staticAbility("attached", { power: 1, toughness: 1 }, { label: "+1/+1" }),
      // Approximation (comme Fishing Pole) : la capacité accordée à la créature équipée est portée par l'Équipement.
      activated({
        mana: "{15}",
        exileSelf: true,
        sorcerySpeed: true,
        targets: [target.player("t", "opponent")],
        effects: [fx.controlNextTurn(ref.target())],
        reduction: { generic: amount.powerOf(ref.attached) },
        activationCondition: cond.controls({ types: ["Creature"], attachedToSource: true }),
        label: "Contrôlez l'adversaire pendant son prochain tour",
      }),
    ],
  },
};
