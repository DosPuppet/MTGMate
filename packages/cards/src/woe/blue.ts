/**
 * Wilds of Eldraine — cartes bleues (lot A). Le Marchandage, la garde, le flash et les Aventures sont lus dans le texte ;
 * chaque face d'une carte à Aventure a son entrée (la créature sous son nom, le sort sous le nom de l'Aventure).
 */
import type { Effect, TargetSpec, TokenSpec } from "@mtgx/engine";
import {
  activated,
  amount,
  block,
  blockAbility,
  type CardScript,
  CURSED_ROLE,
  chapter,
  cond,
  createRole,
  entersWith,
  fx,
  INSTANT_SORCERY,
  playerStatic,
  ref,
  SORCERER_ROLE,
  spell,
  staticAbility,
  target,
  triggered,
  when,
} from "./common";

/** Faerie : créature bleue 1/1 avec le vol et « ce jeton ne peut bloquer que des créatures avec le vol ». */
const FAERIE_FLYING_BLOCKER: TokenSpec = {
  name: "Faerie",
  colors: ["U"],
  types: ["Creature"],
  subtypes: ["Faerie"],
  power: 1,
  toughness: 1,
  keywords: ["flying"],
  abilities: [blockAbility(block.onlyBlocks({ keyword: "flying" }, "Ne bloque que les créatures volantes"))],
  text: "Flying\nThis token can block only creatures with flying.",
};

/** « créature ciblée qu'un adversaire contrôle » */
const OPP_CREATURE = (id = "t"): TargetSpec => target.creature(id, { controller: "opponent" });

/** « Engagez [la créature] et mettez-y N marqueurs d'étourdissement. » */
const tapAndStun = (what = ref.target(), n = 1): Effect[] => [fx.tap(what), fx.counters(what, "stun", n)];

/** « Chaque fois que vous lancez un sort d'Aventure » (le sort lancé en tant qu'Aventure, 715.3). */
const CAST_ADVENTURE = when.castSpell("you", { subtype: "Adventure" });

/** « Chaque fois que vous lancez un sort de valeur de mana 5 ou plus » */
const CAST_MV5 = when.castSpell("you", { minManaValue: 5 });

/** « jusqu'à une autre créature ciblée que vous contrôlez » */
const OTHER_CREATURE_YOU = target.optional(target.creature("t", { controller: "you", other: true }));

/** Nombre d'adversaires qui contrôlent au moins une créature (contrôleurs des créatures adverses, sans doublon). */
const OPPONENTS_WITH_CREATURES = amount.refCount(
  ref.union(ref.controllerOf(ref.permanentsOf(ref.eachOpponent, { types: ["Creature"] }))),
);

