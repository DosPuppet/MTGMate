/**
 * Commander (pseudo-ensemble EDH) : tests de règles du préconstruit « The Fantastic Four » (Marvel Super Heroes).
 * Héros qui s'éveillent après un sort non-créature, contrôle rendu aux propriétaires, règle des légendes levée,
 * copies, équiper un commandant, sort mis au-dessous de la bibliothèque.
 */
import { describe, expect, it } from "vitest";
import { chars } from "../src/layers";
import { legalActions } from "../src/legal";
import type { GameState, PlayerId } from "../src/types";
import { act, advanceUntil, castable, idOf, idsOf, lands, nameOf, scenario, settle, steal } from "./helpers";

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
