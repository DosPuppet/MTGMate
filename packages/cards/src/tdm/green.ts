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
  renew,
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

  // --- Lot B ------------------------------------------------------------------
  "Bloomvine Regent": {
    abilities: [
      triggered(when.enters({ subtype: "Dragon", controller: "you" }), [fx.gainLife(3)], {
        label: "Lui ou un autre de vos Dragons arrive : gagnez 3 PV",
      }),
    ],
  },
  "Claim Territory": {
    // « Jusqu'à deux Forêts de base : l'une en jeu engagée, l'autre en main » : deux recherches successives.
    spell: spell(
      [],
      [
        fx.search({ types: ["Land"], basic: true, subtype: "Forest" }, { to: "battlefield", tapped: true }),
        fx.search({ types: ["Land"], basic: true, subtype: "Forest" }, { to: "hand" }),
      ],
    ),
  },
  "Champion of Dusan": {
    abilities: [
      renew(
        "{1}{G}",
        [target.creature()],
        [fx.addCounters(ref.target(), 1), fx.counters(ref.target(), "trample")],
        "marqueur +1/+1 et marqueur de piétinement",
      ),
    ],
  },
  "Dusyut Earthcarver": { abilities: [triggered(when.entersSelf, [fx.endure(ref.self, 3)], { label: "Endurance 3" })] },
  "Inspirited Vanguard": {
    abilities: [
      triggered(when.entersSelf, [fx.endure(ref.self, 2)], { label: "Endurance 2" }),
      triggered(when.attacksSelf, [fx.endure(ref.self, 2)], { label: "Endurance 2" }),
    ],
  },
  "Lasyd Prowler": {
    abilities: [
      triggered(
        when.entersSelf,
        fx.may(
          "meuler autant de cartes que vous contrôlez de terrains ?",
          fx.mill(amount.count({ types: ["Land"], controller: "you" })),
        ),
        { label: "Vous pouvez meuler autant de cartes que de terrains" },
      ),
      renew(
        "{1}{G}",
        [target.creature()],
        [fx.addCounters(ref.target(), amount.countIn("graveyard", { types: ["Land"] }))],
        "X marqueurs +1/+1 (cartes de terrain de votre cimetière)",
      ),
    ],
  },
  "Sage of the Fang": {
    abilities: [
      triggered(when.entersSelf, [fx.addCounters(ref.target(), 1)], {
        targets: [target.creature()],
        label: "Marqueur +1/+1 sur une créature",
      }),
      renew(
        "{3}{G}",
        [target.creature()],
        [fx.addCounters(ref.target(), 1), fx.doubleCounters(ref.target())],
        "marqueur +1/+1, puis doublez ses marqueurs +1/+1",
      ),
    ],
  },
  "Sagu Pummeler": {
    abilities: [
      renew(
        "{4}{G}",
        [target.creature()],
        [fx.addCounters(ref.target(), 2), fx.counters(ref.target(), "reach")],
        "deux marqueurs +1/+1 et un marqueur de portée",
      ),
    ],
  },
  "Sagu Wildling": { abilities: [triggered(when.entersSelf, [fx.gainLife(3)], { label: "Gagnez 3 PV" })] },
  "Roost Seek": { spell: spell([], [fx.search(BASIC_LAND)]) },
  "Warden of the Grove": {
    abilities: [
      triggered(when.yourEndStep, [fx.addCounters(ref.self, 1)], { label: "Marqueur +1/+1" }),
      triggered(
        when.enters({ types: ["Creature"], controller: "you", nontoken: true, other: true }),
        [fx.endure(ref.eventObject, amount.countersOn(ref.self, "any"))],
        { label: "Une autre de vos créatures non-jeton arrive : elle endure X (marqueurs sur Warden)" },
      ),
    ],
  },
  "Disruptive Stormbrood": {
    abilities: [
      triggered(when.entersSelf, [fx.destroy(ref.target())], {
        targets: [target.optional(target.permanent("t", ["Artifact", "Enchantment"], {}, "artefact ou enchantement"))],
        label: "Détruisez jusqu'à un artefact ou un enchantement",
      }),
    ],
  },
  "Petty Revenge": { spell: spell([target.creature("t", { maxPower: 3 })], [fx.destroy(ref.target())]) },
};
