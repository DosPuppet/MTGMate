/**
 * Duskmourn: House of Horror : Sinistre, Survie, Délire, manifestation effroyable par un autre joueur (lot A) ;
 * Imminence, Enduring, coûts additionnels choisis automatiquement, portes (lot B) ; modes sous délire, Valgavoth, Aura de
 * joueur, choix par l'adversaire, ninjutsu, déclencheur retardé par emblème, coût alternatif global, Nowhere to Run,
 * Marvin, Found Footage (lots C et D).
 */
import { describe, expect, it } from "vitest";
import { legalActions } from "../src/legal";
import { chars } from "../src/state";
import type { GameState } from "../src/types";
import { projectView } from "../src/view";
import { act, advanceUntil, customCard, idOf, idsOf, passAccepting, passUntil, scenario } from "./helpers";

type S = GameState;
const lands = (name: string, n: number) => Array(n).fill(name) as string[];
const settle = (s: S) => passAccepting(s, (x) => x.stack.length === 0 && x.pending?.kind === "priority");
const ROOM = "Grand Entryway // Elegant Rotunda";

describe("Duskmourn", () => {
  it("Sinistre : un enchantement qui arrive, puis une Salle entièrement déverrouillée", () => {
    let s = scenario({ p1: { battlefield: ["Balemurk Leech", ...lands("Plains", 5)], hand: [ROOM] } });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", ROOM), face: 0 });
    s = settle(s);
    // La Salle arrive (enchantement), puis la porte crée une Lueur (créature-enchantement) : deux déclenchements.
    expect(idsOf(s, "p1", "battlefield", "Glimmer")).toHaveLength(1);
    expect(s.players.p2?.life).toBe(18);
    const room = idOf(s, "p1", "battlefield", ROOM);
    const unlock = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === room);
    s = act(s, "p1", { type: "activate", source: room, ability: unlock?.type === "activate" ? unlock.ability : -1 });
    s = settle(s);
    // Salle entièrement déverrouillée : un troisième déclenchement.
    expect(s.players.p2?.life).toBe(17);
  });

  it("Survie : au début de la seconde phase principale, seulement si la créature est engagée", () => {
    let s = scenario({ p1: { battlefield: [{ name: "Cautious Survivor", tapped: true }, "Cautious Survivor"] } });
    s = advanceUntil(s, (x) => x.turn.step === "main2" && x.stack.length === 0 && x.pending?.kind === "priority");
    expect(s.players.p1?.life).toBe(22);
  });

  it("Délire : quatre types de cartes dans votre cimetière", () => {
    const three = scenario({ p1: { battlefield: ["Spineseeker Centipede"], graveyard: ["Opt", "Forest", "Llanowar Elves"] } });
    expect(chars(three, idOf(three, "p1", "battlefield", "Spineseeker Centipede")).power).toBe(2);
    const four = scenario({
      p1: { battlefield: ["Spineseeker Centipede"], graveyard: ["Opt", "Forest", "Llanowar Elves", "Pyroclasm"] },
      // Le cimetière adverse ne compte pas.
      p2: { graveyard: ["Pyroclasm"] },
    });
    const c = chars(four, idOf(four, "p1", "battlefield", "Spineseeker Centipede"));
    expect([c.power, c.toughness]).toEqual([3, 3]);
    expect(c.keywords).toContain("vigilance");
  });

  it("manifestation effroyable par le contrôleur de la créature détruite (Unwanted Remake)", () => {
    let s = scenario({
      p1: { battlefield: ["Plains"], hand: ["Unwanted Remake"] },
      p2: { battlefield: ["Shivan Dragon"], library: ["Forest", "Island", "Swamp"] },
    });
    s = act(s, "p1", {
      type: "cast",
      card: idOf(s, "p1", "hand", "Unwanted Remake"),
      targets: { t: [idOf(s, "p2", "battlefield", "Shivan Dragon")] },
    });
    s = settle(s);
    const faceDown = s.battlefield.filter((id) => s.objects[id]?.faceDown);
    expect(faceDown).toHaveLength(1);
    expect(s.objects[faceDown[0] as string]?.controller).toBe("p2");
    // Le Dragon et la carte non manifestée vont au cimetière de p2.
    expect(s.players.p2?.graveyard).toHaveLength(2);
  });

  it("Imminence : lancé pour son coût d'imminence, il arrive avec des marqueurs de temps et n'est pas une créature", () => {
    let s = scenario({ p1: { battlefield: lands("Plains", 4), hand: ["Overlord of the Mistmoors"] } });
    const card = idOf(s, "p1", "hand", "Overlord of the Mistmoors");
    const opt = legalActions(s, "p1").find((a) => a.type === "cast" && a.card === card);
    expect(opt?.type === "cast" && opt.altLabel).toBe("Imminence 4 — {2}{W}{W}");
    s = act(s, "p1", { type: "cast", card, alternative: true });
    s = settle(s);
    const overlord = idOf(s, "p1", "battlefield", "Overlord of the Mistmoors");
    expect(s.objects[overlord]?.counters.time).toBe(4);
    expect(chars(s, overlord).types).toEqual(["Enchantment"]);
    expect(idsOf(s, "p1", "battlefield", "Insect")).toHaveLength(2);
    // Étape de fin : un marqueur de temps est retiré.
    s = advanceUntil(s, (x) => x.turn.step === "cleanup" || x.turn.active === "p2");
    expect(s.objects[overlord]?.counters.time).toBe(3);
  });

  it("Enduring : elle meurt et revient comme enchantement non-créature", () => {
    let s = scenario({ p1: { battlefield: ["Enduring Innocence", ...lands("Mountain", 2)], hand: ["Pyroclasm"] } });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Pyroclasm") });
    s = settle(s);
    const back = idOf(s, "p1", "battlefield", "Enduring Innocence");
    expect(chars(s, back).types).toEqual(["Enchantment"]);
    expect(chars(s, back).subtypes).toEqual([]);
  });

  it("coût additionnel choisi automatiquement : la créature exilée est liée à Fear of Abduction", () => {
    let s = scenario({
      p1: { battlefield: ["Llanowar Elves", ...lands("Plains", 6)], hand: ["Fear of Abduction"] },
      p2: { battlefield: ["Shivan Dragon"] },
    });
    const elves = idOf(s, "p1", "battlefield", "Llanowar Elves");
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Fear of Abduction") });
    expect(s.objects[elves]).toBeUndefined(); // exilée pour payer le coût
    s = settle(s);
    const fear = idOf(s, "p1", "battlefield", "Fear of Abduction");
    const linked = (s.objects[fear]?.linked ?? []).map((id) => s.defs[s.objects[id]?.defId ?? ""]?.name);
    expect(linked.sort()).toEqual(["Llanowar Elves", "Shivan Dragon"]);
  });

  it("Keys to the House : verrouiller ou déverrouiller une porte au choix", () => {
    let s = scenario({ p1: { battlefield: ["Keys to the House", ...lands("Plains", 6)], hand: [ROOM] } });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", ROOM), face: 0 });
    s = settle(s);
    const room = idOf(s, "p1", "battlefield", ROOM);
    const keys = idOf(s, "p1", "battlefield", "Keys to the House");
    const toggle = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === keys && a.label?.includes("porte"));
    s = act(s, "p1", {
      type: "activate",
      source: keys,
      ability: toggle?.type === "activate" ? toggle.ability : -1,
      targets: { r: [room] },
    });
    s = passAccepting(s, (x) => x.pending?.kind === "choice" || x.stack.length === 0);
    // Deux portes possibles : verrouiller Grand Entryway ou déverrouiller Elegant Rotunda.
    expect(s.pending?.kind === "choice" && s.pending.request.type === "pick" && s.pending.request.options).toHaveLength(2);
    s = act(s, "p1", { type: "choose", values: [`${room}#0`] });
    s = settle(s);
    expect(s.objects[room]?.unlocked).toEqual([]);
  });

  it("Let's Play a Game : un mode, ou plusieurs avec le délire", () => {
    const modes = (s: S) => {
      const card = idOf(s, "p1", "hand", "Let's Play a Game");
      const opt = legalActions(s, "p1").find((a) => a.type === "cast" && a.card === card);
      return opt?.type === "cast" ? opt.modes.length : 0;
    };
    const hand = { battlefield: lands("Swamp", 4), hand: ["Let's Play a Game"] };
    expect(modes(scenario({ p1: hand }))).toBe(3);
    expect(modes(scenario({ p1: { ...hand, graveyard: ["Opt", "Forest", "Llanowar Elves", "Pyroclasm"] } }))).toBe(7);
  });

  it("Valgavoth : la créature adverse qui meurt est exilée et se lance pendant votre tour contre des PV", () => {
    let s = scenario({
      p1: { battlefield: ["Valgavoth, Terror Eater", ...lands("Mountain", 2)], hand: ["Pyroclasm"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Pyroclasm") });
    s = settle(s);
    const cub = s.exile.find((id) => s.defs[s.objects[id]?.defId ?? ""]?.name === "Bear Cub") as string;
    expect(cub).toBeDefined();
    expect(s.players.p2?.graveyard.some((id) => s.objects[id]?.defId === s.objects[cub]?.defId)).toBe(false);
    s = act(s, "p1", { type: "cast", card: cub });
    s = settle(s);
    expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
    expect(s.players.p1?.life).toBe(18);
  });

  it("Grievous Wound : le joueur enchanté ne gagne plus de PV et perd la moitié de ses PV quand il est blessé", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Swamp", 5), ...lands("Mountain", 2)], hand: ["Grievous Wound", "Lightning Strike"] },
    });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Grievous Wound"), targets: { enchant: ["p2"] } });
    s = settle(s);
    expect(s.objects[idOf(s, "p1", "battlefield", "Grievous Wound")]?.attachedTo).toBe("p2");
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Lightning Strike"), targets: { t: ["p2"] } });
    s = settle(s);
    // 20 − 3 = 17, puis la moitié arrondie à l'unité supérieure (9) : 8.
    expect(s.players.p2?.life).toBe(8);
  });

  it("Trial of Agony : l'adversaire choisit la créature qui subit 5 blessures ; l'autre ne peut pas bloquer", () => {
    let s = scenario({
      p1: { battlefield: ["Mountain"], hand: ["Trial of Agony"] },
      p2: { battlefield: ["Bear Cub", "Llanowar Elves"] },
    });
    const cub = idOf(s, "p2", "battlefield", "Bear Cub");
    const elves = idOf(s, "p2", "battlefield", "Llanowar Elves");
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Trial of Agony"), targets: { t: [cub, elves] } });
    s = passAccepting(s, (x) => x.pending?.kind === "choice" && x.pending.player === "p2");
    s = act(s, "p2", { type: "choose", values: [elves] });
    s = settle(s);
    expect(s.objects[elves]).toBeUndefined();
    expect(chars(s, cub).keywords).toContain("cantBlock");
  });

  it("Kaito : ninjutsu avec un attaquant non bloqué ; il est une créature pendant votre tour", () => {
    let s = scenario({
      p1: { battlefield: ["Llanowar Elves", "Island", "Swamp", "Swamp"], hand: ["Kaito, Bane of Nightmares"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    s = passUntil(s, (x) => x.pending?.kind === "declareAttackers");
    const elves = idOf(s, "p1", "battlefield", "Llanowar Elves");
    s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: elves, defender: "p2" }] });
    s = passUntil(s, (x) => x.pending?.kind === "declareBlockers");
    s = act(s, "p2", { type: "declareBlockers", blocks: [] });
    const kaito = idOf(s, "p1", "hand", "Kaito, Bane of Nightmares");
    const ninjutsu = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === kaito);
    expect(ninjutsu).toBeDefined();
    s = act(s, "p1", { type: "activate", source: kaito, ability: ninjutsu?.type === "activate" ? ninjutsu.ability : -1 });
    expect(idsOf(s, "p1", "hand", "Llanowar Elves")).toHaveLength(1);
    s = passBoth2(s);
    const k = idOf(s, "p1", "battlefield", "Kaito, Bane of Nightmares");
    expect(s.combat?.attackers.some((a) => a.id === k)).toBe(true);
    expect(chars(s, k)).toMatchObject({ power: 3, toughness: 4 });
    expect(chars(s, k).types).toEqual(expect.arrayContaining(["Planeswalker", "Creature"]));
  });

  it("Turn Inside Out : quand la créature meurt ce tour-ci, vous manifestez l'effroi", () => {
    let s = scenario({
      p1: {
        battlefield: ["Llanowar Elves", ...lands("Mountain", 3)],
        hand: ["Turn Inside Out", "Pyroclasm"],
        library: lands("Forest", 4),
      },
    });
    const elves = idOf(s, "p1", "battlefield", "Llanowar Elves");
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Turn Inside Out"), targets: { t: [elves] } });
    s = settle(s);
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Pyroclasm") });
    s = settle(s);
    expect(s.battlefield.filter((id) => s.objects[id]?.faceDown && s.objects[id]?.controller === "p1")).toHaveLength(1);
  });

  it("Leyline of Mutation : {W}{U}{B}{R}{G} au lieu du coût de mana", () => {
    let s = scenario({
      p1: { battlefield: ["Leyline of Mutation", "Plains", "Island", "Swamp", "Mountain", "Forest"], hand: ["Shivan Dragon"] },
    });
    const dragon = idOf(s, "p1", "hand", "Shivan Dragon");
    const opt = legalActions(s, "p1").find((a) => a.type === "cast" && a.card === dragon);
    expect(opt?.type === "cast" && opt.altLabel).toBe("Leyline of Mutation — {W}{U}{B}{R}{G}");
    s = act(s, "p1", { type: "cast", card: dragon, alternative: true });
    s = settle(s);
    expect(idsOf(s, "p1", "battlefield", "Shivan Dragon")).toHaveLength(1);
  });

  it("Nowhere to Run : défense talismanique ignorée, garde qui ne se déclenche pas", () => {
    const hexproof = customCard({ name: "Test Hexproof", power: 2, toughness: 2, keywords: ["hexproof"] });
    let s = scenario({
      p1: { battlefield: ["Nowhere to Run", ...lands("Mountain", 4)], hand: ["Lightning Strike", "Lightning Strike"] },
      p2: { battlefield: [hexproof, "Lionheart Glimmer"] },
    });
    const [a, b] = idsOf(s, "p1", "hand", "Lightning Strike") as [string, string];
    const hex = idOf(s, "p2", "battlefield", "Test Hexproof");
    const glimmer = idOf(s, "p2", "battlefield", "Lionheart Glimmer");
    s = act(s, "p1", { type: "cast", card: a, targets: { t: [hex] } });
    s = settle(s);
    expect(s.objects[hex]).toBeUndefined();
    s = act(s, "p1", { type: "cast", card: b, targets: { t: [glimmer] } });
    // La garde ne se déclenche pas : rien d'autre sur la pile que le sort.
    expect(s.stack).toHaveLength(1);
    s = settle(s);
    expect(s.objects[glimmer]?.damage).toBe(3);
  });

  it("Marvin : il a les capacités activées de vos autres créatures", () => {
    const s = scenario({ p1: { battlefield: ["Marvin, Murderous Mimic", "Ragged Playmate"] } });
    const labels = chars(s, idOf(s, "p1", "battlefield", "Marvin, Murderous Mimic")).abilities.map((ab) =>
      "label" in ab ? ab.label : undefined,
    );
    expect(labels).toContain("Une créature de force 2 ou moins ne peut pas être bloquée");
  });

  it("Found Footage : vous voyez les créatures face cachée de vos adversaires", () => {
    let s = scenario({
      p1: { battlefield: ["Found Footage", "Plains"], hand: ["Unwanted Remake"] },
      p2: { battlefield: ["Bear Cub"], library: ["Llanowar Elves", "Forest"] },
    });
    s = act(s, "p1", {
      type: "cast",
      card: idOf(s, "p1", "hand", "Unwanted Remake"),
      targets: { t: [idOf(s, "p2", "battlefield", "Bear Cub")] },
    });
    s = settle(s);
    const hidden = s.battlefield.find((id) => s.objects[id]?.faceDown) as string;
    expect(projectView(s, "p1").battlefield.find((o) => o.id === hidden)?.faceDownCard).toBeDefined();
  });
});

/** Priorité passée jusqu'à ce que la pile soit vide. */
const passBoth2 = (s: S) => passAccepting(s, (x) => x.stack.length === 0 && x.pending?.kind === "priority");
