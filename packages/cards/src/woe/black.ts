/** Wilds of Eldraine — cartes noires. */

import type { ObjectFilter, TriggerSpec } from "@mtgx/engine";
import {
  activated,
  amount,
  type CardScript,
  CURSED_ROLE,
  chapter,
  cond,
  createRole,
  entersWith,
  FOOD,
  fx,
  HUMAN_W,
  mode,
  RAT_NO_BLOCK,
  ref,
  spell,
  spree,
  staticAbility,
  target,
  triggered,
  triggeredModal,
  WICKED_ROLE,
  when,
} from "./common";

/** « un artefact, un enchantement ou un jeton » (Marchandage, Devouring Sugarmaw, Lich-Knights' Conquest…). */
const ARTIFACT_ENCHANTMENT_TOKEN: ObjectFilter = { anyOf: [{ types: ["Artifact", "Enchantment"] }, { token: true }] };

/** « Chaque fois qu'un enchantement que vous contrôlez est mis dans un cimetière depuis le champ de bataille » */
const YOUR_ENCHANTMENT_TO_GRAVEYARD: TriggerSpec = {
  on: "leaves",
  who: { types: ["Enchantment"], controller: "you" },
  to: "graveyard",
};

/** « Sacrifiez un nombre quelconque d'artefacts, d'enchantements et/ou de jetons » : leur nombre est mémorisé sous `n`. */
const sacrificeAnyNumber = (store: string) =>
  fx.sacrifice(ref.you, ARTIFACT_ENCHANTMENT_TOKEN, amount.count({ ...ARTIFACT_ENCHANTMENT_TOKEN, controller: "you" }), {
    optional: true,
    store,
  });

const YOUR_CREATURE = (id = "c") => target.creature(id, { controller: "you" });

