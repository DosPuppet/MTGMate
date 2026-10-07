/**
 * Commander (pseudo-ensemble EDH) : tests de règles du préconstruit « The Fantastic Four » (Marvel Super Heroes).
 * Héros qui s'éveillent après un sort non-créature, contrôle rendu aux propriétaires, règle des légendes levée,
 * copies, équiper un commandant, sort mis au-dessous de la bibliothèque.
 */
import { describe, expect, it } from "vitest";
import { destroy } from "../src/actions";
import { chars } from "../src/layers";
import { legalActions } from "../src/legal";
import { moveObject, random } from "../src/state";
import type { GameState, PlayerId } from "../src/types";
import {
  act,
  advanceUntil,
  attackPlayer,
  castable,
  customCard,
  idOf,
  idsOf,
  lands,
  nameOf,
  namesIn,
  scenario,
  settle,
  steal,
  throughCombat,
} from "./helpers";

const hand = (s: GameState, p: PlayerId) => s.players[p]?.hand.length ?? 0;
const onField = (s: GameState, p: PlayerId, name: string) => idsOf(s, p, "battlefield", name).length;
const tokens = (s: GameState, p: PlayerId, name?: string) =>
  s.battlefield.filter((id) => s.objects[id]?.isToken && s.objects[id]?.controller === p && (!name || nameOf(s, id) === name));
const castIt = (s: GameState, p: PlayerId, name: string, extra: object = {}) =>
  act(s, p, { type: "cast", card: idOf(s, p, "hand", name), ...extra } as never);
const toCombat = (s: GameState) =>
  advanceUntil(
    s,
    (x) =>
      x.turn.step === "beginCombat" && (x.pending?.kind === "choice" || x.stack.length > 0 || x.pending?.kind === "priority"),
    50,
  );

