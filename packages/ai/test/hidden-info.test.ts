/**
 * Audit des informations cachées (jeu en ligne) : à chaque décision de parties IA contre IA, rien de ce
 * que reçoit un joueur (vue, événements filtrés, faces) ne doit citer une carte qui n'existe que dans la
 * main ou la bibliothèque d'un adversaire et qui n'a jamais été rendue publique ni révélée à ce joueur.
 */
import { implementedCards, toCardDef } from "@mtgx/cards";
import {
  type CardDef,
  type ChoiceRequest,
  type Color,
  createGame,
  fallbackDecision,
  filterEvents,
  type GameState,
  projectView,
  RulesError,
  submit,
  visibleFaces,
} from "@mtgx/engine";
import { describe, expect, it } from "vitest";
import { randomCommanderDeck } from "../../../tools/random-deck";
import { mulberry32, randomAgent } from "../src";

const ALL = implementedCards();
const BASICS: Record<Color, string> = { W: "Plains", U: "Island", B: "Swamp", R: "Mountain", G: "Forest" };

function randomDeck(seed: number): CardDef[] {
  const rand = mulberry32(seed);
  const colors = (["W", "U", "B", "R", "G"] as Color[]).sort(() => rand() - 0.5).slice(0, 2);
  const spells = ALL.filter((c) => !c.types.includes("Land") && c.colors.length > 0 && c.colors.every((x) => colors.includes(x)));
  const deck: CardDef[] = [];
  for (let i = 0; i < 36; i++) deck.push(spells[Math.floor(rand() * spells.length)] as CardDef);
  for (let i = 0; i < 24; i++) deck.push(ALL.find((c) => c.name === BASICS[colors[i % 2] as Color]) as CardDef);
  return deck;
}

/** Identifiants de définitions cités n'importe où dans une valeur JSON. */
function defIdsIn(value: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(value)) for (const v of value) defIdsIn(v, out);
  else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      if (/defId$/i.test(k) && typeof v === "string") out.add(v);
      else if (k === "defIds" && Array.isArray(v)) for (const d of v) out.add(String(d));
      else defIdsIn(v, out);
    }
  }
  return out;
}

const PUBLIC_ZONES = new Set(["battlefield", "graveyard", "exile", "stack", "command"]);

/** `commander` : partie de Commander à `n` joueurs, decks Commander aléatoires (PLAN-E). */
function auditGame(seed: number, opts: { players?: number; commander?: boolean } = {}): string[] {
  const players = Array.from({ length: opts.players ?? 2 }, (_, i) => `p${i + 1}`);
  const cmd = opts.commander ? players.map((_, i) => randomCommanderDeck(seed * 31 + i)) : null;
  let { state } = createGame({
    seed,
    ...(cmd ? { variant: "commander" as const } : {}),
    players: players.map((id, i) => ({
      id,
      name: id,
      deck: cmd?.[i]?.deck ?? randomDeck(seed * 31 + i),
      commanders: cmd?.[i]?.commanders,
    })),
  });
  const agents = Object.fromEntries(players.map((p, i) => [p, randomAgent(seed * 7 + i)]));
  const publicSeen = new Set<string>();
  // Chaque joueur connaît sa propre decklist ; puis ce qui lui est révélé par ses propres décisions.
  const known: Record<string, Set<string>> = Object.fromEntries(
    players.map((p) => [
      p,
      new Set(
        Object.values(state.objects)
          .filter((o) => o.owner === p)
          .map((o) => o.defId),
      ),
    ]),
  );
  const leaks: string[] = [];
  const check = (s: GameState, events: Parameters<typeof filterEvents>[0]) => {
    for (const o of Object.values(s.objects)) if (PUBLIC_ZONES.has(o.zone)) publicSeen.add(o.defId);
    for (const item of s.stack) publicSeen.add(item.sourceDefId);
    // Une carte passée par une zone publique pendant la décision (surveillée au cimetière puis reprise en main) a été vue.
    for (const ev of events) if (ev.type === "moved" && ev.defId && PUBLIC_ZONES.has(ev.to)) publicSeen.add(ev.defId);
    // Cartes révélées à tous (exploration…), et cartes défaussées (publiques, même si un remplacement les envoie ailleurs
    // qu'au cimetière : Nexus of Fate, Green Sun's Zenith).
    for (const ev of events) if (ev.type === "reveal" || ev.type === "discard") for (const d of ev.defIds) publicSeen.add(d);
    for (const v of players) {
      const view = projectView(s, v);
      if (view.pending?.kind === "choice") for (const o of view.pending.objects ?? []) known[v]?.add(o.defId);
      // 722 (Mindslaver) : le joueur qui contrôle le tour d'un autre voit tout ce que celui-ci peut voir, dont sa main.
      if (s.turnControl?.by === v && s.turn.active === s.turnControl.player)
        for (const id of s.players[s.turnControl.player]?.hand ?? []) known[v]?.add(s.objects[id]?.defId ?? "");
      const secret = new Set<string>();
      for (const o of Object.values(s.objects)) {
        if (o.owner === v || (o.zone !== "hand" && o.zone !== "library")) continue;
        if (!publicSeen.has(o.defId) && !known[v]?.has(o.defId)) secret.add(o.defId);
      }
      const evs = filterEvents(events, v);
      const seen = defIdsIn([view, evs, Object.keys(visibleFaces(s, view, evs)).map((defId) => ({ defId }))]);
      for (const d of seen) {
        if (secret.has(d)) leaks.push(`seed ${seed}, tour ${s.turn.number} : ${v} voit ${d}`);
      }
    }
  };
  check(state, []);
  for (let i = 0; i < 2500 * (players.length - 1) && state.pending && !state.over && leaks.length === 0; i++) {
    const p = state.pending;
    let r: ReturnType<typeof submit>;
    try {
      r = submit(state, p.player, (agents[p.player] as ReturnType<typeof randomAgent>)(state, p.player));
    } catch (e) {
      if (!(e instanceof RulesError)) throw e;
      r = submit(state, p.player, fallbackDecision(state, p));
    }
    state = r.state;
    check(state, r.events);
  }
  return leaks;
}

