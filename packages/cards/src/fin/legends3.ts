/** Final Fantasy — légendaires et cartes uniques (lot D3). */
import type { CardScript } from "@mtgx/engine";
import {
  activated,
  amount,
  chapter,
  cond,
  fx,
  manaAbility,
  playerStatic,
  ref,
  spell,
  spree,
  staticAbility,
  target,
  targetObj,
  triggered,
  when,
} from "./common";

const YOURS = { types: ["Creature" as const], controller: "you" as const };
const ALL_COLORS = ["W", "U", "B", "R", "G"] as const;
const PERMANENT_CARD = { permanent: true };
const SAGA_YOU = { subtype: "Saga", controller: "you" as const };

/** Sin : exilez une carte de permanent au hasard, copie engagée ; recommencez si c'était un terrain (au plus six fois). */
const sinRound = (k: number): ReturnType<typeof fx.when> => {
  const name = `sin${k}`;
  const body = [
    fx.pickFromZone("graveyard", PERMANENT_CARD, { to: "exile" }, { random: true, store: name }),
    fx.copyToken(ref.stored(name), { tapped: true }),
  ];
  return k === 0 ? body.flat() : fx.when(cond.refMatches(ref.stored(`sin${k - 1}`), { types: ["Land"] }), ...body);
};

