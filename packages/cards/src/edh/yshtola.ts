/**
 * Commander (PLAN-E, E12) : deck de Y'shtola, Night's Blessed (Esper, drain et contrôle). Pertes de PV des adversaires
 * (journal du tour), sorts non-créature, taxes sur les sorts et les attaques, entretien cumulatif (lu dans le texte),
 * rebond imprimé.
 */
import type { CardScript, Condition, TriggerSpec } from "@mtgx/engine";
import {
  activated,
  amount,
  cond,
  costReducer,
  fx,
  loyalty,
  playerStatic,
  ref,
  spell,
  staticAbility,
  TREASURE,
  target,
  triggered,
  when,
} from "./common";

const NONCREATURE = { notTypes: ["Creature" as const] };

/** « Un adversaire a perdu au moins N points de vie ce tour-ci. » */
const opponentLostLife = (n: number): Condition =>
  cond.amountAtLeast(amount.refCount(ref.playersWhere(ref.eachOpponent, cond.amountAtLeast(amount.lifeLostThisTurn, n))), 1);

/** « Si ce n'est pas le tour de ce joueur » (le joueur de l'événement). */
const notEventPlayersTurn: Condition = cond.not(
  cond.amountAtLeast(amount.refCount(ref.playersWhere(ref.eventPlayer, cond.yourTurn)), 1),
);

/** « Chaque fois qu'un joueur lance son deuxième sort de chaque tour. » */
const SECOND_SPELL_ANY: TriggerSpec = { on: "castSpell", by: "any", nth: 2 };

/** « Chaque fois que la créature enchantée inflige des blessures à un adversaire. » */
const ENCHANTED_DAMAGES_OPPONENT = when.dealsDamage({ attachedToSource: true }, { to: { players: "opponent" } });
/** « Chaque fois que cette créature inflige des blessures à un adversaire » (capacité accordée). */
const SELF_DAMAGES_OPPONENT = when.dealsDamage("self", { to: { players: "opponent" } });

