/**
 * Audit Oracle ↔ script (P1 de l'audit du 29/09/2026) : une carte « gérée » l'est dès qu'un script existe. Cet audit
 * confronte le texte Oracle au script pour repérer ce qui manque probablement :
 *
 * - capacités : le texte est découpé en paragraphes (lignes de mots-clés, déclenchées, activées, statiques, chapitres) ;
 *   le script doit avoir au moins autant de capacités déclenchées et activées que le texte en décrit ;
 * - nombres : les nombres d'effet du texte (blessures, pioche, PV, +N/+N, jetons, marqueurs, regard…) doivent apparaître
 *   dans le script.
 *
 * C'est une heuristique : un écart est un indice à vérifier, pas une preuve. Les écarts connus et vérifiés sont listés
 * dans `data/audit-baseline.json` ; le test `audit.test.ts` échoue si une carte en ajoute un nouveau.
 */
import type { AbilityDef, CardDef } from "@mtgx/engine";

export type ParagraphKind = "keywords" | "triggered" | "activated" | "static" | "chapter" | "spell";

export interface Paragraph {
  kind: ParagraphKind;
  text: string;
}

export interface AuditIssue {
  card: string;
  /** « déclenchées » : le texte en décrit plus que le script ; « nombre » : un nombre d'effet absent du script. */
  kind: "triggered" | "activated" | "number";
  detail: string;
}

const NUMBER_WORDS: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fifteen: 15,
  twenty: 20,
};

/** Mots-clés (et mots-clés à coût) qui peuvent former une ligne de mots-clés. */
const KEYWORD_LINE =
  /^(?:(?:flying|first strike|double strike|deathtouch|defender|haste|hexproof|indestructible|lifelink|menace|reach|trample|vigilance|flash|prowess|changeling|convoke|delve|affinity for [a-z]+|fear|intimidate|shroud|skulk|landwalk|[a-z]+walk|protection from [^,.]+|ward(?: \{[^}]+\}|—[^.]+\.?)|equip(?: [^{]*)?\{[^}]*\}(?:\{[^}]*\})*|crew \d+|saddle \d+|station \d*|cycling \{[^}]*\}(?:\{[^}]*\})*|[a-z]+cycling \{[^}]*\}(?:\{[^}]*\})*|kicker \{[^}]*\}(?:\{[^}]*\})*|flashback \{[^}]*\}(?:\{[^}]*\})*|disguise \{[^}]*\}(?:\{[^}]*\})*|warp \{[^}]*\}(?:\{[^}]*\})*|plot \{[^}]*\}(?:\{[^}]*\})*|offspring \{[^}]*\}(?:\{[^}]*\})*|impending \d+—\{[^}]*\}(?:\{[^}]*\})*|craft with [^.]+|max speed|start your engines!|exhaust|mobilize \d+|surveil \d+|ninjutsu \{[^}]*\}(?:\{[^}]*\})*|evoke \{[^}]*\}(?:\{[^}]*\})*|bestow \{[^}]*\}(?:\{[^}]*\})*|mutate \{[^}]*\}(?:\{[^}]*\})*|enchant [^.]+|devour \d+|job select|toxic \d+|infect|wither|annihilator \d+|rebound|cascade|storm|split second|unearth \{[^}]*\}(?:\{[^}]*\})*|embalm \{[^}]*\}(?:\{[^}]*\})*|escape—[^.]+\.?|harmonize \{[^}]*\}(?:\{[^}]*\})*|echo \{[^}]*\}(?:\{[^}]*\})*|dash \{[^}]*\}(?:\{[^}]*\})*|evolve|exploit|riot|undying|persist|training|bargain|backup \d+|forage|gift [^.]+|spree|tiered|hideaway \d+|living weapon|buyback \{[^}]*\}(?:\{[^}]*\})*|mentor|melee|afflict \d+|renew|freerunning \{[^}]*\}(?:\{[^}]*\})*|the ring tempts you)(?:,\s*|\s*$))+$/i;

