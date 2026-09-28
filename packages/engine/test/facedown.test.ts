/**
 * Cartes face cachée (708) : déguisement, cape, manifestation effroyable ; informations cachées.
 */
import { type RawCard, toCardDef } from "@mtgx/cards";
import { describe, expect, it } from "vitest";
import { destroy } from "../src/actions";
import { fx, triggered, when } from "../src/dsl";
import { runEffect } from "../src/effects";
import { legalActions } from "../src/legal";
import { chars, FACE_DOWN_ID } from "../src/state";
import type { GameState } from "../src/types";
import { projectView } from "../src/view";
import { act, idOf, passBoth, scenario } from "./helpers";

const DISGUISED = toCardDef(
  {
    name: "Espion déguisé",
    number: "1",
    rarity: "common",
    manaCost: "{3}{W}",
    cmc: 4,
    typeLine: "Creature — Human Rogue",
    oracleText: "Flying\nDisguise {1}{W}\nWhen this creature is turned face up, you gain 3 life.",
    power: "3",
    toughness: "3",
    colors: ["W"],
    keywords: ["Flying", "Disguise"],
    image: "",
    artCrop: "",
    legalities: { standard: "legal" },
  } satisfies RawCard,
  { abilities: [triggered(when.turnedFaceUp, [fx.gainLife(3)], { label: "3 PV" })] },
  "TST",
);

const resolution = (_s: GameState, controller: string) => ({
  item: { id: "x", controller, sourceId: "none", sourceDefId: "none", targets: {} },
  controller,
  targets: {},
  vars: {},
  pc: 0,
});

describe("déguisement (702.168)", () => {
  it("lancée face cachée pour {3} : créature 2/2 sans nom avec la garde {2} ; retournée pour son coût de déguisement", () => {
    expect(DISGUISED.disguise).toBeDefined();
    let s = scenario({ p1: { battlefield: ["Plains", "Plains", "Plains", "Plains", "Plains"], hand: [DISGUISED] } });
    const card = idOf(s, "p1", "hand", DISGUISED.name);
    const faceDownOption = legalActions(s, "p1").find((a) => a.type === "cast" && a.card === card && a.faceDown);
    expect(faceDownOption).toBeDefined();
    s = act(s, "p1", { type: "cast", card, faceDown: true });
    expect(s.stack[0]?.sourceDefId).toBe(FACE_DOWN_ID);
    s = passBoth(s);
    const id = s.battlefield.find((x) => s.objects[x]?.defId === FACE_DOWN_ID) as string;
    expect(chars(s, id)).toMatchObject({ name: "", power: 2, toughness: 2, keywords: ["ward"] });
    // L'adversaire ne voit pas la carte ; son contrôleur, si.
    const opp = projectView(s, "p2");
    expect(JSON.stringify(opp)).not.toContain(DISGUISED.id);
    const mine = projectView(s, "p1").battlefield.find((o) => o.id === id);
    expect(mine?.faceDownCard?.name).toBe(DISGUISED.name);
    // Retourner face visible : action spéciale ({1}{W}), puis « quand elle est retournée face visible ».
    const up = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === id);
    expect(up?.type === "activate" && up.label).toBe("Retourner face visible");
    s = act(s, "p1", { type: "activate", source: id, ability: up?.type === "activate" ? up.ability : -1 });
    expect(chars(s, id).name).toBe(DISGUISED.name);
    expect(chars(s, id).power).toBe(3);
    s = passBoth(s);
    expect(s.players.p1?.life).toBe(23);
  });

  it("une carte face cachée qui quitte le champ de bataille est révélée", () => {
    let s = scenario({ p1: { battlefield: ["Plains", "Plains", "Plains"], hand: [DISGUISED] } });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", DISGUISED.name), faceDown: true });
    s = passBoth(s);
    const id = s.battlefield.find((x) => s.objects[x]?.defId === FACE_DOWN_ID) as string;
    destroy(s, id);
    expect(idOf(s, "p1", "graveyard", DISGUISED.name)).toBeDefined();
  });
});

describe("manifestation effroyable (701.62) et cape (701.58)", () => {
  it("regarde les deux cartes du dessus, en manifeste une, l'autre au cimetière ; une créature se retourne pour son coût", () => {
    const s = scenario({ p1: { battlefield: ["Forest", "Forest"], library: ["Bear Cub", "Forest", "Forest"] } });
    const r = resolution(s, "p1");
    const ask = runEffect(s, r as never, { op: "manifestDread" });
    expect(ask && "ask" in ask).toBe(true);
    const bear = s.players.p1?.library[0] as string;
    (r.vars as Record<string, unknown>)[`${r.pc}:dread0`] = [bear];
    runEffect(s, r as never, { op: "manifestDread" });
    const id = s.battlefield.find((x) => s.objects[x]?.defId === FACE_DOWN_ID) as string;
    expect(chars(s, id).keywords).toEqual([]); // pas de garde
    expect(s.players.p1?.graveyard).toHaveLength(1);
    const up = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === id);
    expect(up).toBeDefined(); // Bear Cub : {1}{G}
  });

  it("cape : face cachée avec la garde {2} ; un terrain ne peut pas être retourné", () => {
    const s = scenario({ p1: { library: ["Forest"], battlefield: lands(5) } });
    const r = resolution(s, "p1");
    const top = s.players.p1?.library[0] as string;
    runEffect(s, r as never, fx.putFaceDown({ kind: "stored", name: "x" }, true));
    (r.vars as Record<string, unknown>)["$ids:x"] = [top];
    runEffect(s, r as never, fx.putFaceDown({ kind: "stored", name: "x" }, true));
    const id = s.battlefield.find((x) => s.objects[x]?.defId === FACE_DOWN_ID) as string;
    expect(chars(s, id).keywords).toEqual(["ward"]);
    expect(legalActions(s, "p1").some((a) => a.type === "activate" && a.source === id)).toBe(false);
  });
});

function lands(n: number): string[] {
  return Array(n).fill("Forest");
}
