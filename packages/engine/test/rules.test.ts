import { buildDeck, DECKS } from "@mtgx/cards";
import { describe, expect, it } from "vitest";
import { autopilotDecision, DEFAULT_AUTOPILOT } from "../src/autopilot";
import { createGame, submit } from "../src/game";
import { legalActions } from "../src/legal";
import { solvePayment } from "../src/mana";
import { chars } from "../src/state";
import { act, customCard, idOf, idsOf, passBoth, passUntil, scenario } from "./helpers";

const [green, red] = DECKS as [(typeof DECKS)[0], (typeof DECKS)[0]];

describe("début de partie", () => {
  it("distribue 7 cartes et demande le mulligan au premier joueur", () => {
    const { state } = createGame({
      seed: 1,
      startingPlayer: "p1",
      players: [
        { id: "p1", name: "A", deck: buildDeck(green) },
        { id: "p2", name: "B", deck: buildDeck(red) },
      ],
    });
    expect(state.players.p1?.hand).toHaveLength(7);
    expect(state.players.p2?.hand).toHaveLength(7);
    expect(state.pending).toEqual({ kind: "mulligan", player: "p1", mulligans: 0 });
  });

  it("mulligan de Londres : on repioche 7 et on remet une carte en dessous", () => {
    let { state: s } = createGame({
      seed: 1,
      startingPlayer: "p1",
      players: [
        { id: "p1", name: "A", deck: buildDeck(green) },
        { id: "p2", name: "B", deck: buildDeck(red) },
      ],
    });
    s = act(s, "p1", { type: "mulligan" });
    expect(s.players.p1?.hand).toHaveLength(7);
    expect(s.pending).toEqual({ kind: "mulligan", player: "p1", mulligans: 1 });
    s = act(s, "p1", { type: "keep" });
    expect(s.pending).toEqual({ kind: "bottomCards", player: "p1", count: 1 });
    s = act(s, "p1", { type: "bottom", cards: [s.players.p1?.hand[0] as string] });
    expect(s.players.p1?.hand).toHaveLength(6);
    expect(s.players.p1?.library).toHaveLength(54);
    expect(s.pending?.player).toBe("p2");
  });

  it("le premier joueur ne pioche pas à son premier tour", () => {
    let { state: s } = createGame({
      seed: 3,
      startingPlayer: "p1",
      players: [
        { id: "p1", name: "A", deck: buildDeck(green) },
        { id: "p2", name: "B", deck: buildDeck(red) },
      ],
    });
    s = act(s, "p1", { type: "keep" });
    s = act(s, "p2", { type: "keep" });
    s = passUntil(s, (x) => x.turn.step === "main1");
    expect(s.turn.number).toBe(1);
    expect(s.players.p1?.hand).toHaveLength(7);
    s = passUntil(s, (x) => x.turn.number === 2 && x.turn.step === "main1");
    expect(s.players.p2?.hand).toHaveLength(8);
  });
});

