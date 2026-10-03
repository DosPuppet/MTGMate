/**
 * Attentes de l'Oracle sur des formes de texte qui reviennent (lot K5 de l'analyse du 03/10/2026) : mana des terrains,
 * « arrive engagé », bonus des Équipements, nombre de modes des sorts modaux. Chaque carte dont le texte a la forme est
 * vérifiée sur la partie : une carte qui ne la suit pas fait échouer le test, sauf écart voulu listé dans `EXCEPTIONS`
 * avec sa raison.
 */
import { type CardDef, chars, dsl, type GameState, legalActions, type ManaType } from "@mtgx/engine";
import { describe, expect, it } from "vitest";
import { manaAbilitiesOf } from "../../engine/src/mana";
import { act, customCard, idOf, scenario } from "../../engine/test/helpers";
import { stripReminder } from "../src/audit";
import { implementedCards } from "../src/index";

/** Écarts voulus : carte → raison. */
const EXCEPTIONS: Record<string, string> = {};

const cards = implementedCards().filter((c) => !c.isToken && !EXCEPTIONS[c.name]);
const lines = (c: CardDef) =>
  (c.text ?? "")
    .split("\n")
    .map((l) => stripReminder(l.trim()))
    .filter(Boolean);

// ---------------------------------------------------------------------------
// Mana des terrains : « {T}: Add {G}. », « {T}: Add {W} or {U}. », « {T}: Add one mana of any color. »
// ---------------------------------------------------------------------------

const ANY: ManaType[] = ["W", "U", "B", "R", "G"];
const SYMBOL = /\{([WUBRGC])\}/g;

/** Couleurs annoncées par une ligne « {T}: Add … » simple, ou null. */
function landMana(line: string): ManaType[] | null {
  if (line === "{T}: Add one mana of any color.") return ANY;
  if (!/^\{T\}: Add \{[WUBRGC]\}(?:(?:,| or|, or) \{[WUBRGC]\})*\.$/.test(line)) return null;
  return [...line.matchAll(SYMBOL)].map((m) => m[1] as ManaType);
}

const sameSet = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && [...a].sort().join() === [...b].sort().join();

describe("Oracle : mana des terrains (« {T}: Add … »)", () => {
  const cases = cards
    .filter((c) => c.types.includes("Land") && !c.faceDefs?.length)
    .map((c) => ({
      c,
      wanted: lines(c)
        .map(landMana)
        .filter((x): x is ManaType[] => !!x),
    }))
    .filter((x) => x.wanted.length > 0);

  it("le filtre reconnaît assez de terrains pour être utile", () => {
    expect(cases.length).toBeGreaterThanOrEqual(50);
  });

  it.each(cases.map((x) => [x.c.name, x] as const))("%s produit le mana de son texte", (_name, { c, wanted }) => {
    for (const colors of wanted) expect(producesAll(c, colors), `${c.name} : « {T}: Add ${colors.join("/")} »`).toBe(true);
  });

  it("le test sait échouer : un terrain qui annonce {G} mais produit {R} est détecté", () => {
    const faulty = customCard({
      name: "Faux Bosquet",
      typeLine: "Land",
      types: ["Land"],
      text: "{T}: Add {G}.",
      abilities: [dsl.manaAbility("R")],
    });
    expect(landMana("{T}: Add {G}.")).toEqual(["G"]);
    expect(producesAll(faulty, ["G"])).toBe(false);
  });
});

/** Une capacité « {T} : ajoutez un mana de l'une de ces couleurs », sans autre coût. */
function producesAll(c: CardDef, colors: ManaType[]): boolean {
  const s = scenario({ p1: { battlefield: [c] } });
  const id = idOf(s, "p1", "battlefield", c.name);
  return manaAbilitiesOf(s, id).some(
    (a) => a.cost.tap && !a.cost.mana && !a.cost.payLife && !a.cost.sacrificeSelf && a.amount === 1 && sameSet(a.produce, colors),
  );
}

// ---------------------------------------------------------------------------
// « This land enters tapped. » ; un terrain dont le texte ne parle pas d'être engagé arrive dégagé.
// ---------------------------------------------------------------------------

function playLand(name: string): { s: GameState; id: string } {
  let s = scenario({ p1: { hand: [name] } });
  const card = idOf(s, "p1", "hand", name);
  const opt = legalActions(s, "p1").find((a) => a.type === "playLand" && a.card === card && !a.payLife);
  if (opt?.type !== "playLand") throw new Error(`${name} : pas d'option pour jouer le terrain`);
  s = act(s, "p1", opt);
  // Choix « en arrivant » (type, couleur) : la réponse suggérée.
  for (let i = 0; i < 5 && s.pending?.kind === "choice"; i++)
    s = act(s, s.pending.player, { type: "choose", values: s.pending.request.suggested });
  return { s, id: idOf(s, "p1", "battlefield", name) };
}

