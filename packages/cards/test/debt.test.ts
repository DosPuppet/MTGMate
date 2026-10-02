/**
 * Garde-fou de la dette (audit du 30/09/2026, § 3.3 ; docs/plans/PLAN-R.md, lot F2 ; élargi par l'audit du 02/10/2026,
 * § 5.1, docs/plans/PLAN-C.md, lot C1) : pas de nouveau drapeau, mot-clé, opération, propriété ou champ propre à une carte
 * sans justification dans data/debt-baseline.json, et la référence ne fait que baisser. Règle : fin de CLAUDE.md.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import baseline from "../data/debt-baseline.json";
import { implementedCards } from "../src/index";
import { declaredFieldNames, engineLiterals, interfaceFields, largestImportCycle, unionVariants } from "./debtSurface";

const source = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

/** Champs de PlayerStaticAbilityDef (lignes indentées de deux espaces dans l'interface). */
function playerStaticKeys(): string[] {
  const body = /export interface PlayerStaticAbilityDef \{([\s\S]*?)\n\}/.exec(source("engine/src/model/cards.ts"))?.[1];
  if (!body) throw new Error("PlayerStaticAbilityDef introuvable");
  return [...body.matchAll(/^ {2}(\w+)\??:/gm)]
    .map((m) => m[1] as string)
    .filter((k) => !["kind", "condition", "label"].includes(k));
}

/** Membres de Keyword qui ne sont pas des mots-clés imprimés (valeurs de KEYWORD_NAMES dans scryfall.ts). */
function nonPrintedKeywords(): string[] {
  // Commentaires retirés d'abord : un « ; » dans un commentaire couperait l'union.
  const types = source("engine/src/types.ts").replace(/\/\*[\s\S]*?\*\//g, "");
  const union = /export type Keyword =([\s\S]*?);/.exec(types)?.[1];
  const names = /const KEYWORD_NAMES[^{]*\{([\s\S]*?)\n\};/.exec(source("cards/src/scryfall.ts"))?.[1];
  if (!union || !names) throw new Error("Keyword ou KEYWORD_NAMES introuvable");
  const printed = new Set([...names.matchAll(/:\s*"(\w+)"/g)].map((m) => m[1]));
  return [...union.matchAll(/"(\w+)"/g)].map((m) => m[1] as string).filter((k) => !printed.has(k));
}

/** Opérations d'effet utilisées par une seule carte gérée (jetons compris). */
function singleCardOps(): string[] {
  const users = new Map<string, Set<string>>();
  const walk = (v: unknown, name: string): void => {
    if (Array.isArray(v)) for (const x of v) walk(x, name);
    else if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      if (typeof o.op === "string") users.set(o.op, (users.get(o.op) ?? new Set()).add(name));
      for (const x of Object.values(o)) walk(x, name);
    }
  };
  for (const c of implementedCards()) walk(c, c.name);
  return [...users].filter(([, cards]) => cards.size === 1).map(([op]) => op);
}

/**
 * Propriétés déclarées dans le modèle du moteur et utilisées par une seule carte gérée, à n'importe quelle profondeur de sa
 * définition (hors champs de PlayerStaticAbilityDef, suivis à part).
 */
function singleCardKeys(): string[] {
  const declared = declaredFieldNames();
  const statics = new Set(playerStaticKeys());
  const users = new Map<string, Set<string>>();
  const walk = (v: unknown, name: string): void => {
    if (Array.isArray(v)) for (const x of v) walk(x, name);
    else if (v && typeof v === "object") {
      for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
        if (declared.has(k) && !statics.has(k)) users.set(k, (users.get(k) ?? new Set()).add(name));
        walk(x, name);
      }
    }
  };
  for (const c of implementedCards()) walk(c, c.name);
  return [...users].filter(([, cards]) => cards.size === 1).map(([k]) => k);
}

