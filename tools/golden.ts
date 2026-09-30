/**
 * Parties dorées (`ai/src/golden.ts`) : vérifie qu'elles se rejouent à l'identique, ou les régénère.
 *
 * Usage : npm run golden             vérifie (comme le test `ai/test/golden.test.ts`)
 *         npm run golden -- --update  régénère les fichiers après un lot qui a fait avancer RULES_VERSION
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { GOLDEN_GAMES, playGolden } from "@mtgx/ai";
import { card } from "@mtgx/cards";
import { type GameRecord, RULES_VERSION, replayChecked } from "@mtgx/engine";

const dir = new URL("../packages/ai/test/golden/", import.meta.url);
const update = process.argv.includes("--update");
let failed = 0;
if (update) mkdirSync(dir, { recursive: true });
for (const spec of GOLDEN_GAMES) {
  const file = new URL(`${spec.name}.json`, dir);
  if (update) {
    const record = playGolden(spec);
    writeFileSync(file, `${JSON.stringify(record)}\n`);
    console.log(`${spec.name} : ${record.decisions.length} décisions, ${record.checkpoints?.length ?? 0} points de contrôle`);
    continue;
  }
  const record = JSON.parse(readFileSync(file, "utf8")) as GameRecord;
  const { divergence } = replayChecked(record, card);
  const stale = record.rules !== RULES_VERSION;
  if (divergence || stale) failed++;
  console.log(
    `${spec.name} : ${divergence ? `divergence (${divergence.message})` : "identique"}${stale ? `, règles ${record.rules} ≠ ${RULES_VERSION}` : ""}`,
  );
}
if (failed) {
  console.error(`${failed} partie(s) dorée(s) à revoir ; après un lot [règles] : npm run golden -- --update`);
  process.exit(1);
}