describe("Oracle : terrains qui arrivent engagés", () => {
  const lands = cards.filter((c) => c.types.includes("Land") && !c.faceDefs?.length && !c.types.includes("Creature"));
  const tapped = lands.filter((c) => lines(c).includes("This land enters tapped."));
  const untapped = lands.filter((c) => !/tapped|untap|enters|As this land/i.test(c.text ?? ""));

  it("les filtres reconnaissent assez de terrains pour être utiles", () => {
    expect(tapped.length).toBeGreaterThanOrEqual(20);
    expect(untapped.length).toBeGreaterThanOrEqual(10);
  });

  it.each(tapped.map((c) => [c.name] as const))("%s arrive engagé", (name) => {
    const { s, id } = playLand(name);
    expect(s.objects[id]?.tapped).toBe(true);
  });

  it.each(untapped.map((c) => [c.name] as const))("%s arrive dégagé", (name) => {
    const { s, id } = playLand(name);
    expect(s.objects[id]?.tapped).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Équipements : « Equipped creature gets +N/+M [and has K]. »
// ---------------------------------------------------------------------------

const KEYWORDS: Record<string, string> = {
  flying: "flying",
  trample: "trample",
  vigilance: "vigilance",
  lifelink: "lifelink",
  deathtouch: "deathtouch",
  haste: "haste",
  menace: "menace",
  reach: "reach",
  "first strike": "firstStrike",
  "double strike": "doubleStrike",
  hexproof: "hexproof",
  indestructible: "indestructible",
  ward: "ward",
};

function equipBonus(line: string): { p: number; t: number; keywords: string[] } | null {
  const m = /^Equipped creature gets ([+-]\d+)\/([+-]\d+)(?: and has ([a-z ,]+?))?\.$/.exec(line);
  if (!m) return null;
  const keywords = (m[3] ?? "")
    .split(/, and |, | and /)
    .filter(Boolean)
    .map((k) => KEYWORDS[k.trim()]);
  if (keywords.some((k) => !k)) return null;
  return { p: Number(m[1]), t: Number(m[2]), keywords: keywords as string[] };
}

describe("Oracle : bonus des Équipements", () => {
  const cases = cards
    .filter((c) => c.subtypes.includes("Equipment") && !c.faceDefs?.length && !c.types.includes("Creature"))
    .map((c) => ({
      c,
      bonus: lines(c)
        .map(equipBonus)
        .find((x) => !!x),
    }))
    .filter((x): x is { c: CardDef; bonus: NonNullable<ReturnType<typeof equipBonus>> } => !!x.bonus);

  it("le filtre reconnaît assez d'Équipements pour être utile", () => {
    expect(cases.length).toBeGreaterThanOrEqual(10);
  });

  it.each(cases.map((x) => [x.c.name, x] as const))("%s donne le bonus de son texte", (_name, { c, bonus }) => {
    const s = scenario({ p1: { battlefield: [c.name, "Bear Cub"] } });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    const before = chars(s, bear);
    const eq = s.objects[idOf(s, "p1", "battlefield", c.name)];
    if (!eq) throw new Error("Équipement absent");
    eq.attachedTo = bear;
    s.version += 1;
    const after = chars(s, bear);
    expect([after.power - before.power, after.toughness - before.toughness]).toEqual([bonus.p, bonus.t]);
    for (const k of bonus.keywords) expect(after.keywords, `${c.name} : ${k}`).toContain(k);
  });
});

// ---------------------------------------------------------------------------
// Sorts modaux : « Choose one — » suivi de N puces : N modes (combinaisons pour « one or both », « two », « one or more »).
// ---------------------------------------------------------------------------

const binom = (n: number, k: number): number => (k === 0 || k === n ? 1 : binom(n - 1, k - 1) + binom(n - 1, k));

function expectedModes(text: string): number | null {
  const all = text.split("\n").map((l) => l.trim());
  const head = all.find((l) => /^Choose (one|two|three|one or both|one or more) —$/.test(l));
  if (!head) return null;
  const n = all.filter((l) => l.startsWith("•")).length;
  if (n < 2) return null;
  if (head === "Choose one —") return n;
  if (head === "Choose two —") return binom(n, 2);
  if (head === "Choose three —") return binom(n, 3);
  if (head === "Choose one or both —") return n === 2 ? 3 : null;
  return 2 ** n - 1;
}

describe("Oracle : nombre de modes des sorts modaux", () => {
  const cases = cards
    .filter((c) => (c.types.includes("Instant") || c.types.includes("Sorcery")) && !c.faceDefs?.length && c.spell)
    .map((c) => ({ c, n: expectedModes(c.text ?? "") }))
    .filter((x): x is { c: CardDef; n: number } => x.n !== null);

  it("le filtre reconnaît assez de sorts pour être utile", () => {
    expect(cases.length).toBeGreaterThanOrEqual(20);
  });

  it.each(cases.map((x) => [x.c.name, x] as const))("%s a les modes de son texte", (_name, { c, n }) => {
    expect(c.spell?.modes.length).toBe(n);
  });
});