/** Champs de GameObject qui comptent « ce tour-ci » : leur place est le journal du tour (turnlog.ts). */
function turnFields(): string[] {
  return interfaceFields("GameObject").filter((k) => /Turn$/.test(k));
}

/** Noms de cartes écrits en dur dans les chaînes du code du moteur (commentaires exclus). */
function engineCardLiterals(): string[] {
  const names = implementedCards()
    .map((c) => c.name)
    .filter((n) => /[ ,]/.test(n) && n.length >= 8);
  const found = new Set<string>();
  for (const l of engineLiterals()) if (/[A-Z]/.test(l)) for (const n of names) if (l.includes(n)) found.add(n);
  return [...found];
}

/** Taille de chaque surface du modèle : champs d'une interface, variantes d'une union, champs de toutes ses variantes. */
function surfaces(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const name of [
    "CardDef",
    "GameObject",
    "StackItem",
    "PlayerState",
    "GameState",
    "ObjectFilter",
    "CostDef",
    "ActivatedAbilityDef",
    "CastPermissionAbilityDef",
    "PlayFromZone",
    "LayerMods",
  ])
    out[name] = interfaceFields(name).length;
  for (const [name, discriminant] of [
    ["Effect", "op"],
    ["TriggerSpec", "on"],
    ["Condition", "kind"],
    ["Amount", "kind"],
    ["Ref", "kind"],
  ] as const) {
    const variants = unionVariants(name, discriminant);
    out[name] = variants.size;
    out[`${name} (champs)`] = [...variants.values()].reduce((n, f) => n + f.length, 0);
  }
  return out;
}

const RULE = "voir « Règle pour la suite » en fin de CLAUDE.md : chercher une forme générique, sinon justifier l'entrée";

describe("garde-fou de la dette (data/debt-baseline.json)", () => {
  const sections: [keyof typeof baseline, () => string[]][] = [
    ["playerStatic", playerStaticKeys],
    ["keyword", nonPrintedKeywords],
    ["op", singleCardOps],
    ["singleCardKeys", singleCardKeys],
    ["turnFields", turnFields],
    ["engineCardLiterals", engineCardLiterals],
  ];
  it.each(sections)("%s : rien de nouveau, rien de périmé", (section, find) => {
    const known = baseline[section] as Record<string, string>;
    const found = find();
    if (section !== "engineCardLiterals") expect(found.length).toBeGreaterThan(0);
    expect(
      found.filter((k) => !(k in known)),
      `Nouvelle entrée propre à une carte (${RULE})`,
    ).toEqual([]);
    expect(
      Object.keys(known).filter((k) => !found.includes(k)),
      "Entrée disparue ou devenue générique : la retirer de data/debt-baseline.json",
    ).toEqual([]);
  });

  it("plafonds des surfaces du modèle (ceilings) : ni dépassés, ni trop hauts", () => {
    const measured = surfaces();
    const ceilings = baseline.ceilings as Record<string, number>;
    for (const [name, n] of Object.entries(measured)) {
      const max = ceilings[name];
      expect(max, `${name} : plafond absent de data/debt-baseline.json`).toBeDefined();
      expect(n, `${name} dépasse son plafond (${RULE} ; relever le plafond se justifie dans le lot)`).toBeLessThanOrEqual(
        max as number,
      );
      expect(n, `${name} a baissé : abaisser son plafond dans data/debt-baseline.json`).toBe(max);
    }
    expect(Object.keys(ceilings).sort()).toEqual(Object.keys(measured).sort());
  });

  it("plus grand cycle d'imports du moteur : ne grandit pas", () => {
    const cycle = largestImportCycle();
    expect(cycle.length, `Cycle d'imports agrandi : ${cycle.join(", ")}`).toBeLessThanOrEqual(baseline.importCycleMax);
    expect(cycle.length, "Cycle d'imports réduit : abaisser importCycleMax dans data/debt-baseline.json").toBe(
      baseline.importCycleMax,
    );
  });
});
