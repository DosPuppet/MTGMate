/** Final Fantasy — légendaires, Cristaux et cartes uniques (lot D). */
import type { CardScript, TargetSpec } from "@mtgx/engine";
import {
  activated,
  amount,
  chapter,
  cond,
  costReducer,
  entersWith,
  eventReplacement,
  fx,
  manaAbility,
  playerStatic,
  ref,
  spell,
  staticAbility,
  TREASURE,
  target,
  targetObj,
  triggered,
  wardAbility,
  when,
} from "./common";

const YOURS = { types: ["Creature" as const], controller: "you" as const };
const CREATURE_OR_ARTIFACT = { anyOf: [{ types: ["Creature" as const] }, { types: ["Artifact" as const] }] };
const ALL_COLORS = ["W", "U", "B", "R", "G"] as const;

/** « Défaussez une carte. Si vous le faites, piochez une carte » (optionnel). */
const rummage = () => [
  fx.may("Défausser une carte pour piocher ?", fx.discard(1, ref.you, { store: "d" }), fx.when(cond.v("d"), fx.draw(1))),
];

export const LEGENDS: Record<string, CardScript> = {
  // --- Blanc ------------------------------------------------------------------
  "Aerith Gainsborough": {
    abilities: [
      triggered(when.gainLife, [fx.addCounters(ref.self, 1)], { label: "Marqueur +1/+1" }),
      triggered(when.diesSelf, [fx.addCountersAll({ ...YOURS, legendary: true }, amount.lkiCounters("+1/+1"))], {
        label: "Ses marqueurs sur chaque créature légendaire",
      }),
    ],
  },
  "Stiltzkin, Moogle Merchant": {
    abilities: [
      activated({
        mana: "{2}",
        tap: true,
        targets: [
          target.player("p", "opponent"),
          targetObj("t", { permanent: true, controller: "you", other: true }, "autre permanent"),
        ],
        effects: [fx.giveControl(ref.target("t"), ref.target("p")), fx.draw(1)],
        label: "Donnez un permanent, piochez",
      }),
    ],
  },
  "The Wind Crystal": {
    abilities: [
      costReducer({ colors: ["W"] }, 1, "Sorts blancs : {1} de moins"),
      eventReplacement({ event: "lifeGain", to: "you", modify: { times: 2 }, label: "Gains de PV doublés" }),
      activated({
        mana: "{4}{W}{W}",
        tap: true,
        effects: [fx.pumpAll(YOURS, 0, 0, ["flying", "lifelink"])],
        label: "Vos créatures : le vol et le lien de vie",
      }),
    ],
  },

  // --- Bleu -------------------------------------------------------------------
  "Edgar, King of Figaro": {
    abilities: [
      triggered(when.entersSelf, [fx.draw(amount.count({ types: ["Artifact"], controller: "you" }))], {
        label: "Une carte par artefact",
      }),
      playerStatic({ winFirstCoinFlips: true, label: "Pièce à deux faces" }),
    ],
  },
  "Louisoix's Sacrifice": {
    additionalCost: {
      sacrifice: { filter: { types: ["Creature"], legendary: true }, count: 1, orPay: { generic: 2, colored: {}, x: 0 } },
    },
    spell: spell(
      [
        {
          id: "t",
          label: "capacité activée ou déclenchée, ou sort non-créature",
          filter: { spells: { notTypes: ["Creature"] }, stackItems: { abilitiesOnly: true } },
        } satisfies TargetSpec,
      ],
      [fx.counter(ref.target())],
    ),
  },
  "Swallowed by Leviathan": {
    spell: spell(
      [target.spell("t")],
      [
        fx.surveil(2),
        ...fx.unlessPays(
          ref.controllerOf(ref.target()),
          { genericAmount: amount.cardsIn("graveyard") },
          fx.counter(ref.target()),
        ),
      ],
    ),
  },
  "The Water Crystal": {
    abilities: [
      costReducer({ colors: ["U"] }, 1, "Sorts bleus : {1} de moins"),
      eventReplacement({
        event: "mill",
        to: "opponent",
        modify: { add: 4 },
        label: "Les adversaires meulent quatre cartes de plus",
      }),
      activated({
        mana: "{4}{U}{U}",
        tap: true,
        effects: [fx.mill(amount.cardsIn("hand"), ref.eachOpponent)],
        label: "Chaque adversaire meule autant que votre main",
      }),
    ],
  },
  "Stuck in Summoner's Sanctum": {
    enchant: { filter: { anyOf: [{ types: ["Artifact"] }, { types: ["Creature"] }] }, label: "artefact ou créature" },
    abilities: [
      triggered(when.entersSelf, [fx.tap(ref.attached)], { label: "Engagez le permanent" }),
      staticAbility("attached", { addKeywords: ["doesntUntap", "noActivatedAbilities"] }, { label: "Bloqué" }),
    ],
  },

  // --- Noir -------------------------------------------------------------------
  "Kain, Traitorous Dragoon": {
    abilities: [
      staticAbility("self", { addKeywords: ["flying"] }, { condition: cond.yourTurn, label: "Saut : le vol pendant votre tour" }),
      triggered(
        when.combatDamageToPlayer,
        [
          fx.giveControl(ref.self, ref.eventPlayer),
          fx.draw(amount.eventAmount),
          fx.createTappedTokens(TREASURE, amount.eventAmount),
          fx.loseLife(amount.eventAmount),
        ],
        { label: "Il prend Kain ; piochez, Trésors, perdez des PV" },
      ),
    ],
  },
  "Reno and Rude": {
    abilities: [
      triggered(
        when.combatDamageToPlayer,
        [
          fx.exileTop(ref.eventPlayer, 1, "r"),
          fx.sacrifice(ref.you, { ...CREATURE_OR_ARTIFACT, other: true }, 1, { optional: true, store: "s" }),
          fx.when(cond.v("s"), fx.grantPlay(ref.stored("r"), { anyMana: true })),
        ],
        { label: "Exilez sa carte du dessus ; sacrifiez pour la jouer" },
      ),
    ],
  },
  "Summon: Primal Odin": {
    abilities: [
      chapter([1], [fx.destroy(ref.target())], {
        targets: [target.creature("t", { controller: "opponent" })],
        label: "Gungnir",
      }),
      chapter(
        [2],
        [
          fx.modify(
            ref.self,
            {
              addAbilities: [
                triggered(when.combatDamageToPlayer, [fx.playerLoses(ref.eventPlayer)], { label: "Ce joueur perd la partie" }),
              ],
            },
            "permanent",
          ),
        ],
        { label: "Zantetsuken" },
      ),
      chapter([3], [fx.draw(2), fx.loseLife(2, ref.eachPlayer)], { label: "Salle du chagrin" }),
    ],
  },

  // --- Rouge ------------------------------------------------------------------
  "Barret Wallace": {
    abilities: [
      triggered(when.attacksSelf, [fx.damage(amount.count({ ...YOURS, equipped: true }), ref.eventPlayer)], {
        label: "Blessures par créature équipée",
      }),
    ],
  },
  "The Fire Crystal": {
    abilities: [
      costReducer({ colors: ["R"] }, 1, "Sorts rouges : {1} de moins"),
      staticAbility(YOURS, { addKeywords: ["haste"] }, { label: "Vos créatures ont la célérité" }),
      activated({
        mana: "{4}{R}{R}",
        tap: true,
        targets: [target.creature("t", { controller: "you" })],
        effects: [fx.copyToken(ref.target(), { sacrificeAtEndStep: true })],
        label: "Copie jusqu'à la fin du tour",
      }),
    ],
  },
  "Item Shopkeep": {
    abilities: [
      triggered(when.attackWith(), [fx.pump(ref.target(), 0, 0, ["menace"])], {
        targets: [target.creature("t", { attacking: true, equipped: true })],
        label: "Une créature équipée attaquante gagne la menace",
      }),
    ],
  },
  "Nibelheim Aflame": {
    flashback: "{5}{R}{R}",
    spell: spell(
      [target.creature("t", { controller: "you" })],
      [
        fx.damageAll(amount.powerOf(ref.target()), { types: ["Creature"] }, undefined, ref.target()),
        fx.when(cond.spellCastFromGraveyard, fx.discard(amount.cardsIn("hand")), fx.draw(4)),
      ],
    ),
  },
  "Random Encounter": {
    flashback: "{6}{R}{R}",
    spell: spell(
      [],
      [
        fx.shuffle(),
        fx.mill(4, ref.you, { name: "m" }),
        fx.pickFromZone(
          "graveyard",
          { types: ["Creature"] },
          { to: "battlefield" },
          { pool: ref.stored("m"), count: 4, store: "c", prompt: "Les cartes de créature meulées" },
        ),
        fx.pump(ref.stored("c"), 0, 0, ["haste"]),
        fx.delayed([fx.toHand(ref.target("c"))], { c: ref.stored("c") }),
      ],
    ),
  },
  "Zell Dincht": {
    abilities: [
      playerStatic({ extraLands: 1, label: "Un terrain supplémentaire" }),
      staticAbility("self", { power: 1 }, { per: { types: ["Land"], controller: "you" }, label: "+1/+0 par terrain" }),
      // Approximation : le terrain renvoyé est ciblé (comme Arid Archway).
      triggered(when.yourEndStep, [fx.bounce(ref.target())], {
        targets: [targetObj("t", { types: ["Land"], controller: "you" }, "terrain que vous contrôlez")],
        label: "Renvoyez un terrain",
      }),
    ],
  },

  // --- Vert -------------------------------------------------------------------
  "The Earth Crystal": {
    abilities: [
      costReducer({ colors: ["G"] }, 1, "Sorts verts : {1} de moins"),
      eventReplacement({
        event: "counters",
        to: "yourSide",
        toFilter: YOURS,
        counter: "+1/+1",
        modify: { times: 2 },
        label: "Marqueurs +1/+1 doublés sur vos créatures",
      }),
      activated({
        mana: "{4}{G}{G}",
        tap: true,
        targets: [target.upTo(2, target.creature("t", { controller: "you" }))],
        effects: [fx.countersDivided(2, ref.target())],
        label: "Répartissez deux marqueurs +1/+1",
      }),
    ],
  },
  "A Realm Reborn": {
    abilities: [
      staticAbility(
        { permanent: true, controller: "you", other: true },
        { addAbilities: [manaAbility([...ALL_COLORS])] },
        { label: "« {T} : un mana de n'importe quelle couleur »" },
      ),
    ],
  },

  // --- Multicolore ------------------------------------------------------------
  "Cid, Timeless Artificer": {
    abilities: [
      staticAbility(
        { ...YOURS, anyOf: [{ types: ["Artifact"] }, { subtype: "Hero" }] },
        { power: 1, toughness: 1 },
        { per: { subtype: "Artificer", controller: "you" }, label: "+1/+1 par Artificier" },
      ),
      staticAbility(
        { ...YOURS, anyOf: [{ types: ["Artifact"] }, { subtype: "Hero" }] },
        { power: 1, toughness: 1 },
        { perGraveyard: { subtype: "Artificer" }, label: "+1/+1 par carte d'Artificier au cimetière" },
      ),
    ],
  },
  "Golbez, Crystal Collector": {
    abilities: [
      triggered(when.enters({ types: ["Artifact"], controller: "you" }), [fx.surveil(1)], { label: "Surveillance 1" }),
      triggered(
        when.yourEndStep,
        [
          fx.when(cond.controls({ types: ["Artifact"] }, 8), fx.loseLife(amount.powerOf(ref.target()), ref.eachOpponent)),
          fx.toHand(ref.target()),
        ],
        {
          condition: cond.controls({ types: ["Artifact"] }, 4),
          targets: [target.cardInGraveyard("t", { types: ["Creature"] }, "you", "carte de créature")],
          label: "Une créature du cimetière en main",
        },
      ),
    ],
  },
  "Rydia, Summoner of Mist": {
    abilities: [
      triggered(when.landfall, rummage(), { label: "Défaussez, piochez" }),
      activated({
        mana: "{X}",
        tap: true,
        sorcerySpeed: true,
        targets: [target.cardInGraveyard("t", { subtype: "Saga", maxManaValueX: true }, "you", "carte de Saga")],
        effects: [
          fx.moveTo(ref.target(), { to: "battlefield", counters: { kind: "finality", n: 1 } }, { name: "r" }),
          fx.pump(ref.stored("r"), 0, 0, ["haste"]),
        ],
        label: "Invocation : une Saga du cimetière",
      }),
    ],
  },
  "Yuna, Hope of Spira": {
    abilities: [
      staticAbility(
        { ...YOURS, anyOf: [{ self: true }, { types: ["Enchantment"] }] },
        {
          addKeywords: ["trample", "lifelink"],
          addAbilities: [wardAbility({ mana: { generic: 2, colored: {}, x: 0 } })],
        },
        { condition: cond.yourTurn, label: "Piétinement, lien de vie et garde {2} pendant votre tour" },
      ),
      triggered(when.yourEndStep, [fx.moveTo(ref.target(), { to: "battlefield", counters: { kind: "finality", n: 1 } })], {
        targets: [target.upTo(1, target.cardInGraveyard("t", { types: ["Enchantment"] }, "you", "carte d'enchantement"))],
        label: "Un enchantement du cimetière",
      }),
    ],
  },

  // --- Incolore ---------------------------------------------------------------
  Elixir: {
    abilities: [
      entersWith({ tapped: true }),
      activated({
        mana: "{5}",
        tap: true,
        exileSelf: true,
        effects: [
          fx.gainLife(amount.countIn("graveyard", { notTypes: ["Land"] })),
          fx.moveAll("graveyard", ref.you, { notTypes: ["Land"] }, { to: "libraryTop" }),
          fx.shuffle(),
        ],
        label: "Mélangez les cartes non-terrain du cimetière",
      }),
    ],
  },
  Wastes: { abilities: [manaAbility("C")] },
};
