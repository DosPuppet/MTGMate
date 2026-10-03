/**
 * Avatar: The Last Airbender — cartes multicolores (lot A). La maîtrise du feu N (nombre), le vol, le piétinement, la
 * vigilance, la portée, la menace, la prouesse, le lien de vie, le défenseur et la garde sont lus dans le texte ; la
 * maîtrise du feu X est écrite ici.
 */
import type { ManaType, ObjectFilter, TargetSpec } from "@mtgx/engine";
import {
  ALLY,
  activated,
  amount,
  type CardScript,
  CLUE,
  castPermission,
  cond,
  costReducer,
  entersWith,
  exhaust,
  FOOD,
  firebending,
  fx,
  manaAbility,
  mode,
  playerStatic,
  ref,
  SOLDIER_FIRE,
  SPIRIT_KOH,
  staticAbility,
  target,
  triggered,
  triggeredModal,
  when,
} from "./common";

const ANY_COLOR: ManaType[] = ["W", "U", "B", "R", "G"];
const LAND_YOU_CONTROL = target.permanent("t", ["Land"], { controller: "you" }, "terrain que vous contrôlez");
const CREATURE_YOU_CONTROL = target.creature("t", { controller: "you" });
const YOUR_CREATURES: ObjectFilter = { types: ["Creature"], controller: "you" };
const LESSON_IN_GRAVEYARD = amount.countIn("graveyard", { subtype: "Lesson" });
/** Leçon, Saga ou Sanctuaire (Guru Pathik). */
const LESSON_SAGA_SHRINE: ObjectFilter = { anySubtype: ["Lesson", "Saga", "Shrine"] };
const INSTANT_OR_SORCERY_CARD = target.cardInGraveyard(
  "t",
  { types: ["Instant", "Sorcery"] },
  "you",
  "carte d'éphémère ou de rituel de votre cimetière",
);
const PERMANENT_YOU_CONTROL: TargetSpec = {
  id: "t",
  label: "permanent que vous contrôlez",
  filter: { objects: { permanent: true, controller: "you" } },
};

