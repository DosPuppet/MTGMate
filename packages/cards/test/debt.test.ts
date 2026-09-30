/**
 * Garde-fou de la dette (audit du 30/09/2026, § 3.3 ; PLAN-R.md, lot F2) : pas de nouveau drapeau, mot-clé ou
 * opération propre à une carte sans justification dans data/debt-baseline.json, et la référence ne fait que baisser.
 * Règle : fin de CLAUDE.md.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import baseline from "../data/debt-baseline.json";
import { implementedCards } from "../src/index";

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
  const union = /export type Keyword =([\s\S]*?);/.exec(source("engine/src/types.ts"))?.[1];
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

const RULE = "voir « Règle pour la suite » en fin de CLAUDE.md : chercher une forme générique, sinon justifier l'entrée";

describe("garde-fou de la dette (data/debt-baseline.json)", () => {
  const sections: [keyof typeof baseline, () => string[]][] = [
    ["playerStatic", playerStaticKeys],
    ["keyword", nonPrintedKeywords],
    ["op", singleCardOps],
  ];
  it.each(sections)("%s : rien de nouveau, rien de périmé", (section, find) => {
    const known = baseline[section] as Record<string, string>;
    const found = find();
    expect(found.length).toBeGreaterThan(0);
    expect(
      found.filter((k) => !(k in known)),
      `Nouvelle entrée propre à une carte (${RULE})`,
    ).toEqual([]);
    expect(
      Object.keys(known).filter((k) => !found.includes(k)),
      "Entrée disparue ou devenue générique : la retirer de data/debt-baseline.json",
    ).toEqual([]);
  });
});
