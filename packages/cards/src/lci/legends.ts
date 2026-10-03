/** The Lost Caverns of Ixalan — légendaires et cartes uniques (lot D). Scripts par nom de face. */
import type { Effect, ModeDef, TargetSpec } from "@mtgx/engine";
import {
  ARTIFACT_OR_CREATURE,
  ARTIFACT_OR_CREATURE_YOURS,
  activated,
  amount,
  BAT_1,
  block,
  blockAbility,
  type CardScript,
  CREATURE_YOU_CONTROL,
  castPermission,
  cond,
  craft,
  DINOSAUR_YOU,
  descend,
  entersWith,
  eventReplacement,
  FUNGUS_DINOSAUR,
  fx,
  GNOME_SOLDIER,
  manaAbility,
  mode,
  OTHER_ARTIFACT_OR_CREATURE_YOURS,
  PERMANENT_CARD,
  PERMANENT_CARDS,
  playerStatic,
  ref,
  spell,
  staticAbility,
  TREASURE,
  target,
  targetObj,
  triggered,
  triggeredModal,
  VAMPIRE_LIFELINK,
  when,
} from "./common";

const ANY = ["W", "U", "B", "R", "G"] as const;
const CREATURE = { types: ["Creature" as const] };

/** Dieux d'Ixalan : « Quand [il] meurt, renvoyez-le sur le champ de bataille engagé et transformé » (Temple). */
const returnsAsTemple = (counters?: { kind: string; n: number }) =>
  triggered(when.diesSelf, [fx.toBattlefield(ref.selfCard, { tapped: true, transformed: true, counters })], {
    label: "Revient en Temple, engagé",
  });
/** Temples : « {T} : ajoutez [couleur] » et « {2}{C}, {T} : transformez ce terrain. N'activez que si … et qu'en rituel. » */
const temple = (c: "W" | "U" | "B" | "R" | "G", condition: Parameters<typeof cond.not>[0], extra = {}): CardScript => ({
  abilities: [
    manaAbility(c, 1, extra),
    activated({
      mana: `{2}{${c}}`,
      tap: true,
      sorcerySpeed: true,
      activationCondition: condition,
      effects: [fx.transform()],
      label: "Transformez ce terrain",
    }),
  ],
});

/** Cosmium Confluence : « choisissez trois ; le même mode peut être choisi plusieurs fois » (toutes les combinaisons). */
const confluence = (): ModeDef[] => {
  /** « sur une Caverne que vous contrôlez » : choisie à la résolution, sans cibler (le même mode peut viser la même). */
  const cave = (i: number) =>
    fx.chooseAmong(ref.permanentsOf(ref.you, { types: ["Land"], subtype: "Cave" }), ref.you, `c${i}`, {
      prompt: "Caverne qui reçoit trois marqueurs +1/+1",
    });
  const ench = (i: number) => targetObj(`e${i}`, { types: ["Enchantment"] }, "enchantement");
  const modes: { label: string; targets: (i: number) => TargetSpec[]; effects: (i: number) => Effect[] }[] = [
    {
      label: "Caverne engagée",
      targets: () => [],
      effects: () => [fx.search({ subtype: "Cave" }, { to: "battlefield", tapped: true })],
    },
    {
      label: "Caverne 0/0 avec trois marqueurs",
      targets: () => [],
      effects: (i) => [
        cave(i),
        fx.counters(ref.stored(`c${i}`), "+1/+1", 3),
        fx.modify(
          ref.stored(`c${i}`),
          { addTypes: ["Creature"], addSubtypes: ["Elemental"], setPower: 0, setToughness: 0, addKeywords: ["haste"] },
          "permanent",
        ),
      ],
    },
    { label: "Détruisez un enchantement", targets: (i) => [ench(i)], effects: (i) => [fx.destroy(ref.target(`e${i}`))] },
  ];
  const out: ModeDef[] = [];
  for (let a = 0; a <= 3; a++)
    for (let b = 0; a + b <= 3; b++) {
      const counts = [a, b, 3 - a - b];
      const picks = counts.flatMap((n, k) => Array.from({ length: n }, (_, i) => ({ m: modes[k] as (typeof modes)[number], i })));
      out.push(
        mode(
          picks.map((p) => p.m.label).join(" + "),
          picks.flatMap((p) => p.m.targets(p.i)),
          picks.flatMap((p) => p.m.effects(p.i)),
        ),
      );
    }
  return out;
};

