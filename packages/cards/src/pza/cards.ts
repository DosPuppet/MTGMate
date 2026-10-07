/** Source Material (PZA) : scripts des cartes (PLAN-G). */
import {
  activated,
  amount,
  type CardScript,
  cond,
  entersWith,
  fx,
  playerStatic,
  protection,
  RAT,
  ref,
  spell,
  staticAbility,
  target,
  triggered,
  when,
} from "../tdm/common";

const RATS = { types: ["Creature" as const], subtype: "Rat", controller: "you" as const };
const EQUIPPED = { types: ["Creature" as const], attachedToSource: true };
const PAY_FOR_RATS = "payez autant de PV que vous voulez (un Rat par PV)";

export const CARDS: Record<string, CardScript> = {
  // Modulaire 1 : lu dans le texte.
  "Arcbound Ravager": {
    abilities: [
      activated({
        sacrificeOther: { filter: { types: ["Artifact"] }, includeSelf: true },
        effects: [fx.addCounters(ref.self, 1)],
        label: "Sacrifiez un artefact : un marqueur +1/+1",
      }),
    ],
  },
  // Greffe 2 : lue dans le texte.
  "Cytoplast Manipulator": {
    abilities: [
      activated({
        mana: "{U}",
        tap: true,
        targets: [target.creature("t", { withCounter: "+1/+1" })],
        effects: [fx.gainControlWhileSource(ref.target())],
        label: "Contrôle d'une créature avec un marqueur +1/+1, tant que celle-ci reste",
      }),
    ],
  },
  // — G9 : Source Material —
  "Teleportation Circle": {
    abilities: [
      triggered(when.step("end"), [fx.moveTo(ref.target(), { to: "exile" }, { name: "f" }), fx.toBattlefield(ref.stored("f"))], {
        targets: [
          target.optional(target.permanent("t", ["Artifact", "Creature"], { controller: "you" }, "votre artefact ou créature")),
        ],
        label: "Exilez puis renvoyez un de vos artefacts ou créatures",
      }),
    ],
  },
  "Ashcoat of the Shadow Swarm": {
    abilities: [
      triggered(when.attacksSelf, [fx.pumpAll({ ...RATS, other: true }, amount.count(RATS), amount.count(RATS))], {
        label: "Vos autres Rats gagnent +X/+X (X : vos Rats)",
      }),
      triggered({ on: "blocks", who: "self" }, [fx.pumpAll({ ...RATS, other: true }, amount.count(RATS), amount.count(RATS))], {
        label: "Vos autres Rats gagnent +X/+X (X : vos Rats)",
      }),
      triggered(
        when.step("end"),
        fx.may(
          "meuler quatre cartes",
          fx.mill(4),
          fx.pickFromZone("graveyard", { types: ["Creature"], subtype: "Rat" }, { to: "hand" }, { count: 2, min: 0 }),
        ),
        { label: "Vous pouvez meuler quatre cartes, puis reprendre jusqu'à deux Rats" },
      ),
    ],
  },
  "Silverclad Ferocidons": {
    abilities: [
      triggered(when.isDealtDamage, [fx.sacrifice(ref.eachOpponent, { permanent: true })], {
        label: "Rage : chaque adversaire sacrifie un permanent",
      }),
    ],
  },
  "Rhythm of the Wild": {
    abilities: [
      playerStatic({
        uncounterable: { filter: { types: ["Creature"] } },
        label: "Vos sorts de créature ne peuvent pas être contrecarrés",
      }),
      staticAbility(
        { types: ["Creature"], controller: "you", token: false },
        { addKeywords: ["riot"] },
        {
          label: "Vos créatures non-jetons ont l'émeute",
        },
      ),
    ],
  },
  // Équiper {2} : lu dans le texte.
  "Conqueror's Flail": {
    abilities: [
      staticAbility(
        "attached",
        { power: 1, toughness: 1 },
        { perAmount: amount.colorsAmong(), label: "+1/+1 par couleur parmi vos permanents" },
      ),
      playerStatic({
        castLimit: { who: "opponents", during: "yourTurn", maxSpells: 0 },
        condition: cond.controls(EQUIPPED),
        label: "Attachée : vos adversaires ne lancent pas de sorts pendant votre tour",
      }),
    ],
  },
  "Metallic Mimic": {
    chooseOnEnter: "creatureType",
    abilities: [
      staticAbility("self", { addChosen: "subtype" }, { label: "Est du type choisi" }),
      entersWith({
        counters: 1,
        affects: { types: ["Creature"], controller: "you", subtypeChosen: true, other: true },
        label: "Vos autres créatures du type choisi arrivent avec un marqueur +1/+1",
      }),
    ],
  },
  // Équiper {2} : lu dans le texte.
  Shadowspear: {
    abilities: [
      staticAbility(
        "attached",
        { power: 1, toughness: 1, addKeywords: ["trample", "lifelink"] },
        {
          label: "+1/+1, piétinement et lien de vie",
        },
      ),
      activated({
        mana: "{1}",
        effects: [fx.modify(ref.permanentsOf(ref.eachOpponent, {}), { removeKeywords: ["hexproof", "indestructible"] })],
        label: "Les permanents adverses perdent la défense talismanique et l'indestructible",
      }),
    ],
  },
  // Équiper {2} : lu dans le texte.
  "Sword of Sinew and Steel": {
    abilities: [
      staticAbility(
        "attached",
        {
          power: 2,
          toughness: 2,
          addProtections: [
            protection.from({ colors: ["B"] }, "Protection contre le noir"),
            protection.from({ colors: ["R"] }, "Protection contre le rouge"),
          ],
        },
        { label: "+2/+2, protection contre le noir et le rouge" },
      ),
      triggered(when.combatDamage(EQUIPPED, true), [fx.destroy(ref.union(ref.target("p"), ref.target("a")))], {
        targets: [
          target.optional(target.permanent("p", ["Planeswalker"], {}, "planeswalker")),
          target.optional(target.permanent("a", ["Artifact"], {}, "artefact")),
        ],
        label: "Détruisez jusqu'à un planeswalker et jusqu'à un artefact",
      }),
    ],
  },
  // Équiper {2} : lu dans le texte.
  "Umezawa's Jitte": {
    abilities: [
      triggered(when.combatDamage(EQUIPPED), [fx.counters(ref.self, "charge", 2)], { label: "Deux marqueurs de charge" }),
      activated({
        removeCounters: { kind: "charge", n: 1 },
        effects: [fx.pump(ref.permanentsOf(ref.you, EQUIPPED), 2, 2)],
        label: "Retirez un marqueur : la créature équipée gagne +2/+2",
      }),
      activated({
        removeCounters: { kind: "charge", n: 1 },
        targets: [target.creature()],
        effects: [fx.pump(ref.target(), -1, -1)],
        label: "Retirez un marqueur : la créature ciblée gagne −1/−1",
      }),
      activated({ removeCounters: { kind: "charge", n: 1 }, effects: [fx.gainLife(2)], label: "Retirez un marqueur : 2 PV" }),
    ],
  },
  "All Will Be One": {
    abilities: [
      triggered({ on: "countersPut", who: {}, by: "you" }, [fx.damage(amount.eventAmount, ref.target())], {
        targets: [
          {
            id: "t",
            label: "adversaire, ou sa créature ou son planeswalker",
            filter: { players: "opponent", objects: { types: ["Creature", "Planeswalker"], controller: "opponent" } },
          },
        ],
        label: "Vous mettez des marqueurs : autant de blessures",
      }),
    ],
  },
  "Waves of Aggression": {
    spell: spell(
      [],
      [
        fx.untap(ref.zone("battlefield", ref.eachPlayer, { types: ["Creature"], attackedThisTurn: true })),
        fx.extraCombatAfterMain,
      ],
    ),
  },
  "Trouble in Pairs": {
    abilities: [
      playerStatic({ skipExtraTurns: true, affects: "opponents", label: "Vos adversaires passent leurs tours supplémentaires" }),
      triggered({ on: "attackWith", min: 2, defending: "you" }, [fx.draw(1)], {
        label: "Un adversaire vous attaque avec deux créatures ou plus : piochez",
      }),
      triggered({ on: "draw", whose: "opponent", nth: 2 }, [fx.draw(1)], {
        label: "Un adversaire pioche sa deuxième carte du tour : piochez",
      }),
      triggered({ on: "castSpell", by: "opponent", nth: 2 }, [fx.draw(1)], {
        label: "Un adversaire lance son deuxième sort du tour : piochez",
      }),
    ],
  },
  // « En commençant par vous, chaque joueur peut payer des PV » : puis chaque adversaire, dans l'ordre du tour.
  // Approximation : chaque joueur paie une seule fois (le processus ne se répète pas).
  "Plague of Vermin": {
    spell: spell(
      [],
      [
        fx.payLifeX(PAY_FOR_RATS, "a"),
        ...fx.forEachPlayer(ref.eachOpponent, (p, n) => [fx.payLifeX(PAY_FOR_RATS, `b${n}`, p)]),
        fx.createTokens(RAT, amount.v("a")),
        ...fx.forEachPlayer(ref.eachOpponent, (p, n) => [fx.createTokens(RAT, amount.v(`b${n}`), p)]),
      ],
    ),
  },
};
