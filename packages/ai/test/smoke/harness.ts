/**
 * Smoke test of the supported cards: each card is played in a prepared position (mana of every
 * color, targets of every kind, stocked graveyards), then each of its activated abilities is used;
 * the game goes on a little. No unexpected exception or invariant violation is tolerated.
 *
 * One file per set (`smoke/<set>.test.ts`) calls `smokeTest`: vitest spreads them over all cores.
 */
import { CARDS, SETS } from "@mtgx/cards";
import {
  type Agent,
  type CardDef,
  type Decision,
  fallbackDecision,
  type GameState,
  legalActions,
  RulesError,
  submit,
} from "@mtgx/engine";
import { describe, expect, it } from "vitest";
import { scenario } from "../../../engine/test/helpers";
import { enumerateDecisions, randomAgent } from "../../src";
import { checkInvariants } from "../../src/selfplay";

const LANDS = ["Plains", "Island", "Swamp", "Mountain", "Forest"].flatMap((l) => [l, l, l]);
const LIBRARY = [
  "Forest",
  "Llanowar Elves",
  "Opt",
  "Island",
  "Giant Growth",
  "Plains",
  "Helpful Hunter",
  "Swamp",
  "Stab",
  "Mountain",
  "Shivan Dragon",
  "Forest",
  "Dragon Fodder",
  "Island",
  "Prideful Parent",
  "Plains",
];

/** Extra permanents for player 1 for the cards that need them ("Enchant artifact you control"). */
const EXTRA_P1: Record<string, string[]> = {
  // "As an additional cost, sacrifice a legendary creature" (Commander).
  "Ultimate Nullification": ["Invisible Woman"],
  // Lorwyn Eclipsed: "behold a [type] and exile it" (a Changeling will do).
  "Champion of the Weird": ["Changeling Wayfinder"],
  "Champion of the Path": ["Changeling Wayfinder"],
  "Champion of the Clachan": ["Changeling Wayfinder"],
  "Champions of the Shoal": ["Changeling Wayfinder"],
  "Hardlight Containment": ["Nutrient Block"],
  // {C}: a source of colorless mana.
  "Warping Wail": ["Ancient Tomb"],
  // The Vision deck: {C}, {C}{C} or {C}{C}{C} (Ancient Tomb, Sol Ring).
  "Eldritch Immunity": ["Ancient Tomb"],
  "Null Elemental Blast": ["Ancient Tomb"],
  "Glaring Fleshraker": ["Ancient Tomb"],
  "Eldrazi Confluence": ["Ancient Tomb"],
  "Kozilek's Command": ["Ancient Tomb"],
  "Echoes of Eternity": ["Ancient Tomb", "Sol Ring"],
  // {B}{B}{B}{B}{B}: three Swamps are not enough.
  "Zodiark, Umbral God": ["Swamp", "Swamp"],
  "Pox Plague": ["Swamp", "Swamp"],
  // {B}{B}{B}{B}{B}{B} and {X}{X}{B}{B}{B}{B}.
  "Doomsday Excruciator": ["Swamp", "Swamp", "Swamp"],
  "Meathook Massacre II": ["Swamp", "Swamp"],
  // {U}{U}{U}{U}: three Islands are not enough.
  "Secret of Bloodbending": ["Island"],
  // {W}{W}{W}{W}{W}: three Plains are not enough.
  "Anti-Venom, Horrifying Healer": ["Plains", "Plains"],
  // "a targeted Equipment".
  "Stolen Uniform": ["Monk's Fist"],
  // "copies of a targeted token": Fountainport makes a Fish.
  "For the Common Good": ["Fountainport"],
};
/** Extra cards in player 1's graveyard ("targeted artifact card in your graveyard"). */
const EXTRA_P1_GRAVEYARD: Record<string, string[]> = {
  "Tune Up": ["Nutrient Block"],
  "Abuelo's Awakening": ["Nutrient Block"],
  // "targeted Villain or Hero card in your graveyard".
  "Decoy Ploy": ["Swordsman, Sharp Scoundrel"],
};

