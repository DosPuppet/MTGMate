/** Foundations — cartes vertes. */
import {
  ART_ENCH_OR_FLYER,
  activated,
  amount,
  BASIC_LAND,
  BEAST,
  BEAST_3,
  type CardScript,
  CREATURE_YOU_CONTROL,
  cond,
  doubler,
  ELF_WARRIOR,
  entersWith,
  FOOD,
  fx,
  manaAbility,
  modal,
  mode,
  OTHER_CREATURE_YOU_CONTROL,
  playerStatic,
  RACCOON,
  ref,
  spell,
  staticAbility,
  target,
  targetObj,
  triggered,
  triggeredModal,
  WITH_P1P1,
  when,
} from "./common";

export const GREEN: Record<string, CardScript> = {
  "Llanowar Elves": { abilities: [manaAbility("G")] },
  "Druid of the Cowl": { abilities: [manaAbility("G")] },
  "Giant Growth": { spell: spell([target.creature()], [fx.pump(ref.target(), 3, 3)]) },
  "Bite Down": {
    spell: spell(
      [
        target.creature("a", { controller: "you" }),
        target.permanent("b", ["Creature", "Planeswalker"], { controller: "opponent" }, "créature ou planeswalker adverse"),
      ],
      [fx.damage(amount.powerOf(ref.target("a")), ref.target("b"), ref.target("a"))],
    ),
  },
  Overrun: { spell: spell([], [fx.pumpAll({ controller: "you" }, 3, 3, ["trample"])]) },
  "Primal Might": {
    spell: spell(
      [target.creature("a", { controller: "you" }), target.optional(target.creature("b", { controller: "opponent" }))],
      [fx.pump(ref.target("a"), amount.x, amount.x), fx.fight(ref.target("a"), ref.target("b"))],
    ),
  },
  "Wildheart Invoker": {
    abilities: [
      activated({
        mana: "{8}",
        targets: [target.creature()],
        effects: [fx.pump(ref.target(), 5, 5, ["trample"])],
        label: "+5/+5 et piétinement",
      }),
    ],
  },
  "Ghalta, Primal Hunger": { costReduction: { generic: amount.totalPower({ types: ["Creature"], controller: "you" }) } },
  "Eager Trufflesnout": { abilities: [triggered(when.combatDamageToPlayer, [fx.createTokens(FOOD)], { label: "Nourriture" })] },
  "Mossborn Hydra": {
    abilities: [
      entersWith({ counters: 1 }),
      triggered(when.landfall, [fx.doubleCounters(ref.self)], { label: "double ses marqueurs" }),
    ],
  },
  "Heroes' Bane": {
    abilities: [
      entersWith({ counters: 4 }),
      activated({
        mana: "{2}{G}{G}",
        effects: [fx.addCounters(ref.self, amount.powerOf(ref.self))],
        label: "X marqueurs (X = sa force)",
      }),
    ],
  },
  "Imperious Perfect": {
    abilities: [
      staticAbility(
        { subtype: "Elf", controller: "you", other: true },
        { power: 1, toughness: 1 },
        { label: "Autres Elfes +1/+1" },
      ),
      activated({ mana: "{G}", tap: true, effects: [fx.createTokens(ELF_WARRIOR)], label: "Elfe guerrier 1/1" }),
    ],
  },
  "Dwynen, Gilt-Leaf Daen": {
    abilities: [
      staticAbility({ types: ["Creature"], subtype: "Elf", controller: "you", other: true }, { power: 1, toughness: 1 }),
      triggered(
        when.attacksSelf,
        [fx.gainLife(amount.count({ types: ["Creature"], subtype: "Elf", controller: "you", attacking: true }))],
        { label: "1 PV par Elfe attaquant" },
      ),
    ],
  },
  "Aggressive Mammoth": {
    abilities: [staticAbility({ types: ["Creature"], controller: "you", other: true }, { addKeywords: ["trample"] })],
  },
  "Garruk's Uprising": {
    abilities: [
      triggered(when.entersSelf, [fx.draw(1)], {
        condition: cond.controls({ types: ["Creature"], minPower: 4 }),
        label: "piochez une carte",
      }),
      staticAbility({ types: ["Creature"], controller: "you" }, { addKeywords: ["trample"] }),
      triggered(when.enters({ types: ["Creature"], controller: "you", minPower: 4 }), [fx.draw(1)], {
        label: "piochez une carte",
      }),
    ],
  },
  "Pelakka Wurm": {
    abilities: [
      triggered(when.entersSelf, [fx.gainLife(7)], { label: "+7 PV" }),
      triggered(when.diesSelf, [fx.draw(1)], { label: "piochez une carte" }),
    ],
  },
  "Elfsworn Giant": { abilities: [triggered(when.landfall, [fx.createTokens(ELF_WARRIOR)], { label: "Elfe guerrier 1/1" })] },
  "Rampaging Baloths": { abilities: [triggered(when.landfall, [fx.createTokens(BEAST)], { label: "Bête 4/4" })] },
  "Wary Thespian": {
    abilities: [
      triggered(when.entersSelf, [fx.surveil(1)], { label: "surveillance 1" }),
      triggered(when.diesSelf, [fx.surveil(1)], { label: "surveillance 1" }),
    ],
  },
  "Needletooth Pack": {
    abilities: [
      triggered(when.yourEndStep, [fx.addCounters(ref.target(), 2)], {
        targets: [target.creature("t", { controller: "you" })],
        condition: cond.morbid,
        label: "Morbide : deux marqueurs +1/+1",
      }),
    ],
  },
  "Dwynen's Elite": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(ELF_WARRIOR)], {
        condition: cond.controls({ types: ["Creature"], subtype: "Elf", other: true }),
        label: "Elfe guerrier 1/1",
      }),
    ],
  },
  "Beast-Kin Ranger": {
    abilities: [triggered(when.enters({ ...CREATURE_YOU_CONTROL, other: true }), [fx.pump(ref.self, 1, 0)], { label: "+1/+0" })],
  },
  "Nessian Hornbeetle": {
    abilities: [
      triggered(when.yourCombat, [fx.addCounters(ref.self, 1)], {
        condition: cond.controls({ types: ["Creature"], other: true, minPower: 4 }),
        label: "marqueur +1/+1",
      }),
    ],
  },
  "Ambush Wolf": {
    abilities: [
      triggered(when.entersSelf, [fx.exileCard(ref.target())], {
        targets: [target.optional(target.cardInGraveyard("t", {}, "any"))],
        label: "exile une carte d'un cimetière",
      }),
    ],
  },
  "Apothecary Stomper": {
    abilities: [
      triggeredModal(when.entersSelf, [
        mode("Deux marqueurs +1/+1", [target.creature("t", { controller: "you" })], [fx.addCounters(ref.target(), 2)]),
        mode("Vous gagnez 4 PV", [], [fx.gainLife(4)]),
      ]),
    ],
  },
  "Cackling Prowler": {
    abilities: [
      triggered(when.yourEndStep, [fx.addCounters(ref.self, 1)], { condition: cond.morbid, label: "Morbide : marqueur +1/+1" }),
    ],
  },
  "Elvish Regrower": {
    abilities: [
      triggered(when.entersSelf, [fx.toHand(ref.target())], {
        targets: [target.cardInGraveyard("t", { permanent: true }, "you", "carte de permanent de votre cimetière")],
        label: "récupère un permanent",
      }),
    ],
  },
  "Felling Blow": {
    spell: spell(
      [target.creature("a", { controller: "you" }), target.creature("b", { controller: "opponent" })],
      [fx.addCounters(ref.target("a"), 1), fx.damage(amount.powerOf(ref.target("a")), ref.target("b"), ref.target("a"))],
    ),
  },
  "Preposterous Proportions": {
    spell: spell([], [fx.pumpAll({ controller: "you" }, 10, 10, ["vigilance"])]),
  },
  "Spinner of Souls": {
    abilities: [
      triggered(
        when.dies({ types: ["Creature"], controller: "you", nontoken: true, other: true }),
        fx.may("Révéler jusqu'à une carte de créature ?", fx.revealUntil({ types: ["Creature"] })),
        { label: "révèle jusqu'à une créature" },
      ),
    ],
  },
  "Sylvan Scavenging": {
    abilities: [
      triggeredModal(when.yourEndStep, [
        mode("Marqueur +1/+1", [target.creature("t", { controller: "you" })], [fx.addCounters(ref.target(), 1)]),
        mode("Raton laveur 3/3 (férocité)", [], [...fx.when(cond.ferocious, fx.createTokens(RACCOON))]),
      ]),
    ],
  },
  "Treetop Snarespinner": {
    abilities: [
      activated({
        mana: "{2}{G}",
        sorcerySpeed: true,
        targets: [target.creature("t", { controller: "you" })],
        effects: [fx.addCounters(ref.target(), 1)],
        label: "Marqueur +1/+1",
      }),
    ],
  },
  "Affectionate Indrik": {
    abilities: [
      triggered(when.entersSelf, fx.may("Combattre la créature ciblée ?", fx.fight(ref.self, ref.target())), {
        targets: [target.creature("t", { controller: "opponent" })],
        label: "combat",
      }),
    ],
  },
  "Blanchwood Armor": {
    enchant: { filter: { types: ["Creature"] }, label: "créature" },
    abilities: [
      staticAbility(
        "attached",
        { power: 1, toughness: 1 },
        { per: { subtype: "Forest", controller: "you" }, label: "+1/+1 par Forêt" },
      ),
    ],
  },
  "Broken Wings": {
    spell: spell([targetObj("t", ART_ENCH_OR_FLYER, "artefact, enchantement ou créature volante")], [fx.destroy(ref.target())]),
  },
  Bushwhack: {
    spell: modal(
      mode("Chercher un terrain de base", [], [fx.search(BASIC_LAND)]),
      mode(
        "Combat",
        [target.creature("a", { controller: "you" }), target.creature("b", { controller: "opponent" })],
        [fx.fight(ref.target("a"), ref.target("b"))],
      ),
    ),
  },
  "Elvish Archdruid": {
    abilities: [
      staticAbility({ types: ["Creature"], subtype: "Elf", controller: "you", other: true }, { power: 1, toughness: 1 }),
      manaAbility("G", 1, { per: { types: ["Creature"], subtype: "Elf", controller: "you" } }),
    ],
  },
  "Genesis Wave": {
    spell: spell(
      [],
      [
        fx.lookAtTop(amount.x, {
          filter: { permanent: true },
          count: amount.x,
          maxManaValue: amount.x,
          to: { to: "battlefield" },
          rest: "graveyard",
        }),
      ],
    ),
  },
  "Gnarlid Colony": {
    kicker: "{2}{G}",
    abilities: [
      entersWith({ counters: 2, condition: cond.kicked, label: "Kicker : deux marqueurs" }),
      staticAbility(WITH_P1P1, { addKeywords: ["trample"] }),
    ],
  },
  "Grow from the Ashes": {
    kicker: "{2}",
    spell: spell([], [fx.search(BASIC_LAND, { to: "battlefield" }, amount.kicked(2, 1))]),
  },
  "Inspiring Call": {
    spell: spell([], [fx.draw(amount.count(WITH_P1P1)), fx.modifyAll(WITH_P1P1, { addKeywords: ["indestructible"] })]),
  },
  "Mild-Mannered Librarian": {
    abilities: [
      activated({
        mana: "{3}{G}",
        once: true,
        effects: [fx.modify(ref.self, { addSubtypes: ["Werewolf"] }, "permanent"), fx.addCounters(ref.self, 2), fx.draw(1)],
        label: "Devient un Loup-garou",
      }),
    ],
  },
  "Reclamation Sage": {
    abilities: [
      triggered(when.entersSelf, fx.may("Détruire l'artefact ou l'enchantement ciblé ?", fx.destroy(ref.target())), {
        targets: [target.permanent("t", ["Artifact", "Enchantment"], {}, "artefact ou enchantement")],
        label: "détruit un artefact ou un enchantement",
      }),
    ],
  },
  "Scavenging Ooze": {
    abilities: [
      activated({
        mana: "{G}",
        targets: [target.cardInGraveyard("t", {}, "any")],
        effects: [
          fx.exileCard(ref.target(), { name: "c", filter: { types: ["Creature"] } }),
          ...fx.when(cond.v("c"), fx.addCounters(ref.self, 1), fx.gainLife(1)),
        ],
        label: "Exiler une carte d'un cimetière",
      }),
    ],
  },
  "Snakeskin Veil": {
    spell: spell(
      [target.creature("t", { controller: "you" })],
      [fx.addCounters(ref.target(), 1), fx.pump(ref.target(), 0, 0, ["hexproof"])],
    ),
  },
  "Wildwood Scourge": {
    abilities: [
      entersWith({ counters: amount.x }),
      triggered(
        when.countersPut({ types: ["Creature"], controller: "you", other: true, notSubtype: "Hydra" }, "+1/+1"),
        [fx.addCounters(ref.self, 1)],
        { label: "marqueur +1/+1" },
      ),
    ],
  },
  "Loot, Exuberant Explorer": {
    abilities: [
      playerStatic({ extraLands: 1, label: "Un terrain supplémentaire par tour" }),
      activated({
        mana: "{4}{G}{G}",
        tap: true,
        effects: [
          fx.lookAtTop(6, {
            filter: { types: ["Creature"] },
            maxManaValue: amount.count({ types: ["Land"], controller: "you" }),
            to: { to: "battlefield" },
            rest: "bottom",
          }),
        ],
        label: "Regarder 6 cartes, mettre une créature en jeu",
      }),
    ],
  },
  "Quilled Greatwurm": {
    graveyardCastRemoveCounters: 6,
    abilities: [
      triggered(when.combatDamage(CREATURE_YOU_CONTROL), [fx.addCounters(ref.eventObject, amount.eventAmount)], {
        condition: cond.yourTurn,
        label: "autant de marqueurs +1/+1",
      }),
    ],
  },
  "Doubling Season": {
    abilities: [doubler({ tokens: true, counters: true, label: "Jetons et marqueurs doublés" })],
  },

  // --- Réimpressions ---
  "Biogenic Upgrade": {
    spell: spell([target.upTo(3, target.creature())], [fx.countersDivided(3, ref.target()), fx.doubleCounters(ref.target())]),
  },
  "Circuitous Route": {
    spell: spell([], [fx.search({ anyOf: [BASIC_LAND, { subtype: "Gate" }] }, { to: "battlefield", tapped: true }, 2)]),
  },
  "Fierce Empath": {
    abilities: [
      triggered(
        when.entersSelf,
        fx.may("Chercher une créature de valeur 6 ou plus ?", fx.search({ types: ["Creature"], minManaValue: 6 })),
        {
          label: "cherche une grosse créature",
        },
      ),
    ],
  },
  "Fynn, the Fangbearer": {
    abilities: [
      triggered(
        when.combatDamage({ types: ["Creature"], controller: "you", keyword: "deathtouch" }, true),
        [fx.poison(ref.eventPlayer, 2)],
        { label: "deux marqueurs poison" },
      ),
    ],
  },
  "Gnarlback Rhino": {
    abilities: [triggered(when.targetedBySpellYouCast, [fx.draw(1)], { label: "piochez une carte" })],
  },
  "Joraga Invocation": {
    spell: spell(
      [],
      [
        fx.pumpAll({ controller: "you" }, 3, 3),
        fx.modifyAll({ types: ["Creature"], controller: "you" }, { addKeywords: ["mustBeBlocked"] }),
      ],
    ),
  },
  "Mold Adder": {
    abilities: [
      triggered(
        when.castSpell("opponent", { colors: ["U", "B"] }),
        fx.may("Mettre un marqueur +1/+1 ?", fx.addCounters(ref.self, 1)),
        {
          label: "marqueur +1/+1",
        },
      ),
    ],
  },
  "New Horizons": {
    enchant: { filter: { types: ["Land"] }, label: "terrain" },
    abilities: [
      triggered(when.entersSelf, [fx.addCounters(ref.target(), 1)], {
        targets: [target.creature("t", { controller: "you" })],
        label: "marqueur +1/+1",
      }),
      staticAbility(
        "attached",
        { addAbilities: [manaAbility(["W", "U", "B", "R", "G"], 2)] },
        {
          label: "« {T} : deux mana d'une même couleur »",
        },
      ),
    ],
  },
  "Ordeal of Nylea": {
    enchant: { filter: { types: ["Creature"] }, label: "créature" },
    abilities: [
      triggered(
        when.attacks({ attachedToSource: true }),
        [
          fx.addCounters(ref.attached, 1),
          ...fx.when(
            cond.amountAtLeast(amount.countersOn(ref.attached), 3),
            fx.sacrificeIt(ref.self),
            fx.search(BASIC_LAND, { to: "battlefield", tapped: true }, 2),
          ),
        ],
        { label: "marqueur ; à 3, deux terrains de base" },
      ),
    ],
  },
  "Predator Ooze": {
    abilities: [
      triggered(when.attacksSelf, [fx.addCounters(ref.self, 1)], { label: "marqueur +1/+1" }),
      triggered(when.dies({ types: ["Creature"], damagedBySource: true }), [fx.addCounters(ref.self, 1)], {
        label: "marqueur +1/+1",
      }),
    ],
  },
  "Primeval Bounty": {
    abilities: [
      triggered(when.castSpell("you", { types: ["Creature"] }), [fx.createTokens(BEAST_3)], { label: "Bête 3/3" }),
      triggered(when.castSpell("you", { notTypes: ["Creature"] }), [fx.addCounters(ref.target(), 3)], {
        targets: [target.creature("t", { controller: "you" })],
        label: "trois marqueurs +1/+1",
      }),
      triggered(when.landfall, [fx.gainLife(3)], { label: "+3 PV" }),
    ],
  },
  "Springbloom Druid": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.sacrifice(ref.you, { types: ["Land"] }, 1, { optional: true, store: "land" }),
          ...fx.when(cond.v("land"), fx.search(BASIC_LAND, { to: "battlefield", tapped: true }, 2)),
        ],
        { label: "sacrifice un terrain : deux terrains de base" },
      ),
    ],
  },
  "Surrak, the Hunt Caller": {
    abilities: [
      triggered(when.yourCombat, [fx.pump(ref.target(), 0, 0, ["haste"])], {
        targets: [target.creature("t", { controller: "you" })],
        condition: cond.amountAtLeast(amount.totalPower({ types: ["Creature"], controller: "you" }), 8),
        label: "Formidable : célérité",
      }),
    ],
  },
  "Thrashing Brontodon": {
    abilities: [
      activated({
        mana: "{1}",
        sacrifice: true,
        targets: [target.permanent("t", ["Artifact", "Enchantment"], {}, "artefact ou enchantement")],
        effects: [fx.destroy(ref.target())],
        label: "Détruire un artefact ou un enchantement",
      }),
    ],
  },
  "Venom Connoisseur": {
    abilities: [
      triggered(
        when.enters(OTHER_CREATURE_YOU_CONTROL),
        [
          fx.pump(ref.self, 0, 0, ["deathtouch"]),
          fx.countResolution("n"),
          ...fx.when(
            cond.all(cond.v("n", 2), cond.not(cond.v("n", 3))),
            fx.modifyAll({ types: ["Creature"], controller: "you" }, { addKeywords: ["deathtouch"] }),
          ),
        ],
        { label: "Alliance : contact mortel" },
      ),
    ],
  },
  "Vizier of the Menagerie": {
    abilities: [playerStatic({ castCreaturesFromTop: true, label: "Créatures du dessus de votre bibliothèque" })],
  },
  "Wildborn Preserver": {
    abilities: [
      triggered(
        when.enters({ ...OTHER_CREATURE_YOU_CONTROL, notSubtype: "Human" }),
        [fx.payX("payer X pour X marqueurs +1/+1 ?", "x"), fx.addCounters(ref.self, amount.v("x"))],
        { label: "payer X : X marqueurs" },
      ),
    ],
  },
};