export const BLUE: Record<string, CardScript> = {
  "Ingenious Prodigy": {
    abilities: [
      blockAbility(block.notBy({ powerAboveSource: true }, "Furtivité : imblocable par les créatures de force supérieure")),
      entersWith({ counters: amount.x }),
      triggered(
        when.yourUpkeep,
        [
          ...fx.may("Retirer un marqueur +1/+1 pour piocher une carte ?", fx.removeCounters(ref.self, 1, "+1/+1", "r")),
          ...fx.when(cond.v("r"), fx.draw(1)),
        ],
        {
          condition: cond.sourceMatches({ withCounter: "+1/+1" }),
          label: "Vous pouvez retirer un marqueur +1/+1 : piochez une carte",
        },
      ),
    ],
  },
  // Prouesse lue dans le texte.
  "Elusive Otter": {
    abilities: [blockAbility(block.notBy({ powerBelowSource: true }, "Imblocable par les créatures de force inférieure"))],
  },
  "Grove's Bounty": {
    spell: spell([target.upTo(99, target.creature("t", { controller: "you" }))], [fx.countersDivided(amount.x, ref.target())]),
  },
  // Marchandage lu dans le texte ; « coûte {N} de moins s'il est marchandé » : réduction sous `cond.kicked`.
  "Ice Out": {
    costReduction: { generic: 1, condition: cond.kicked },
    spell: spell([target.spell()], [fx.counter(ref.target())]),
  },
  "Johann's Stopgap": {
    costReduction: { generic: 2, condition: cond.kicked },
    spell: spell([target.nonland()], [fx.bounce(ref.target()), fx.draw(1)]),
  },
  "Asinine Antics": {
    flashExtraCost: "{2}",
    spell: spell([], createRole(CURSED_ROLE, ref.permanentsOf(ref.eachOpponent, { types: ["Creature"] }))),
  },
  "Aquatic Alchemist": {
    abilities: [
      // Le premier éphémère ou rituel du tour (tous deux confondus) : le montant de l'événement compte ceux lancés avant.
      triggered(
        when.castSpell("you", INSTANT_SORCERY),
        [...fx.when(cond.not(cond.amountAtLeast(amount.eventAmount, 1)), fx.pump(ref.self, 2, 0))],
        { label: "Premier éphémère ou rituel du tour : +2/+0" },
      ),
    ],
  },
  "Bubble Up": {
    spell: spell(
      [target.cardInGraveyard("t", INSTANT_SORCERY, "you", "carte d'éphémère ou de rituel de votre cimetière")],
      [fx.moveTo(ref.target(), { to: "libraryTop" })],
    ),
  },
  "Archive Dragon": { abilities: [triggered(when.entersSelf, [fx.scry(2)], { label: "Regard 2" })] },
  "Beluna's Gatekeeper": {},
  "Entry Denied": {
    spell: spell([target.creature("t", { controller: "opponent", maxManaValue: 3 })], [fx.bounce(ref.target())]),
  },
  "Bitter Chill": {
    enchant: { filter: { types: ["Creature"] }, label: "créature" },
    abilities: [
      triggered(when.entersSelf, [fx.tap(ref.attached)], { label: "Engage la créature enchantée" }),
      staticAbility("attached", { addKeywords: ["doesntUntap"] }, { label: "Ne se dégage pas" }),
      triggered(
        when.putIntoGraveyardSelf,
        [fx.mayPay("{1}", "Payer {1} pour regard 1, puis piocher ?", fx.scry(1), fx.draw(1))],
        {
          label: "Vous pouvez payer {1} : regard 1, puis piochez",
        },
      ),
    ],
  },
  "Chancellor of Tales": {
    abilities: [
      triggered(CAST_ADVENTURE, [fx.may("Copier ce sort d'Aventure ?", fx.copySpell(ref.eventObject, 1))], {
        label: "Vous pouvez copier le sort d'Aventure",
      }),
    ],
  },
  "Diminisher Witch": {
    abilities: [
      triggered(when.entersSelf, createRole(CURSED_ROLE), {
        targets: [OPP_CREATURE()],
        condition: cond.kicked,
        label: "Marchandée : un Rôle Maudit sur une créature adverse",
      }),
    ],
  },
  "Farsight Ritual": {
    spell: spell([], [fx.lookAtTop(amount.kicked(8, 4), { count: 2, exact: true, to: { to: "hand" }, rest: "bottom" })]),
  },
  "Freeze in Place": { spell: spell([OPP_CREATURE()], [...tapAndStun(ref.target(), 3), fx.scry(2)]) },
  "Gadwick's First Duel": {
    abilities: [
      chapter([1], createRole(CURSED_ROLE), {
        targets: [target.optional(target.creature())],
        label: "Un Rôle Maudit sur jusqu'à une créature",
      }),
      chapter([2], [fx.scry(2)], { label: "Regard 2" }),
      chapter(
        [3],
        [
          {
            op: "playerEffect",
            ability: { nextSpell: { filter: { ...INSTANT_SORCERY, maxManaValue: 3 }, copy: true } },
            once: true,
          },
        ],
        { label: "Copiez votre prochain éphémère ou rituel de VM 3 ou moins ce tour-ci" },
      ),
    ],
  },
  "Galvanic Giant": {
    abilities: [
      triggered(CAST_MV5, tapAndStun(), {
        targets: [OPP_CREATURE()],
        label: "Sort de VM 5 ou plus : engagez une créature adverse, un marqueur d'étourdissement",
      }),
    ],
  },
  "Storm Reading": { spell: spell([], [fx.draw(4), fx.discard(2)]) },
  "Horned Loch-Whale": {
    abilities: [entersWith({ tapped: true, condition: cond.not(cond.yourTurn), label: "Arrive engagée hors de votre tour" })],
  },
  "Lagoon Breach": {
    spell: spell([target.creature("t", { attacking: true, controller: "opponent" })], [fx.topOrBottom(ref.target())]),
  },
  "Icewrought Sentry": {
    abilities: [
      triggered(
        when.attacksSelf,
        fx.mayPay(
          "{1}{U}",
          "Payer {1}{U} pour engager une créature adverse ?",
          fx.reflexive([OPP_CREATURE()], [fx.tap(ref.target())]),
        ),
        { label: "Vous pouvez payer {1}{U} : engagez une créature adverse" },
      ),
      triggered({ on: "taps", who: { types: ["Creature"], controller: "opponent" }, byYou: true }, [fx.pump(ref.self, 2, 1)], {
        label: "Vous engagez une créature adverse : +2/+1",
      }),
    ],
  },
  "Into the Fae Court": { spell: spell([], [fx.draw(3), fx.createTokens(FAERIE_FLYING_BLOCKER)]) },
  "Living Lectern": {
    abilities: [
      activated({
        mana: "{1}",
        sacrifice: true,
        sorcerySpeed: true,
        targets: [OTHER_CREATURE_YOU],
        effects: [fx.draw(1), ...createRole(SORCERER_ROLE)],
        label: "Piochez ; un Rôle Sorcier sur jusqu'à une autre créature",
      }),
    ],
  },
  "Merfolk Coralsmith": {
    abilities: [
      activated({ mana: "{1}", effects: [fx.pump(ref.self, 1, -1)], label: "+1/-1" }),
      triggered(when.diesSelf, [fx.scry(2)], { label: "Regard 2" }),
    ],
  },
  "Misleading Motes": { spell: spell([target.creature()], [fx.topOrBottom(ref.target())]) },
  "Obyra's Attendants": {},
  "Desperate Parry": { spell: spell([target.creature()], [fx.pump(ref.target(), -4, 0)]) },
  "Picklock Prankster": {},
  "Free the Fae": {
    spell: spell(
      [],
      [
        fx.mill(4, ref.you, { name: "m" }),
        fx.pickFromZone(
          "graveyard",
          { anyOf: [INSTANT_SORCERY, { subtype: "Faerie" }] },
          { to: "hand" },
          { count: 1, pool: ref.stored("m"), prompt: "Une carte d'éphémère, de rituel ou de Faerie meulée" },
        ),
      ],
    ),
  },
  "Sleep-Cursed Faerie": {
    abilities: [
      entersWith({
        tapped: true,
        counters: 3,
        counterKind: "stun",
        label: "Arrive engagée avec trois marqueurs d'étourdissement",
      }),
      activated({ mana: "{1}{U}", effects: [fx.untap(ref.self)], label: "Dégagez-la" }),
    ],
  },
  "Snaremaster Sprite": {
    abilities: [
      triggered(
        when.entersSelf,
        fx.mayPay("{2}", "Payer {2} pour engager une créature adverse ?", fx.reflexive([OPP_CREATURE()], tapAndStun())),
        { label: "Vous pouvez payer {2} : engagez une créature adverse, un marqueur d'étourdissement" },
      ),
    ],
  },
  "Spell Stutter": {
    spell: spell(
      [target.spell()],
      [
        ...fx.unlessPays(
          ref.controllerOf(ref.target()),
          { genericAmount: amount.plus(2, amount.count({ subtype: "Faerie", controller: "you" })) },
          fx.counter(ref.target()),
        ),
      ],
    ),
  },
  "Splashy Spellcaster": {
    abilities: [
      triggered(when.castSpell("you", INSTANT_SORCERY), createRole(SORCERER_ROLE), {
        targets: [OTHER_CREATURE_YOU],
        label: "Un Rôle Sorcier sur jusqu'à une autre créature",
      }),
    ],
  },
  "Stormkeld Prowler": {
    abilities: [triggered(CAST_MV5, [fx.addCounters(ref.self, 2)], { label: "Sort de VM 5 ou plus : deux marqueurs +1/+1" })],
  },
  "Succumb to the Cold": {
    spell: spell([target.between(1, 2, OPP_CREATURE())], tapAndStun()),
  },
  "Talion's Messenger": {
    abilities: [
      triggered(
        when.attackWith(1, { subtype: "Faerie" }),
        [
          fx.draw(1),
          fx.discard(1, ref.you, { store: "d" }),
          ...fx.when(
            cond.v("d"),
            fx.reflexive([target.creature("t", { subtype: "Faerie", controller: "you" })], [fx.addCounters(ref.target(), 1)]),
          ),
        ],
        { label: "Piochez, défaussez ; un marqueur +1/+1 sur une Faerie" },
      ),
    ],
  },
  "Tenacious Tomeseeker": {
    abilities: [
      triggered(when.entersSelf, [fx.toHand(ref.target())], {
        targets: [target.cardInGraveyard("t", INSTANT_SORCERY, "you", "carte d'éphémère ou de rituel de votre cimetière")],
        condition: cond.kicked,
        label: "Marchandée : un éphémère ou un rituel du cimetière en main",
      }),
    ],
  },
  "Vantress Transmuter": {},
  "Croaking Curse": { spell: spell([target.creature()], [fx.tap(ref.target()), ...createRole(CURSED_ROLE)]) },
  "Virtue of Knowledge": {
    abilities: [
      playerStatic({
        triggerMod: { effect: "again", onEnter: true },
        label: "Déclencheurs d'arrivée de vos permanents doublés",
      }),
    ],
  },
  "Vantress Visions": {
    spell: spell(
      [{ id: "t", label: "capacité activée ou déclenchée que vous contrôlez", filter: { stackItems: { abilitiesOnly: true } } }],
      // La cible n'est pas limitée à vos capacités (filtre de pile sans contrôleur) : celle d'un adversaire n'est pas copiée.
      [fx.copySpell(ref.except(ref.target(), ref.stackItemsOf(ref.eachOpponent)), 1)],
    ),
  },
  "Water Wings": {
    spell: spell(
      [target.creature("t", { controller: "you" })],
      [fx.modify(ref.target(), { setPower: 4, setToughness: 4, addKeywords: ["flying", "hexproof"] })],
    ),
  },
  "Frolicking Familiar": {
    abilities: [
      triggered(when.castSpell("you", INSTANT_SORCERY), [fx.pump(ref.self, 1, 1)], {
        label: "Éphémère ou rituel : +1/+1",
      }),
    ],
  },
  "Blow Off Steam": { spell: spell([target.any()], [fx.damage(1, ref.target())]) },
  "Threadbind Clique": {},
  "Rip the Seams": { spell: spell([target.creature("t", { tapped: true })], [fx.destroy(ref.target())]) },
  "Twining Twins": {},
  "Swift Spiral": {
    spell: spell(
      [target.creature("t", { nontoken: true })],
      [fx.exileCard(ref.target(), { name: "k" }), fx.delayed([fx.toBattlefield(ref.target("k"))], { k: ref.stored("k") })],
    ),
  },
  "Faerie Slumber Party": {
    spell: spell(
      [],
      [
        // Les jetons sont créés d'abord (deux par adversaire qui contrôle une créature), puis toutes les autres créatures
        // retournent en main : même résultat que l'ordre imprimé, le nombre étant fixé avant le renvoi.
        fx.createTokens(
          FAERIE_FLYING_BLOCKER,
          amount.plus(OPPONENTS_WITH_CREATURES, OPPONENTS_WITH_CREATURES),
          undefined,
          "faeries",
        ),
        fx.bounce(ref.except(ref.permanentsOf(ref.eachPlayer, { types: ["Creature"] }), ref.stored("faeries"))),
      ],
    ),
  },
  "Rowdy Research": {
    // {1} de moins par créature qui a attaqué ce tour-ci (toutes les attaques du journal du tour).
    costReduction: { generic: amount.turnEvents({ event: "attack" }) },
    spell: spell([], [fx.draw(3)]),
  },
  "Extraordinary Journey": {
    abilities: [
      // « jusqu'à X créatures ciblées » : le nombre de cibles dépend de X, d'où une capacité réflexive.
      triggered(
        when.entersSelf,
        [
          fx.reflexive(
            [{ ...target.upTo(1, target.creature()), countAmount: amount.sourceX }],
            [fx.exileCard(ref.target(), { name: "j" }), fx.grantPlay(ref.stored("j"), { forever: true, forOwner: true })],
          ),
        ],
        { label: "Exilez jusqu'à X créatures ; leurs propriétaires pourront les jouer" },
      ),
      triggered({ on: "enters", who: { types: ["Creature"], nontoken: true }, fromZone: "exile" }, [fx.draw(1)], {
        oncePerTurn: true,
        label: "Une créature arrive depuis l'exil : piochez une carte (une fois par tour)",
      }),
    ],
  },
  "Storyteller Pixie": {
    abilities: [triggered(CAST_ADVENTURE, [fx.draw(1)], { label: "Sort d'Aventure : piochez une carte" })],
  },
};
