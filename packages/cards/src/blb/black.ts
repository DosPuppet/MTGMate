/** Bloomburrow — cartes noires. */
import {
  activated,
  amount,
  type CardScript,
  CREATURE_YOU_CONTROL,
  cond,
  FOOD,
  fx,
  GAINED_OR_LOST,
  kin,
  modal,
  mode,
  pawprint,
  playerStatic,
  ref,
  SNAIL,
  spell,
  staticAbility,
  THRESHOLD,
  target,
  triggered,
  triggeredModal,
  when,
} from "./common";

const creatureCard = (id = "t", label = "carte de créature de votre cimetière") =>
  target.cardInGraveyard(id, { types: ["Creature"] }, "you", label);

export const BLACK: Record<string, CardScript> = {
  "Agate-Blade Assassin": {
    abilities: [
      triggered(when.attacksSelf, [fx.loseLife(1, ref.defendingPlayer), fx.gainLife(1)], {
        label: "Le joueur défenseur perd 1 PV, vous gagnez 1 PV",
      }),
    ],
  },
  "Bandit's Talent": {
    abilities: [
      triggered(when.entersSelf, [fx.discard(2, ref.eachOpponent, { unlessFilter: { notTypes: ["Land"] } })], {
        label: "Chaque adversaire défausse deux cartes (ou une non-terrain)",
      }),
    ],
    classLevels: [
      [
        triggered(
          when.step("upkeep", "opponent"),
          fx.when(cond.handAtMost(ref.eventPlayer, 1), fx.loseLife(2, ref.eventPlayer)),
          { label: "Main de 1 carte ou moins : perd 2 PV" },
        ),
      ],
      [
        triggered(when.step("draw", "you"), [fx.draw(amount.opponentsWithHandAtMost(1))], {
          label: "Pioche supplémentaire par adversaire à court de cartes",
        }),
      ],
    ],
  },
  "Bonebind Orator": {
    abilities: [
      activated({
        mana: "{3}{B}",
        exileSelf: true,
        fromGraveyard: true,
        targets: [target.cardInGraveyard("t", { types: ["Creature"], other: true }, "you", "autre carte de créature")],
        effects: [fx.toHand(ref.target())],
        label: "Récupère une autre créature",
      }),
    ],
  },
  "Bonecache Overseer": {
    abilities: [
      activated({
        tap: true,
        payLife: 1,
        activationCondition: cond.any(cond.amountAtLeast(amount.cardsLeftGraveyardThisTurn, 3), cond.sacrificedFood),
        effects: [fx.draw(1)],
        label: "Piochez une carte",
      }),
    ],
  },
  "Coiling Rebirth": {
    spell: spell(
      [creatureCard()],
      [
        fx.moveTo(ref.target(), { to: "battlefield" }, { name: "r" }),
        ...fx.when(
          cond.all(cond.gift, cond.refMatches(ref.stored("r"), { legendary: false })),
          fx.copyToken(ref.stored("r"), { pt: 1 }),
        ),
      ],
    ),
  },
  "Consumed by Greed": {
    spell: spell(
      [target.player("p", "opponent"), target.upTo(1, creatureCard())],
      [
        fx.sacrifice(ref.target("p"), { types: ["Creature"] }, 1, { greatestPower: true }),
        ...fx.when(cond.gift, fx.toHand(ref.target())),
      ],
    ),
  },
  "Cruelclaw's Heist": {
    spell: spell(
      [target.player("t", "opponent")],
      [
        fx.discard(1, ref.target(), { chooser: "controller", filter: { notTypes: ["Land"] }, exile: true, store: "e" }),
        ...fx.when(cond.gift, fx.grantPlay(ref.stored("e"), { forever: true, anyMana: true })),
      ],
    ),
  },
  "Daggerfang Duo": {
    abilities: [triggered(when.entersSelf, fx.may("Meuler deux cartes ?", fx.mill(2)), { label: "Meule 2" })],
  },
  "Darkstar Augur": {
    abilities: [
      triggered(
        when.yourUpkeep,
        [fx.moveTo(ref.libraryTop(ref.you), { to: "hand" }, { name: "a" }), fx.loseLife(amount.manaValueOf(ref.stored("a")))],
        { label: "Carte du dessus en main, perdez sa VM en PV" },
      ),
    ],
  },
  Diresight: { spell: spell([], [fx.surveil(2), fx.draw(2), fx.loseLife(2)]) },
  "Downwind Ambusher": {
    abilities: [
      triggeredModal(when.entersSelf, [
        mode("-1/-1 à une créature adverse", [target.creature("t", { controller: "opponent" })], [fx.pump(ref.target(), -1, -1)]),
        mode(
          "Détruit une créature adverse blessée ce tour-ci",
          [target.creature("t", { controller: "opponent", damaged: true })],
          [fx.destroy(ref.target())],
        ),
      ]),
    ],
  },
  "Early Winter": {
    spell: modal(
      mode("Exile une créature", [target.creature()], [fx.exile(ref.target())]),
      mode(
        "Un adversaire exile un enchantement",
        [target.player("p", "opponent")],
        [fx.sacrifice(ref.target("p"), { types: ["Enchantment"] }, 1, { exile: true })],
      ),
    ),
  },
  "Feed the Cycle": {
    forageOrPay: "{B}",
    spell: spell([target.creatureOrPlaneswalker()], [fx.destroy(ref.target())]),
  },
  Fell: { spell: spell([target.creature()], [fx.destroy(ref.target())]) },
  "Glidedive Duo": {
    abilities: [triggered(when.entersSelf, fx.drain(2), { label: "Chaque adversaire perd 2 PV, vous en gagnez 2" })],
  },
  "Hazel's Nocturne": {
    spell: spell([target.upTo(2, creatureCard())], [fx.toHand(ref.target()), ...fx.drain(2)]),
  },
  "Huskburster Swarm": {
    costReduction: {
      generic: amount.plus(amount.countIn("graveyard", { types: ["Creature"] }), amount.countExiled({ types: ["Creature"] })),
    },
  },
  "Iridescent Vinelasher": {
    abilities: [
      triggered(when.landfall, [fx.damage(1, ref.target())], {
        targets: [target.player("t", "opponent")],
        label: "Landfall — 1 blessure à un adversaire",
      }),
    ],
  },
  "Maha, Its Feathers Night": {
    abilities: [
      staticAbility({ types: ["Creature"], controller: "opponent" }, { setToughness: 1 }, { label: "Endurance de base 1" }),
    ],
  },
  "Moonstone Harbinger": {
    abilities: [
      triggered(when.lifeChange, [fx.pumpAll(kin(["Bat"]), 1, 0, ["deathtouch"])], {
        condition: cond.yourTurn,
        oncePerTurn: true,
        label: "Chauves-souris +1/+0 et contact mortel",
      }),
    ],
  },
  "Nocturnal Hunger": {
    spell: spell([target.creature()], [fx.destroy(ref.target()), ...fx.when(cond.not(cond.gift), fx.loseLife(2))]),
  },
  "Osteomancer Adept": {
    abilities: [
      activated({
        tap: true,
        effects: [
          fx.emblem(
            "Osteomancer Adept",
            "Jusqu'à la fin du tour, vous pouvez lancer des sorts de créature depuis votre cimetière en fourrageant ; ils arrivent avec un marqueur de finalité.",
            [
              playerStatic({
                playFrom: { zone: "graveyard", filter: { types: ["Creature"] }, what: "spells", forage: true, finality: true },
              }),
            ],
            false,
            true,
          ),
        ],
        label: "Créatures lançables depuis le cimetière (fourrager)",
      }),
    ],
  },
  "Persistent Marshstalker": {
    abilities: [
      staticAbility("self", { power: 1 }, { per: kin(["Rat"], { other: true }), label: "+1/+0 par autre Rat" }),
      triggered(
        when.attackWith(1, { subtype: "Rat" }),
        fx.mayPay(
          "{2}{B}",
          "Payer {2}{B} pour la renvoyer attaquante ?",
          fx.toBattlefield(ref.selfCard, { tapped: true, attacking: true }),
        ),
        { fromGraveyard: true, condition: THRESHOLD, label: "Seuil — revient engagée et attaquante" },
      ),
    ],
  },
  "Psychic Whorl": {
    spell: spell(
      [target.player("t", "opponent")],
      [fx.discard(2, ref.target()), ...fx.when(cond.controls({ types: ["Creature"], subtype: "Rat" }), fx.surveil(2))],
    ),
  },
  "Ravine Raider": {
    abilities: [activated({ mana: "{1}{B}", effects: [fx.pump(ref.self, 1, 1)], label: "+1/+1" })],
  },
  "Rottenmouth Viper": {
    // Coût additionnel facultatif : chaque permanent non-terrain sacrifié réduit le coût de {1} (au choix du joueur).
    additionalCost: { sacrificeToPay: { notTypes: ["Land"] } },
    abilities: [
      ...[when.entersSelf, when.attacksSelf].map((w) =>
        triggered(
          w,
          [
            fx.counters(ref.self, "blight", 1),
            fx.punisher(ref.eachOpponent, 4, {
              discard: true,
              sacrifice: { notTypes: ["Land"] },
              times: amount.countersOn(ref.self, "blight"),
            }),
          ],
          { label: "Marqueur de fléau ; 4 PV par marqueur" },
        ),
      ),
    ],
  },
  "Ruthless Negotiation": {
    flashback: "{4}{B}",
    spell: spell(
      [target.player("t", "opponent")],
      [fx.exileFromOwnHand(ref.target(), "x"), ...fx.when(cond.spellCastFromGraveyard, fx.draw(1))],
    ),
  },
  Savor: { spell: spell([target.creature()], [fx.pump(ref.target(), -2, -2), fx.createTokens(FOOD)]) },
  "Scales of Shale": {
    costReduction: { generic: amount.count({ types: ["Creature"], subtype: "Lizard", controller: "you" }) },
    spell: spell([target.creature()], [fx.pump(ref.target(), 2, 0, ["lifelink", "indestructible"])]),
  },
  "Scavenger's Talent": {
    abilities: [
      triggered(when.dies(CREATURE_YOU_CONTROL), [fx.createTokens(FOOD)], {
        batched: true,
        oncePerTurn: true,
        label: "Nourriture",
      }),
    ],
    classLevels: [
      [
        triggered(when.sacrifice({}), [fx.mill(2, ref.target())], {
          targets: [target.player()],
          label: "Un joueur meule deux cartes",
        }),
      ],
      [
        triggered(
          when.yourEndStep,
          [
            fx.sacrifice(ref.you, { notTypes: ["Land"], other: true }, 3, { optional: true, store: "s" }),
            ...fx.when(
              cond.v("s", 3),
              fx.pickFromZone("graveyard", { types: ["Creature"] }, { to: "battlefield", counters: { kind: "finality", n: 1 } }),
            ),
          ],
          { label: "Sacrifiez trois permanents : réanimation" },
        ),
      ],
    ],
  },
  "Season of Loss": {
    spell: pawprint(
      {
        pips: 1,
        label: "Chaque joueur sacrifie une créature",
        effects: [fx.sacrifice(ref.eachPlayer, { types: ["Creature"] })],
      },
      {
        pips: 2,
        label: "Piochez par créature morte sous votre contrôle",
        effects: [fx.draw(amount.yourCreaturesDiedThisTurn)],
      },
      {
        pips: 3,
        label: "Chaque adversaire perd X PV (créatures du cimetière)",
        effects: [fx.loseLife(amount.countIn("graveyard", { types: ["Creature"] }), ref.eachOpponent)],
      },
    ),
  },
  "Sinister Monolith": {
    abilities: [
      triggered(when.yourCombat, fx.drain(1), { label: "Chaque adversaire perd 1 PV, vous en gagnez 1" }),
      activated({
        tap: true,
        payLife: 2,
        sacrifice: true,
        sorcerySpeed: true,
        effects: [fx.draw(2)],
        label: "Piochez deux cartes",
      }),
    ],
  },
  Stargaze: {
    spell: spell(
      [],
      [fx.lookAtTop(amount.plus(amount.x, amount.x), { count: amount.x, rest: "graveyard" }), fx.loseLife(amount.x)],
    ),
  },
  "Starlit Soothsayer": {
    abilities: [triggered(when.yourEndStep, [fx.surveil(1)], { condition: GAINED_OR_LOST, label: "Surveillance 1" })],
  },
  "Starscape Cleric": {
    keywords: ["cantBlock"],
    abilities: [triggered(when.gainLife, [fx.loseLife(1, ref.eachOpponent)], { label: "Chaque adversaire perd 1 PV" })],
  },
  "Thornplate Intimidator": {
    abilities: [
      triggered(when.entersSelf, [fx.punisher(ref.target(), 3, { discard: true, sacrifice: { notTypes: ["Land"] } })], {
        targets: [target.player("t", "opponent")],
        label: "Perd 3 PV sauf sacrifice ou défausse",
      }),
    ],
  },
  "Thought-Stalker Warlock": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          ...fx.when(
            cond.refLostLife(ref.target()),
            fx.discard(1, ref.target(), { chooser: "controller", filter: { notTypes: ["Land"] } }),
          ),
          ...fx.when(cond.not(cond.refLostLife(ref.target())), fx.discard(1, ref.target())),
        ],
        { targets: [target.player("t", "opponent")], label: "Défausse" },
      ),
    ],
  },
  "Valley Rotcaller": {
    abilities: [
      triggered(when.attacksSelf, fx.drain(amount.count(kin(["Squirrel", "Bat", "Lizard", "Rat"], { other: true }))), {
        label: "Drain par Écureuil, Chauve-souris, Lézard et Rat",
      }),
    ],
  },
  "Wick, the Whorled Mind": {
    abilities: [
      triggered(
        when.enters(kin(["Rat"])),
        [
          // « Un Escargot que vous contrôlez » : choix non ciblé, à la résolution. Le marqueur d'abord, sans quoi le
          // jeton tout juste créé rendrait vraie la condition du marqueur.
          ...fx.when(
            cond.controls({ subtype: "Snail" }),
            fx.chooseAmong(ref.permanentsOf(ref.you, { subtype: "Snail" }), ref.you, "s", {
              prompt: "Choisissez l'Escargot qui reçoit le marqueur",
            }),
            fx.addCounters(ref.stored("s"), 1),
          ),
          ...fx.when(cond.not(cond.controls({ subtype: "Snail" })), fx.createTokens(SNAIL)),
        ],
        { label: "Escargot 1/1, ou un marqueur +1/+1 sur un Escargot" },
      ),
      activated({
        mana: "{U}{B}{R}",
        sacrificeOther: { filter: { types: ["Creature"], subtype: "Snail" } },
        effects: [fx.damage(amount.powerOf(ref.costSacrificed), ref.eachOpponent), fx.draw(amount.powerOf(ref.costSacrificed))],
        label: "Blessures et pioche selon la force de l'Escargot",
      }),
    ],
  },
  "Wick's Patrol": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.mill(3),
          fx.reflexive(
            [target.creature("t", { controller: "opponent" })],
            [fx.pump(ref.target(), amount.neg(amount.maxManaValueInGraveyard), amount.neg(amount.maxManaValueInGraveyard))],
          ),
        ],
        { label: "Meule 3, puis -X/-X" },
      ),
    ],
  },
};
