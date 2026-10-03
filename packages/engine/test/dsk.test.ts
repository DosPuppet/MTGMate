/**
 * Duskmourn: House of Horror : Sinistre, Survie, Délire, manifestation effroyable par un autre joueur (lot A) ;
 * Imminence, Enduring, coûts additionnels choisis automatiquement, portes (lot B) ; modes sous délire, Valgavoth, Aura de
 * joueur, choix par l'adversaire, ninjutsu, déclencheur retardé par emblème, coût alternatif global, Nowhere to Run,
 * Marvin, Found Footage (lots C et D).
 */
import { describe, expect, it } from "vitest";
import { bump } from "../src/layers";
import { legalActions } from "../src/legal";
import { chars } from "../src/state";
import type { GameState } from "../src/types";
import { projectView } from "../src/view";
import {
  act,
  advanceUntil,
  attack,
  canActivate,
  castable,
  castNowOf,
  customCard,
  idOf,
  idsOf,
  nameOf,
  namesIn,
  passAccepting,
  passUntil,
  picking,
  pickNamed,
  scenario,
  settle as settleAnswering,
  settleNoBlocks,
  throughCombat,
  untilCastNow,
} from "./helpers";

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

describe("Duskmourn : cartes du méta confrontées à leur texte Oracle (PLAN-C, lot C13)", () => {
  const manaColors = (s: S, source: string) =>
    legalActions(s, "p1").flatMap((a) => (a.type === "tapForMana" && a.source === source ? a.colors : []));

  it("Floodfarm Verge, Gloomlake Verge, Blazemire Verge, Hushwood Verge : la deuxième couleur avec l'un des deux types de base", () => {
    const verges: [string, string, string, [string, string]][] = [
      ["Floodfarm Verge", "W", "U", ["Plains", "Island"]],
      ["Gloomlake Verge", "U", "B", ["Island", "Swamp"]],
      ["Blazemire Verge", "B", "R", ["Swamp", "Mountain"]],
      ["Hushwood Verge", "G", "W", ["Forest", "Plains"]],
    ];
    for (const [name, always, second, types] of verges) {
      const alone = scenario({ p1: { battlefield: [name] } });
      const v = idOf(alone, "p1", "battlefield", name);
      expect(manaColors(alone, v), name).toEqual([always]);
      // La capacité conditionnelle ne s'active pas sans le bon type de terrain.
      expect(() => act(alone, "p1", { type: "tapForMana", source: v, ability: 1 }), name).toThrow();
      for (const basic of types) {
        let s = scenario({ p1: { battlefield: [name, basic] } });
        const id = idOf(s, "p1", "battlefield", name);
        expect(manaColors(s, id), `${name} + ${basic}`).toEqual([always, second]);
        s = act(s, "p1", { type: "tapForMana", source: id, ability: 1 });
        expect(s.players.p1?.manaPool[second as "W"], `${name} + ${basic}`).toBe(1);
      }
    }
  });

  it("Unholy Annex // Ritual Chamber : pioche et perte de 2 PV sans Démon ; la porte crée un Démon 6/6 volant, puis drain de 2", () => {
    let s = scenario({ p1: { battlefield: lands("Swamp", 8), hand: ["Unholy Annex // Ritual Chamber"] } });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Unholy Annex // Ritual Chamber"), face: 0 });
    s = settle(s);
    // Étape de fin sans Démon : une carte piochée, 2 PV perdus.
    let t = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(t.players.p1?.hand).toHaveLength(1);
    expect(t.players.p1?.life).toBe(18);
    expect(t.players.p2?.life).toBe(20);
    // Ritual Chamber déverrouillée : un jeton Démon 6/6 volant ; l'étape de fin draine alors 2 PV.
    const room = idOf(s, "p1", "battlefield", "Unholy Annex // Ritual Chamber");
    const unlock = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === room);
    s = act(s, "p1", { type: "activate", source: room, ability: unlock?.type === "activate" ? unlock.ability : -1 });
    s = settle(s);
    const demon = idOf(s, "p1", "battlefield", "Demon");
    expect(chars(s, demon)).toMatchObject({ power: 6, toughness: 6 });
    expect(chars(s, demon).keywords).toContain("flying");
    expect(chars(s, demon).colors).toEqual(["B"]);
    t = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(t.players.p1?.hand).toHaveLength(1);
    expect(t.players.p1?.life).toBe(22);
    expect(t.players.p2?.life).toBe(18);
  });

  it("Ghost Vacuum : exile une carte d'un cimetière ; plus tard, les créatures exilées reviennent en Esprits 1/1 avec un marqueur vol", () => {
    let s = scenario({
      p1: { battlefield: ["Ghost Vacuum", ...lands("Plains", 6)] },
      p2: { graveyard: ["Shivan Dragon", "Opt"] },
    });
    const vacuum = idOf(s, "p1", "battlefield", "Ghost Vacuum");
    s = act(s, "p1", {
      type: "activate",
      source: vacuum,
      ability: 0,
      targets: { t: [idOf(s, "p2", "graveyard", "Shivan Dragon")] },
    });
    s = settle(s);
    expect(s.exile.some((id) => nameOf(s, id) === "Shivan Dragon")).toBe(true);
    expect(s.players.p2?.graveyard).toHaveLength(1);
    // Au tour suivant (artefact dégagé) : {6}, {T}, sacrifice, en rituel.
    s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.turn.number > 3);
    s = act(s, "p1", { type: "activate", source: vacuum, ability: 1 });
    s = settle(s);
    expect(s.objects[vacuum]).toBeUndefined();
    const dragon = idOf(s, "p1", "battlefield", "Shivan Dragon");
    const c = chars(s, dragon);
    expect([c.power, c.toughness]).toEqual([1, 1]);
    expect(c.subtypes).toEqual(expect.arrayContaining(["Dragon", "Spirit"]));
    expect(c.keywords).toContain("flying");
    expect(s.objects[dragon]?.counters.flying).toBe(1);
    expect(s.objects[dragon]?.owner).toBe("p2");
  });

  it("Sheltered by Ghosts : exile un permanent adverse jusqu'à son départ ; +1/+0, lien de vie et garde {2}", () => {
    let s = scenario({
      p1: {
        battlefield: ["Bear Cub", ...lands("Plains", 2), ...lands("Mountain", 2)],
        hand: ["Sheltered by Ghosts", "Pyroclasm"],
      },
      p2: { battlefield: ["Shivan Dragon"] },
    });
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    const dragon = idOf(s, "p2", "battlefield", "Shivan Dragon");
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Sheltered by Ghosts"), targets: { enchant: [cub] } });
    s = settleAnswering(s, picking([dragon]));
    expect(s.objects[dragon]).toBeUndefined();
    expect(s.exile.some((id) => nameOf(s, id) === "Shivan Dragon")).toBe(true);
    const c = chars(s, cub);
    expect([c.power, c.toughness]).toEqual([3, 2]);
    expect(c.keywords).toEqual(expect.arrayContaining(["lifelink", "ward"]));
    // La créature enchantée meurt, l'Aura part : le Dragon revient.
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Pyroclasm") });
    s = settle(s);
    expect(idsOf(s, "p1", "battlefield", "Sheltered by Ghosts")).toHaveLength(0);
    expect(idsOf(s, "p2", "battlefield", "Shivan Dragon")).toHaveLength(1);
  });

  it("Floodpits Drowner : engage une créature adverse avec un marqueur d'étourdissement ; puis les mélange dans les bibliothèques", () => {
    let s = scenario({
      p1: { battlefield: lands("Island", 2), hand: ["Floodpits Drowner"] },
      p2: { battlefield: ["Shivan Dragon"] },
    });
    const dragon = idOf(s, "p2", "battlefield", "Shivan Dragon");
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Floodpits Drowner") });
    s = settleAnswering(s, picking([dragon]));
    expect(s.objects[dragon]?.tapped).toBe(true);
    expect(s.objects[dragon]?.counters.stun).toBe(1);
    expect(chars(s, idOf(s, "p1", "battlefield", "Floodpits Drowner")).keywords).toEqual(
      expect.arrayContaining(["flash", "vigilance"]),
    );
    // {1}{U}, {T} : elle et la créature étourdie retournent dans la bibliothèque de leur propriétaire.
    let t = scenario({
      p1: { battlefield: ["Floodpits Drowner", ...lands("Island", 2)], library: lands("Island", 3) },
      p2: {
        battlefield: [{ name: "Shivan Dragon", tapped: true, counters: { stun: 1 } }, "Bear Cub"],
        library: lands("Forest", 3),
      },
    });
    const drowner = idOf(t, "p1", "battlefield", "Floodpits Drowner");
    const d2 = idOf(t, "p2", "battlefield", "Shivan Dragon");
    const ab = legalActions(t, "p1").find((a) => a.type === "activate" && a.source === drowner);
    const index = ab?.type === "activate" ? ab.ability : -1;
    // Une créature sans marqueur d'étourdissement n'est pas une cible.
    expect(() =>
      act(t, "p1", {
        type: "activate",
        source: drowner,
        ability: index,
        targets: { t: [idOf(t, "p2", "battlefield", "Bear Cub")] },
      }),
    ).toThrow();
    t = act(t, "p1", { type: "activate", source: drowner, ability: index, targets: { t: [d2] } });
    t = settle(t);
    expect(idsOf(t, "p1", "battlefield", "Floodpits Drowner")).toHaveLength(0);
    expect(idsOf(t, "p2", "battlefield", "Shivan Dragon")).toHaveLength(0);
    expect(t.players.p1?.library.map((id) => nameOf(t, id))).toContain("Floodpits Drowner");
    expect(t.players.p2?.library.map((id) => nameOf(t, id))).toContain("Shivan Dragon");
  });

  it("Enduring Curiosity : une créature à vous blesse un joueur, piochez ; morte, elle revient en enchantement", () => {
    let s = scenario({
      p1: {
        battlefield: ["Enduring Curiosity", "Bear Cub", ...lands("Mountain", 2)],
        hand: ["Lightning Strike"],
        library: lands("Island", 3),
      },
    });
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    const curiosity = idOf(s, "p1", "battlefield", "Enduring Curiosity");
    s = attack(s, [cub, curiosity]);
    s = throughCombat(s);
    // Deux créatures blessent le joueur : deux cartes.
    expect(s.players.p2?.life).toBe(14);
    expect(s.players.p1?.hand).toHaveLength(3);
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Lightning Strike"), targets: { t: [curiosity] } });
    s = settle(s);
    const back = idOf(s, "p1", "battlefield", "Enduring Curiosity");
    expect(chars(s, back).types).toEqual(["Enchantment"]);
  });

  it("Chainsaw : 3 blessures en arrivant ; un marqueur de régime par lot de morts ; +X/+0 à la créature équipée", () => {
    let s = scenario({
      p1: { battlefield: ["Llanowar Elves", ...lands("Mountain", 5)], hand: ["Chainsaw"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    const cub = idOf(s, "p2", "battlefield", "Bear Cub");
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Chainsaw") });
    s = settleAnswering(s, picking([cub]));
    expect(s.objects[cub]).toBeUndefined();
    const saw = idOf(s, "p1", "battlefield", "Chainsaw");
    expect(s.objects[saw]?.counters.rev).toBe(1);
    const elves = idOf(s, "p1", "battlefield", "Llanowar Elves");
    const equip = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === saw);
    s = act(s, "p1", {
      type: "activate",
      source: saw,
      ability: equip?.type === "activate" ? equip.ability : -1,
      targets: { t: [elves] },
    });
    s = settle(s);
    expect(chars(s, elves)).toMatchObject({ power: 2, toughness: 1 });
    // Plusieurs créatures meurent ensemble : un seul marqueur.
    let t = scenario({
      p1: { battlefield: ["Chainsaw", ...lands("Mountain", 2)], hand: ["Pyroclasm"] },
      p2: { battlefield: ["Bear Cub", "Llanowar Elves"] },
    });
    t = act(t, "p1", { type: "cast", card: idOf(t, "p1", "hand", "Pyroclasm") });
    t = settle(t);
    expect(t.objects[idOf(t, "p1", "battlefield", "Chainsaw")]?.counters.rev).toBe(1);
  });

  it("Get Out : contrecarre un sort de créature, ou renvoie une ou deux de vos créatures ou enchantements", () => {
    let s = scenario({
      active: "p2",
      p1: { battlefield: lands("Island", 2), hand: ["Get Out"] },
      p2: { battlefield: lands("Forest", 2), hand: ["Bear Cub"] },
    });
    s = act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Bear Cub") });
    const spell = s.stack[0]?.id as string;
    s = act(s, "p2", { type: "pass" });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Get Out"), mode: 0, targets: { t: [spell] } });
    s = settle(s);
    expect(idsOf(s, "p2", "battlefield", "Bear Cub")).toHaveLength(0);
    expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
    let t = scenario({
      p1: { battlefield: ["Bear Cub", "Nowhere to Run", "Llanowar Elves", ...lands("Island", 2)], hand: ["Get Out"] },
    });
    const targets = [idOf(t, "p1", "battlefield", "Bear Cub"), idOf(t, "p1", "battlefield", "Nowhere to Run")];
    // « Une ou deux cibles » : au moins une.
    expect(() => act(t, "p1", { type: "cast", card: idOf(t, "p1", "hand", "Get Out"), mode: 1, targets: { b: [] } })).toThrow();
    t = act(t, "p1", { type: "cast", card: idOf(t, "p1", "hand", "Get Out"), mode: 1, targets: { b: targets } });
    t = settle(t);
    expect(namesIn(t, t.players.p1?.hand).sort()).toEqual(["Bear Cub", "Nowhere to Run"]);
    expect(idsOf(t, "p1", "battlefield", "Llanowar Elves")).toHaveLength(1);
  });

  it("Split Up : détruit toutes les créatures engagées, ou toutes les dégagées", () => {
    const board = {
      p1: { battlefield: [{ name: "Llanowar Elves", tapped: true }, "Bear Cub", ...lands("Plains", 3)], hand: ["Split Up"] },
      p2: { battlefield: [{ name: "Shivan Dragon", tapped: true }, "Serra Angel"] },
    };
    let s = scenario(board);
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Split Up"), mode: 0 });
    s = settle(s);
    expect(
      namesIn(
        s,
        s.battlefield.filter((id) => chars(s, id).types.includes("Creature")),
      ).sort(),
    ).toEqual(["Bear Cub", "Serra Angel"]);
    let t = scenario(board);
    t = act(t, "p1", { type: "cast", card: idOf(t, "p1", "hand", "Split Up"), mode: 1 });
    t = settle(t);
    expect(
      namesIn(
        t,
        t.battlefield.filter((id) => chars(t, id).types.includes("Creature")),
      ).sort(),
    ).toEqual(["Llanowar Elves", "Shivan Dragon"]);
  });

  it("Unidentified Hovership : exile une créature d'endurance 5 ou moins ; quand il part, son propriétaire manifeste l'effroi", () => {
    let s = scenario({
      p1: { battlefield: lands("Plains", 5), hand: ["Unidentified Hovership", "Bovine Intervention"] },
      p2: { battlefield: ["Shivan Dragon"], library: lands("Forest", 3) },
    });
    const dragon = idOf(s, "p2", "battlefield", "Shivan Dragon");
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Unidentified Hovership") });
    s = settleAnswering(s, picking([dragon]));
    expect(s.objects[dragon]).toBeUndefined();
    expect(s.exile.some((id) => nameOf(s, id) === "Shivan Dragon")).toBe(true);
    const ship = idOf(s, "p1", "battlefield", "Unidentified Hovership");
    expect(chars(s, ship).keywords).toContain("flying");
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Bovine Intervention"), targets: { t: [ship] } });
    s = settle(s);
    // Le propriétaire de la carte exilée (p2) manifeste l'effroi ; le Dragon reste en exil.
    const faceDown = s.battlefield.filter((id) => s.objects[id]?.faceDown);
    expect(faceDown).toHaveLength(1);
    expect(s.objects[faceDown[0] as string]?.controller).toBe("p2");
    expect(s.exile.some((id) => nameOf(s, id) === "Shivan Dragon")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Lot K8 : cartes mythiques, rares et peu communes jamais nommées dans un test, confrontées à leur texte Oracle.
// ---------------------------------------------------------------------------

/** Quatre types de cartes (éphémère, terrain, créature, rituel) : le délire. */
const DELIRIUM = ["Opt", "Forest", "Llanowar Elves", "Pyroclasm"];
/** Ouvre des portes d'une Salle mise en place par `scenario` (sans déclencher « quand vous déverrouillez »). */
const openDoors = (s: S, name: string, doors: number[], player = "p1") => {
  const id = idOf(s, player, "battlefield", name);
  const o = s.objects[id];
  if (o) o.unlocked = doors;
  bump(s);
  return id;
};
/** Déverrouille la porte encore verrouillée de la Salle (action spéciale, au rythme d'un rituel). */
const unlock = (s: S, room: string, player = "p1") => {
  const a = legalActions(s, player).find((x) => x.type === "activate" && x.source === room);
  return act(s, player, { type: "activate", source: room, ability: a?.type === "activate" ? a.ability : -1 });
};
/** Active la capacité `index` (ordre des capacités activables de la source dans `legalActions`). */
const activateNth = (s: S, source: string, index = 0, extra: object = {}, player = "p1") => {
  const all = legalActions(s, player).filter((x) => x.type === "activate" && x.source === source);
  const a = all[index];
  return act(s, player, { type: "activate", source, ability: a?.type === "activate" ? a.ability : -1, ...extra });
};
/** Répond « oui » ou « non » aux questions, et choisit les objets voulus quand ils sont proposés. */
const answering =
  (opts: { yes?: boolean | Record<string, boolean>; pick?: string[] } = {}) =>
  (req: Parameters<ReturnType<typeof picking>>[0], player: string) => {
    if (req.type === "yesNo" && opts.yes !== undefined) {
      const yes = typeof opts.yes === "boolean" ? opts.yes : opts.yes[player];
      return yes === undefined ? undefined : [yes ? 1 : 0];
    }
    return opts.pick ? picking(opts.pick)(req) : undefined;
  };
const faceDownOf = (s: S, player: string) =>
  s.battlefield.filter((id) => s.objects[id]?.faceDown && s.objects[id]?.controller === player);
const creaturesOf = (s: S, player: string) =>
  namesIn(
    s,
    s.battlefield.filter((id) => s.objects[id]?.controller === player && chars(s, id).types.includes("Creature")),
  ).sort();

describe("Duskmourn, lot K8 : mythiques", () => {
  it("Charred Foyer : à votre entretien, la carte du dessus est exilée et jouable ce tour-ci", () => {
    let s = scenario({
      active: "p2",
      step: "main2",
      p1: { battlefield: ["Charred Foyer // Warped Space"], library: ["Mountain", "Forest", "Forest"] },
    });
    openDoors(s, "Charred Foyer // Warped Space", [0]);
    s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1");
    const mountain = s.exile.find((id) => nameOf(s, id) === "Mountain") as string;
    expect(mountain).toBeDefined();
    expect(legalActions(s, "p1").some((a) => a.type === "playLand" && a.card === mountain)).toBe(true);
    // Le tour suivant de p1, elle n'est plus jouable.
    const later = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.number > s.turn.number);
    expect(legalActions(later, "p1").some((a) => a.type === "playLand" && a.card === mountain)).toBe(false);
  });

  it("Warped Space : une fois par tour, un sort lancé depuis l'exil peut coûter {0}", () => {
    let s = scenario({
      active: "p2",
      step: "main2",
      p1: { battlefield: ["Charred Foyer // Warped Space"], library: ["Shivan Dragon", "Forest", "Forest"] },
    });
    openDoors(s, "Charred Foyer // Warped Space", [0, 1]);
    s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1");
    const dragon = s.exile.find((id) => nameOf(s, id) === "Shivan Dragon") as string;
    const opt = legalActions(s, "p1").find((a) => a.type === "cast" && a.card === dragon);
    expect(opt?.type === "cast" && opt.freeAvailable).toBe(true);
    s = act(s, "p1", { type: "cast", card: dragon, free: true });
    s = settle(s);
    expect(idsOf(s, "p1", "battlefield", "Shivan Dragon")).toHaveLength(1);
    // Une fois par tour seulement : la deuxième carte exilée (Painter's Studio) se paie.
    let t = scenario({
      p1: {
        battlefield: ["Charred Foyer // Warped Space", "Painter's Studio // Defaced Gallery", ...lands("Mountain", 3)],
        library: ["Bear Cub", "Llanowar Elves", "Forest"],
      },
    });
    openDoors(t, "Charred Foyer // Warped Space", [1]);
    const studio = openDoors(t, "Painter's Studio // Defaced Gallery", [1]);
    t = settle(unlock(t, studio));
    const freeOf = (x: S, name: string) => {
      const card = x.exile.find((id) => nameOf(x, id) === name) as string;
      const o = legalActions(x, "p1").find((a) => a.type === "cast" && a.card === card);
      return [card, o?.type === "cast" && !!o.freeAvailable] as const;
    };
    const [cub, cubFree] = freeOf(t, "Bear Cub");
    expect(cubFree).toBe(true);
    t = settle(act(t, "p1", { type: "cast", card: cub, free: true }));
    expect(freeOf(t, "Llanowar Elves")[1]).toBe(false);
  });

  it("Dollmaker's Shop : quand vous attaquez un joueur, un jeton Jouet 1/1 blanc artefact-créature", () => {
    let s = scenario({ p1: { battlefield: ["Dollmaker's Shop // Porcelain Gallery", "Bear Cub"] } });
    openDoors(s, "Dollmaker's Shop // Porcelain Gallery", [0]);
    s = attack(s, [idOf(s, "p1", "battlefield", "Bear Cub")]);
    s = settle(s);
    const toy = idOf(s, "p1", "battlefield", "Toy");
    expect(chars(s, toy)).toMatchObject({ power: 1, toughness: 1, colors: ["W"] });
    expect(chars(s, toy).types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
  });

  it("Porcelain Gallery : vos créatures ont une F/E de base égale au nombre de créatures que vous contrôlez", () => {
    const s = scenario({
      p1: { battlefield: ["Dollmaker's Shop // Porcelain Gallery", "Shivan Dragon", "Llanowar Elves", "Bear Cub"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    openDoors(s, "Dollmaker's Shop // Porcelain Gallery", [1]);
    for (const name of ["Shivan Dragon", "Llanowar Elves", "Bear Cub"])
      expect(chars(s, idOf(s, "p1", "battlefield", name)), name).toMatchObject({ power: 3, toughness: 3 });
    expect(chars(s, idOf(s, "p2", "battlefield", "Serra Angel"))).toMatchObject({ power: 4, toughness: 4 });
  });

  it("Funeral Room : chaque créature à vous qui meurt draine 1 ; pas celles de l'adversaire", () => {
    let s = scenario({
      p1: {
        battlefield: ["Funeral Room // Awakening Hall", "Bear Cub", "Llanowar Elves", ...lands("Mountain", 2)],
        hand: ["Pyroclasm"],
      },
      p2: { battlefield: ["Bear Cub"] },
    });
    openDoors(s, "Funeral Room // Awakening Hall", [0]);
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Pyroclasm") });
    s = settle(s);
    expect(s.players.p1?.life).toBe(22);
    expect(s.players.p2?.life).toBe(18);
  });

  it("Awakening Hall : en la déverrouillant, toutes les cartes de créature de votre cimetière reviennent", () => {
    let s = scenario({
      p1: {
        battlefield: ["Funeral Room // Awakening Hall", ...lands("Swamp", 8)],
        graveyard: ["Bear Cub", "Shivan Dragon", "Opt"],
      },
      p2: { graveyard: ["Llanowar Elves"] },
    });
    const room = openDoors(s, "Funeral Room // Awakening Hall", [0]);
    s = unlock(s, room);
    s = settle(s);
    expect(creaturesOf(s, "p1")).toEqual(["Bear Cub", "Shivan Dragon"]);
    expect(namesIn(s, s.players.p1?.graveyard)).toEqual(["Opt"]);
    expect(namesIn(s, s.players.p2?.graveyard)).toEqual(["Llanowar Elves"]);
  });

  it("Hauntwoods Shrieker : il manifeste l'effroi en attaquant ; {1}{G} révèle un permanent face cachée et retourne une créature", () => {
    let s = scenario({
      p1: { battlefield: ["Hauntwoods Shrieker", ...lands("Forest", 2)], library: ["Shivan Dragon", "Island", "Forest"] },
    });
    s = attack(s, [idOf(s, "p1", "battlefield", "Hauntwoods Shrieker")]);
    s = settleNoBlocks(s, (req) => pickNamed(s, req, "Shivan Dragon"));
    const [hidden] = faceDownOf(s, "p1");
    expect(hidden).toBeDefined();
    expect(namesIn(s, s.players.p1?.graveyard)).toEqual(["Island"]);
    s = activateNth(s, idOf(s, "p1", "battlefield", "Hauntwoods Shrieker"), 0, { targets: { t: [hidden as string] } });
    s = settleAnswering(s, answering({ yes: true }));
    expect(s.objects[hidden as string]?.faceDown).toBeUndefined();
    expect(nameOf(s, hidden as string)).toBe("Shivan Dragon");
    // Une carte de terrain révélée reste face cachée.
    let t = scenario({
      p1: { battlefield: ["Hauntwoods Shrieker", ...lands("Forest", 2)], library: ["Shivan Dragon", "Island", "Forest"] },
    });
    t = attack(t, [idOf(t, "p1", "battlefield", "Hauntwoods Shrieker")]);
    t = settleNoBlocks(t, (req, _p, cur) => pickNamed(cur, req, "Island"));
    const [land] = faceDownOf(t, "p1") as [string];
    t = activateNth(t, idOf(t, "p1", "battlefield", "Hauntwoods Shrieker"), 0, { targets: { t: [land] } });
    t = settleAnswering(t, answering({ yes: true }));
    expect(t.objects[land]?.faceDown).toBeDefined();
  });

  it("Meathook Massacre II : chacun sacrifie X créatures ; payer 3 PV ramène la vôtre, l'adversaire qui ne paie pas vous donne la sienne", () => {
    let s = scenario({
      p1: { battlefield: ["Bear Cub", ...lands("Swamp", 6)], hand: ["Meathook Massacre II"] },
      p2: { battlefield: ["Llanowar Elves", "Serra Angel"] },
    });
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Meathook Massacre II"), x: 1 });
    s = settleAnswering(s, answering({ yes: { p1: true, p2: false }, pick: [angel] }));
    expect(s.players.p1?.life).toBe(17);
    expect(s.players.p2?.life).toBe(20);
    expect(creaturesOf(s, "p1")).toEqual(["Bear Cub", "Serra Angel"]);
    expect(creaturesOf(s, "p2")).toEqual(["Llanowar Elves"]);
    for (const name of ["Bear Cub", "Serra Angel"])
      expect(s.objects[idOf(s, "p1", "battlefield", name)]?.counters.finality, name).toBe(1);
    // L'adversaire qui paie 3 PV garde sa carte au cimetière.
    let t = scenario({
      p1: { battlefield: lands("Swamp", 6), hand: ["Meathook Massacre II"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    t = act(t, "p1", { type: "cast", card: idOf(t, "p1", "hand", "Meathook Massacre II"), x: 1 });
    t = settleAnswering(t, answering({ yes: { p2: true } }));
    expect(t.players.p2?.life).toBe(17);
    expect(namesIn(t, t.players.p2?.graveyard)).toEqual(["Serra Angel"]);
    expect(creaturesOf(t, "p1")).toEqual([]);
  });

  it("Mirror Room : en la déverrouillant, un jeton copie d'une de vos créatures, qui est aussi un Reflet", () => {
    let s = scenario({ p1: { battlefield: ["Bear Cub", ...lands("Island", 3)], hand: ["Mirror Room // Fractured Realm"] } });
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Mirror Room // Fractured Realm"), face: 0 });
    s = settleAnswering(s, picking([cub]));
    const copies = idsOf(s, "p1", "battlefield", "Bear Cub").filter((id) => id !== cub);
    expect(copies).toHaveLength(1);
    expect(s.objects[copies[0] as string]?.isToken).toBe(true);
    expect(chars(s, copies[0] as string).subtypes).toEqual(expect.arrayContaining(["Bear", "Reflection"]));
  });

  it("Fractured Realm : une capacité déclenchée d'un de vos permanents se déclenche une fois de plus", () => {
    let s = scenario({
      p1: { battlefield: ["Mirror Room // Fractured Realm", ...lands("Island", 3)], hand: ["Tunnel Surveyor"] },
    });
    openDoors(s, "Mirror Room // Fractured Realm", [1]);
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Tunnel Surveyor") });
    s = settle(s);
    expect(idsOf(s, "p1", "battlefield", "Glimmer")).toHaveLength(2);
  });

  it("Niko : deux Éclats ; {2}, {T} : une créature non légendaire exilée, les Éclats la copient jusqu'à l'étape de fin", () => {
    let s = scenario({
      p1: { battlefield: ["Bear Cub", "Plains", "Plains", "Island", "Island"], hand: ["Niko, Light of Hope"] },
    });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Niko, Light of Hope") });
    s = settle(s);
    const shards = idsOf(s, "p1", "battlefield", "Shard");
    expect(shards).toHaveLength(2);
    expect(chars(s, shards[0] as string).types).toEqual(["Enchantment"]);
    // Au tour suivant : Niko ne peut pas viser une créature légendaire (lui-même).
    s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.turn.number > 3);
    const niko = idOf(s, "p1", "battlefield", "Niko, Light of Hope");
    expect(() => activateNth(s, niko, 0, { targets: { t: [niko] } })).toThrow();
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    s = activateNth(s, niko, 0, { targets: { t: [cub] } });
    s = settle(s);
    expect(s.objects[cub]).toBeUndefined();
    for (const id of shards) expect(chars(s, id)).toMatchObject({ name: "Bear Cub", power: 2, toughness: 2 });
    // À l'étape de fin, la créature revient et les Éclats redeviennent des Éclats.
    s = advanceUntil(s, (x) => x.turn.step === "cleanup" || x.turn.active === "p2");
    expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
    for (const id of shards) expect(chars(s, id).name).toBe("Shard");
  });

  it("Overlord of the Balemurk : meule 4, puis une créature non-Avatar ou un planeswalker en main (pas un Avatar)", () => {
    let s = scenario({
      p1: {
        battlefield: lands("Swamp", 2),
        hand: ["Overlord of the Balemurk"],
        library: ["Overlord of the Mistmoors", "Bear Cub", "Opt", "Forest", "Island"],
      },
    });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Overlord of the Balemurk"), alternative: true });
    let offered: string[] = [];
    s = settleAnswering(s, (req, _p, cur) => {
      if (req.type === "pick") offered = namesIn(cur, req.options) as string[];
      return pickNamed(cur, req, "Bear Cub");
    });
    expect(offered).toEqual(["Bear Cub"]);
    expect(namesIn(s, s.players.p1?.hand)).toEqual(["Bear Cub"]);
    expect(namesIn(s, s.players.p1?.graveyard).sort()).toEqual(["Forest", "Opt", "Overlord of the Mistmoors"]);
    expect(s.objects[idOf(s, "p1", "battlefield", "Overlord of the Balemurk")]?.counters.time).toBe(5);
  });

  it("Overlord of the Boilerbilges : 4 blessures à n'importe quelle cible, à l'arrivée comme à l'attaque", () => {
    let s = scenario({ p1: { battlefield: lands("Mountain", 4), hand: ["Overlord of the Boilerbilges"] } });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Overlord of the Boilerbilges"), alternative: true });
    s = settleAnswering(s, picking(["p2"]));
    expect(s.players.p2?.life).toBe(16);
    let t = scenario({ p1: { battlefield: ["Overlord of the Boilerbilges"] }, p2: { battlefield: ["Serra Angel"] } });
    const angel = idOf(t, "p2", "battlefield", "Serra Angel");
    t = attack(t, [idOf(t, "p1", "battlefield", "Overlord of the Boilerbilges")]);
    t = settleNoBlocks(t, picking([angel]));
    expect(t.objects[angel]).toBeUndefined();
  });

  it("Overlord of the Floodpits : piochez deux cartes, puis défaussez-en une", () => {
    let s = scenario({
      p1: { battlefield: lands("Island", 3), hand: ["Overlord of the Floodpits"], library: ["Opt", "Forest", "Island"] },
    });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Overlord of the Floodpits"), alternative: true });
    s = settle(s);
    expect(s.players.p1?.hand).toHaveLength(1);
    expect(s.players.p1?.graveyard).toHaveLength(1);
    expect(s.objects[idOf(s, "p1", "battlefield", "Overlord of the Floodpits")]?.counters.time).toBe(4);
  });

  it("Overlord of the Hauntwoods : un terrain incolore Everywhere engagé, de tous les types de terrains de base", () => {
    let s = scenario({ p1: { battlefield: lands("Forest", 3), hand: ["Overlord of the Hauntwoods"] } });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Overlord of the Hauntwoods"), alternative: true });
    s = settle(s);
    const everywhere = idOf(s, "p1", "battlefield", "Everywhere");
    expect(s.objects[everywhere]?.tapped).toBe(true);
    const c = chars(s, everywhere);
    expect(c.types).toEqual(["Land"]);
    expect(c.colors).toEqual([]);
    expect(c.subtypes.sort()).toEqual(["Forest", "Island", "Mountain", "Plains", "Swamp"]);
  });

  it("The Rollercrusher Ride : X blessures à chacune de jusqu'à X créatures ; sous délire, vos blessures non de combat sont doublées", () => {
    let s = scenario({
      p1: { battlefield: lands("Mountain", 5), hand: ["The Rollercrusher Ride"] },
      p2: { battlefield: ["Bear Cub", "Shivan Dragon"] },
    });
    const cub = idOf(s, "p2", "battlefield", "Bear Cub");
    const dragon = idOf(s, "p2", "battlefield", "Shivan Dragon");
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "The Rollercrusher Ride"), x: 2 });
    s = settleAnswering(s, picking([cub, dragon]));
    expect(s.objects[cub]).toBeUndefined();
    expect(s.objects[dragon]?.damage).toBe(2);
    // Délire : les blessures non de combat d'une source à vous sont doublées, pas celles de combat.
    let t = scenario({
      p1: {
        battlefield: ["The Rollercrusher Ride", "Bear Cub", ...lands("Mountain", 2)],
        hand: ["Lightning Strike"],
        graveyard: DELIRIUM,
      },
    });
    t = act(t, "p1", { type: "cast", card: idOf(t, "p1", "hand", "Lightning Strike"), targets: { t: ["p2"] } });
    t = settle(t);
    expect(t.players.p2?.life).toBe(14);
    t = attack(t, [idOf(t, "p1", "battlefield", "Bear Cub")]);
    t = throughCombat(t);
    expect(t.players.p2?.life).toBe(12);
  });

  it("The Wandering Rescuer : vos autres créatures engagées ont la défense talismanique", () => {
    const s = scenario({
      p1: {
        battlefield: [{ name: "The Wandering Rescuer", tapped: true }, { name: "Bear Cub", tapped: true }, "Llanowar Elves"],
      },
      p2: { battlefield: [{ name: "Serra Angel", tapped: true }] },
    });
    const kw = (p: string, name: string) => chars(s, idOf(s, p, "battlefield", name)).keywords;
    expect(kw("p1", "Bear Cub")).toContain("hexproof");
    expect(kw("p1", "Llanowar Elves")).not.toContain("hexproof");
    expect(kw("p1", "The Wandering Rescuer")).not.toContain("hexproof");
    expect(kw("p1", "The Wandering Rescuer")).toEqual(expect.arrayContaining(["flash", "convoke", "doubleStrike"]));
    expect(kw("p2", "Serra Angel")).not.toContain("hexproof");
  });

  it("Tyvar : engager une autre créature le rend indestructible et l'engage ; {3}{G}{G} : +X/+X, X la plus grande force", () => {
    let s = scenario({
      p1: { battlefield: ["Tyvar, the Pummeler", "Bear Cub", "Shivan Dragon", ...lands("Forest", 5)] },
    });
    const tyvar = idOf(s, "p1", "battlefield", "Tyvar, the Pummeler");
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    expect(() => activateNth(s, tyvar, 0, { tap: [tyvar] })).toThrow();
    s = activateNth(s, tyvar, 0, { tap: [cub] });
    s = settle(s);
    expect(s.objects[cub]?.tapped).toBe(true);
    expect(s.objects[tyvar]?.tapped).toBe(true);
    expect(chars(s, tyvar).keywords).toContain("indestructible");
    s = act(s, "p1", { type: "activate", source: tyvar, ability: 1 });
    s = settle(s);
    // Shivan Dragon (5) : +5/+5.
    expect(chars(s, tyvar)).toMatchObject({ power: 8, toughness: 8 });
    expect(chars(s, cub)).toMatchObject({ power: 7, toughness: 7 });
  });

  it("Walk-In Closet : vous pouvez jouer des terrains depuis votre cimetière", () => {
    const s = scenario({
      p1: { battlefield: ["Walk-In Closet // Forgotten Cellar"], graveyard: ["Forest", "Bear Cub"] },
    });
    openDoors(s, "Walk-In Closet // Forgotten Cellar", [0]);
    const forest = idOf(s, "p1", "graveyard", "Forest");
    expect(legalActions(s, "p1").some((a) => a.type === "playLand" && a.card === forest)).toBe(true);
    expect(castable(s, "p1", idOf(s, "p1", "graveyard", "Bear Cub"))).toBe(false);
  });

  it("Forgotten Cellar : ce tour-ci, vos sorts se lancent depuis le cimetière, et ce qui irait au cimetière est exilé", () => {
    let s = scenario({
      p1: {
        battlefield: ["Walk-In Closet // Forgotten Cellar", ...lands("Forest", 5), ...lands("Mountain", 2)],
        graveyard: ["Lightning Strike"],
      },
    });
    const room = openDoors(s, "Walk-In Closet // Forgotten Cellar", [0]);
    const strike = idOf(s, "p1", "graveyard", "Lightning Strike");
    expect(castable(s, "p1", strike)).toBe(false);
    s = unlock(s, room);
    s = settle(s);
    expect(castable(s, "p1", strike)).toBe(true);
    s = act(s, "p1", { type: "cast", card: strike, targets: { t: ["p2"] } });
    s = settle(s);
    expect(s.players.p2?.life).toBe(17);
    expect(s.exile.some((id) => nameOf(s, id) === "Lightning Strike")).toBe(true);
    expect(s.players.p1?.graveyard).toHaveLength(0);
  });
});

describe("Duskmourn, lot K8 : rares (1)", () => {
  it("Balustrade Wurm : ne peut pas être contrecarré ; délire, {2}{G}{G} : revient du cimetière avec un marqueur de finalité", () => {
    let s = scenario({
      p1: { battlefield: lands("Forest", 5), hand: ["Balustrade Wurm"] },
      p2: { battlefield: lands("Island", 3), hand: ["Twist Reality"] },
    });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Balustrade Wurm") });
    const spell = s.stack[0]?.id as string;
    s = act(s, "p1", { type: "pass" });
    s = act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Twist Reality"), mode: 0, targets: { t: [spell] } });
    s = settle(s);
    const wurm = idOf(s, "p1", "battlefield", "Balustrade Wurm");
    expect(chars(s, wurm).keywords).toEqual(expect.arrayContaining(["trample", "haste"]));
    // Depuis le cimetière : seulement avec le délire.
    const without = scenario({ p1: { battlefield: lands("Forest", 4), graveyard: ["Balustrade Wurm", "Opt", "Forest"] } });
    expect(canActivate(without, "p1", idOf(without, "p1", "graveyard", "Balustrade Wurm"))).toBe(false);
    let t = scenario({ p1: { battlefield: lands("Forest", 4), graveyard: ["Balustrade Wurm", "Opt", "Forest", "Pyroclasm"] } });
    t = activateNth(t, idOf(t, "p1", "graveyard", "Balustrade Wurm"));
    t = settle(t);
    expect(t.objects[idOf(t, "p1", "battlefield", "Balustrade Wurm")]?.counters.finality).toBe(1);
  });

  it("Central Elevator : en la déverrouillant, cherchez une carte de Salle", () => {
    let s = scenario({
      p1: {
        battlefield: lands("Island", 4),
        hand: ["Central Elevator // Promising Stairs"],
        library: ["Bear Cub", ROOM, "Forest"],
      },
    });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Central Elevator // Promising Stairs"), face: 0 });
    let offered: string[] = [];
    s = settleAnswering(s, (req, _p, cur) => {
      if (req.type === "pick") offered = namesIn(cur, req.options) as string[];
      return undefined;
    });
    expect(offered).toEqual([ROOM]);
    expect(namesIn(s, s.players.p1?.hand)).toEqual([ROOM]);
  });

  it("Promising Stairs : surveillance 1 à l'entretien ; huit noms de portes déverrouillées, vous gagnez la partie", () => {
    const rooms = [
      "Central Elevator // Promising Stairs",
      ROOM,
      "Funeral Room // Awakening Hall",
      "Bottomless Pool // Locker Room",
    ];
    const setup = (allOpen: boolean) => {
      let s = scenario({ active: "p2", step: "main2", p1: { battlefield: rooms, library: ["Opt", "Forest", "Forest"] } });
      for (const [i, r] of rooms.entries()) openDoors(s, r, i === 3 && !allOpen ? [0] : [0, 1]);
      s = advanceUntil(s, (x) => x.turn.active === "p1" && (x.pending?.kind === "choice" || x.turn.step === "draw"));
      // Surveillance 1 : Opt va au cimetière.
      return settleAnswering(s, (req, _p, cur) => pickNamed(cur, req, "Opt"));
    };
    // Sept noms : la surveillance a lieu, pas de victoire.
    const seven = setup(false);
    expect(seven.players.p2?.lost).toBeFalsy();
    expect(namesIn(seven, seven.players.p1?.graveyard)).toEqual(["Opt"]);
    const eight = setup(true);
    expect(eight.players.p2?.lost).toBe(true);
  });

  it("Come Back Wrong : détruit une créature, elle revient sous votre contrôle et est sacrifiée à votre prochaine étape de fin", () => {
    let s = scenario({
      p1: { battlefield: lands("Swamp", 3), hand: ["Come Back Wrong"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    s = act(s, "p1", {
      type: "cast",
      card: idOf(s, "p1", "hand", "Come Back Wrong"),
      targets: { t: [idOf(s, "p2", "battlefield", "Serra Angel")] },
    });
    s = settle(s);
    expect(creaturesOf(s, "p1")).toEqual(["Serra Angel"]);
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(creaturesOf(s, "p1")).toEqual([]);
    expect(namesIn(s, s.players.p2?.graveyard)).toEqual(["Serra Angel"]);
  });

  it("Cursed Recording : un marqueur de temps par éphémère ou rituel ; au septième, ils sont retirés et il vous inflige 20 blessures", () => {
    let s = scenario({
      p1: {
        life: 25,
        battlefield: [{ name: "Cursed Recording", counters: { time: 5 } }, ...lands("Island", 2)],
        hand: ["Opt", "Opt"],
      },
    });
    const rec = idOf(s, "p1", "battlefield", "Cursed Recording");
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Opt") });
    s = settle(s);
    expect(s.objects[rec]?.counters.time).toBe(6);
    expect(s.players.p1?.life).toBe(25);
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Opt") });
    s = settle(s);
    expect(s.objects[rec]?.counters.time ?? 0).toBe(0);
    expect(s.players.p1?.life).toBe(5);
  });

  it("Cursed Recording : {T} : le prochain éphémère ou rituel lancé ce tour-ci est copié", () => {
    let s = scenario({ p1: { battlefield: ["Cursed Recording", ...lands("Mountain", 2)], hand: ["Lightning Strike"] } });
    s = activateNth(s, idOf(s, "p1", "battlefield", "Cursed Recording"));
    s = settle(s);
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Lightning Strike"), targets: { t: ["p2"] } });
    s = settle(s);
    expect(s.players.p2?.life).toBe(14);
  });

  it("Dazzling Theater : vos sorts de créature ont la convocation", () => {
    const board = { battlefield: [...lands("Mountain", 2), ...Array(4).fill("Bear Cub")], hand: ["Shivan Dragon"] };
    const without = scenario({ p1: board });
    expect(castable(without, "p1", idOf(without, "p1", "hand", "Shivan Dragon"))).toBe(false);
    let s = scenario({ p1: { ...board, battlefield: [...board.battlefield, "Dazzling Theater // Prop Room"] } });
    openDoors(s, "Dazzling Theater // Prop Room", [0]);
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Shivan Dragon") });
    s = settle(s);
    expect(idsOf(s, "p1", "battlefield", "Shivan Dragon")).toHaveLength(1);
    expect(idsOf(s, "p1", "battlefield", "Bear Cub").every((id) => s.objects[id]?.tapped)).toBe(true);
  });

  it("Prop Room : vos créatures se dégagent pendant l'étape de dégagement des autres joueurs (pas vos terrains)", () => {
    let s = scenario({
      p1: {
        battlefield: ["Dazzling Theater // Prop Room", { name: "Bear Cub", tapped: true }, { name: "Forest", tapped: true }],
      },
    });
    openDoors(s, "Dazzling Theater // Prop Room", [1]);
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    expect(s.objects[idOf(s, "p1", "battlefield", "Bear Cub")]?.tapped).toBe(false);
    expect(s.objects[idOf(s, "p1", "battlefield", "Forest")]?.tapped).toBe(true);
  });

  it("Demonic Counsel : une carte de Démon ; avec le délire, n'importe quelle carte", () => {
    const run = (graveyard: string[]) => {
      let s = scenario({
        p1: {
          battlefield: lands("Swamp", 2),
          hand: ["Demonic Counsel"],
          graveyard,
          library: ["Shivan Dragon", "Doomsday Excruciator", "Forest"],
        },
      });
      let offered: string[] = [];
      s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Demonic Counsel") });
      s = settleAnswering(s, (req, _p, cur) => {
        if (req.type === "pick") offered = (namesIn(cur, req.options) as string[]).sort();
        return undefined;
      });
      return offered;
    };
    expect(run([])).toEqual(["Doomsday Excruciator"]);
    expect(run(DELIRIUM)).toEqual(["Doomsday Excruciator", "Forest", "Shivan Dragon"]);
  });

  it("Dissection Tools : manifeste l'effroi et s'y attache (+2/+2, contact mortel, lien de vie) ; s'équipe en sacrifiant une créature", () => {
    let s = scenario({
      p1: {
        battlefield: ["Bear Cub", "Llanowar Elves", ...lands("Forest", 5)],
        hand: ["Dissection Tools"],
        library: ["Forest", "Island", "Swamp"],
      },
    });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Dissection Tools") });
    s = settle(s);
    const [hidden] = faceDownOf(s, "p1") as [string];
    const tools = idOf(s, "p1", "battlefield", "Dissection Tools");
    expect(s.objects[tools]?.attachedTo).toBe(hidden);
    expect(chars(s, hidden)).toMatchObject({ power: 4, toughness: 4 });
    expect(chars(s, hidden).keywords).toEqual(expect.arrayContaining(["deathtouch", "lifelink"]));
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    const elves = idOf(s, "p1", "battlefield", "Llanowar Elves");
    s = activateNth(s, tools, 0, { sacrifice: [cub], targets: { t: [elves] } });
    s = settle(s);
    expect(s.objects[cub]).toBeUndefined();
    expect(s.objects[tools]?.attachedTo).toBe(elves);
  });

  it("Enduring Courage : une autre créature à vous qui arrive gagne +2/+0 et la célérité ; revenue en enchantement, elle continue", () => {
    let s = scenario({
      p1: {
        battlefield: ["Enduring Courage", ...lands("Mountain", 3), ...lands("Forest", 2)],
        hand: ["Bear Cub", "Lightning Strike", "Llanowar Elves"],
      },
      p2: { battlefield: lands("Forest", 2), hand: ["Bear Cub"] },
    });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Bear Cub") });
    s = settle(s);
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    expect(chars(s, cub)).toMatchObject({ power: 4, toughness: 2 });
    expect(chars(s, cub).keywords).toContain("haste");
    s = act(s, "p1", {
      type: "cast",
      card: idOf(s, "p1", "hand", "Lightning Strike"),
      targets: { t: [idOf(s, "p1", "battlefield", "Enduring Courage")] },
    });
    s = settle(s);
    expect(chars(s, idOf(s, "p1", "battlefield", "Enduring Courage")).types).toEqual(["Enchantment"]);
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Llanowar Elves") });
    s = settle(s);
    expect(chars(s, idOf(s, "p1", "battlefield", "Llanowar Elves")).power).toBe(3);
    // Une créature adverse n'en profite pas.
    let t = scenario({
      active: "p2",
      p1: { battlefield: ["Enduring Courage"] },
      p2: { battlefield: lands("Forest", 2), hand: ["Bear Cub"] },
    });
    t = act(t, "p2", { type: "cast", card: idOf(t, "p2", "hand", "Bear Cub") });
    t = settle(t);
    expect(chars(t, idOf(t, "p2", "battlefield", "Bear Cub")).power).toBe(2);
  });

  it("Enduring Tenacity : quand vous gagnez des PV, l'adversaire ciblé en perd autant", () => {
    let s = scenario({
      p1: { battlefield: ["Enduring Tenacity", ...lands("Swamp", 2)], hand: ["Winter's Intervention"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    s = act(s, "p1", {
      type: "cast",
      card: idOf(s, "p1", "hand", "Winter's Intervention"),
      targets: { t: [idOf(s, "p2", "battlefield", "Bear Cub")] },
    });
    s = settle(s);
    expect(s.players.p1?.life).toBe(22);
    expect(s.players.p2?.life).toBe(18);
  });

  it("Enduring Vitality : vos créatures ont « {T} : un mana de n'importe quelle couleur » (pas celles de l'adversaire)", () => {
    const s = scenario({
      p1: { battlefield: ["Enduring Vitality", "Bear Cub", { name: "Llanowar Elves", sick: true }] },
      p2: { battlefield: ["Serra Angel"] },
    });
    const colorsOf = (p: string, name: string) =>
      legalActions(s, p).flatMap((a) =>
        a.type === "tapForMana" && a.source === idOf(s, p, "battlefield", name) ? a.colors : [],
      );
    expect(colorsOf("p1", "Bear Cub").sort()).toEqual(["B", "G", "R", "U", "W"]);
    expect(chars(s, idOf(s, "p1", "battlefield", "Enduring Vitality")).keywords).toContain("vigilance");
    expect(colorsOf("p2", "Serra Angel")).toEqual([]);
  });

  it("Entity Tracker : sinistre, piochez une carte (enchantement qui arrive, Salle entièrement déverrouillée)", () => {
    let s = scenario({
      p1: { battlefield: ["Entity Tracker", ROOM, ...lands("Swamp", 2), ...lands("Plains", 4)], hand: ["Nowhere to Run"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    const room = openDoors(s, ROOM, [0]);
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Nowhere to Run") });
    s = settle(s);
    expect(s.players.p1?.hand).toHaveLength(1);
    s = unlock(s, room);
    s = settle(s);
    expect(s.players.p1?.hand).toHaveLength(2);
  });

  it("Fear of Missing Out : en arrivant, défaussez puis piochez ; délire, à sa première attaque, dégagez une créature et combattez encore", () => {
    let s = scenario({
      p1: { battlefield: lands("Mountain", 2), hand: ["Fear of Missing Out", "Opt"], library: ["Forest", "Forest"] },
    });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Fear of Missing Out") });
    s = settle(s);
    expect(namesIn(s, s.players.p1?.graveyard)).toEqual(["Opt"]);
    expect(namesIn(s, s.players.p1?.hand)).toEqual(["Forest"]);
    // Délire : une créature engagée est dégagée et une phase de combat s'ajoute.
    let t = scenario({
      p1: { battlefield: ["Fear of Missing Out", { name: "Bear Cub", tapped: true }], graveyard: DELIRIUM },
    });
    const cub = idOf(t, "p1", "battlefield", "Bear Cub");
    t = attack(t, [idOf(t, "p1", "battlefield", "Fear of Missing Out")]);
    t = settleNoBlocks(t, picking([cub]));
    expect(t.objects[cub]?.tapped).toBe(false);
    t = advanceUntil(t, (x) => x.pending?.kind === "declareAttackers" || x.turn.active === "p2");
    expect(t.turn.active).toBe("p1");
    // Sans délire, pas de déclenchement.
    let u = scenario({ p1: { battlefield: ["Fear of Missing Out", { name: "Bear Cub", tapped: true }] } });
    u = attack(u, [idOf(u, "p1", "battlefield", "Fear of Missing Out")]);
    expect(u.stack).toHaveLength(0);
  });

  it("Ghostly Dancers : en arrivant, un enchantement du cimetière en main ou une porte déverrouillée ; sinistre, un Esprit 3/1 volant", () => {
    let s = scenario({
      p1: { battlefield: lands("Plains", 5), hand: ["Ghostly Dancers"], graveyard: ["Nowhere to Run", "Bear Cub"] },
    });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Ghostly Dancers") });
    s = settle(s);
    expect(namesIn(s, s.players.p1?.hand)).toEqual(["Nowhere to Run"]);
    // « … ou … » choisi à la résolution (PLAN-D, D6) : la porte verrouillée s'ouvre, la Salle est entièrement
    // déverrouillée (sinistre).
    let t = scenario({ p1: { battlefield: [ROOM, ...lands("Plains", 5)], hand: ["Ghostly Dancers"] } });
    const room = openDoors(t, ROOM, [0]);
    t = act(t, "p1", { type: "cast", card: idOf(t, "p1", "hand", "Ghostly Dancers") });
    t = settleAnswering(t, (req) => (req.type === "pick" && req.intent === "other" ? ["1"] : undefined));
    expect(t.objects[room]?.unlocked).toEqual([0, 1]);
    const spirit = idOf(t, "p1", "battlefield", "Spirit");
    expect(chars(t, spirit)).toMatchObject({ power: 3, toughness: 1, colors: ["W"] });
    expect(chars(t, spirit).keywords).toContain("flying");
  });

  it("Hedge Shredder : en attaquant, vous pouvez meuler deux cartes ; les terrains meulés arrivent engagés", () => {
    let s = scenario({
      p1: { battlefield: ["Hedge Shredder", "Bear Cub"], library: ["Forest", "Opt", "Island"] },
    });
    const shredder = idOf(s, "p1", "battlefield", "Hedge Shredder");
    s = activateNth(s, shredder, 0, { tap: [idOf(s, "p1", "battlefield", "Bear Cub")] });
    s = settle(s);
    s = attack(s, [shredder]);
    s = settleNoBlocks(s, answering({ yes: true }));
    expect(namesIn(s, s.players.p1?.graveyard)).toEqual(["Opt"]);
    const forest = idOf(s, "p1", "battlefield", "Forest");
    expect(s.objects[forest]?.tapped).toBe(true);
  });

  it("Kona : survie, un permanent de votre main sur le champ de bataille (pas un éphémère)", () => {
    let s = scenario({ p1: { battlefield: [{ name: "Kona, Rescue Beastie", tapped: true }], hand: ["Shivan Dragon", "Opt"] } });
    let offered: string[] = [];
    s = advanceUntil(s, (x) => x.turn.step === "main2" && x.pending?.kind === "choice");
    if (s.pending?.kind === "choice" && s.pending.request.type === "pick")
      offered = namesIn(s, s.pending.request.options) as string[];
    s = settleAnswering(s, (req, _p, cur) => pickNamed(cur, req, "Shivan Dragon"));
    expect(offered).toEqual(["Shivan Dragon"]);
    expect(idsOf(s, "p1", "battlefield", "Shivan Dragon")).toHaveLength(1);
  });
});

describe("Duskmourn, lot K8 : rares (2)", () => {
  it("Leyline of Hope : chaque gain de PV augmente de 1 ; avec 7 PV de plus qu'au départ, vos créatures ont +2/+2", () => {
    let s = scenario({
      p1: { battlefield: ["Leyline of Hope", ...lands("Swamp", 2)], hand: ["Winter's Intervention"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    s = act(s, "p1", {
      type: "cast",
      card: idOf(s, "p1", "hand", "Winter's Intervention"),
      targets: { t: [idOf(s, "p2", "battlefield", "Bear Cub")] },
    });
    s = settle(s);
    expect(s.players.p1?.life).toBe(23);
    const at = (life: number) => {
      const t = scenario({ p1: { life, battlefield: ["Leyline of Hope", "Bear Cub"] }, p2: { battlefield: ["Serra Angel"] } });
      return [
        chars(t, idOf(t, "p1", "battlefield", "Bear Cub")).power,
        chars(t, idOf(t, "p2", "battlefield", "Serra Angel")).power,
      ];
    };
    expect(at(26)).toEqual([2, 4]);
    expect(at(27)).toEqual([4, 4]);
  });

  it("Leyline of Resonance : un éphémère ou rituel qui cible une de vos créatures est copié (pas s'il cible une créature adverse)", () => {
    const run = (who: "p1" | "p2") => {
      let s = scenario({
        p1: {
          battlefield: ["Leyline of Resonance", ...lands("Swamp", 2), ...(who === "p1" ? ["Bear Cub"] : [])],
          hand: ["Give In to Violence"],
        },
        p2: { battlefield: who === "p2" ? ["Bear Cub"] : [] },
      });
      const cub = idOf(s, who, "battlefield", "Bear Cub");
      s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Give In to Violence"), targets: { t: [cub] } });
      s = settle(s);
      return chars(s, cub).power;
    };
    expect(run("p1")).toBe(6);
    expect(run("p2")).toBe(4);
  });

  it("Leyline of Transformation : vos créatures sont du type choisi en plus de leurs autres types", () => {
    let s = scenario({
      p1: { battlefield: ["Bear Cub", ...lands("Island", 4)], hand: ["Leyline of Transformation"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Leyline of Transformation") });
    s = settleAnswering(s, (req) => (req.type === "pick" && req.options.includes("Dragon") ? ["Dragon"] : undefined));
    expect(chars(s, idOf(s, "p1", "battlefield", "Bear Cub")).subtypes).toEqual(expect.arrayContaining(["Bear", "Dragon"]));
    expect(chars(s, idOf(s, "p2", "battlefield", "Serra Angel")).subtypes).not.toContain("Dragon");
  });

  it("Marina Vendrell : les cartes d'enchantement parmi les sept du dessus vont en main, le reste dessous", () => {
    let s = scenario({
      p1: {
        battlefield: ["Plains", "Island", "Swamp", "Mountain", "Forest"],
        hand: ["Marina Vendrell"],
        library: ["Nowhere to Run", "Bear Cub", ROOM, "Forest", "Opt", "Island", "Swamp", "Mountain"],
      },
    });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Marina Vendrell") });
    s = settle(s);
    expect(namesIn(s, s.players.p1?.hand).sort()).toEqual([ROOM, "Nowhere to Run"].sort());
    expect(nameOf(s, s.players.p1?.library[0] as string)).toBe("Mountain");
    expect(s.players.p1?.library).toHaveLength(6);
  });

  it("Marina Vendrell : {T}, en rituel : verrouillez ou déverrouillez une porte d'une de vos Salles", () => {
    let s = scenario({ p1: { battlefield: ["Marina Vendrell", ROOM] } });
    const room = openDoors(s, ROOM, [0]);
    s = activateNth(s, idOf(s, "p1", "battlefield", "Marina Vendrell"), 0, { targets: { r: [room] } });
    let options: string[] = [];
    s = settleAnswering(s, (req) => {
      if (req.type !== "pick") return undefined;
      if (!req.options.includes(`${room}#1`)) return undefined;
      options = req.options;
      return [`${room}#1`];
    });
    expect(options).toHaveLength(2);
    expect(s.objects[room]?.unlocked).toEqual([0, 1]);
  });

  it("Marina Vendrell's Grimoire : lancé, piochez cinq cartes ; un gain de PV fait piocher autant de cartes", () => {
    let s = scenario({
      p1: {
        battlefield: [...lands("Island", 4), ...lands("Swamp", 5)],
        hand: ["Marina Vendrell's Grimoire", "Commune with Evil"],
        library: lands("Forest", 20),
      },
    });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Marina Vendrell's Grimoire") });
    s = settle(s);
    expect(s.players.p1?.hand).toHaveLength(6);
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Commune with Evil") });
    s = settle(s);
    // Commune with Evil : une carte en main, puis 3 PV gagnés, donc trois cartes piochées.
    expect(s.players.p1?.life).toBe(23);
    expect(s.players.p1?.hand).toHaveLength(5 + 1 + 3);
  });

  it("Marina Vendrell's Grimoire : pas de défaite à 0 PV ; une perte de PV fait défausser autant, et sans carte en main vous perdez", () => {
    const run = (hand: string[]) => {
      let s = scenario({ p1: { life: 2, battlefield: ["Marina Vendrell's Grimoire", ...lands("Mountain", 2)], hand } });
      s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Lightning Strike"), targets: { t: ["p1"] } });
      return settle(s);
    };
    const kept = run(["Lightning Strike", "Opt", "Opt", "Opt", "Opt"]);
    expect(kept.players.p1?.life).toBe(-1);
    expect(kept.players.p1?.lost).toBeFalsy();
    expect(kept.players.p1?.hand).toHaveLength(1);
    expect(run(["Lightning Strike", "Opt"]).players.p1?.lost).toBe(true);
  });

  it("Nashi : blessures de combat à un joueur, meulez autant ; les cartes légendaires ou d'enchantement en main, sinon un marqueur +1/+1", () => {
    const run = (library: string[], pick: string[]) => {
      let s = scenario({ p1: { battlefield: ["Nashi, Searcher in the Dark"], library } });
      s = attack(s, [idOf(s, "p1", "battlefield", "Nashi, Searcher in the Dark")]);
      s = throughCombat(s, (req, _p, cur) =>
        req.type === "pick" ? req.options.filter((id) => pick.includes(nameOf(cur, id) as string)) : undefined,
      );
      return s;
    };
    const s = run(["Nowhere to Run", "Bear Cub", "Forest"], ["Nowhere to Run"]);
    expect(s.players.p2?.life).toBe(18);
    expect(namesIn(s, s.players.p1?.hand)).toEqual(["Nowhere to Run"]);
    expect(namesIn(s, s.players.p1?.graveyard)).toEqual(["Bear Cub"]);
    expect(s.objects[idOf(s, "p1", "battlefield", "Nashi, Searcher in the Dark")]?.counters["+1/+1"] ?? 0).toBe(0);
    const t = run(["Forest", "Bear Cub", "Island"], []);
    expect(t.players.p1?.hand).toHaveLength(0);
    expect(t.objects[idOf(t, "p1", "battlefield", "Nashi, Searcher in the Dark")]?.counters["+1/+1"]).toBe(1);
  });

  it("Omnivorous Flytrap : délire, deux marqueurs +1/+1 répartis ; doublés avec six types ; rien sans délire", () => {
    let minTargets: number | undefined;
    const run = (graveyard: string[]) => {
      let s = scenario({ p1: { battlefield: ["Bear Cub", ...lands("Forest", 3)], hand: ["Omnivorous Flytrap"], graveyard } });
      const cub = idOf(s, "p1", "battlefield", "Bear Cub");
      s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Omnivorous Flytrap") });
      s = settleAnswering(s, (req) => {
        if (req.type === "pick" && req.options.includes(cub)) minTargets = req.min;
        return picking([cub])(req);
      });
      return s.objects[cub]?.counters["+1/+1"] ?? 0;
    };
    expect(run([])).toBe(0);
    expect(run(DELIRIUM)).toBe(2);
    expect(run([...DELIRIUM, "Nowhere to Run", "Bear Trap"])).toBe(4);
    // « Une ou deux cibles » : au moins une.
    expect(minTargets).toBe(1);
  });

  it("Peer Past the Veil : défaussez votre main, puis piochez une carte par type de carte de votre cimetière", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Mountain", 2), ...lands("Forest", 2)], hand: ["Peer Past the Veil", "Bear Cub", "Forest"] },
    });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Peer Past the Veil") });
    s = settle(s);
    // Créature et terrain : deux cartes.
    expect(s.players.p1?.hand).toHaveLength(2);
    expect(namesIn(s, s.players.p1?.graveyard).sort()).toEqual(["Bear Cub", "Forest", "Peer Past the Veil"]);
  });

  it("Razorkin Needlehead : l'initiative pendant votre tour seulement ; 1 blessure à l'adversaire qui pioche", () => {
    const mine = scenario({ p1: { battlefield: ["Razorkin Needlehead"] } });
    expect(chars(mine, idOf(mine, "p1", "battlefield", "Razorkin Needlehead")).keywords).toContain("firstStrike");
    const theirs = scenario({ active: "p2", p1: { battlefield: ["Razorkin Needlehead"] } });
    expect(chars(theirs, idOf(theirs, "p1", "battlefield", "Razorkin Needlehead")).keywords).not.toContain("firstStrike");
    let s = scenario({ step: "main2", p1: { battlefield: ["Razorkin Needlehead"] } });
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    expect(s.players.p2?.life).toBe(19);
    s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1");
    expect(s.players.p1?.life).toBe(20);
  });

  it("Reluctant Role Model : survie, un marqueur au choix ; une créature à vous qui meurt avec des marqueurs les donne à une créature", () => {
    let s = scenario({ p1: { battlefield: [{ name: "Reluctant Role Model", tapped: true }] } });
    s = advanceUntil(s, (x) => x.turn.step === "main2" && x.pending?.kind === "choice");
    let modes: string[] = [];
    s = settleAnswering(s, (req) => {
      if (req.type !== "pick" || req.intent !== "triggerMode") return undefined;
      modes = req.options;
      return ["1"];
    });
    expect(modes).toEqual(["0", "1", "2"]);
    expect(s.objects[idOf(s, "p1", "battlefield", "Reluctant Role Model")]?.counters.lifelink).toBe(1);
    let t = scenario({
      p1: {
        battlefield: [
          "Reluctant Role Model",
          { name: "Bear Cub", counters: { "+1/+1": 1 } },
          "Shivan Dragon",
          ...lands("Mountain", 4),
        ],
        hand: ["Lightning Strike", "Lightning Strike"],
      },
    });
    const dragon = idOf(t, "p1", "battlefield", "Shivan Dragon");
    t = act(t, "p1", {
      type: "cast",
      card: idOf(t, "p1", "hand", "Lightning Strike"),
      targets: { t: [idOf(t, "p1", "battlefield", "Bear Cub")] },
    });
    t = settleAnswering(t, picking([dragon]));
    expect(t.objects[dragon]?.counters["+1/+1"]).toBe(1);
    // Une créature sans marqueur : pas de déclenchement.
    t = act(t, "p1", {
      type: "cast",
      card: idOf(t, "p1", "hand", "Lightning Strike"),
      targets: { t: [idOf(t, "p1", "battlefield", "Reluctant Role Model")] },
    });
    t = passUntil(t, (x) => x.stack.length === 0);
    expect(t.pending?.kind).toBe("priority");
    expect(t.stack).toHaveLength(0);
    expect(t.objects[dragon]?.counters["+1/+1"]).toBe(1);
  });

  it("Restricted Office : en la déverrouillant, détruisez toutes les créatures de force 3 ou plus", () => {
    let s = scenario({
      p1: { battlefield: ["Shivan Dragon", "Bear Cub", ...lands("Plains", 4)], hand: ["Restricted Office // Lecture Hall"] },
      p2: { battlefield: ["Serra Angel", "Llanowar Elves"] },
    });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Restricted Office // Lecture Hall"), face: 0 });
    s = settle(s);
    expect(creaturesOf(s, "p1")).toEqual(["Bear Cub"]);
    expect(creaturesOf(s, "p2")).toEqual(["Llanowar Elves"]);
  });

  it("Lecture Hall : vos autres permanents ont la défense talismanique", () => {
    const s = scenario({
      p1: { battlefield: ["Restricted Office // Lecture Hall", "Bear Cub", "Forest"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    const hall = openDoors(s, "Restricted Office // Lecture Hall", [1]);
    expect(chars(s, idOf(s, "p1", "battlefield", "Bear Cub")).keywords).toContain("hexproof");
    expect(chars(s, idOf(s, "p1", "battlefield", "Forest")).keywords).toContain("hexproof");
    expect(chars(s, hall).keywords).not.toContain("hexproof");
    expect(chars(s, idOf(s, "p2", "battlefield", "Serra Angel")).keywords).not.toContain("hexproof");
  });

  it("Rip : survie, révélez autant de cartes que sa force ; créatures et Véhicules en main, le reste dessous", () => {
    let s = scenario({
      p1: {
        battlefield: [{ name: "Rip, Spawn Hunter", tapped: true }],
        library: ["Bear Cub", "Forest", "Hedge Shredder", "Opt", "Shivan Dragon"],
      },
    });
    let offered: string[] = [];
    s = advanceUntil(s, (x) => x.turn.step === "main2" && x.pending?.kind === "choice");
    s = settleAnswering(s, (req, _p, cur) => {
      if (req.type !== "pick") return undefined;
      offered = (namesIn(cur, req.options) as string[]).sort();
      return req.options;
    });
    expect(offered).toEqual(["Bear Cub", "Hedge Shredder"]);
    expect(namesIn(s, s.players.p1?.hand).sort()).toEqual(["Bear Cub", "Hedge Shredder"]);
    expect(nameOf(s, s.players.p1?.library[0] as string)).toBe("Shivan Dragon");
  });

  it("Roaring Furnace : en la déverrouillant, autant de blessures que de cartes dans votre main à une créature adverse", () => {
    let s = scenario({
      p1: { battlefield: lands("Mountain", 2), hand: ["Roaring Furnace // Steaming Sauna", "Opt", "Opt", "Opt"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Roaring Furnace // Steaming Sauna"), face: 0 });
    s = settleAnswering(s, picking([angel]));
    expect(s.objects[angel]?.damage).toBe(3);
  });

  it("Steaming Sauna : pas de taille de main maximale ; piochez une carte à votre étape de fin", () => {
    let s = scenario({ p1: { battlefield: ["Roaring Furnace // Steaming Sauna"], hand: Array(9).fill("Opt") } });
    openDoors(s, "Roaring Furnace // Steaming Sauna", [1]);
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    expect(s.players.p1?.hand).toHaveLength(10);
  });
});

describe("Duskmourn, lot K8 : rares (3)", () => {
  it("Silent Hallcreeper : imblocable ; à chaque blessure de combat à un joueur, un mode pas encore choisi", () => {
    let s = scenario({ p1: { battlefield: ["Silent Hallcreeper", "Bear Cub"] }, p2: { battlefield: ["Serra Angel"] } });
    const creeper = idOf(s, "p1", "battlefield", "Silent Hallcreeper");
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    expect(chars(s, creeper).keywords).toContain("unblockable");
    s = attack(s, [creeper]);
    s = throughCombat(s, (req) => (req.type === "pick" && req.intent === "triggerMode" ? ["0"] : undefined));
    expect(s.objects[creeper]?.counters["+1/+1"]).toBe(2);
    s = advanceUntil(s, (x) => x.turn.active === "p1" && x.pending?.kind === "declareAttackers");
    s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: creeper, defender: "p2" }] });
    let modes: string[] = [];
    s = throughCombat(s, (req) => {
      if (req.type === "pick" && req.intent === "triggerMode") {
        modes = req.options;
        return ["2"];
      }
      return picking([cub])(req);
    });
    // Le premier mode a déjà été choisi ; le troisième : il devient une copie de Bear Cub.
    expect(modes).toEqual(["1", "2"]);
    expect(chars(s, creeper).name).toBe("Bear Cub");
  });

  it("The Jolly Balloon Man : {1}, {T} : un jeton copie 1/1 rouge Ballon volant et à célérité, sacrifié à l'étape de fin", () => {
    let s = scenario({ p1: { battlefield: ["The Jolly Balloon Man", "Serra Angel", "Mountain"] } });
    const man = idOf(s, "p1", "battlefield", "The Jolly Balloon Man");
    const angel = idOf(s, "p1", "battlefield", "Serra Angel");
    expect(() => activateNth(s, man, 0, { targets: { t: [man] } })).toThrow();
    s = activateNth(s, man, 0, { targets: { t: [angel] } });
    s = settle(s);
    const token = idsOf(s, "p1", "battlefield", "Serra Angel").find((id) => id !== angel) as string;
    const c = chars(s, token);
    expect([c.power, c.toughness]).toEqual([1, 1]);
    expect(c.colors.sort()).toEqual(["R", "W"]);
    expect(c.subtypes).toEqual(expect.arrayContaining(["Angel", "Balloon"]));
    expect(c.keywords).toEqual(expect.arrayContaining(["flying", "haste", "vigilance"]));
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(s.objects[token]).toBeUndefined();
    expect(idsOf(s, "p1", "battlefield", "Serra Angel")).toEqual([angel]);
  });

  it("The Swarmweaver : deux Insectes 1/1 noir et vert volants ; délire, Insectes et Araignées +1/+1 et contact mortel", () => {
    let s = scenario({ p1: { battlefield: [...lands("Swamp", 2), ...lands("Forest", 2)], hand: ["The Swarmweaver"] } });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "The Swarmweaver") });
    s = settle(s);
    const insects = idsOf(s, "p1", "battlefield", "Insect");
    expect(insects).toHaveLength(2);
    const c = chars(s, insects[0] as string);
    expect([c.power, c.toughness]).toEqual([1, 1]);
    expect(c.colors.sort()).toEqual(["B", "G"]);
    expect(c.keywords).toContain("flying");
    const t = scenario({
      p1: { battlefield: ["The Swarmweaver", "Twitching Doll", "Bear Cub"], graveyard: DELIRIUM },
      p2: { battlefield: ["Twitching Doll"] },
    });
    const doll = chars(t, idOf(t, "p1", "battlefield", "Twitching Doll"));
    expect([doll.power, doll.keywords.includes("deathtouch")]).toEqual([3, true]);
    expect(chars(t, idOf(t, "p1", "battlefield", "Bear Cub")).power).toBe(2);
    expect(chars(t, idOf(t, "p2", "battlefield", "Twitching Doll")).power).toBe(2);
  });

  it("The Tale of Tamiyo (I à III) : meulez deux cartes ; si elles partagent un type, piochez et recommencez", () => {
    let s = scenario({
      p1: {
        battlefield: lands("Island", 3),
        hand: ["The Tale of Tamiyo"],
        library: ["Forest", "Forest", "Island", "Opt", "Bear Cub", "Swamp"],
      },
    });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "The Tale of Tamiyo") });
    s = settle(s);
    expect(namesIn(s, s.players.p1?.graveyard).sort()).toEqual(["Bear Cub", "Forest", "Forest", "Opt"]);
    expect(namesIn(s, s.players.p1?.hand)).toEqual(["Island"]);
  });

  it("The Tale of Tamiyo (IV) : exilez des éphémères et rituels de votre cimetière, et lancez leurs copies", () => {
    let s = scenario({
      active: "p2",
      step: "main2",
      p1: { battlefield: [{ name: "The Tale of Tamiyo", counters: { lore: 3 } }], graveyard: ["Lightning Strike", "Bear Cub"] },
    });
    const strike = idOf(s, "p1", "graveyard", "Lightning Strike");
    s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.pending?.kind === "choice");
    const req = s.pending?.kind === "choice" ? s.pending.request : undefined;
    // Bear Cub (créature) n'est pas une cible.
    expect(req?.type === "pick" && req.options).toEqual([strike]);
    s = act(s, "p1", { type: "choose", values: [strike] });
    s = untilCastNow(s);
    const copy = castNowOf(s)?.cards[0] as string;
    s = act(s, "p1", { type: "cast", card: copy, targets: { t: ["p2"] } });
    s = settle(s);
    expect(s.players.p2?.life).toBe(17);
    expect(s.exile.some((id) => nameOf(s, id) === "Lightning Strike")).toBe(true);
  });

  it("Thornspire Verge : {R} toujours, {G} seulement avec une Montagne ou une Forêt", () => {
    const colors = (battlefield: string[]) => {
      const s = scenario({ p1: { battlefield } });
      const v = idOf(s, "p1", "battlefield", "Thornspire Verge");
      return legalActions(s, "p1").flatMap((a) => (a.type === "tapForMana" && a.source === v ? a.colors : []));
    };
    expect(colors(["Thornspire Verge"])).toEqual(["R"]);
    expect(colors(["Thornspire Verge", "Plains"])).toEqual(["R"]);
    expect(colors(["Thornspire Verge", "Mountain"])).toEqual(["R", "G"]);
    expect(colors(["Thornspire Verge", "Forest"])).toEqual(["R", "G"]);
  });

  it("Toby : une Bête 4/4 qui ne peut ni attaquer ni bloquer seule ; avec quatre jetons de créature, vos jetons ont le vol", () => {
    let s = scenario({
      p1: {
        battlefield: [...lands("Plains", 6), ...lands("Mountain", 4)],
        hand: ["Toby, Beastie Befriender", "Midnight Mayhem"],
      },
    });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Toby, Beastie Befriender") });
    s = settle(s);
    const beast = idOf(s, "p1", "battlefield", "Beast");
    expect(chars(s, beast)).toMatchObject({ power: 4, toughness: 4, colors: ["W"] });
    expect(chars(s, beast).keywords).not.toContain("flying");
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Midnight Mayhem") });
    s = settle(s);
    expect(chars(s, beast).keywords).toContain("flying");
    expect(chars(s, idOf(s, "p1", "battlefield", "Toby, Beastie Befriender")).keywords).not.toContain("flying");
    s = advanceUntil(s, (x) => x.turn.number > 3 && x.turn.active === "p1" && x.pending?.kind === "declareAttackers");
    expect(() => act(s, "p1", { type: "declareAttackers", attackers: [{ id: beast, defender: "p2" }] })).toThrow();
    const gremlin = idOf(s, "p1", "battlefield", "Gremlin");
    s = act(s, "p1", {
      type: "declareAttackers",
      attackers: [
        { id: beast, defender: "p2" },
        { id: gremlin, defender: "p2" },
      ],
    });
    expect(s.combat?.attackers).toHaveLength(2);
  });

  it("Twitching Doll : son mana ajoute un marqueur de nid ; {T}, sacrifice : une Araignée 2/2 avec la portée par marqueur", () => {
    let s = scenario({ p1: { battlefield: ["Twitching Doll"] } });
    const doll = idOf(s, "p1", "battlefield", "Twitching Doll");
    s = act(s, "p1", { type: "tapForMana", source: doll, ability: 0, color: "U" });
    expect(s.players.p1?.manaPool.U).toBe(1);
    expect(s.objects[doll]?.counters.nest).toBe(1);
    let t = scenario({ p1: { battlefield: [{ name: "Twitching Doll", counters: { nest: 3 } }] } });
    t = activateNth(t, idOf(t, "p1", "battlefield", "Twitching Doll"));
    t = settle(t);
    const spiders = idsOf(t, "p1", "battlefield", "Spider");
    expect(spiders).toHaveLength(3);
    expect(chars(t, spiders[0] as string)).toMatchObject({ power: 2, toughness: 2, colors: ["G"] });
    expect(chars(t, spiders[0] as string).keywords).toContain("reach");
  });

  it("Undead Sprinter : lançable depuis le cimetière si une créature non-Zombie est morte ce tour-ci, avec un marqueur +1/+1", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Mountain", 3), "Swamp"], hand: ["Lightning Strike"], graveyard: ["Undead Sprinter"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    const sprinter = idOf(s, "p1", "graveyard", "Undead Sprinter");
    expect(castable(s, "p1", sprinter)).toBe(false);
    s = act(s, "p1", {
      type: "cast",
      card: idOf(s, "p1", "hand", "Lightning Strike"),
      targets: { t: [idOf(s, "p2", "battlefield", "Bear Cub")] },
    });
    s = settle(s);
    expect(castable(s, "p1", sprinter)).toBe(true);
    s = act(s, "p1", { type: "cast", card: sprinter });
    s = settle(s);
    const id = idOf(s, "p1", "battlefield", "Undead Sprinter");
    expect(s.objects[id]?.counters["+1/+1"]).toBe(1);
    expect(chars(s, id).keywords).toEqual(expect.arrayContaining(["trample", "haste"]));
    // Un Zombie qui meurt ne suffit pas.
    let t = scenario({
      p1: { battlefield: lands("Mountain", 2), hand: ["Lightning Strike"], graveyard: ["Undead Sprinter"] },
      p2: { battlefield: ["Unstoppable Slasher"] },
    });
    t = act(t, "p1", {
      type: "cast",
      card: idOf(t, "p1", "hand", "Lightning Strike"),
      targets: { t: [idOf(t, "p2", "battlefield", "Unstoppable Slasher")] },
    });
    t = settle(t);
    expect(castable(t, "p1", idOf(t, "p1", "graveyard", "Undead Sprinter"))).toBe(false);
  });

  it("Unstoppable Slasher : le joueur blessé perd la moitié de ses PV ; mort sans marqueur, elle revient engagée avec deux marqueurs d'étourdissement", () => {
    let s = scenario({ p1: { battlefield: ["Unstoppable Slasher"] } });
    s = attack(s, [idOf(s, "p1", "battlefield", "Unstoppable Slasher")]);
    s = throughCombat(s);
    // 20 − 2 = 18, puis la moitié arrondie à l'unité supérieure (9).
    expect(s.players.p2?.life).toBe(9);
    let t = scenario({
      p1: { battlefield: ["Unstoppable Slasher", ...lands("Mountain", 4)], hand: ["Lightning Strike", "Lightning Strike"] },
    });
    t = act(t, "p1", {
      type: "cast",
      card: idOf(t, "p1", "hand", "Lightning Strike"),
      targets: { t: [idOf(t, "p1", "battlefield", "Unstoppable Slasher")] },
    });
    t = settle(t);
    const back = idOf(t, "p1", "battlefield", "Unstoppable Slasher");
    expect(t.objects[back]?.tapped).toBe(true);
    expect(t.objects[back]?.counters.stun).toBe(2);
    // Avec des marqueurs, elle reste au cimetière.
    t = act(t, "p1", { type: "cast", card: idOf(t, "p1", "hand", "Lightning Strike"), targets: { t: [back] } });
    t = settle(t);
    expect(idsOf(t, "p1", "battlefield", "Unstoppable Slasher")).toHaveLength(0);
    expect(namesIn(t, t.players.p1?.graveyard)).toContain("Unstoppable Slasher");
  });

  it("Valgavoth's Lair : défense talismanique, arrive engagé, produit le mana de la couleur choisie", () => {
    let s = scenario({ p1: { hand: ["Valgavoth's Lair"] } });
    const card = idOf(s, "p1", "hand", "Valgavoth's Lair");
    const opt = legalActions(s, "p1").find((a) => a.type === "playLand" && a.card === card);
    expect(opt?.type === "playLand" && opt.choose?.type === "pick" && opt.choose.options).toEqual(
      expect.arrayContaining(["W", "U", "B", "R", "G"]),
    );
    s = act(s, "p1", { type: "playLand", card, chosen: "B" });
    const lair = idOf(s, "p1", "battlefield", "Valgavoth's Lair");
    expect(s.objects[lair]?.tapped).toBe(true);
    expect(chars(s, lair).keywords).toContain("hexproof");
    const o = s.objects[lair];
    if (o) o.tapped = false;
    expect(legalActions(s, "p1").flatMap((a) => (a.type === "tapForMana" && a.source === lair ? a.colors : []))).toEqual(["B"]);
  });

  it("Valgavoth's Onslaught : manifestez l'effroi X fois, puis X marqueurs +1/+1 sur chacune de ces créatures", () => {
    let s = scenario({ p1: { battlefield: lands("Forest", 5), hand: ["Valgavoth's Onslaught"] } });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Valgavoth's Onslaught"), x: 2 });
    s = settle(s);
    const hidden = faceDownOf(s, "p1");
    expect(hidden).toHaveLength(2);
    for (const id of hidden) expect(chars(s, id)).toMatchObject({ power: 4, toughness: 4 });
    expect(s.players.p1?.graveyard).toHaveLength(3);
  });

  it("Victor : sinistre, surveillance 2 la première fois, défausse adverse la deuxième, réanimation la troisième", () => {
    let s = scenario({
      p1: { battlefield: ["Victor, Valgavoth's Seneschal", ...lands("Swamp", 8)], hand: Array(4).fill("Nowhere to Run") },
      p2: { battlefield: ["Shivan Dragon"], hand: ["Opt", "Opt"], graveyard: ["Serra Angel"] },
    });
    const castOne = (x: S) => settle(act(x, "p1", { type: "cast", card: idOf(x, "p1", "hand", "Nowhere to Run") }));
    s = castOne(s);
    expect(s.players.p2?.hand).toHaveLength(2);
    s = castOne(s);
    expect(s.players.p2?.hand).toHaveLength(1);
    s = castOne(s);
    expect(creaturesOf(s, "p1")).toEqual(["Serra Angel", "Victor, Valgavoth's Seneschal"]);
    // La quatrième fois, rien.
    s = castOne(s);
    expect(s.players.p2?.hand).toHaveLength(1);
  });

  it("Waltz of Rage : votre créature blesse chaque autre créature de sa force ; vos créatures qui meurent ce tour-ci exilent une carte jouable", () => {
    let s = scenario({
      p1: {
        battlefield: ["Shivan Dragon", "Bear Cub", ...lands("Mountain", 5)],
        hand: ["Waltz of Rage"],
        library: ["Forest", "Island"],
      },
      p2: { battlefield: ["Serra Angel"] },
    });
    const dragon = idOf(s, "p1", "battlefield", "Shivan Dragon");
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Waltz of Rage"), targets: { t: [dragon] } });
    s = settle(s);
    expect(creaturesOf(s, "p1")).toEqual(["Shivan Dragon"]);
    expect(creaturesOf(s, "p2")).toEqual([]);
    expect(s.objects[dragon]?.damage).toBe(0);
    // Bear Cub (à vous) est mort : une carte exilée, jouable ; pas pour l'Ange adverse.
    const forest = s.exile.find((id) => nameOf(s, id) === "Forest") as string;
    expect(forest).toBeDefined();
    expect(s.exile.some((id) => nameOf(s, id) === "Island")).toBe(false);
    expect(legalActions(s, "p1").some((a) => a.type === "playLand" && a.card === forest)).toBe(true);
  });

  it("Winter : chaque joueur pioche deux cartes à votre entretien ; délire, la main maximale adverse est 7 moins le nombre de types", () => {
    let s = scenario({ active: "p2", step: "main2", p1: { battlefield: ["Winter, Misanthropic Guide"] } });
    s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1");
    expect(s.players.p1?.hand).toHaveLength(3);
    expect(s.players.p2?.hand).toHaveLength(2);
    let t = scenario({
      active: "p2",
      step: "main2",
      p1: { battlefield: ["Winter, Misanthropic Guide"], graveyard: DELIRIUM },
      p2: { hand: Array(6).fill("Opt") },
    });
    t = passUntil(t, (x) => x.pending?.kind === "discard" || x.turn.active === "p1");
    expect(t.pending?.kind === "discard" && t.pending.count).toBe(3);
  });

  it("Zimone : à votre étape de fin, si un terrain est arrivé ce tour-ci et que vous contrôlez un nombre premier de terrains, Primo", () => {
    const run = (battlefield: string[], play: boolean) => {
      let s = scenario({ p1: { battlefield: ["Zimone, All-Questioning", ...battlefield], hand: ["Forest"] } });
      if (play) s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Forest") });
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      const primo = idsOf(s, "p1", "battlefield", "Primo, the Indivisible");
      return primo.length === 0 ? null : chars(s, primo[0] as string);
    };
    const primo = run(lands("Forest", 2), true);
    expect(primo).toMatchObject({ power: 3, toughness: 3 });
    expect(primo?.colors.sort()).toEqual(["G", "U"]);
    expect(primo?.supertypes).toContain("Legendary");
    expect(run(lands("Forest", 3), true)).toBeNull();
    expect(run(lands("Forest", 3), false)).toBeNull();
  });
});

describe("Duskmourn, lot K8 : peu communes (1)", () => {
  it("Altanak : ciblé par un adversaire, piochez (pas par vous) ; {1}{G}, défaussez-le : un terrain du cimetière revient engagé", () => {
    let s = scenario({
      active: "p2",
      p1: { battlefield: ["Altanak, the Thrice-Called"] },
      p2: { battlefield: lands("Mountain", 2), hand: ["Lightning Strike"] },
    });
    const altanak = idOf(s, "p1", "battlefield", "Altanak, the Thrice-Called");
    s = act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Lightning Strike"), targets: { t: [altanak] } });
    s = settle(s);
    expect(s.players.p1?.hand).toHaveLength(1);
    expect(chars(s, altanak).keywords).toContain("trample");
    let t = scenario({
      p1: { battlefield: ["Altanak, the Thrice-Called", ...lands("Swamp", 2)], hand: ["Give In to Violence"] },
    });
    t = act(t, "p1", {
      type: "cast",
      card: idOf(t, "p1", "hand", "Give In to Violence"),
      targets: { t: [idOf(t, "p1", "battlefield", "Altanak, the Thrice-Called")] },
    });
    t = settle(t);
    expect(t.players.p1?.hand).toHaveLength(0);
    // Depuis la main.
    let u = scenario({
      p1: { battlefield: ["Forest", "Swamp"], hand: ["Altanak, the Thrice-Called"], graveyard: ["Plains", "Bear Cub"] },
    });
    const card = idOf(u, "p1", "hand", "Altanak, the Thrice-Called");
    u = activateNth(u, card, 0, { targets: { t: [idOf(u, "p1", "graveyard", "Plains")] } });
    u = settle(u);
    expect(u.objects[idOf(u, "p1", "battlefield", "Plains")]?.tapped).toBe(true);
    expect(namesIn(u, u.players.p1?.graveyard).sort()).toEqual(["Altanak, the Thrice-Called", "Bear Cub"]);
  });

  it("Arabella : en attaquant, X blessures à chaque adversaire et X PV, X le nombre de vos créatures de force 2 ou moins", () => {
    let s = scenario({ p1: { battlefield: ["Arabella, Abandoned Doll", "Bear Cub", "Shivan Dragon"] } });
    s = attack(s, [idOf(s, "p1", "battlefield", "Arabella, Abandoned Doll")]);
    s = settleNoBlocks(s);
    expect(s.players.p2?.life).toBe(18);
    expect(s.players.p1?.life).toBe(22);
  });

  it("Attack-in-the-Box : en attaquant, +4/+0 si vous le voulez, et elle est alors sacrifiée à la prochaine étape de fin", () => {
    const run = (yes: boolean) => {
      let s = scenario({ p1: { battlefield: ["Attack-in-the-Box"] } });
      const box = idOf(s, "p1", "battlefield", "Attack-in-the-Box");
      s = attack(s, [box]);
      s = settleNoBlocks(s, answering({ yes }));
      const power = chars(s, box).power;
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      return [power, s.objects[box] !== undefined];
    };
    expect(run(true)).toEqual([6, false]);
    expect(run(false)).toEqual([2, true]);
  });

  it("Baseball Bat : attachée en arrivant (+1/+1) ; quand la créature équipée attaque, engagez jusqu'à une créature", () => {
    let s = scenario({
      p1: { battlefield: ["Bear Cub", "Forest", "Plains"], hand: ["Baseball Bat"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Baseball Bat") });
    s = settleAnswering(s, picking([cub]));
    expect(s.objects[idOf(s, "p1", "battlefield", "Baseball Bat")]?.attachedTo).toBe(cub);
    expect(chars(s, cub)).toMatchObject({ power: 3, toughness: 3 });
    s = attack(s, [cub]);
    s = settleNoBlocks(s, picking([angel]));
    expect(s.objects[angel]?.tapped).toBe(true);
  });

  it("Beastie Beatdown : votre créature blesse la créature adverse de sa force ; délire, deux marqueurs +1/+1 d'abord", () => {
    const run = (graveyard: string[]) => {
      let s = scenario({
        p1: { battlefield: ["Bear Cub", "Mountain", "Forest"], hand: ["Beastie Beatdown"], graveyard },
        p2: { battlefield: ["Serra Angel"] },
      });
      const cub = idOf(s, "p1", "battlefield", "Bear Cub");
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Beastie Beatdown"), targets: { a: [cub], t: [angel] } });
      s = settle(s);
      return [s.objects[cub]?.counters["+1/+1"] ?? 0, s.objects[angel]?.damage ?? "morte"];
    };
    expect(run([])).toEqual([0, 2]);
    expect(run(DELIRIUM)).toEqual([2, "morte"]);
  });

  it("Betrayer's Bargain : sacrifiez une créature ou un enchantement, ou payez {2} ; 5 blessures, et la créature est exilée si elle meurt", () => {
    let s = scenario({
      p1: { battlefield: lands("Mountain", 4), hand: ["Betrayer's Bargain"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    s = act(s, "p1", {
      type: "cast",
      card: idOf(s, "p1", "hand", "Betrayer's Bargain"),
      sacrifice: [],
      targets: { t: [idOf(s, "p2", "battlefield", "Serra Angel")] },
    });
    s = settle(s);
    expect(s.exile.some((id) => nameOf(s, id) === "Serra Angel")).toBe(true);
    expect(s.players.p2?.graveyard).toHaveLength(0);
    expect(s.battlefield.filter((id) => s.objects[id]?.tapped)).toHaveLength(4);
    // En sacrifiant une créature : {1}{R} seulement.
    let t = scenario({
      p1: { battlefield: ["Bear Cub", ...lands("Mountain", 2)], hand: ["Betrayer's Bargain"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    const cub = idOf(t, "p1", "battlefield", "Bear Cub");
    t = act(t, "p1", {
      type: "cast",
      card: idOf(t, "p1", "hand", "Betrayer's Bargain"),
      sacrifice: [cub],
      targets: { t: [idOf(t, "p2", "battlefield", "Serra Angel")] },
    });
    t = settle(t);
    expect(t.objects[cub]).toBeUndefined();
    expect(t.exile.some((id) => nameOf(t, id) === "Serra Angel")).toBe(true);
  });

  it("Break Down the Door : exilez un artefact, ou un enchantement, ou manifestez l'effroi", () => {
    let s = scenario({
      p1: { battlefield: lands("Forest", 3), hand: ["Break Down the Door"] },
      p2: { battlefield: ["Bear Trap", "Nowhere to Run"] },
    });
    const trap = idOf(s, "p2", "battlefield", "Bear Trap");
    expect(() =>
      act(s, "p1", {
        type: "cast",
        card: idOf(s, "p1", "hand", "Break Down the Door"),
        mode: 0,
        targets: { a: [idOf(s, "p2", "battlefield", "Nowhere to Run")] },
      }),
    ).toThrow();
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Break Down the Door"), mode: 0, targets: { a: [trap] } });
    s = settle(s);
    expect(s.exile.some((id) => nameOf(s, id) === "Bear Trap")).toBe(true);
    let t = scenario({ p1: { battlefield: lands("Forest", 3), hand: ["Break Down the Door"] } });
    t = act(t, "p1", { type: "cast", card: idOf(t, "p1", "hand", "Break Down the Door"), mode: 2 });
    t = settle(t);
    expect(faceDownOf(t, "p1")).toHaveLength(1);
  });

  it("Broodspinner : portée, surveillance 2 en arrivant ; {4}{B}{G}, {T}, sacrifice : un Insecte volant par type de carte au cimetière", () => {
    let s = scenario({
      p1: {
        battlefield: ["Broodspinner", ...lands("Swamp", 3), ...lands("Forest", 3)],
        graveyard: ["Opt", "Forest", "Pyroclasm"],
      },
    });
    expect(chars(s, idOf(s, "p1", "battlefield", "Broodspinner")).keywords).toContain("reach");
    s = activateNth(s, idOf(s, "p1", "battlefield", "Broodspinner"));
    s = settle(s);
    // Broodspinner, sacrifiée, est au cimetière à la résolution : quatre types.
    const insects = idsOf(s, "p1", "battlefield", "Insect");
    expect(insects).toHaveLength(4);
    expect(chars(s, insects[0] as string).keywords).toContain("flying");
  });

  it("Cathartic Parting : l'artefact ou l'enchantement adverse et jusqu'à quatre cartes de votre cimetière sont mélangés dans les bibliothèques", () => {
    let s = scenario({
      p1: { battlefield: lands("Forest", 2), hand: ["Cathartic Parting"], graveyard: ["Bear Cub", "Opt"], library: [] },
      p2: { battlefield: ["Bear Trap"], library: [], graveyard: ["Opt"] },
    });
    expect(() =>
      act(s, "p1", {
        type: "cast",
        card: idOf(s, "p1", "hand", "Cathartic Parting"),
        targets: { t: [idOf(s, "p2", "battlefield", "Bear Trap")], g: s.players.p2?.graveyard ?? [] },
      }),
    ).toThrow();
    s = act(s, "p1", {
      type: "cast",
      card: idOf(s, "p1", "hand", "Cathartic Parting"),
      targets: { t: [idOf(s, "p2", "battlefield", "Bear Trap")], g: s.players.p1?.graveyard ?? [] },
    });
    s = settle(s);
    expect(namesIn(s, s.players.p2?.library)).toEqual(["Bear Trap"]);
    expect(namesIn(s, s.players.p1?.library).sort()).toEqual(["Bear Cub", "Opt"]);
  });

  it("Conductive Machete, Cursed Windbreaker, Killer's Mask : manifestez l'effroi et attachez-y l'Équipement", () => {
    const run = (name: string, mana: string[]) => {
      let s = scenario({ p1: { battlefield: mana, hand: [name] } });
      s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", name) });
      s = settle(s);
      const [hidden] = faceDownOf(s, "p1") as [string];
      expect(s.objects[idOf(s, "p1", "battlefield", name)]?.attachedTo, name).toBe(hidden);
      return chars(s, hidden);
    };
    expect(run("Conductive Machete", lands("Forest", 4))).toMatchObject({ power: 4, toughness: 3 });
    expect(run("Cursed Windbreaker", lands("Island", 3)).keywords).toContain("flying");
    expect(run("Killer's Mask", lands("Swamp", 3)).keywords).toContain("menace");
  });

  it("Coordinated Clobbering : engagez une ou deux de vos créatures dégagées ; chacune blesse la créature adverse de sa force", () => {
    let s = scenario({
      p1: {
        battlefield: ["Bear Cub", "Llanowar Elves", { name: "Shivan Dragon", tapped: true }, "Forest"],
        hand: ["Coordinated Clobbering"],
      },
      p2: { battlefield: ["Serra Angel"] },
    });
    const ids = [idOf(s, "p1", "battlefield", "Bear Cub"), idOf(s, "p1", "battlefield", "Llanowar Elves")];
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    const card = idOf(s, "p1", "hand", "Coordinated Clobbering");
    expect(() =>
      act(s, "p1", { type: "cast", card, targets: { a: [idOf(s, "p1", "battlefield", "Shivan Dragon")], t: [angel] } }),
    ).toThrow();
    // « Une ou deux » : au moins une créature.
    expect(() => act(s, "p1", { type: "cast", card, targets: { a: [], t: [angel] } })).toThrow();
    s = act(s, "p1", { type: "cast", card, targets: { a: ids, t: [angel] } });
    s = settle(s);
    expect(s.objects[angel]?.damage).toBe(3);
    expect(ids.every((id) => s.objects[id]?.tapped)).toBe(true);
  });

  it("Cynical Loner : imblocable par les Lueurs ; survie, cherchez une carte et mettez-la au cimetière", () => {
    let s = scenario({ p1: { battlefield: ["Cynical Loner"] }, p2: { battlefield: ["Lionheart Glimmer", "Bear Cub"] } });
    const loner = idOf(s, "p1", "battlefield", "Cynical Loner");
    s = attack(s, [loner]);
    s = passUntil(s, (x) => x.pending?.kind === "declareBlockers");
    expect(() =>
      act(s, "p2", {
        type: "declareBlockers",
        blocks: [{ blocker: idOf(s, "p2", "battlefield", "Lionheart Glimmer"), attacker: loner }],
      }),
    ).toThrow();
    s = act(s, "p2", {
      type: "declareBlockers",
      blocks: [{ blocker: idOf(s, "p2", "battlefield", "Bear Cub"), attacker: loner }],
    });
    let t = scenario({
      p1: { battlefield: [{ name: "Cynical Loner", tapped: true }], library: ["Forest", "Shivan Dragon", "Island"] },
    });
    t = advanceUntil(t, (x) => x.turn.step === "main2" && x.pending?.kind === "choice");
    t = settleAnswering(t, (req, _p, cur) => (req.type === "yesNo" ? [1] : pickNamed(cur, req, "Shivan Dragon")));
    expect(namesIn(t, t.players.p1?.graveyard)).toEqual(["Shivan Dragon"]);
  });

  it("Dashing Bloodsucker : sinistre, +2/+0 et le lien de vie jusqu'à la fin du tour", () => {
    let s = scenario({
      p1: { battlefield: ["Dashing Bloodsucker", ...lands("Swamp", 2)], hand: ["Nowhere to Run"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    const sucker = idOf(s, "p1", "battlefield", "Dashing Bloodsucker");
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Nowhere to Run") });
    s = settle(s);
    expect(chars(s, sucker)).toMatchObject({ power: 4, toughness: 5 });
    expect(chars(s, sucker).keywords).toContain("lifelink");
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(chars(s, sucker).power).toBe(2);
  });

  it("Defiant Survivor : survie, manifestez l'effroi", () => {
    let s = scenario({ p1: { battlefield: [{ name: "Defiant Survivor", tapped: true }] } });
    s = advanceUntil(
      s,
      (x) => x.turn.step === "main2" && x.stack.length === 0 && x.triggers.length === 0 && x.pending?.kind === "priority",
    );
    expect(faceDownOf(s, "p1")).toHaveLength(1);
  });

  it("Defiled Crypt : une fois par tour, quand des cartes quittent votre cimetière, une Horreur 2/2 ; Cadaver Lab rend une créature en main", () => {
    let s = scenario({
      p1: { battlefield: ["Defiled Crypt // Cadaver Lab", "Ghost Vacuum", "Swamp"], graveyard: ["Bear Cub", "Opt"] },
    });
    const room = openDoors(s, "Defiled Crypt // Cadaver Lab", [0]);
    s = unlock(s, room);
    s = settleAnswering(s, (req, _p, cur) => pickNamed(cur, req, "Bear Cub"));
    expect(namesIn(s, s.players.p1?.hand)).toEqual(["Bear Cub"]);
    const horror = idOf(s, "p1", "battlefield", "Horror");
    expect(chars(s, horror)).toMatchObject({ power: 2, toughness: 2, colors: ["B"] });
    expect(chars(s, horror).types).toEqual(expect.arrayContaining(["Enchantment", "Creature"]));
    // Une deuxième fois ce tour-ci : pas de jeton.
    s = activateNth(s, idOf(s, "p1", "battlefield", "Ghost Vacuum"), 0, { targets: { t: [idOf(s, "p1", "graveyard", "Opt")] } });
    s = settle(s);
    expect(idsOf(s, "p1", "battlefield", "Horror")).toHaveLength(1);
  });

  it("Disturbing Mirth : sacrifiez un autre enchantement ou une créature pour piocher deux cartes ; sacrifiée, elle manifeste l'effroi", () => {
    let s = scenario({ p1: { battlefield: ["Bear Cub", "Swamp", "Mountain"], hand: ["Disturbing Mirth"] } });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Disturbing Mirth") });
    s = settleAnswering(s, (req, _p, cur) => pickNamed(cur, req, "Bear Cub"));
    expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(0);
    expect(s.players.p1?.hand).toHaveLength(2);
    // Popular Egotist la sacrifie : manifestation effroyable, et l'Égotiste draine 1.
    let t = scenario({ p1: { battlefield: ["Disturbing Mirth", "Popular Egotist", ...lands("Swamp", 2)] } });
    t = activateNth(t, idOf(t, "p1", "battlefield", "Popular Egotist"), 0, {
      sacrifice: [idOf(t, "p1", "battlefield", "Disturbing Mirth")],
    });
    t = settleAnswering(t, picking(["p2"]));
    expect(faceDownOf(t, "p1")).toHaveLength(1);
    expect(t.players.p2?.life).toBe(19);
    expect(t.players.p1?.life).toBe(21);
  });

  it("Diversion Specialist : {1}, sacrifiez une autre créature ou un enchantement : la carte du dessus est exilée, jouable ce tour-ci", () => {
    let s = scenario({ p1: { battlefield: ["Diversion Specialist", "Bear Cub", "Mountain"], library: ["Forest", "Island"] } });
    expect(chars(s, idOf(s, "p1", "battlefield", "Diversion Specialist")).keywords).toContain("menace");
    s = activateNth(s, idOf(s, "p1", "battlefield", "Diversion Specialist"), 0, {
      sacrifice: [idOf(s, "p1", "battlefield", "Bear Cub")],
    });
    s = settle(s);
    const forest = s.exile.find((id) => nameOf(s, id) === "Forest") as string;
    expect(legalActions(s, "p1").some((a) => a.type === "playLand" && a.card === forest)).toBe(true);
  });

  it("Drag to the Roots : détruit un permanent non-terrain ; {2} de moins avec le délire", () => {
    const hand = { battlefield: ["Swamp", "Forest"], hand: ["Drag to the Roots"] };
    const without = scenario({ p1: hand, p2: { battlefield: ["Bear Trap"] } });
    expect(castable(without, "p1", idOf(without, "p1", "hand", "Drag to the Roots"))).toBe(false);
    let s = scenario({ p1: { ...hand, graveyard: DELIRIUM }, p2: { battlefield: ["Bear Trap", "Forest"] } });
    expect(() =>
      act(s, "p1", {
        type: "cast",
        card: idOf(s, "p1", "hand", "Drag to the Roots"),
        targets: { t: [idOf(s, "p2", "battlefield", "Forest")] },
      }),
    ).toThrow();
    s = act(s, "p1", {
      type: "cast",
      card: idOf(s, "p1", "hand", "Drag to the Roots"),
      targets: { t: [idOf(s, "p2", "battlefield", "Bear Trap")] },
    });
    s = settle(s);
    expect(namesIn(s, s.players.p2?.graveyard)).toEqual(["Bear Trap"]);
  });

  it("Duskmourn's Domination : vous contrôlez la créature enchantée, qui a -3/-0 et perd toutes ses capacités", () => {
    let s = scenario({
      p1: { battlefield: lands("Island", 6), hand: ["Duskmourn's Domination"] },
      p2: { battlefield: ["Shivan Dragon"] },
    });
    const dragon = idOf(s, "p2", "battlefield", "Shivan Dragon");
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Duskmourn's Domination"), targets: { enchant: [dragon] } });
    s = settle(s);
    const c = chars(s, dragon);
    expect(c.controller).toBe("p1");
    expect([c.power, c.toughness]).toEqual([2, 5]);
    expect(c.keywords).not.toContain("flying");
    expect(c.abilities).toHaveLength(0);
  });
});

describe("Duskmourn, lot K8 : peu communes (2)", () => {
  it("Ethereal Armor : +1/+1 par enchantement que vous contrôlez, et l'initiative", () => {
    let s = scenario({
      p1: { battlefield: ["Bear Cub", "Nowhere to Run", "Plains"], hand: ["Ethereal Armor"] },
      p2: { battlefield: ["Nowhere to Run"] },
    });
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Ethereal Armor"), targets: { enchant: [cub] } });
    s = settle(s);
    expect(chars(s, cub)).toMatchObject({ power: 4, toughness: 4 });
    expect(chars(s, cub).keywords).toContain("firstStrike");
  });

  it("Exorcise : exile un artefact, un enchantement ou une créature de force 4 ou plus (pas une petite créature)", () => {
    let s = scenario({
      p1: { battlefield: lands("Plains", 2), hand: ["Exorcise"] },
      p2: { battlefield: ["Bear Cub", "Serra Angel"] },
    });
    const card = idOf(s, "p1", "hand", "Exorcise");
    expect(() => act(s, "p1", { type: "cast", card, targets: { t: [idOf(s, "p2", "battlefield", "Bear Cub")] } })).toThrow();
    s = act(s, "p1", { type: "cast", card, targets: { t: [idOf(s, "p2", "battlefield", "Serra Angel")] } });
    s = settle(s);
    expect(s.exile.some((id) => nameOf(s, id) === "Serra Angel")).toBe(true);
  });

  it("Fear of Being Hunted : célérité ; elle doit être bloquée si possible", () => {
    let s = scenario({ p1: { battlefield: ["Fear of Being Hunted"] }, p2: { battlefield: ["Bear Cub"] } });
    const fear = idOf(s, "p1", "battlefield", "Fear of Being Hunted");
    expect(chars(s, fear).keywords).toContain("haste");
    s = attack(s, [fear]);
    s = passUntil(s, (x) => x.pending?.kind === "declareBlockers");
    expect(() => act(s, "p2", { type: "declareBlockers", blocks: [] })).toThrow();
    s = act(s, "p2", {
      type: "declareBlockers",
      blocks: [{ blocker: idOf(s, "p2", "battlefield", "Bear Cub"), attacker: fear }],
    });
    expect(s.combat?.blockers).toHaveLength(1);
  });

  it("Fear of Burning Alive : 4 blessures à chaque adversaire ; délire, ses blessures non de combat se reportent sur une de ses créatures", () => {
    const run = (graveyard: string[]) => {
      let s = scenario({
        p1: { battlefield: lands("Mountain", 6), hand: ["Fear of Burning Alive"], graveyard },
        p2: { battlefield: ["Serra Angel"] },
      });
      s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Fear of Burning Alive") });
      s = settle(s);
      return [s.players.p2?.life, creaturesOf(s, "p2")];
    };
    expect(run([])).toEqual([16, ["Serra Angel"]]);
    expect(run(DELIRIUM)).toEqual([16, []]);
  });

  it("Fear of Exposure : coût additionnel, engagez deux créatures ou terrains dégagés ; piétinement", () => {
    const four = scenario({ p1: { battlefield: lands("Forest", 4), hand: ["Fear of Exposure"] } });
    expect(castable(four, "p1", idOf(four, "p1", "hand", "Fear of Exposure"))).toBe(false);
    let s = scenario({ p1: { battlefield: [...lands("Forest", 4), "Bear Cub"], hand: ["Fear of Exposure"] } });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Fear of Exposure") });
    s = settle(s);
    const fear = idOf(s, "p1", "battlefield", "Fear of Exposure");
    expect(chars(s, fear).keywords).toContain("trample");
    expect(s.battlefield.filter((id) => s.objects[id]?.tapped)).toHaveLength(5);
  });

  it("Fear of Failed Tests : blessures de combat à un joueur, piochez autant de cartes", () => {
    let s = scenario({ p1: { battlefield: ["Fear of Failed Tests"] } });
    s = attack(s, [idOf(s, "p1", "battlefield", "Fear of Failed Tests")]);
    s = throughCombat(s);
    expect(s.players.p1?.hand).toHaveLength(2);
  });

  it("Fear of Falling : en attaquant, une créature adverse a -2/-0 et perd le vol jusqu'à votre prochain tour", () => {
    let s = scenario({ p1: { battlefield: ["Fear of Falling"] }, p2: { battlefield: ["Serra Angel"] } });
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    s = attack(s, [idOf(s, "p1", "battlefield", "Fear of Falling")]);
    s = settleNoBlocks(s, picking([angel]));
    expect(chars(s, angel).power).toBe(2);
    expect(chars(s, angel).keywords).not.toContain("flying");
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    expect(chars(s, angel).power).toBe(2);
    s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1");
    expect(chars(s, angel).power).toBe(4);
    expect(chars(s, angel).keywords).toContain("flying");
  });

  it("Fear of Impostors : flash ; contrecarre un sort, et son contrôleur manifeste l'effroi", () => {
    let s = scenario({
      active: "p2",
      p1: { battlefield: lands("Island", 3), hand: ["Fear of Impostors"] },
      p2: { battlefield: lands("Forest", 2), hand: ["Bear Cub"] },
    });
    s = act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Bear Cub") });
    const spell = s.stack[0]?.id as string;
    s = act(s, "p2", { type: "pass" });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Fear of Impostors") });
    s = settleAnswering(s, picking([spell]));
    expect(namesIn(s, s.players.p2?.graveyard)).toContain("Bear Cub");
    expect(faceDownOf(s, "p2")).toHaveLength(1);
    expect(faceDownOf(s, "p1")).toHaveLength(0);
  });

  it("Fear of Infinity : vol, lien de vie, ne peut pas bloquer ; sinistre, elle peut revenir du cimetière en main", () => {
    const s0 = scenario({ p1: { battlefield: ["Fear of Infinity"] } });
    expect(chars(s0, idOf(s0, "p1", "battlefield", "Fear of Infinity")).keywords).toEqual(
      expect.arrayContaining(["flying", "lifelink", "cantBlock"]),
    );
    let s = scenario({
      p1: { battlefield: lands("Swamp", 2), hand: ["Nowhere to Run"], graveyard: ["Fear of Infinity"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Nowhere to Run") });
    s = settleAnswering(s, answering({ yes: true }));
    expect(namesIn(s, s.players.p1?.hand)).toEqual(["Fear of Infinity"]);
    // Sur le champ de bataille, la capacité ne fonctionne pas.
    let t = scenario({
      p1: { battlefield: ["Fear of Infinity", ...lands("Swamp", 2)], hand: ["Nowhere to Run"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    t = settleAnswering(act(t, "p1", { type: "cast", card: idOf(t, "p1", "hand", "Nowhere to Run") }), answering({ yes: true }));
    expect(idsOf(t, "p1", "battlefield", "Fear of Infinity")).toHaveLength(1);
  });

  it("Ghostly Keybearer : blessures de combat à un joueur, déverrouillez une porte d'une de vos Salles", () => {
    let s = scenario({ p1: { battlefield: ["Ghostly Keybearer", ROOM] } });
    const room = openDoors(s, ROOM, [0]);
    s = attack(s, [idOf(s, "p1", "battlefield", "Ghostly Keybearer")]);
    s = throughCombat(s, picking([room]));
    expect(s.objects[room]?.unlocked).toEqual([0, 1]);
  });

  it("Glimmer Seeker : survie, piochez si vous contrôlez une Lueur, sinon créez une Lueur", () => {
    const run = (battlefield: string[]) => {
      let s = scenario({ p1: { battlefield: [{ name: "Glimmer Seeker", tapped: true }, ...battlefield] } });
      s = advanceUntil(
        s,
        (x) => x.turn.step === "main2" && x.stack.length === 0 && x.triggers.length === 0 && x.pending?.kind === "priority",
      );
      return [s.players.p1?.hand.length, idsOf(s, "p1", "battlefield", "Glimmer").length];
    };
    expect(run([])).toEqual([0, 1]);
    expect(run(["Lionheart Glimmer"])).toEqual([1, 0]);
  });

  it("Greenhouse : vos terrains ont « {T} : un mana de n'importe quelle couleur »", () => {
    const colors = (p: "p1" | "p2", name: string) => {
      const s = scenario({
        active: p,
        p1: { battlefield: ["Greenhouse // Rickety Gazebo", "Plains"] },
        p2: { battlefield: ["Forest"] },
      });
      openDoors(s, "Greenhouse // Rickety Gazebo", [0]);
      const id = idOf(s, p, "battlefield", name);
      return [...new Set(legalActions(s, p).flatMap((a) => (a.type === "tapForMana" && a.source === id ? a.colors : [])))].sort();
    };
    expect(colors("p1", "Plains")).toEqual(["B", "G", "R", "U", "W"]);
    expect(colors("p2", "Forest")).toEqual(["G"]);
  });

  it("Rickety Gazebo : en la déverrouillant, meulez quatre cartes et prenez jusqu'à deux cartes de permanent parmi elles", () => {
    let s = scenario({
      p1: {
        battlefield: ["Greenhouse // Rickety Gazebo", ...lands("Forest", 4)],
        library: ["Bear Cub", "Opt", "Forest", "Nowhere to Run", "Island"],
      },
    });
    const room = openDoors(s, "Greenhouse // Rickety Gazebo", [0]);
    s = unlock(s, room);
    let offered: string[] = [];
    s = settleAnswering(s, (req, _p, cur) => {
      if (req.type !== "pick") return undefined;
      offered = (namesIn(cur, req.options) as string[]).sort();
      return req.options.filter((id) => ["Bear Cub", "Nowhere to Run"].includes(nameOf(cur, id) as string));
    });
    expect(offered).toEqual(["Bear Cub", "Forest", "Nowhere to Run"]);
    expect(namesIn(s, s.players.p1?.hand).sort()).toEqual(["Bear Cub", "Nowhere to Run"]);
    expect(namesIn(s, s.players.p1?.graveyard).sort()).toEqual(["Forest", "Opt"]);
  });

  it("Gremlin Tamer : sinistre, un jeton Diablotin 1/1 rouge", () => {
    let s = scenario({
      p1: { battlefield: ["Gremlin Tamer", ...lands("Swamp", 2)], hand: ["Nowhere to Run"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Nowhere to Run") });
    s = settle(s);
    expect(chars(s, idOf(s, "p1", "battlefield", "Gremlin"))).toMatchObject({ power: 1, toughness: 1, colors: ["R"] });
  });

  it("Growing Dread : flash, manifestez l'effroi ; quand vous retournez un permanent face visible, un marqueur +1/+1 dessus", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Forest", 3), "Island"], hand: ["Growing Dread"], library: ["Bear Cub", "Island"] },
    });
    expect(chars(s, idOf(s, "p1", "hand", "Growing Dread")).keywords).toContain("flash");
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Growing Dread") });
    s = settleAnswering(s, (req, _p, cur) => pickNamed(cur, req, "Bear Cub"));
    const [hidden] = faceDownOf(s, "p1") as [string];
    s = activateNth(s, hidden);
    s = settle(s);
    expect(nameOf(s, hidden)).toBe("Bear Cub");
    expect(s.objects[hidden]?.counters["+1/+1"]).toBe(1);
  });

  it("Haunted Screen : {T} : {W} ou {B} ; {T}, 1 PV : {G}, {U} ou {R} ; {7}, une fois : un Esprit 0/0 avec sept marqueurs", () => {
    let s = scenario({ p1: { battlefield: ["Haunted Screen", ...lands("Plains", 7)] } });
    const screen = idOf(s, "p1", "battlefield", "Haunted Screen");
    const byAbility = (x: S) =>
      legalActions(x, "p1").flatMap((a) =>
        a.type === "tapForMana" && a.source === screen ? [`${a.ability}:${a.colors.join("")}`] : [],
      );
    expect(byAbility(s)).toEqual(["0:WB", "1:GUR"]);
    const paid = act(s, "p1", { type: "tapForMana", source: screen, ability: 1, color: "G" });
    expect(paid.players.p1?.life).toBe(19);
    expect(paid.players.p1?.manaPool.G).toBe(1);
    s = activateNth(s, screen, 0);
    s = settle(s);
    expect(chars(s, screen)).toMatchObject({ power: 7, toughness: 7 });
    expect(chars(s, screen).subtypes).toContain("Spirit");
    expect(canActivate(s, "p1", screen)).toBe(false);
  });

  it("House Cartographer : survie, révélez jusqu'à un terrain, mis en main ; le reste dessous", () => {
    let s = scenario({
      p1: { battlefield: [{ name: "House Cartographer", tapped: true }], library: ["Opt", "Bear Cub", "Forest", "Island"] },
    });
    s = advanceUntil(
      s,
      (x) => x.turn.step === "main2" && x.stack.length === 0 && x.triggers.length === 0 && x.pending?.kind === "priority",
    );
    expect(namesIn(s, s.players.p1?.hand)).toEqual(["Forest"]);
    expect(nameOf(s, s.players.p1?.library[0] as string)).toBe("Island");
    expect((namesIn(s, s.players.p1?.library.slice(1)) as string[]).sort()).toEqual(["Bear Cub", "Opt"]);
  });

  it("Infernal Phantom : sinistre, +2/+0 ; en mourant, autant de blessures que sa force à n'importe quelle cible", () => {
    let s = scenario({
      p1: {
        battlefield: ["Infernal Phantom", ...lands("Swamp", 2), ...lands("Mountain", 2)],
        hand: ["Nowhere to Run", "Lightning Strike"],
      },
      p2: { battlefield: ["Bear Cub"] },
    });
    const phantom = idOf(s, "p1", "battlefield", "Infernal Phantom");
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Nowhere to Run") });
    s = settle(s);
    expect(chars(s, phantom).power).toBe(4);
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Lightning Strike"), targets: { t: [phantom] } });
    s = settleAnswering(s, picking(["p2"]));
    expect(s.players.p2?.life).toBe(16);
  });

  it("Inquisitive Glimmer : vos sorts d'enchantement coûtent {1} de moins, et déverrouiller aussi", () => {
    let s = scenario({
      p1: { battlefield: ["Inquisitive Glimmer", "Swamp", ROOM, ...lands("Plains", 2)], hand: ["Nowhere to Run", "Bear Cub"] },
    });
    expect(castable(s, "p1", idOf(s, "p1", "hand", "Nowhere to Run"))).toBe(true);
    const room = openDoors(s, ROOM, [0]);
    // Elegant Rotunda ({2}{W}) avec deux Plaines.
    s = unlock(s, room);
    s = settle(s);
    expect(s.objects[room]?.unlocked).toEqual([0, 1]);
  });

  it("Insidious Fungus : {2}, sacrifice : détruisez un artefact, ou un enchantement, ou piochez et posez un terrain engagé", () => {
    let s = scenario({ p1: { battlefield: ["Insidious Fungus", ...lands("Forest", 2)] }, p2: { battlefield: ["Bear Trap"] } });
    const fungus = idOf(s, "p1", "battlefield", "Insidious Fungus");
    s = activateNth(s, fungus, 0, { targets: { t: [idOf(s, "p2", "battlefield", "Bear Trap")] } });
    s = settle(s);
    expect(namesIn(s, s.players.p2?.graveyard)).toEqual(["Bear Trap"]);
    let t = scenario({ p1: { battlefield: ["Insidious Fungus", ...lands("Forest", 2)], hand: ["Plains"], library: ["Opt"] } });
    t = act(t, "p1", { type: "activate", source: idOf(t, "p1", "battlefield", "Insidious Fungus"), ability: 2 });
    t = settleAnswering(t, (req, _p, cur) => pickNamed(cur, req, "Plains"));
    expect(namesIn(t, t.players.p1?.hand)).toEqual(["Opt"]);
    expect(t.objects[idOf(t, "p1", "battlefield", "Plains")]?.tapped).toBe(true);
  });

  it("Intruding Soulrager : {T}, sacrifiez une Salle : 2 blessures à chaque adversaire, piochez", () => {
    let s = scenario({ p1: { battlefield: ["Intruding Soulrager", ROOM] } });
    const room = openDoors(s, ROOM, [0]);
    s = activateNth(s, idOf(s, "p1", "battlefield", "Intruding Soulrager"), 0, { sacrifice: [room] });
    s = settle(s);
    expect(s.objects[room]).toBeUndefined();
    expect(s.players.p2?.life).toBe(18);
    expect(s.players.p1?.hand).toHaveLength(1);
  });

  it("Irreverent Gremlin : une autre créature de force 2 ou moins arrive, défaussez pour piocher, une fois par tour", () => {
    let s = scenario({
      p1: {
        battlefield: ["Irreverent Gremlin", ...lands("Forest", 3)],
        hand: ["Bear Cub", "Llanowar Elves", "Opt"],
        library: lands("Island", 3),
      },
    });
    expect(chars(s, idOf(s, "p1", "battlefield", "Irreverent Gremlin")).keywords).toContain("menace");
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Bear Cub") });
    s = settleAnswering(s, (req, _p, cur) => (req.type === "yesNo" ? [1] : pickNamed(cur, req, "Opt")));
    expect(namesIn(s, s.players.p1?.graveyard)).toEqual(["Opt"]);
    expect(namesIn(s, s.players.p1?.hand).sort()).toEqual(["Island", "Llanowar Elves"]);
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Llanowar Elves") });
    s = passUntil(s, (x) => x.stack.length === 0);
    expect(s.pending?.kind).toBe("priority");
    expect(s.players.p1?.hand).toHaveLength(1);
  });
});

describe("Duskmourn, lot K8 : peu communes (3)", () => {
  it("Live or Die : une carte de créature de votre cimetière revient, ou une créature est détruite", () => {
    let s = scenario({ p1: { battlefield: lands("Swamp", 5), hand: ["Live or Die"], graveyard: ["Patched Plaything"] } });
    s = act(s, "p1", {
      type: "cast",
      card: idOf(s, "p1", "hand", "Live or Die"),
      mode: 0,
      targets: { t: [idOf(s, "p1", "graveyard", "Patched Plaything")] },
    });
    s = settle(s);
    // Patched Plaything n'a pas été lancé depuis la main : pas de marqueur -1/-1.
    expect(chars(s, idOf(s, "p1", "battlefield", "Patched Plaything"))).toMatchObject({ power: 4, toughness: 3 });
    let t = scenario({ p1: { battlefield: lands("Swamp", 5), hand: ["Live or Die"] }, p2: { battlefield: ["Serra Angel"] } });
    t = act(t, "p1", {
      type: "cast",
      card: idOf(t, "p1", "hand", "Live or Die"),
      mode: 1,
      targets: { d: [idOf(t, "p2", "battlefield", "Serra Angel")] },
    });
    t = settle(t);
    expect(namesIn(t, t.players.p2?.graveyard)).toEqual(["Serra Angel"]);
  });

  it("Miasma Demon : défaussez autant de cartes que voulu ; autant de créatures ciblées ont -2/-2", () => {
    let s = scenario({
      p1: { battlefield: lands("Swamp", 6), hand: ["Miasma Demon", "Opt", "Opt", "Forest"] },
      p2: { battlefield: ["Bear Cub", "Llanowar Elves", "Serra Angel"] },
    });
    const targets = [idOf(s, "p2", "battlefield", "Bear Cub"), idOf(s, "p2", "battlefield", "Llanowar Elves")];
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Miasma Demon") });
    s = settleAnswering(s, (req, _p, cur) => {
      if (req.type !== "pick") return undefined;
      if (req.options.includes(targets[0] as string)) return targets;
      return req.options.filter((id) => nameOf(cur, id) === "Opt");
    });
    expect(namesIn(s, s.players.p1?.hand)).toEqual(["Forest"]);
    expect(creaturesOf(s, "p2")).toEqual(["Serra Angel"]);
    expect(chars(s, idOf(s, "p1", "battlefield", "Miasma Demon")).keywords).toContain("flying");
  });

  it("Norin : ne peut pas bloquer ; une de vos créatures bloquée peut être exilée et rejouée ce tour-ci", () => {
    let s = scenario({
      p1: { battlefield: ["Norin, Swift Survivalist", "Bear Cub", ...lands("Forest", 2)] },
      p2: { battlefield: ["Serra Angel"] },
    });
    expect(chars(s, idOf(s, "p1", "battlefield", "Norin, Swift Survivalist")).keywords).toContain("cantBlock");
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    s = attack(s, [cub]);
    s = passUntil(s, (x) => x.pending?.kind === "declareBlockers");
    s = act(s, "p2", {
      type: "declareBlockers",
      blocks: [{ blocker: idOf(s, "p2", "battlefield", "Serra Angel"), attacker: cub }],
    });
    s = settleAnswering(s, answering({ yes: true }));
    const exiled = s.exile.find((id) => nameOf(s, id) === "Bear Cub") as string;
    expect(exiled).toBeDefined();
    s = advanceUntil(s, (x) => x.turn.step === "main2");
    expect(castable(s, "p1", exiled)).toBe(true);
  });

  it("Oblivious Bookworm : à votre étape de fin, piochez puis défaussez, sauf si un permanent est arrivé face cachée ce tour-ci", () => {
    const run = (manifest: boolean) => {
      let s = scenario({
        p1: {
          battlefield: ["Oblivious Bookworm", ...lands("Forest", 2)],
          hand: manifest ? ["Manifest Dread"] : [],
          library: lands("Island", 6),
        },
      });
      if (manifest) s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Manifest Dread") }));
      s = advanceUntil(s, (x) => x.turn.step === "end" && x.pending?.kind === "choice");
      s = settleAnswering(s, answering({ yes: true }));
      return s.players.p1?.hand.length;
    };
    expect(run(false)).toBe(0);
    expect(run(true)).toBe(1);
  });

  it("Optimistic Scavenger : sinistre, un marqueur +1/+1 sur une créature ciblée", () => {
    let s = scenario({
      p1: { battlefield: ["Optimistic Scavenger", "Bear Cub", ...lands("Swamp", 2)], hand: ["Nowhere to Run"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Nowhere to Run") });
    s = settleAnswering(s, (req) =>
      req.type === "pick" && req.options.includes(cub) && !req.options.includes("p2") ? [cub] : undefined,
    );
    expect(s.objects[cub]?.counters["+1/+1"]).toBe(1);
  });

  it("Orphans of the Wheat : en attaquant, engagez des créatures ; +1/+1 pour chacune", () => {
    let s = scenario({ p1: { battlefield: ["Orphans of the Wheat", "Bear Cub", "Llanowar Elves"] } });
    const orphans = idOf(s, "p1", "battlefield", "Orphans of the Wheat");
    const others = [idOf(s, "p1", "battlefield", "Bear Cub"), idOf(s, "p1", "battlefield", "Llanowar Elves")];
    s = attack(s, [orphans]);
    s = settleNoBlocks(s, picking(others));
    expect(chars(s, orphans)).toMatchObject({ power: 4, toughness: 3 });
    expect(others.every((id) => s.objects[id]?.tapped)).toBe(true);
  });

  it("Osseous Sticktwister : délire, à votre étape de fin, chaque adversaire sacrifie, défausse, ou subit des blessures égales à sa force", () => {
    const run = (graveyard: string[], choice: string) => {
      let s = scenario({ p1: { battlefield: ["Osseous Sticktwister"], graveyard }, p2: { hand: ["Opt"] } });
      s = advanceUntil(s, (x) => x.turn.active === "p2" || (x.turn.step === "end" && x.pending?.kind === "choice"));
      s = settleAnswering(s, (req) => (req.type === "pick" && req.intent === "punisher" ? [choice] : undefined));
      return [s.players.p2?.life, s.players.p2?.hand.length];
    };
    expect(run([], "life")).toEqual([20, 1]);
    expect(run(DELIRIUM, "life")).toEqual([18, 1]);
    expect(run(DELIRIUM, "discard")).toEqual([20, 0]);
  });

  it("Overgrown Zealot : {T} : un mana de n'importe quelle couleur ; {T} : deux mana d'une couleur, seulement pour retourner face visible", () => {
    let s = scenario({
      p1: {
        battlefield: ["Overgrown Zealot", ...lands("Forest", 2)],
        hand: ["Manifest Dread", "Llanowar Elves"],
        library: ["Bear Cub", "Island"],
      },
    });
    s = settleAnswering(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Manifest Dread") }), (req, _p, cur) =>
      pickNamed(cur, req, "Bear Cub"),
    );
    const zealot = idOf(s, "p1", "battlefield", "Overgrown Zealot");
    expect(legalActions(s, "p1").filter((a) => a.type === "tapForMana" && a.source === zealot)).toHaveLength(2);
    s = act(s, "p1", { type: "tapForMana", source: zealot, ability: 1, color: "G" });
    // Ce mana ne lance pas Llanowar Elves, mais retourne la créature face cachée ({1}{G}).
    expect(castable(s, "p1", idOf(s, "p1", "hand", "Llanowar Elves"))).toBe(false);
    const [hidden] = faceDownOf(s, "p1") as [string];
    s = activateNth(s, hidden);
    s = settle(s);
    expect(nameOf(s, hidden)).toBe("Bear Cub");
    expect(s.objects[hidden]?.faceDown).toBeUndefined();
  });

  it("Painter's Studio : en la déverrouillant, exilez les deux cartes du dessus, jouables jusqu'à la fin de votre prochain tour", () => {
    let s = scenario({
      p1: {
        battlefield: lands("Mountain", 3),
        hand: ["Painter's Studio // Defaced Gallery"],
        library: ["Forest", "Opt", "Island"],
      },
    });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Painter's Studio // Defaced Gallery"), face: 0 });
    s = settle(s);
    const forest = s.exile.find((id) => nameOf(s, id) === "Forest") as string;
    expect(s.exile.some((id) => nameOf(s, id) === "Opt")).toBe(true);
    expect(nameOf(s, s.players.p1?.library[0] as string)).toBe("Island");
    expect(legalActions(s, "p1").some((a) => a.type === "playLand" && a.card === forest)).toBe(true);
  });

  it("Defaced Gallery : quand vous attaquez, vos créatures attaquantes ont +1/+0", () => {
    let s = scenario({ p1: { battlefield: ["Painter's Studio // Defaced Gallery", "Bear Cub", "Llanowar Elves"] } });
    openDoors(s, "Painter's Studio // Defaced Gallery", [1]);
    s = attack(s, [idOf(s, "p1", "battlefield", "Bear Cub")]);
    s = settleNoBlocks(s);
    expect(chars(s, idOf(s, "p1", "battlefield", "Bear Cub")).power).toBe(3);
    expect(chars(s, idOf(s, "p1", "battlefield", "Llanowar Elves")).power).toBe(1);
  });

  it("Paranormal Analyst : quand vous manifestez l'effroi, la carte mise au cimetière va dans votre main", () => {
    let s = scenario({
      p1: {
        battlefield: ["Paranormal Analyst", ...lands("Forest", 2)],
        hand: ["Manifest Dread"],
        library: ["Bear Cub", "Island"],
      },
    });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Manifest Dread") });
    s = settleAnswering(s, (req, _p, cur) => pickNamed(cur, req, "Bear Cub"));
    expect(faceDownOf(s, "p1")).toHaveLength(1);
    expect(namesIn(s, s.players.p1?.hand)).toEqual(["Island"]);
  });

  it("Patched Plaything : double initiative ; lancée de la main, elle arrive avec deux marqueurs -1/-1", () => {
    let s = scenario({ p1: { battlefield: lands("Plains", 3), hand: ["Patched Plaything"] } });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Patched Plaything") });
    s = settle(s);
    const toy = idOf(s, "p1", "battlefield", "Patched Plaything");
    expect(s.objects[toy]?.counters["-1/-1"]).toBe(2);
    expect(chars(s, toy)).toMatchObject({ power: 2, toughness: 1 });
    expect(chars(s, toy).keywords).toContain("doubleStrike");
  });

  it("Patchwork Beastie : ne peut ni attaquer ni bloquer sans délire ; à votre entretien, vous pouvez meuler une carte", () => {
    const kw = (graveyard: string[]) => {
      const s = scenario({ p1: { battlefield: ["Patchwork Beastie"], graveyard } });
      return chars(s, idOf(s, "p1", "battlefield", "Patchwork Beastie")).keywords;
    };
    expect(kw([])).toEqual(expect.arrayContaining(["cantAttack", "cantBlock"]));
    expect(kw(DELIRIUM)).not.toContain("cantAttack");
    let s = scenario({
      active: "p2",
      step: "main2",
      p1: { battlefield: ["Patchwork Beastie"], library: ["Opt", "Forest", "Forest"] },
    });
    s = advanceUntil(s, (x) => x.turn.active === "p1" && x.pending?.kind === "choice");
    s = settleAnswering(s, answering({ yes: true }));
    expect(namesIn(s, s.players.p1?.graveyard)).toEqual(["Opt"]);
  });

  it("Piggy Bank : en mourant, un jeton Trésor", () => {
    let s = scenario({ p1: { battlefield: ["Piggy Bank", ...lands("Mountain", 2)], hand: ["Lightning Strike"] } });
    s = act(s, "p1", {
      type: "cast",
      card: idOf(s, "p1", "hand", "Lightning Strike"),
      targets: { t: [idOf(s, "p1", "battlefield", "Piggy Bank")] },
    });
    s = settle(s);
    expect(idsOf(s, "p1", "battlefield", "Treasure")).toHaveLength(1);
  });

  it("Popular Egotist : {1}{B}, sacrifiez une autre créature ou un enchantement : indestructible, puis engagée ; chaque sacrifice draine 1", () => {
    let s = scenario({ p1: { battlefield: ["Popular Egotist", "Bear Cub", ...lands("Swamp", 2)] } });
    const egotist = idOf(s, "p1", "battlefield", "Popular Egotist");
    expect(() => activateNth(s, egotist, 0, { sacrifice: [egotist] })).toThrow();
    s = activateNth(s, egotist, 0, { sacrifice: [idOf(s, "p1", "battlefield", "Bear Cub")] });
    s = settleAnswering(s, picking(["p2"]));
    expect(s.objects[egotist]?.tapped).toBe(true);
    expect(chars(s, egotist).keywords).toContain("indestructible");
    expect([s.players.p1?.life, s.players.p2?.life]).toEqual([21, 19]);
  });

  it("Razorkin Hordecaller : célérité ; quand vous attaquez, un jeton Diablotin 1/1 rouge", () => {
    let s = scenario({ p1: { battlefield: ["Razorkin Hordecaller", "Bear Cub"] } });
    expect(chars(s, idOf(s, "p1", "battlefield", "Razorkin Hordecaller")).keywords).toContain("haste");
    s = attack(s, [idOf(s, "p1", "battlefield", "Bear Cub")]);
    s = settleNoBlocks(s);
    expect(idsOf(s, "p1", "battlefield", "Gremlin")).toHaveLength(1);
  });

  it("Rite of the Moth : une créature de votre cimetière revient avec un marqueur de finalité ; flashback {3}{W}{W}{B}", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Plains", 3), ...lands("Swamp", 3)], graveyard: ["Rite of the Moth", "Serra Angel"] },
    });
    const rite = idOf(s, "p1", "graveyard", "Rite of the Moth");
    s = act(s, "p1", { type: "cast", card: rite, targets: { t: [idOf(s, "p1", "graveyard", "Serra Angel")] } });
    s = settle(s);
    expect(s.objects[idOf(s, "p1", "battlefield", "Serra Angel")]?.counters.finality).toBe(1);
    expect(s.exile.some((id) => nameOf(s, id) === "Rite of the Moth")).toBe(true);
  });

  it("Rootwise Survivor : survie, trois marqueurs +1/+1 sur un de vos terrains, qui devient un Élémental 0/0 avec la célérité", () => {
    let s = scenario({ p1: { battlefield: [{ name: "Rootwise Survivor", tapped: true }, "Forest"] } });
    const forest = idOf(s, "p1", "battlefield", "Forest");
    s = advanceUntil(s, (x) => x.turn.step === "main2" && x.pending?.kind === "choice");
    s = settleAnswering(s, picking([forest]));
    const c = chars(s, forest);
    expect([c.power, c.toughness]).toEqual([3, 3]);
    expect(c.types).toEqual(expect.arrayContaining(["Land", "Creature"]));
    expect(c.subtypes).toEqual(expect.arrayContaining(["Forest", "Elemental"]));
    expect(c.keywords).toContain("haste");
    s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.number > 3 && x.turn.step === "main1");
    expect(chars(s, forest).keywords).not.toContain("haste");
    expect(chars(s, forest).types).toContain("Creature");
  });

  it("Savior of the Small : survie, une carte de créature de valeur de mana 3 ou moins de votre cimetière en main", () => {
    let s = scenario({
      p1: { battlefield: [{ name: "Savior of the Small", tapped: true }], graveyard: ["Shivan Dragon", "Bear Cub"] },
    });
    s = advanceUntil(
      s,
      (x) => x.turn.step === "main2" && x.stack.length === 0 && x.triggers.length === 0 && x.pending?.kind === "priority",
    );
    // Shivan Dragon (VM 6) n'est pas une cible : la seule cible légale est choisie.
    expect(namesIn(s, s.players.p1?.hand)).toEqual(["Bear Cub"]);
    expect(namesIn(s, s.players.p1?.graveyard)).toEqual(["Shivan Dragon"]);
  });

  it("Saw : +2/+0 ; quand la créature équipée attaque, sacrifiez un autre permanent pour piocher", () => {
    let s = scenario({ p1: { battlefield: ["Saw", "Bear Cub", ...lands("Forest", 3)], library: ["Opt", "Island"] } });
    const saw = idOf(s, "p1", "battlefield", "Saw");
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    s = activateNth(s, saw, 0, { targets: { t: [cub] } });
    s = settle(s);
    expect(chars(s, cub).power).toBe(4);
    const forest = idOf(s, "p1", "battlefield", "Forest");
    s = attack(s, [cub]);
    let offered: string[] = [];
    s = settleNoBlocks(s, (req) => {
      if (req.type !== "pick") return undefined;
      offered = req.options;
      return [forest];
    });
    expect(offered).not.toContain(cub);
    expect(offered).not.toContain(saw);
    expect(s.objects[forest]).toBeUndefined();
    expect(namesIn(s, s.players.p1?.hand)).toEqual(["Opt"]);
  });

  it("Sawblade Skinripper : {2}, sacrifiez : un marqueur +1/+1 ; à votre étape de fin, autant de blessures que de permanents sacrifiés ce tour-ci", () => {
    let s = scenario({ p1: { battlefield: ["Sawblade Skinripper", "Bear Cub", "Nowhere to Run", ...lands("Swamp", 4)] } });
    const ripper = idOf(s, "p1", "battlefield", "Sawblade Skinripper");
    expect(chars(s, ripper).keywords).toContain("menace");
    s = activateNth(s, ripper, 0, { sacrifice: [idOf(s, "p1", "battlefield", "Bear Cub")] });
    s = settle(s);
    s = activateNth(s, ripper, 0, { sacrifice: [idOf(s, "p1", "battlefield", "Nowhere to Run")] });
    s = settle(s);
    expect(s.objects[ripper]?.counters["+1/+1"]).toBe(2);
    s = advanceUntil(s, (x) => x.turn.step === "end" && x.pending?.kind === "choice");
    s = settleAnswering(s, picking(["p2"]));
    expect(s.players.p2?.life).toBe(18);
    // Sans sacrifice ce tour-ci : rien.
    let t = scenario({ p1: { battlefield: ["Sawblade Skinripper"] } });
    t = advanceUntil(t, (x) => x.turn.active === "p2");
    expect(t.players.p2?.life).toBe(20);
  });

  it("Scrabbling Skullcrab : sinistre, le joueur ciblé meule deux cartes", () => {
    let s = scenario({
      p1: { battlefield: ["Scrabbling Skullcrab", ...lands("Swamp", 2)], hand: ["Nowhere to Run"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Nowhere to Run") });
    s = settleAnswering(s, picking(["p2"]));
    expect(s.players.p2?.graveyard).toHaveLength(2);
  });

  it("Shardmage's Rescue : +1/+1 ; défense talismanique tant que l'Aura est arrivée ce tour-ci", () => {
    let s = scenario({ p1: { battlefield: ["Bear Cub", "Plains"], hand: ["Shardmage's Rescue"] } });
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Shardmage's Rescue"), targets: { enchant: [cub] } });
    s = settle(s);
    expect(chars(s, cub)).toMatchObject({ power: 3, toughness: 3 });
    expect(chars(s, cub).keywords).toContain("hexproof");
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(chars(s, cub).keywords).not.toContain("hexproof");
    expect(chars(s, cub).power).toBe(3);
  });

  it("Shrewd Storyteller : survie, un marqueur +1/+1 sur une créature ciblée", () => {
    let s = scenario({ p1: { battlefield: [{ name: "Shrewd Storyteller", tapped: true }, "Bear Cub"] } });
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    s = advanceUntil(s, (x) => x.turn.step === "main2" && x.pending?.kind === "choice");
    s = settleAnswering(s, picking([cub]));
    expect(s.objects[cub]?.counters["+1/+1"]).toBe(1);
  });

  it("Shroudstomper : contact mortel ; en arrivant ou en attaquant, chaque adversaire perd 2 PV, vous gagnez 2 PV et piochez", () => {
    let s = scenario({ p1: { battlefield: [...lands("Plains", 3), ...lands("Swamp", 4)], hand: ["Shroudstomper"] } });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Shroudstomper") });
    s = settle(s);
    expect([s.players.p1?.life, s.players.p2?.life, s.players.p1?.hand.length]).toEqual([22, 18, 1]);
    expect(chars(s, idOf(s, "p1", "battlefield", "Shroudstomper")).keywords).toContain("deathtouch");
    let t = scenario({ p1: { battlefield: ["Shroudstomper"] } });
    t = attack(t, [idOf(t, "p1", "battlefield", "Shroudstomper")]);
    t = settleNoBlocks(t);
    expect([t.players.p1?.life, t.players.p2?.life, t.players.p1?.hand.length]).toEqual([22, 18, 1]);
  });

  it("Skullsnap Nuisance : vol ; sinistre, surveillance 1", () => {
    let s = scenario({
      p1: { battlefield: ["Skullsnap Nuisance", ...lands("Swamp", 2)], hand: ["Nowhere to Run"], library: ["Opt", "Forest"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    expect(chars(s, idOf(s, "p1", "battlefield", "Skullsnap Nuisance")).keywords).toContain("flying");
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Nowhere to Run") });
    s = settleAnswering(s, (req, _p, cur) => pickNamed(cur, req, "Opt"));
    expect(namesIn(s, s.players.p1?.graveyard)).toContain("Opt");
  });

  it("Smoky Lounge : {R}{R} pendant votre première phase principale, seulement pour les Salles", () => {
    const s = scenario({
      p1: {
        battlefield: ["Smoky Lounge // Misty Salon", "Mountain"],
        hand: ["Painter's Studio // Defaced Gallery", "Lightning Strike"],
      },
    });
    openDoors(s, "Smoky Lounge // Misty Salon", [0]);
    expect(castable(s, "p1", idOf(s, "p1", "hand", "Painter's Studio // Defaced Gallery"))).toBe(true);
    expect(castable(s, "p1", idOf(s, "p1", "hand", "Lightning Strike"))).toBe(false);
  });

  it("Misty Salon : en la déverrouillant, un Esprit X/X bleu volant, X le nombre de portes déverrouillées de vos Salles", () => {
    let s = scenario({ p1: { battlefield: ["Smoky Lounge // Misty Salon", ROOM, ...lands("Island", 4)] } });
    const room = openDoors(s, "Smoky Lounge // Misty Salon", [0]);
    openDoors(s, ROOM, [0, 1]);
    s = unlock(s, room);
    s = settle(s);
    const spirit = idOf(s, "p1", "battlefield", "Spirit");
    expect(chars(s, spirit)).toMatchObject({ power: 4, toughness: 4, colors: ["U"] });
    expect(chars(s, spirit).keywords).toContain("flying");
  });

  it("Splitskin Doll : piochez, puis défaussez sauf si vous contrôlez une autre créature de force 2 ou moins", () => {
    const run = (battlefield: string[]) => {
      let s = scenario({ p1: { battlefield: [...battlefield, ...lands("Plains", 2)], hand: ["Splitskin Doll", "Opt"] } });
      s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Splitskin Doll") });
      s = settle(s);
      return s.players.p1?.hand.length;
    };
    expect(run([])).toBe(1);
    expect(run(["Shivan Dragon"])).toBe(1);
    expect(run(["Bear Cub"])).toBe(2);
  });

  it("Sporogenic Infection : le joueur ciblé sacrifie une créature autre que l'enchantée ; blessée, la créature enchantée est détruite", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Swamp", 2), ...lands("Mountain", 2)], hand: ["Sporogenic Infection", "Lightning Strike"] },
      p2: { battlefield: ["Serra Angel", "Bear Cub"] },
    });
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Sporogenic Infection"), targets: { enchant: [angel] } });
    s = settleAnswering(s, picking(["p2"]));
    expect(creaturesOf(s, "p2")).toEqual(["Serra Angel"]);
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Lightning Strike"), targets: { t: [angel] } });
    s = settle(s);
    expect(creaturesOf(s, "p2")).toEqual([]);
  });

  it("Stay Hidden, Stay Silent : engage la créature, qui ne se dégage plus ; {4}{U}{U} : mélangée dans la bibliothèque, puis manifestation effroyable", () => {
    let s = scenario({
      p1: { battlefield: lands("Island", 8), hand: ["Stay Hidden, Stay Silent"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Stay Hidden, Stay Silent"), targets: { enchant: [angel] } });
    s = settle(s);
    expect(s.objects[angel]?.tapped).toBe(true);
    s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.number > 3 && x.turn.step === "main1");
    expect(s.objects[angel]?.tapped).toBe(true);
    s = activateNth(s, idOf(s, "p1", "battlefield", "Stay Hidden, Stay Silent"));
    s = settle(s);
    expect(namesIn(s, s.players.p2?.library)).toContain("Serra Angel");
    expect(creaturesOf(s, "p2")).toEqual([]);
    expect(faceDownOf(s, "p1")).toHaveLength(1);
  });

  it("Surgical Suite : en la déverrouillant, une carte de créature de valeur de mana 3 ou moins revient de votre cimetière", () => {
    let s = scenario({
      p1: {
        battlefield: lands("Plains", 2),
        hand: ["Surgical Suite // Hospital Room"],
        graveyard: ["Shivan Dragon", "Bear Cub"],
      },
    });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Surgical Suite // Hospital Room"), face: 0 });
    s = settle(s);
    // Shivan Dragon (VM 6) n'est pas une cible.
    expect(creaturesOf(s, "p1")).toEqual(["Bear Cub"]);
    expect(namesIn(s, s.players.p1?.graveyard)).toEqual(["Shivan Dragon"]);
  });

  it("Hospital Room : quand vous attaquez, un marqueur +1/+1 sur une créature attaquante", () => {
    let s = scenario({ p1: { battlefield: ["Surgical Suite // Hospital Room", "Bear Cub", "Llanowar Elves"] } });
    openDoors(s, "Surgical Suite // Hospital Room", [1]);
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    const elves = idOf(s, "p1", "battlefield", "Llanowar Elves");
    s = attack(s, [cub]);
    s = settleNoBlocks(s, picking([elves]));
    // Llanowar Elves n'attaque pas : seule Bear Cub est une cible.
    expect(s.objects[cub]?.counters["+1/+1"]).toBe(1);
    expect(s.objects[elves]?.counters["+1/+1"]).toBeUndefined();
  });
});

describe("Duskmourn, lot K8 : peu communes (4)", () => {
  it("Threats Around Every Corner : manifestez l'effroi ; un permanent face cachée à vous arrive, cherchez un terrain de base engagé", () => {
    let s = scenario({
      p1: {
        battlefield: lands("Forest", 4),
        hand: ["Threats Around Every Corner"],
        library: ["Bear Cub", "Opt", "Island", "Forest"],
      },
    });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Threats Around Every Corner") });
    s = settle(s);
    expect(faceDownOf(s, "p1")).toHaveLength(1);
    const island = idOf(s, "p1", "battlefield", "Island");
    expect(s.objects[island]?.tapped).toBe(true);
  });

  it("Under the Skin : manifestez l'effroi ; une carte de permanent de votre cimetière peut revenir en main", () => {
    let s = scenario({
      p1: {
        battlefield: lands("Forest", 3),
        hand: ["Under the Skin"],
        graveyard: ["Serra Angel", "Opt"],
        library: ["Forest", "Island"],
      },
    });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Under the Skin") });
    let offered: string[] = [];
    s = settleAnswering(s, (req, _p, cur) => {
      if (req.type === "pick" && req.options.some((id) => nameOf(cur, id) === "Serra Angel")) {
        offered = (namesIn(cur, req.options) as string[]).sort();
        return pickNamed(cur, req, "Serra Angel");
      }
      return undefined;
    });
    expect(faceDownOf(s, "p1")).toHaveLength(1);
    expect(offered).not.toContain("Opt");
    expect(namesIn(s, s.players.p1?.hand)).toEqual(["Serra Angel"]);
  });

  it("Unnerving Grasp : renvoyez jusqu'à un permanent non-terrain, puis manifestez l'effroi", () => {
    let s = scenario({
      p1: { battlefield: lands("Island", 3), hand: ["Unnerving Grasp"] },
      p2: { battlefield: ["Serra Angel", "Forest"] },
    });
    const card = idOf(s, "p1", "hand", "Unnerving Grasp");
    expect(() => act(s, "p1", { type: "cast", card, targets: { t: [idOf(s, "p2", "battlefield", "Forest")] } })).toThrow();
    s = act(s, "p1", { type: "cast", card, targets: { t: [idOf(s, "p2", "battlefield", "Serra Angel")] } });
    s = settle(s);
    expect(namesIn(s, s.players.p2?.hand)).toEqual(["Serra Angel"]);
    expect(faceDownOf(s, "p1")).toHaveLength(1);
  });

  it("Untimely Malfunction : détruisez un artefact, ou changez la cible d'un sort, ou une ou deux créatures ne peuvent pas bloquer", () => {
    let s = scenario({
      p1: { battlefield: lands("Mountain", 2), hand: ["Untimely Malfunction"] },
      p2: { battlefield: ["Bear Trap"] },
    });
    s = act(s, "p1", {
      type: "cast",
      card: idOf(s, "p1", "hand", "Untimely Malfunction"),
      mode: 0,
      targets: { a: [idOf(s, "p2", "battlefield", "Bear Trap")] },
    });
    s = settle(s);
    expect(namesIn(s, s.players.p2?.graveyard)).toEqual(["Bear Trap"]);
    let t = scenario({
      p1: { battlefield: lands("Mountain", 2), hand: ["Untimely Malfunction"] },
      p2: { battlefield: ["Bear Cub", "Llanowar Elves", "Serra Angel"] },
    });
    const two = [idOf(t, "p2", "battlefield", "Bear Cub"), idOf(t, "p2", "battlefield", "Llanowar Elves")];
    expect(() =>
      act(t, "p1", { type: "cast", card: idOf(t, "p1", "hand", "Untimely Malfunction"), mode: 2, targets: { c: [] } }),
    ).toThrow();
    t = act(t, "p1", { type: "cast", card: idOf(t, "p1", "hand", "Untimely Malfunction"), mode: 2, targets: { c: two } });
    t = settle(t);
    for (const id of two) expect(chars(t, id).keywords).toContain("cantBlock");
    expect(chars(t, idOf(t, "p2", "battlefield", "Serra Angel")).keywords).not.toContain("cantBlock");
    // Changer la cible : la Foudre adverse visant Bear Cub frappe son lanceur.
    let u = scenario({
      active: "p2",
      p1: { battlefield: ["Bear Cub", ...lands("Mountain", 2)], hand: ["Untimely Malfunction"] },
      p2: { battlefield: lands("Mountain", 2), hand: ["Lightning Strike"] },
    });
    const cub = idOf(u, "p1", "battlefield", "Bear Cub");
    u = act(u, "p2", { type: "cast", card: idOf(u, "p2", "hand", "Lightning Strike"), targets: { t: [cub] } });
    const strike = u.stack[0]?.id as string;
    u = act(u, "p2", { type: "pass" });
    u = act(u, "p1", { type: "cast", card: idOf(u, "p1", "hand", "Untimely Malfunction"), mode: 1, targets: { s: [strike] } });
    u = settleAnswering(u, picking(["p2"]));
    expect(u.objects[cub]?.damage ?? 0).toBe(0);
    expect(u.players.p2?.life).toBe(17);
  });

  it("Unwilling Vessel : vigilance ; sinistre, un marqueur de possession ; en mourant, un Esprit X/X volant, X ses marqueurs", () => {
    let s = scenario({
      p1: {
        battlefield: [{ name: "Unwilling Vessel", counters: { "+1/+1": 1 } }, ...lands("Swamp", 2), ...lands("Mountain", 2)],
        hand: ["Nowhere to Run", "Lightning Strike"],
      },
      p2: { battlefield: ["Serra Angel"] },
    });
    const vessel = idOf(s, "p1", "battlefield", "Unwilling Vessel");
    expect(chars(s, vessel).keywords).toContain("vigilance");
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Nowhere to Run") });
    s = settle(s);
    expect(s.objects[vessel]?.counters.possession).toBe(1);
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Lightning Strike"), targets: { t: [vessel] } });
    s = settle(s);
    const spirit = idOf(s, "p1", "battlefield", "Spirit");
    expect(chars(s, spirit)).toMatchObject({ power: 2, toughness: 2, colors: ["U"] });
    expect(chars(s, spirit).keywords).toContain("flying");
  });

  it("Valgavoth's Faithful : {3}{B}, sacrifiez-le : une carte de créature de votre cimetière revient sur le champ de bataille", () => {
    let s = scenario({ p1: { battlefield: ["Valgavoth's Faithful", ...lands("Swamp", 4)], graveyard: ["Serra Angel"] } });
    s = activateNth(s, idOf(s, "p1", "battlefield", "Valgavoth's Faithful"), 0, {
      targets: { t: [idOf(s, "p1", "graveyard", "Serra Angel")] },
    });
    s = settle(s);
    expect(creaturesOf(s, "p1")).toEqual(["Serra Angel"]);
    expect(namesIn(s, s.players.p1?.graveyard)).toEqual(["Valgavoth's Faithful"]);
  });

  it("Vengeful Possession : contrôle jusqu'à la fin du tour, dégagée, célérité ; vous pouvez défausser pour piocher", () => {
    let s = scenario({
      p1: { battlefield: lands("Mountain", 3), hand: ["Vengeful Possession", "Opt"], library: ["Forest", "Forest"] },
      p2: { battlefield: [{ name: "Serra Angel", tapped: true }] },
    });
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Vengeful Possession"), targets: { t: [angel] } });
    s = settleAnswering(s, (req, _p, cur) => (req.type === "yesNo" ? [1] : pickNamed(cur, req, "Opt")));
    expect(chars(s, angel).controller).toBe("p1");
    expect(s.objects[angel]?.tapped).toBe(false);
    expect(chars(s, angel).keywords).toContain("haste");
    expect(namesIn(s, s.players.p1?.hand)).toEqual(["Forest"]);
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(chars(s, angel).controller).toBe("p2");
  });

  it("Veteran Survivor : survie, exilez une carte d'un cimetière ; avec trois cartes exilées, +3/+3 et la défense talismanique", () => {
    let s = scenario({
      p1: { battlefield: ["Veteran Survivor", ...lands("Island", 2)], hand: ["Stay Hidden, Stay Silent"] },
      p2: { graveyard: ["Opt", "Forest", "Bear Cub"] },
    });
    const vet = idOf(s, "p1", "battlefield", "Veteran Survivor");
    // Engagée par Stay Hidden, Stay Silent, elle ne se dégage plus : la survie se déclenche à chaque tour.
    s = settle(
      act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Stay Hidden, Stay Silent"), targets: { enchant: [vet] } }),
    );
    for (let i = 0; i < 3; i++) {
      expect(chars(s, vet)).toMatchObject({ power: 2, toughness: 1 });
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main2" && x.pending?.kind === "choice");
      const req = s.pending?.kind === "choice" ? s.pending.request : undefined;
      s = act(s, "p1", { type: "choose", values: req?.type === "pick" ? [req.options[0] as string] : [] });
      s = settle(s);
      s = advanceUntil(s, (x) => x.turn.step !== "main2");
    }
    expect(s.players.p2?.graveyard).toHaveLength(0);
    expect(chars(s, vet)).toMatchObject({ power: 5, toughness: 4 });
    expect(chars(s, vet).keywords).toContain("hexproof");
  });

  it("Vile Mutilator : sacrifiez une créature ou un enchantement ; chaque adversaire sacrifie un enchantement puis une créature non-jetons", () => {
    let s = scenario({
      p1: { battlefield: ["Bear Cub", ...lands("Swamp", 7)], hand: ["Vile Mutilator"] },
      p2: { battlefield: ["Nowhere to Run", "Serra Angel"] },
    });
    s = act(s, "p1", {
      type: "cast",
      card: idOf(s, "p1", "hand", "Vile Mutilator"),
      sacrifice: [idOf(s, "p1", "battlefield", "Bear Cub")],
    });
    s = settle(s);
    expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(0);
    expect(namesIn(s, s.players.p2?.graveyard).sort()).toEqual(["Nowhere to Run", "Serra Angel"]);
    expect(chars(s, idOf(s, "p1", "battlefield", "Vile Mutilator")).keywords).toEqual(
      expect.arrayContaining(["flying", "trample"]),
    );
  });

  it("Violent Urge : +1/+0 et l'initiative ; avec le délire, la double initiative", () => {
    const run = (graveyard: string[]) => {
      let s = scenario({ p1: { battlefield: ["Bear Cub", "Mountain"], hand: ["Violent Urge"], graveyard } });
      const cub = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Violent Urge"), targets: { t: [cub] } }));
      const c = chars(s, cub);
      return [c.power, c.keywords.includes("firstStrike"), c.keywords.includes("doubleStrike")];
    };
    expect(run([])).toEqual([3, true, false]);
    expect(run(DELIRIUM)).toEqual([3, true, true]);
  });

  it("Wickerfolk Thresher : délire, en attaquant, la carte du dessus va sur le champ de bataille si c'est un terrain, sinon en main", () => {
    const run = (top: string, yes = true) => {
      let s = scenario({ p1: { battlefield: ["Wickerfolk Thresher"], graveyard: DELIRIUM, library: [top, "Island"] } });
      s = attack(s, [idOf(s, "p1", "battlefield", "Wickerfolk Thresher")]);
      s = settleNoBlocks(s, (req) => (req.type === "yesNo" ? [yes ? 1 : 0] : req.type === "pick" && !yes ? [] : undefined));
      return [namesIn(s, s.players.p1?.hand), idsOf(s, "p1", "battlefield", "Forest").length];
    };
    expect(run("Forest")).toEqual([[], 1]);
    // Le terrain refusé va en main.
    expect(run("Forest", false)).toEqual([["Forest"], 0]);
    expect(run("Bear Cub")).toEqual([["Bear Cub"], 0]);
  });

  it("Wildfire Wickerfolk : célérité ; délire, +1/+1 et le piétinement", () => {
    const at = (graveyard: string[]) => {
      const s = scenario({ p1: { battlefield: ["Wildfire Wickerfolk"], graveyard } });
      const c = chars(s, idOf(s, "p1", "battlefield", "Wildfire Wickerfolk"));
      return [c.power, c.toughness, c.keywords.includes("haste"), c.keywords.includes("trample")];
    };
    expect(at([])).toEqual([3, 2, true, false]);
    expect(at(DELIRIUM)).toEqual([4, 3, true, true]);
  });

  it("Withering Torment : détruit une créature ou un enchantement, et vous perdez 2 PV", () => {
    let s = scenario({
      p1: { battlefield: lands("Swamp", 3), hand: ["Withering Torment"] },
      p2: { battlefield: ["Nowhere to Run", "Bear Trap"] },
    });
    const card = idOf(s, "p1", "hand", "Withering Torment");
    expect(() => act(s, "p1", { type: "cast", card, targets: { t: [idOf(s, "p2", "battlefield", "Bear Trap")] } })).toThrow();
    s = act(s, "p1", { type: "cast", card, targets: { t: [idOf(s, "p2", "battlefield", "Nowhere to Run")] } });
    s = settle(s);
    expect(namesIn(s, s.players.p2?.graveyard)).toEqual(["Nowhere to Run"]);
    expect(s.players.p1?.life).toBe(18);
  });
});
