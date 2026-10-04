/** Bloomburrow — cartes bleues. */
import {
  activated,
  amount,
  block,
  blockAbility,
  type CardScript,
  CREATURE_YOU_CONTROL,
  cond,
  cost,
  costReducer,
  entersWith,
  FISH,
  FOOD_ABILITY,
  fx,
  INSTANT_SORCERY,
  kin,
  modal,
  mode,
  OTTER,
  otter,
  pawprint,
  playerStatic,
  ref,
  spell,
  staticAbility,
  THRESHOLD,
  target,
  targetObj,
  triggered,
  wardAbility,
  when,
} from "./common";

const BIRD_FROG_OTTER_RAT = ["Bird", "Frog", "Otter", "Rat"];

/** « Exilez-la, puis renvoyez-la sur le champ de bataille sous le contrôle de son propriétaire. » */
const blink = (what: ReturnType<typeof ref.target>, counters?: { kind: string; n: number }) => [
  fx.exileCard(what, { name: "b" }),
  fx.toBattlefield(ref.stored("b"), counters ? { counters } : {}),
];

export const BLUE: Record<string, CardScript> = {
  "Azure Beastbinder": {
    abilities: [
      blockAbility(block.notBy({ minPower: 2 }, "Imblocable par les créatures de force 2 ou plus")),
      triggered(
        when.attacksSelf,
        [fx.modify(ref.target(), { loseAllAbilities: true, setPower: 2, setToughness: 2 }, "untilYourNextTurn")],
        {
          targets: [
            target.upTo(
              1,
              target.permanent(
                "t",
                ["Artifact", "Creature", "Planeswalker"],
                { controller: "opponent" },
                "artefact, créature ou planeswalker adverse",
              ),
            ),
          ],
          label: "Perd ses capacités, F/E de base 2/2",
        },
      ),
    ],
  },
  "Bellowing Crier": {
    abilities: [triggered(when.entersSelf, fx.loot(1), { label: "Piochez, puis défaussez" })],
  },
  "Calamitous Tide": {
    spell: spell([target.upTo(2, target.creature())], [fx.bounce(ref.target()), fx.draw(2), fx.discard(1)]),
  },
  "Daring Waverider": {
    // Lancé pendant la résolution (608.2g), exilé au lieu d'aller au cimetière.
    abilities: [
      triggered(when.entersSelf, [fx.castNow(ref.target(), { free: true, exileAfter: true })], {
        targets: [
          target.cardInGraveyard(
            "t",
            { types: ["Instant", "Sorcery"], maxManaValue: 4 },
            "you",
            "éphémère ou rituel de VM 4 ou moins",
          ),
        ],
        label: "Lance gratuitement un éphémère ou un rituel",
      }),
    ],
  },
  "Dazzling Denial": {
    spell: spell(
      [target.spell()],
      [
        ...fx.when(
          cond.not(cond.controls({ types: ["Creature"], subtype: "Bird" })),
          fx.unlessPays(ref.controllerOf(ref.target()), { mana: "{2}" }, fx.counter(ref.target())),
        ),
        ...fx.when(
          cond.controls({ types: ["Creature"], subtype: "Bird" }),
          fx.unlessPays(ref.controllerOf(ref.target()), { mana: "{4}" }, fx.counter(ref.target())),
        ),
      ],
    ),
  },
  "Dire Downdraft": {
    costReduction: { generic: 1, condition: cond.targetMatches("t", { anyOf: [{ attacking: true }, { tapped: true }] }) },
    spell: spell([target.creature()], [fx.topOrBottom(ref.target())]),
  },
  "Dour Port-Mage": {
    abilities: [
      triggered(when.leavesWithoutDying({ types: ["Creature"], controller: "you", other: true }), [fx.draw(1)], {
        batched: true,
        label: "Piochez une carte",
      }),
      activated({
        mana: "{1}{U}",
        tap: true,
        targets: [target.creature("t", { controller: "you", other: true })],
        effects: [fx.bounce(ref.target())],
        label: "Renvoie une créature",
      }),
    ],
  },
  "Eddymurk Crab": {
    costReduction: { generic: amount.countIn("graveyard", INSTANT_SORCERY) },
    abilities: [
      entersWith({ tapped: true, condition: cond.not(cond.yourTurn), label: "Engagé hors de votre tour" }),
      triggered(when.entersSelf, [fx.tap(ref.target())], {
        targets: [target.upTo(2, target.creature())],
        label: "Engage jusqu'à deux créatures",
      }),
    ],
  },
  "Eluge, the Shoreless Sea": {
    cdaPT: amount.count({ types: ["Land"], subtype: "Island", controller: "you" }),
    abilities: [
      ...[when.entersSelf, when.attacksSelf].map((w) =>
        triggered(
          w,
          [fx.counters(ref.target(), "flood", 1), fx.modifyWhileCounter(ref.target(), { addSubtypes: ["Island"] }, "flood")],
          {
            targets: [target.permanent("t", ["Land"], {}, "terrain")],
            label: "Marqueur d'inondation (Île)",
          },
        ),
      ),
      // Approximation : la réduction est générique.
      costReducer(INSTANT_SORCERY, 0, "Premier éphémère ou rituel moins cher", {
        genericAmount: amount.count({ types: ["Land"], controller: "you", withCounter: "flood" }),
        condition: cond.not(cond.amountAtLeast(amount.instantSorceryCast, 1)),
      }),
    ],
  },
  "Finch Formation": {
    abilities: [
      triggered(when.entersSelf, [fx.pump(ref.target(), 0, 0, ["flying"])], {
        targets: [target.creature("t", { controller: "you" })],
        label: "Vol",
      }),
    ],
  },
  "Gossip's Talent": {
    abilities: [triggered(when.enters(CREATURE_YOU_CONTROL), [fx.surveil(1)], { label: "Surveillance 1" })],
    classLevels: [
      [
        triggered(when.attackWith(1), [fx.pump(ref.target(), 0, 0, ["unblockable"])], {
          targets: [
            targetObj(
              "t",
              { types: ["Creature"], attacking: true, controller: "you", maxPower: 3 },
              "créature attaquante de force 3 ou moins",
            ),
          ],
          label: "Ne peut pas être bloquée",
        }),
      ],
      [
        triggered(
          when.combatDamage(CREATURE_YOU_CONTROL, true),
          fx.may("Exiler cette créature et la renvoyer ?", ...blink(ref.eventObject)),
          { label: "Exile et renvoie la créature" },
        ),
      ],
    ],
  },
  "Into the Flood Maw": {
    spell: spell(
      [
        {
          ...target.creature("t", { controller: "opponent" }),
          kickedFilter: { objects: { notTypes: ["Land"], controller: "opponent" } },
        },
      ],
      [fx.bounce(ref.target())],
    ),
  },
  Kitnap: {
    enchant: { filter: { types: ["Creature"] }, label: "créature" },
    controlsEnchanted: true,
    abilities: [
      triggered(when.entersSelf, [fx.tap(ref.attached)], { label: "Engage la créature" }),
      // « Si le cadeau n'a pas été promis » : lu sur l'Aura (le cadeau d'un permanent n'est pas connu de ses effets).
      triggered(when.entersSelf, [fx.counters(ref.attached, "stun", 3)], {
        condition: cond.not(cond.gift),
        label: "Trois marqueurs d'étourdissement (sans cadeau)",
      }),
    ],
  },
  "Kitsa, Otterball Elite": {
    abilities: [
      activated({ tap: true, effects: fx.loot(1), label: "Piochez, puis défaussez" }),
      activated({
        mana: "{2}",
        tap: true,
        targets: [
          target.spell("t", { types: ["Instant", "Sorcery"], controller: "you" }, "éphémère ou rituel que vous contrôlez"),
        ],
        effects: [fx.copySpell(ref.target(), 1)],
        activationCondition: cond.sourceMatches({ minPower: 3 }),
        label: "Copie un éphémère ou un rituel",
      }),
    ],
  },
  Knightfisher: {
    abilities: [
      triggered(when.enters(kin(["Bird"], { other: true, token: false })), [fx.createTokens(FISH)], { label: "Poisson 1/1" }),
    ],
  },
  "Long River Lurker": {
    abilities: [
      staticAbility(
        kin(["Frog"], { other: true }),
        { addKeywords: ["ward"], addAbilities: [wardAbility({ mana: cost("{1}") })] },
        { label: "Garde {1}" },
      ),
      triggered(
        when.entersSelf,
        [
          fx.pump(ref.target(), 0, 0, ["unblockable"]),
          fx.modify(ref.target(), {
            addAbilities: [
              triggered(
                when.combatDamage("self"),
                fx.may(
                  "Exiler cette créature et la renvoyer ?",
                  fx.exileCard(ref.self, { name: "b" }),
                  fx.toBattlefield(ref.stored("b")),
                ),
                { label: "Exile et renvoie la créature" },
              ),
            ],
          }),
        ],
        { targets: [target.creature("t", { controller: "you" })], label: "Ne peut pas être bloquée" },
      ),
    ],
  },
  "Long River's Pull": {
    spell: spell(
      [{ ...target.spell("t", { types: ["Creature"] }, "sort de créature"), kickedFilter: { spells: {} } }],
      [fx.counter(ref.target())],
    ),
  },
  "Mind Spiral": {
    spell: spell(
      [target.player("p"), target.upTo(1, target.creature("t", { controller: "opponent" }))],
      [fx.draw(3, ref.target("p")), ...fx.when(cond.gift, fx.tap(ref.target()), fx.counters(ref.target(), "stun", 1))],
    ),
  },
  Mindwhisker: {
    abilities: [
      triggered(when.yourUpkeep, [fx.surveil(1)], { label: "Surveillance 1" }),
      staticAbility(
        { types: ["Creature"], controller: "opponent" },
        { power: -1 },
        { condition: THRESHOLD, label: "Seuil : -1/-0" },
      ),
    ],
  },
  Mockingbird: {
    entersAsCopyOf: { types: ["Creature"], maxManaValueManaSpent: true },
    entersAsCopyAnyController: true,
    entersAsCopyMods: { addSubtypes: ["Bird"], addKeywords: ["flying"] },
  },
  "Nightwhorl Hermit": {
    abilities: [
      staticAbility(
        "self",
        { power: 1, addKeywords: ["unblockable"] },
        { condition: THRESHOLD, label: "Seuil : +1/+0, imblocable" },
      ),
    ],
  },
  "Otterball Antics": {
    flashback: "{3}{U}",
    spell: spell(
      [],
      [
        fx.createTokens(OTTER, 1, undefined, "o"),
        ...fx.when(cond.not(cond.spellCastFromHand), fx.addCounters(ref.stored("o"), 1)),
      ],
    ),
  },
  "Pearl of Wisdom": {
    costReduction: { generic: 1, condition: cond.controls({ types: ["Creature"], subtype: "Otter" }) },
    spell: spell([], [fx.draw(2)]),
  },
  "Plumecreed Escort": {
    abilities: [
      triggered(when.entersSelf, [fx.pump(ref.target(), 0, 0, ["hexproof"])], {
        targets: [target.creature("t", { controller: "you" })],
        label: "Défense talismanique",
      }),
    ],
  },
  "Portent of Calamity": {
    // Approximation : les cartes exilées sont choisies automatiquement (une par type).
    spell: spell([], [fx.portent, fx.castNow(ref.stored("free"), { free: true }), fx.toHand(ref.stored("rest"))]),
  },
  "Season of Weaving": {
    spell: pawprint(
      { pips: 1, label: "Piochez une carte", effects: [fx.draw(1)] },
      {
        pips: 2,
        label: "Copie d'un artefact ou d'une créature",
        // « Choisissez un artefact ou une créature que vous contrôlez » : choix non ciblé, à la résolution.
        effects: [
          fx.chooseAmong(ref.permanentsOf(ref.you, { types: ["Artifact", "Creature"] }), ref.you, "w", {
            prompt: "Choisissez l'artefact ou la créature à copier",
          }),
          fx.copyToken(ref.stored("w")),
        ],
      },
      {
        pips: 3,
        label: "Renvoie chaque permanent non-terrain non-jeton",
        effects: [fx.moveAll("battlefield", ref.eachPlayer, { notTypes: ["Land"], token: false }, { to: "hand" })],
      },
    ),
  },
  "Shore Up": {
    spell: spell(
      [target.creature("t", { controller: "you" })],
      [fx.pump(ref.target(), 1, 1, ["hexproof"]), fx.untap(ref.target())],
    ),
  },
  "Shoreline Looter": {
    keywords: ["unblockable"],
    abilities: [
      triggered(when.combatDamageToPlayer, [fx.draw(1), ...fx.when(cond.not(THRESHOLD), fx.discard(1))], {
        label: "Seuil — Piochez (défaussez sans seuil)",
      }),
    ],
  },
  "Skyskipper Duo": {
    abilities: [
      triggered(
        when.entersSelf,
        [fx.exileCard(ref.target(), { name: "k" }), fx.delayed([fx.toBattlefield(ref.target("k"))], { k: ref.stored("k") })],
        {
          targets: [target.upTo(1, target.creature("t", { controller: "you", other: true }))],
          label: "Exile une créature (elle revient à l'étape de fin)",
        },
      ),
    ],
  },
  Spellgyre: {
    spell: modal(
      mode("Contrecarrez un sort", [target.spell()], [fx.counter(ref.target())]),
      mode("Surveillance 2, puis piochez deux cartes", [], [fx.surveil(2), fx.draw(2)]),
    ),
  },
  "Splash Lasher": {
    abilities: [
      triggered(when.entersSelf, [fx.tap(ref.target()), fx.counters(ref.target(), "stun", 1)], {
        targets: [target.upTo(1, target.creature())],
        label: "Engage une créature (marqueur d'étourdissement)",
      }),
    ],
  },
  "Splash Portal": {
    spell: spell(
      [target.creature("t", { controller: "you" })],
      [...fx.when(cond.refMatches(ref.target(), { anySubtype: BIRD_FROG_OTTER_RAT }), fx.draw(1)), ...blink(ref.target())],
    ),
  },
  "Stormchaser's Talent": {
    abilities: [triggered(when.entersSelf, [otter()], { label: "Loutre 1/1 avec la prouesse" })],
    classLevels: [
      [
        triggered(when.classLevel(2), [fx.toHand(ref.target())], {
          targets: [target.cardInGraveyard("t", INSTANT_SORCERY, "you", "éphémère ou rituel de votre cimetière")],
          label: "Récupère un éphémère ou un rituel",
        }),
      ],
      [triggered(when.castSpell("you", INSTANT_SORCERY), [otter()], { label: "Loutre 1/1 avec la prouesse" })],
    ],
  },
  "Sugar Coat": {
    enchant: { filter: { anyOf: [{ types: ["Creature"] }, { subtype: "Food" }] }, label: "créature ou Nourriture" },
    abilities: [
      staticAbility(
        "attached",
        { setTypes: ["Artifact"], setSubtypes: ["Food"], setColors: [], loseAllAbilities: true, addAbilities: [FOOD_ABILITY] },
        { label: "Nourriture incolore" },
      ),
    ],
  },
  "Thought Shucker": {
    abilities: [
      activated({
        mana: "{1}{U}",
        once: true,
        activationCondition: THRESHOLD,
        effects: [fx.addCounters(ref.self, 1), fx.draw(1)],
        label: "Seuil — Marqueur +1/+1, piochez",
      }),
    ],
  },
  "Thundertrap Trainer": {
    abilities: [
      triggered(when.entersSelf, [fx.lookAtTop(4, { filter: { notTypes: ["Creature", "Land"] } })], {
        label: "Regarde 4 cartes : un sort non-créature",
      }),
    ],
  },
  "Valley Floodcaller": {
    abilities: [
      playerStatic({
        spellKeywords: { filter: { notTypes: ["Creature"] }, keywords: ["flash"] },
        label: "Sorts non-créature avec le flash",
      }),
      triggered(
        when.castSpell("you", { notTypes: ["Creature"] }),
        [fx.pumpAll(kin(BIRD_FROG_OTTER_RAT), 1, 1), fx.untapAll(kin(BIRD_FROG_OTTER_RAT))],
        { label: "Oiseaux, Grenouilles, Loutres et Rats +1/+1, dégagés" },
      ),
    ],
  },
  "Waterspout Warden": {
    abilities: [
      triggered(when.attacksSelf, [fx.pump(ref.self, 0, 0, ["flying"])], {
        condition: cond.controls({ types: ["Creature"], enteredThisTurn: true, other: true }),
        label: "Vol",
      }),
    ],
  },
  "Wishing Well": {
    abilities: [
      activated({
        tap: true,
        sorcerySpeed: true,
        effects: [
          fx.counters(ref.self, "coin", 1),
          fx.reflexive(
            [
              {
                ...target.cardInGraveyard("t", INSTANT_SORCERY, "you", "éphémère ou rituel de VM égale aux marqueurs"),
                manaValueAmount: amount.countersOn(ref.self, "coin"),
              },
            ],
            [fx.castNow(ref.target(), { free: true, exileAfter: true })],
          ),
        ],
        label: "Marqueur de pièce, lance un sort du cimetière",
      }),
    ],
  },
};
