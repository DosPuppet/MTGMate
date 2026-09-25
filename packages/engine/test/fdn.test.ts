/**
 * Cartes de Foundations : vérifie les primitives ajoutées pour le set principal
 * (cibles dans le cimetière, cibles multiples, exil lié, variables de résolution, coûts…).
 */
import { describe, expect, it } from "vitest";
import { destroy } from "../src/actions";
import { legalActions } from "../src/legal";
import { counterCount } from "../src/state";
import { act, idOf, idsOf, passAccepting, passBoth, scenario } from "./helpers";

type S = ReturnType<typeof scenario>;
const cast = (s: S, p: string, name: string, extra: Record<string, unknown> = {}) =>
  act(s, p, { type: "cast", card: idOf(s, p, "hand", name), ...extra });
const choose = (s: S, values: (string | number)[]) => act(s, s.pending?.player ?? "p1", { type: "choose", values });
const lands = (name: string, n: number) => Array(n).fill(name) as string[];

describe("Foundations : cimetière", () => {
  it("Zombify renvoie la créature ciblée du cimetière sur le champ de bataille", () => {
    let s = scenario({ p1: { battlefield: lands("Swamp", 4), hand: ["Zombify"], graveyard: ["Pelakka Wurm", "Opt"] } });
    const cast0 = legalActions(s, "p1").find((a) => a.type === "cast");
    const wurm = idOf(s, "p1", "graveyard", "Pelakka Wurm");
    // Seule la carte de créature est une cible légale.
    expect(cast0?.type === "cast" && cast0.modes[0]?.targets[0]?.legal).toEqual([wurm]);
    s = cast(s, "p1", "Zombify", { targets: { t: [wurm] } });
    s = passAccepting(s, (x) => x.stack.length === 0 && idsOf(x, "p1", "battlefield", "Pelakka Wurm").length === 1);
    expect(idsOf(s, "p1", "battlefield", "Pelakka Wurm")).toHaveLength(1);
  });

  it("Macabre Waltz : jusqu'à deux cibles, puis défausse", () => {
    let s = scenario({
      p1: { battlefield: lands("Swamp", 2), hand: ["Macabre Waltz", "Forest"], graveyard: ["Pelakka Wurm", "Llanowar Elves"] },
    });
    const ids = [idOf(s, "p1", "graveyard", "Pelakka Wurm"), idOf(s, "p1", "graveyard", "Llanowar Elves")];
    s = cast(s, "p1", "Macabre Waltz", { targets: { t: ids } });
    s = passBoth(s);
    // Trois cartes en main (Forest + deux créatures) : il faut en défausser une.
    expect(s.pending?.kind === "choice" && s.pending.request.intent).toBe("discard");
    s = choose(s, [idOf(s, "p1", "hand", "Forest")]);
    expect(s.players.p1?.hand.map((id) => s.defs[s.objects[id]?.defId ?? ""]?.name).sort()).toEqual([
      "Llanowar Elves",
      "Pelakka Wurm",
    ]);
  });

  it("Reassembling Skeleton s'active depuis le cimetière", () => {
    let s = scenario({ p1: { battlefield: lands("Swamp", 2), graveyard: ["Reassembling Skeleton"] } });
    const opt = legalActions(s, "p1").find((a) => a.type === "activate");
    expect(opt).toBeDefined();
    if (opt?.type !== "activate") return;
    s = act(s, "p1", { type: "activate", source: opt.source, ability: opt.ability });
    s = passBoth(s);
    const skel = idOf(s, "p1", "battlefield", "Reassembling Skeleton");
    expect(s.objects[skel]?.tapped).toBe(true);
  });

  it("Scavenging Ooze : +1/+1 et 1 PV seulement pour une carte de créature", () => {
    let s = scenario({
      p1: { battlefield: ["Scavenging Ooze", ...lands("Forest", 2)] },
      p2: { graveyard: ["Pelakka Wurm", "Opt"] },
    });
    const ooze = idOf(s, "p1", "battlefield", "Scavenging Ooze");
    s = act(s, "p1", { type: "activate", source: ooze, ability: 0, targets: { t: [idOf(s, "p2", "graveyard", "Opt")] } });
    s = passBoth(s);
    expect(s.players.p1?.life).toBe(20);
    s = act(s, "p1", {
      type: "activate",
      source: ooze,
      ability: 0,
      targets: { t: [idOf(s, "p2", "graveyard", "Pelakka Wurm")] },
    });
    s = passBoth(s);
    expect(s.players.p1?.life).toBe(21);
    expect(counterCount(s.objects[ooze] as never, "+1/+1")).toBe(1);
    expect(s.players.p2?.graveyard).toHaveLength(0);
  });
});