describe("terrains, sorts et paiement automatique", () => {
  it("joue un terrain par tour", () => {
    let s = scenario({ p1: { hand: ["Forest", "Forest"] } });
    const [f1, f2] = idsOf(s, "p1", "hand", "Forest") as [string, string];
    s = act(s, "p1", { type: "playLand", card: f1 });
    expect(idsOf(s, "p1", "battlefield", "Forest")).toHaveLength(1);
    expect(() => act(s, "p1", { type: "playLand", card: f2 })).toThrow();
  });

  it("lance une créature en payant automatiquement, en gardant les créatures-mana dégagées", () => {
    let s = scenario({ p1: { battlefield: ["Forest", "Forest", "Llanowar Elves"], hand: ["Bear Cub"] } });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Bear Cub") });
    expect(s.stack).toHaveLength(1);
    expect(idsOf(s, "p1", "battlefield", "Forest").every((id) => s.objects[id]?.tapped)).toBe(true);
    expect(s.objects[idOf(s, "p1", "battlefield", "Llanowar Elves")]?.tapped).toBe(false);
    s = passBoth(s);
    expect(s.stack).toHaveLength(0);
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    expect(s.objects[bear]?.controller).toBe("p1");
  });

  it("refuse un sort sans assez de mana (l'état ne change pas)", () => {
    const s = scenario({ p1: { battlefield: ["Forest"], hand: ["Bear Cub"] } });
    expect(() => act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Bear Cub") })).toThrow(/Mana/);
    expect(legalActions(s, "p1").some((a) => a.type === "cast")).toBe(false);
  });

  it("le solveur utilise la réserve de mana d'abord", () => {
    let s = scenario({ p1: { battlefield: ["Forest", "Forest"], hand: ["Giant Growth"] } });
    s = act(s, "p1", { type: "tapForMana", source: idsOf(s, "p1", "battlefield", "Forest")[0] as string, ability: 0 });
    expect(s.players.p1?.manaPool.G).toBe(1);
    const plan = solvePayment(s, "p1", { generic: 0, colored: { G: 1 }, x: 0 });
    expect(plan?.taps).toHaveLength(0);
  });

  it("une créature arrivée ce tour ne peut pas attaquer ni s'engager", () => {
    let s = scenario({ p1: { battlefield: ["Forest", "Forest"], hand: ["Bear Cub"] } });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Bear Cub") });
    s = passBoth(s);
    s = passUntil(s, (x) => x.turn.step !== "main1");
    // Pas d'attaquant possible : l'étape de déclaration ne demande rien.
    expect(s.pending?.kind).toBe("priority");
    expect(s.combat?.attackers ?? []).toHaveLength(0);
  });
});

describe("pile et cibles", () => {
  it("LIFO : la réponse se résout en premier (Giant Growth sauve la créature)", () => {
    let s = scenario({
      p1: { battlefield: ["Mountain"], hand: ["Burst Lightning"] },
      p2: { battlefield: ["Forest", "Bear Cub"], hand: ["Giant Growth"] },
    });
    const bear = idOf(s, "p2", "battlefield", "Bear Cub");
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Burst Lightning"), targets: { t: [bear] } });
    s = act(s, "p1", { type: "pass" });
    expect(s.pending).toEqual({ kind: "priority", player: "p2" });
    s = act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Giant Growth"), targets: { t: [bear] } });
    s = passBoth(s); // Giant Growth
    expect(chars(s, bear).power).toBe(5);
    s = passBoth(s); // Burst Lightning
    expect(s.objects[bear]?.damage).toBe(2);
    expect(s.battlefield).toContain(bear);
  });

  it("règle 400.7 : un sort dont la cible est morte ne se résout pas", () => {
    let s = scenario({
      p1: { battlefield: ["Forest", "Bear Cub"], hand: ["Giant Growth"] },
      p2: { battlefield: ["Mountain"], hand: ["Burst Lightning"] },
    });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Giant Growth"), targets: { t: [bear] } });
    s = act(s, "p1", { type: "pass" });
    s = act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Burst Lightning"), targets: { t: [bear] } });
    s = passBoth(s); // Burst tue l'ours
    expect(s.objects[bear]).toBeUndefined();
    const deadBear = idOf(s, "p1", "graveyard", "Bear Cub");
    expect(deadBear).not.toBe(bear);
    const { events } = submit(s, s.pending?.player as string, { type: "pass" });
    const after = submit(submit(s, "p1", { type: "pass" }).state, "p2", { type: "pass" });
    expect([...events, ...after.events].some((e) => e.type === "fizzle")).toBe(true);
    expect(idsOf(after.state, "p1", "graveyard", "Giant Growth")).toHaveLength(1);
  });

  it("défense talismanique : pas de cible adverse", () => {
    const hexproof = customCard({ name: "Ours protégé", power: 2, toughness: 2, keywords: ["hexproof"] });
    const s = scenario({ p1: { battlefield: ["Mountain"], hand: ["Burst Lightning"] }, p2: { battlefield: [hexproof] } });
    const cast = legalActions(s, "p1").find((a) => a.type === "cast");
    expect(cast?.type === "cast" && cast.modes[0]?.targets[0]?.legal).toEqual(["p1", "p2"]);
  });

  it("kicker : Burst Lightning inflige 4", () => {
    let s = scenario({ p1: { battlefield: Array(5).fill("Mountain"), hand: ["Burst Lightning"] } });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Burst Lightning"), targets: { t: ["p2"] }, kicked: true });
    s = passBoth(s);
    expect(s.players.p2?.life).toBe(16);
  });

  it("sort modal : Abrade, mode blessures", () => {
    let s = scenario({
      p1: { battlefield: ["Mountain", "Mountain"], hand: ["Abrade"] },
      p2: { battlefield: ["Magnigoth Sentry"] },
    });
    const sentry = idOf(s, "p2", "battlefield", "Magnigoth Sentry");
    const opt = legalActions(s, "p1").find((a) => a.type === "cast");
    expect(opt?.type === "cast" && opt.modes.map((m) => m.index)).toEqual([0]); // pas d'artefact : mode 2 indisponible
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Abrade"), mode: 0, targets: { t: [sentry] } });
    s = passBoth(s);
    expect(s.objects[sentry]?.damage).toBe(3);
  });

  it("X et combat : Primal Might X=2 puis combat", () => {
    let s = scenario({
      p1: { battlefield: ["Forest", "Forest", "Forest", "Bear Cub"], hand: ["Primal Might"] },
      p2: { battlefield: ["Fire Elemental"] },
    });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    const fire = idOf(s, "p2", "battlefield", "Fire Elemental");
    const opt = legalActions(s, "p1").find((a) => a.type === "cast");
    expect(opt?.type === "cast" && opt.xMax).toBe(2);
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Primal Might"), x: 2, targets: { a: [bear], b: [fire] } });
    s = passBoth(s);
    // L'ours (4/4) inflige 4 à l'Élémental (5/4) qui meurt ; l'Élémental inflige 5 à l'ours qui meurt aussi.
    expect(s.objects[fire]).toBeUndefined();
    expect(s.objects[bear]).toBeUndefined();
  });

  it("Bite Down utilise la créature comme source (contact mortel)", () => {
    let s = scenario({
      p1: { battlefield: ["Forest", "Forest", "Thornweald Archer"], hand: ["Bite Down"] },
      p2: { battlefield: ["Quakestrider Ceratops"] },
    });
    const archer = idOf(s, "p1", "battlefield", "Thornweald Archer");
    const cera = idOf(s, "p2", "battlefield", "Quakestrider Ceratops");
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Bite Down"), targets: { a: [archer], b: [cera] } });
    s = passBoth(s);
    expect(s.objects[cera]).toBeUndefined();
  });

  it("jetons : Dragon Fodder crée deux gobelins, qui disparaissent en mourant", () => {
    let s = scenario({ p1: { battlefield: ["Mountain", "Mountain", "Mountain"], hand: ["Dragon Fodder", "Burst Lightning"] } });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Dragon Fodder") });
    s = passBoth(s);
    const goblins = idsOf(s, "p1", "battlefield", "Goblin");
    expect(goblins).toHaveLength(2);
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Burst Lightning"), targets: { t: [goblins[0] as string] } });
    s = passBoth(s);
    expect(idsOf(s, "p1", "battlefield", "Goblin")).toHaveLength(1);
    expect(s.players.p1?.graveyard.some((id) => s.objects[id]?.isToken)).toBe(false);
  });

  it("capacité activée avec sacrifice : Fanatical Firebrand", () => {
    let s = scenario({ p1: { battlefield: ["Fanatical Firebrand"] } });
    const fb = idOf(s, "p1", "battlefield", "Fanatical Firebrand");
    s = act(s, "p1", { type: "activate", source: fb, ability: 0, targets: { t: ["p2"] } });
    expect(idsOf(s, "p1", "graveyard", "Fanatical Firebrand")).toHaveLength(1);
    s = passBoth(s);
    expect(s.players.p2?.life).toBe(19);
  });
});

describe("combat", () => {
  function toCombat(s: ReturnType<typeof scenario>) {
    return passUntil(s, (x) => x.pending?.kind === "declareAttackers");
  }

  it("attaque non bloquée, vigilance", () => {
    let s = toCombat(scenario({ p1: { battlefield: ["Tajuru Pathwarden"] } }));
    const t = idOf(s, "p1", "battlefield", "Tajuru Pathwarden");
    s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: t, defender: "p2" }] });
    expect(s.objects[t]?.tapped).toBe(false);
    s = passUntil(s, (x) => x.turn.step === "main2");
    expect(s.players.p2?.life).toBe(15);
  });

  it("piétinement : le surplus passe au joueur", () => {
    let s = toCombat(scenario({ p1: { battlefield: ["Tajuru Pathwarden"] }, p2: { battlefield: ["Bear Cub"] } }));
    const t = idOf(s, "p1", "battlefield", "Tajuru Pathwarden");
    const bear = idOf(s, "p2", "battlefield", "Bear Cub");
    s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: t, defender: "p2" }] });
    s = passUntil(s, (x) => x.pending?.kind === "declareBlockers");
    s = act(s, "p2", { type: "declareBlockers", blocks: [{ blocker: bear, attacker: t }] });
    s = passUntil(s, (x) => x.turn.step === "main2");
    expect(s.players.p2?.life).toBe(17);
    expect(s.objects[bear]).toBeUndefined();
  });

  it("contact mortel + piétinement : 1 blessure suffit au bloqueur", () => {
    const wurm = customCard({ name: "Guivre", power: 4, toughness: 4, keywords: ["deathtouch", "trample"] });
    let s = toCombat(scenario({ p1: { battlefield: [wurm] }, p2: { battlefield: ["Fire Elemental"] } }));
    const w = idsOf(s, "p1", "battlefield", "Guivre")[0] as string;
    const fire = idOf(s, "p2", "battlefield", "Fire Elemental");
    s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: w, defender: "p2" }] });
    s = passUntil(s, (x) => x.pending?.kind === "declareBlockers");
    s = act(s, "p2", { type: "declareBlockers", blocks: [{ blocker: fire, attacker: w }] });
    s = passUntil(s, (x) => x.turn.step === "main2");
    expect(s.players.p2?.life).toBe(17);
    expect(s.objects[fire]).toBeUndefined();
  });

  it("double initiative : Raging Redcap tue un 2/2 en deux étapes et meurt au second coup", () => {
    let s = toCombat(scenario({ p1: { battlefield: ["Raging Redcap"] }, p2: { battlefield: ["Bear Cub"] } }));
    const r = idOf(s, "p1", "battlefield", "Raging Redcap");
    const bear = idOf(s, "p2", "battlefield", "Bear Cub");
    s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: r, defender: "p2" }] });
    s = passUntil(s, (x) => x.pending?.kind === "declareBlockers");
    s = act(s, "p2", { type: "declareBlockers", blocks: [{ blocker: bear, attacker: r }] });
    s = passUntil(s, (x) => x.turn.step === "firstStrikeDamage");
    expect(s.objects[bear]?.damage).toBe(1);
    s = passUntil(s, (x) => x.turn.step === "main2");
    expect(s.objects[bear]).toBeUndefined();
    expect(s.objects[r]).toBeUndefined();
  });

  it("initiative : Kindled Fury permet de tuer sans être blessé", () => {
    let s = toCombat(
      scenario({ p1: { battlefield: ["Mountain", "Swab Goblin"], hand: ["Kindled Fury"] }, p2: { battlefield: ["Bear Cub"] } }),
    );
    const g = idOf(s, "p1", "battlefield", "Swab Goblin");
    const bear = idOf(s, "p2", "battlefield", "Bear Cub");
    s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: g, defender: "p2" }] });
    s = passUntil(s, (x) => x.pending?.kind === "declareBlockers");
    s = act(s, "p2", { type: "declareBlockers", blocks: [{ blocker: bear, attacker: g }] });
    expect(s.pending).toEqual({ kind: "priority", player: "p1" });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Kindled Fury"), targets: { t: [g] } });
    s = passBoth(s);
    s = passUntil(s, (x) => x.turn.step === "main2");
    expect(s.objects[bear]).toBeUndefined();
    expect(s.objects[g]?.damage ?? 0).toBe(0);
  });

  it("vol et portée : seule une créature avec vol ou portée bloque un volant", () => {
    const flier = customCard({ name: "Oiseau", power: 1, toughness: 1, keywords: ["flying"] });
    let s = toCombat(scenario({ p1: { battlefield: [flier] }, p2: { battlefield: ["Bear Cub", "Magnigoth Sentry"] } }));
    const f = idsOf(s, "p1", "battlefield", "Oiseau")[0] as string;
    s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: f, defender: "p2" }] });
    s = passUntil(s, (x) => x.pending?.kind === "declareBlockers");
    const bear = idOf(s, "p2", "battlefield", "Bear Cub");
    const sentry = idOf(s, "p2", "battlefield", "Magnigoth Sentry");
    expect(() => act(s, "p2", { type: "declareBlockers", blocks: [{ blocker: bear, attacker: f }] })).toThrow();
    s = act(s, "p2", { type: "declareBlockers", blocks: [{ blocker: sentry, attacker: f }] });
    expect(s.combat?.attackers[0]?.blocked).toBe(true);
  });

  it("menace : un seul bloqueur est illégal", () => {
    const brute = customCard({ name: "Brute", power: 3, toughness: 3, keywords: ["menace"] });
    let s = toCombat(scenario({ p1: { battlefield: [brute] }, p2: { battlefield: ["Bear Cub", "Swab Goblin"] } }));
    const b = idsOf(s, "p1", "battlefield", "Brute")[0] as string;
    s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: b, defender: "p2" }] });
    s = passUntil(s, (x) => x.pending?.kind === "declareBlockers");
    const bear = idOf(s, "p2", "battlefield", "Bear Cub");
    const gob = idOf(s, "p2", "battlefield", "Swab Goblin");
    expect(() => act(s, "p2", { type: "declareBlockers", blocks: [{ blocker: bear, attacker: b }] })).toThrow(/menace/);
    s = act(s, "p2", {
      type: "declareBlockers",
      blocks: [
        { blocker: bear, attacker: b },
        { blocker: gob, attacker: b },
      ],
    });
    s = passUntil(s, (x) => x.turn.step === "main2");
    expect(s.objects[b]).toBeUndefined();
  });
});

