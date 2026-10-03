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

export type ParagraphKind = "keywords" | "triggered" | "activated" | "static" | "chapter" | "spell" | "mode";

export interface Paragraph {
  kind: ParagraphKind;
  text: string;
}

export interface AuditIssue {
  card: string;
  /**
   * « déclenchées », « activées » : le texte en décrit plus que le script ; « statiques » : le texte décrit plus de
   * capacités statiques que le script n'en porte (capacités, champs de la définition, mots-clés non imprimés, surplus de
   * déclenchées ou d'activées qui les réalisent) ; « nombre » : un nombre d'effet absent du script ; « cible » : un
   * éphémère ou un rituel dont le script n'a pas autant de cibles que de mots « target » dans le texte (une cible de
   * trop : un choix fait à la résolution, ou « chaque », est ciblé ; une de moins : une cible oubliée).
   */
  kind: "triggered" | "activated" | "static" | "number" | "target";
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
  /^(?:(?:flying|first strike|double strike|deathtouch|defender|haste|hexproof|indestructible|lifelink|menace|reach|trample|vigilance|flash|prowess|changeling|convoke|delve|affinity for [a-z]+|fear|intimidate|shroud|skulk|landwalk|[a-z]+walk|protection from [^,.]+|ward(?: \{[^}]+\}|—[^.]+\.?)|equip(?: [^{]*)?\{[^}]*\}(?:\{[^}]*\})*|crew \d+|saddle \d+|station \d*|cycling \{[^}]*\}(?:\{[^}]*\})*|[a-z]+cycling \{[^}]*\}(?:\{[^}]*\})*|kicker \{[^}]*\}(?:\{[^}]*\})*|flashback \{[^}]*\}(?:\{[^}]*\})*|disguise \{[^}]*\}(?:\{[^}]*\})*|warp \{[^}]*\}(?:\{[^}]*\})*|plot \{[^}]*\}(?:\{[^}]*\})*|offspring \{[^}]*\}(?:\{[^}]*\})*|impending \d+—\{[^}]*\}(?:\{[^}]*\})*|craft with [^.]+|max speed|start your engines!|exhaust|mobilize \d+|surveil \d+|ninjutsu \{[^}]*\}(?:\{[^}]*\})*|evoke \{[^}]*\}(?:\{[^}]*\})*|bestow \{[^}]*\}(?:\{[^}]*\})*|mutate \{[^}]*\}(?:\{[^}]*\})*|enchant [^.]+|devour \d+|job select|toxic \d+|infect|wither|annihilator \d+|rebound|cascade|storm|split second|unearth \{[^}]*\}(?:\{[^}]*\})*|embalm \{[^}]*\}(?:\{[^}]*\})*|escape—[^.]+\.?|harmonize \{[^}]*\}(?:\{[^}]*\})*|echo \{[^}]*\}(?:\{[^}]*\})*|dash \{[^}]*\}(?:\{[^}]*\})*|evolve|exploit|riot|undying|persist|training|bargain|backup \d+|forage|gift [^.]+|spree|tiered|hideaway \d+|living weapon|buyback \{[^}]*\}(?:\{[^}]*\})*|mentor|melee|afflict \d+|renew|freerunning \{[^}]*\}(?:\{[^}]*\})*|the ring tempts you|basic landcycling \{[^}]*\}(?:\{[^}]*\})*|increment|mobilize x[^.]*|extort|battle cry|improvise|firebending (?:\d+|x(?:, where x is [^.]+)?))(?:,\s*|\s*$))+$/i;

