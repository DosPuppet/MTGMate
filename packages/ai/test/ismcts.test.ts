/**
 * ISMCTS (niveau élevé) : reproductible, aveugle à l'information cachée, et capable de trouver un coup évident.
 */
import { card } from "@mtgx/cards";
import { cloneState, createObject, type GameState, registerDef } from "@mtgx/engine";
import { describe, expect, it } from "vitest";
import { scenario } from "../../engine/test/helpers";
import { aiAgent, mulberry32 } from "../src";
import { determinize, ismctsPriority } from "../src/ismcts";
import { MEDIUM_PROFILE } from "../src/profile";

/** Une position de début de partie avec plusieurs options : créature, sort de dégâts, ou attendre. */
function position(): GameState {
  return scenario({
    p1: {
      battlefield: ["Mountain", "Mountain", "Forest", "Bear Cub"],
      hand: ["Burst Lightning", "Gnarlback Rhino", "Giant Growth"],
      library: ["Forest", "Mountain", "Swab Goblin", "Forest", "Mountain", "Forest"],
    },
    p2: {
      battlefield: ["Mountain", "Mountain", "Swab Goblin"],
      hand: ["Scorching Dragonfire", "Mountain", "Goblin Boarders"],
      library: ["Mountain", "Raging Redcap", "Mountain", "Mountain", "Brazen Scourge", "Mountain"],
    },
  });
}

const PROFILE = { ...MEDIUM_PROFILE, attack: "search" as const, block: "search" as const, exposure: true };

describe("ISMCTS", () => {
  it("est reproductible à graine et budget égaux", () => {
    const s = position();
    const a = ismctsPriority(s, "p1", PROFILE, { rand: mulberry32(7), iterations: 60 });
    const b = ismctsPriority(s, "p1", PROFILE, { rand: mulberry32(7), iterations: 60 });
    expect(a).not.toBeNull();
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("ne lit pas l'information cachée : main adverse et ordre des bibliothèques", () => {
    const s = position();
    // Même position vue par p1, mais une autre répartition des cartes cachées de p2 entre main et bibliothèque,
    // et d'autres ordres de bibliothèque : la décision doit être identique.
    const t = cloneState(s);
    const p2 = t.players.p2;
    const p1 = t.players.p1;
    if (!p2 || !p1) throw new Error("joueurs");
    const pool = [...p2.hand, ...p2.library].reverse();
    p2.hand = pool.slice(0, p2.hand.length);
    p2.library = pool.slice(p2.hand.length);
    for (const id of p2.hand) (t.objects[id] as { zone: string }).zone = "hand";
    for (const id of p2.library) (t.objects[id] as { zone: string }).zone = "library";
    p1.library.reverse();
    expect(p2.hand.map((id) => t.defs[t.objects[id]?.defId ?? ""]?.name)).not.toEqual(
      s.players.p2?.hand.map((id) => s.defs[s.objects[id]?.defId ?? ""]?.name),
    );
    const a = ismctsPriority(s, "p1", PROFILE, { rand: mulberry32(3), iterations: 60 });
    const b = ismctsPriority(t, "p1", PROFILE, { rand: mulberry32(3), iterations: 60 });
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });

  it("trouve le sort létal", () => {
    const s = scenario({
      p1: { battlefield: ["Mountain", "Forest"], hand: ["Burst Lightning", "Bear Cub"] },
      p2: { life: 2, battlefield: ["Swab Goblin"] },
    });
    const d = aiAgent("expert", { seed: 5, budget: { iterations: 40 }, players: 2 })(s, "p1");
    expect(d.type).toBe("cast");
    expect(d.type === "cast" && Object.values(d.targets ?? {}).flat()).toEqual(["p2"]);
  });

  it("sans temps suffisant (machine lente), rend la main à l'heuristique", () => {
    expect(ismctsPriority(position(), "p1", PROFILE, { rand: mulberry32(1), ms: 0, minIterations: 24 })).toBeNull();
  });

  it("déterminisation : cartes cachées tirées des seules cartes vues, cartes connues intactes", () => {
    const s = position();
    const d = determinize(s, "p1", mulberry32(9));
    const names = (st: GameState, ids: string[]) => ids.map((id) => st.defs[st.objects[id]?.defId ?? ""]?.name);
    const hidden = (st: GameState) => [...(st.players.p2?.hand ?? []), ...(st.players.p2?.library ?? [])];
    // Seulement ce qu'on a vu de p2 (Swab Goblin) et des terrains de base de ses couleurs (Montagne).
    for (const n of names(d, hidden(d))) expect(["Swab Goblin", "Mountain"]).toContain(n);
    expect(d.players.p2?.hand.length).toBe(s.players.p2?.hand.length);
    expect(d.players.p2?.library.length).toBe(s.players.p2?.library.length);
    // Ce que p1 sait reste intact : sa main, le champ de bataille.
    expect(d.players.p1?.hand).toEqual(s.players.p1?.hand);
    expect(d.battlefield).toEqual(s.battlefield);
    // Aucune dépendance aux vraies cartes cachées : les changer ne change rien au tirage.
    const other = position();
    const hand = other.players.p2?.hand ?? [];
    const lib = other.players.p2?.library ?? [];
    [hand[0], lib[1]] = [lib[1] as string, hand[0] as string];
    for (const id of hand) (other.objects[id] as { zone: string }).zone = "hand";
    for (const id of lib) (other.objects[id] as { zone: string }).zone = "library";
    const d2 = determinize(other, "p1", mulberry32(9));
    expect(names(d2, hidden(d2))).toEqual(names(d, hidden(d)));
  });
});

describe("ISMCTS : faces cachées (PLAN-C, lot C6)", () => {
  it("la déterminisation tire aussi les permanents face cachée et les cartes exilées face cachée de l'adversaire", () => {
    const s = cloneState(scenario({ p1: { battlefield: ["Forest"] }, p2: { battlefield: ["Bear Cub"], graveyard: ["Opt"] } }));
    const bear = s.battlefield.find((id) => s.objects[id]?.controller === "p2") as string;
    const hiddenDef = card("Doomsday Excruciator");
    registerDef(s, hiddenDef);
    // Un permanent face cachée de p2, et une carte exilée face cachée qu'il est seul à pouvoir regarder.
    const o = s.objects[bear];
    if (o) o.faceDown = { card: hiddenDef.id, ward: false, upCosts: [] };
    const exObj = createObject(s, hiddenDef.id, "p2", "exile");
    exObj.exiledFaceDown = ["p2"];
    const ex = exObj.id;
    for (let seed = 1; seed <= 20; seed++) {
      const d = determinize(s, "p1", mulberry32(seed));
      expect(d.objects[bear]?.faceDown?.card).not.toBe(hiddenDef.id);
      expect(d.objects[ex]?.defId).not.toBe(hiddenDef.id);
    }
  });
});
