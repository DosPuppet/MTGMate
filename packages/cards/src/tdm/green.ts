/** Tarkir: Dragonstorm — cartes vertes. */
import {
  activated,
  amount,
  BASIC_LAND,
  type CardScript,
  CREATURE_WITH_COUNTER,
  CREATURE_YOU_CONTROL,
  cond,
  DRAGON_CARD,
  devotee,
  dragonstorm,
  fx,
  manaAbility,
  modal,
  mode,
  RELIQUARY_DRAGON,
  ref,
  spell,
  target,
  triggered,
  when,
} from "./common";

export const GREEN: Record<string, CardScript> = {
  "Ainok Wayfarer": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.mill(3, ref.you, { name: "m", filter: { types: ["Land"] } }),
          fx.pickFromZone(
            "graveyard",
            { types: ["Land"] },
            { to: "hand" },
            { count: 1, min: 0, pool: ref.stored("m"), store: "p" },
          ),
          ...fx.when(cond.not(cond.v("p")), fx.addCounters(ref.self, 1)),
        ],
        { label: "Meulez trois cartes : un terrain en main, sinon un marqueur +1/+1" },
      ),
    ],
  },
  "Attuned Hunter": {
    abilities: [
      triggered(when.zoneChange(["graveyard"], { whose: "you" }), [fx.addCounters(ref.self, 1)], {
        condition: cond.yourTurn,
        batched: true,
        label: "Des cartes quittent votre cimetière pendant votre tour : marqueur +1/+1",
      }),
    ],
  },
  "Craterhoof Behemoth": {
    abilities: [
      triggered(
        when.entersSelf,
        [fx.pumpAll(CREATURE_YOU_CONTROL, amount.count(CREATURE_YOU_CONTROL), amount.count(CREATURE_YOU_CONTROL), ["trample"])],
        { label: "Vos créatures gagnent le piétinement et +X/+X" },
      ),
    ],
  },
  "Dragonbroods' Relic": {
    abilities: [
      manaAbility(["W", "U", "B", "R", "G"], 1, { tapAnother: "creature" }),
      activated({
        mana: "{3}{W}{U}{B}{R}{G}",
        sacrifice: true,
        sorcerySpeed: true,
        effects: [fx.createTokens(RELIQUARY_DRAGON)],
        label: "Reliquary Dragon, Dragon 4/4 de toutes les couleurs",
      }),
    ],
  },
  "Encroaching Dragonstorm": {
    abilities: [
      triggered(when.entersSelf, [fx.search(BASIC_LAND, { to: "battlefield", tapped: true }, 2)], {
        label: "Cherchez deux terrains de base, mis engagés",
      }),
      dragonstorm(),
    ],
  },
  "Herd Heirloom": {
    abilities: [
      manaAbility(["W", "U", "B", "R", "G"], 1, { restriction: { spell: { types: ["Creature"] } } }),
      activated({
        tap: true,
        targets: [target.creature("t", { controller: "you", minPower: 4 })],
        effects: [
          fx.modify(ref.target(), {
            addKeywords: ["trample"],
            addAbilities: [triggered(when.combatDamageToPlayer, [fx.draw(1)], { label: "Blesse un joueur : piochez" })],
          }),
        ],
        label: "Piétinement et « blesse un joueur : piochez »",
      }),
    ],
  },
  "Knockout Maneuver": {
    spell: spell(
      [target.creature("a", { controller: "you" }), target.creature("b", { controller: "opponent" })],
      [fx.addCounters(ref.target("a"), 1), fx.damage(amount.powerOf(ref.target("a")), ref.target("b"), ref.target("a"))],
    ),
  },
  "Krotiq Nestguard": {
    abilities: [
      activated({
        mana: "{2}{G}",
        effects: [fx.modify(ref.self, { addKeywords: ["attacksDespiteDefender"] })],
        label: "Peut attaquer ce tour-ci malgré le défenseur",
      }),
    ],
  },
  "Nature's Rhythm": {
    spell: spell([], [fx.search({ types: ["Creature"], maxManaValueX: true }, { to: "battlefield" })]),
  },
  "Piercing Exhale": {
    // « Vous pouvez contempler un Dragon » en coût additionnel : vérifié à la résolution.
    spell: spell(
      [target.creature("a", { controller: "you" }), target.creatureOrPlaneswalker("b")],
      [
        fx.damage(amount.powerOf(ref.target("a")), ref.target("b"), ref.target("a")),
        ...fx.when(cond.behold(DRAGON_CARD), fx.surveil(2)),
      ],
    ),
  },
  "Rainveil Rejuvenator": {
    abilities: [
      triggered(when.entersSelf, fx.may("meuler trois cartes ?", fx.mill(3)), { label: "Vous pouvez meuler trois cartes" }),
      manaAbility("G", 1, { selfPower: true }),
    ],
  },
  "Rite of Renewal": {
    // Les cartes mélangées viennent d'un même cimetière ; leur propriétaire les mélange dans sa bibliothèque.
    spell: spell(
      [
        target.upTo(2, target.cardInGraveyard("p", { permanent: true }, "you", "carte de permanent de votre cimetière")),
        target.player("pl"),
        { ...target.upTo(4, target.cardInGraveyard("c", {}, "any", "carte du cimetière du joueur ciblé")), samePlayer: true },
      ],
      [fx.toHand(ref.target("p")), fx.moveTo(ref.target("c"), { to: "libraryTop", shuffle: true }), fx.exileOnResolve],
    ),
  },
  "Roamer's Routine": { spell: spell([], [fx.search(BASIC_LAND, { to: "battlefield", tapped: true })]) },
  "Sarkhan's Resolve": {
    spell: modal(
      mode("+3/+3", [target.creature()], [fx.pump(ref.target(), 3, 3)]),
      mode("Détruisez une créature avec le vol", [target.creature("d", { keyword: "flying" })], [fx.destroy(ref.target("d"))]),
    ),
  },
  "Sultai Devotee": { abilities: [devotee(["B", "G", "U"])] },
  "Synchronized Charge": {
    spell: spell(
      [target.between(1, 2, target.creature("t", { controller: "you" }))],
      [fx.countersDivided(2, ref.target()), fx.modifyAll(CREATURE_WITH_COUNTER, { addKeywords: ["vigilance", "trample"] })],
    ),
  },
  "Trade Route Envoy": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          ...fx.when(cond.controls(CREATURE_WITH_COUNTER), fx.draw(1)),
          ...fx.when(cond.not(cond.controls(CREATURE_WITH_COUNTER)), fx.addCounters(ref.self, 1)),
        ],
        { label: "Une créature à marqueur : piochez ; sinon marqueur +1/+1" },
      ),
    ],
  },
  "Traveling Botanist": {
    abilities: [
      triggered(
        when.tapsSelf,
        [
          fx.lookAtTop(1, { filter: { types: ["Land"] }, count: 1, to: { to: "hand" }, rest: "top", store: "h" }),
          ...fx.when(cond.not(cond.v("h")), fx.lookAtTop(1, { count: 1, to: { to: "graveyard" }, rest: "top" })),
        ],
        { label: "Regardez la carte du dessus : un terrain en main, sinon au cimetière si vous voulez" },
      ),
    ],
  },
  "Undergrowth Leopard": {
    abilities: [
      activated({
        mana: "{1}",
        sacrifice: true,
        targets: [target.permanent("t", ["Artifact", "Enchantment"], {}, "artefact ou enchantement")],
        effects: [fx.destroy(ref.target())],
        label: "Détruisez un artefact ou un enchantement",
      }),
    ],
  },
};
