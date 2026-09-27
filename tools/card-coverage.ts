/**
 * Couverture des cartes : combien de cartes d'un set sont gérées, et quelles mécaniques manquent
 * (pour prioriser le travail de l'étape 4b).
 *
 * Usage : npm run coverage [-- --set all|standard|main|<set>] [-- --list <mécanique>] [-- --missing] [-- --card "<nom>"]
 *         npm run coverage -- --set FIN --text [--color W|U|B|R|G|M|C|L]
 *
 * --text : textes Oracle des cartes non gérées (toutes faces), pour préparer un lot ; --color filtre par couleur
 * (M = multicolore, C = incolore, L = terrain).
 */
import { CARDS, isMainSet, SET_BY_CODE, SETS } from "@mtgx/cards";

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
    (!setArg || main || standard || c.set === setArg),
);
const done = all.filter((c) => c.implemented);
const label = main
  ? "sets principaux"
  : standard
    ? "Standard (cartes légales)"
    : setArg
      ? (SET_BY_CODE[setArg]?.name ?? setArg)
      : "toutes extensions";
console.log(`${label} : ${done.length} / ${all.length} cartes gérées (${Math.round((done.length / all.length) * 100)} %)`);
if (!setArg) {
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
  }
}

if (process.argv.includes("--missing")) {
  console.log(`\nCartes non gérées :\n  ${missing.map((c) => c.name).join("\n  ")}`);
}
