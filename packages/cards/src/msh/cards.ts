/**
 * Marvel Super Heroes — cartes des decks du méta (phase 1 du plan P4). Le Travail d'équipe (Teamwork) est lu dans le
 * texte (`scryfall.ts` : kicker « engagez des créatures de force totale N »). L'extension n'est pas encore couverte en
 * entier.
 */
import {
  activated,
  amount,
  BASIC_LAND,
  type CardScript,
  cond,
  DOOMBOT,
  doubler,
  fx,
  manaAbility,
  modal,
  mode,
  playerStatic,
  ref,
  spell,
  staticAbility,
  target,
  triggered,
  when,
} from "./common";

export const CARDS: Record<string, CardScript> = {
  // --- Lot M2 -----------------------------------------------------------------
  "Hidden Lair": {
    abilities: [
      manaAbility("C"),
      manaAbility(["U", "B"], 1, {
        condition: cond.any(cond.sourceMatches({ enteredThisTurn: true }), cond.controls({ types: ["Land"], basic: true })),
      }),
    ],
  },
  "The Wondrous Wasp": {
    abilities: [
      triggered(when.entersSelf, [fx.tap(ref.target()), fx.modifyWhileSource(ref.target(), { loseAllAbilities: true })], {
        targets: [target.upTo(1, target.creature())],
        label: "Engage une créature, qui perd ses capacités",
      }),
    ],
  },
  "We Say Thee Nay!": {
    spell: spell(
      [target.spell()],
      fx.unlessPays(ref.controllerOf(ref.target()), { genericAmount: amount.kicked(4, 2) }, fx.counter(ref.target())),
    ),
  },
  "Wolverine, Fierce Fighter": {
    keywords: ["damageHealsFirst"],
    abilities: [
      triggered(when.entersSelf, [fx.fight(ref.self, ref.target())], {
        targets: [target.upTo(1, target.creature("t", { other: true }))],
        label: "Se bat contre une autre créature",
      }),
    ],
  },

  // --- Lot M3 -----------------------------------------------------------------
  "M.O.D.O.K.": {
    abilities: [
      activated({ payLife: 3, activationCondition: cond.yourTurn, effects: [fx.connive(ref.self)], label: "Complote (3 PV)" }),
      staticAbility(
        { types: ["Creature"], controller: "opponent" },
        { power: -1, toughness: -1 },
        {
          label: "Les créatures adverses ont -1/-1",
        },
      ),
    ],
  },
  "Captain Marvel, Earth's Protector": {
    abilities: [
      activated({
        mana: "{5}{W}{W}",
        powerUp: true,
        effects: [fx.addCounters(ref.self, 1), fx.counters(ref.self, "indestructible")],
        label: "Montée en puissance : marqueurs +1/+1 et indestructible",
      }),
    ],
  },

  // --- Lot M4 -----------------------------------------------------------------
  "Thor, God of Thunder": {
    abilities: [
      triggered(
        when.entersSelf,
        [fx.exileCard(ref.target(), { name: "t" }), fx.grantPlay(ref.stored("t"), { untilYourNextTurn: true })],
        {
          targets: [
            target.cardInGraveyard(
              "t",
              { anyOf: [{ subtype: "Equipment" }, { types: ["Instant"] }, { types: ["Sorcery"] }] },
              "you",
              "carte d'Équipement, d'éphémère ou de rituel de votre cimetière",
            ),
          ],
          label: "Exile une carte : jouable jusqu'à la fin de votre prochain tour",
        },
      ),
      triggered(
        when.castSpell("you", { notTypes: ["Creature"] }),
        [fx.damage(amount.manaValueOf(ref.eventObject), ref.target())],
        {
          targets: [target.any()],
          label: "Blessures égales à la valeur de mana du sort",
        },
      ),
    ],
  },
  "The Mind Stone": {
    abilities: [
      manaAbility("W"),
      activated({ mana: "{5}{W}", tap: true, effects: [fx.harness], label: "Exploiter la Gemme de l'Esprit" }),
      triggered(when.yourEndStep, [fx.exileCard(ref.target(), { name: "f" }), fx.toBattlefield(ref.stored("f"))], {
        condition: cond.harnessed,
        targets: [target.upTo(1, target.nonland("t", { controller: "you", other: true }))],
        label: "∞ — Exile puis renvoie un permanent non-terrain",
      }),
    ],
  },
  "Castle Doom": {
    abilities: [
      manaAbility("C"),
      manaAbility(["W", "U", "B", "R", "G"], 1, { restriction: { spell: { types: ["Artifact"] } } }),
      activated({
        mana: "{3}",
        tap: true,
        sacrificeOther: { filter: { types: ["Artifact"] } },
        sorcerySpeed: true,
        effects: [fx.createTokens(DOOMBOT)],
        label: "Un Doombot 3/3",
      }),
    ],
  },

  // --- Lot M5 -----------------------------------------------------------------
  "Mjölnir, Hammer of Thor": {
    // Équiper digne {1} : lu dans le texte.
    abilities: [
      triggered(when.entersSelf, [fx.damage(4, ref.target())], {
        targets: [target.upTo(1, target.creature())],
        label: "4 blessures",
      }),
      doubler({ damageFilter: { attachedToSource: true }, label: "Double les blessures de la créature équipée" }),
      activated({
        mana: "{2}{R}",
        fromHand: true,
        discardSelf: true,
        effects: [fx.damageAll(2, { types: ["Creature"] })],
        label: "2 blessures à chaque créature",
      }),
    ],
  },
  "Political Triumph": {
    abilities: [
      triggered(when.enters({ types: ["Creature"], controller: "you" }), [fx.scry(1), fx.counters(ref.self, "plan")], {
        label: "Regard 1, un marqueur de plan",
      }),
      triggered(
        when.countersPut("self", "plan"),
        [fx.sacrificeIt(ref.self), fx.draw(1), fx.addCountersAll({ types: ["Creature"], controller: "you" }, 1)],
        {
          condition: cond.counterAtLeast("plan", 4),
          label: "Quatrième marqueur : sacrifiez-le, piochez, +1/+1 sur vos créatures",
        },
      ),
    ],
  },

  // --- Lot M6 -----------------------------------------------------------------
  "Avengers Disassembled": {
    spell: modal(
      mode("3 blessures à chaque créature", [], [fx.damageAll(3, { types: ["Creature"] })]),
      mode(
        "Détruit un terrain",
        [target.permanent("t", ["Land"])],
        [fx.destroy(ref.target()), fx.search(BASIC_LAND, { to: "battlefield", tapped: true }, 1, ref.controllerOf(ref.target()))],
      ),
      mode(
        "Les deux",
        [target.permanent("t", ["Land"])],
        [
          fx.damageAll(3, { types: ["Creature"] }),
          fx.destroy(ref.target()),
          fx.search(BASIC_LAND, { to: "battlefield", tapped: true }, 1, ref.controllerOf(ref.target())),
        ],
      ),
    ),
  },
  "Doctor Doom": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(DOOMBOT, 2)], { label: "Deux Doombots 3/3" }),
      staticAbility(
        "self",
        { addKeywords: ["indestructible"] },
        {
          condition: cond.any(
            cond.controls({ types: ["Artifact"], anyOf: [{ types: ["Creature"] }] }),
            cond.controls({ subtype: "Plan" }),
          ),
          label: "Indestructible avec une créature-artefact ou un Plan",
        },
      ),
      triggered(when.yourEndStep, [fx.draw(1), fx.loseLife(1)], { label: "Piochez, perdez 1 PV" }),
    ],
  },
  "Gleaming Bastion": {
    abilities: [
      manaAbility("C"),
      manaAbility(["W", "U"], 1, {
        condition: cond.any(cond.sourceMatches({ enteredThisTurn: true }), cond.controls({ types: ["Land"], basic: true })),
      }),
    ],
  },
  "Jennifer Walters": {
    abilities: [
      playerStatic({ castLimit: { who: "opponents", during: "yourTurn" } }),
      activated({ mana: "{3}{G}{W}{W}", sorcerySpeed: true, effects: [fx.transform(ref.self)], label: "Transformez-la" }),
    ],
  },
  "The Sensational She-Hulk": {
    abilities: [
      playerStatic({ castLimit: { who: "opponents", during: "yourTurn" } }),
      triggered(
        when.dealtDamage({ types: ["Creature"], controller: "you" }),
        fx.may("Infliger autant de blessures à une cible ?", fx.damage(amount.eventAmount, ref.target())),
        { oncePerTurn: true, targets: [target.any()], label: "Autant de blessures à n'importe quelle cible" },
      ),
    ],
  },
};
