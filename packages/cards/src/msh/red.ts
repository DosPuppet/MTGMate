/** Marvel Super Heroes — cartes rouges. */
import {
  activated,
  amount,
  block,
  bothIfKicked,
  type CardScript,
  cond,
  costReducer,
  eventReplacement,
  fx,
  mode,
  playerStatic,
  ref,
  spell,
  staticAbility,
  TREASURE,
  target,
  triggered,
  VILLAIN,
  when,
} from "./common";

/** « Vous pouvez sacrifier un artefact ou défausser une carte. Si vous le faites, piochez N cartes. » */
const sacrificeOrDiscardToDraw = (n: number) => [
  fx.sacrifice(ref.you, { types: ["Artifact"] }, 1, { optional: true, store: "s" }),
  ...fx.when(cond.not(cond.v("s")), fx.discard(1, ref.you, { optional: true, store: "d" })),
  ...fx.when(cond.any(cond.v("s"), cond.v("d")), fx.draw(n)),
];

/** « N'importe quelle autre cible » (une capacité de la source qui ne peut pas la viser). */
const anyOtherTarget = (id = "t") => {
  const t = target.any(id);
  return {
    ...t,
    label: "n'importe quelle autre cible",
    filter: { ...t.filter, objects: { ...t.filter.objects, other: true } },
  };
};

