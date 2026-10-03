/** Bloomburrow — cartes blanches. */
import {
  activated,
  amount,
  type CardScript,
  CREATURE_YOU_CONTROL,
  cond,
  entersAndSacrificed,
  FISH,
  FLYER_YOU,
  FOOD_ABILITY,
  fx,
  GAINED_OR_LOST,
  kin,
  mode,
  NONFLYER_YOU,
  pawprint,
  playerStatic,
  RABBIT,
  ref,
  spell,
  staticAbility,
  TOKEN_YOU,
  TREASURE,
  target,
  targetObj,
  triggered,
  triggeredModal,
  valiant,
  WALL,
  when,
} from "./common";

const RABBIT_BAT_BIRD_MOUSE = ["Rabbit", "Bat", "Bird", "Mouse"];

export const WHITE: Record<string, CardScript> = {
  "Beza, the Bounding Spring": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          ...fx.when(cond.opponentHasMore("lands"), fx.createTokens(TREASURE)),
          ...fx.when(cond.opponentHasMore("life"), fx.gainLife(4)),
          ...fx.when(cond.opponentHasMore("creatures"), fx.createTokens(FISH, 2)),
          ...fx.when(cond.opponentHasMore("hand"), fx.draw(1)),
        ],
        { label: "Rattrapage : Trésor, 4 PV, Poissons, carte" },
      ),
    ],
  },
  "Brave-Kin Duo": {
    abilities: [
      activated({
        mana: "{1}",
        tap: true,
        sorcerySpeed: true,
        targets: [target.creature()],
        effects: [fx.pump(ref.target(), 1, 1)],
        label: "+1/+1",
      }),
    ],
  },
  "Builder's Talent": {
    abilities: [triggered(when.entersSelf, [fx.createTokens(WALL)], { label: "Mur 0/4 avec le défenseur" })],
    classLevels: [
      [
        triggered(when.enters({ controller: "you", notTypes: ["Creature", "Land"] }), [fx.addCounters(ref.target(), 1)], {
          targets: [target.creature("t", { controller: "you" })],
          batched: true,
          label: "Marqueur +1/+1",
        }),
      ],
      [
        triggered(when.classLevel(3), [fx.toBattlefield(ref.target())], {
          targets: [
            target.cardInGraveyard(
              "t",
              { permanent: true, notTypes: ["Creature", "Land"] },
              "you",
              "carte de permanent non-créature non-terrain",
            ),
          ],
          label: "Renvoie un permanent non-créature",
        }),
      ],
    ],
  },
  "Caretaker's Talent": {
    abilities: [
      triggered(when.enters(TOKEN_YOU), [fx.draw(1)], { batched: true, oncePerTurn: true, label: "Piochez une carte" }),
    ],
    classLevels: [
      [
        triggered(when.classLevel(2), [fx.copyToken(ref.target())], {
          targets: [targetObj("t", TOKEN_YOU, "jeton que vous contrôlez")],
          label: "Copie d'un jeton",
        }),
      ],
      [staticAbility({ types: ["Creature"], token: true, controller: "you" }, { power: 2, toughness: 2 }, { label: "+2/+2" })],
    ],
  },
  "Carrot Cake": {
    abilities: [...entersAndSacrificed([fx.createTokens(RABBIT), fx.scry(1)], "Lapin 1/1, regard 1"), FOOD_ABILITY],
  },
  "Crumb and Get It": {
    spell: spell(
      [target.creature("t", { controller: "you" })],
      [fx.pump(ref.target(), 2, 2), ...fx.when(cond.gift, fx.pump(ref.target(), 0, 0, ["indestructible"]))],
    ),
  },
  "Dawn's Truce": {
    spell: spell(
      [],
      [
        fx.emblem(
          "Dawn's Truce",
          "Vous avez la défense talismanique jusqu'à la fin du tour.",
          [playerStatic({ hexproof: true })],
          false,
          true,
        ),
        fx.modifyAll({ controller: "you" }, { addKeywords: ["hexproof"] }),
        ...fx.when(cond.gift, fx.modifyAll({ controller: "you" }, { addKeywords: ["indestructible"] })),
      ],
    ),
  },
  "Dewdrop Cure": {
    spell: spell(
      [
        {
          ...target.upTo(
            2,
            target.cardInGraveyard("t", { types: ["Creature"], maxManaValue: 2 }, "you", "carte de créature de VM 2 ou moins"),
          ),
          kickedCount: 3,
        },
      ],
      [fx.toBattlefield(ref.target())],
    ),
  },
  "Driftgloom Coyote": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          ...fx.when(cond.refMatches(ref.target(), { maxPower: 2 }), fx.addCounters(ref.self, 1)),
          fx.exileUntilLeaves(ref.target()),
        ],
        { targets: [target.creature("t", { controller: "opponent" })], label: "Exile une créature adverse" },
      ),
    ],
  },
  "Essence Channeler": {
    abilities: [
      staticAbility("self", { addKeywords: ["flying", "vigilance"] }, { condition: cond.lostLife, label: "Vol et vigilance" }),
      triggered(when.gainLife, [fx.addCounters(ref.self, 1)], { label: "Marqueur +1/+1" }),
      triggered(when.diesSelf, [fx.lkiCountersTo(ref.target())], {
        targets: [target.creature("t", { controller: "you" })],
        label: "Ses marqueurs sur une créature",
      }),
    ],
  },
  "Feather of Flight": {
    enchant: { filter: { types: ["Creature"] }, label: "créature" },
    abilities: [
      triggered(when.entersSelf, [fx.draw(1)], { label: "Piochez une carte" }),
      staticAbility("attached", { power: 1, addKeywords: ["flying"] }, { label: "+1/+0 et vol" }),
    ],
  },
  "Flowerfoot Swordmaster": {
    abilities: [valiant([fx.pumpAll(kin(["Mouse"]), 1, 0)], { label: "Souris +1/+0" })],
  },
  "Harvestrite Host": {
    abilities: [
      triggered(
        when.enters(kin(["Rabbit"])),
        [
          fx.pump(ref.target(), 1, 0),
          fx.countResolution("n"),
          ...fx.when(cond.all(cond.v("n", 2), cond.not(cond.v("n", 3))), fx.draw(1)),
        ],
        { targets: [target.creature("t", { controller: "you" })], label: "+1/+0 (carte à la deuxième fois)" },
      ),
    ],
  },
  "Hop to It": { spell: spell([], [fx.createTokens(RABBIT, 3)]) },
  "Intrepid Rabbit": {
    abilities: [
      triggered(when.entersSelf, [fx.pump(ref.target(), 1, 1)], {
        targets: [target.creature("t", { controller: "you" })],
        label: "+1/+1",
      }),
    ],
  },
  "Jackdaw Savior": {
    // Approximation : la carte est choisie à la résolution (sans cibler).
    abilities: [
      triggered(
        when.dies(FLYER_YOU),
        [
          fx.pickFromZone(
            "graveyard",
            { types: ["Creature"] },
            { to: "battlefield" },
            {
              maxManaValue: amount.plus(amount.manaValueOf(ref.eventObject), -1),
              prompt: "Carte de créature de valeur de mana inférieure",
            },
          ),
        ],
        { label: "Renvoie une créature de VM inférieure" },
      ),
    ],
  },
  "Jolly Gerbils": {
    abilities: [triggered(when.giveGift, [fx.draw(1)], { label: "Piochez une carte" })],
  },
  "Lifecreed Duo": {
    abilities: [
      triggered(when.enters({ types: ["Creature"], controller: "you", other: true }), [fx.gainLife(1)], { label: "+1 PV" }),
    ],
  },
  "Mabel's Mettle": {
    spell: spell(
      [target.creature("t"), { ...target.upTo(1, target.creature("u")), otherThan: ["t"] }],
      [fx.pump(ref.target(), 2, 2), fx.pump(ref.target("u"), 1, 1)],
    ),
  },
  "Mouse Trapper": {
    abilities: [
      valiant([fx.tap(ref.target())], {
        targets: [target.creature("t", { controller: "opponent" })],
        label: "Engage une créature",
      }),
    ],
  },
  "Nettle Guard": {
    abilities: [
      valiant([fx.pump(ref.self, 0, 2)], { label: "+0/+2" }),
      activated({
        mana: "{1}",
        sacrifice: true,
        targets: [target.permanent("t", ["Artifact", "Enchantment"], {}, "artefact ou enchantement")],
        effects: [fx.destroy(ref.target())],
        label: "Détruit un artefact ou un enchantement",
      }),
    ],
  },
  "Parting Gust": {
    spell: spell(
      [target.creature("t", { token: false })],
      [
        fx.exileCard(ref.target(), { name: "k" }),
        ...fx.when(
          cond.not(cond.gift),
          fx.delayed([fx.toBattlefield(ref.target("k"), { counters: { kind: "+1/+1", n: 1 } })], { k: ref.stored("k") }),
        ),
      ],
    ),
  },
  "Pileated Provisioner": {
    abilities: [
      triggered(when.entersSelf, [fx.addCounters(ref.target(), 1)], {
        targets: [targetObj("t", NONFLYER_YOU, "créature sans le vol que vous contrôlez")],
        label: "Marqueur +1/+1",
      }),
    ],
  },
  "Rabbit Response": {
    spell: spell(
      [],
      [fx.pumpAll(CREATURE_YOU_CONTROL, 2, 1), ...fx.when(cond.controls({ types: ["Creature"], subtype: "Rabbit" }), fx.scry(2))],
    ),
  },
  "Repel Calamity": {
    spell: spell(
      [
        targetObj(
          "t",
          { types: ["Creature"], anyOf: [{ minPower: 4 }, { minToughness: 4 }] },
          "créature de force ou d'endurance 4 ou plus",
        ),
      ],
      [fx.destroy(ref.target())],
    ),
  },
  "Salvation Swan": {
    abilities: [
      triggered(
        when.enters(kin(["Bird"])),
        [
          fx.exileCard(ref.target(), { name: "k" }),
          fx.delayed([fx.toBattlefield(ref.target("k"), { counters: { kind: "flying", n: 1 } })], { k: ref.stored("k") }),
        ],
        {
          targets: [target.upTo(1, targetObj("t", NONFLYER_YOU, "créature sans le vol que vous contrôlez"))],
          label: "Exile une créature (elle revient avec un marqueur de vol)",
        },
      ),
    ],
  },
  "Season of the Burrow": {
    spell: pawprint(
      { pips: 1, label: "Lapin 1/1", effects: [fx.createTokens(RABBIT)] },
      {
        pips: 2,
        label: "Exile un permanent non-terrain (son contrôleur pioche)",
        targets: [target.nonland("t")],
        effects: [fx.draw(1, ref.controllerOf(ref.target())), fx.exile(ref.target())],
      },
      {
        pips: 3,
        label: "Renvoie un permanent de VM 3 ou moins (marqueur d'indestructible)",
        targets: [
          target.cardInGraveyard("t", { permanent: true, maxManaValue: 3 }, "you", "carte de permanent de VM 3 ou moins"),
        ],
        effects: [fx.toBattlefield(ref.target(), { counters: { kind: "indestructible", n: 1 } })],
      },
    ),
  },
  "Seasoned Warrenguard": {
    abilities: [
      triggered(when.attacksSelf, [fx.pump(ref.self, 2, 0)], {
        condition: cond.controls({ token: true }),
        label: "+2/+0 (vous contrôlez un jeton)",
      }),
    ],
  },
  "Sonar Strike": {
    spell: spell(
      [
        targetObj(
          "t",
          { types: ["Creature"], anyOf: [{ attacking: true }, { blocking: true }, { tapped: true }] },
          "créature attaquante, bloqueuse ou engagée",
        ),
      ],
      [fx.damage(4, ref.target()), ...fx.when(cond.controls({ types: ["Creature"], subtype: "Bat" }), fx.gainLife(3))],
    ),
  },
  "Star Charter": {
    abilities: [
      triggered(when.yourEndStep, [fx.lookAtTop(4, { filter: { types: ["Creature"], maxPower: 3 } })], {
        condition: GAINED_OR_LOST,
        label: "Regarde 4 cartes : une créature de force 3 ou moins",
      }),
    ],
  },
  "Starfall Invocation": {
    spell: spell(
      [],
      [
        fx.destroyAll({ types: ["Creature"] }, "d"),
        ...fx.when(
          cond.gift,
          fx.pickFromZone(
            "graveyard",
            { types: ["Creature"] },
            { to: "battlefield", underYourControl: true },
            { pool: ref.stored("d"), prompt: "Créature à renvoyer" },
          ),
        ),
      ],
    ),
  },
  "Thistledown Players": {
    abilities: [
      triggered(when.attacksSelf, [fx.untap(ref.target())], {
        targets: [target.nonland("t")],
        label: "Dégage un permanent non-terrain",
      }),
    ],
  },
  "Valley Questcaller": {
    abilities: [
      triggered(when.enters(kin(RABBIT_BAT_BIRD_MOUSE, { other: true })), [fx.scry(1)], { batched: true, label: "Regard 1" }),
      staticAbility(kin(RABBIT_BAT_BIRD_MOUSE, { other: true }), { power: 1, toughness: 1 }, { label: "+1/+1" }),
    ],
  },
  "Warren Elder": {
    abilities: [activated({ mana: "{3}{W}", effects: [fx.pumpAll(CREATURE_YOU_CONTROL, 1, 1)], label: "Vos créatures +1/+1" })],
  },
  "Warren Warleader": {
    abilities: [
      triggeredModal(when.attackWith(1), [
        mode("Lapin engagé et attaquant", [], [fx.createTappedTokens(RABBIT, 1, { attacking: true })]),
        mode("Attaquants +1/+1", [], [fx.pumpAll({ types: ["Creature"], controller: "you", attacking: true }, 1, 1)]),
      ]),
    ],
  },
  "Wax-Wane Witness": {
    abilities: [triggered(when.lifeChange, [fx.pump(ref.self, 1, 0)], { condition: cond.yourTurn, label: "+1/+0" })],
  },
  "Whiskervale Forerunner": {
    // Approximation : pendant votre tour, la créature va toujours sur le champ de bataille.
    abilities: [
      valiant(
        [
          ...fx.when(
            cond.yourTurn,
            fx.lookAtTop(5, { filter: { types: ["Creature"], maxManaValue: 3 }, to: { to: "battlefield" } }),
          ),
          ...fx.when(cond.not(cond.yourTurn), fx.lookAtTop(5, { filter: { types: ["Creature"], maxManaValue: 3 } })),
        ],
        { label: "Regarde 5 cartes : une créature de VM 3 ou moins" },
      ),
    ],
  },
};
