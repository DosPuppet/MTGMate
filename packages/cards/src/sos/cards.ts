/**
 * Secrets of Strixhaven — cartes des decks du méta (phase 1 du plan P4, lot M1). Les autres cartes de l'extension
 * sont dans les fichiers par couleur.
 */
import {
  activated,
  amount,
  BASIC_LAND,
  type CardScript,
  cond,
  entersWith,
  fx,
  INSTANT_SORCERY,
  loyalty,
  manaAbility,
  modal,
  mode,
  PEST,
  ref,
  spell,
  staticAbility,
  target,
  triggered,
  when,
} from "./common";

export const CARDS: Record<string, CardScript> = {
  // --- Terrains --------------------------------------------------------------
  "Great Hall of the Biblioplex": {
    abilities: [
      manaAbility("C"),
      manaAbility(["W", "U", "B", "R", "G"], 1, { payLife: 1, restriction: { spell: INSTANT_SORCERY } }),
      activated({
        mana: "{5}",
        effects: fx.when(
          cond.not(cond.sourceMatches({ types: ["Creature"] })),
          fx.modify(
            ref.self,
            {
              addTypes: ["Creature"],
              addSubtypes: ["Wizard"],
              setPower: 2,
              setToughness: 4,
              addAbilities: [
                triggered(when.castSpell("you", INSTANT_SORCERY), [fx.pump(ref.self, 1, 0)], {
                  label: "+1/+0 jusqu'à la fin du tour",
                }),
              ],
            },
            "permanent",
          ),
        ),
        label: "Devient une créature Sorcier 2/4",
      }),
    ],
  },
  // --- Rouge -----------------------------------------------------------------
  "Impractical Joke": {
    spell: spell(
      [target.optional(target.creatureOrPlaneswalker())],
      [fx.thisTurn({ damageUnpreventable: true }), fx.damage(3, ref.target())],
    ),
  },
  // --- Multicolores ----------------------------------------------------------
  "Prismari Charm": {
    spell: modal(
      mode("Surveillance 2, puis piochez une carte", [], [fx.surveil(2), fx.draw(1)]),
      mode("1 blessure à chacune d'une ou deux cibles", [target.between(1, 2, target.any())], [fx.damage(1, ref.target())]),
      mode("Renvoyez un permanent non-terrain", [target.nonland()], [fx.bounce(ref.target())]),
    ),
  },
  "Traumatic Critique": {
    spell: spell([target.any()], [fx.damage(amount.x, ref.target()), fx.draw(2), fx.discard(1)]),
  },

  // --- Lot M2 -----------------------------------------------------------------
  "Professor Dellian Fel": {
    abilities: [
      loyalty(2, { effects: [fx.gainLife(3)], label: "Gagnez 3 PV" }),
      loyalty(0, { effects: [fx.draw(1), fx.loseLife(1)], label: "Piochez, perdez 1 PV" }),
      loyalty(-3, { targets: [target.creature()], effects: [fx.destroy(ref.target())], label: "Détruit une créature" }),
      loyalty(-6, {
        effects: [
          fx.emblem("Professor Dellian Fel", "Whenever you gain life, target opponent loses that much life.", [
            triggered(when.gainLife, [fx.loseLife(amount.eventAmount, ref.target())], {
              targets: [target.player("t", "opponent")],
              label: "Un adversaire perd autant de PV",
            }),
          ]),
        ],
        label: "Emblème",
      }),
    ],
  },
  "Witherbloom Charm": {
    spell: modal(
      mode(
        "Sacrifice facultatif : piochez deux cartes",
        [],
        [fx.sacrifice(ref.you, {}, 1, { optional: true, store: "s" }), ...fx.when(cond.v("s"), fx.draw(2))],
      ),
      mode("Gagnez 5 PV", [], [fx.gainLife(5)]),
      mode(
        "Détruit un permanent non-terrain de VM 2 ou moins",
        [target.nonland("t", { maxManaValue: 2 })],
        [fx.destroy(ref.target())],
      ),
    ),
  },

  // --- Lot M3 -----------------------------------------------------------------
  "Emeritus of Ideation": {
    prepareSpell: spell([target.player()], [fx.draw(3, ref.target())]),
    abilities: [
      entersWith({ prepared: true }),
      triggered(
        when.attacksSelf,
        fx.may(
          "Exiler huit cartes de votre cimetière pour préparer cette créature ?",
          fx.when(
            cond.amountAtLeast(amount.cardsIn("graveyard"), 8),
            fx.pickFromZone(
              "graveyard",
              {},
              { to: "exile" },
              { count: 8, min: 8, prompt: "Exilez huit cartes de votre cimetière" },
            ),
            fx.prepare(ref.self),
          ),
        ),
        { label: "Exiler huit cartes : devient préparée" },
      ),
    ],
  },
  Erode: {
    spell: spell(
      [target.creatureOrPlaneswalker()],
      [fx.destroy(ref.target()), fx.search(BASIC_LAND, { to: "battlefield", tapped: true }, 1, ref.controllerOf(ref.target()))],
    ),
  },
  "Petrified Hamlet": {
    // Le nom est choisi par la capacité déclenchée d'arrivée (`chooseOnEnter` : les effets qui le lisent).
    chooseOnEnter: "landName",
    abilities: [
      triggered(when.entersSelf, [fx.chooseForSelf("landName")], { label: "Choisissez un nom de carte de terrain" }),
      manaAbility("C"),
      staticAbility(
        { types: ["Land"], nameChosen: true },
        { addAbilities: [manaAbility("C")] },
        {
          label: "Les terrains du nom choisi ont « {T} : ajoutez {C} »",
        },
      ),
    ],
  },

  // --- Lot M4 -----------------------------------------------------------------
  Flashback: {
    spell: spell(
      [target.cardInGraveyard("t", { types: ["Instant", "Sorcery"] }, "you", "carte d'éphémère ou de rituel de votre cimetière")],
      [fx.grantFlashback(ref.target())],
    ),
  },
  "Together as One": {
    // Convergence : X = couleurs de mana dépensées.
    spell: spell(
      [target.player("p"), target.any("d")],
      [
        fx.draw(amount.colorsSpent, ref.target("p")),
        fx.damage(amount.colorsSpent, ref.target("d")),
        fx.gainLife(amount.colorsSpent),
      ],
    ),
  },
  "Tablet of Discovery": {
    abilities: [
      triggered(when.entersSelf, [fx.mill(1, ref.you, { name: "m" }), fx.grantPlay(ref.stored("m"))], {
        label: "Meulez une carte, jouable ce tour-ci",
      }),
      manaAbility("R"),
      manaAbility("R", 2, { restriction: { spell: INSTANT_SORCERY } }),
    ],
  },
  "Sundown Pass": {
    abilities: [
      entersWith({
        tapped: true,
        condition: cond.not(cond.controls({ types: ["Land"], other: true }, 2)),
        label: "Engagé, sauf avec deux autres terrains ou plus",
      }),
      manaAbility(["R", "W"]),
    ],
  },

  // --- Lot M5 -----------------------------------------------------------------
  "Hardened Academic": {
    abilities: [
      activated({ discard: 1, effects: [fx.modify(ref.self, { addKeywords: ["lifelink"] })], label: "Lien de vie" }),
      triggered(when.zoneChange(["graveyard"], { whose: "you" }), [fx.addCounters(ref.target(), 1)], {
        batched: true,
        targets: [target.creature("t", { controller: "you" })],
        label: "Des cartes quittent votre cimetière : un marqueur +1/+1",
      }),
    ],
  },
  "Moseo, Vein's New Dean": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(PEST)], { label: "Un Nuisible 1/1" }),
      triggered(
        when.yourEndStep,
        fx.when(
          cond.amountAtLeast(amount.plus(amount.lifeGainedThisTurn, amount.neg(amount.manaValueOf(ref.target()))), 0),
          fx.toBattlefield(ref.target()),
        ),
        {
          condition: cond.lifeGainedAtLeast(1),
          targets: [
            target.optional(target.cardInGraveyard("t", { types: ["Creature"] }, "you", "carte de créature de votre cimetière")),
          ],
          label: "Infusion : renvoie une créature de VM X ou moins (PV gagnés)",
        },
      ),
    ],
  },
  "Practiced Offense": {
    flashback: "{1}{W}",
    spell: modal(
      mode(
        "Marqueurs +1/+1, double initiative",
        [target.player("p"), target.creature("c")],
        [
          fx.addCounters(ref.permanentsOf(ref.target("p"), { types: ["Creature"] }), 1),
          fx.modify(ref.target("c"), { addKeywords: ["doubleStrike"] }),
        ],
      ),
      mode(
        "Marqueurs +1/+1, lien de vie",
        [target.player("p"), target.creature("c")],
        [
          fx.addCounters(ref.permanentsOf(ref.target("p"), { types: ["Creature"] }), 1),
          fx.modify(ref.target("c"), { addKeywords: ["lifelink"] }),
        ],
      ),
    ),
  },
  "Shattered Sanctum": {
    abilities: [
      entersWith({
        tapped: true,
        condition: cond.not(cond.controls({ types: ["Land"], other: true }, 2)),
        label: "Engagé, sauf avec deux autres terrains ou plus",
      }),
      manaAbility(["W", "B"]),
    ],
  },
  "Decorum Dissertation": {
    // Paradigme : lu dans le texte.
    spell: spell([target.player()], [fx.draw(2, ref.target()), fx.loseLife(2, ref.target())]),
  },

  // --- Lot M6 -----------------------------------------------------------------
  Daydream: {
    flashback: "{2}{W}",
    spell: spell(
      [target.creature("t", { controller: "you" })],
      [fx.exileCard(ref.target(), { name: "d" }), fx.toBattlefield(ref.stored("d"), { counters: { kind: "+1/+1", n: 1 } })],
    ),
  },
  "Deathcap Glade": {
    abilities: [
      entersWith({
        tapped: true,
        condition: cond.not(cond.controls({ types: ["Land"], other: true }, 2)),
        label: "Engagé, sauf avec deux autres terrains ou plus",
      }),
      manaAbility(["B", "G"]),
    ],
  },
  "Stormcarved Coast": {
    abilities: [
      entersWith({
        tapped: true,
        condition: cond.not(cond.controls({ types: ["Land"], other: true }, 2)),
        label: "Engagé, sauf avec deux autres terrains ou plus",
      }),
      manaAbility(["U", "R"]),
    ],
  },
  "Dissection Practice": {
    spell: spell(
      [target.player("p", "opponent"), target.upTo(1, target.creature("a")), target.upTo(1, target.creature("b"))],
      [fx.loseLife(1, ref.target("p")), fx.gainLife(1), fx.pump(ref.target("a"), 1, 1), fx.pump(ref.target("b"), -1, -1)],
    ),
  },
  "Colorstorm Stallion": {
    abilities: [
      triggered(
        when.castSpell("you", INSTANT_SORCERY),
        [fx.pump(ref.self, 1, 1), ...fx.when(cond.amountAtLeast(amount.eventManaSpent, 5), fx.copyToken(ref.self))],
        { label: "Opus : +1/+1 ; cinq mana ou plus : un jeton copie" },
      ),
    ],
  },
  "Vibrant Outburst": {
    spell: spell(
      [target.any("d"), target.upTo(1, target.creature("c"))],
      [fx.damage(3, ref.target("d")), fx.tap(ref.target("c"))],
    ),
  },
  "Vicious Rivalry": {
    // « Payez X points de vie » en coût additionnel : lu dans le texte.
    spell: spell([], [fx.destroyAll({ anyOf: [{ types: ["Artifact"] }, { types: ["Creature"] }], maxManaValueX: true })]),
  },
  "Ral Zarek, Guest Lecturer": {
    abilities: [
      loyalty(1, { effects: [fx.surveil(2)], label: "Surveillance 2" }),
      loyalty(-1, {
        targets: [target.upTo(8, target.player("t"))],
        effects: [fx.discard(1, ref.target())],
        label: "Chaque joueur ciblé défausse une carte",
      }),
      loyalty(-2, {
        targets: [
          target.cardInGraveyard("t", { types: ["Creature"], maxManaValue: 3 }, "you", "carte de créature de VM 3 ou moins"),
        ],
        effects: [fx.toBattlefield(ref.target())],
        label: "Renvoie une créature de VM 3 ou moins",
      }),
      loyalty(-7, {
        targets: [target.player("t", "opponent")],
        effects: [
          fx.coinFlip("h1"),
          fx.coinFlip("h2"),
          fx.coinFlip("h3"),
          fx.coinFlip("h4"),
          fx.coinFlip("h5"),
          fx.playerEffectTimes(
            { skipTurn: true },
            amount.plus(amount.v("h1"), amount.v("h2"), amount.v("h3"), amount.v("h4"), amount.v("h5")),
            ref.target(),
          ),
        ],
        label: "Cinq pièces : l'adversaire passe X tours",
      }),
    ],
  },
};
