/**
 * Couverture des cartes : combien de cartes d'un set sont gérées, et quelles mécaniques manquent
 * (pour prioriser le travail de l'étape 4b).
 *
 * Usage : npm run coverage [-- --list <mécanique>]
 */
import { CARDS } from "@mtgx/cards";

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

const all = Object.values(CARDS).filter((c) => !c.isToken);
const done = all.filter((c) => c.implemented);
console.log(`FDN : ${done.length} / ${all.length} cartes gérées (${Math.round((done.length / all.length) * 100)} %)`);

const missing = all.filter((c) => !c.implemented);
const byMechanic = new Map<string, string[]>();
for (const c of missing) {
  const tags = MECHANICS.filter(([, re]) => re.test(c.text)).map(([n]) => n);
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