/** Extra cards in player 2's hand (counterspells that target a spell with MV 4 or more). */
const EXTRA_P2_HAND: Record<string, string[]> = {
  "Disdainful Stroke": ["Serra Angel"],
  "Hindering Light": ["Shock"],
};
/** Extra permanents for player 2 (enough to cast those spells). */
const EXTRA_P2: Record<string, string[]> = { "Hindering Light": ["Mountain"] };
/**
 * Demanding counterspells ("MV 4 or more"): the game starts on player 2's turn, who casts this spell; player 1 has
 * priority to respond to it.
 */
const P2_CASTS_FIRST: Record<string, string> = {
  "Disdainful Stroke": "Serra Angel",
  // "a spell that targets a permanent you control": Shock targets a creature of player 1.
  "Hindering Light": "Shock",
};

function setup(c: CardDef): GameState {
  const first = P2_CASTS_FIRST[c.name];
  const s = scenario({
    turn: 3,
    active: first ? "p2" : "p1",
    p1: {
      battlefield: [
        ...LANDS,
        "Llanowar Elves",
        "Prideful Parent",
        "Sanguine Syphoner",
        "Diregraf Ghoul",
        ...(EXTRA_P1[c.name] ?? []),
      ],
      hand: [c, "Forest"],
      graveyard: [
        "Opt",
        "Stab",
        "Helpful Hunter",
        "Llanowar Elves",
        "Forest",
        "Bake into a Pie",
        "Giant Growth",
        "Zombify",
        ...(EXTRA_P1_GRAVEYARD[c.name] ?? []),
      ],
      library: LIBRARY,
    },
    p2: {
      battlefield: [
        ...LANDS.slice(0, 6),
        "Shivan Dragon",
        "Llanowar Elves",
        "Gleaming Barrier",
        "Anthem of Champions",
        ...(EXTRA_P2[c.name] ?? []),
      ],
      hand: [
        "Giant Growth",
        "Opt",
        "Forest",
        "Llanowar Elves",
        "Helpful Hunter",
        "Goblin Firebomb",
        ...(EXTRA_P2_HAND[c.name] ?? []),
      ],
      graveyard: ["Pelakka Wurm", "Think Twice"],
      library: LIBRARY,
    },
  });
  if (!first) return s;
  const spell = s.players.p2?.hand.find((id) => s.defs[s.objects[id]?.defId ?? ""]?.name === first) as string;
  // Its targets, preferably on player 1's side.
  const opt = legalActions(s, "p2").find((a) => a.type === "cast" && a.card === spell);
  const targets =
    opt?.type === "cast"
      ? Object.fromEntries(
          (opt.modes[0]?.targets ?? []).map((t) => [
            t.id,
            [...t.legal.filter((id) => s.objects[id]?.controller === "p1"), ...t.legal].slice(0, 1),
          ]),
        )
      : undefined;
  const cast = submit(s, "p2", { type: "cast", card: spell, targets }).state;
  return submit(cast, "p2", { type: "pass" }).state;
}

/** Player 1: tries every spell and every ability (once per card and per zone), the rest at random. */
function explorer(seed: number): Agent {
  const rand = randomAgent(seed, 0.2);
  const tried = new Set<string>();
  return (s, me) => {
    if (s.pending?.kind !== "priority") return rand(s, me);
    for (const a of legalActions(s, me)) {
      if (a.type === "pass" || a.type === "tapForMana") continue;
      const id = a.type === "activate" ? a.source : a.card;
      const o = s.objects[id];
      const key = `${a.type}:${o?.defId}:${o?.zone}:${a.type === "activate" ? a.ability : ""}`;
      if (tried.has(key)) continue;
      tried.add(key);
      const ds = enumerateDecisions(a, 4);
      // A decision from the middle, otherwise the first one the engine accepts (target constraints it does not see:
      // "two cards that share a creature type", Unbury).
      const mid = Math.floor(ds.length / 2);
      const d = [...ds.slice(mid), ...ds.slice(0, mid)].find((x) => {
        try {
          submit(s, me, x);
          return true;
        } catch (e) {
          if (e instanceof RulesError) return false;
          throw e;
        }
      });
      if (d) return d;
    }
    return { type: "pass" };
  };
}

