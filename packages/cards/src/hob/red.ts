/** The Hobbit — cartes rouges (lot A). */
import {
  AXE,
  activated,
  amount,
  type CardScript,
  chapter,
  cond,
  DRAGON_6,
  fx,
  modal,
  mode,
  ref,
  STONE_BOULDER,
  spell,
  staticAbility,
  TREASURE,
  target,
  triggered,
  when,
} from "./common";

/** Vos Trésors. */
const YOUR_TREASURES = { subtype: "Treasure", controller: "you" as const };

export const RED: Record<string, CardScript> = {
  // Storied : lu dans le texte.
  "Balin, Loremaster": {
    abilities: [
      triggered(
        when.enters({ subtype: "Dwarf", controller: "you" }),
        fx.may(
          "Défausser votre main pour piocher autant de cartes ?",
          fx.discard(amount.cardsIn("hand"), ref.you, { store: "d" }),
          fx.draw(amount.v("d")),
          ...fx.when(cond.enduringStory, fx.damage(amount.v("d"), ref.eachOpponent)),
        ),
        { label: "Défaussez votre main, piochez autant (récit durable : autant de blessures à chaque adversaire)" },
      ),
    ],
  },
  // Storied : lu dans le texte.
  "Bombur, Gentle Dreamer": {
    abilities: [
      staticAbility(
        "self",
        { addKeywords: ["doesntUntap"] },
        { condition: cond.not(cond.enduringStory), label: "Ne se dégage pas sans récit durable" },
      ),
    ],
  },
  "Bothersome Noisemaker": {
    abilities: [
      triggered(when.castSpell("you", { notTypes: ["Creature"] }), [fx.amass(ref.you, "Goblin", 1)], {
        label: "Sort non-créature : amassez des Gobelins 1",
      }),
    ],
  },
  "Burn, Burn, Tree and Fern": {
    abilities: [
      chapter([1], [fx.damage(6, ref.target())], {
        targets: [target.creature("t", { controller: "opponent" })],
        label: "Chapitre I — 6 blessures à une créature adverse",
      }),
      chapter([2], [fx.destroy(ref.target())], {
        targets: [target.permanent("t", ["Artifact"], { controller: "opponent" }, "artefact adverse")],
        label: "Chapitre II — détruit un artefact adverse",
      }),
      chapter([3, 4], [fx.addMana("R")], { label: "Chapitres III et IV — ajoutez {R}" }),
    ],
  },
  "Dáin Ironfoot": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.createTokens(AXE, 1, undefined, "axe"),
          // « Quand vous le faites, attachez-la à une créature ciblée que vous contrôlez. »
          fx.reflexive([target.creature("c", { controller: "you" })], [fx.attach(ref.target("c"), ref.target("axe"))], {
            axe: ref.stored("axe"),
          }),
        ],
        { label: "Une Hache, attachée à une de vos créatures" },
      ),
      triggered(when.attacksSelf, [fx.pumpAll({ attacking: true, equipped: true }, 0, 0, ["doubleStrike"])], {
        label: "Vos attaquants équipés ont la double initiative",
      }),
    ],
  },
  "Desert Were-Worm": {
    abilities: [
      staticAbility("self", { power: 2 }, { per: { subtype: "Mountain", controller: "you" }, label: "+2/+0 par Montagne" }),
      triggered(when.attackWith(1), [fx.untapAll({ attacking: true }), fx.extraCombat], {
        condition: cond.amountAtLeast(amount.totalPower({ attacking: true, controller: "you" }), 12),
        oncePerTurn: true,
        label: "Attaque de force totale 12 ou plus : dégagez les attaquants, combat supplémentaire",
      }),
    ],
  },
  "Desolation of Smaug": {
    spell: spell(
      [],
      [
        fx.damageAll(3, { types: ["Creature"], notSubtype: "Dragon" }),
        // « Quatre mana en n'importe quelle combinaison de couleurs » : une couleur choisie pour chaque mana.
        ...[1, 2, 3, 4].map(() => fx.addManaChoice(1, undefined, { spell: { subtype: "Dragon" } })),
      ],
    ),
  },
  // Piétinement : lu dans le texte.
  "Dori, Bearer of Friends": {
    abilities: [triggered(when.entersSelf, [fx.createTokens(TREASURE)], { label: "Un Trésor" })],
  },

  // --- Gandalf, Goblins' Bane // Flameshape -----------------------------------
  "Gandalf, Goblins' Bane": {
    abilities: [
      triggered(when.castSpell("you", { notTypes: ["Creature"] }), [fx.pump(ref.self, 1, 1), fx.damage(1, ref.eachOpponent)], {
        label: "Sort non-créature : +1/+1 et 1 blessure à chaque adversaire",
      }),
    ],
  },
  Flameshape: {
    // Approximation : les cartes sont exilées face visible (le moteur n'a pas d'exil face cachée).
    spell: spell(
      [],
      [
        fx.exileTop(ref.you, 2, "e", "you"),
        fx.grantPlay(ref.stored("e"), { forever: true, condition: cond.controls({ subtype: "Wizard" }) }),
      ],
    ),
  },

  // Portée : lue dans le texte.
  "Gandalf, Spark Starter": {
    abilities: [
      triggered(when.entersSelf, [fx.damageDivided(3, ref.target())], {
        targets: [target.between(1, 3, target.any())],
        label: "3 blessures réparties entre une, deux ou trois cibles",
      }),
    ],
  },

  // --- Glóin the Mighty // Easy Pickings --------------------------------------
  "Glóin the Mighty": {
    abilities: [triggered(when.step("main1", "you"), [fx.addMana("R", "R")], { label: "Ajoutez {R}{R}" })],
  },
  "Easy Pickings": { spell: spell([], [fx.damageAll(1, { types: ["Creature"], controller: "opponent" })]) },

  // Célérité : lue dans le texte.
  "Goblin-town Flunkies": {
    abilities: [triggered(when.entersSelf, [fx.amass(ref.you, "Goblin", 1)], { label: "Amassez des Gobelins 1" })],
  },
  "Gundabad Opportunist": {
    abilities: [
      triggered(when.entersSelf, [fx.impulse(1, "yourNextTurn")], {
        label: "Exile la carte du dessus, jouable jusqu'à la fin de votre prochain tour",
      }),
    ],
  },
  // Portée, piétinement : lus dans le texte.
  "Iron Hills Stalwart": {
    abilities: [
      triggered(when.entersSelf, [fx.attach(ref.target("c"), ref.target("e"))], {
        targets: [
          target.permanent("e", ["Artifact"], { subtype: "Equipment", controller: "you" }, "Équipement que vous contrôlez"),
          target.upTo(1, target.creature("c", { controller: "you" })),
        ],
        label: "Attache un de vos Équipements à une de vos créatures",
      }),
    ],
  },
  // Cycle de Montagne : lu dans le texte.
  "Last Light of Durin's Day": {
    abilities: [
      triggered(
        when.enters({ subtype: "Mountain", controller: "you" }),
        [
          fx.counters(ref.self, "quest"),
          ...fx.when(
            cond.counterAtLeast("quest", 6),
            fx.sacrifice(ref.you, { self: true }, 1, { store: "s" }),
            // « Cherchez dans votre main et/ou votre bibliothèque une carte de Dragon » : dans la main d'abord, sinon
            // dans la bibliothèque (qui est alors mélangée).
            ...fx.when(
              cond.v("s"),
              fx.pickFromZone(
                "hand",
                { subtype: "Dragon" },
                { to: "battlefield" },
                { min: 0, store: "h", prompt: "Choisissez un Dragon de votre main (aucun : cherchez dans la bibliothèque)" },
              ),
              ...fx.when(cond.not(cond.v("h")), fx.search({ subtype: "Dragon" }, { to: "battlefield" })),
            ),
          ),
        ],
        { label: "Un marqueur de quête ; à six, sacrifiez-le : un Dragon sur le champ de bataille" },
      ),
    ],
  },
  "The Misty Mountains Cold": {
    abilities: [
      chapter(
        [1, 2, 3, 4],
        [
          fx.createTokens(TREASURE),
          ...fx.when(
            cond.controls(YOUR_TREASURES, 4),
            fx.sacrifice(ref.you, { self: true }, 1, { store: "s" }),
            ...fx.when(cond.v("s"), fx.createTokens(DRAGON_6)),
          ),
        ],
        { label: "Un Trésor ; avec quatre Trésors, sacrifiez la Saga : un Dragon 6/6 volant" },
      ),
    ],
  },
  "Misty Mountains Raider": {
    abilities: [triggered(when.attackWith(1), [fx.amass(ref.you, "Goblin", 2)], { label: "Amassez des Gobelins 2" })],
  },
  // Storied : lu dans le texte.
  "Óin the Brave": {
    abilities: [
      staticAbility(
        "self",
        { power: 1, addKeywords: ["haste"] },
        { condition: cond.enduringStory, label: "Récit durable : +1/+0 et la célérité" },
      ),
      activated({ mana: "{1}", tap: true, discard: 1, effects: [fx.draw(1)], label: "Défaussez une carte : piochez une carte" }),
    ],
  },
  "Pinecone Strike": {
    // « Choisissez l'un ou les deux. »
    spell: modal(
      mode(
        "3 blessures à une créature",
        [target.creature("c")],
        [fx.exileIfDies(ref.target("c")), fx.damage(3, ref.target("c"))],
      ),
      mode(
        "Détruit un jeton d'artefact",
        [target.permanent("a", ["Artifact"], { token: true }, "jeton d'artefact")],
        [fx.destroy(ref.target("a"))],
      ),
      mode(
        "Les deux",
        [target.creature("c"), target.permanent("a", ["Artifact"], { token: true }, "jeton d'artefact")],
        [fx.exileIfDies(ref.target("c")), fx.damage(3, ref.target("c")), fx.destroy(ref.target("a"))],
      ),
    ),
  },
  // Équiper {3} : lu dans le texte.
  "Ragged Short Spear": {
    abilities: [
      triggered(when.entersSelf, [fx.discard(1, ref.you, { optional: true, store: "d" }), ...fx.when(cond.v("d"), fx.draw(2))], {
        label: "Défaussez une carte : piochez deux cartes",
      }),
      staticAbility("attached", { power: 2 }, { label: "+2/+0" }),
    ],
  },

  // --- Smaug, the Great Calamity // Spew Flame --------------------------------
  // Vol : lu dans le texte.
  "Smaug, the Great Calamity": {},
  "Spew Flame": { spell: spell([target.creature()], [fx.damage(5, ref.target())]) },

  "Smaug's Fury": {
    spell: spell([target.creature()], [fx.pump(ref.target(), 3, 0, ["reach", "firstStrike"])]),
  },
  "Snowslope Hunter": {
    abilities: [
      activated({
        sacrificeOther: { filter: { anyOf: [{ types: ["Creature"] }, { types: ["Artifact"] }] } },
        activationCondition: cond.yourTurn,
        oncePerTurn: true,
        effects: [fx.impulse(1, "yourNextTurn")],
        label: "Sacrifiez une autre créature ou un artefact : exilez la carte du dessus, jouable jusqu'à votre prochain tour",
      }),
    ],
  },
  "Stone-Giant of High Pass": {
    abilities: [
      ...[when.entersSelf, when.attacksSelf].map((trigger) =>
        triggered(trigger, [fx.createTokens(STONE_BOULDER)], { label: "Un Rocher (Mur 3/1 défenseur)" }),
      ),
      activated({
        mana: "{2}{R}",
        sacrificeOther: { filter: { types: ["Artifact"] } },
        targets: [target.any()],
        effects: [fx.damage(4, ref.target())],
        label: "Sacrifiez un artefact : 4 blessures",
      }),
    ],
  },
  "Tidings of War": {
    flashback: "{3}{R}",
    spell: spell(
      [],
      [
        ...fx.when(cond.spellCastFromGraveyard, fx.amass(ref.you, "Goblin", 3)),
        ...fx.when(cond.not(cond.spellCastFromGraveyard), fx.amass(ref.you, "Goblin", 1)),
      ],
    ),
  },
};