export const LEGENDS: Record<string, CardScript> = {
  // --- Blanc ------------------------------------------------------------------
  "Dauntless Dismantler": {
    abilities: [
      entersWith({
        tapped: true,
        affects: { types: ["Artifact"], controller: "opponent" },
        label: "Les artefacts adverses arrivent engagés",
      }),
      activated({
        mana: "{X}{X}{W}",
        sacrifice: true,
        effects: [fx.destroyAll({ types: ["Artifact"], manaValueX: true })],
        label: "Détruisez chaque artefact de valeur de mana X",
      }),
    ],
  },
  "Fabrication Foundry": {
    abilities: [
      manaAbility("W", 1, { restriction: { spell: { types: ["Artifact"] }, abilityOfSource: { types: ["Artifact"] } } }),
      activated({
        mana: "{2}{W}",
        tap: true,
        sorcerySpeed: true,
        targets: [target.cardInGraveyard("t", { types: ["Artifact"] }, "you", "carte d'artefact de votre cimetière")],
        effects: [
          {
            op: "exileForManaValue",
            filter: { types: ["Artifact"], other: true },
            atLeast: amount.manaValueOf(ref.target()),
            store: "ok",
          },
          ...fx.when(cond.v("ok"), fx.toBattlefield(ref.target())),
        ],
        label: "Exilez des artefacts : un artefact du cimetière revient",
      }),
    ],
  },
  "Kutzil's Flanker": {
    abilities: [
      triggeredModal(
        when.entersSelf,
        [
          mode(
            "Marqueurs (créatures parties ce tour-ci)",
            [],
            [
              fx.addCounters(
                ref.self,
                amount.turnEvents({ event: "zone", from: "battlefield", types: ["Creature"], who: "you" }),
              ),
            ],
          ),
          mode("+2 PV et regard 2", [], [fx.gainLife(2), fx.scry(2)]),
          mode(
            "Exilez le cimetière d'un joueur",
            [target.player()],
            [fx.moveAll("graveyard", ref.target(), {}, { to: "exile" })],
          ),
        ],
        { label: "Flanc-garde" },
      ),
    ],
  },
  "Ojer Taq, Deepest Foundation": {
    abilities: [
      eventReplacement({
        event: "tokens",
        to: "you",
        toFilter: { types: ["Creature"] },
        modify: { times: 3 },
        label: "Trois fois plus de jetons de créature",
      }),
      returnsAsTemple(),
    ],
  },
  "Temple of Civilization": temple("W", cond.amountAtLeast(amount.attackersThisTurn, 3)),
  "Thousand Moons Infantry": {
    abilities: [triggered(when.step("upkeep", "opponent"), [fx.untap(ref.self)], { label: "Se dégage pendant le tour adverse" })],
  },
  "Thousand Moons Smithy": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(GNOME_SOLDIER)], { label: "Gnome Soldat" }),
      triggered(
        when.step("main1"),
        [
          ...fx.may(
            "Engager cinq artefacts et/ou créatures pour la transformer ?",
            fx.tapChosen(ARTIFACT_OR_CREATURE, "c"),
            ...fx.when(cond.v("c", 5), fx.transform()),
          ),
        ],
        { condition: cond.controls({ ...ARTIFACT_OR_CREATURE_YOURS, tapped: false }, 5), label: "Engagez cinq permanents" },
      ),
    ],
  },
  "Barracks of the Thousand": {
    abilities: [
      manaAbility("W"),
      triggered(
        { on: "castSpell", by: "you", filter: ARTIFACT_OR_CREATURE, usingManaFromSelf: true },
        [fx.createTokens(GNOME_SOLDIER)],
        { label: "Gnome Soldat" },
      ),
    ],
  },
  "Unstable Glyphbridge": {
    abilities: [
      triggered(when.entersSelf, [{ op: "destroyAllButOnePerPlayer", keep: { types: ["Creature"], maxPower: 2 } }], {
        condition: cond.wasCast,
        label: "Une créature de force 2 ou moins épargnée par joueur",
      }),
      craft("{3}{W}{W}", { filter: { types: ["Artifact"] }, count: 1 }),
    ],
  },
  "Sandswirl Wanderglyph": {
    abilities: [
      triggered(when.castSpell("opponent"), [{ op: "cantAttackYouThisTurn", who: ref.eventPlayer }], {
        condition: cond.opponentsTurn,
        label: "Il ne peut pas vous attaquer ce tour-ci",
      }),
      playerStatic({
        castLimit: { who: "opponents", attackedYou: true },
        label: "Qui vous a attaqué ne peut pas lancer de sorts",
      }),
    ],
  },
  // --- Bleu -------------------------------------------------------------------
  "The Enigma Jewel": {
    abilities: [
      entersWith({ tapped: true, label: "Arrive engagé" }),
      manaAbility("C", 2, { restriction: { abilityOfSource: {} } }),
      craft("{8}{U}", { filter: { nonland: true, withActivatedAbility: true }, count: 4 }),
    ],
  },
  "Locus of Enlightenment": {
    abilities: [
      staticAbility("self", { gainLinkedActivated: true }, { label: "Capacités activées des cartes exilées" }),
      triggered({ on: "activateAbility" }, [fx.copySpell(ref.eventObject, 1)], { label: "Copiez la capacité" }),
    ],
  },
  "Kitesail Larcenist": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.modifyWhileSource(ref.target(), {
            setTypes: ["Artifact"],
            setSubtypes: ["Treasure"],
            loseAllAbilities: true,
            addAbilities: [manaAbility([...ANY], 1, { sacrifice: true })],
          }),
        ],
        {
          targets: [
            {
              ...target.upTo(2, targetObj("t", { ...ARTIFACT_OR_CREATURE, other: true }, "autre artefact ou créature")),
              differentPlayers: true,
            },
          ],
          label: "Deviennent des Trésors",
        },
      ),
    ],
  },
  "Malcolm, Alluring Scoundrel": {
    abilities: [
      triggered(
        when.combatDamageToPlayer,
        [
          fx.counters(ref.self, "chorus", 1),
          fx.draw(1),
          fx.discard(1, ref.you, { store: "d" }),
          ...fx.when(cond.counterAtLeast("chorus", 4), fx.castNow(ref.stored("d"), { free: true })),
        ],
        { label: "Marqueur de chœur, pillage" },
      ),
    ],
  },
  "Ojer Pakpatiq, Deepest Epoch": {
    abilities: [
      triggered(
        { on: "castSpell", by: "you", filter: { types: ["Instant"] }, fromHand: true },
        [fx.grantRebound(ref.eventObject)],
        { label: "Rebond" },
      ),
      returnsAsTemple({ kind: "time", n: 3 }),
    ],
  },
  "Temple of Cyclical Time": temple("U", cond.not(cond.counterAtLeast("time", 1)), { removeCounter: "time" }),
  "Tishana's Tidebinder": {
    abilities: [
      triggered(when.entersSelf, [fx.counterAbilitySilence(ref.target())], {
        targets: [
          target.optional({
            id: "t",
            label: "capacité activée ou déclenchée",
            filter: { stackItems: { abilitiesOnly: true } },
          }),
        ],
        label: "Contrecarrez une capacité",
      }),
    ],
  },
  // --- Noir -------------------------------------------------------------------
  "Aclazotz, Deepest Betrayal": {
    abilities: [
      triggered(when.attacksSelf, [fx.draw(amount.opponentsWithHandAtMost(0)), fx.discard(1, ref.eachOpponent)], {
        label: "Chaque adversaire défausse une carte",
      }),
      triggered(when.discard("opponent"), [fx.createTokens(BAT_1)], {
        condition: cond.eventObjectMatches({ types: ["Land"] }),
        label: "Chauve-souris 1/1",
      }),
      returnsAsTemple(),
    ],
  },
  "Temple of the Dead": temple(
    "B",
    cond.any(cond.amountAtLeast(amount.opponentsWithHandAtMost(1), 1), cond.not(cond.amountAtLeast(amount.cardsIn("hand"), 2))),
  ),
  "Bitter Triumph": {
    additionalCost: { discard: 1, discardOrLife: 3 },
    spell: spell([target.creatureOrPlaneswalker()], [fx.destroy(ref.target())]),
  },
  "Bloodletter of Aclazotz": {
    abilities: [
      eventReplacement({
        event: "lifeLoss",
        to: "opponent",
        modify: { times: 2 },
        condition: cond.yourTurn,
        label: "Pendant votre tour, perte de PV adverse doublée",
      }),
    ],
  },
  "Bringer of the Last Gift": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.sacrifice(ref.eachPlayer, { types: ["Creature"], other: true }, 1000, { store: "x" }),
          fx.pickFromZone(
            "graveyard",
            CREATURE,
            { to: "battlefield" },
            { count: 1000, pool: ref.allGraveyards, excludeStored: "x", prompt: "Cartes de créature qui reviennent" },
          ),
        ],
        { condition: cond.wasCast, label: "Sacrifices, puis retour des créatures" },
      ),
    ],
  },
  "Deep-Cavern Bat": {
    abilities: [
      triggered(when.entersSelf, [fx.exileFromHandLinked(ref.target(), { nonland: true }, true)], {
        targets: [target.player("t", "opponent")],
        label: "Exilez une carte non-terrain de sa main",
      }),
    ],
  },
  "Preacher of the Schism": {
    abilities: [
      triggered(
        when.attacksSelf,
        [...fx.when({ kind: "mostLife", ref: ref.defendingPlayer }, fx.createTokens(VAMPIRE_LIFELINK))],
        { label: "Attaque le joueur qui a le plus de PV : Vampire 1/1" },
      ),
      triggered(when.attacksSelf, [fx.draw(1), fx.loseLife(1)], {
        condition: { kind: "mostLife" },
        label: "Vous avez le plus de PV : piochez, perdez 1 PV",
      }),
    ],
  },
  "Souls of the Lost": {
    additionalCost: { discard: 1, discardOrSacrifice: true },
    cdaPower: PERMANENT_CARDS,
    cdaToughness: amount.plus(PERMANENT_CARDS, 1),
  },
  "Starving Revenant": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.surveil(2, undefined, "k"),
          fx.draw(amount.v("k")),
          fx.loseLife(amount.plus(amount.v("k"), amount.v("k"), amount.v("k"))),
        ],
        { label: "Surveillance 2 ; piochez pour chaque carte laissée" },
      ),
      triggered(when.draw(), [fx.loseLife(1, ref.target()), fx.gainLife(1)], {
        targets: [target.player("t", "opponent")],
        condition: descend(8),
        label: "Descente 8 — drain 1",
      }),
    ],
  },
  "Tarrian's Journal": {
    abilities: [
      activated({
        tap: true,
        sacrificeOther: { filter: OTHER_ARTIFACT_OR_CREATURE_YOURS },
        sorcerySpeed: true,
        effects: [fx.draw(1)],
        label: "Piochez une carte",
      }),
      activated({
        mana: "{2}",
        tap: true,
        discardHand: true,
        effects: [fx.transform()],
        label: "Défaussez votre main : transformation",
      }),
    ],
  },
  "The Tomb of Aclazotz": {
    abilities: [
      manaAbility("B"),
      activated({
        tap: true,
        effects: [{ op: "graveyardCreatureOnce" }],
        label: "Un sort de créature depuis votre cimetière",
      }),
    ],
  },
  // --- Rouge ------------------------------------------------------------------
  "Belligerent Yearling": {
    abilities: [
      triggered(
        when.enters({ ...DINOSAUR_YOU, other: true }),
        [...fx.may("Prendre sa force de base ?", fx.setBasePTAll({ self: true }, amount.powerOf(ref.eventObject), true))],
        { label: "Force de base égale à celle du Dinosaure" },
      ),
    ],
  },
  "Ojer Axonil, Deepest Might": {
    abilities: [
      eventReplacement({
        event: "damage",
        source: { controller: "you", colors: ["R"] },
        to: "opponent",
        combat: false,
        modify: { atLeastSourcePower: true },
        label: "Sources rouges : au moins sa force en blessures",
      }),
      returnsAsTemple(),
    ],
  },
  "Temple of Power": temple(
    "R",
    cond.amountAtLeast(
      amount.turnEvents({ event: "damage", combat: false, sourceYours: true, sourceColors: ["R"], sum: true }),
      4,
    ),
  ),
  "Rampaging Ceratops": { abilities: [blockAbility(block.atLeast(3))] },
  // --- Vert -------------------------------------------------------------------
  "Cosmium Confluence": { spell: { modes: confluence() } },
  "Intrepid Paleontologist": {
    abilities: [
      manaAbility([...ANY]),
      activated({
        mana: "{2}",
        targets: [target.cardInGraveyard("t", {}, "any")],
        effects: [fx.exileCard(ref.target(), { name: "p" }), fx.link(ref.stored("p"))],
        label: "Exilez une carte d'un cimetière",
      }),
      castPermission({
        linkedCards: true,
        linkedFilter: { types: ["Creature"], subtype: "Dinosaur" },
        linkedFinality: true,
        label: "Dinosaures exilés : lançables (finalité)",
      }),
    ],
  },
  "Ojer Kaslem, Deepest Growth": {
    abilities: [
      triggered(
        when.combatDamageToPlayer,
        [
          fx.lookAtTop(amount.eventAmount, {
            filter: { anyOf: [CREATURE, { types: ["Land"] }] },
            count: 2,
            to: { to: "battlefield" },
            rest: "bottom",
          }),
        ],
        { label: "Une créature et/ou un terrain sur le champ de bataille" },
      ),
      returnsAsTemple(),
    ],
  },
  "Temple of Cultivation": temple("G", cond.battlefieldCount({ controller: "you" }, 10)),
  "The Skullspore Nexus": {
    costReduction: { generic: amount.maxPower(CREATURE_YOU_CONTROL) },
    abilities: [
      triggered(
        when.dies({ ...CREATURE_YOU_CONTROL, nontoken: true }),
        [fx.createXXToken(FUNGUS_DINOSAUR, amount.powerOf(ref.eventObject))],
        { label: "Champignon Dinosaure" },
      ),
      activated({
        mana: "{2}",
        tap: true,
        targets: [target.creature()],
        effects: [fx.pump(ref.target(), amount.powerOf(ref.target()), 0)],
        label: "Doublez la force d'une créature",
      }),
    ],
  },
  "Twists and Turns": {
    abilities: [
      playerStatic({ scryBeforeExplore: true, label: "Regard 1 avant d'explorer" }),
      triggered(when.entersSelf, [fx.explore(ref.target())], {
        targets: [target.creature("t", { controller: "you" })],
        label: "Une créature explore",
      }),
      triggered(when.enters({ types: ["Land"], controller: "you" }), [fx.transform()], {
        condition: cond.controls({ types: ["Land"] }, 7),
        label: "Transformation (sept terrains)",
      }),
    ],
  },
  "Mycoid Maze": {
    abilities: [
      manaAbility("G"),
      activated({
        mana: "{3}{G}",
        tap: true,
        effects: [fx.lookAtTop(4, { filter: CREATURE, count: 1, rest: "bottom" })],
        label: "Carte de créature en main",
      }),
    ],
  },
  // --- Multicolore ----------------------------------------------------------------
  "The Belligerent": {
    abilities: [
      triggered(
        when.attacksSelf,
        [
          fx.createTokens(TREASURE),
          fx.emblem(
            "The Belligerent",
            "Until end of turn, you may look at the top card of your library any time, and you may play lands and cast spells from the top of your library.",
            [playerStatic({ playFrom: { zone: "libraryTop" }, lookAtTopCard: true })],
            undefined,
            true,
          ),
        ],
        { label: "Trésor ; jouez depuis le dessus ce tour-ci" },
      ),
    ],
  },
  "Kutzil, Malamet Exemplar": {
    abilities: [
      playerStatic({ castLimit: { who: "opponents", during: "yourTurn" }, label: "Pas de sorts adverses pendant votre tour" }),
      triggered(when.combatDamageBatch({ ...CREATURE_YOU_CONTROL, powerAboveBase: true }), [fx.draw(1)], {
        label: "Piochez une carte",
      }),
    ],
  },
  "Sovereign Okinec Ahau": {
    abilities: [
      triggered(when.attacksSelf, [fx.countersAboveBase(CREATURE_YOU_CONTROL)], {
        label: "Marqueurs selon l'écart avec la force de base",
      }),
    ],
  },
  // --- Incolore -------------------------------------------------------------------
  "Contested Game Ball": {
    abilities: [
      triggered(
        { on: "dealsCombatDamage", who: { types: ["Creature"], controller: "opponent" }, toPlayer: true },
        [fx.giveControl(ref.self, ref.controllerOf(ref.eventObject)), fx.untap(ref.self)],
        { batched: true, label: "L'attaquant en prend le contrôle" },
      ),
      activated({
        mana: "{2}",
        tap: true,
        effects: [
          fx.draw(1),
          fx.counters(ref.self, "point", 1),
          ...fx.when(cond.counterAtLeast("point", 5), fx.sacrificeIt(ref.self), fx.createTokens(TREASURE)),
        ],
        label: "Piochez, marqueur de point",
      }),
    ],
  },
  "Matzalantli, the Great Door": {
    abilities: [
      activated({ tap: true, effects: [...fx.loot()], label: "Piochez, puis défaussez" }),
      activated({
        mana: "{4}",
        tap: true,
        activationCondition: cond.amountAtLeast({ kind: "permanentTypesInGraveyard" }, 4),
        effects: [fx.transform()],
        label: "Transformation (quatre types de permanent au cimetière)",
      }),
    ],
  },
  "The Core": { abilities: [manaAbility([...ANY], 1, { perGraveyard: PERMANENT_CARD })] },
  "The Millennium Calendar": {
    abilities: [
      triggered(when.yourUpkeep, [fx.counters(ref.self, "time", { kind: "untappedInUntapStep" })], {
        label: "Un marqueur de temps par permanent dégagé",
      }),
      activated({
        mana: "{2}",
        tap: true,
        effects: [fx.counters(ref.self, "time", amount.countersOn(ref.self, "time"))],
        label: "Doublez les marqueurs de temps",
      }),
      triggered(when.countersPut("self", "time"), [fx.sacrificeIt(ref.self), fx.loseLife(1000, ref.eachOpponent)], {
        condition: cond.counterAtLeast("time", 1000),
        label: "1 000 marqueurs : chaque adversaire perd 1 000 PV",
      }),
    ],
  },
  "Roaming Throne": {
    chooseOnEnter: "creatureType",
    abilities: [
      staticAbility("self", { addChosenSubtype: true }, { label: "Du type choisi" }),
      playerStatic({
        triggerMod: { effect: "again", sources: { types: ["Creature"], subtypeChosen: true, other: true } },
        label: "Déclencheurs du type choisi doublés",
      }),
    ],
  },
  // --- Terrains -------------------------------------------------------------------
  "Cavern of Souls": {
    chooseOnEnter: "creatureType",
    abilities: [
      manaAbility("C"),
      manaAbility([...ANY], 1, {
        restriction: { spell: { types: ["Creature"], subtypeChosen: true } },
        rider: { spell: { types: ["Creature"], subtypeChosen: true }, effect: "uncounterable" },
      }),
    ],
  },
  "Echoing Deeps": {
    abilities: [
      manaAbility("C"),
      triggered(
        when.entersSelf,
        [
          ...fx.may(
            "Devenir une copie de ce terrain ?",
            fx.becomeCopy(ref.self, ref.target(), "permanent"),
            fx.modify(ref.self, { addSubtypes: ["Cave"] }, "permanent"),
            fx.tap(ref.self),
          ),
        ],
        {
          targets: [target.optional(target.cardInGraveyard("t", { types: ["Land"] }, "any", "carte de terrain d'un cimetière"))],
          label: "Copie d'une carte de terrain d'un cimetière",
        },
      ),
    ],
  },
  "Pit of Offerings": {
    abilities: [
      entersWith({ tapped: true, label: "Arrive engagé" }),
      triggered(when.entersSelf, [fx.exileCard(ref.target(), { name: "p" }), fx.link(ref.stored("p"))], {
        targets: [target.upTo(3, target.cardInGraveyard("t", {}, "any"))],
        label: "Exilez jusqu'à trois cartes de cimetières",
      }),
      manaAbility("C"),
      manaAbility([], 1, { linkedColors: true }),
    ],
  },
  "Sunken Citadel": {
    chooseOnEnter: "color",
    abilities: [
      entersWith({ tapped: true, label: "Arrive engagé" }),
      manaAbility([...ANY], 1, { produceChosen: true }),
      manaAbility([...ANY], 2, { produceChosen: true, restriction: { abilityOfSource: { types: ["Land"] } } }),
    ],
  },
};