describe("The Fantastic Four (EDH)", () => {
  it("Invisible Woman : après un sort non-créature, un Mur 0/3 au début du combat ; rien sans", () => {
    let s = scenario({ p1: { battlefield: ["Invisible Woman", "Island"], hand: ["Opt"], library: lands("Island", 3) } });
    s = settle(castIt(s, "p1", "Opt"));
    s = settle(toCombat(s));
    expect(tokens(s, "p1", "Wall")).toHaveLength(1);
    let t = scenario({ p1: { battlefield: ["Invisible Woman"] } });
    t = settle(toCombat(t));
    expect(tokens(t, "p1", "Wall")).toHaveLength(0);
  });

  it("Alicia Masters : à votre étape de fin, chaque joueur reprend les créatures qu'il possède", () => {
    let s = scenario({ p1: { battlefield: ["Alicia Masters, Skilled Sculptor"] }, p2: { battlefield: ["Bear Cub"] } });
    const bear = idOf(s, "p2", "battlefield", "Bear Cub");
    s = steal(s, bear, "p1");
    expect(s.objects[bear]?.controller).toBe("p1");
    s = advanceUntil(s, (x) => x.turn.step === "end" && x.stack.length === 0 && x.pending?.kind === "priority", 100);
    expect(s.objects[bear]?.controller).toBe("p2");
  });

  it("Council of Reeds : la règle des légendes ne s'applique pas à vos créatures ; une copie après un sort non-créature", () => {
    let s = scenario({ p1: { battlefield: ["Council of Reeds", "Island"], hand: ["Opt"], library: lands("Island", 3) } });
    s = settle(castIt(s, "p1", "Opt"));
    s = settle(toCombat(s));
    expect(onField(s, "p1", "Council of Reeds")).toBe(2);
  });

  it("Crystal : un sort non-créature inflige autant de blessures que de couleurs à chaque adversaire", () => {
    let s = scenario({
      p1: { battlefield: ["Crystal, Inhuman Princess", "Plains", "Swamp", "Island"], hand: ["Vindicate"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    s = settle(castIt(s, "p1", "Vindicate", { targets: { t: [idOf(s, "p2", "battlefield", "Bear Cub")] } }));
    expect(s.players.p2?.life).toBe(18);
  });

  it("Dragon Man : force égale à la plus grande valeur de mana parmi vos permanents et cartes non-créature", () => {
    const s = scenario({
      p1: { battlefield: ["Dragon Man, Reformed Robot", "Sol Ring"], graveyard: ["Vindicate", "Gigantosaurus"] },
    });
    expect(chars(s, idOf(s, "p1", "battlefield", "Dragon Man, Reformed Robot")).power).toBe(3);
  });

  it("Valeria Richards : vos sorts non-créature coûtent {1} de moins ; le premier fait piocher", () => {
    let s = scenario({
      p1: { battlefield: ["Valeria Richards, Precocious", "Swamp", "Plains"], hand: ["Vindicate"], library: lands("Island", 3) },
      p2: { battlefield: ["Bear Cub"] },
    });
    const card = idOf(s, "p1", "hand", "Vindicate");
    expect(castable(s, "p1", card)).toBe(true);
    const h = hand(s, "p1");
    s = settle(castIt(s, "p1", "Vindicate", { targets: { t: [idOf(s, "p2", "battlefield", "Bear Cub")] } }));
    expect(hand(s, "p1")).toBe(h - 1 + 1);
  });

  it("Monologue Tax : le deuxième sort d'un adversaire dans un tour crée un Trésor", () => {
    let s = scenario({
      active: "p2",
      p1: { battlefield: ["Monologue Tax"] },
      p2: { battlefield: lands("Island", 2), hand: ["Opt", "Opt"], library: lands("Island", 4) },
    });
    s = settle(castIt(s, "p2", "Opt"));
    expect(tokens(s, "p1", "Treasure")).toHaveLength(0);
    s = settle(castIt(s, "p2", "Opt"));
    expect(tokens(s, "p1", "Treasure")).toHaveLength(1);
  });

  it("Nova Flame : X marqueurs sur votre créature, qui blesse chaque autre créature d'autant que sa force", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Mountain", 5), "Bear Cub"], hand: ["Nova Flame"] },
      p2: { battlefield: ["Serra Angel", "Savannah Lions"] },
    });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = settle(castIt(s, "p1", "Nova Flame", { x: 1, targets: { t: [bear] } }));
    // 3/3 : Savannah Lions meurt, Serra Angel (4/4) survit ; l'Ourson n'est pas blessé.
    expect([onField(s, "p2", "Savannah Lions"), onField(s, "p2", "Serra Angel"), s.objects[bear]?.damage]).toEqual([0, 1, 0]);
  });

  it("Tragic Arrogance : chaque joueur garde un permanent de chaque type ; les terrains restent", () => {
    let s = scenario({
      p1: { battlefield: lands("Plains", 5), hand: ["Tragic Arrogance"] },
      p2: { battlefield: ["Bear Cub", "Savannah Lions", "Forest", "Forest", "Sol Ring", "Arcane Signet"] },
    });
    s = settle(castIt(s, "p1", "Tragic Arrogance"));
    expect(onField(s, "p2", "Forest")).toBe(2);
    expect(onField(s, "p2", "Bear Cub") + onField(s, "p2", "Savannah Lions")).toBe(1);
    expect(onField(s, "p2", "Sol Ring") + onField(s, "p2", "Arcane Signet")).toBe(1);
    expect(onField(s, "p1", "Plains")).toBe(5);
  });

  it("Tragic Arrogance à trois : vous choisissez pour chaque joueur, puis tous sacrifient en même temps", () => {
    // Oracle : « For each player, you choose from among the permanents that player controls an artifact, a creature, an
    // enchantment, and a planeswalker. Then each player sacrifices all other nonland permanents they control. »
    const vault = customCard({ name: "Test Vault", typeLine: "Artifact Land", types: ["Artifact", "Land"] });
    let s = scenario({
      players: 3,
      p1: { battlefield: [...lands("Plains", 5), "Bear Cub", "Savannah Lions"], hand: ["Tragic Arrogance"] },
      p2: { battlefield: [vault, "Sol Ring", "Arcane Signet", "Serra Angel", "Bear Cub"] },
      p3: { battlefield: ["Adaptive Automaton", "Arcane Signet", "Llanowar Elves"] },
    });
    const field = s.battlefield.length;
    const asked: string[] = [];
    // p2 : l'artefact-terrain comme artefact (ses vrais artefacts sont sacrifiés) ; p3 : l'artefact-créature deux fois.
    const want = ["Savannah Lions", "Test Vault", "Bear Cub", "Adaptive Automaton"];
    s = settle(castIt(s, "p1", "Tragic Arrogance"), (req, p, cur) => {
      if (req.type !== "pick" || req.intent !== "keepPerType" || !cur) return undefined;
      // Aucun permanent n'est sacrifié avant la fin des choix.
      expect(cur.battlefield.length).toBe(field);
      const owner = cur.objects[req.options[0] as string]?.controller;
      asked.push(`${p}:${owner}`);
      const name = want.find((w) => req.options.some((id) => nameOf(cur, id) === w));
      return req.options.filter((id) => nameOf(cur, id) === name).slice(0, 1);
    });
    expect(asked).toEqual(["p1:p1", "p1:p2", "p1:p2", "p1:p3", "p1:p3"]);
    expect([onField(s, "p1", "Savannah Lions"), onField(s, "p1", "Bear Cub"), onField(s, "p1", "Plains")]).toEqual([1, 0, 5]);
    expect(onField(s, "p2", "Test Vault") + onField(s, "p2", "Bear Cub")).toBe(2);
    expect(onField(s, "p2", "Sol Ring") + onField(s, "p2", "Arcane Signet") + onField(s, "p2", "Serra Angel")).toBe(0);
    expect([
      onField(s, "p3", "Adaptive Automaton"),
      onField(s, "p3", "Arcane Signet"),
      onField(s, "p3", "Llanowar Elves"),
    ]).toEqual([1, 0, 0]);
  });

  it("Ultimate Nullification : sacrifiez une créature légendaire ; exile créatures et cimetières ; au-dessous de la bibliothèque", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Plains", 5), "Invisible Woman"], hand: ["Ultimate Nullification"], graveyard: ["Opt"] },
      p2: { battlefield: ["Serra Angel"], graveyard: ["Bear Cub"] },
    });
    s = settle(castIt(s, "p1", "Ultimate Nullification", { sacrifice: [idOf(s, "p1", "battlefield", "Invisible Woman")] }));
    // Invisible Woman, sacrifiée en coût, est exilée avec les cimetières ; le sort finit au-dessous de la bibliothèque.
    expect([onField(s, "p2", "Serra Angel"), s.players.p2?.graveyard.length, s.players.p1?.graveyard.length]).toEqual([0, 0, 0]);
    const lib = s.players.p1?.library ?? [];
    expect(nameOf(s, lib[lib.length - 1] ?? "")).toBe("Ultimate Nullification");
  });

  it("Unstable Molecule Suit : « Équiper un commandant {2} » ne cible qu'un commandant", () => {
    const s = scenario({ p1: { battlefield: ["Unstable Molecule Suit", "Bear Cub", ...lands("Plains", 4)] } });
    const suit = idOf(s, "p1", "battlefield", "Unstable Molecule Suit");
    const labels = legalActions(s, "p1")
      .filter((a) => a.type === "activate" && a.source === suit)
      .map((a) => (a.type === "activate" ? a.label : ""));
    // Pas de commandant en jeu : seule l'option à {4} est proposée.
    expect(labels.some((l) => l?.includes("commandant"))).toBe(false);
    expect(labels.some((l) => l?.includes("{4}"))).toBe(true);
  });
});

