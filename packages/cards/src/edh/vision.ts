/**
 * Commander: "Weight of the World" deck (The Vision; colorless; list of the Nier: Automata proxy set, first taken
 * from DoomMeat's "Nier Automata Deck"). Artifacts and Equipment (Swords,
 * Excalibur, Nettlecyst, Commander's Plate), keys and Monoliths that untap, colorless Eldrazi (All Is Dust,
 * Kozilek's Command, Eldrazi Confluence, Echoes of Eternity), three Ugins and Karn, Living Legacy. Lands:
 * `edh/visionLands.ts`. At the end of the file, the sideboard cards of the proxy set (outside the deck).
 */
import type { AbilityDef, CardScript, Effect, ModeDef, ObjectFilter, ProtectionRule, TargetSpec, TokenSpec } from "@mtgx/engine";
import { msg } from "@mtgx/engine";
import {
  ANY_COLOR,
  activated,
  altCostMode,
  amount,
  castPermission,
  cmp,
  cond,
  costReducer,
  doesntUntap,
  ELDRAZI_SPAWN,
  entersWith,
  eventReplacement,
  flashForAll,
  fx,
  loyalty,
  loyaltyX,
  manaAbility,
  modal,
  mode,
  POWERSTONE,
  playerStatic,
  protection,
  ref,
  spell,
  staticAbility,
  target,
  triggered,
  triggeredModal,
  wardAbility,
  when,
} from "./common";

/** Colorless ("colorless spell", "colorless permanent"): no color. */
const COLORLESS: ObjectFilter = { colorCount: 0 };
/** "One or more colors". */
const COLORED: ObjectFilter = { not: { colorCount: 0 } };
/** Historic (700.6): artifact, legendary or Saga. */
const HISTORIC: ObjectFilter = { anyOf: [{ types: ["Artifact"] }, { legendary: true }, { subtype: "Saga" }] };
const ARTIFACTS_YOU: ObjectFilter = { types: ["Artifact"], controller: "you" };
const ALL_COLORS: ProtectionRule = protection.from({ colors: ["W", "U", "B", "R", "G"] }, "Protection from each color");

/** 1/1 colorless Eldrazi Scion: "Sacrifice this token: Add {C}." */
const ELDRAZI_SCION: TokenSpec = {
  ...ELDRAZI_SPAWN,
  name: "Eldrazi Scion",
  subtypes: ["Eldrazi", "Scion"],
  power: 1,
  toughness: 1,
};
/** 0/0 black Phyrexian Germ (living weapon). */
const GERM: TokenSpec = {
  name: "Phyrexian Germ",
  colors: ["B"],
  types: ["Creature"],
  subtypes: ["Phyrexian", "Germ"],
  power: 0,
  toughness: 0,
};
/** 2/2 colorless Spirit (Ugin, the Ineffable). */
const SPIRIT_2: TokenSpec = { name: "Spirit", colors: [], types: ["Creature"], subtypes: ["Spirit"], power: 2, toughness: 2 };

/** Living weapon (702.92): "When this Equipment enters, create a 0/0 black Phyrexian Germ creature token, then attach this to it." */
const livingWeapon = (): AbilityDef =>
  triggered(when.entersSelf, [fx.createTokens(GERM, 1, undefined, "germ"), fx.attach(ref.stored("germ"))], {
    label: "Living weapon — a 0/0 Phyrexian Germ, then attach this Equipment to it",
  });

type Color = "W" | "U" | "B" | "R" | "G";

/**
 * "Swords of X and Y": +2/+2, protection from two colors, and a trigger when the equipped creature deals combat damage
 * to a player. `protections`: each color with the label of its protection; `label`: the label of the static ability.
 */
