/**
 * Test de fumée de toutes les cartes gérées du set principal : chaque carte est jouée dans une position
 * préparée (mana de toutes les couleurs, cibles de chaque sorte, cimetières garnis), puis chacune de ses
 * capacités activées est utilisée ; la partie continue quelques tours. Aucune exception inattendue ni
 * violation d'invariant n'est tolérée.
 */
import { CARDS, isMainSet } from "@mtgx/cards";
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
import { scenario } from "../../engine/test/helpers";
import { enumerateDecisions, randomAgent } from "../src";
import { checkInvariants } from "../src/selfplay";

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

function setup(c: CardDef): GameState {
  return scenario({
    turn: 3,
    p1: {
      battlefield: [...LANDS, "Llanowar Elves", "Prideful Parent", "Sanguine Syphoner", "Diregraf Ghoul"],
      hand: [c, "Forest"],
      graveyard: ["Opt", "Stab", "Helpful Hunter", "Llanowar Elves", "Forest", "Bake into a Pie", "Giant Growth", "Zombify"],
      library: LIBRARY,
    },
    p2: {
      battlefield: [...LANDS.slice(0, 6), "Shivan Dragon", "Llanowar Elves", "Gleaming Barrier", "Anthem of Champions"],
      hand: ["Giant Growth", "Opt", "Forest", "Llanowar Elves", "Helpful Hunter"],
      graveyard: ["Pelakka Wurm", "Think Twice"],
      library: LIBRARY,
    },
  });
}

/** Joueur 1 : essaie chaque sort et chaque capacité (une fois par carte et par zone), le reste au hasard. */
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
      const d = ds[Math.floor(ds.length / 2)] ?? ds[0];
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
  for (let i = 0; i < 700 && state.pending && !state.over && state.turn.number <= 8; i++) {
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
    }
    const errors = checkInvariants(state, sizes);
    if (errors.length) throw new Error(`${c.name} (décision ${i}) :\n${errors.join("\n")}`);
  }
  return { state, illegal, played };
}

const cards = Object.values(CARDS).filter((c) => isMainSet(c) && c.implemented && !c.supertypes.includes("Basic"));

describe("test de fumée des cartes du set principal", () => {
  it.each(cards.map((c) => [c.name, c] as const))("%s", (_, c) => {
    let playedOnce = false;
    for (const seed of [1, 2, 3]) {
      const { state, played } = play(c, seed);
      expect(state.pending || state.over).toBeTruthy();
      playedOnce ||= played;
    }
    // La carte a bien été jouée (lancée ou posée) au moins une fois.
    expect(playedOnce, `${c.name} n'a pas pu être jouée`).toBe(true);
  });
});
