/**
 * Parties dorées (`tools/golden.ts` ; docs/plans/PLAN-C.md, lot C2) : chacune se rejoue à l'identique, points de contrôle
 * compris, quelle que soit la version des règles qui l'a enregistrée. Une divergence à version égale veut dire que le
 * moteur a changé de comportement sans faire avancer `RULES_VERSION` ; après un changement de version, régénérer
 * seulement les parties qui divergent : `npm run golden -- --update`.
 */
import { readdirSync, readFileSync } from "node:fs";
import { card } from "@mtgx/cards";
import { type GameRecord, RULES_VERSION, replayChecked } from "@mtgx/engine";
import { describe, expect, it } from "vitest";

const dir = new URL("golden/", import.meta.url);
const names = readdirSync(dir)
  .filter((f) => f.endsWith(".json"))
  .map((f) => f.slice(0, -5));

describe("parties dorées", () => {
  it("il y en a", () => expect(names.length).toBeGreaterThanOrEqual(10));

  it.each(names.map((n) => [n]))(
    "%s se rejoue à l'identique",
    (name) => {
      const record = JSON.parse(readFileSync(new URL(`${name}.json`, dir), "utf8")) as GameRecord;
      expect(record.checkpoints?.length).toBeGreaterThan(5);
      expect(record.rules).toBeLessThanOrEqual(RULES_VERSION);
      const { divergence } = replayChecked(record, card);
      expect(
        divergence,
        record.rules === RULES_VERSION
          ? "Le moteur a changé de comportement : faire avancer RULES_VERSION, puis npm run golden -- --update"
          : `Partie enregistrée en version ${record.rules} qui ne se rejoue plus : npm run golden -- --update`,
      ).toBeNull();
    },
    60_000,
  );
});