/** Retire le texte de rappel (entre parenthèses) et les mots d'aptitude (« Landfall — », « Void — »). */
export function stripReminder(text: string): string {
  return text
    .replace(/\s*\([^)]*\)/g, "")
    .replace(/^(?:[A-Z][A-Za-z' -]{1,40}|Max speed|\d+\+) — /u, "")
    .trim();
}

/** Découpe un texte Oracle en paragraphes classés. */
export function paragraphs(text: string, isSpell: boolean): Paragraph[] {
  const out: Paragraph[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    // Chapitres de Saga (« I, II — … »), niveaux de Classe et paliers : comptés à part.
    if (/^(?:[IVX]+(?:, [IVX]+)*) —/.test(line) || /^Level \d/.test(line) || /^\d+\+ \|/.test(line)) {
      out.push({ kind: "chapter", text: line });
      continue;
    }
    const t = stripReminder(line);
    if (!t) continue;
    if (KEYWORD_LINE.test(t.replace(/\.$/, ""))) {
      out.push({ kind: "keywords", text: t });
      continue;
    }
    // Un éphémère ou un rituel ne décrit pas de capacité déclenchée (« When you next cast… » est créée par le sort).
    if (!isSpell && /^(?:When|Whenever|At the beginning|At end of|At the end)\b/.test(t)) {
      out.push({ kind: "triggered", text: t });
      continue;
    }
    // Capacité activée : un coût avant les deux-points (mana, {T}, loyauté, « Sacrifiez… », « Exhaust — »…).
    const colon = t.indexOf(":");
    const cost = colon > 0 ? t.slice(0, colon) : "";
    if (
      !isSpell &&
      colon > 0 &&
      !cost.includes(".") &&
      // Capacité citée (« Enchanted land has "{T}: …" ») : accordée à un autre objet, ce n'est pas celle de la carte.
      !cost.includes('"') &&
      (/^[+−-]?(?:\d+|X):?$/.test(cost.trim()) ||
        /\{[^}]+\}/.test(cost) ||
        /^(?:Sacrifice|Tap|Untap|Remove|Discard|Exile|Pay|Return|Put|Collect|Forage|Reveal|Mill)\b/.test(cost))
    ) {
      out.push({ kind: "activated", text: t });
      continue;
    }
    out.push({ kind: isSpell ? "spell" : "static", text: t });
  }
  return out;
}

/** Capacités d'une définition, toutes sources comprises (paliers de station, niveaux de Classe, Affaire résolue). */
function allAbilities(d: CardDef): AbilityDef[] {
  return [
    ...d.abilities,
    ...(d.station?.thresholds.flatMap((t) => t.abilities) ?? []),
    ...(d.classLevels?.flatMap((l) => l.abilities) ?? []),
    ...(d.caseSolved ?? []),
  ];
}

function countKind(d: CardDef, kind: "triggered" | "activated"): number {
  return allAbilities(d).filter((a) =>
    kind === "triggered" ? a.kind === "triggered" : a.kind === "activated" || a.kind === "mana",
  ).length;
}

/** Nombres d'effet cités par un paragraphe (« deals 3 damage », « draw two cards », « +2/+2 »…). */
export function effectNumbers(text: string): number[] {
  const out: number[] = [];
  const num = (w: string) => (/^\d+$/.test(w) ? Number(w) : NUMBER_WORDS[w.toLowerCase()]);
  const patterns: RegExp[] = [
    /deals? (\d+) damage/gi,
    /(?:draws?|drew) (\w+) cards?/gi,
    /(?:gains?|loses?) (\d+) life/gi,
    /(?:put|puts|with) (\w+) [+\-−]?\d*\/?[+\-−]?\d* ?(?:[a-z]+ )?counters?/gi,
    /create (\w+) /gi,
    /(?:scry|surveil|mill) (\d+)/gi,
    /look at the top (\w+) cards?/gi,
  ];
  for (const re of patterns) {
    for (const m of text.matchAll(re)) {
      const n = num(m[1] ?? "");
      if (n !== undefined && n > 1) out.push(n);
    }
  }
  // Modifications de F/E : « +2/+2 », « -3/-0 ».
  // Un « +1/+1 » suivi de « counter » est le nom du marqueur, pas une modification.
  for (const m of text.matchAll(/([+\-−])(\d+)\/([+\-−])(\d+)(?! counters?)/g)) {
    const p = Number(m[2]);
    const t = Number(m[4]);
    if (p > 0) out.push(p);
    if (t > 0) out.push(t);
  }
  return out;
}

/** Tous les nombres présents dans le script (valeurs numériques du JSON, négatives comprises en valeur absolue). */
function scriptNumbers(d: CardDef): Set<number> {
  const out = new Set<number>();
  const visit = (v: unknown) => {
    if (typeof v === "number") out.add(Math.abs(v));
    else if (typeof v === "string") {
      // Coûts et mana en texte (« {2}{R} ») : les nombres comptent aussi.
      for (const m of v.matchAll(/\d+/g)) out.add(Number(m[0]));
    } else if (Array.isArray(v)) {
      for (const x of v) visit(x);
      // Mana en liste (« addMana: ["R", "R", "R"] ») ou somme de termes identiques (« X + X + X ») : la longueur est
      // le multiplicateur.
      if (v.length > 1 && v.every((x) => JSON.stringify(x) === JSON.stringify(v[0]))) out.add(v.length);
    } else if (v && typeof v === "object") for (const x of Object.values(v)) visit(x);
  };
  const {
    text: _t,
    fr: _f,
    image: _i,
    artCrop: _a,
    legalities: _l,
    number: _n,
    ...script
  } = d as CardDef & {
    artCrop?: unknown;
  };
  visit(script);
  return out;
}

/** Audite une définition (et ses faces). Seules les cartes gérées ont un sens. */
export function auditCard(d: CardDef): AuditIssue[] {
  const issues: AuditIssue[] = [];
  const faces: CardDef[] = d.faceDefs?.length ? d.faceDefs : [d];
  for (const f of faces) {
    const isSpell = f.types.includes("Instant") || f.types.includes("Sorcery");
    const paras = paragraphs(f.text ?? "", isSpell);
    for (const kind of ["triggered", "activated"] as const) {
      const expected = paras.filter((p) => p.kind === kind).length;
      // Les deux faces partagent parfois les capacités (verso) : on compte celles de la carte entière aussi.
      const have = Math.max(countKind(f, kind), faces.length > 1 ? 0 : countKind(d, kind));
      if (have < expected)
        issues.push({ card: d.name, kind, detail: `${f.name} : ${expected} dans le texte, ${have} dans le script` });
    }
    const nums = scriptNumbers(f);
    if (f !== d) for (const n of scriptNumbers(d)) nums.add(n);
    const missing = [...new Set(paras.flatMap((p) => effectNumbers(p.text)))].filter((n) => !nums.has(n));
    if (missing.length) issues.push({ card: d.name, kind: "number", detail: `${f.name} : ${missing.join(", ")} absent(s)` });
  }
  return issues;
}

/** Clé stable d'un écart (pour la liste des écarts connus). */
export const issueKey = (i: AuditIssue) => `${i.card} | ${i.kind} | ${i.detail}`;