const sword = (
  protections: [[Color, string], [Color, string]],
  label: string,
  trigger: { effects: Effect[]; label: string; targets?: TargetSpec[] },
): CardScript => ({
  abilities: [
    staticAbility(
      "attached",
      {
        power: 2,
        toughness: 2,
        addProtections: protections.map(([c, l]) => protection.from({ colors: [c] }, l)),
      },
      { label },
    ),
    triggered(when.attachedDealsCombatDamageToPlayer, trigger.effects, {
      targets: trigger.targets,
      label: trigger.label,
    }),
  ],
});

/** "Choose two —": each pair of modes becomes a mode (target ids differ from one mode to the other). */
function chooseTwo(...modes: ModeDef[]): { modes: ModeDef[] } {
  const out: ModeDef[] = [];
  modes.forEach((a, i) => {
    for (const b of modes.slice(i + 1))
      out.push({
        label: msg("{a} + {b}", { a: a.label ?? "", b: b.label ?? "" }),
        targets: [...a.targets, ...b.targets],
        effects: [...a.effects, ...b.effects],
      });
  });
  return { modes: out };
}

/**
 * "Choose three. You may choose the same mode more than once." (Eldrazi Confluence): every combination; each copy of
 * a mode has its own "target" words (`i`: its rank).
 */
function chooseThreeRepeat(
  ...modes: { label: string; targets: (i: number) => TargetSpec[]; effects: (i: number) => Effect[] }[]
): { modes: ModeDef[] } {
  const out: ModeDef[] = [];
  for (let a = 0; a <= 3; a++)
    for (let b = 0; a + b <= 3; b++) {
      const counts = [a, b, 3 - a - b];
      const picks = counts.flatMap((n, k) => Array.from({ length: n }, (_, i) => ({ m: modes[k] as (typeof modes)[number], i })));
      out.push(
        mode(
          picks.map((p) => p.m.label).reduce((a, b) => msg("{a} + {b}", { a, b })),
          picks.flatMap((p) => p.m.targets(p.i)),
          picks.flatMap((p) => p.m.effects(p.i)),
        ),
      );
    }
  return { modes: out };
}

