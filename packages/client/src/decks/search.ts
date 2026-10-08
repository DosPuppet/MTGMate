/**
 * Deck builder search, syntax inspired by Scryfall:
 * - free words: name, type or text (French or English);
 * - `t:` type, `o:` text, `c:` colors (`c:wu`, `c:c` colorless, `c:m` multicolored), `r:` rarity, `s:` set;
 * - `mv`, `pow`, `tou` with `:`, `=`, `<`, `>`, `<=`, `>=` (`mv<=2`, `pow>=4`);
 * - quotes for a text of several words (`o:"draw a card"`), `-` before a term to exclude it.
 */
import { type CardDef, manaValue } from "@mtgx/engine";

type Term = { negate: boolean; test: (c: CardDef) => boolean };

/** Lower case without accents (a query without accents finds an accented name). */
export function normalize(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

const haystack = (c: CardDef) =>
  normalize(
    [
      c.name,
      c.fr?.name,
      c.typeLine,
      c.fr?.typeLine,
      c.text,
      c.fr?.text,
      c.prepareFace?.name,
      c.prepareFace?.text,
      ...(c.faceDefs ?? []).flatMap((x) => [x.name, x.fr?.name, x.typeLine, x.fr?.text, x.text]),
    ].join(" "),
  );

const texts = (c: CardDef) =>
  normalize([c.text, c.fr?.text, c.prepareFace?.text, ...(c.faceDefs ?? []).flatMap((x) => [x.text, x.fr?.text])].join(" "));

const types = (c: CardDef) =>
  normalize([c.typeLine, c.fr?.typeLine, ...(c.faceDefs ?? []).flatMap((x) => [x.typeLine, x.fr?.typeLine])].join(" "));

function compare(op: string, a: number, b: number): boolean {
  switch (op) {
    case "<":
      return a < b;
    case ">":
      return a > b;
    case "<=":
      return a <= b;
    case ">=":
      return a >= b;
    default:
      return a === b;
  }
}

/** Splits the query into terms (quotes keep the spaces). */
function tokens(query: string): string[] {
  return [...query.matchAll(/-?(?:[a-z]+(?:<=|>=|:|=|<|>))?(?:"[^"]*"|\S+)/gi)].map((m) => m[0]);
}

function term(raw: string): Term | null {
  const negate = raw.startsWith("-") && raw.length > 1;
  const t = negate ? raw.slice(1) : raw;
  const m = /^([a-z]+)(<=|>=|:|=|<|>)(.*)$/i.exec(t);
  const unquote = (v: string) => normalize(v.replace(/^"|"$/g, ""));
  if (!m) {
    const v = unquote(t);
    return v ? { negate, test: (c) => haystack(c).includes(v) } : null;
  }
  const [, key = "", op = ":", value = ""] = m;
  const v = unquote(value);
  const num = Number(v);
  switch (key.toLowerCase()) {
    case "t":
    case "type":
      return { negate, test: (c) => types(c).includes(v) };
    case "o":
    case "oracle":
      return { negate, test: (c) => texts(c).includes(v) };
    case "c":
    case "color": {
      const letters = v.toUpperCase().split("");
      return {
        negate,
        test: (c) =>
          letters.every((l) =>
            l === "C" ? c.colors.length === 0 : l === "M" ? c.colors.length > 1 : c.colors.includes(l as never),
          ),
      };
    }
    case "r":
    case "rarity":
      return { negate, test: (c) => normalize(c.rarity ?? "").startsWith(v) };
    case "s":
    case "set":
      return { negate, test: (c) => normalize(c.set ?? "") === v };
    case "mv":
    case "cmc":
      return Number.isNaN(num) ? null : { negate, test: (c) => compare(op, manaValue(c.manaCost), num) };
    case "pow":
    case "power":
      return Number.isNaN(num) ? null : { negate, test: (c) => c.power !== undefined && compare(op, c.power, num) };
    case "tou":
    case "toughness":
      return Number.isNaN(num) ? null : { negate, test: (c) => c.toughness !== undefined && compare(op, c.toughness, num) };
    default:
      // Unknown key: the term is searched as is in the text.
      return { negate, test: (c) => haystack(c).includes(normalize(t)) };
  }
}

/** Search filter: every condition must hold (those preceded by `-` excluded). */
export function searchFilter(query: string): (c: CardDef) => boolean {
  const terms = tokens(query.trim())
    .map(term)
    .filter((x): x is Term => !!x);
  return (c) => terms.every((x) => x.test(c) !== x.negate);
}
