/**
 * Couverture des cartes : combien de cartes d'un set sont gérées, et quelles mécaniques manquent
 * (pour prioriser le travail de l'étape 4b).
 *
 * Usage : npm run coverage [-- --set all|standard|main|<set>] [-- --list <mécanique>] [-- --missing] [-- --card "<nom>"]
 *         npm run coverage -- --set FIN --text [--color W|U|B|R|G|M|C|L]
 *         npm run coverage -- --deck <id|all> [--text]   (decks Commander de `docs/commander/decks/`, PLAN-E)
 *
 * --audit : écarts entre le texte Oracle et le script des cartes gérées (capacités manquantes, nombres absents).
 * --tests : part des cartes gérées nommées dans un test de règles (`engine/test`, attentes de l'Oracle), par extension ;
 * avec --set, la liste des cartes jamais nommées (rares et mythiques d'abord) ; --meta : celles des decks du méta.
 * --text : textes Oracle des cartes non gérées (toutes faces), pour préparer un lot ; --color filtre par couleur
 * (M = multicolore, C = incolore, L = terrain).
 */
import { readdirSync, readFileSync } from "node:fs";
import { CARDS, isMainSet, SET_BY_CODE, SETS } from "@mtgx/cards";
import type { CardDef } from "@mtgx/engine";
import auditBaseline from "../packages/cards/data/audit-baseline.json";
import { auditCard, issueKey } from "../packages/cards/src/audit";
import { commanderDecks } from "./commander-decks";
import { metaDecks } from "./meta-decks";