describe("informations cachées", () => {
  it("aucun joueur ne reçoit une carte cachée d'un adversaire (vue, événements, faces)", () => {
    const leaks: string[] = [];
    for (let seed = 1; seed <= 20; seed++) leaks.push(...auditGame(seed));
    expect(leaks.slice(0, 10)).toEqual([]);
  }, 120_000);

  it("Commander à 3 et 4 joueurs (PLAN-E) : rien de caché ne fuit, commandants publics compris", () => {
    const leaks: string[] = [];
    for (let seed = 1; seed <= 4; seed++) leaks.push(...auditGame(seed, { players: 3 + (seed % 2), commander: true }));
    expect(leaks.slice(0, 10)).toEqual([]);
  }, 240_000);
});

/** Chaînes d'une question (options, noms proposés, suggestion, libellés), et de celles des terrains à jouer. */
function requestStrings(view: ReturnType<typeof projectView>): string[] {
  const p = view.pending;
  const reqs: ChoiceRequest[] = [];
  if (p?.kind === "choice" && p.request) reqs.push(p.request);
  if (p?.kind === "priority") for (const a of p.actions ?? []) if (a.type === "playLand" && a.choose) reqs.push(a.choose);
  return reqs.flatMap((r) => [
    ...r.suggested.map(String),
    ...Object.keys(r.labels ?? {}),
    ...Object.values(r.labels ?? {}),
    ...(r.type === "pick" ? r.options : r.type === "name" ? r.featured : []),
  ]);
}

describe("informations cachées : noms à choisir (nom de carte, de terrain, type de créature)", () => {
  it("la question ne cite aucune carte que l'adversaire n'a que dans sa main ou sa bibliothèque", () => {
    const plains = ALL.find((c) => c.name === "Plains") as CardDef;
    const mine = ["Skyseer's Chariot", "Petrified Hamlet", "Cavern of Souls"].map(
      (n) => ALL.find((c) => c.name === n) as CardDef,
    );
    const deck = [...Array(30).fill(plains), ...mine.flatMap((d) => Array(10).fill(d))] as CardDef[];
    let asked = 0;
    const leaks: string[] = [];
    // Types de créature de chaque nom de carte, calculés une fois (et non un parcours du catalogue par décision).
    const subtypesOf = new Map(ALL.map((c) => [c.name, c.subtypes]));
    for (let seed = 1; seed <= 6; seed++) {
      let { state } = createGame({
        seed,
        players: [
          { id: "p1", name: "p1", deck },
          { id: "p2", name: "p2", deck: randomDeck(seed * 13) },
        ],
      });
      const agents = { p1: randomAgent(seed * 3), p2: randomAgent(seed * 5) };
      const opponentCards = new Set(
        Object.values(state.objects)
          .filter((o) => o.owner === "p2")
          .map((o) => o.defId),
      );
      const ownNames = new Set(deck.map((d) => d.name));
      const publicNames = new Set<string>();
      for (let i = 0; i < 1500 && state.pending && !state.over; i++) {
        for (const o of Object.values(state.objects))
          if (PUBLIC_ZONES.has(o.zone) && !o.faceDown) publicNames.add(state.defs[o.defId]?.name ?? "");
        const view = projectView(state, "p1");
        const strings = new Set(requestStrings(view));
        const nameAsked = view.pending?.kind === "choice" && view.pending.request?.type === "name";
        if (nameAsked) asked++;
        // Types de créature connus de p1 : ceux des cartes publiques ou des siennes (seulement quand un nom est demandé).
        const knownTypes = nameAsked
          ? new Set([...publicNames, ...ownNames].flatMap((n) => subtypesOf.get(n) ?? []))
          : new Set<string>();
        for (const d of opponentCards) {
          const name = state.defs[d]?.name ?? "";
          if (!ownNames.has(name) && !publicNames.has(name) && strings.has(name))
            leaks.push(`graine ${seed}, tour ${state.turn.number} : p1 voit ${name}`);
          if (!nameAsked) continue;
          // Types de créature : seulement ceux des cartes publiques ou des vôtres.
          const types = state.defs[d]?.types.includes("Creature") ? (state.defs[d]?.subtypes ?? []) : [];
          for (const t of types) if (!knownTypes.has(t) && strings.has(t)) leaks.push(`graine ${seed} : p1 voit le type ${t}`);
        }
        const p = state.pending;
        let r: ReturnType<typeof submit>;
        try {
          r = submit(state, p.player, agents[p.player as "p1" | "p2"](state, p.player));
        } catch (e) {
          if (!(e instanceof RulesError)) throw e;
          r = submit(state, p.player, fallbackDecision(state, p));
        }
        state = r.state;
      }
    }
    expect(asked).toBeGreaterThan(0);
    expect(leaks.slice(0, 10)).toEqual([]);
  }, 120_000);
});

