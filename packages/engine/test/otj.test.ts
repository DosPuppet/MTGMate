/**
 * Outlaws of Thunder Junction, lot A : plot (702.170), spree (702.172), crimes (700.13), marqueurs de capacité (122.1b),
 * terrains rapides.
 */
import { describe, expect, it } from "vitest";
import { legalActions } from "../src/legal";
import { chars } from "../src/state";
import { declareAttackers } from "../src/turn";
import type { GameState } from "../src/types";
import { act, advanceUntil, idOf, idsOf, passAccepting, passBoth, scenario } from "./helpers";

type S = GameState;
const lands = (name: string, n: number) => Array(n).fill(name) as string[];
const abilityIndex = (s: S, id: string, label: string) =>
  (s.defs[s.objects[id]?.defId ?? ""]?.abilities ?? []).findIndex((a) => a.kind === "activated" && a.label?.startsWith(label));

describe("Outlaws of Thunder Junction", () => {
  it("plot : action spéciale depuis la main, puis lancement gratuit à un tour ultérieur, au moment d'un rituel", () => {
    let s = scenario({ p1: { battlefield: lands("Island", 4), hand: ["Djinn of Fool's Fall"] } });
    const djinn = idOf(s, "p1", "hand", "Djinn of Fool's Fall");
    s = act(s, "p1", { type: "activate", source: djinn, ability: abilityIndex(s, djinn, "Complot") });
    // Action spéciale : pas de pile, la carte est exilée et complotée.
    expect(s.stack).toHaveLength(0);
    const plotted = s.exile.find((id) => s.objects[id]?.plottedTurn !== undefined) as string;
    expect(plotted).toBeDefined();
    // Pas ce tour-ci.
    expect(legalActions(s, "p1").some((a) => a.type === "cast" && a.card === plotted)).toBe(false);
    s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.turn.number > 3);
    const cast = legalActions(s, "p1").find((a) => a.type === "cast" && a.card === plotted);
    expect(cast?.type === "cast" && cast.free).toBe(true);
    s = act(s, "p1", { type: "cast", card: plotted });
    s = passBoth(s);
    expect(idsOf(s, "p1", "battlefield", "Djinn of Fool's Fall")).toHaveLength(1);
    expect(s.players.p1?.manaPool.U ?? 0).toBe(0);
  });

  it("spree : les coûts des modes choisis s'ajoutent ; un mode trop cher n'est pas proposé", () => {
    const s = scenario({ p1: { battlefield: lands("Forest", 3), hand: ["Trash the Town"] }, p2: { battlefield: ["Bear Cub"] } });
    const opt = legalActions(s, "p1").find((a) => a.type === "cast");
    const labels = opt?.type === "cast" ? opt.modes.map((m) => m.label) : [];
    // {G} + {2} + {1} = 4 mana pour deux modes, 5 pour les trois : seulement 3 Forêts.
    expect(labels).toContain("Deux marqueurs +1/+1");
    expect(labels).toContain("Piétinement + Blessures de combat : piochez deux cartes");
    expect(labels).not.toContain("Deux marqueurs +1/+1 + Piétinement + Blessures de combat : piochez deux cartes");
    const bear = idOf(s, "p2", "battlefield", "Bear Cub");
    const mode = opt?.type === "cast" ? opt.modes.find((m) => m.label === "Deux marqueurs +1/+1") : undefined;
    let t = act(s, "p1", {
      type: "cast",
      card: idOf(s, "p1", "hand", "Trash the Town"),
      mode: mode?.index,
      targets: { a: [bear] },
    });
    expect(t.battlefield.filter((id) => t.objects[id]?.tapped)).toHaveLength(3);
    t = passBoth(t);
    expect(t.objects[bear]?.counters["+1/+1"]).toBe(2);
  });

  it("crime : cibler un adversaire ou ce qu'il contrôle déclenche « chaque fois que vous commettez un crime »", () => {
    let s = scenario({
      p1: { battlefield: ["Blood Hustler", ...lands("Mountain", 2)], hand: ["Scorching Shot"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    const hustler = idOf(s, "p1", "battlefield", "Blood Hustler");
    s = act(s, "p1", {
      type: "cast",
      card: idOf(s, "p1", "hand", "Scorching Shot"),
      targets: { t: [idOf(s, "p2", "battlefield", "Bear Cub")] },
    });
    expect(s.players.p1?.turnStats.crimes).toBe(1);
    s = passAccepting(s, (x) => x.stack.length === 0 && x.pending?.kind === "priority");
    expect(s.objects[hustler]?.counters["+1/+1"]).toBe(1);
    // Cibler sa propre créature n'est pas un crime.
    let t = scenario({ p1: { battlefield: ["Omenport Vigilante", ...lands("Mountain", 2)], hand: ["Scorching Shot"] } });
    const vig = idOf(t, "p1", "battlefield", "Omenport Vigilante");
    t = act(t, "p1", { type: "cast", card: idOf(t, "p1", "hand", "Scorching Shot"), targets: { t: [vig] } });
    expect(t.players.p1?.turnStats.crimes ?? 0).toBe(0);
    expect(chars(t, vig).keywords).not.toContain("doubleStrike");
  });

  it("marqueurs de capacité : un marqueur contact mortel donne le contact mortel (Vraska Joins Up)", () => {
    let s = scenario({
      p1: { battlefield: ["Bear Cub", ...lands("Swamp", 1), ...lands("Forest", 1)], hand: ["Vraska Joins Up"] },
    });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Vraska Joins Up") });
    s = passAccepting(s, (x) => x.stack.length === 0 && x.pending?.kind === "priority");
    expect(chars(s, idOf(s, "p1", "battlefield", "Bear Cub")).keywords).toContain("deathtouch");
  });

  it("terrains rapides : dégagés avec deux autres terrains ou moins, engagés au-delà", () => {
    let s = scenario({ p1: { battlefield: lands("Swamp", 2), hand: ["Blooming Marsh"] } });
    s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Blooming Marsh") });
    expect(s.objects[idOf(s, "p1", "battlefield", "Blooming Marsh")]?.tapped).toBe(false);
    let t = scenario({ p1: { battlefield: lands("Swamp", 3), hand: ["Blooming Marsh"] } });
    t = act(t, "p1", { type: "playLand", card: idOf(t, "p1", "hand", "Blooming Marsh") });
    expect(t.objects[idOf(t, "p1", "battlefield", "Blooming Marsh")]?.tapped).toBe(true);
  });

  it("« quand cette carte devient complotée » se déclenche depuis l'exil (Longhorn Sharpshooter)", () => {
    let s = scenario({ p1: { battlefield: lands("Mountain", 4), hand: ["Longhorn Sharpshooter"] } });
    const card = idOf(s, "p1", "hand", "Longhorn Sharpshooter");
    s = act(s, "p1", { type: "activate", source: card, ability: abilityIndex(s, card, "Complot") });
    s = passAccepting(s, (x) => x.stack.length === 0 && x.triggers.length === 0 && x.pending?.kind === "priority");
    expect(s.players.p2?.life).toBe(18);
  });

  it("Archangel of Tithes : attaquer coûte {1} par créature", () => {
    const s = scenario({
      p1: { battlefield: ["Bear Cub", "Serra Angel"] },
      p2: { battlefield: ["Archangel of Tithes"] },
      step: "declareAttackers",
    });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    expect(() => declareAttackers(s, "p1", [{ id: bear, defender: "p2" }])).toThrow();
    const t = scenario({
      p1: { battlefield: ["Bear Cub", "Plains"] },
      p2: { battlefield: ["Archangel of Tithes"] },
      step: "declareAttackers",
    });
    declareAttackers(t, "p1", [{ id: idOf(t, "p1", "battlefield", "Bear Cub"), defender: "p2" }]);
    expect(t.objects[idOf(t, "p1", "battlefield", "Plains")]?.tapped).toBe(true);
  });

  it("High Noon : un seul sort par joueur et par tour", () => {
    let s = scenario({
      p1: { battlefield: ["High Noon", ...lands("Mountain", 4)], hand: ["Scorching Shot", "Lightning Strike"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Lightning Strike"), targets: { t: ["p2"] } });
    s = passBoth(s);
    expect(legalActions(s, "p1").some((a) => a.type === "cast")).toBe(false);
  });

  it("Double Down : la copie d'un sort de créature hors-la-loi devient un jeton", () => {
    let s = scenario({ p1: { battlefield: ["Double Down", ...lands("Swamp", 3)], hand: ["Vault Plunderer"] } });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Vault Plunderer") });
    s = passAccepting(s, (x) => x.stack.length === 0 && x.triggers.length === 0 && x.pending?.kind === "priority");
    expect(idsOf(s, "p1", "battlefield", "Vault Plunderer")).toHaveLength(2);
    expect(s.battlefield.filter((id) => s.objects[id]?.isToken)).toHaveLength(1);
  });

  it("Terror of the Peaks : un sort adverse qui la cible coûte 3 PV de plus", () => {
    let s = scenario({
      p1: { battlefield: lands("Mountain", 2), hand: ["Lightning Strike"] },
      p2: { battlefield: ["Terror of the Peaks"] },
    });
    s = act(s, "p1", {
      type: "cast",
      card: idOf(s, "p1", "hand", "Lightning Strike"),
      targets: { t: [idOf(s, "p2", "battlefield", "Terror of the Peaks")] },
    });
    expect(s.players.p1?.life).toBe(17);
  });

  it("Step Between Worlds est exilé en se résolvant ; Magebane Lizard blesse le lanceur", () => {
    let s = scenario({ p1: { battlefield: lands("Island", 6), hand: ["Step Between Worlds"] } });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Step Between Worlds") });
    s = passAccepting(s, (x) => x.stack.length === 0 && x.pending?.kind === "priority");
    expect(s.exile.some((id) => s.defs[s.objects[id]?.defId ?? ""]?.name === "Step Between Worlds")).toBe(true);
    let t = scenario({
      p1: { battlefield: lands("Mountain", 2), hand: ["Lightning Strike"] },
      p2: { battlefield: ["Magebane Lizard"] },
    });
    t = act(t, "p1", { type: "cast", card: idOf(t, "p1", "hand", "Lightning Strike"), targets: { t: ["p2"] } });
    t = passAccepting(t, (x) => x.stack.length === 0 && x.triggers.length === 0 && x.pending?.kind === "priority");
    expect(t.players.p1?.life).toBe(19);
  });
});