const MECHANICS: [string, RegExp][] = [
  ["aura", /^Enchant (creature|land|permanent)/m],
  ["équipement", /Equip \{/],
  ["planeswalker", /Planeswalker/],
  ["contresort", /[Cc]ounter target/],
  ["recherche dans la bibliothèque", /[Ss]earch your library/],
  ["ward", /Ward/],
  ["retour du cimetière", /from (your|a) graveyard to/],
  ["copie", /[Cc]opy/],
  ["mode d'une capacité déclenchée", /When .*, choose one/],
  ["protection", /[Pp]rotection from/],
  ["engager / dégager une cible", /[Tt]ap target|[Uu]ntap target/],
  ["ne peut pas bloquer / attaquer", /can't (block|attack)/],
  ["changement de contrôle", /[Gg]ain control/],
  ["marqueurs -1/-1 ou autres", /counter on|counters on/],
  ["F/E -X/-X", /gets? -\d+\/-\d+/],
  ["détruire", /[Dd]estroy (target|all|each)/],
  ["exiler", /[Ee]xile target/],
];

const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? (process.argv[i + 1] ?? "") : undefined;
};

const cardName = arg("--card");
if (cardName !== undefined) {
  const c = Object.values(CARDS).find(
    (x) => x.name.toLowerCase() === cardName.toLowerCase() || x.fr?.name?.toLowerCase() === cardName.toLowerCase(),
  );
  if (!c) {
    console.log(`Carte inconnue : ${cardName}`);
    process.exit(1);
  }
  console.log(`${c.name} ${c.manaCostText} — ${c.typeLine}${c.power !== undefined ? ` ${c.power}/${c.toughness}` : ""}`);
  console.log(`${[c.text, ...(c.faceDefs ?? []).map((f) => `// ${f.name}\n${f.text}`)].join("\n")}\n`);
  console.log(`Gérée : ${c.implemented ? "oui" : "non"}`);
  const { text: _t, fr: _f, image: _i, artCrop: _a, ...script } = c;
  console.log(
    JSON.stringify(
      {
        keywords: script.keywords,
        abilities: script.abilities,
        spell: script.spell,
        kicker: script.kicker,
        flashback: script.flashback,
        additionalCost: script.additionalCost,
        costReduction: script.costReduction,
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

// --deck <id|all> : les cartes d'un deck Commander (ou de tous), jouables, au catalogue mais non jouables, ou inconnues.
const deckArg = arg("--deck");
const deckCards = deckArg === undefined ? undefined : deckCoverage(deckArg);

function deckCoverage(id: string): Set<string> {
  const decks = commanderDecks().filter((d) => id === "all" || d.id === id);
  if (!decks.length) {
    console.log(
      `Deck Commander inconnu : ${id} (connus : ${commanderDecks()
        .map((d) => d.id)
        .join(", ")})`,
    );
    process.exit(1);
  }
  const names = new Set<string>();
  for (const d of decks) {
    const cards = [...d.commander, ...d.main].map(([, name]) => name).filter((n) => !CARDS[n]?.supertypes.includes("Basic"));
    for (const n of cards) names.add(n);
    const ok = cards.filter((n) => CARDS[n]?.implemented).length;
    const bySet = new Map<string, number>();
    for (const n of cards.filter((x) => !CARDS[x]?.implemented)) {
      const set = CARDS[n]?.set ?? "?";
      bySet.set(set, (bySet.get(set) ?? 0) + 1);
    }
    const detail = [...bySet].map(([set, n]) => `${set} ${n}`).join(", ");
    console.log(
      `${d.name} (${d.id}) : ${ok} / ${cards.length} cartes jouables (hors terrains de base)` +
        `${detail ? ` ; à faire : ${detail}` : ""}${d.unknown.length ? ` ; inconnues : ${d.unknown.join(", ")}` : ""}`,
    );
  }
  return names;
}

// --set main : sets principaux ; --set fdn|fra|… : une extension (toutes ses cartes) ;
// --set all (ou sans option) : tout, avec le détail par extension ; --set standard : cartes légales en Standard.
const setArg0 = (arg("--set") ?? "").toUpperCase();
const setArg = setArg0 === "ALL" ? "" : setArg0;
const main = setArg === "MAIN";
const standard = setArg === "STANDARD";
const all = Object.values(CARDS).filter(
  (c) =>
    !c.isToken &&
    (!main || isMainSet(c)) &&
    (!standard || c.legalities?.standard === "legal") &&
    (!setArg || main || standard || c.set === setArg) &&
    (!deckCards || deckCards.has(c.name)),
);
const done = all.filter((c) => c.implemented);
const label = deckCards
  ? `deck${deckArg === "all" ? "s" : ""} Commander`
  : main
    ? "sets principaux"
    : standard
      ? "Standard (cartes légales)"
      : setArg
        ? (SET_BY_CODE[setArg]?.name ?? setArg)
        : "toutes extensions";
console.log(`${label} : ${done.length} / ${all.length} cartes gérées (${Math.round((done.length / all.length) * 100)} %)`);
if (!setArg && !deckCards) {
  // Rééditions (PLAN-G) : hors Standard, jouables en « Sans limite ».
  const reprintCodes = new Set(SETS.filter((s) => s.reprint).map((s) => s.code));
  const reprints = all.filter((c) => reprintCodes.has(c.set ?? ""));
  console.log(`  dont rééditions (« Sans limite ») : ${reprints.filter((c) => c.implemented).length} / ${reprints.length}`);
  for (const s of SETS) {
    const inSet = all.filter((c) => c.set === s.code);
    console.log(`  ${s.code.padEnd(4)} ${s.name.padEnd(30)} ${inSet.filter((c) => c.implemented).length} / ${inSet.length}`);
  }
}

const missing = all.filter((c) => !c.implemented);
const byMechanic = new Map<string, string[]>();
for (const c of missing) {
  const text = [c.text, ...(c.faceDefs ?? []).map((f) => f.text)].join("\n");
  const tags = MECHANICS.filter(([, re]) => re.test(text)).map(([n]) => n);
  for (const t of tags.length ? tags : ["sans mécanique bloquante détectée"])
    byMechanic.set(t, [...(byMechanic.get(t) ?? []), c.name]);
}
console.log("\nCartes non gérées par mécanique (une carte peut compter plusieurs fois) :");
for (const [m, names] of [...byMechanic.entries()].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`  ${String(names.length).padStart(4)}  ${m}`);
}

const i = process.argv.indexOf("--list");
if (i >= 0) {
  const m = process.argv[i + 1] ?? "sans mécanique bloquante détectée";
  console.log(`\n${m} :\n  ${(byMechanic.get(m) ?? []).join("\n  ")}`);
}

if (process.argv.includes("--text")) {
  const color = arg("--color")?.toUpperCase();
  const col = (c: (typeof missing)[number]) =>
    c.types.includes("Land") && !c.types.includes("Creature")
      ? "L"
      : c.colors.length === 0
        ? "C"
        : c.colors.length > 1
          ? "M"
          : (c.colors[0] as string);
  for (const c of missing.filter((x) => !color || col(x) === color)) {
    const pt = c.power !== undefined ? ` ${c.power}/${c.toughness}` : "";
    console.log(`\n## ${c.name} ${c.manaCostText ?? ""} — ${c.typeLine}${pt}${c.layout ? ` {${c.layout}}` : ""}`);
    if (c.faceDefs?.length) {
      for (const f of c.faceDefs) {
        const fpt = f.power !== undefined ? ` ${f.power}/${f.toughness}` : "";
        console.log(`[${f.name} — ${f.typeLine}${fpt}]\n${f.text}`);
      }
    } else console.log(c.text);
    // Disposition « prepare » : le sort de la carte (script `prepareSpell`).
    if (c.prepareFace)
      console.log(
        `[Sort préparé : ${c.prepareFace.name} ${c.prepareFace.manaCost} — ${c.prepareFace.typeLine}]\n${c.prepareFace.text}`,
      );
  }
}

if (process.argv.includes("--missing")) {
  console.log(`\nCartes non gérées :\n  ${missing.map((c) => c.name).join("\n  ")}`);
}

// --audit : écarts Oracle ↔ script des cartes gérées (packages/cards/src/audit.ts), connus ou nouveaux.
if (process.argv.includes("--audit")) {
  const issues = done.flatMap(auditCard);
  const known = auditBaseline as Record<string, string>;
  const fresh = issues.filter((x) => !(issueKey(x) in known));
  console.log(`\nAudit Oracle ↔ script : ${issues.length} écart(s), dont ${fresh.length} nouveau(x)`);
  for (const x of issues) {
    const why = known[issueKey(x)];
    console.log(`  ${why ? "·" : "✗"} [${x.kind}] ${x.card} — ${x.detail}${why ? ` (connu : ${why})` : ""}`);
  }
}

// --tests : une carte compte comme testée si son nom (ou celui de sa première face) apparaît, comme mot entier,
// dans un fichier de `packages/engine/test` ou dans les attentes de l'Oracle (méthode de l'audit du 02/10/2026).
if (process.argv.includes("--tests")) {
  const dir = "packages/engine/test";
  const corpus = [
    ...readdirSync(dir)
      .filter((f) => f.endsWith(".ts"))
      .map((f) => readFileSync(`${dir}/${f}`, "utf8")),
    readFileSync("packages/cards/test/oracle-expectations.test.ts", "utf8"),
  ].join("\n");
  const escapeRe = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const named = (c: CardDef) =>
    [c.name, c.name.split(" // ")[0] as string].some((n) =>
      new RegExp(`(^|[^\\p{L}])${escapeRe(n)}($|[^\\p{L}])`, "u").test(corpus),
    );
  const pool = done.filter((c) => !c.supertypes.includes("Basic"));
  const tested = new Set(pool.filter(named).map((c) => c.name));
  const pct = (a: number, b: number) => `${b ? Math.round((a / b) * 100) : 0} %`;
  console.log(`\nCartes nommées dans un test : ${tested.size} / ${pool.length} (${pct(tested.size, pool.length)})`);
  for (const s of SETS) {
    const inSet = pool.filter((c) => c.set === s.code);
    if (!inSet.length) continue;
    const n = inSet.filter((c) => tested.has(c.name)).length;
    console.log(`  ${s.code.padEnd(4)} ${String(n).padStart(4)} / ${String(inSet.length).padEnd(4)} ${pct(n, inSet.length)}`);
  }
  if (process.argv.includes("--meta")) {
    const copies = new Map<string, number>();
    for (const d of metaDecks())
      for (const [n, name] of [...d.main, ...d.sideboard]) copies.set(name, (copies.get(name) ?? 0) + n);
    const untested = [...copies]
      .filter(([name]) => CARDS[name] && !CARDS[name].supertypes.includes("Basic") && !tested.has(name))
      .sort((a, b) => b[1] - a[1]);
    console.log(`\nCartes du méta jamais nommées dans un test : ${untested.length}`);
    for (const [name, n] of untested) console.log(`  ${name} (${CARDS[name]?.set}, ×${n})`);
  } else if (setArg && !main && !standard) {
    const rank: Record<string, number> = { mythic: 0, rare: 1, uncommon: 2, common: 3 };
    const untested = pool
      .filter((c) => !tested.has(c.name))
      .sort((a, b) => (rank[a.rarity ?? ""] ?? 4) - (rank[b.rarity ?? ""] ?? 4) || a.name.localeCompare(b.name));
    console.log(`\nJamais nommées (${untested.length}) :`);
    for (const c of untested) console.log(`  ${c.name} (${c.rarity ?? "?"})`);
  }
}