describe("The Fantastic Four : approximations levées (PLAN-H, H2c)", () => {
  it("Black Bolt : ciblé par un adversaire, il détruit un permanent non-terrain de CE joueur (pas d'un autre adversaire)", () => {
    let s = scenario({
      players: 3,
      active: "p2",
      p1: { battlefield: ["Black Bolt, Inhuman King"] },
      p2: { battlefield: ["Mountain", "Bear Cub", "Serra Angel"], hand: ["Shock"] },
      p3: { battlefield: ["Llanowar Elves"] },
    });
    const bolt = idOf(s, "p1", "battlefield", "Black Bolt, Inhuman King");
    s = act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Shock"), targets: { t: [bolt] } });
    const offered: (string | undefined)[][] = [];
    s = settle(s, (req, _p, cur) => {
      if (req.type !== "pick" || req.intent !== "triggerTarget") return undefined;
      offered.push(namesIn(cur, req.options));
      return req.options.filter((id) => nameOf(cur, String(id)) === "Bear Cub");
    });
    // Les permanents non-terrain du joueur qui a ciblé Black Bolt, pas ceux de p3.
    expect(offered.map((x) => [...x].sort())).toEqual([["Bear Cub", "Serra Angel"]]);
    expect(idsOf(s, "p2", "battlefield", "Bear Cub")).toHaveLength(0);
    expect(idsOf(s, "p3", "battlefield", "Llanowar Elves")).toHaveLength(1);
  });

  it("Namor : il attaque un joueur qui a plus de PV que vous → +2/+0 à vos autres attaquants ; un autre adversaire ne compte pas", () => {
    const run = (defender: "p2" | "p3") => {
      let s = scenario({
        players: 3,
        p1: { battlefield: ["Namor, Atlantean King", "Bear Cub"] },
        p2: { life: 25 },
        p3: { life: 15 },
      });
      const cub = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(attackPlayer(s, [idOf(s, "p1", "battlefield", "Namor, Atlantean King"), cub], defender));
      return chars(s, cub).power;
    };
    expect(run("p2")).toBe(4);
    // p3 a moins de PV que vous : pas de bonus, même si p2 en a plus.
    expect(run("p3")).toBe(2);
  });

  it("Namor tué en réponse à son déclencheur d'attaque : vos autres créatures qui attaquent ce joueur gagnent quand même +2/+0 (508.5)", () => {
    let s = scenario({ players: 3, p1: { battlefield: ["Namor, Atlantean King", "Bear Cub"] }, p2: { life: 25 } });
    const namor = idOf(s, "p1", "battlefield", "Namor, Atlantean King");
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    s = attackPlayer(s, [namor, cub], "p2");
    s = advanceUntil(s, (x) => x.stack.length > 0 && x.pending?.kind === "priority");
    destroy(s, namor);
    s = settle(s);
    expect(idsOf(s, "p1", "battlefield", "Namor, Atlantean King")).toHaveLength(0);
    expect(chars(s, cub).power).toBe(4);
  });

  it("Negative Zone Portal : pile ou face perdu, il est sacrifié et une carte exilée avec lui, tirée au hasard, revient en main", () => {
    const names = ["Bear Cub", "Llanowar Elves", "Serra Angel", "Shivan Dragon"];
    const start = () => {
      let s = scenario({ active: "p2", p1: { battlefield: ["Negative Zone Portal"] }, p2: { graveyard: names } });
      const portal = s.objects[idOf(s, "p1", "battlefield", "Negative Zone Portal")];
      const exiledCards = names.map((n) => moveObject(s, idOf(s, "p2", "graveyard", n), "exile") as string);
      if (portal) portal.linked = exiledCards;
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "upkeep" && x.stack.length > 0);
      return s;
    };
    // Des états du générateur où le lancer est perdu ; la carte rendue varie avec le tirage.
    const losing = Array.from({ length: 200 }, (_, r) => r).filter((r) => random({ rng: r } as unknown as GameState) >= 0.5);
    const returned = new Set<string | undefined>();
    for (const r of losing.slice(0, 12)) {
      let s = start();
      s.rng = r;
      s = settle(s);
      expect(idsOf(s, "p1", "battlefield", "Negative Zone Portal")).toHaveLength(0);
      const hand = namesIn(s, s.players.p2?.hand).filter((n) => names.includes(n ?? ""));
      expect(hand).toHaveLength(1);
      returned.add(hand[0]);
    }
    expect(returned.size).toBeGreaterThan(1);
  });
});