export const RED: Record<string, CardScript> = {
  // Prouesse : lue dans le texte.
  "Crimson Operative": {
    abilities: [
      triggered(when.entersSelf, [fx.impulse(1, "yourNextTurn")], {
        label: "Exile la carte du dessus, jouable jusqu'à la fin de votre prochain tour",
      }),
    ],
  },
  "Death to Our Enemies": {
    abilities: [
      triggered(
        when.castSpell("you", { notTypes: ["Creature"] }),
        [fx.createTappedTokens(TREASURE), fx.counters(ref.self, "plan")],
        { label: "Un Trésor engagé et un marqueur de plan" },
      ),
      triggered(
        when.countersPut("self", "plan"),
        [
          fx.sacrifice(ref.you, { self: true }, 1, { store: "s" }),
          ...fx.when(cond.v("s"), fx.reflexive([target.between(1, 2, target.any())], [fx.damageDivided(7, ref.target())])),
        ],
        {
          condition: cond.counterAtLeast("plan", 4),
          label: "Quatrième marqueur : sacrifiez-le, 7 blessures réparties entre une ou deux cibles",
        },
      ),
    ],
  },
  "Fin Fang Foom": {
    abilities: [
      triggered(
        when.castSpell("you", { types: ["Instant", "Sorcery"] }, { objects: { types: ["Artifact", "Land"] } }),
        [fx.copySpell(ref.eventObject, 1), fx.addCounters(ref.self, 2)],
        { label: "Copie le sort, deux marqueurs +1/+1" },
      ),
    ],
  },
  /**
   * « Payez {1} jusqu'à trois fois ; quand vous le faites, choisissez jusqu'à autant de modes » : chaque mode est
   * proposé à son tour pour {1} (même résultat : N modes différents pour {N}), avec sa propre capacité réflexive.
   */
  "Hawkeye, Master Marksman": {
    abilities: [
      triggered(
        when.tapsSelf,
        [
          ...fx.mayPay(
            "{1}",
            "Payer {1} pour Filet (une créature ciblée ne peut pas bloquer ce tour-ci) ?",
            fx.reflexive([target.creature("c")], [fx.modify(ref.target("c"), { addKeywords: ["cantBlock"] })]),
          ),
          ...fx.mayPay(
            "{1}",
            "Payer {1} pour Explosive (2 blessures à un joueur ciblé) ?",
            fx.reflexive([target.player("p")], [fx.damage(2, ref.target("p"))]),
          ),
          ...fx.mayPay(
            "{1}",
            "Payer {1} pour Boomerang (défaussez une carte, puis piochez une carte) ?",
            fx.reflexive([], [fx.discard(1), fx.draw(1)]),
          ),
        ],
        { label: "Flèches truquées" },
      ),
    ],
  },
  "Hawkeye's Bow": {
    // Équiper {1} : lu dans le texte.
    abilities: [
      staticAbility("attached", { power: 1, addKeywords: ["reach"] }, { label: "+1/+0 et la portée" }),
      triggered({ on: "taps", who: { attachedToSource: true } }, [fx.damage(1, ref.eachOpponent, ref.eventObject)], {
        label: "La créature équipée inflige 1 blessure à chaque adversaire",
      }),
    ],
  },
  "Hex Magic": {
    spell: spell(
      [],
      [
        fx.moveAll("hand", ref.you, {}, { to: "exile" }, "h"),
        fx.draw(amount.refCount(ref.stored("h"))),
        fx.grantPlay(ref.stored("h"), { untilYourNextTurn: true }),
      ],
    ),
  },
  "Hire a Crew": {
    spell: spell([], [fx.createTokens(VILLAIN), fx.pumpAll({ types: ["Creature"], controller: "you" }, 1, 0)]),
  },
  // Travail d'équipe 4 : lu dans le texte (`cond.kicked`).
  "HULK SMASH!": {
    spell: bothIfKicked(
      mode(
        "Détruit un artefact non-créature",
        [target.permanent("a", ["Artifact"], { notTypes: ["Creature"] })],
        [fx.destroy(ref.target("a"))],
      ),
      mode(
        "Votre créature inflige des blessures égales à sa force",
        [target.creature("c", { controller: "you" }), target.creature("o", { controller: "opponent" })],
        [fx.damage(amount.powerOf(ref.target("c")), ref.target("o"), ref.target("c"))],
      ),
      "Les deux (travail d'équipe)",
    ),
  },
  "Human Torch, Johnny Storm": {
    abilities: [
      triggered(when.draw(), [fx.damage(1, ref.target())], {
        targets: [target.player("t", "opponent")],
        condition: cond.controls({ subtype: "Hero", other: true }),
        label: "Avec un autre Héros : 1 blessure à un adversaire",
      }),
      activated({
        mana: "{6}{R}",
        powerUp: true,
        effects: [fx.addCounters(ref.self, 3)],
        label: "Montée en puissance : trois marqueurs +1/+1",
      }),
    ],
  },
  "HYDRA Assault Robot": {
    abilities: [
      triggered(
        when.enters({ controller: "you", other: true, anyOf: [{ subtype: "Villain" }, { types: ["Artifact"] }] }),
        [fx.damage(1, ref.target())],
        { targets: [target.player("t", "opponent")], label: "1 blessure à un adversaire" },
      ),
    ],
  },
  "Iron Fist, Living Weapon": {
    abilities: [
      triggered(
        when.castSpell("you", undefined, { objects: { types: ["Creature"], controller: "you" } }),
        [
          fx.modify(ref.self, {
            addAbilities: [
              activated({
                tap: true,
                targets: [anyOtherTarget()],
                effects: [fx.damage(amount.powerOf(ref.self), ref.target())],
                label: "Blessures égales à sa force à une autre cible",
              }),
            ],
          }),
        ],
        { label: "Gagne « {T} : blessures égales à sa force »" },
      ),
    ],
  },
  "Jessica Jones, Private Eye": {
    abilities: [
      activated({
        tap: true,
        addCounters: { kind: "stun", n: 1 },
        effects: [fx.exileTop(ref.you, amount.powerOf(ref.self), "j"), fx.grantPlay(ref.stored("j"))],
        label: "Exile les X cartes du dessus, jouables ce tour-ci",
      }),
    ],
  },
  "K'un-Lun Warrior": {
    abilities: [
      triggered(when.entersSelf, sacrificeOrDiscardToDraw(1), {
        label: "Sacrifiez un artefact ou défaussez une carte : piochez",
      }),
    ],
  },
  "Machinesmith Automaton": {
    abilities: [
      triggered(when.enters({ types: ["Artifact"], controller: "you", other: true }), [fx.addCounters(ref.self, 1)], {
        label: "Un marqueur +1/+1",
      }),
    ],
  },
  "Misty Knight, Hero for Hire": {
    abilities: [
      activated({
        mana: "{2}",
        tap: true,
        discard: 1,
        effects: [fx.draw(amount.cardsDiscardedThisTurn)],
        label: "Piochez une carte par carte défaussée ce tour-ci",
      }),
    ],
  },
  "Photon Blast Barrage": {
    spell: spell([target.creature()], [fx.damage(1, ref.target())]),
    abilities: [triggered(when.castSelf, [fx.copySpell(ref.self, amount.eventX)], { label: "Copiez ce sort X fois" })],
  },
  // Célérité : lue dans le texte.
  "Quicksilver, Brash Blur": {
    leyline: true,
    abilities: [
      activated({
        mana: "{4}{R}",
        powerUp: true,
        effects: [fx.addCounters(ref.self, 1), fx.counters(ref.self, "doubleStrike")],
        label: "Montée en puissance : un marqueur +1/+1 et un marqueur de double initiative",
      }),
    ],
  },
  // Portée, piétinement : lus dans le texte.
  "Red Hulk": {
    abilities: [
      triggered(
        when.isDealtDamage,
        [fx.addCounters(ref.self, 1), fx.reflexive([anyOtherTarget()], [fx.damage(amount.countersOn(ref.self), ref.target())])],
        { label: "Rage : un marqueur +1/+1, puis autant de blessures que de marqueurs" },
      ),
    ],
  },
  // Travail d'équipe 2 : lu dans le texte.
  "Repulsor Blast": {
    spell: spell(
      [target.creature()],
      [fx.damage(5, ref.target()), ...fx.when(cond.kicked, fx.damage(2, ref.controllerOf(ref.target())))],
    ),
  },
  "The Scarlet Witch": {
    abilities: [
      costReducer(
        { types: ["Instant", "Sorcery"], minManaValue: 4 },
        0,
        "Éphémères et rituels de valeur de mana 4 ou plus : {X} de moins (X : sa force)",
        { genericAmount: amount.powerOf(ref.self) },
      ),
    ],
  },
  // Célérité : lue dans le texte.
  "Speed, Young Avenger": {
    abilities: [
      triggered(
        when.castSpell("you", { notTypes: ["Creature"] }),
        fx.mayPay(
          "{1}",
          "Payer {1} : une créature avec la célérité ne peut être bloquée que par des créatures avec la célérité ?",
          fx.reflexive(
            [{ ...target.creature("t", { keyword: "haste" }), label: "créature avec la célérité" }],
            [
              fx.modify(ref.target(), {
                addBlockRules: [
                  block.notBy({ not: { keyword: "haste" } }, "Ne peut être bloquée que par des créatures avec la célérité"),
                ],
              }),
            ],
          ),
        ),
        { label: "Payez {1} : imblocable sauf par des créatures avec la célérité" },
      ),
    ],
  },
  "Stark Industries Executive": {
    abilities: [activated({ mana: "{2}", tap: true, effects: [fx.createTokens(TREASURE)], label: "Un Trésor" })],
  },
  // Flash : lu dans le texte.
  "Super Speed": {
    enchant: { filter: { types: ["Creature"] }, label: "créature" },
    abilities: [
      triggered(when.entersSelf, [fx.modify(ref.attached, { addKeywords: ["firstStrike"] })], {
        label: "La créature enchantée gagne l'initiative jusqu'à la fin du tour",
      }),
      staticAbility("attached", { power: 1, addKeywords: ["haste"] }, { label: "+1/+0 et la célérité" }),
    ],
  },
  // Travail d'équipe 1 : lu dans le texte.
  "Team Tactics": {
    spell: spell(
      [target.creature()],
      [
        fx.modify(ref.target(), { addKeywords: ["doubleStrike"] }),
        ...fx.when(cond.kicked, fx.modify(ref.target(), { addKeywords: ["trample"] })),
      ],
    ),
  },
  "Truck Toss": {
    costReduction: { generic: 2, condition: cond.controls({ subtype: "Vehicle" }) },
    spell: spell([target.any()], [fx.damage(4, ref.target())]),
  },
  "Vision of Love": { spell: spell([], sacrificeOrDiscardToDraw(2)) },
  // Célérité : lue dans le texte.
  "Volcanic Villain": {
    abilities: [
      activated({
        mana: "{5}{R}",
        powerUp: true,
        effects: [fx.addCounters(ref.self, 2)],
        label: "Montée en puissance : deux marqueurs +1/+1",
      }),
    ],
  },
  // Vol : lu dans le texte.
  "Wonder Man, Hollywood Hero": {
    abilities: [
      playerStatic({ powerUpExtraUses: 1, label: "Vos montées en puissance peuvent être activées une fois de plus" }),
      activated({
        mana: "{5}{R}{R}",
        powerUp: true,
        effects: [fx.addCounters(ref.self, 2)],
        label: "Montée en puissance : deux marqueurs +1/+1",
      }),
    ],
  },
  // Portée : lue dans le texte.
  "Hawkeye, Young Avenger": {
    abilities: [
      eventReplacement({
        event: "damage",
        source: { controller: "you" },
        to: "opponentSide",
        combat: false,
        modify: { add: amount.powerOf(ref.self) },
        label: "Vos sources infligent autant de blessures non de combat en plus que sa force",
      }),
    ],
  },
  "Evil's Thrall": {
    spell: spell(
      [target.creature()],
      [
        ...fx.when(
          cond.amountGreater(amount.maxManaValue({ subtype: "Villain", controller: "you" }), amount.manaValueOf(ref.target())),
          fx.gainControl(ref.target(), { untilEndOfYourNextTurn: true }),
        ),
        ...fx.when(
          cond.not(
            cond.amountGreater(amount.maxManaValue({ subtype: "Villain", controller: "you" }), amount.manaValueOf(ref.target())),
          ),
          fx.gainControl(ref.target()),
        ),
        fx.untap(ref.target()),
        fx.pump(ref.target(), 0, 0, ["haste"]),
      ],
    ),
  },
  "Loki Laufeyson": {
    abilities: [
      activated({
        mana: "{1}",
        tap: true,
        effects: [
          {
            op: "playerEffect",
            ability: { nextSpell: { filter: { types: ["Instant", "Sorcery"], maxManaValueSourcePower: true }, copy: true } },
            once: true,
          },
        ],
        label: "Votre prochain éphémère ou rituel de valeur de mana au plus sa force ce tour-ci est copié",
      }),
      activated({
        mana: "{4}{R}",
        powerUp: true,
        effects: [fx.addCounters(ref.self, 2)],
        label: "Montée en puissance : deux marqueurs +1/+1",
      }),
    ],
  },
};