/** Retire le texte de rappel (entre parenthèses) et les mots d'aptitude (« Landfall — », « Void — »). */
export function stripReminder(text: string): string {
  return text
    .replace(/\s*\([^)]*\)/g, "")
    .replace(/^(?:[^—.:"{}•]{1,40}) — /u, "")
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
    // Mode d'une capacité ou d'un sort modal (« • … ») : fait partie du paragraphe précédent.
    if (line.startsWith("•")) {
      out.push({ kind: "mode", text: stripReminder(line.slice(1).trim()) });
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

/** Champs d'une définition qui ne décrivent pas une capacité (identité, texte, image, faces, légalité…). */
const IDENTITY_FIELDS = new Set([
  "id",
  "name",
  "typeLine",
  "manaCost",
  "manaCostText",
  "colors",
  "supertypes",
  "types",
  "subtypes",
  "power",
  "toughness",
  "keywords",
  "abilities",
  "spell",
  "text",
  "fr",
  "image",
  "artCrop",
  "layout",
  "faceDefs",
  "implemented",
  "set",
  "number",
  "rarity",
  "legalities",
  "isToken",
  "prepareFace",
]);

/** Champs de capacité (coûts, permissions, entrée…) renseignés dans une définition. */
function abilityFields(d: CardDef): number {
  return Object.entries(d).filter(([k, v]) => v !== undefined && !IDENTITY_FIELDS.has(k)).length;
}

/**
 * Statiques portées par une capacité : une capacité statique ou de joueur réalise souvent plusieurs phrases du texte
 * (« ont la menace et +1/+0 », « un terrain de plus, depuis le cimetière ») ; on compte ses effets distincts.
 */
function staticWeight(a: AbilityDef): number {
  if (a.kind === "triggered" || a.kind === "activated" || a.kind === "mana") return 0;
  if (a.kind === "static") return Math.max(1, Object.keys(a.mods).length);
  if (a.kind === "playerStatic")
    return Math.max(1, Object.keys(a).filter((k) => k !== "kind" && k !== "label" && k !== "condition").length);
  return 1;
}

/** Statiques sans effet de jeu à vérifier (règle de construction du deck). */
const NO_SCRIPT_STATIC = /^A deck can have any number of cards named/;

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
    let surplus = 0;
    for (const kind of ["triggered", "activated"] as const) {
      const expected = paras.filter((p) => p.kind === kind).length;
      // Les deux faces partagent parfois les capacités (verso) : on compte celles de la carte entière aussi.
      const have = Math.max(countKind(f, kind), faces.length > 1 ? 0 : countKind(d, kind));
      if (have < expected)
        issues.push({ card: d.name, kind, detail: `${f.name} : ${expected} dans le texte, ${have} dans le script` });
      surplus += Math.max(0, have - expected);
    }
    // Statiques d'un permanent : chacune doit être portée par quelque chose dans le script. Un éphémère ou un rituel
    // décrit son effet en paragraphes « sort », comptés ailleurs (nombres).
    if (!isSpell) {
      const statics = paras.filter((p) => p.kind === "static" && !NO_SCRIPT_STATIC.test(p.text)).length;
      const printed = paras.filter((p) => p.kind === "keywords").reduce((n, p) => n + p.text.split(",").length, 0);
      const own = (x: CardDef) =>
        allAbilities(x).reduce((n, a) => n + staticWeight(a), 0) + abilityFields(x) + Math.max(0, x.keywords.length - printed);
      const have = own(f) + (f !== d ? own(d) : 0) + surplus;
      if (have < statics)
        issues.push({ card: d.name, kind: "static", detail: `${f.name} : ${statics} dans le texte, ${have} dans le script` });
    }
    const nums = scriptNumbers(f);
    if (f !== d) for (const n of scriptNumbers(d)) nums.add(n);
    const missing = [...new Set(paras.flatMap((p) => effectNumbers(p.text)))].filter((n) => !nums.has(n));
    if (missing.length) issues.push({ card: d.name, kind: "number", detail: `${f.name} : ${missing.join(", ")} absent(s)` });
  }
  issues.push(...auditTargets(d));
  return issues;
}

/**
 * Mots « target » d'un sort : hors capacités citées entre guillemets (jetons) et texte de rappel, hors « change the
 * target of … with a single target » (la cible d'un autre sort n'en est pas une de celui-ci) ; la maîtrise de la terre
 * compte pour une cible.
 */
export function targetWords(text: string): number {
  const t = text
    .replace(/"[^"]*"/g, "")
    .replace(/\(([^)]*)\)/g, "")
    .replace(/\bthe targets? of\b|\bwith a single target\b/gi, "");
  // Maîtrise de la terre N : « terrain ciblé que vous contrôlez » (texte de rappel).
  const earthbend = (t.match(/\bearthbend (?:\d+|X)\b/gi) ?? []).length;
  return (t.match(/\btarget\b/gi) ?? []).length + earthbend;
}

/** Mots « up to N target », « any number of target », « one or two target » d'un sort (cibles facultatives). */
export function upToWords(text: string): number {
  const t = text.replace(/"[^"]*"/g, "").replace(/\(([^)]*)\)/g, "");
  return (
    t.match(
      /\b(?:up to (?:one|two|three|four|five|six|seven|X|\d+)|any number of|one or two|one, two, or three) (?:other |another )?target\b/gi,
    ) ?? []
  ).length;
}

/** Cibles du script d'un sort à un seul mode : celles du sort, plus celles de ses capacités réflexives et retardées. */
function scriptTargets(d: CardDef): number {
  const mode = d.spell?.modes[0];
  if (!mode) return 0;
  let nested = 0;
  const visit = (x: unknown, inToken: boolean): void => {
    if (Array.isArray(x)) for (const y of x) visit(y, inToken);
    else if (x && typeof x === "object") {
      const o = x as Record<string, unknown>;
      // Capacités d'un jeton créé : les siennes, pas celles du sort.
      const token = inToken || o.op === "createTokens" || o.op === "createTokenCopy";
      if (!token && Array.isArray(o.targets) && (o.op === "reflexive" || o.op === "delayed")) nested += o.targets.length;
      for (const v of Object.values(o)) visit(v, token);
    }
  };
  visit(mode.effects, false);
  return mode.targets.length + nested;
}

/** Audit des cibles d'un éphémère ou d'un rituel à un seul mode (sans faces). */
export function auditTargets(d: CardDef): AuditIssue[] {
  if (d.faceDefs?.length || !d.spell || d.spell.modes.length !== 1) return [];
  if (!d.types.includes("Instant") && !d.types.includes("Sorcery")) return [];
  const words = targetWords(d.text ?? "");
  const have = scriptTargets(d);
  if (words !== have)
    return [{ card: d.name, kind: "target", detail: `${words} « target » dans le texte, ${have} dans le script` }];
  // « jusqu'à N cibles » : autant de cibles facultatives dans le script (sort sans capacité réflexive ni retardée).
  const specs = d.spell.modes[0]?.targets ?? [];
  const upTo = upToWords(d.text ?? "");
  // Nombre de cibles variable : facultatives, ou entre un minimum et un maximum (« one or two »).
  const optional = specs.filter((t) => t.optional || (t.minCount !== undefined && t.minCount < (t.count ?? 1))).length;
  // Cible conditionnée par un coût (cadeau promis, marchandage) : facultative dans le script, sans « up to ».
  const conditional = /\bif the gift was promised\b|\bif this spell was (?:bargained|kicked)\b/i.test(d.text ?? "");
  if (have === specs.length && !conditional && upTo !== optional)
    return [
      {
        card: d.name,
        kind: "target",
        detail: `${upTo} nombre(s) de cibles variable(s) dans le texte, ${optional} dans le script`,
      },
    ];
  return [];
}

/** Clé stable d'un écart (pour la liste des écarts connus). */
export const issueKey = (i: AuditIssue) => `${i.card} | ${i.kind} | ${i.detail}`;