describe("The Fantastic Four (EDH) : provocation et exigences d'attaque (PLAN-H, lot H3)", () => {
  const declare = (s: GameState, p: PlayerId, attackers: { id: string; defender: string }[]) =>
    act(s, p, { type: "declareAttackers", attackers });
  const toAttacks = (s: GameState, p: PlayerId) =>
    advanceUntil(s, (x) => x.pending?.kind === "declareAttackers" && x.pending.player === p);

  it("Taunt from the Rampart : créatures adverses provoquées, qui ne peuvent pas bloquer, jusqu'à votre prochain tour", () => {
    let s = scenario({
      players: 3,
      p1: { battlefield: [...lands("Mountain", 3), ...lands("Plains", 2)], hand: ["Taunt from the Rampart"] },
      p2: { battlefield: ["Bear Cub"] },
      p3: { battlefield: ["Savannah Lions"] },
    });
    s = settle(castIt(s, "p1", "Taunt from the Rampart"));
    const bear = idOf(s, "p2", "battlefield", "Bear Cub");
    const lions = idOf(s, "p3", "battlefield", "Savannah Lions");
    expect(chars(s, lions).keywords).toContain("cantBlock");
    s = toAttacks(s, "p2");
    expect(() => declare(s, "p2", [])).toThrow();
    // Provoquée par p1 : un joueur autre que p1 si possible.
    expect(() => declare(s, "p2", [{ id: bear, defender: "p1" }])).toThrow();
    s = declare(s, "p2", [{ id: bear, defender: "p3" }]);
    s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1");
    expect(chars(s, bear).blockRules).toEqual([]);
    expect(chars(s, lions).keywords).not.toContain("cantBlock");
  });

  it("Galactus : il attaque à chaque combat un adversaire qui a le plus de points de vie, sauf avec Silver Surfer", () => {
    let s = scenario({
      players: 3,
      p1: { battlefield: ["Galactus, Devourer of Worlds"] },
      p2: { life: 25 },
      p3: { life: 30 },
    });
    const galactus = idOf(s, "p1", "battlefield", "Galactus, Devourer of Worlds");
    s = toAttacks(s, "p1");
    expect(() => declare(s, "p1", [])).toThrow();
    expect(() => declare(s, "p1", [{ id: galactus, defender: "p2" }])).toThrow();
    expect(() => declare(s, "p1", [{ id: galactus, defender: "p3" }])).not.toThrow();
    // Égalité : l'un ou l'autre.
    let tie = scenario({ players: 3, p1: { battlefield: ["Galactus, Devourer of Worlds"] } });
    tie = toAttacks(tie, "p1");
    expect(() => declare(tie, "p1", [{ id: galactus, defender: "p2" }])).not.toThrow();
    expect(() => declare(tie, "p1", [{ id: galactus, defender: "p3" }])).not.toThrow();
    let surfer = scenario({
      players: 3,
      p1: { battlefield: ["Galactus, Devourer of Worlds", "Silver Surfer, Galactus's Herald"] },
      p3: { life: 30 },
    });
    surfer = toAttacks(surfer, "p1");
    expect(() => declare(surfer, "p1", [])).not.toThrow();
  });

  it("Silver Surfer : la créature ciblée attaque le joueur blessé à chaque combat si possible, jusqu'à la fin de votre prochain tour", () => {
    let s = scenario({
      players: 3,
      p1: { battlefield: ["Silver Surfer, Galactus's Herald"] },
      p3: { battlefield: ["Bear Cub"] },
    });
    const surfer = idOf(s, "p1", "battlefield", "Silver Surfer, Galactus's Herald");
    const bear = idOf(s, "p3", "battlefield", "Bear Cub");
    s = attackPlayer(s, [surfer], "p2");
    s = throughCombat(s, (req) => (req.type === "pick" && req.intent === "triggerTarget" ? [bear] : undefined));
    expect(s.players.p2?.life).toBe(16);
    expect(chars(s, bear).blockRules.map((r) => r.mustAttackPlayer)).toEqual(["p2"]);
    s = toAttacks(s, "p3");
    expect(() => declare(s, "p3", [])).toThrow();
    expect(() => declare(s, "p3", [{ id: bear, defender: "p1" }])).toThrow();
    s = declare(s, "p3", [{ id: bear, defender: "p2" }]);
    // Pendant le prochain tour de p1, encore en vigueur ; ensuite, plus rien.
    s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main2");
    expect(chars(s, bear).blockRules).toHaveLength(1);
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    expect(chars(s, bear).blockRules).toEqual([]);
  });
});