function play(c: CardDef, seed: number): { state: GameState; illegal: number; played: boolean } {
  let state = setup(c);
  const sizes: Record<string, number> = {};
  for (const o of Object.values(state.objects)) if (!o.isToken) sizes[o.owner] = (sizes[o.owner] ?? 0) + 1;
  const agents: Record<string, Agent> = { p1: explorer(seed), p2: randomAgent(seed + 1, 0.6) };
  let illegal = 0;
  let played = false;
  let playedAt = -1;
  for (let i = 0; i < 700 && state.pending && !state.over && state.turn.number <= 8; i++) {
    if (playedAt >= 0 && i - playedAt > AFTER_PLAYED) break;
    const p = state.pending;
    let d: Decision = (agents[p.player] as Agent)(state, p.player);
    try {
      state = submit(state, p.player, d).state;
    } catch (e) {
      if (!(e instanceof RulesError)) throw new Error(`${c.name} : ${(e as Error).stack}`);
      illegal++;
      d = fallbackDecision(state, p);
      state = submit(state, p.player, d).state;
    }
    if ((d.type === "cast" || d.type === "playLand") && state.objects[d.card] === undefined) {
      played ||= Object.values(state.objects).some((o) => o.defId === c.id && o.zone !== "hand" && o.zone !== "library");
      if (played && playedAt < 0) playedAt = i;
    }
    const errors = checkInvariants(state, sizes);
    if (errors.length) throw new Error(`${c.name} (decision ${i}):\n${errors.join("\n")}`);
  }
  return { state, illegal, played };
}

/** Decisions played after the card was played, before stopping the game (its effects had time to act). */
const AFTER_PLAYED = 80;

// All the supported cards, except basic lands.
const cards = Object.values(CARDS).filter((c) => !c.isToken && c.implemented && !c.meldResult && !c.supertypes.includes("Basic"));

/**
 * Declares the smoke test of the cards of one or more sets. `shard`: [i, n] keeps only one card in n
 * (to split a big set into several files, hence several workers).
 */
export function smokeTest(codes: string[], shard: [number, number] = [0, 1]): void {
  const names = new Map(SETS.map((s) => [s.code, s.name]));
  for (const code of codes) {
    const list = cards.filter((c) => c.set === code).filter((_, k) => k % shard[1] === shard[0]);
    if (list.length === 0) continue;
    describe(`card smoke test: ${names.get(code) ?? code}`, () => {
      it.each(list.map((c) => [c.name, c] as const))("%s", (_, c) => {
        let playedOnce = false;
        // Following seeds only while the card could not be played.
        for (const seed of [1, 2, 3]) {
          const { state, played } = play(c, seed);
          expect(state.pending || state.over).toBeTruthy();
          playedOnce ||= played;
          if (playedOnce) break;
        }
        // The card was played (cast or put onto the battlefield) at least once.
        expect(playedOnce, `${c.name} could not be played`).toBe(true);
      });
    });
  }
}

/** Sets that have their own smoke test file; the others are in `others.test.ts`. */
export const OWN_FILES = [
  "FDN",
  "FRA",
  "EOE",
  "DFT",
  "OTJ",
  "BIG",
  "FIN",
  "DSK",
  "BLB",
  "LCI",
  "TDM",
  "ECL",
  "WOE",
  "SOS",
  "MKM",
  "TLA",
  "MSH",
  "SPM",
  "TMT",
  "HOB",
  "SPG",
  "SOA",
  "FCA",
  "OTP",
  "EOS",
  "PZA",
  "WOT",
  "REX",
  "EDH",
];
export const OTHER_SETS = (): string[] => SETS.map((s) => s.code).filter((c) => !OWN_FILES.includes(c));