export const LEGENDS3: Record<string, CardScript> = {
  "Clash of the Eikons": {
    spell: spree(
      {
        cost: "{0}",
        label: "Combat",
        targets: [target.creature("a", { controller: "you" }), target.creature("b", { controller: "opponent" })],
        effects: [fx.fight(ref.target("a"), ref.target("b"))],
      },
      {
        cost: "{0}",
        label: "Retirez un marqueur de savoir",
        targets: [targetObj("r", SAGA_YOU, "Saga que vous contrôlez")],
        effects: [fx.removeCounters(ref.target("r"), 1, "lore")],
      },
      {
        cost: "{0}",
        label: "Ajoutez un marqueur de savoir",
        targets: [targetObj("l", SAGA_YOU, "Saga que vous contrôlez")],
        effects: [fx.counters(ref.target("l"), "lore", 1)],
      },
    ),
  },
  "Summon: Fenrir": {
    abilities: [
      chapter([1], [fx.search({ types: ["Land"], basic: true }, { to: "battlefield", tapped: true })], { label: "Croc lunaire" }),
      chapter([2], [fx.nextCreatureSpell({ counters: 1 })], { label: "Hurlement céleste" }),
      chapter([3], [fx.when(cond.controlsGreatestPower, fx.draw(1))], { label: "Grognement écliptique" }),
    ],
  },
  "Torgal, A Fine Hound": {
    abilities: [
      triggered(
        when.castSpell("you", { types: ["Creature"], subtype: "Human" }),
        [fx.spellArrivalCounters(ref.eventObject, amount.count({ ...YOURS, anyOf: [{ subtype: "Dog" }, { subtype: "Wolf" }] }))],
        { oncePerTurn: true, label: "Premier Humain : marqueurs par Chien ou Loup" },
      ),
      manaAbility([...ALL_COLORS]),
    ],
  },
  "Summon: Brynhildr": {
    abilities: [
      chapter([1], [fx.exileTop(ref.you, 1, "b"), fx.link(ref.stored("b")), fx.grantPlay(ref.stored("b"))], {
        label: "Chaîne : exilez la carte du dessus",
      }),
      chapter([2, 3], [fx.grantPlay(ref.linked), fx.nextCreatureSpell({ haste: true })], { label: "Mode Gestalt" }),
    ],
  },
  "Lightning, Army of One": {
    abilities: [triggered(when.combatDamageToPlayer, [fx.doubleDamageTo(ref.eventPlayer)], { label: "Déséquilibre" })],
  },
  "Noctis, Prince of Lucis": {
    abilities: [
      playerStatic({
        playFrom: { zone: "graveyard", filter: { types: ["Artifact"] }, what: "spells", payLife: 3, finality: true },
        label: "Artefacts depuis le cimetière (3 PV, finalité)",
      }),
    ],
  },
  "Omega, Heartless Evolution": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.tap(ref.target()),
          fx.counters(ref.target(), "stun", amount.count({ types: ["Land"], nonbasic: true, controller: "you" })),
          fx.gainLife(amount.count({ types: ["Land"], nonbasic: true, controller: "you" })),
        ],
        {
          targets: [{ ...target.upTo(8, target.nonland("t", { controller: "opponent" })), differentPlayers: true }],
          label: "Canon à ondes",
        },
      ),
    ],
  },
  "Vivi Ornitier": {
    abilities: [
      manaAbility(["U", "R"], 1, {
        selfPower: true,
        noTap: true,
        oncePerTurn: true,
        condition: cond.yourTurn,
        combination: true,
      }),
      triggered(
        when.castSpell("you", { notTypes: ["Creature"] }),
        [fx.addCounters(ref.self, 1), fx.damage(1, ref.eachOpponent)],
        { label: "Marqueur +1/+1, 1 blessure à chaque adversaire" },
      ),
    ],
  },
  "Garnet, Princess of Alexandria": {
    abilities: [
      // Approximation : un marqueur de savoir retiré de chacune de vos Sagas, ou d'aucune.
      triggered(
        when.attacksSelf,
        [
          fx.may(
            "Retirer un marqueur de savoir de chacune de vos Sagas ?",
            fx.removeCounters(ref.permanentsOf(ref.you, { subtype: "Saga" }), 1, "lore", "g"),
            fx.addCounters(ref.self, amount.v("g")),
          ),
        ],
        { label: "Marqueurs de savoir → marqueurs +1/+1" },
      ),
    ],
  },
  "Choco, Seeker of Paradise": {
    abilities: [
      // Approximation : les cartes regardées sont meulées, puis une va en main et les terrains sur le champ de bataille.
      triggered(
        when.attacks({ ...YOURS, subtype: "Bird" }),
        [
          fx.mill(amount.count({ ...YOURS, subtype: "Bird", attacking: true }), ref.you, { name: "c" }),
          fx.pickFromZone("graveyard", {}, { to: "hand" }, { pool: ref.stored("c"), min: 0, prompt: "Une carte en main" }),
          fx.pickFromZone(
            "graveyard",
            { types: ["Land"] },
            { to: "battlefield", tapped: true },
            {
              pool: ref.stored("c"),
              count: 20,
              min: 0,
              prompt: "Les terrains sur le champ de bataille",
            },
          ),
        ],
        { batched: true, label: "Oiseaux attaquants : regardez autant de cartes" },
      ),
      triggered(when.landfall, [fx.pump(ref.self, 1, 0)], { label: "Landfall : +1/+0" }),
    ],
  },
  "Sin, Spira's Punishment": {
    abilities: [
      ...[when.entersSelf, when.attacksSelf].map((t) =>
        triggered(t, [0, 1, 2, 3, 4, 5].map(sinRound), { label: "Copie d'une carte de permanent au hasard" }),
      ),
    ],
  },
  "Memories Returning": {
    flashback: "{7}{U}{U}",
    // Approximation : vous choisissez les trois cartes gardées (l'adversaire ne choisit pas les deux cartes du dessous).
    spell: spell([], [fx.lookAtTop(5, { count: 3, rest: "bottom" })]),
  },
  "Balthier and Fran": {
    abilities: [
      staticAbility(
        { subtype: "Vehicle", controller: "you" },
        { power: 1, toughness: 1, addKeywords: ["reach", "vigilance"] },
        { label: "Vos Véhicules : +1/+1, portée et vigilance" },
      ),
      triggered(
        when.attacks({ subtype: "Vehicle", controller: "you", crewedBySource: true }),
        fx.mayPay("{1}{R}{G}", "Payer {1}{R}{G} pour une phase de combat supplémentaire ?", fx.extraCombat),
        { condition: cond.firstCombat, label: "Combat supplémentaire" },
      ),
    ],
  },
  "Aettir and Priwen": {
    abilities: [
      staticAbility("attached", { setPower: 1, setToughness: 1 }, { perLife: true, label: "F/E de base égales à vos PV" }),
    ],
  },
  Blitzball: {
    abilities: [
      manaAbility([...ALL_COLORS]),
      activated({
        tap: true,
        sacrifice: true,
        activationCondition: cond.opponentDamagedByLegendary,
        effects: [fx.draw(2)],
        label: "BUUUUT ! Piochez deux cartes",
      }),
    ],
  },
  "Genji Glove": {
    abilities: [
      staticAbility("attached", { addKeywords: ["doubleStrike"] }, { label: "Double initiative" }),
      triggered(when.attacks({ attachedToSource: true }), [fx.untap(ref.eventObject), fx.extraCombat], {
        condition: cond.firstCombat,
        label: "Dégagez-la, phase de combat supplémentaire",
      }),
    ],
  },
  "Cloud, Planet's Champion": {
    equipDiscountWhenTargeted: 2,
    abilities: [
      staticAbility(
        "self",
        { addKeywords: ["doubleStrike", "indestructible"] },
        { condition: cond.all(cond.yourTurn, cond.sourceMatches({ equipped: true })), label: "Équipé pendant votre tour" },
      ),
    ],
  },
};
