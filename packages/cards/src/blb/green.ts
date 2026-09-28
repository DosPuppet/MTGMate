/** Bloomburrow — cartes vertes. */
import {
  activated,
  amount,
  BASIC_LAND,
  type CardScript,
  CREATURE_YOU_CONTROL,
  cond,
  cost,
  doubler,
  entersAndSacrificed,
  expend,
  FOOD,
  FOOD_ABILITY,
  fx,
  kin,
  manaAbility,
  modal,
  mode,
  pawprint,
  ref,
  spell,
  staticAbility,
  TOKEN_YOU,
  target,
  targetObj,
  triggered,
  triggeredModal,
  wardAbility,
  when,
} from "./common";

const OPP_CREATURE = (id = "u") =>
  targetObj(id, { types: ["Creature"], controller: "opponent" }, "créature que vous ne contrôlez pas");
const SQUIRREL_OR_FOOD = {
  controller: "you" as const,
  anyOf: [{ types: ["Creature" as const], subtype: "Squirrel" }, { subtype: "Food" }],
};

export const GREEN: Record<string, CardScript> = {
  "Bakersbane Duo": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(FOOD)], { label: "Nourriture" }),
      expend(4, [fx.pump(ref.self, 1, 1)], { label: "+1/+1" }),
    ],
  },
  "Bark-Knuckle Boxer": {
    abilities: [expend(4, [fx.pump(ref.self, 0, 0, ["indestructible"])], { label: "Indestructible" })],
  },
  "Brambleguard Veteran": {
    abilities: [expend(4, [fx.pumpAll(kin(["Raccoon"]), 1, 1, ["vigilance"])], { label: "Ratons laveurs +1/+1 et vigilance" })],
  },
  "Bushy Bodyguard": {
    abilities: [
      triggered(when.entersSelf, fx.mayForage("Fourrager pour deux marqueurs +1/+1 ?", fx.addCounters(ref.self, 2)), {
        label: "Fourrager : deux marqueurs +1/+1",
      }),
    ],
  },
  "Cache Grab": {
    spell: spell(
      [],
      [
        fx.mill(4, ref.you, { name: "m" }),
        fx.pickFromZone(
          "graveyard",
          { permanent: true },
          { to: "hand" },
          {
            pool: ref.stored("m"),
            min: 0,
            store: "p",
            prompt: "Carte de permanent à mettre en main",
          },
        ),
        ...fx.when(
          cond.any(
            cond.controls({ types: ["Creature"], subtype: "Squirrel" }),
            cond.refMatches(ref.stored("p"), { subtype: "Squirrel" }),
          ),
          fx.createTokens(FOOD),
        ),
      ],
    ),
  },
  "Clifftop Lookout": {
    abilities: [
      triggered(when.entersSelf, [fx.revealUntil({ types: ["Land"] }, { to: "battlefield", tapped: true })], {
        label: "Révèle jusqu'à un terrain (sur le champ de bataille)",
      }),
    ],
  },
  "Curious Forager": {
    abilities: [
      triggered(
        when.entersSelf,
        fx.mayForage(
          "Fourrager pour récupérer une carte de permanent ?",
          fx.reflexive(
            [target.cardInGraveyard("t", { permanent: true }, "you", "carte de permanent de votre cimetière")],
            [fx.toHand(ref.target())],
          ),
        ),
        { label: "Fourrager : récupère un permanent" },
      ),
    ],
  },
  "Druid of the Spade": {
    abilities: [
      staticAbility(
        "self",
        { power: 2, addKeywords: ["trample"] },
        { condition: cond.controls({ token: true }), label: "+2/+0 et piétinement" },
      ),
    ],
  },
  "Fecund Greenshell": {
    abilities: [
      staticAbility(
        CREATURE_YOU_CONTROL,
        { power: 2, toughness: 2 },
        {
          condition: cond.controls({ types: ["Land"] }, 10),
          label: "Dix terrains : +2/+2",
        },
      ),
      triggered(
        when.enters({ types: ["Creature"], controller: "you", toughnessAbovePower: true }),
        [fx.lookAtTop(1, { filter: { types: ["Land"] }, to: { to: "battlefield", tapped: true }, rest: "hand" })],
        { label: "Carte du dessus : terrain en jeu, sinon en main" },
      ),
    ],
  },
  "For the Common Good": {
    spell: spell(
      [targetObj("t", TOKEN_YOU, "jeton que vous contrôlez")],
      [
        fx.copyToken(ref.target(), { count: amount.x }),
        fx.modifyAll({ token: true, controller: "you" }, { addKeywords: ["indestructible"] }, "untilYourNextTurn"),
        fx.gainLife(amount.count(TOKEN_YOU)),
      ],
    ),
  },
  "Hazardroot Herbalist": {
    abilities: [
      triggered(
        when.attackWith(1),
        [
          fx.pump(ref.target(), 1, 0),
          ...fx.when(cond.refMatches(ref.target(), { token: true }), fx.pump(ref.target(), 0, 0, ["deathtouch"])),
        ],
        { targets: [target.creature("t", { controller: "you" })], label: "+1/+0 (contact mortel si jeton)" },
      ),
    ],
  },
  "Heaped Harvest": {
    abilities: [
      ...entersAndSacrificed(
        fx.may("Chercher un terrain de base ?", fx.search(BASIC_LAND, { to: "battlefield", tapped: true })),
        "Terrain de base engagé",
      ),
      FOOD_ABILITY,
    ],
  },
  "High Stride": {
    spell: spell([target.creature()], [fx.pump(ref.target(), 1, 3, ["reach"]), fx.untap(ref.target())]),
  },
  "Hivespine Wolverine": {
    abilities: [
      triggeredModal(when.entersSelf, [
        mode("Marqueur +1/+1", [target.creature("t", { controller: "you" })], [fx.addCounters(ref.target(), 1)]),
        mode(
          "Se bat contre un jeton de créature",
          [targetObj("t", { types: ["Creature"], token: true }, "jeton de créature")],
          [fx.fight(ref.self, ref.target())],
        ),
        mode(
          "Détruit un artefact ou un enchantement",
          [target.permanent("t", ["Artifact", "Enchantment"], {}, "artefact ou enchantement")],
          [fx.destroy(ref.target())],
        ),
      ]),
    ],
  },
  "Honored Dreyleader": {
    abilities: [
      triggered(when.entersSelf, [fx.addCounters(ref.self, amount.count({ ...SQUIRREL_OR_FOOD, other: true }))], {
        label: "Un marqueur par Écureuil et Nourriture",
      }),
      triggered(when.enters({ ...SQUIRREL_OR_FOOD, other: true }), [fx.addCounters(ref.self, 1)], { label: "Marqueur +1/+1" }),
    ],
  },
  "Hunter's Talent": {
    abilities: [
      triggered(when.entersSelf, [fx.damage(amount.powerOf(ref.target()), ref.target("u"), ref.target())], {
        targets: [target.creature("t", { controller: "you" }), OPP_CREATURE()],
        label: "Morsure",
      }),
    ],
    classLevels: [
      [
        triggered(when.attackWith(1), [fx.pump(ref.target(), 1, 0, ["trample"])], {
          targets: [targetObj("t", { types: ["Creature"], attacking: true }, "créature attaquante")],
          label: "+1/+0 et piétinement",
        }),
      ],
      [
        triggered(when.yourEndStep, [fx.draw(1)], {
          condition: cond.controls({ types: ["Creature"], minPower: 4 }),
          label: "Piochez une carte",
        }),
      ],
    ],
  },
  "Innkeeper's Talent": {
    abilities: [
      triggered(when.yourCombat, [fx.addCounters(ref.target(), 1)], {
        targets: [target.creature("t", { controller: "you" })],
        label: "Marqueur +1/+1",
      }),
    ],
    classLevels: [
      [
        staticAbility(
          { controller: "you", withCounter: "any" },
          { addKeywords: ["ward"], addAbilities: [wardAbility({ mana: cost("{1}") })] },
          { label: "Garde {1}" },
        ),
      ],
      [doubler({ counters: true, label: "Marqueurs doublés" })],
    ],
  },
  "Keen-Eyed Curator": {
    abilities: [
      staticAbility(
        "self",
        { power: 4, toughness: 4, addKeywords: ["trample"] },
        {
          condition: cond.amountAtLeast(amount.cardTypesOf(ref.linked), 4),
          label: "Quatre types exilés : +4/+4 et piétinement",
        },
      ),
      activated({
        mana: "{1}",
        targets: [target.cardInGraveyard("t", {}, "any", "carte d'un cimetière")],
        effects: [fx.exileCard(ref.target(), { name: "k" }), fx.link(ref.stored("k"))],
        label: "Exile une carte d'un cimetière",
      }),
    ],
  },
  "Longstalk Brawl": {
    spell: spell(
      [target.creature("t", { controller: "you" }), OPP_CREATURE()],
      [...fx.when(cond.gift, fx.addCounters(ref.target(), 1)), fx.fight(ref.target(), ref.target("u"))],
    ),
  },
  "Lumra, Bellow of the Woods": {
    cdaPT: amount.count({ types: ["Land"], controller: "you" }),
    abilities: [
      triggered(
        when.entersSelf,
        [fx.mill(4), fx.moveAll("graveyard", ref.you, { types: ["Land"] }, { to: "battlefield", tapped: true })],
        { label: "Meule 4, puis renvoie tous les terrains" },
      ),
    ],
  },
  "Mistbreath Elder": {
    // Approximation : la créature renvoyée est choisie quand la capacité se déclenche.
    abilities: [
      triggered(
        when.yourUpkeep,
        [
          ...fx.when(cond.targetChosen("t"), fx.bounce(ref.target()), fx.addCounters(ref.self, 1)),
          ...fx.when(cond.not(cond.targetChosen("t")), ...fx.may("Renvoyer cette créature en main ?", fx.bounce(ref.self))),
        ],
        {
          targets: [target.upTo(1, target.creature("t", { controller: "you", other: true }))],
          label: "Renvoie une autre créature (marqueur +1/+1)",
        },
      ),
    ],
  },
  Overprotect: {
    spell: spell(
      [target.creature("t", { controller: "you" })],
      [fx.pump(ref.target(), 3, 3, ["trample", "hexproof", "indestructible"])],
    ),
  },
  "Pawpatch Formation": {
    spell: modal(
      mode("Détruit une créature avec le vol", [target.creature("t", { keyword: "flying" })], [fx.destroy(ref.target())]),
      mode("Détruit un enchantement", [target.permanent("t", ["Enchantment"], {}, "enchantement")], [fx.destroy(ref.target())]),
      mode("Piochez une carte, Nourriture", [], [fx.draw(1), fx.createTokens(FOOD)]),
    ),
  },
  "Pawpatch Recruit": {
    abilities: [
      triggered(when.targetedByOpponent(CREATURE_YOU_CONTROL), [fx.addCounters(ref.target(), 1)], {
        // Approximation : la créature ciblée par l'adversaire peut recevoir le marqueur.
        targets: [target.creature("t", { controller: "you" })],
        label: "Marqueur +1/+1 sur une autre créature",
      }),
    ],
  },
  "Peerless Recycling": {
    spell: spell(
      [{ ...target.cardInGraveyard("t", { permanent: true }, "you", "carte de permanent de votre cimetière"), kickedCount: 2 }],
      [fx.toHand(ref.target())],
    ),
  },
  Polliwallop: {
    costReduction: { generic: amount.count({ types: ["Creature"], subtype: "Frog", controller: "you" }) },
    spell: spell(
      [target.creature("t", { controller: "you" }), OPP_CREATURE()],
      [fx.damage(amount.plus(amount.powerOf(ref.target()), amount.powerOf(ref.target())), ref.target("u"), ref.target())],
    ),
  },
  "Rust-Shield Rampager": { keywords: ["cantBeBlockedByPowerLE2"] },
  Scrapshooter: {
    abilities: [
      triggered(when.entersSelf, [fx.destroy(ref.target())], {
        condition: cond.gift,
        targets: [
          target.permanent("t", ["Artifact", "Enchantment"], { controller: "opponent" }, "artefact ou enchantement adverse"),
        ],
        label: "Détruit un artefact ou un enchantement",
      }),
    ],
  },
  "Season of Gathering": {
    spell: pawprint(
      {
        pips: 1,
        label: "Marqueur +1/+1, vigilance et piétinement",
        targets: [target.creature("t", { controller: "you" })],
        effects: [fx.addCounters(ref.target(), 1), fx.pump(ref.target(), 0, 0, ["vigilance", "trample"])],
      },
      {
        pips: 2,
        label: "Détruit tous les artefacts",
        effects: [fx.destroyAll({ types: ["Artifact"] })],
      },
      {
        pips: 2,
        label: "Détruit tous les enchantements",
        effects: [fx.destroyAll({ types: ["Enchantment"] })],
      },
      {
        pips: 3,
        label: "Piochez selon la plus grande force",
        effects: [fx.draw(amount.maxPower(CREATURE_YOU_CONTROL))],
      },
    ),
  },
  "Stickytongue Sentinel": {
    abilities: [
      triggered(when.entersSelf, [fx.bounce(ref.target())], {
        targets: [target.upTo(1, targetObj("t", { controller: "you", other: true }, "autre permanent que vous contrôlez"))],
        label: "Renvoie un autre permanent",
      }),
    ],
  },
  "Stocking the Pantry": {
    abilities: [
      triggered(when.countersPut(CREATURE_YOU_CONTROL, "+1/+1"), [fx.counters(ref.self, "supply", 1)], {
        batched: true,
        label: "Marqueur de provision",
      }),
      activated({ mana: "{2}", removeCounters: { kind: "supply", n: 1 }, effects: [fx.draw(1)], label: "Piochez une carte" }),
    ],
  },
  "Sunshower Druid": {
    abilities: [
      triggered(when.entersSelf, [fx.addCounters(ref.target(), 1), fx.gainLife(1)], {
        targets: [target.creature()],
        label: "Marqueur +1/+1, +1 PV",
      }),
    ],
  },
  "Tender Wildguide": {
    abilities: [
      manaAbility(["W", "U", "B", "R", "G"]),
      activated({ tap: true, effects: [fx.addCounters(ref.self, 1)], label: "Marqueur +1/+1" }),
    ],
  },
  "Thornvault Forager": {
    abilities: [
      manaAbility("G"),
      // Approximation : capacité activée (pas de mana), deux mana d'une même couleur.
      activated({ tap: true, forage: true, effects: [fx.addManaChoice(2)], label: "Fourrager : deux mana" }),
      activated({
        mana: "{3}{G}",
        tap: true,
        effects: [fx.search({ subtype: "Squirrel" })],
        label: "Cherche un Écureuil",
      }),
    ],
  },
  "Three Tree Rootweaver": { abilities: [manaAbility(["W", "U", "B", "R", "G"])] },
  "Three Tree Scribe": {
    abilities: [
      triggered(when.leavesWithoutDying(CREATURE_YOU_CONTROL), [fx.addCounters(ref.target(), 1)], {
        targets: [target.creature("t", { controller: "you" })],
        label: "Marqueur +1/+1",
      }),
    ],
  },
  "Treeguard Duo": {
    abilities: [
      triggered(
        when.entersSelf,
        [fx.pump(ref.target(), amount.count(CREATURE_YOU_CONTROL), amount.count(CREATURE_YOU_CONTROL), ["vigilance"])],
        { targets: [target.creature("t", { controller: "you" })], label: "+X/+X et vigilance" },
      ),
    ],
  },
  "Treetop Sentries": {
    abilities: [
      triggered(when.entersSelf, fx.mayForage("Fourrager pour piocher une carte ?", fx.draw(1)), {
        label: "Fourrager : piochez",
      }),
    ],
  },
  "Valley Mightcaller": {
    abilities: [
      triggered(when.enters(kin(["Frog", "Rabbit", "Raccoon", "Squirrel"], { other: true })), [fx.addCounters(ref.self, 1)], {
        label: "Marqueur +1/+1",
      }),
    ],
  },
  "Wear Down": {
    spell: spell(
      [{ ...target.permanent("t", ["Artifact", "Enchantment"], {}, "artefact ou enchantement"), kickedCount: 2 }],
      [fx.destroy(ref.target())],
    ),
  },
};
