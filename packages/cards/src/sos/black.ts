/** Secrets of Strixhaven — cartes noires. */
import type { ObjectFilter } from "@mtgx/engine";
import {
  activated,
  amount,
  type CardScript,
  cond,
  entersWith,
  fx,
  INFUSION,
  INKLING,
  INSTANT_SORCERY,
  PEST,
  REPARTEE,
  ref,
  spell,
  staticAbility,
  target,
  triggered,
  when,
} from "./common";

const CREATURE: ObjectFilter = { types: ["Creature"] };

export const BLACK: Record<string, CardScript> = {
  "Adventurous Eater": {
    // Have a Bite.
    prepareSpell: spell([target.creature()], [fx.addCounters(ref.target(), 1), fx.gainLife(1)]),
    abilities: [entersWith({ prepared: true })],
  },
  "Arcane Omens": {
    // Convergence : X = couleurs de mana dépensées.
    spell: spell([target.player()], [fx.discard(amount.colorsSpent, ref.target())]),
  },
  "Arnyn, Deathbloom Botanist": {
    abilities: [
      triggered(
        when.dies({ types: ["Creature"], controller: "you", anyOf: [{ maxPower: 1 }, { maxToughness: 1 }] }),
        [fx.loseLife(2, ref.target()), fx.gainLife(2)],
        {
          targets: [target.player("t", "opponent")],
          label: "Une petite créature meurt : un adversaire perd 2 PV, vous gagnez 2 PV",
        },
      ),
    ],
  },
  "Burrog Banemaker": {
    abilities: [activated({ mana: "{1}{B}", effects: [fx.pump(ref.self, 1, 1)], label: "+1/+1 jusqu'à la fin du tour" })],
  },
  "Cheerful Osteomancer": {
    // Raise Dead.
    prepareSpell: spell(
      [target.cardInGraveyard("t", CREATURE, "you", "carte de créature de votre cimetière")],
      [fx.toHand(ref.target())],
    ),
    abilities: [entersWith({ prepared: true })],
  },
  "Cost of Brilliance": {
    spell: spell(
      [target.player("p"), target.upTo(1, target.creature("c"))],
      [fx.draw(2, ref.target("p")), fx.loseLife(2, ref.target("p")), fx.addCounters(ref.target("c"), 1)],
    ),
  },
  "Emeritus of Woe": {
    // Demonic Tutor.
    prepareSpell: spell([], [fx.search({}, { to: "hand" })]),
    abilities: [
      entersWith({ prepared: true }),
      triggered(when.yourEndStep, [fx.prepare(ref.self)], {
        condition: cond.creaturesDied(2),
        label: "Deux créatures mortes ce tour-ci : devient préparée",
      }),
    ],
  },
  "End of the Hunt": {
    // L'adversaire choisit parmi ses créatures et planeswalkers de plus grande valeur de mana, et l'exile.
    spell: spell(
      [target.player("t", "opponent")],
      [fx.sacrifice(ref.target(), { types: ["Creature", "Planeswalker"] }, 1, { greatestManaValue: true, to: "exile" })],
    ),
  },
  "Eternal Student": {
    abilities: [
      activated({
        mana: "{1}{B}",
        fromGraveyard: true,
        exileSelf: true,
        effects: [fx.createTokens(INKLING, 2)],
        label: "Deux Inklings 1/1 volants",
      }),
    ],
  },
  "Foolish Fate": {
    // La perte de PV est appliquée avant la destruction : rien ne s'intercale pendant la résolution, et le contrôleur
    // est ainsi lu sur le champ de bataille (il perd les PV même si la créature n'est pas détruite, comme le dit l'Oracle).
    spell: spell(
      [target.creature()],
      [...fx.when(INFUSION, fx.loseLife(3, ref.controllerOf(ref.target()))), fx.destroy(ref.target())],
    ),
  },
  "Forum Necroscribe": {
    // Garde (défausser une carte) : lue dans le texte.
    abilities: [
      triggered(REPARTEE, [fx.toBattlefield(ref.target())], {
        targets: [target.cardInGraveyard("t", CREATURE, "you", "carte de créature de votre cimetière")],
        label: "Repartee : renvoie une créature de votre cimetière sur le champ de bataille",
      }),
    ],
  },
  "Grave Researcher": {
    // Reanimate : la perte de PV est lue avant le déplacement (la carte devient un nouvel objet en arrivant).
    prepareSpell: spell(
      [target.cardInGraveyard("t", CREATURE, "any", "carte de créature d'un cimetière")],
      [fx.loseLife(amount.manaValueOf(ref.target())), fx.toBattlefield(ref.target(), { underYourControl: true })],
    ),
    abilities: [
      triggered(
        when.yourUpkeep,
        [fx.surveil(1), ...fx.when(cond.amountAtLeast(amount.countIn("graveyard", CREATURE), 3), fx.prepare(ref.self))],
        { label: "Surveillance 1 ; trois cartes de créature au cimetière : devient préparée" },
      ),
    ],
  },
  "Lecturing Scornmage": {
    abilities: [triggered(REPARTEE, [fx.addCounters(ref.self, 1)], { label: "Repartee : un marqueur +1/+1" })],
  },
  "Leech Collector": {
    // Bloodletting.
    prepareSpell: spell([], [fx.loseLife(2, ref.eachOpponent)]),
    abilities: [
      triggered(when.gainLifeFirst, [fx.prepare(ref.self)], {
        label: "Premiers PV gagnés ce tour-ci : devient préparée",
      }),
    ],
  },
  "Masterful Flourish": {
    spell: spell([target.creature("t", { controller: "you" })], [fx.pump(ref.target(), 1, 0, ["indestructible"])]),
  },
  "Melancholic Poet": {
    abilities: [triggered(REPARTEE, fx.drain(1), { label: "Repartee : chaque adversaire perd 1 PV, vous gagnez 1 PV" })],
  },
  "Poisoner's Apprentice": {
    abilities: [
      triggered(when.entersSelf, fx.when(INFUSION, fx.pump(ref.target(), -4, -4)), {
        targets: [target.creature("t", { controller: "opponent" })],
        label: "Infusion : une créature adverse prend -4/-4",
      }),
    ],
  },
  "Postmortem Professor": {
    keywords: ["cantBlock"],
    abilities: [
      triggered(when.attacksSelf, fx.drain(1), { label: "Chaque adversaire perd 1 PV, vous gagnez 1 PV" }),
      activated({
        mana: "{1}{B}",
        fromGraveyard: true,
        exileFromGraveyard: { filter: INSTANT_SORCERY },
        effects: [fx.toBattlefield(ref.self)],
        label: "Revient du cimetière sur le champ de bataille",
      }),
    ],
  },
  "Pull from the Grave": {
    spell: spell(
      [target.upTo(2, target.cardInGraveyard("t", CREATURE, "you", "carte de créature de votre cimetière"))],
      [fx.toHand(ref.target()), fx.gainLife(2)],
    ),
  },
  "Rabid Attack": {
    spell: spell(
      [target.upTo(99, target.creature("t", { controller: "you" }))],
      [
        fx.modify(ref.target(), {
          power: 1,
          addAbilities: [triggered(when.diesSelf, [fx.draw(1)], { label: "Piochez une carte" })],
        }),
      ],
    ),
  },
  "Scathing Shadelock": {
    // Venomous Words.
    prepareSpell: spell([target.creature("t", { controller: "you" })], [fx.pump(ref.target(), 2, 0, ["deathtouch"])]),
    abilities: [
      triggered(when.step("main1", "you"), [fx.prepare(ref.self)], {
        label: "Première phase principale : devient préparée",
      }),
    ],
  },
  "Scheming Silvertongue": {
    // Sign in Blood.
    prepareSpell: spell([target.player()], [fx.draw(2, ref.target()), fx.loseLife(2, ref.target())]),
    abilities: [
      triggered(when.secondMain, [fx.prepare(ref.self)], {
        condition: cond.lifeGainedAtLeast(2),
        label: "Deux PV gagnés ou plus ce tour-ci : devient préparée",
      }),
    ],
  },
  "Send in the Pest": {
    spell: spell([], [fx.discard(1, ref.eachOpponent), fx.createTokens(PEST)]),
  },
  "Sneering Shadewriter": {
    abilities: [triggered(when.entersSelf, fx.drain(2), { label: "Chaque adversaire perd 2 PV, vous gagnez 2 PV" })],
  },
  "Tragedy Feaster": {
    // Garde (défausser une carte) : lue dans le texte.
    abilities: [
      triggered(when.yourEndStep, fx.when(cond.not(INFUSION), fx.sacrifice(ref.you, {}, 1)), {
        label: "Infusion : sacrifiez un permanent, sauf si vous avez gagné des PV",
      }),
    ],
  },
  "Ulna Alley Shopkeep": {
    abilities: [staticAbility("self", { power: 2 }, { condition: INFUSION, label: "Infusion : +2/+0" })],
  },
  "Wander Off": {
    spell: spell([target.creature()], [fx.exile(ref.target())]),
  },
  "Withering Curse": {
    spell: spell(
      [],
      [...fx.when(cond.not(INFUSION), fx.pumpAll(CREATURE, -2, -2)), ...fx.when(INFUSION, fx.destroyAll(CREATURE))],
    ),
  },
  "Pox Plague": {
    spell: spell(
      [],
      [
        fx.loseHalfLife(ref.eachPlayer),
        fx.discard(0, ref.eachPlayer, { half: true }),
        fx.sacrifice(ref.eachPlayer, { permanent: true }, 0, { half: true }),
      ],
    ),
  },
};