describe("Foundations : cibles multiples et contraintes", () => {
  it("Run Away Together exige deux créatures de joueurs différents", () => {
    let s = scenario({
      p1: { battlefield: ["Llanowar Elves", "Prideful Parent", ...lands("Island", 2)], hand: ["Run Away Together"] },
      p2: { battlefield: ["Shivan Dragon"] },
    });
    const mine = idsOf(s, "p1", "battlefield", "Llanowar Elves").concat(idsOf(s, "p1", "battlefield", "Prideful Parent"));
    expect(() => cast(s, "p1", "Run Away Together", { targets: { t: mine } })).toThrow();
    const dragon = idOf(s, "p2", "battlefield", "Shivan Dragon");
    s = cast(s, "p1", "Run Away Together", { targets: { t: [mine[0] as string, dragon] } });
    s = passBoth(s);
    expect(s.players.p2?.hand).toHaveLength(1);
    expect(s.players.p1?.hand).toHaveLength(1);
  });

  it("Divine Resilience kické accepte plusieurs cibles, sinon une seule", () => {
    const base = () =>
      scenario({
        p1: { battlefield: ["Llanowar Elves", "Prideful Parent", ...lands("Plains", 4)], hand: ["Divine Resilience"] },
      });
    let s = base();
    const two = [idOf(s, "p1", "battlefield", "Llanowar Elves"), idOf(s, "p1", "battlefield", "Prideful Parent")];
    expect(() => cast(s, "p1", "Divine Resilience", { targets: { t: two } })).toThrow();
    s = cast(s, "p1", "Divine Resilience", { targets: { t: two }, kicked: true });
    s = passBoth(s);
    expect(s.effects.some((e) => e.addKeywords?.includes("indestructible") && e.affected.length === 2)).toBe(true);
  });
});

describe("Foundations : effets liés et variables", () => {
  it("Banishing Light : la carte revient quand l'enchantement part", () => {
    let s = scenario({
      p1: { battlefield: lands("Plains", 3), hand: ["Banishing Light"] },
      p2: { battlefield: ["Shivan Dragon"] },
    });
    s = cast(s, "p1", "Banishing Light");
    s = passAccepting(s, (x) => x.stack.length === 0 && x.exile.length === 1);
    expect(s.exile).toHaveLength(1);
    // Le départ de l'enchantement rend la créature (sous le contrôle de son propriétaire).
    const light = idOf(s, "p1", "battlefield", "Banishing Light");
    destroy(s, light);
    expect(s.exile).toHaveLength(0);
    expect(idsOf(s, "p2", "battlefield", "Shivan Dragon")).toHaveLength(1);
  });

  it("Goblin Negotiation : un Gobelin par blessure en excès", () => {
    let s = scenario({
      p1: { battlefield: lands("Mountain", 7), hand: ["Goblin Negotiation"] },
      p2: { battlefield: ["Llanowar Elves"] },
    });
    s = cast(s, "p1", "Goblin Negotiation", { x: 5, targets: { t: [idOf(s, "p2", "battlefield", "Llanowar Elves")] } });
    s = passBoth(s);
    expect(idsOf(s, "p1", "battlefield", "Goblin")).toHaveLength(4);
  });

  it("Exsanguinate : vous gagnez la vie perdue par tous les adversaires", () => {
    let s = scenario({ players: 3, p1: { battlefield: lands("Swamp", 5), hand: ["Exsanguinate"] } });
    s = cast(s, "p1", "Exsanguinate", { x: 3 });
    s = passAccepting(s, (x) => x.stack.length === 0);
    expect(s.players.p2?.life).toBe(17);
    expect(s.players.p3?.life).toBe(17);
    expect(s.players.p1?.life).toBe(26);
  });

  it("Hare Apparent compte les autres Hare Apparent", () => {
    let s = scenario({ p1: { battlefield: ["Hare Apparent", "Hare Apparent", ...lands("Plains", 2)], hand: ["Hare Apparent"] } });
    s = cast(s, "p1", "Hare Apparent");
    s = passAccepting(s, (x) => x.stack.length === 0 && idsOf(x, "p1", "battlefield", "Hare Apparent").length === 3);
    s = passAccepting(s, (x) => x.stack.length === 0);
    expect(idsOf(s, "p1", "battlefield", "Rabbit")).toHaveLength(2);
  });

  it("Authority of the Consuls : les créatures adverses arrivent engagées", () => {
    let s = scenario({
      active: "p2",
      p1: { battlefield: ["Authority of the Consuls"] },
      p2: { battlefield: ["Forest"], hand: ["Llanowar Elves"] },
    });
    s = cast(s, "p2", "Llanowar Elves");
    s = passAccepting(s, (x) => x.stack.length === 0 && idsOf(x, "p2", "battlefield", "Llanowar Elves").length === 1);
    expect(s.objects[idOf(s, "p2", "battlefield", "Llanowar Elves")]?.tapped).toBe(true);
    s = passAccepting(s, (x) => x.stack.length === 0);
    expect(s.players.p1?.life).toBe(21);
  });

  it("Sun-Blessed Healer ne réanime que s'il a été kické", () => {
    const setup = () =>
      scenario({ p1: { battlefield: lands("Plains", 4), hand: ["Sun-Blessed Healer"], graveyard: ["Llanowar Elves"] } });
    let s = cast(setup(), "p1", "Sun-Blessed Healer");
    s = passAccepting(s, (x) => x.stack.length === 0);
    expect(idsOf(s, "p1", "battlefield", "Llanowar Elves")).toHaveLength(0);
    s = cast(setup(), "p1", "Sun-Blessed Healer", { kicked: true });
    s = passAccepting(s, (x) => x.stack.length === 0 && idsOf(x, "p1", "battlefield", "Llanowar Elves").length === 1);
    expect(idsOf(s, "p1", "battlefield", "Llanowar Elves")).toHaveLength(1);
  });

  it("Pilfer : le lanceur choisit la carte non-terrain défaussée", () => {
    let s = scenario({
      p1: { battlefield: lands("Swamp", 2), hand: ["Pilfer"] },
      p2: { hand: ["Forest", "Opt", "Shivan Dragon"] },
    });
    s = cast(s, "p1", "Pilfer", { targets: { t: ["p2"] } });
    s = passBoth(s);
    expect(s.pending?.player).toBe("p1");
    const req = s.pending?.kind === "choice" ? s.pending.request : null;
    expect(req?.type === "pick" && req.options).toHaveLength(2);
    s = choose(s, [idOf(s, "p2", "hand", "Shivan Dragon")]);
    expect(idsOf(s, "p2", "graveyard", "Shivan Dragon")).toHaveLength(1);
  });

  it("Painful Quandary : l'adversaire choisit entre 5 PV et une défausse", () => {
    let s = scenario({
      active: "p2",
      p1: { battlefield: ["Painful Quandary"] },
      p2: { battlefield: ["Island"], hand: ["Opt", "Forest"] },
    });
    s = cast(s, "p2", "Opt");
    s = passAccepting(s, (x) => x.pending?.kind === "choice" && x.pending.request.intent === "punisher");
    expect(s.pending?.player).toBe("p2");
    s = choose(s, ["life"]);
    expect(s.players.p2?.life).toBe(15);
  });
});