export const MULTI: Record<string, CardScript> = {
  "Air Nomad Legacy": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(CLUE)], { label: "Un Indice" }),
      staticAbility(
        { types: ["Creature"], controller: "you", keyword: "flying" },
        { power: 1, toughness: 1 },
        { label: "Vos créatures volantes gagnent +1/+1" },
      ),
    ],
  },
  "Azula, Cunning Usurper": {
    // Approximation : les cartes exilées se lancent pendant votre tour avec du mana de n'importe quel type, mais sans
    // le flash (le moteur n'accorde pas encore le flash aux seules cartes liées).
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.sacrifice(ref.target("p"), { types: ["Creature"], nontoken: true }, 1, { exile: true, store: "c" }),
          fx.link(ref.stored("c")),
          fx.chooseAmong(ref.filtered(ref.graveyardOf(ref.target("p")), { nonland: true }), ref.target("p"), "g", {
            anyZone: true,
          }),
          fx.exileCard(ref.stored("g"), { name: "e" }),
          fx.link(ref.stored("e")),
        ],
        {
          targets: [target.player("p", "opponent")],
          label: "L'adversaire exile une de ses créatures non-jetons, puis une carte non-terrain de son cimetière",
        },
      ),
      castPermission({ linkedCards: true, condition: cond.yourTurn, label: "Pendant votre tour, lancez les cartes exilées" }),
    ],
  },
  "Beifong's Bounty Hunters": {
    abilities: [
      triggered(
        when.dies({ types: ["Creature"], notTypes: ["Land"], controller: "you" }),
        fx.earthbend(ref.target(), amount.powerOf(ref.eventObject)),
        { targets: [LAND_YOU_CONTROL], label: "Maîtrise de la terre X (force de la créature morte)" },
      ),
    ],
  },
  "Bitter Work": {
    abilities: [
      triggered(when.attackWith(1, { minPower: 4 }), [fx.draw(1)], { label: "Attaque avec une créature de force 4+ : piochez" }),
      exhaust({
        mana: "{4}",
        activationCondition: cond.yourTurn,
        targets: [LAND_YOU_CONTROL],
        effects: fx.earthbend(ref.target(), 4),
        label: "Maîtrise de la terre 4",
      }),
    ],
  },
  "Bumi, Unleashed": {
    // Approximation : « seules les créatures-terrains peuvent attaquer pendant cette phase de combat » devient « les
    // créatures non-terrains ne peuvent plus attaquer ce tour-ci » (celles présentes à la résolution).
    abilities: [
      triggered(when.entersSelf, fx.earthbend(ref.target(), 4), { targets: [LAND_YOU_CONTROL], label: "Maîtrise de la terre 4" }),
      triggered(
        when.combatDamageToPlayer,
        [
          fx.untapAll({ types: ["Land"], controller: "you" }),
          fx.extraCombat,
          fx.modifyAll({ types: ["Creature"], notTypes: ["Land"] }, { addKeywords: ["cantAttack"] }, "endOfTurn"),
        ],
        { label: "Dégagez vos terrains ; un combat supplémentaire, réservé aux créatures-terrains" },
      ),
    ],
  },
  "Cat-Owl": {
    abilities: [
      triggered(when.attacksSelf, [fx.untap(ref.target())], {
        targets: [target.permanent("t", ["Artifact", "Creature"], {}, "artefact ou créature")],
        label: "Dégagez un artefact ou une créature",
      }),
    ],
  },
  "Cruel Administrator": {
    abilities: [
      entersWith({ counters: 1, condition: cond.raid, label: "Raid : un marqueur +1/+1" }),
      triggered(when.attacksSelf, [fx.createTokens(SOLDIER_FIRE)], { label: "Un Soldat 2/2, maîtrise du feu 1" }),
    ],
  },
  "Dai Li Agents": {
    abilities: [
      triggered(when.entersSelf, [...fx.earthbend(ref.target(), 1), ...fx.earthbend(ref.target("u"), 1)], {
        targets: [LAND_YOU_CONTROL, { ...LAND_YOU_CONTROL, id: "u" }],
        label: "Maîtrise de la terre 1, deux fois",
      }),
      triggered(when.attacksSelf, fx.drain(amount.count({ types: ["Creature"], controller: "you", withCounter: "+1/+1" })), {
        label: "Drain : vos créatures avec un marqueur +1/+1",
      }),
    ],
  },
  "Dragonfly Swarm": {
    cdaPower: amount.countIn("graveyard", { notTypes: ["Creature", "Land"] }),
    abilities: [
      triggered(when.diesSelf, [fx.draw(1)], {
        condition: cond.amountAtLeast(LESSON_IN_GRAVEYARD, 1),
        label: "Une Leçon au cimetière : piochez",
      }),
    ],
  },
  "Earth Kingdom Soldier": {
    abilities: [
      triggered(when.entersSelf, [fx.addCounters(ref.target(), 1)], {
        targets: [target.upTo(2, CREATURE_YOU_CONTROL)],
        label: "Un marqueur +1/+1 sur jusqu'à deux de vos créatures",
      }),
    ],
  },
  "Earth King's Lieutenant": {
    abilities: [
      triggered(
        when.entersSelf,
        [fx.addCountersAll({ types: ["Creature"], subtype: "Ally", controller: "you", other: true }, 1)],
        { label: "Un marqueur +1/+1 sur chacun de vos autres Alliés" },
      ),
      triggered(when.enters({ subtype: "Ally", controller: "you", other: true }), [fx.addCounters(ref.self, 1)], {
        label: "Un marqueur +1/+1",
      }),
    ],
  },
  "Earth Rumble Wrestlers": {
    abilities: [
      staticAbility(
        "self",
        { power: 1, addKeywords: ["trample"] },
        {
          condition: cond.any(
            cond.controls({ types: ["Land"], anyOf: [{ types: ["Creature"] }] }),
            cond.amountAtLeast(amount.landsEnteredThisTurn, 1),
          ),
          label: "+1/+0 et piétinement (créature-terrain, ou terrain arrivé ce tour-ci)",
        },
      ),
    ],
  },
  "Earth Village Ruffians": {
    abilities: [
      triggered(when.diesSelf, fx.earthbend(ref.target(), 2), { targets: [LAND_YOU_CONTROL], label: "Maîtrise de la terre 2" }),
    ],
  },
  "Fire Lord Azula": {
    // « tant que Fire Lord Azula attaque » fait partie de l'événement déclencheur, et non une condition « si… » (603.4) :
    // elle n'a la capacité qu'en attaquant ; une fois déclenchée, la capacité se résout même si Azula n'attaque plus.
    abilities: [
      staticAbility(
        "self",
        { addAbilities: [triggered(when.castSpell("you"), [fx.copySpell(ref.eventObject, 1)], { label: "Copiez le sort" })] },
        { condition: cond.sourceMatches({ attacking: true }), label: "En attaquant : copiez chaque sort que vous lancez" },
      ),
    ],
  },
  "Fire Lord Zuko": {
    abilities: [
      firebending(amount.powerOf(ref.self)),
      triggered({ on: "castSpell", by: "you", fromExile: true }, [fx.addCountersAll(YOUR_CREATURES, 1)], {
        label: "Sort lancé depuis l'exil : un marqueur +1/+1 sur chacune de vos créatures",
      }),
      triggered(when.zoneChange(["exile"], { to: ["battlefield"] }), [fx.addCountersAll(YOUR_CREATURES, 1)], {
        condition: cond.eventObjectMatches({ controller: "you" }),
        label: "Permanent arrivé depuis l'exil : un marqueur +1/+1 sur chacune de vos créatures",
      }),
    ],
  },
  "Foggy Swamp Spirit Keeper": {
    abilities: [triggered(when.draw(2), [fx.createTokens(SPIRIT_KOH)], { label: "Deuxième carte piochée : un Esprit 1/1" })],
  },
  "Guru Pathik": {
    abilities: [
      triggered(when.entersSelf, [fx.lookAtTop(5, { filter: LESSON_SAGA_SHRINE, rest: "bottom" })], {
        label: "Une Leçon, une Saga ou un Sanctuaire parmi les cinq du dessus",
      }),
      triggered(when.castSpell("you", LESSON_SAGA_SHRINE), [fx.addCounters(ref.target(), 1)], {
        targets: [target.creature("t", { controller: "you", other: true })],
        label: "Un marqueur +1/+1 sur une autre de vos créatures",
      }),
    ],
  },
  "Hei Bai, Spirit of Balance": {
    abilities: [
      ...[when.entersSelf, when.attacksSelf].map((w) =>
        triggered(
          w,
          [
            fx.sacrifice(ref.you, { anyOf: [{ types: ["Creature"] }, { types: ["Artifact"] }], other: true }, 1, {
              optional: true,
              store: "s",
            }),
            ...fx.when(cond.v("s"), fx.addCounters(ref.self, 2)),
          ],
          { label: "Vous pouvez sacrifier une autre créature ou un artefact : deux marqueurs +1/+1" },
        ),
      ),
      triggered(when.leavesSelf, [fx.lkiCountersTo(ref.target())], {
        targets: [CREATURE_YOU_CONTROL],
        label: "Ses marqueurs sur une de vos créatures",
      }),
    ],
  },
  "Hermitic Herbalist": {
    abilities: [
      manaAbility(ANY_COLOR),
      manaAbility(ANY_COLOR, 2, { restriction: { spell: { subtype: "Lesson" } }, combination: true }),
    ],
  },
  "Iroh, Tea Master": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(FOOD)], { label: "Une Nourriture" }),
      triggered(
        when.yourCombat,
        fx.may(
          "Donner le contrôle de ce permanent à l'adversaire ciblé ?",
          fx.giveControl(ref.target(), ref.target("p")),
          fx.reflexive(
            [],
            [
              fx.createTokens(ALLY, 1, undefined, "a"),
              fx.addCounters(ref.stored("a"), amount.count({ permanent: true, controller: "opponent", notOwned: true })),
            ],
          ),
        ),
        {
          targets: [target.player("p", "opponent"), PERMANENT_YOU_CONTROL],
          label: "Donnez un permanent : un Allié avec un marqueur +1/+1 par permanent à vous chez vos adversaires",
        },
      ),
    ],
  },
  "Jet, Freedom Fighter": {
    abilities: [
      triggered(when.entersSelf, [fx.damage(amount.count(YOUR_CREATURES), ref.target())], {
        targets: [target.creature("t", { controller: "opponent" })],
        label: "Blessures égales au nombre de vos créatures",
      }),
      triggered(when.diesSelf, [fx.addCounters(ref.target(), 1)], {
        targets: [target.upTo(2, target.creature())],
        label: "Un marqueur +1/+1 sur jusqu'à deux créatures",
      }),
    ],
  },
  "Katara, the Fearless": {
    abilities: [
      playerStatic({
        triggerMod: { effect: "again", sources: { subtype: "Ally", controller: "you" } },
        label: "Les capacités déclenchées de vos Alliés se déclenchent une fois de plus",
      }),
    ],
  },
  "Katara, Water Tribe's Hope": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(ALLY)], { label: "Un Allié 1/1" }),
      activated({
        mana: "{X}",
        waterbend: true,
        minX: 1,
        activationCondition: cond.yourTurn,
        effects: [fx.setBasePTAll(YOUR_CREATURES, amount.x)],
        label: "Maîtrise de l'eau {X} : vos créatures ont une F/E de base X/X",
      }),
    ],
  },
  "The Lion-Turtle": {
    abilities: [
      triggered(when.entersSelf, [fx.gainLife(3)], { label: "Gagnez 3 PV" }),
      staticAbility(
        "self",
        { addKeywords: ["cantAttack", "cantBlock"] },
        {
          condition: cond.not(cond.amountAtLeast(LESSON_IN_GRAVEYARD, 3)),
          label: "Ne peut ni attaquer ni bloquer sans trois Leçons au cimetière",
        },
      ),
      manaAbility(ANY_COLOR),
    ],
  },
  "Long Feng, Grand Secretariat": {
    abilities: [
      triggered(
        when.dies({ anyOf: [{ types: ["Creature"], other: true }, { types: ["Land"] }], controller: "you" }),
        [fx.addCounters(ref.target(), 1)],
        { targets: [CREATURE_YOU_CONTROL], label: "Un marqueur +1/+1 sur une de vos créatures" },
      ),
    ],
  },
  "Messenger Hawk": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(CLUE)], { label: "Un Indice" }),
      staticAbility("self", { power: 2 }, { condition: cond.drewAtLeast(2), label: "+2/+0 (deux cartes piochées ce tour-ci)" }),
    ],
  },
  "Platypus-Bear": {
    abilities: [
      triggered(when.entersSelf, [fx.mill(2)], { label: "Meulez deux cartes" }),
      staticAbility(
        "self",
        { addKeywords: ["attacksDespiteDefender"] },
        {
          condition: cond.amountAtLeast(LESSON_IN_GRAVEYARD, 1),
          label: "Peut attaquer malgré le défenseur (une Leçon au cimetière)",
        },
      ),
    ],
  },
  "Pretending Poxbearers": {
    abilities: [triggered(when.diesSelf, [fx.createTokens(ALLY)], { label: "Un Allié 1/1" })],
  },
  "Professor Zei, Anthropologist": {
    abilities: [
      activated({ tap: true, discard: 1, effects: [fx.draw(1)], label: "Défaussez une carte : piochez" }),
      activated({
        mana: "{1}",
        tap: true,
        sacrifice: true,
        activationCondition: cond.yourTurn,
        targets: [INSTANT_OR_SORCERY_CARD],
        effects: [fx.toHand(ref.target())],
        label: "Renvoie un éphémère ou un rituel de votre cimetière",
      }),
    ],
  },
  "Sandbender Scavengers": {
    abilities: [
      triggered(when.sacrifice({ other: true }), [fx.addCounters(ref.self, 1)], { label: "Un marqueur +1/+1" }),
      triggered(
        when.diesSelf,
        fx.may(
          "Exiler Sandbender Scavengers ?",
          fx.exileCard(ref.eventObject, { name: "x" }),
          fx.when(
            cond.v("x"),
            fx.reflexive(
              [
                target.cardInGraveyard(
                  "t",
                  { types: ["Creature"], maxManaValueSourcePower: true },
                  "you",
                  "carte de créature de VM au plus sa force",
                ),
              ],
              [fx.toBattlefield(ref.target())],
            ),
          ),
        ),
        { label: "Exilez-la : une créature de votre cimetière revient" },
      ),
    ],
  },
  "Sokka, Bold Boomeranger": {
    abilities: [
      triggered(when.entersSelf, [fx.discard(2, ref.you, { optional: true, store: "d" }), fx.draw(amount.v("d"))], {
        label: "Défaussez jusqu'à deux cartes, piochez-en autant",
      }),
      triggered(
        when.castSpell("you", { anyOf: [{ types: ["Artifact"] }, { subtype: "Lesson" }] }),
        [fx.addCounters(ref.self, 1)],
        { label: "Sort d'artefact ou de Leçon : un marqueur +1/+1" },
      ),
    ],
  },
  "Sokka, Lateral Strategist": {
    abilities: [
      triggered(when.attacksSelf, [fx.draw(1)], {
        condition: cond.controls({ types: ["Creature"], attacking: true, other: true }),
        label: "Sokka attaque avec une autre créature : piochez",
      }),
    ],
  },
  "Sokka, Tenacious Tactician": {
    abilities: [
      staticAbility(
        { subtype: "Ally", controller: "you", other: true },
        { addKeywords: ["menace", "prowess"] },
        { label: "Vos autres Alliés ont la menace et la prouesse" },
      ),
      triggered(when.castSpell("you", { notTypes: ["Creature"] }), [fx.createTokens(ALLY)], { label: "Un Allié 1/1" }),
    ],
  },
  "Suki, Kyoshi Warrior": {
    cdaPower: amount.count(YOUR_CREATURES),
    abilities: [
      triggered(when.attacksSelf, [fx.createTappedTokens(ALLY, 1, { attacking: true })], {
        label: "Un Allié 1/1 engagé et attaquant",
      }),
    ],
  },
  "Sun Warriors": {
    abilities: [
      firebending(amount.count(YOUR_CREATURES)),
      activated({ mana: "{5}", effects: [fx.createTokens(ALLY)], label: "Un Allié 1/1" }),
    ],
  },
  "Tolls of War": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(CLUE)], { label: "Un Indice" }),
      triggered(when.sacrifice({}), [fx.createTokens(ALLY)], {
        condition: cond.yourTurn,
        oncePerTurn: true,
        label: "Sacrifice pendant votre tour : un Allié 1/1",
      }),
    ],
  },
  "Toph, Hardheaded Teacher": {
    abilities: [
      triggered(
        when.entersSelf,
        [fx.discard(1, ref.you, { optional: true, store: "d" }), ...fx.when(cond.v("d"), fx.toHand(ref.target()))],
        { targets: [INSTANT_OR_SORCERY_CARD], label: "Défaussez une carte : un éphémère ou un rituel revient en main" },
      ),
      triggered(
        when.castSpell("you"),
        [
          ...fx.earthbend(ref.target(), 1),
          ...fx.when(cond.eventObjectMatches({ subtype: "Lesson" }), fx.addCounters(ref.target(), 1)),
        ],
        { targets: [LAND_YOU_CONTROL], label: "Maîtrise de la terre 1 (un marqueur de plus pour une Leçon)" },
      ),
    ],
  },
  "Toph, the First Metalbender": {
    abilities: [
      staticAbility(
        { types: ["Artifact"], controller: "you", nontoken: true },
        { addTypes: ["Land"] },
        { label: "Vos artefacts non-jetons sont aussi des terrains" },
      ),
      triggered(when.yourEndStep, fx.earthbend(ref.target(), 2), {
        targets: [LAND_YOU_CONTROL],
        label: "Maîtrise de la terre 2",
      }),
    ],
  },
  "Uncle Iroh": {
    abilities: [costReducer({ subtype: "Lesson" }, 1, "Sorts de Leçon : {1} de moins")],
  },
  "Vindictive Warden": {
    abilities: [activated({ mana: "{3}", effects: [fx.damage(1, ref.eachOpponent)], label: "1 blessure à chaque adversaire" })],
  },
  "Wandering Musicians": {
    abilities: [triggered(when.attacksSelf, [fx.pumpAll(YOUR_CREATURES, 1, 0)], { label: "Vos créatures gagnent +1/+0" })],
  },
  "White Lotus Reinforcements": {
    abilities: [
      staticAbility(
        { types: ["Creature"], subtype: "Ally", controller: "you", other: true },
        { power: 1, toughness: 1 },
        { label: "Vos autres Alliés gagnent +1/+1" },
      ),
    ],
  },
  "Zhao, Ruthless Admiral": {
    abilities: [
      triggered(when.sacrifice({ other: true }), [fx.pumpAll(YOUR_CREATURES, 1, 0)], { label: "Vos créatures gagnent +1/+0" }),
    ],
  },
  "Zuko, Conflicted": {
    // Approximation : Zuko revient d'abord sous votre contrôle, puis passe sous celui du premier adversaire.
    abilities: [
      triggeredModal(
        when.step("main1"),
        [
          mode("Piochez une carte", [], [fx.draw(1), fx.loseLife(2)]),
          mode("Un marqueur +1/+1 sur Zuko", [], [fx.addCounters(ref.self, 1), fx.loseLife(2)]),
          mode("Ajoutez {R}", [], [fx.addMana("R"), fx.loseLife(2)]),
          mode(
            "Zuko passe chez un adversaire",
            [],
            [
              fx.exileCard(ref.self, { name: "z" }),
              fx.moveTo(ref.stored("z"), { to: "battlefield" }, { name: "zb" }),
              fx.giveControl(ref.stored("zb"), ref.eachOpponent),
              fx.loseLife(2),
            ],
          ),
        ],
        { uniqueModes: true, label: "Choisissez un mode pas encore choisi ; perdez 2 PV" },
      ),
    ],
  },
  "Hama, the Bloodbender": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.mill(3, ref.target()),
          // « Exilez jusqu'à une carte » : la question n'est posée que s'il y en a une.
          ...fx.when(
            cond.amountAtLeast(
              amount.refCount(ref.filtered(ref.graveyardOf(ref.target()), { notTypes: ["Creature", "Land"] })),
              1,
            ),
            ...fx.may(
              "Exiler une carte non-créature, non-terrain de son cimetière ?",
              fx.chooseAmong(ref.filtered(ref.graveyardOf(ref.target()), { notTypes: ["Creature", "Land"] }), ref.you, "h", {
                anyZone: true,
                prompt: "Choisissez la carte à exiler",
              }),
              fx.exileCard(ref.stored("h"), { name: "hx" }),
              fx.link(ref.stored("hx")),
            ),
          ),
        ],
        {
          targets: [target.player("t", "opponent")],
          label: "Un adversaire meule trois cartes ; exilez jusqu'à une carte non-créature, non-terrain de son cimetière",
        },
      ),
      castPermission({
        linkedCards: true,
        linkedWaterbend: true,
        condition: cond.yourTurn,
        label: "Pendant votre tour, lancez la carte exilée en maîtrisant l'eau {X} (X : sa valeur de mana)",
      }),
    ],
  },
  // Vol et maîtrise du feu 2 : lus dans le texte.
  "Avatar Aang": {
    abilities: [
      triggered(
        when.bend(),
        [
          fx.draw(1),
          ...fx.when(
            cond.amountAtLeast(amount.turnEvents({ event: "bend", who: "you", distinctKinds: true }), 4),
            fx.transform(ref.self),
          ),
        ],
        { label: "Vous maîtrisez un élément : piochez ; les quatre ce tour-ci, transformez Aang" },
      ),
    ],
  },
  "Aang, Master of Elements": {
    abilities: [
      playerStatic({
        spellCost: { filter: {}, reduceSymbols: { W: 1, U: 1, B: 1, R: 1, G: 1 } },
        label: "Vos sorts coûtent {W}{U}{B}{R}{G} de moins",
      }),
      triggered(
        { on: "step", step: "upkeep", whose: "any" },
        [
          fx.may(
            "Transformer Aang (4 PV, quatre cartes, quatre marqueurs +1/+1, 4 blessures à chaque adversaire) ?",
            fx.transform(ref.self),
            fx.gainLife(4),
            fx.draw(4),
            fx.addCounters(ref.self, 4),
            fx.damage(4, ref.eachOpponent),
          ),
        ],
        { label: "Au début de chaque entretien, vous pouvez transformer Aang" },
      ),
    ],
  },
  // Maîtrise du feu 2 : lue dans le texte.
  "Iroh, Grand Lotus": {
    abilities: [
      playerStatic({
        playFrom: {
          zone: "graveyard",
          what: "spells",
          filter: { types: ["Instant", "Sorcery"], notSubtype: "Lesson" },
          flashback: true,
        },
        condition: cond.yourTurn,
        label: "Pendant votre tour, vos éphémères et rituels non-Leçons au cimetière ont le flashback",
      }),
      playerStatic({
        playFrom: {
          zone: "graveyard",
          what: "spells",
          filter: { types: ["Instant", "Sorcery"], subtype: "Lesson" },
          flashback: true,
          cost: { generic: 1, colored: {}, x: 0 },
        },
        condition: cond.yourTurn,
        label: "Pendant votre tour, vos Leçons au cimetière ont le flashback {1}",
      }),
    ],
  },
  // Piétinement, maîtrise du feu 4 et célérité : lus dans le texte.
  "Ozai, the Phoenix King": {
    abilities: [
      playerStatic({ keepUnspentMana: { becomes: "R" }, label: "Votre mana non dépensé devient rouge au lieu de se vider" }),
      staticAbility(
        "self",
        { addKeywords: ["flying", "indestructible"] },
        { condition: cond.manaPoolAtLeast(6), label: "Vol et indestructible tant que vous avez six mana non dépensé ou plus" },
      ),
    ],
  },
};