export const EDH_YSHTOLA: Record<string, CardScript> = {
  "Y'shtola, Night's Blessed": {
    abilities: [
      triggered(when.eachEndStep, [fx.draw(1)], {
        condition: cond.amountAtLeast(amount.turnEvents({ event: "lifeLoss", sum: true, perPlayer: true }), 4),
        label: "Un joueur a perdu 4 PV ou plus ce tour-ci : piochez",
      }),
      triggered(when.castSpell("you", { ...NONCREATURE, minManaValue: 3 }), [fx.damage(2, ref.eachOpponent), fx.gainLife(2)], {
        label: "Sort non-créature de VM 3 ou plus : 2 blessures à chaque adversaire, gagnez 2 PV",
      }),
    ],
  },
  "Emet-Selch of the Third Seat": {
    abilities: [
      {
        kind: "costReduction",
        filter: {},
        generic: 2,
        fromZones: ["graveyard"],
        label: "Sorts lancés depuis votre cimetière : {2} de moins",
      },
      // « Faites ceci une seule fois par tour » : la limite n'est consommée que si le sort est lancé.
      triggered(
        when.loseLife("opponent"),
        [fx.castNow(ref.target(), { after: "exile", storeCast: "cast" }), ...fx.when(cond.v("cast"), fx.doneOncePerTurn)],
        {
          targets: [target.cardInGraveyard("t", { types: ["Instant", "Sorcery"] }, "you", "carte d'éphémère ou de rituel")],
          batched: true,
          oncePerTurn: "ifDone",
          label: "Un ou plusieurs adversaires perdent des PV : lancez un éphémère ou un rituel de votre cimetière",
        },
      ),
    ],
  },
  "Esper Sentinel": {
    abilities: [
      // « Leur premier sort non-créature de chaque tour » : condition du déclencheur, pas un « si » revérifié.
      triggered(
        when.castSpell("opponent", NONCREATURE),
        fx.unlessPays(ref.eventPlayer, { genericAmount: amount.powerOf(ref.self) }, fx.draw(1)),
        {
          triggerCondition: cond.not(cond.amountAtLeast(amount.noncreatureCastBy(ref.eventPlayer), 2)),
          label: "Premier sort non-créature d'un adversaire ce tour-ci : piochez, à moins qu'il ne paie {X}",
        },
      ),
    ],
  },
  "Kambal, Consul of Allocation": {
    abilities: [
      triggered(when.castSpell("opponent", NONCREATURE), [fx.loseLife(2, ref.eventPlayer), fx.gainLife(2)], {
        label: "Un adversaire lance un sort non-créature : il perd 2 PV, vous en gagnez 2",
      }),
    ],
  },
  "Lotho, Corrupt Shirriff": {
    abilities: [
      triggered(SECOND_SPELL_ANY, [fx.loseLife(1), fx.createTokens(TREASURE)], {
        label: "Un joueur lance son deuxième sort du tour : perdez 1 PV, créez un Trésor",
      }),
    ],
  },
  "Lyse Hext": {
    abilities: [
      costReducer(NONCREATURE, 1, "Vos sorts non-créature coûtent {1} de moins"),
      staticAbility(
        "self",
        { addKeywords: ["doubleStrike"] },
        {
          condition: cond.amountAtLeast(amount.noncreatureCastBy(ref.you), 2),
          label: "Deux sorts non-créature lancés ce tour-ci : double initiative",
        },
      ),
    ],
  },
  "Orcish Bowmasters": {
    abilities: [
      triggered(when.entersSelf, [fx.damage(1, ref.target()), fx.amass(ref.you, "Orc", 1)], {
        targets: [target.any("t")],
        label: "1 blessure, puis amassez des Orques 1",
      }),
      triggered(when.drawExceptTurnDraw("opponent"), [fx.damage(1, ref.target()), fx.amass(ref.you, "Orc", 1)], {
        targets: [target.any("t")],
        label: "Un adversaire pioche (hors première pioche de son étape de pioche) : 1 blessure, puis amassez des Orques 1",
      }),
    ],
  },
  "Papalymo Totolymo": {
    abilities: [
      triggered(when.castSpell("you", NONCREATURE), [fx.damage(1, ref.eachOpponent), fx.gainLife(1)], {
        label: "Sort non-créature : 1 blessure à chaque adversaire, gagnez 1 PV",
      }),
      activated({
        mana: "{4}",
        tap: true,
        sacrifice: true,
        effects: [
          fx.sacrifice(ref.playersWhere(ref.eachOpponent, cond.lostLife), { types: ["Creature"] }, 1, { greatestPower: true }),
        ],
        label: "Chaque adversaire qui a perdu des PV ce tour-ci sacrifie sa créature de plus grande force",
      }),
    ],
  },
  "Sheoldred, the Apocalypse": {
    abilities: [
      triggered(when.draw(undefined, "you"), [fx.gainLife(2)], { label: "Vous piochez : gagnez 2 PV" }),
      triggered(when.draw(undefined, "opponent"), [fx.loseLife(2, ref.eventPlayer)], {
        label: "Un adversaire pioche : il perd 2 PV",
      }),
    ],
  },
  "Tataru Taru": {
    abilities: [
      triggered(when.entersSelf, [fx.draw(1), ...fx.mayFor(ref.target(), "Piocher une carte ?", fx.draw(1, ref.target()))], {
        targets: [target.player("t", "opponent")],
        label: "Piochez ; l'adversaire ciblé peut piocher",
      }),
      triggered(when.draw(undefined, "opponent"), [fx.createTokens({ ...TREASURE, tapped: true })], {
        condition: notEventPlayersTurn,
        oncePerTurn: true,
        label: "Secrétaire des Héritiers : un adversaire pioche hors de son tour, Trésor engagé (une fois par tour)",
      }),
    ],
  },
  "Irenicus's Vile Duplication": {
    spell: spell(
      [target.creature("t", { controller: "you" })],
      [fx.copyToken(ref.target(), { addKeywords: ["flying"], nonlegendary: true })],
    ),
  },
  // Rebond : mot-clé lu dans le texte.
  "Quantum Misalignment": {
    spell: spell([target.creature("t", { controller: "you" })], [fx.copyToken(ref.target(), { nonlegendary: true })]),
  },
  Mindcrank: {
    abilities: [
      triggered(when.loseLife("opponent"), [fx.mill(amount.eventAmount, ref.eventPlayer)], {
        label: "Un adversaire perd des PV : il meule autant de cartes",
      }),
    ],
  },
  "Bloodchief Ascension": {
    abilities: [
      triggered(when.eachEndStep, fx.may("Mettre un marqueur de quête ?", fx.counters(ref.self, "quest")), {
        condition: opponentLostLife(2),
        label: "Un adversaire a perdu 2 PV ou plus ce tour-ci : marqueur de quête",
      }),
      triggered(
        when.zoneChange(["battlefield", "hand", "library", "stack", "exile", "command"], {
          to: ["graveyard"],
          whose: "opponent",
          filter: { token: false },
        }),
        fx.may("Lui faire perdre 2 PV ?", fx.loseLife(2, ref.eventPlayer), fx.gainLife(2)),
        {
          condition: cond.counterAtLeast("quest", 3),
          label: "Une carte va au cimetière d'un adversaire : il perd 2 PV, vous en gagnez 2",
        },
      ),
    ],
  },
  "Helm of the Ghastlord": {
    enchant: { filter: { types: ["Creature"] }, label: "créature" },
    abilities: [
      staticAbility(
        { attachedToSource: true, colors: ["U"] },
        {
          power: 1,
          toughness: 1,
          addAbilities: [triggered(SELF_DAMAGES_OPPONENT, [fx.draw(1)], { label: "Blessures à un adversaire : piochez" })],
        },
        { label: "Créature enchantée bleue : +1/+1 et pioche" },
      ),
      staticAbility(
        { attachedToSource: true, colors: ["B"] },
        {
          power: 1,
          toughness: 1,
          addAbilities: [
            triggered(SELF_DAMAGES_OPPONENT, [fx.discard(1, ref.eventPlayer)], {
              label: "Blessures à un adversaire : il se défausse",
            }),
          ],
        },
        { label: "Créature enchantée noire : +1/+1 et défausse" },
      ),
    ],
  },
  // Entretien cumulatif {1} : lu dans le texte.
  "Mystic Remora": {
    abilities: [
      triggered(
        when.castSpell("opponent", NONCREATURE),
        [fx.unlessPays(ref.eventPlayer, { mana: "{4}" }, fx.may("Piocher une carte ?", fx.draw(1)))],
        { label: "Un adversaire lance un sort non-créature : vous pouvez piocher, à moins qu'il ne paie {4}" },
      ),
    ],
  },
  "Ophidian Eye": {
    enchant: { filter: { types: ["Creature"] }, label: "créature" },
    abilities: [
      triggered(ENCHANTED_DAMAGES_OPPONENT, fx.may("Piocher une carte ?", fx.draw(1)), {
        label: "La créature enchantée blesse un adversaire : vous pouvez piocher",
      }),
    ],
  },
  Propaganda: {
    abilities: [playerStatic({ attackTax: 2, label: "Vous attaquer : {2} par créature" })],
  },
  "Teferi, Time Raveler": {
    abilities: [
      playerStatic({
        castLimit: { who: "opponents", sorceryTiming: true },
        label: "Vos adversaires ne lancent des sorts qu'au moment d'un rituel",
      }),
      loyalty(1, {
        effects: [fx.untilYourNextTurn({ spellKeywords: { filter: { types: ["Sorcery"] }, keywords: ["flash"] } })],
        label: "Jusqu'à votre prochain tour, vos rituels ont le flash",
      }),
      loyalty(-3, {
        targets: [
          target.upTo(
            1,
            target.permanent("t", ["Artifact", "Creature", "Enchantment"], {}, "artefact, créature ou enchantement"),
          ),
        ],
        effects: [fx.bounce(ref.target()), fx.draw(1)],
        label: "Renvoyez jusqu'à un artefact, une créature ou un enchantement ; piochez",
      }),
    ],
  },
};