describe("Foundations : coûts et mana", () => {
  it("Elvish Archdruid produit {G} pour chaque Elfe", () => {
    const s = scenario({ p1: { battlefield: ["Elvish Archdruid", "Llanowar Elves", "Llanowar Elves"] } });
    const archdruid = idOf(s, "p1", "battlefield", "Elvish Archdruid");
    const after = act(s, "p1", { type: "tapForMana", source: archdruid, ability: 0, color: "G" });
    expect(after.players.p1?.manaPool.G).toBe(3);
  });

  it("Hungry Ghoul sacrifie une autre créature pour son coût", () => {
    let s = scenario({ p1: { battlefield: ["Hungry Ghoul", "Llanowar Elves", "Swamp"] } });
    const ghoul = idOf(s, "p1", "battlefield", "Hungry Ghoul");
    const elf = idOf(s, "p1", "battlefield", "Llanowar Elves");
    s = act(s, "p1", { type: "activate", source: ghoul, ability: 0, sacrifice: [elf] });
    expect(idsOf(s, "p1", "graveyard", "Llanowar Elves")).toHaveLength(1);
    s = passBoth(s);
    expect(counterCount(s.objects[ghoul] as never, "+1/+1")).toBe(1);
  });

  it("High Fae Trickster donne le flash à vos sorts", () => {
    const s = scenario({
      active: "p2",
      step: "upkeep",
      p1: { battlefield: ["High Fae Trickster", ...lands("Forest", 4)], hand: ["Pelakka Wurm", "Llanowar Elves"] },
    });
    const p = passAccepting(s, (x) => x.pending?.player === "p1");
    expect(legalActions(p, "p1").some((a) => a.type === "cast")).toBe(true);
  });

  it("Mild-Mannered Librarian ne s'active qu'une fois", () => {
    let s = scenario({ p1: { battlefield: ["Mild-Mannered Librarian", ...lands("Forest", 8)] } });
    const lib = idOf(s, "p1", "battlefield", "Mild-Mannered Librarian");
    s = act(s, "p1", { type: "activate", source: lib, ability: 0 });
    s = passBoth(s);
    expect(s.defs[s.objects[lib]?.defId ?? ""]).toBeDefined();
    expect(legalActions(s, "p1").some((a) => a.type === "activate" && a.source === lib)).toBe(false);
  });
});
