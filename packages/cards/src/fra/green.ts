import type { Effect } from "@mtgx/engine";
/** Reality Fracture — cartes vertes. */
import {
  activated,
  amount,
  BASIC_LAND,
  BEAST_TRAMPLE,
  type CardScript,
  CREATURE_YOU_CONTROL,
  cond,
  empower,
  entersWith,
  FOREST_TENTACLE,
  fx,
  HEARTWOOD,
  loyalty,
  MOWU,
  manaAbility,
  modal,
  mode,
  ref,
  SOUL_TETHER,
  spell,
  staticAbility,
  target,
  targetObj,
  triggered,
  triggeredModal,
  walkersHave,
  when,
} from "./common";

/** « {1}, sacrifiez un autre artefact : marqueur +1/+1, gagne [capacité] » (un choix par capacité activée). */
const puppetbeastBoost = (kw: "trample" | "hexproof" | "haste", label: string) =>
  activated({
    mana: "{1}",
    sacrificeOther: { filter: { types: ["Artifact"], controller: "you", other: true } },
    effects: [fx.addCounters(ref.self, 1), fx.modify(ref.self, { addKeywords: [kw] })],
    label: `Marqueur +1/+1 et ${label}`,
  });

export const GREEN: Record<string, CardScript> = {
  "Bestial Incursion": { flashback: "{5}{G}", spell: spell([], [fx.createTokens(BEAST_TRAMPLE)]) },
  "Budding Insurgent": {
    abilities: [
      activated({
        sacrifice: true,
        sorcerySpeed: true,
        targets: [targetObj("t", { anyOf: [{ types: ["Artifact"] }, { types: ["Enchantment"] }] }, "artefact ou enchantement")],
        effects: [
          ...fx.when(cond.refMatches(ref.target(), { types: ["Enchantment"], legendary: true }), fx.draw(1)),
          fx.destroy(ref.target()),
        ],
        label: "Détruire un artefact ou un enchantement",
      }),
    ],
  },
  "Greenhouse Propagator": {
    abilities: [
      triggered(when.enters({ types: ["Creature"], controller: "you", other: true }), [fx.gainLife(1)], { label: "+1 PV" }),
    ],
  },
  "Hungering Puppetbeast": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(HEARTWOOD)], { label: "Heartwood" }),
      puppetbeastBoost("trample", "piétinement"),
      puppetbeastBoost("hexproof", "défense talismanique"),
      puppetbeastBoost("haste", "célérité"),
    ],
  },
  "Hunter's Axe": {
    abilities: [
      staticAbility(
        "attached",
        {
          power: 2,
          addAbilities: [
            triggeredModal(when.attacksSelf, [
              mode("Piétinement", [], [fx.modify(ref.self, { addKeywords: ["trample"] })]),
              mode("Contact mortel", [], [fx.modify(ref.self, { addKeywords: ["deathtouch"] })]),
            ]),
          ],
        },
        { label: "+2/+0, piétinement ou contact mortel en attaquant" },
      ),
    ],
  },
  "Puppet Crafting": {
    enchant: {
      filter: { anyOf: [{ types: ["Artifact"] }, { types: ["Enchantment"], notSubtype: "Aura" }] },
      label: "artefact ou enchantement non-Aura",
    },
    abilities: [
      staticAbility(
        "attached",
        { addTypes: ["Creature"], addSubtypes: ["Construct"], setPower: 5, setToughness: 5 },
        { label: "Créature Construct 5/5" },
      ),
      activated({ mana: "{4}{G}", fromGraveyard: true, effects: [fx.toHand(ref.self)], label: "Revenir en main" }),
    ],
  },
  "Restore with Empathy": {
    spell: spell(
      [target.cardInGraveyard("t", { permanent: true }, "you", "carte de permanent de votre cimetière")],
      [fx.toHand(ref.target()), fx.gainLife(4)],
    ),
  },
  "Simulacrum Shaper": {
    abilities: [
      triggered(
        when.entersSelf,
        fx.may("Chercher un terrain de base ?", fx.search(BASIC_LAND, { to: "battlefield", tapped: true })),
        { label: "terrain de base engagé" },
      ),
      triggered(when.diesSelf, [fx.draw(1)], { label: "piochez une carte" }),
    ],
  },
  "Something Worth Saving": {
    // Approximation : les cartes sont regardées puis mises au cimetière (pas un « meule » au sens strict).
    spell: spell([], [fx.lookAtTop(4, { filter: { permanent: true }, count: 1, rest: "graveyard" }), fx.gainLife(1)]),
  },
  "Tethermage's Advantage": {
    spell: spell([target.creature("t")], [fx.pump(ref.target(), 2, 2, ["reach"]), fx.untap(ref.target())]),
  },
  "Verdant Kraken": {
    abilities: [triggered(when.step("upkeep", "any"), [fx.createTokens(FOREST_TENTACLE)], { label: "Forêt Tentacule" })],
  },
  "Wrecking Gecko": {
    abilities: [activated({ mana: "{6}{G}{G}", effects: [fx.pump(ref.self, 4, 4, ["trample"])], label: "+4/+4 et piétinement" })],
  },
  "Edgar, Moonlit Sovereign": {
    abilities: [
      triggered(when.yourEndStep, [fx.addCounters(ref.self, 2)], {
        condition: cond.not(cond.castThisTurn(1)),
        label: "Aucun sort ce tour-ci : deux marqueurs",
      }),
      activated({
        mana: "{4}{G}",
        effects: [fx.addCountersAll({ types: ["Creature"], controller: "you", withCounter: "+1/+1" }, 1)],
        label: "Marqueur sur chaque créature qui en a déjà",
      }),
    ],
  },
  "Ghalta the Unstoppable": {
    costReduction: { generic: amount.maxPower(CREATURE_YOU_CONTROL) },
    abilities: [
      staticAbility(
        { types: ["Creature"], controller: "you", other: true },
        { addKeywords: ["trample"] },
        { label: "Piétinement" },
      ),
    ],
  },
  "Jiang Yanggu, Never Alone": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(MOWU)], { label: "Mowu" }),
      triggered(when.yourEndStep, [fx.untapUpTo({ token: true, controller: "you" }, 99)], { label: "dégage vos jetons" }),
    ],
  },
  "Marwyn, the Preserver": {
    abilities: [
      staticAbility({ types: ["Land"], controller: "you" }, { addKeywords: ["hexproof"] }, { label: "Défense talismanique" }),
      activated({
        mana: "{2}",
        targets: [target.cardInGraveyard("t", { types: ["Land"] }, "you", "carte de terrain de votre cimetière")],
        effects: [fx.toHand(ref.target())],
        label: "Récupérer un terrain",
      }),
    ],
  },
  "Pia, Aether Ascetic": {
    abilities: [
      triggered(
        when.entersSelf,
        [fx.discard(1, ref.you, { optional: true, store: "d" }), ...fx.when(cond.v("d"), fx.search({ types: ["Enchantment"] }))],
        { label: "défausser : chercher un enchantement" },
      ),
    ],
  },
  "Yoshimaru, Scrappy Stray": {
    abilities: [
      triggered(when.entersSelf, [fx.fight(ref.target("a"), ref.target("b"))], {
        targets: [
          target.creature("a", { controller: "you", other: true }),
          target.upTo(1, target.creature("b", { controller: "opponent" })),
        ],
        label: "combat",
      }),
      activated({
        mana: "{6}",
        targets: [target.creature("t", { legendary: false })],
        effects: [fx.addCounters(ref.target(), 1)],
        label: "Marqueur sur une créature non légendaire",
      }),
    ],
  },
  "Vinelasher Adept": {
    abilities: [
      triggered(when.entersSelf, [fx.addCounters(ref.target(), 3)], {
        targets: [target.creature("t")],
        label: "trois marqueurs",
      }),
    ],
  },
  "Sureshot Sower": {
    abilities: [
      activated({
        mana: "{3}{G}",
        fromHand: true,
        discardSelf: true,
        targets: [target.creature("t", { keyword: "flying" })],
        effects: [fx.destroy(ref.target())],
        label: "Défaussez : détruire une créature volante",
      }),
    ],
  },
  "Fblthp, Knows the Way": {
    cdaPower: amount.basicLandTypes,
    abilities: [
      triggered(when.entersSelf, [{ ...fx.search(BASIC_LAND, { to: "hand" }, amount.x), distinctNames: true } as Effect], {
        label: "jusqu'à X terrains de base de noms différents",
      }),
    ],
  },
  "Titanbones, Towering Heart": {
    abilities: [
      triggered(when.gainLife, [fx.addCounters(ref.self, 2)], { label: "deux marqueurs +1/+1" }),
      triggered(when.discardSelf, [fx.gainLife(3)], { fromGraveyard: true, label: "défaussée : +3 PV" }),
    ],
  },
  "Carnivorous Cultivator": {
    prepareSpell: spell([], [fx.search({ types: ["Land"] }, { to: "graveyard" })]),
    abilities: [
      entersWith({ prepared: true }),
      triggered(when.combatDamageToPlayer, [fx.toHand(ref.target())], {
        targets: [target.cardInGraveyard("t", { types: ["Land"] }, "you", "carte de terrain de votre cimetière")],
        label: "récupère un terrain",
      }),
    ],
  },
  "Heartwood Crafter": {
    prepareSpell: SOUL_TETHER,
    abilities: [entersWith({ prepared: true }), manaAbility("C", 1, { restriction: { notSpellFromHand: true } })],
  },
  "Arcane Amphisbaena": { abilities: [triggered(when.entersSelf, [empower(2)], { label: "Renforcez Jace 2" })] },
  "Inspired Tethermage": {
    abilities: [
      triggered(when.countersPut({ types: ["Planeswalker"], controller: "you" }, "loyalty"), [fx.addCounters(ref.self, 1)], {
        label: "marqueur +1/+1",
      }),
      activated({ mana: "{6}", effects: [empower(2)], label: "Renforcez Jace 2" }),
    ],
  },
  "Way of the Paradox": {
    abilities: [
      triggered(when.entersSelf, [empower(5)], { label: "Renforcez Jace 5" }),
      triggered(when.loyaltyActivated(), [fx.gainLife(1), fx.extraLandThisTurn], { label: "+1 PV, terrain supplémentaire" }),
    ],
  },
  "Way of the Wildspeaker": {
    abilities: [
      triggered(when.entersSelf, [empower(7)], { label: "Renforcez Jace 7" }),
      walkersHave(loyalty(-4, { effects: [fx.createTokens(BEAST_TRAMPLE)], label: "Bête 4/4" }), "Planeswalkers : [−4] Bête"),
    ],
  },
  "Compel Brutality": {
    spell: modal(
      mode(
        "Votre créature inflige des blessures égales à sa force",
        [target.creature("a", { controller: "you" }), target.creatureOrPlaneswalker("b", { controller: "opponent" })],
        [fx.damage(amount.powerOf(ref.target("a")), ref.target("b"), ref.target("a"))],
      ),
      mode(
        "Votre planeswalker inflige des blessures égales à sa loyauté",
        [
          targetObj("a", { types: ["Planeswalker"], controller: "you" }, "planeswalker que vous contrôlez"),
          target.creatureOrPlaneswalker("b", { controller: "opponent" }),
        ],
        [fx.damage(amount.countersOn(ref.target("a"), "loyalty"), ref.target("b"), ref.target("a"))],
      ),
    ),
  },
  "Flourishing Grapple": {
    spell: spell(
      [
        target.creatureOrPlaneswalker("b", { controller: "opponent", colors: ["R", "W"] }),
        target.creature("a", { controller: "you" }),
      ],
      [
        fx.modify(ref.target("b"), { loseAllAbilities: true }),
        fx.damage(amount.powerOf(ref.target("a")), ref.target("b"), ref.target("a")),
      ],
    ),
  },
};