export const EDH_VISION: Record<string, CardScript> = {
  // --- Artifacts ------------------------------------------------------------------------------------------------------
  "Basalt Monolith": {
    abilities: [
      doesntUntap("self", { label: "Doesn't untap during your untap step" }),
      manaAbility("C", 3),
      activated({ mana: "{3}", effects: [fx.untap(ref.self)], label: "Untap this artifact" }),
    ],
  },
  // "Choose artifact, creature, enchantment, instant, or sorcery": an "as enters" choice (like Arachne).
  "Cloud Key": {
    asEnters: [fx.chooseForSelf("mode", { options: ["Artifact", "Creature", "Enchantment", "Instant", "Sorcery"] })],
    abilities: [costReducer({ chosen: "cardType" }, 1, "Spells you cast of the chosen type cost {1} less")],
  },
  "Darksteel Forge": {
    abilities: [
      staticAbility(ARTIFACTS_YOU, { addKeywords: ["indestructible"] }, { label: "Artifacts you control have indestructible" }),
    ],
  },
  // Indestructible: read from the text.
  "Darksteel Monolith": {
    abilities: [
      castPermission({
        freeFrom: "hand",
        freeFilter: COLORLESS,
        freeOncePerTurn: true,
        label: "Once each turn: a colorless spell from your hand without paying its mana cost",
      }),
    ],
  },
  "Forsaken Monument": {
    abilities: [
      staticAbility(
        { types: ["Creature"], controller: "you", ...COLORLESS },
        { power: 2, toughness: 2 },
        { label: "Colorless creatures you control get +2/+2" },
      ),
      // "Whenever you tap a permanent for {C}, add an additional {C}": a triggered mana ability (605.1b), like Mana
      // Flare and Ultima.
      eventReplacement({
        event: "mana",
        to: "you",
        manaProduced: "C",
        modify: { add: 1 },
        label: "A permanent tapped for {C}: one more {C}",
      }),
      triggered(when.castSpell("you", COLORLESS), [fx.gainLife(2)], { label: "Colorless spell: gain 2 life" }),
    ],
  },
  // Outside a Planechase game, the planar die has no effect (901.9): it is rolled, nothing happens.
  "Fractured Powerstone": {
    abilities: [
      manaAbility("C"),
      activated({ tap: true, sorcerySpeed: true, effects: [fx.rollDie(6, "planar")], label: "Roll the planar die" }),
    ],
  },
  // Flash: read from the text.
  "Gerrard's Hourglass Pendant": {
    abilities: [
      playerStatic({ skips: "extraTurns", affects: "each", label: "Extra turns are skipped" }),
      activated({
        mana: "{4}",
        tap: true,
        exileSelf: true,
        effects: [
          fx.moveAll(
            "graveyard",
            ref.you,
            { types: ["Artifact", "Creature", "Enchantment", "Land"], fromBattlefieldThisTurn: true },
            { to: "battlefield", tapped: true },
          ),
        ],
        label: "Return tapped the cards put into your graveyard from the battlefield this turn",
      }),
    ],
  },
  "Liquimetal Torque": {
    abilities: [
      manaAbility("C"),
      activated({
        tap: true,
        targets: [target.nonland("t")],
        effects: [fx.modify(ref.target(), { addTypes: ["Artifact"] })],
        label: "Target nonland permanent becomes an artifact until end of turn",
      }),
    ],
  },
  "Manifold Key": {
    abilities: [
      activated({
        mana: "{1}",
        tap: true,
        targets: [target.permanent("t", ["Artifact"], { other: true }, "another artifact")],
        effects: [fx.untap(ref.target())],
        label: "Untap another target artifact",
      }),
      activated({
        mana: "{3}",
        tap: true,
        targets: [target.creature()],
        effects: [fx.modify(ref.target(), { addKeywords: ["unblockable"] })],
        label: "Target creature can't be blocked this turn",
      }),
    ],
  },
  "Moonsilver Key": {
    abilities: [
      activated({
        mana: "{1}",
        tap: true,
        sacrifice: true,
        effects: [
          fx.search(
            {
              anyOf: [
                { types: ["Artifact"], withActivatedAbility: "mana" },
                { types: ["Land"], basic: true },
              ],
            },
            { to: "hand" },
          ),
        ],
        label: "Search for an artifact with a mana ability or a basic land",
      }),
    ],
  },
  // Metalcraft: you control three or more artifacts (itself included).
  "Mox Opal": {
    abilities: [manaAbility(ANY_COLOR, 1, { condition: cond.controls({ types: ["Artifact"] }, 3) })],
  },
  "Mystic Forge": {
    abilities: [
      playerStatic({ lookAt: "libraryTop", label: "You may look at the top card of your library" }),
      playerStatic({
        playFrom: { zone: "libraryTop", filter: { anyOf: [{ types: ["Artifact"] }, COLORLESS] }, what: "spells" },
        label: "Cast artifact spells and colorless spells from the top of your library",
      }),
      activated({ tap: true, payLife: 1, effects: [fx.exileTop(ref.you, 1, "x")], label: "Exile the top card" }),
    ],
  },
  "Nevinyrral's Disk": {
    abilities: [
      entersWith({ tapped: true, label: "Enters tapped" }),
      activated({
        mana: "{1}",
        tap: true,
        effects: [fx.destroyAll({ types: ["Artifact", "Creature", "Enchantment"] })],
        label: "Destroy all artifacts, creatures, and enchantments",
      }),
    ],
  },
  // The meld with Urza, Lord Protector is read from the text (back face Urza, Planeswalker).
  "The Mightstone and Weakstone": {
    abilities: [
      triggeredModal(
        when.entersSelf,
        [
          mode("Draw two cards", [], [fx.draw(2)]),
          mode("Target creature gets −5/−5", [target.creature()], [fx.pump(ref.target(), -5, -5)]),
        ],
        { label: "Draw two cards, or a creature gets −5/−5" },
      ),
      manaAbility("C", 2, { restriction: { spell: { types: ["Artifact"] }, abilityOfSource: {} } }),
    ],
  },
  "Unwinding Clock": {
    abilities: [
      playerStatic({
        untapOnOthersUntap: { types: ["Artifact"] },
        label: "Untap artifacts you control during each other player's untap step",
      }),
    ],
  },
  "Vedalken Orrery": { abilities: [flashForAll("You may cast spells as though they had flash")] },
  "Voltaic Key": {
    abilities: [
      activated({
        mana: "{1}",
        tap: true,
        targets: [target.permanent("t", ["Artifact"], {}, "artifact")],
        effects: [fx.untap(ref.target())],
        label: "Untap target artifact",
      }),
    ],
  },

  // --- Equipment (Equip read from the text) ------------------------------------------------------------------------------
  "Adaptive Omnitool": {
    abilities: [
      staticAbility("attached", { power: 1, toughness: 1 }, { per: ARTIFACTS_YOU, label: "+1/+1 for each artifact you control" }),
      triggered(
        when.attacks({ attached: "host" }),
        [fx.lookAtTop(6, { filter: { types: ["Artifact"] }, count: 1, rest: "bottom" })],
        { label: "Equipped creature attacks: an artifact among the top six cards" },
      ),
    ],
  },
  "Brotherhood Regalia": {
    abilities: [
      staticAbility(
        "attached",
        {
          addAbilities: [wardAbility({ mana: { generic: 2, colored: {}, x: 0 } })],
          addSubtypes: ["Assassin"],
          addKeywords: ["unblockable"],
        },
        { label: "Ward {2}, Assassin, can't be blocked" },
      ),
    ],
  },
  "Champion's Helm": {
    abilities: [
      staticAbility("attached", { power: 2, toughness: 2 }, { label: "+2/+2" }),
      staticAbility(
        { attached: "host", legendary: true },
        { addKeywords: ["hexproof"] },
        { label: "Hexproof as long as the equipped creature is legendary" },
      ),
    ],
  },
  // Equip commander {3}: read from the text.
  "Commander's Plate": {
    abilities: [
      staticAbility(
        "attached",
        {
          power: 3,
          toughness: 3,
          addProtections: [
            { from: {}, outsideIdentity: true, label: "Protection from each color outside your commander's identity" },
          ],
        },
        { label: "+3/+3, protection from each color not in your commander's color identity" },
      ),
    ],
  },
  // Equip legendary creature {2}: read from the text.
  "Excalibur, Sword of Eden": {
    costReduction: { generic: amount.totalManaValue({ ...HISTORIC, controller: "you" }) },
    abilities: [staticAbility("attached", { power: 10, addKeywords: ["vigilance"] }, { label: "+10/+0 and vigilance" })],
  },
  "Hammer of Nazahn": {
    abilities: [
      triggered(
        when.enters({ subtype: "Equipment", controller: "you" }),
        fx.may("Attach this Equipment to target creature?", fx.attach(ref.target(), ref.eventObject)),
        {
          targets: [target.creature("t", { controller: "you" })],
          label: "An Equipment enters: you may attach it to a creature you control",
        },
      ),
      staticAbility("attached", { power: 2, addKeywords: ["indestructible"] }, { label: "+2/+0 and indestructible" }),
    ],
  },
  // Flash, indestructible: read from the text.
  "Mithril Coat": {
    abilities: [
      triggered(when.entersSelf, [fx.attach(ref.target())], {
        targets: [target.creature("t", { controller: "you", legendary: true })],
        label: "Attach it to a legendary creature you control",
      }),
      staticAbility("attached", { addKeywords: ["indestructible"] }, { label: "Indestructible" }),
    ],
  },
  Nettlecyst: {
    abilities: [
      livingWeapon(),
      staticAbility(
        "attached",
        { power: 1, toughness: 1 },
        { per: { types: ["Artifact", "Enchantment"], controller: "you" }, label: "+1/+1 for each artifact and/or enchantment" },
      ),
    ],
  },
  // Flash: read from the text.
  "Silver Shroud Costume": {
    abilities: [
      triggered(when.entersSelf, [fx.attach(ref.target()), fx.pump(ref.target(), 0, 0, ["shroud"])], {
        targets: [target.creature("t", { controller: "you" })],
        label: "Attach it to a creature you control; it gains shroud until end of turn",
      }),
      staticAbility("attached", { addKeywords: ["unblockable"] }, { label: "Can't be blocked" }),
    ],
  },
  "Sword of Feast and Famine": sword(
    [
      ["B", "Protection from black"],
      ["G", "Protection from green"],
    ],
    "+2/+2, protection from black and from green",
    {
      effects: [fx.discard(1, ref.eventPlayer), fx.untapAll({ types: ["Land"] })],
      label: "That player discards a card; untap all lands you control",
    },
  ),
  "Sword of Truth and Justice": sword(
    [
      ["W", "Protection from white"],
      ["U", "Protection from blue"],
    ],
    "+2/+2, protection from white and from blue",
    {
      effects: [
        fx.chooseAmong(ref.permanentsOf(ref.you, { types: ["Creature"] }), ref.you, "c", {
          prompt: "Creature that gets a +1/+1 counter",
        }),
        fx.addCounters(ref.stored("c"), 1),
        fx.proliferate(),
      ],
      label: "A +1/+1 counter on a creature you control, then proliferate",
    },
  ),

  // --- Planeswalkers -----------------------------------------------------------------------------------------------------
  "Karn, Living Legacy": {
    abilities: [
      loyalty(1, { effects: [fx.createTappedTokens(POWERSTONE)], label: "A tapped Powerstone token" }),
      loyalty(-1, {
        effects: [
          fx.payX("Pay any amount of mana: you look at that many cards from the top", "x"),
          fx.lookAtTop(amount.v("x"), { count: 1, exact: true, rest: "bottom" }),
        ],
        label: "Pay X: look at X cards, one into your hand",
      }),
      loyalty(-7, {
        effects: [
          fx.emblem(
            msg("Karn's emblem"),
            msg("Tap an untapped artifact you control: This emblem deals 1 damage to any target."),
            [
              activated({
                tapOthers: { filter: { types: ["Artifact"] }, count: 1 },
                targets: [target.any()],
                effects: [fx.damage(1, ref.target())],
                label: "Tap an artifact: 1 damage to any target",
              }),
            ],
          ),
        ],
        label: "Emblem: tap an artifact for 1 damage",
      }),
    ],
  },
  "Ugin, the Ineffable": {
    abilities: [
      costReducer(COLORLESS, 2, "Colorless spells you cast cost {2} less"),
      loyalty(1, {
        effects: [
          fx.exileTop(ref.you, 1, "ugin", "you"),
          fx.createTokens(SPIRIT_2, 1, undefined, "spirit"),
          fx.whenNext(when.leaves({}), ref.stored("spirit"), [fx.toHand(ref.target("c"))], {
            bind: { c: ref.stored("ugin") },
            label: "The Spirit token leaves the battlefield: the exiled card goes into your hand",
          }),
        ],
        label: "Exile the top card face down; a 2/2 Spirit",
      }),
      loyalty(-3, {
        targets: [target.permanent("t", [], COLORED, "permanent that's one or more colors")],
        effects: [fx.destroy(ref.target())],
        label: "Destroy a colored permanent",
      }),
    ],
  },
  "Ugin, the Spirit Dragon": {
    abilities: [
      loyalty(2, {
        targets: [target.any()],
        effects: [fx.damage(3, ref.target())],
        label: "3 damage to any target",
      }),
      loyaltyX({
        effects: [fx.exile(ref.permanentsOf(ref.eachPlayer, { ...COLORED, compare: [cmp.manaValue("<=", amount.x)] }))],
        label: "Exile each permanent with mana value X or less that's one or more colors",
      }),
      loyalty(-10, {
        effects: [
          fx.gainLife(7),
          fx.draw(7),
          fx.pickFromZone(
            "hand",
            { permanent: true },
            { to: "battlefield" },
            { count: 7, min: 0, prompt: "Put up to seven permanent cards from your hand onto the battlefield" },
          ),
        ],
        label: "Gain 7 life, draw seven cards, then up to seven permanents from your hand",
      }),
    ],
  },

  // --- Creatures -------------------------------------------------------------------------------------------------------
  "Glaring Fleshraker": {
    abilities: [
      triggered(when.castSpell("you", COLORLESS), [fx.createTokens(ELDRAZI_SPAWN)], {
        label: "Colorless spell: a 0/1 Eldrazi Spawn",
      }),
      triggered(
        when.enters({ types: ["Creature"], controller: "you", other: true, ...COLORLESS }),
        [fx.damage(1, ref.eachOpponent)],
        { label: "Another colorless creature enters: 1 damage to each opponent" },
      ),
    ],
  },
  // Flash, flying: read from the text.
  "Liberator, Urza's Battlethopter": {
    abilities: [
      playerStatic({
        spellKeywords: { filter: { anyOf: [COLORLESS, { types: ["Artifact"] }] }, keywords: ["flash"] },
        label: "Colorless and artifact spells you cast have flash",
      }),
      // "If the amount of mana spent to cast it was greater than Liberator's power": checked on trigger and on resolution.
      triggered(when.castSpell("you"), [fx.addCounters(ref.self, 1)], {
        condition: cond.amountGreater(amount.eventManaSpent, amount.powerOf(ref.self)),
        label: "More mana spent than its power: a +1/+1 counter",
      }),
    ],
  },
  // "When this creature dies or another artifact you control is put into a graveyard": a single trigger (it's an artifact).
  "Scrap Trawler": {
    abilities: [
      triggered(when.zoneChange(["battlefield"], { to: ["graveyard"], filter: ARTIFACTS_YOU }), [fx.toHand(ref.target())], {
        targets: [
          {
            ...target.cardInGraveyard("t", { types: ["Artifact"] }, "you", "artifact card with lesser mana value"),
            // "with lesser mana value" than the artifact that left, evaluated on targeting and then on resolution.
            maxManaValueAmount: amount.plus(amount.manaValueOf(ref.eventObject), -1),
          },
        ],
        label: "An artifact you control goes to the graveyard: an artifact card with lesser mana value returns to your hand",
      }),
    ],
  },
  // Flash: read from the text.
  "Shimmer Myr": {
    abilities: [
      playerStatic({
        spellKeywords: { filter: { types: ["Artifact"] }, keywords: ["flash"] },
        label: "Artifact spells you cast have flash",
      }),
    ],
  },
  // Flash: read from the text.
  "Skittering Cicada": {
    abilities: [
      playerStatic({ spellKeywords: { filter: COLORLESS, keywords: ["flash"] }, label: "Colorless spells you cast have flash" }),
      triggered(
        when.castSpell("you", COLORLESS),
        [fx.pump(ref.self, amount.manaValueOf(ref.eventObject), amount.manaValueOf(ref.eventObject), ["trample"])],
        { label: "Colorless spell: trample and +X/+X (X: its mana value)" },
      ),
    ],
  },
  "Wandering Archaic": {
    abilities: [
      triggered(
        when.castSpell("opponent", { types: ["Instant", "Sorcery"] }),
        fx.unlessPays(ref.eventPlayer, { mana: "{2}" }, fx.may("Copy this spell?", fx.copySpell(ref.eventObject, 1))),
        { label: "An opponent casts an instant or sorcery: they pay {2}, or you may copy it" },
      ),
    ],
  },
  // "… a land card and/or an instant or sorcery card": one look for the land (the rest stays on top, in the same
  // order), then one look at the remaining cards of the five for the instant or sorcery.
  "Explore the Vastlands": {
    spell: spell(
      [],
      [
        ...fx.forEachPlayer(ref.eachPlayer, (p, n) => [
          fx.lookAtTop(5, { who: p, chooser: "owner", filter: { types: ["Land"] }, count: 1, rest: "top", store: `land${n}` }),
          fx.lookAtTop(amount.plus(5, amount.neg(amount.v(`land${n}`))), {
            who: p,
            chooser: "owner",
            filter: { types: ["Instant", "Sorcery"] },
            count: 1,
            rest: "bottom",
          }),
        ]),
        fx.gainLife(3, ref.eachPlayer),
      ],
    ),
  },

  // --- Spells -----------------------------------------------------------------------------------------------------------
  "All Is Dust": {
    spell: spell([], [fx.sacrificeIt(ref.permanentsOf(ref.eachPlayer, COLORED))]),
  },
  "Desecrate Reality": {
    spell: spell(
      [
        // "For each opponent, up to one … that player controls": different opponents (five at most).
        {
          ...target.upTo(
            5,
            target.permanent(
              "t",
              [],
              { controller: "opponent", compare: [cmp.parity("even")] },
              "permanent with an even mana value (one per opponent)",
            ),
          ),
          differentPlayers: true,
        },
      ],
      [
        fx.exile(ref.target()),
        // Adamant: at least three colorless mana spent.
        ...fx.when(
          cond.spent("C", 3),
          fx.pickFromZone(
            "graveyard",
            { permanent: true, compare: [cmp.parity("odd")] },
            { to: "battlefield" },
            { count: 1, min: 1, prompt: "Permanent card with an odd mana value to return to the battlefield" },
          ),
        ),
      ],
    ),
  },
  "Echoes of Eternity": {
    abilities: [
      playerStatic({
        triggerMod: { effect: "again", sources: { controller: "you", other: true, ...COLORLESS } },
        label: "Triggered abilities of other colorless spells and permanents you control trigger an additional time",
      }),
      triggered(when.castSpell("you", COLORLESS), [fx.copySpell(ref.eventObject, 1)], {
        label: "Colorless spell: copy it",
      }),
    ],
  },
  "Eldrazi Confluence": {
    spell: chooseThreeRepeat(
      {
        label: "A creature gets +3/−3",
        targets: (i) => [target.creature(`p${i}`)],
        effects: (i) => [fx.pump(ref.target(`p${i}`), 3, -3)],
      },
      {
        label: "Exile a nonland permanent, then return it tapped",
        targets: (i) => [target.nonland(`e${i}`)],
        effects: (i) => [
          fx.exileCard(ref.target(`e${i}`), { name: `x${i}` }),
          fx.toBattlefield(ref.stored(`x${i}`), { tapped: true }),
        ],
      },
      {
        label: "A 1/1 Eldrazi Scion",
        targets: () => [],
        effects: () => [fx.createTokens(ELDRAZI_SCION)],
      },
    ),
  },
  "Eldritch Immunity": {
    spell: altCostMode(
      "Overload",
      "{4}{C}",
      {
        targets: [target.creature("t", { controller: "you" })],
        effects: [fx.modify(ref.target(), { addProtections: [ALL_COLORS] })],
      },
      { effects: [fx.modifyAll({ types: ["Creature"], controller: "you" }, { addProtections: [ALL_COLORS] })] },
    ),
  },
  "Kozilek's Command": {
    spell: chooseTwo(
      mode(
        "A player creates X 0/1 Eldrazi Spawn",
        [target.player("p1")],
        [fx.createTokens(ELDRAZI_SPAWN, amount.x, ref.target("p1"))],
      ),
      mode(
        "A player scries X, then draws a card",
        [target.player("p2")],
        [fx.scry(amount.x, ref.target("p2")), fx.draw(1, ref.target("p2"))],
      ),
      mode(
        "Exile a creature with mana value X or less",
        [{ ...target.creature("c3"), maxManaValueAmount: amount.x, label: "creature with mana value X or less" }],
        [fx.exile(ref.target("c3"))],
      ),
      mode(
        "Exile up to X cards from graveyards",
        [{ ...target.cardInGraveyard("g4", {}, "any"), count: 99, optional: true, countX: "upTo" }],
        [fx.exileCard(ref.target("g4"))],
      ),
    ),
  },
  "Null Elemental Blast": {
    spell: modal(
      mode(
        "Counter a multicolored spell",
        [target.spell("s", { multicolored: true }, "multicolored spell")],
        [fx.counter(ref.target("s"))],
      ),
      mode(
        "Destroy a multicolored permanent",
        [target.permanent("p", [], { multicolored: true }, "multicolored permanent")],
        [fx.destroy(ref.target("p"))],
      ),
    ),
  },
  "Candelabra of Tawnos": {
    abilities: [
      activated({
        mana: "{X}",
        tap: true,
        targets: [{ id: "t", label: "land", filter: { objects: { types: ["Land"] } }, count: 99, countX: true }],
        effects: [fx.untap(ref.target())],
        label: "Untap X target lands",
      }),
    ],
  },
  "Null Brooch": {
    abilities: [
      activated({
        mana: "{2}",
        tap: true,
        discardHand: true,
        targets: [target.spell("t", { notTypes: ["Creature"] }, "noncreature spell")],
        effects: [fx.counter(ref.target())],
        label: "Discard your hand: counter target noncreature spell",
      }),
    ],
  },

  // --- Sideboard: extras of the proxy set (outside the deck, for the players' decks) ---------------------------------------
  "Eldrazi Conscription": {
    enchant: { filter: { types: ["Creature"] }, label: "creature" },
    abilities: [
      staticAbility(
        "attached",
        {
          power: 10,
          toughness: 10,
          addKeywords: ["trample"],
          addAbilities: [
            triggered(when.attacksSelf, [fx.sacrifice(ref.defendingPlayer, { permanent: true }, 2)], {
              label: "Annihilator 2: defending player sacrifices 2 permanents",
            }),
          ],
        },
        { label: "+10/+10, trample and annihilator 2" },
      ),
    ],
  },
  "Foundry Inspector": {
    abilities: [costReducer({ types: ["Artifact"] }, 1, "Artifact spells you cast cost {1} less")],
  },
  "Palladium Myr": { abilities: [manaAbility("C", 2)] },
  "Portal to Phyrexia": {
    abilities: [
      triggered(when.entersSelf, [fx.sacrifice(ref.eachOpponent, { types: ["Creature"] }, 3)], {
        label: "Each opponent sacrifices three creatures",
      }),
      triggered(when.yourUpkeep, [fx.toBattlefield(ref.target(), { underYourControl: true, addSubtypes: ["Phyrexian"] })], {
        targets: [target.cardInGraveyard("t", { types: ["Creature"] }, "any", "creature card from a graveyard")],
        label: "A creature card from a graveyard enters under your control; it's a Phyrexian in addition",
      }),
    ],
  },
  "Super State": {
    enchant: { filter: { types: ["Creature"] }, label: "creature" },
    abilities: [
      staticAbility(
        "attached",
        { setPower: 9, setToughness: 9, addKeywords: ["flying", "firstStrike", "trample", "haste"] },
        { label: "Base power and toughness 9/9, flying, first strike, trample, and haste" },
      ),
      triggered(
        { on: "dealsCombatDamage", who: { attached: "host" }, to: { players: "opponent" } },
        [fx.damage(amount.eventAmount, ref.except(ref.eachOpponent, ref.eventPlayer), ref.eventObject)],
        { label: "It deals that much damage to each other opponent" },
      ),
    ],
  },
};
