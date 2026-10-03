/**
 * The Hobbit — cartes des decks du méta (phase 1 du plan P4, lot M1) : contempler (`cond.behold`). Les autres cartes
 * de l'extension sont dans les fichiers par couleur.
 */
import {
  activated,
  amount,
  BASIC_LAND,
  type CardScript,
  cond,
  cost,
  DWARF,
  entersWith,
  fx,
  graveyardReplacement,
  mode,
  playerStatic,
  ref,
  spell,
  staticAbility,
  TREASURE,
  target,
  triggered,
  triggeredModal,
  WOLF,
  wardAbility,
  when,
} from "./common";

export const CARDS: Record<string, CardScript> = {
  // --- Terrains --------------------------------------------------------------
  "Elven Passage": {
    abilities: [
      activated({
        tap: true,
        payLife: 1,
        sacrifice: true,
        effects: [
          fx.search(BASIC_LAND, { to: "battlefield", tapped: true }, 1, undefined, "land"),
          // « Vous pouvez contempler un Elfe. Si vous le faites, dégagez ce terrain. »
          ...fx.mayBehold({ subtype: "Elf" }, fx.untap(ref.stored("land"))),
        ],
        label: "Chercher un terrain de base (dégagé en contemplant un Elfe)",
      }),
    ],
  },

  // --- Lot M2 -----------------------------------------------------------------
  "Azog, Moria's Ruin": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.destroy(ref.target()),
          fx.amass(ref.controllerOf(ref.target()), "Goblin", amount.powerOf(ref.target())),
          // « Si vous contrôliez cette créature » : ses dernières informations connues si elle a été détruite.
          ...fx.when(cond.targetMatches("t", { controller: "you" }), fx.draw(1)),
        ],
        {
          targets: [target.upTo(1, target.creature("t", { other: true }))],
          label: "Détruit une créature ; son contrôleur amasse des Gobelins",
        },
      ),
    ],
  },
  "The Sackville-Bagginses": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.sacrifice(ref.you, { anyOf: [{ types: ["Creature"] }, { types: ["Artifact"] }], other: true }, 1, {
            optional: true,
            store: "s",
          }),
          ...fx.when(cond.v("s"), fx.draw(1), fx.createTokens(TREASURE)),
        ],
        { label: "Sacrifice facultatif : piochez, un Trésor" },
      ),
      triggered(when.sacrifice({ token: true }), [fx.loseLife(1, ref.target())], {
        targets: [target.player("t", "opponent")],
        label: "Un adversaire perd 1 PV",
      }),
    ],
  },

  // --- Lot M4 -----------------------------------------------------------------
  "Smaug the Magnificent": {
    abilities: [
      triggered(when.attacksSelf, [fx.damage(amount.count({ subtype: "Treasure", controller: "you" }), ref.target())], {
        targets: [target.any()],
        label: "Blessures égales au nombre de vos Trésors",
      }),
      triggered(when.yourUpkeep, [fx.createTokens(TREASURE)], { label: "Un Trésor" }),
    ],
  },

  // --- Lot M5 -----------------------------------------------------------------
  "Thorin Oakenshield": {
    // Storied : lu dans le texte.
    abilities: [
      staticAbility(
        { anyOf: [{ types: ["Artifact"] }, { types: ["Creature"] }], controller: "you" },
        { addAbilities: [wardAbility({ mana: cost("{1}") })] },
        { condition: cond.enduringStory, label: "Récit durable : vos artefacts et créatures ont la garde {1}" },
      ),
    ],
  },
  "Concerted Care": {
    spell: spell(
      [target.permanent("t", ["Artifact", "Creature"], { controller: "you" }, "artefact ou créature que vous contrôlez")],
      [fx.modify(ref.target(), { addKeywords: ["hexproof", "indestructible"] })],
    ),
  },
  "The Lonely Mountain": {
    abilities: [
      entersWith({
        tapped: true,
        condition: cond.not(cond.controls({ subtype: "Equipment" })),
        label: "Engagé, sauf si vous contrôlez un Équipement",
      }),
      activated({
        mana: "{4}{R}",
        tap: true,
        sorcerySpeed: true,
        reduction: { generic: amount.count({ subtype: "Equipment", controller: "you" }) },
        effects: [fx.createTokens(DWARF)],
        label: "Un Nain 2/2",
      }),
    ],
  },
  "Dwarven Mauler": { equipDiscountWhenTargeted: 2 },
  "Thorin, Mountain-king": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          // 701.3b : seuls comptent les Équipements qui deviennent attachés (pas celui qui l'était déjà).
          fx.attach(ref.target("c"), ref.target("e"), "attached"),
          ...fx.when(
            cond.v("attached"),
            fx.reflexive(
              [target.upTo(1, target.creature("d"))],
              [fx.damage(amount.powerOf(ref.target("c")), ref.target("d"), ref.target("c"))],
              { c: ref.target("c") },
            ),
          ),
        ],
        {
          targets: [
            {
              ...target.permanent(
                "e",
                ["Artifact"],
                { subtype: "Equipment", controller: "you" },
                "Équipements que vous contrôlez",
              ),
              count: 20,
              optional: true,
            },
            target.creature("c", { controller: "you" }),
          ],
          label: "Attache vos Équipements ; la créature blesse une créature",
        },
      ),
    ],
  },
  "Dáin's Company": {
    abilities: [
      staticAbility(
        "self",
        { addKeywords: ["lifelink"] },
        { condition: cond.controls({ subtype: "Dwarf", other: true }), label: "Lien de vie avec un autre Nain" },
      ),
      triggered(
        when.entersSelf,
        [
          fx.lookAtTop(4, {
            count: 1,
            filter: { anyOf: [{ subtype: "Dwarf" }, { subtype: "Equipment" }] },
            to: { to: "hand" },
            rest: "bottom",
          }),
        ],
        { label: "Un Nain ou un Équipement parmi les quatre du dessus" },
      ),
    ],
  },
  "Kíli the Resourceful": {
    abilities: [
      playerStatic({
        abilityCost: { ability: "equip", firstThisTurnFree: true },
        condition: cond.enduringStory,
        label: "Récit durable : premier Équiper du tour pour {0}",
      }),
      triggered(
        when.enters({ anyOf: [{ subtype: "Dwarf" }, { subtype: "Equipment" }], controller: "you", other: true }),
        [fx.draw(1)],
        {
          oncePerTurn: true,
          label: "Piochez une carte",
        },
      ),
    ],
  },
  "Bilbo's Gambit": {
    // Cadeau d'un Trésor : lu dans le texte.
    spell: spell(
      [target.spell()],
      [fx.bounce(ref.target()), ...fx.when(cond.gift, fx.thisTurn({ castLimit: { who: "you" } }, ref.eachPlayer))],
    ),
  },
  "Belladonna Took": {
    abilities: [
      triggered(
        when.enters({ token: true, controller: "you" }),
        [
          fx.countResolution("n"),
          ...fx.when(cond.all(cond.v("n", 1), cond.not(cond.v("n", 2))), fx.gainLife(1)),
          ...fx.when(cond.all(cond.v("n", 2), cond.not(cond.v("n", 3))), fx.draw(1)),
          ...fx.when(
            cond.all(cond.v("n", 3), cond.not(cond.v("n", 4))),
            fx.addCountersAll({ types: ["Creature"], controller: "you" }, 1),
          ),
        ],
        { label: "1re fois : 1 PV ; 2e : piochez ; 3e : +1/+1 sur vos créatures" },
      ),
    ],
  },

  // --- Lot M6 -----------------------------------------------------------------
  "Chief Warg's Company": {
    abilities: [
      staticAbility(
        "self",
        { addKeywords: ["cantAttack"] },
        {
          condition: cond.not(cond.controls({ subtype: "Wolf", other: true }, 2)),
          label: "N'attaque qu'avec deux autres Loups",
        },
      ),
      triggered(when.yourUpkeep, [fx.createTokens(WOLF)], { label: "Un Loup 2/2" }),
    ],
  },
  "Head of the Hunt": {
    abilities: [
      graveyardReplacement({
        filter: { types: ["Creature"], controller: "opponent" },
        fromBattlefield: true,
        createToken: WOLF,
        label: "Les créatures adverses qui meurent sont exilées ; un Loup 2/2",
      }),
    ],
  },
  "Nighthowl Pursuer": {
    abilities: [triggered(when.attacksSelf, [fx.pump(ref.self, 2, 2)], { condition: cond.ferocious, label: "Férocité : +2/+2" })],
  },
  "Desolation Prowler": {
    abilities: [activated({ payLife: 2, oncePerTurn: true, effects: [fx.pump(ref.self, 2, 2)], label: "+2/+2" })],
  },
  "Gollum, Riddle Master": {
    chooseOnEnter: "parity",
    abilities: [
      triggeredModal(
        when.castSpell("opponent", { parityChosen: true }),
        [
          mode("Un marqueur +1/+1 sur Gollum", [], [fx.addCounters(ref.self, 1)]),
          mode("Drain 2", [], fx.drain(2)),
          mode("Piochez une carte", [], [fx.draw(1)]),
        ],
        { uniqueModes: true, label: "Sort adverse de la parité choisie : un mode pas encore choisi" },
      ),
    ],
  },
};