describe("joueur attaqué en multijoueur (PLAN-H, lot H5)", () => {
  it("Namor, Atlantean King : seules vos autres créatures qui attaquent ce joueur gagnent +2/+0 ; rien contre un planeswalker", () => {
    const run = (namorAt: "p2" | "walker") => {
      let s = scenario({
        players: 3,
        p1: { battlefield: ["Namor, Atlantean King", "Bear Cub", "Llanowar Elves"], life: 10 },
        p2: { battlefield: ["Ajani Resolute"] },
      });
      const [namor, bear, elves] = ["Namor, Atlantean King", "Bear Cub", "Llanowar Elves"].map((n) =>
        idOf(s, "p1", "battlefield", n),
      );
      const walker = idOf(s, "p2", "battlefield", "Ajani Resolute");
      s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
      s = act(s, "p1", {
        type: "declareAttackers",
        attackers: [
          { id: namor as string, defender: namorAt === "walker" ? walker : "p2" },
          { id: bear as string, defender: "p2" },
          { id: elves as string, defender: "p3" },
        ],
      });
      s = settle(s);
      return [bear, elves].map((id) => chars(s, id as string).power);
    };
    expect(run("p2")).toEqual([4, 1]);
    expect(run("walker")).toEqual([2, 1]);
  });
});
