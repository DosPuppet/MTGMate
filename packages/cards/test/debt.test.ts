/**
 * Garde-fou de la dette (audit du 30/09/2026, § 3.3 ; docs/plans/PLAN-R.md, lot F2 ; élargi par l'audit du 02/10/2026,
 * § 5.1, docs/plans/PLAN-C.md, lot C1) : pas de nouveau drapeau, mot-clé, opération, propriété ou champ propre à une carte
 * sans justification dans data/debt-baseline.json, et la référence ne fait que baisser. Règle : fin de CLAUDE.md.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import baseline from "../data/debt-baseline.json";
import { implementedCards } from "../src/index";
import {
  declaredFieldNames,
  engineLiterals,
  interfaceFields,
  largestImportCycle,
  measureSurfaces,
  unionVariants,
} from "./debtSurface";

const source = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

/** Champs de PlayerStaticAbilityDef (lignes indentées de deux espaces dans l'interface). */
function playerStaticKeys(): string[] {
  const body = /export interface PlayerStaticAbilityDef \{([\s\S]*?)\n\}/.exec(source("engine/src/model/cards.ts"))?.[1];
  if (!body) throw new Error("PlayerStaticAbilityDef introuvable");
  return (
    [...body.matchAll(/^ {2}(\w+)\??:/gm)]
      .map((m) => m[1] as string)
      // Méta-clés (portée et conditions), comme `NOT_KEYS` dans engine/src/statics.ts.
      .filter((k) => !["kind", "condition", "label", "affects"].includes(k))
  );
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
 * Variantes des unions Condition, Amount, Ref (discriminant `kind`) et TriggerSpec (`on`) écrites par une seule carte
 * gérée, notées « Union.variante » (audit du 07/10/2026 : comme les ops, elles échappaient à la garde).
 */
function singleCardVariants(): string[] {
  const unions = [
    ["Condition", "kind"],
    ["Amount", "kind"],
    ["Ref", "kind"],
    ["TriggerSpec", "on"],
  ] as const;
  const declared = unions.map(([name, d]) => [name, d, new Set(unionVariants(name, d).keys())] as const);
  const users = new Map<string, Set<string>>();
  const walk = (v: unknown, name: string): void => {
    if (Array.isArray(v)) for (const x of v) walk(x, name);
    else if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      for (const [union, d, variants] of declared) {
        const value = o[d];
        if (typeof value === "string" && variants.has(value)) {
          const k = `${union}.${value}`;
          users.set(k, (users.get(k) ?? new Set()).add(name));
        }
      }
      for (const x of Object.values(o)) walk(x, name);
    }
  };
  for (const c of implementedCards()) walk(c, c.name);
  return [...users].filter(([, cards]) => cards.size === 1).map(([k]) => k);
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
        // Une clé écrite sans valeur (`toCardDef`, `activated()` recopient toutes les options) n'est pas utilisée.
        if (x === undefined) continue;
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

const RULE = "voir « Règle pour la suite » en fin de CLAUDE.md : chercher une forme générique, sinon justifier l'entrée";

describe("garde-fou de la dette (data/debt-baseline.json)", () => {
  const sections: [keyof typeof baseline, () => string[]][] = [
    ["playerStatic", playerStaticKeys],
    ["keyword", nonPrintedKeywords],
    ["op", singleCardOps],
    ["variant", singleCardVariants],
    ["singleCardKeys", singleCardKeys],
    ["turnFields", turnFields],
    ["engineCardLiterals", engineCardLiterals],
  ];
  it.each(sections)("%s : rien de nouveau, rien de périmé", (section, find) => {
    const known = baseline[section] as Record<string, string>;
    const found = find();
    // Le lecteur trouve quelque chose (sauf dans les sections vidées : noms de cartes du moteur ; champs « ce tour-ci »,
    // tous dans le journal du tour depuis PLAN-H H11).
    if (section !== "engineCardLiterals" && section !== "turnFields") expect(found.length).toBeGreaterThan(0);
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
    const measured = measureSurfaces();
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