describe("actions basées sur l'état et fin de partie", () => {
  it("0 point de vie : la partie se termine", () => {
    let s = scenario({ p1: { battlefield: ["Mountain"], hand: ["Boltwave"] }, p2: { life: 3 } });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Boltwave") });
    s = passBoth(s);
    expect(s.over).toBe(true);
    expect(s.winner).toBe("p1");
    expect(s.pending).toBeNull();
  });

  it("piocher dans une bibliothèque vide fait perdre", () => {
    let s = scenario({ active: "p2", step: "end", p1: { library: [] } });
    s = passUntil(s, (x) => x.over);
    expect(s.winner).toBe("p2");
  });

  it("nettoyage : défausse jusqu'à 7 cartes", () => {
    let s = scenario({ step: "end", p1: { hand: Array(9).fill("Forest") } });
    s = passBoth(s);
    expect(s.pending).toEqual({ kind: "discard", player: "p1", count: 2 });
    const hand = s.players.p1?.hand ?? [];
    s = act(s, "p1", { type: "discard", cards: hand.slice(0, 2) });
    expect(s.players.p1?.hand).toHaveLength(7);
    expect(s.turn.active).toBe("p2");
  });

  it("les blessures et effets de fin de tour disparaissent au nettoyage", () => {
    let s = scenario({ step: "main2", p1: { battlefield: ["Forest", { name: "Bear Cub", damage: 1 }], hand: ["Giant Growth"] } });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Giant Growth"), targets: { t: [bear] } });
    s = passBoth(s);
    expect(chars(s, bear).power).toBe(5);
    s = passUntil(s, (x) => x.turn.active === "p2");
    expect(chars(s, bear).power).toBe(2);
    expect(s.objects[bear]?.damage).toBe(0);
  });
});