export const BLACK: Record<string, CardScript> = {
  "Tangled Colony": {
    keywords: ["cantBlock"],
    abilities: [
      triggered(when.diesSelf, [fx.createTokens(RAT_NO_BLOCK, amount.lkiDamage)], {
        label: "Un Rat 1/1 par blessure qui lui a été infligée ce tour-ci",
      }),
    ],
  },
  "Twisted Sewer-Witch": {
    abilities: [
      triggered(
        when.entersSelf,
        [fx.createTokens(RAT_NO_BLOCK), ...createRole(WICKED_ROLE, ref.permanentsOf(ref.you, { subtype: "Rat" }))],
        { label: "Un Rat 1/1, puis un Rôle Méchant attaché à chaque Rat que vous contrôlez" },
      ),
    ],
  },
  "Lord Skitter's Blessing": {
    abilities: [
      triggered(when.entersSelf, createRole(WICKED_ROLE), {
        targets: [target.creature("t", { controller: "you" })],
        label: "Un Rôle Méchant attaché à une créature que vous contrôlez",
      }),
      triggered(when.step("draw", "you"), [fx.loseLife(1), fx.draw(1)], {
        condition: cond.controls({ types: ["Creature"], enchanted: true }),
        label: "Vous contrôlez une créature enchantée : perdez 1 PV, piochez une carte de plus",
      }),
    ],
  },
  "Ashiok's Reaper": {
    abilities: [
      triggered(YOUR_ENCHANTMENT_TO_GRAVEYARD, [fx.draw(1)], { label: "Un de vos enchantements au cimetière : piochez" }),
    ],
  },
  "Back for Seconds": {
    // Marchandé : une des cartes ciblées de VM 4 ou moins peut arriver sur le champ de bataille au lieu d'aller en main.
    spell: spell(
      [target.upTo(2, target.cardInGraveyard("t", { types: ["Creature"] }, "you", "carte de créature de votre cimetière"))],
      [
        ...fx.when(
          cond.kicked,
          fx.pickFromZone(
            "graveyard",
            { types: ["Creature"] },
            { to: "battlefield" },
            {
              count: 1,
              min: 0,
              pool: ref.target(),
              maxManaValue: 4,
              prompt: "Vous pouvez mettre l'une d'elles (VM 4 ou moins) sur le champ de bataille",
            },
          ),
        ),
        fx.toHand(ref.target()),
      ],
    ),
  },
  "Barrow Naughty": {
    abilities: [
      staticAbility(
        "self",
        { addKeywords: ["lifelink"] },
        {
          condition: cond.controls({ subtype: "Faerie", other: true }),
          label: "Lien de vie tant que vous contrôlez une autre Fée",
        },
      ),
      activated({ mana: "{2}{B}", effects: [fx.pump(ref.self, 1, 0)], label: "+1/+0 jusqu'à la fin du tour" }),
    ],
  },
  "Beseech the Mirror": {
    // Approximation : la carte est exilée face visible (et non face cachée).
    spell: spell(
      [],
      [
        fx.search({}, { to: "exile", faceDown: "you" }, 1, undefined, "s"),
        ...fx.when(cond.kicked, fx.castNow(ref.stored("s"), { free: true, maxManaValue: 4 })),
        ...fx.when(cond.amountAtLeast(amount.inExile(ref.stored("s")), 1), fx.toHand(ref.stored("s"))),
      ],
    ),
  },
  "Candy Grapple": {
    spell: spell([target.creature()], [fx.pump(ref.target(), amount.kicked(-5, -3), amount.kicked(-5, -3))]),
  },
  "Conceited Witch": {},
  "Price of Beauty": { spell: spell([YOUR_CREATURE("t")], createRole(WICKED_ROLE)) },
  "Dream Spoilers": {
    abilities: [
      triggered(when.castSpellOffTurn("you"), [fx.pump(ref.target(), -1, -1)], {
        targets: [target.optional(target.creature("t", { controller: "opponent" }))],
        label: "Sort lancé pendant le tour d'un adversaire : -1/-1 à une créature adverse",
      }),
    ],
  },
  "Ego Drain": {
    spell: spell(
      [target.player("t", "opponent")],
      [
        fx.discard(1, ref.target(), { filter: { nonland: true }, chooser: "controller" }),
        ...fx.when(cond.not(cond.controls({ subtype: "Faerie" })), fx.exileFromOwnHand(ref.you, "e")),
      ],
    ),
  },
  "Eriette's Whisper": {
    spell: spell(
      [target.player("p", "opponent"), target.optional(YOUR_CREATURE())],
      [fx.discard(2, ref.target("p")), ...createRole(WICKED_ROLE, ref.target("c"))],
    ),
  },
  "Faerie Dreamthief": {
    abilities: [
      triggered(when.entersSelf, [fx.surveil(1)], { label: "Surveillance 1" }),
      activated({
        mana: "{2}{B}",
        fromGraveyard: true,
        exileSelf: true,
        effects: [fx.draw(1), fx.loseLife(1)],
        label: "Depuis le cimetière : piochez une carte, perdez 1 PV",
      }),
    ],
  },
  "Faerie Fencing": {
    // « si vous contrôliez une Fée en lançant ce sort » : vérifié au lancement.
    whenCast: cond.controls({ subtype: "Faerie" }),
    spell: spell(
      [target.creature()],
      [
        fx.pump(ref.target(), amount.neg(amount.x), amount.neg(amount.x)),
        ...fx.when(cond.metWhenCast, fx.pump(ref.target(), -3, -3)),
      ],
    ),
  },
  "Feed the Cauldron": {
    spell: spell(
      [target.creature("t", { maxManaValue: 3 })],
      [fx.destroy(ref.target()), ...fx.when(cond.yourTurn, fx.createTokens(FOOD))],
    ),
  },
  "Fell Horseman": {
    abilities: [
      triggered(when.diesSelf, [fx.moveTo(ref.selfCard, { to: "libraryBottom" })], {
        label: "Va au-dessous de la bibliothèque de son propriétaire",
      }),
    ],
  },
  "Deathly Ride": {
    spell: spell([target.cardInGraveyard("t", { types: ["Creature"] })], [fx.toHand(ref.target())]),
  },
  "Gumdrop Poisoner": {
    abilities: [
      triggered(
        when.entersSelf,
        [fx.pump(ref.target(), amount.neg(amount.lifeGainedThisTurn), amount.neg(amount.lifeGainedThisTurn))],
        {
          targets: [target.optional(target.creature())],
          label: "-X/-X, X étant les points de vie gagnés ce tour-ci",
        },
      ),
    ],
  },
  "Tempt with Treats": { spell: spell([], [fx.createTokens(FOOD)]) },
  "High Fae Negotiator": {
    abilities: [
      triggered(when.entersSelf, fx.drain(3), {
        condition: cond.kicked,
        label: "Marchandée : chaque adversaire perd 3 PV, vous gagnez 3 PV",
      }),
    ],
  },
  "Hopeless Nightmare": {
    abilities: [
      triggered(when.entersSelf, [fx.discard(1, ref.eachOpponent), fx.loseLife(2, ref.eachOpponent)], {
        label: "Chaque adversaire défausse une carte et perd 2 PV",
      }),
      triggered(when.putIntoGraveyardSelf, [fx.scry(2)], { label: "Regard 2" }),
      activated({ mana: "{2}{B}", effects: [fx.sacrificeIt(ref.self)], label: "Sacrifiez cet enchantement" }),
    ],
  },
  "Lich-Knights' Conquest": {
    spell: spell(
      [],
      [
        sacrificeAnyNumber("n"),
        fx.pickFromZone(
          "graveyard",
          { types: ["Creature"] },
          { to: "battlefield" },
          { count: amount.v("n"), prompt: "Autant de cartes de créature de votre cimetière que de permanents sacrifiés" },
        ),
      ],
    ),
  },
  "Lord Skitter, Sewer King": {
    abilities: [
      triggered(when.enters({ subtype: "Rat", controller: "you", other: true }), [fx.exileCard(ref.target())], {
        targets: [target.optional(target.cardInGraveyard("t", {}, "opponent", "carte du cimetière d'un adversaire"))],
        label: "Un autre Rat arrive : exilez une carte du cimetière d'un adversaire",
      }),
      triggered(when.yourCombat, [fx.createTokens(RAT_NO_BLOCK)], { label: "Un Rat 1/1 qui ne peut pas bloquer" }),
    ],
  },
  "Lord Skitter's Butcher": {
    abilities: [
      triggeredModal(
        when.entersSelf,
        [
          mode("Un Rat 1/1 qui ne peut pas bloquer", [], [fx.createTokens(RAT_NO_BLOCK)]),
          mode(
            "Sacrifiez une autre créature : regard 2, piochez",
            [],
            [
              fx.sacrifice(ref.you, { types: ["Creature"], other: true }, 1, { optional: true, store: "s" }),
              ...fx.when(cond.v("s"), fx.scry(2), fx.draw(1)),
            ],
          ),
          mode(
            "Vos créatures gagnent la menace",
            [],
            [fx.modifyAll({ types: ["Creature"], controller: "you" }, { addKeywords: ["menace"] })],
          ),
        ],
        { label: "Choisissez un mode" },
      ),
    ],
  },
  Mintstrosity: {
    abilities: [triggered(when.diesSelf, [fx.createTokens(FOOD)], { label: "Une Nourriture" })],
  },
  "Not Dead After All": {
    spell: spell(
      [YOUR_CREATURE("t")],
      [
        fx.modify(ref.target(), {
          addAbilities: [
            triggered(
              when.diesSelf,
              [
                fx.moveTo(ref.selfCard, { to: "battlefield", tapped: true }, { name: "back" }),
                ...createRole(WICKED_ROLE, ref.stored("back")),
              ],
              { label: "Revient engagée avec un Rôle Méchant" },
            ),
          ],
        }),
      ],
    ),
  },
  "Rankle's Prank": {
    // « Choisissez un ou plusieurs » : toutes les combinaisons, dans l'ordre imprimé.
    spell: spree(
      { cost: "{0}", label: "Chaque joueur défausse deux cartes", effects: [fx.discard(2, ref.eachPlayer)] },
      { cost: "{0}", label: "Chaque joueur perd 4 PV", effects: [fx.loseLife(4, ref.eachPlayer)] },
      {
        cost: "{0}",
        label: "Chaque joueur sacrifie deux créatures",
        effects: [fx.sacrifice(ref.eachPlayer, { types: ["Creature"] }, 2)],
      },
    ),
  },
  "Rat Out": {
    spell: spell([target.optional(target.creature())], [fx.pump(ref.target(), -1, -1), fx.createTokens(RAT_NO_BLOCK)]),
  },
  "Rowan's Grim Search": {
    spell: spell(
      [],
      [
        ...fx.when(cond.kicked, fx.lookAtTop(4, { count: 2, to: { to: "libraryTop" }, rest: "graveyard" })),
        fx.draw(2),
        fx.loseLife(2),
      ],
    ),
  },
  "Scream Puff": {
    abilities: [triggered(when.combatDamageToPlayer, [fx.createTokens(FOOD)], { label: "Une Nourriture" })],
  },
  "Shatter the Oath": {
    spell: spell(
      [target.permanent("t", ["Creature", "Enchantment"], {}, "créature ou enchantement"), target.optional(YOUR_CREATURE())],
      [fx.destroy(ref.target()), ...createRole(WICKED_ROLE, ref.target("c"))],
    ),
  },
  "Specter of Mortality": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.pickFromZone(
            "graveyard",
            { types: ["Creature"] },
            { to: "exile" },
            {
              count: amount.countIn("graveyard", { types: ["Creature"] }),
              min: 0,
              store: "ex",
              prompt: "Vous pouvez exiler des cartes de créature de votre cimetière",
            },
          ),
          // « Quand vous le faites » : capacité réflexive, X étant le nombre de cartes exilées.
          ...fx.when(
            cond.v("ex"),
            fx.reflexive(
              [],
              [
                fx.pumpAll(
                  { types: ["Creature"], other: true },
                  amount.neg(amount.refCount(ref.target("ex"))),
                  amount.neg(amount.refCount(ref.target("ex"))),
                ),
              ],
              { ex: ref.stored("ex") },
            ),
          ),
        ],
        { label: "Exilez des cartes de créature : les autres créatures prennent -X/-X" },
      ),
    ],
  },
  "Spiteful Hexmage": {
    abilities: [
      triggered(when.entersSelf, createRole(CURSED_ROLE), {
        targets: [YOUR_CREATURE("t")],
        label: "Un Rôle Maudit sur une créature que vous contrôlez",
      }),
    ],
  },
  "Stingblade Assassin": {
    abilities: [
      triggered(when.entersSelf, [fx.destroy(ref.target())], {
        targets: [
          target.permanent("t", ["Creature"], { controller: "opponent", damaged: true }, "créature adverse blessée ce tour-ci"),
        ],
        label: "Détruisez une créature adverse blessée ce tour-ci",
      }),
    ],
  },
  "Sugar Rush": { spell: spell([target.creature()], [fx.pump(ref.target(), 3, 0), fx.draw(1)]) },
  "Sweettooth Witch": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(FOOD)], { label: "Une Nourriture" }),
      activated({
        mana: "{2}",
        sacrificeOther: { filter: { subtype: "Food" } },
        targets: [target.player()],
        effects: [fx.loseLife(2, ref.target())],
        label: "Le joueur ciblé perd 2 PV",
      }),
    ],
  },
  "Taken by Nightmares": {
    spell: spell(
      [target.creature()],
      [fx.exile(ref.target()), ...fx.when(cond.controls({ types: ["Enchantment"] }), fx.scry(2))],
    ),
  },
  "Virtue of Persistence": {
    abilities: [
      triggered(when.yourUpkeep, [fx.toBattlefield(ref.target(), { underYourControl: true })], {
        targets: [target.cardInGraveyard("t", { types: ["Creature"] }, "any", "carte de créature d'un cimetière")],
        label: "Une carte de créature d'un cimetière arrive sous votre contrôle",
      }),
    ],
  },
  "Locthwain Scorn": { spell: spell([target.creature()], [fx.pump(ref.target(), -3, -3), fx.gainLife(2)]) },
  "Voracious Vermin": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(RAT_NO_BLOCK)], { label: "Un Rat 1/1 qui ne peut pas bloquer" }),
      triggered(when.dies({ types: ["Creature"], controller: "you", other: true }), [fx.addCounters(ref.self, 1)], {
        label: "Une autre de vos créatures meurt : un marqueur +1/+1",
      }),
    ],
  },
  "Warehouse Tabby": {
    abilities: [
      triggered(YOUR_ENCHANTMENT_TO_GRAVEYARD, [fx.createTokens(RAT_NO_BLOCK)], {
        label: "Un de vos enchantements au cimetière : un Rat",
      }),
      activated({
        mana: "{1}{B}",
        effects: [fx.pump(ref.self, 0, 0, ["deathtouch"])],
        label: "Contact mortel jusqu'à la fin du tour",
      }),
    ],
  },
  "Wicked Visitor": {
    abilities: [
      triggered(YOUR_ENCHANTMENT_TO_GRAVEYARD, [fx.loseLife(1, ref.eachOpponent)], {
        label: "Un de vos enchantements au cimetière : chaque adversaire perd 1 PV",
      }),
    ],
  },
  "The Witch's Vanity": {
    abilities: [
      chapter([1], [fx.destroy(ref.target())], {
        targets: [target.creature("t", { controller: "opponent", maxManaValue: 2 })],
        label: "Détruisez une créature adverse de VM 2 ou moins",
      }),
      chapter([2], [fx.createTokens(FOOD)], { label: "Une Nourriture" }),
      chapter([3], createRole(WICKED_ROLE), {
        targets: [YOUR_CREATURE("t")],
        label: "Un Rôle Méchant sur une créature que vous contrôlez",
      }),
    ],
  },
  "Callous Sell-Sword": {
    abilities: [
      entersWith({
        counters: amount.yourCreaturesDiedThisTurn,
        label: "Un marqueur +1/+1 par créature morte sous votre contrôle ce tour-ci",
      }),
    ],
  },
  "Burn Together": {
    spell: spell(
      [YOUR_CREATURE("c"), { ...target.any("t"), otherThan: ["c"] }],
      [fx.damage(amount.powerOf(ref.target("c")), ref.target("t"), ref.target("c")), fx.sacrificeIt(ref.target("c"))],
    ),
  },
  "Cruel Somnophage": { cdaPT: amount.countIn("graveyard", { types: ["Creature"] }, "all") },
  "Can't Wake Up": { spell: spell([target.player()], [fx.mill(4, ref.target())]) },
  "Devouring Sugarmaw": {
    abilities: [
      triggered(
        when.yourUpkeep,
        [
          fx.sacrifice(ref.you, ARTIFACT_ENCHANTMENT_TOKEN, 1, { optional: true, store: "s" }),
          ...fx.when(cond.not(cond.v("s")), fx.tap(ref.self)),
        ],
        { label: "Sacrifiez un artefact, un enchantement ou un jeton ; sinon, engagez-la" },
      ),
    ],
  },
  "Have for Dinner": { spell: spell([], [fx.createTokens(HUMAN_W), fx.createTokens(FOOD)]) },
  "Spellscorn Coven": {
    abilities: [triggered(when.entersSelf, [fx.discard(1, ref.eachOpponent)], { label: "Chaque adversaire défausse une carte" })],
  },
  "Take It Back": { spell: spell([target.spell()], [fx.bounce(ref.target())]) },
  "Experimental Confectioner": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(FOOD)], { label: "Une Nourriture" }),
      triggered(when.sacrifice({ subtype: "Food" }), [fx.createTokens(RAT_NO_BLOCK)], {
        label: "Vous sacrifiez une Nourriture : un Rat",
      }),
    ],
  },
  "Malevolent Witchkite": {
    abilities: [
      triggered(when.entersSelf, [sacrificeAnyNumber("n"), fx.draw(amount.v("n"))], {
        label: "Sacrifiez des artefacts, enchantements et/ou jetons, puis piochez autant",
      }),
    ],
  },
  "Old Flitterfang": {
    abilities: [
      triggered(when.eachEndStep, [fx.createTokens(FOOD)], {
        condition: cond.morbid,
        label: "Une créature est morte ce tour-ci : une Nourriture",
      }),
      activated({
        mana: "{2}{B}",
        sacrificeOther: { filter: { types: ["Creature", "Artifact"], other: true } },
        effects: [fx.pump(ref.self, 2, 2)],
        label: "+2/+2 jusqu'à la fin du tour",
      }),
    ],
  },
};