/** Carte à déguisement de test : lancée face cachée, elle ne doit pas être révélée à l'adversaire. */
const DISGUISED = toCardDef(
  {
    name: "Espion d'audit",
    number: "1",
    rarity: "common",
    // Coûts hors d'atteinte : la carte n'est jouée que face cachée (et n'est pas retournée).
    manaCost: "{12}{W}",
    cmc: 13,
    typeLine: "Creature — Human Rogue",
    oracleText: "Disguise {12}{W}",
    power: "3",
    toughness: "3",
    colors: ["W"],
    keywords: ["Disguise"],
    image: "",
    artCrop: "",
    legalities: { standard: "legal" },
  },
  { abilities: [] },
  "TST",
);

describe("informations cachées : cartes face cachée (708)", () => {
  it("l'adversaire ne voit pas la carte d'un permanent face cachée tant qu'elle n'est pas révélée", () => {
    const plains = ALL.find((c) => c.name === "Plains") as CardDef;
    let leaks = 0;
    let faceDownSeen = 0;
    for (let seed = 1; seed <= 15; seed++) {
      const deck = [...Array(24).fill(DISGUISED), ...Array(36).fill(plains)] as CardDef[];
      let { state } = createGame({
        seed,
        players: [
          { id: "p1", name: "p1", deck },
          { id: "p2", name: "p2", deck: randomDeck(seed) },
        ],
      });
      const agents = { p1: randomAgent(seed * 3), p2: randomAgent(seed * 5) };
      let revealed = false;
      for (let i = 0; i < 2500 && state.pending && !state.over; i++) {
        const p = state.pending;
        let r: ReturnType<typeof submit>;
        try {
          r = submit(state, p.player, agents[p.player as "p1" | "p2"](state, p.player));
        } catch (e) {
          if (!(e instanceof RulesError)) throw e;
          r = submit(state, p.player, fallbackDecision(state, p));
        }
        state = r.state;
        if (r.events.some((e) => e.type === "turnedFaceUp")) revealed = true;
        if (Object.values(state.objects).some((o) => o.defId === DISGUISED.id && PUBLIC_ZONES.has(o.zone))) revealed = true;
        if (state.battlefield.some((id) => state.objects[id]?.faceDown)) faceDownSeen++;
        // 708.5 : p2 qui prend le contrôle d'un permanent face cachée peut le regarder ; la carte lui est alors connue.
        if (state.battlefield.some((id) => state.objects[id]?.faceDown && state.objects[id]?.controller === "p2"))
          revealed = true;
        if (revealed) break;
        const view = projectView(state, "p2");
        const evs = filterEvents(r.events, "p2");
        // Une question qui fait regarder la main ou la bibliothèque adverse (Solve for Disappointment : « choisissez la
        // carte qu'il défausse ») révèle légitimement ces cartes : seul le permanent face cachée est audité ici.
        const shown =
          view.pending?.kind === "choice"
            ? { ...view.pending, objects: view.pending.objects?.filter((o) => o.zone !== "hand" && o.zone !== "library") }
            : view.pending;
        const audited = { ...view, pending: shown } as typeof view;
        const seen = defIdsIn([audited, evs, Object.keys(visibleFaces(state, audited, evs)).map((defId) => ({ defId }))]);
        if (seen.has(DISGUISED.id)) leaks++;
      }
    }
    expect(faceDownSeen).toBeGreaterThan(0);
    expect(leaks).toBe(0);
  }, 120_000);
});