describe("autopilot", () => {
  it("passe quand il n'y a rien à faire", () => {
    const s = scenario({ p1: { battlefield: ["Forest"] } });
    expect(autopilotDecision(s, "p1", DEFAULT_AUTOPILOT)).toEqual({ type: "pass" });
  });

  it("s'arrête en phase principale quand on peut jouer", () => {
    const s = scenario({ p1: { hand: ["Forest"] } });
    expect(autopilotDecision(s, "p1", DEFAULT_AUTOPILOT)).toBeNull();
  });

  it("laisse résoudre son propre sort, mais s'arrête sur un sort adverse si on peut répondre", () => {
    let s = scenario({
      p1: { battlefield: ["Mountain", "Mountain"], hand: ["Burst Lightning", "Burst Lightning"] },
      p2: { battlefield: ["Forest"], hand: ["Giant Growth"] },
    });
    s = act(s, "p1", { type: "cast", card: idsOf(s, "p1", "hand", "Burst Lightning")[0] as string, targets: { t: ["p2"] } });
    expect(autopilotDecision(s, "p1", DEFAULT_AUTOPILOT)).toEqual({ type: "pass" });
    s = act(s, "p1", { type: "pass" });
    // p2 peut lancer Giant Growth ? Non : aucune créature. Il passe automatiquement.
    expect(autopilotDecision(s, "p2", DEFAULT_AUTOPILOT)).toEqual({ type: "pass" });
  });

  it("« fin du tour » : ne déclare aucun attaquant et passe tout", () => {
    let s = scenario({ p1: { battlefield: ["Bear Cub"], hand: ["Forest"] } });
    const settings = { ...DEFAULT_AUTOPILOT, passUntilTurn: s.turn.number };
    for (let i = 0; i < 50 && s.turn.active === "p1"; i++) {
      const p = s.pending;
      if (!p) break;
      const d = p.player === "p1" ? autopilotDecision(s, "p1", settings) : autopilotDecision(s, "p2", DEFAULT_AUTOPILOT);
      s = act(s, p.player, d ?? { type: "pass" });
    }
    expect(s.turn.active).toBe("p2");
    expect(s.players.p2?.life).toBe(20);
  });
});
