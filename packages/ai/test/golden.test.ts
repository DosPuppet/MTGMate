/**
 * Parties dorées (`ai/src/golden.ts`, PLAN-R.md lot F1) : à version des règles égale, chacune se rejoue à l'identique,
 * points de contrôle compris. Un lot qui change le comportement du moteur fait avancer `RULES_VERSION` (engine/src/record.ts)
 * et les régénère : `npm run golden -- --update`.
 */
import { readFileSync } from "node:fs";
import { card } from "@mtgx/cards";
import { type GameRecord, RULES_VERSION, replayChecked } from "@mtgx/engine";
import { describe, expect, it } from "vitest";
import { GOLDEN_GAMES } from "../src";

describe("parties dorées", () => {
  it.each(GOLDEN_GAMES.map((g) => [g.name]))(
    "%s se rejoue à l'identique",
    (name) => {
      const record = JSON.parse(readFileSync(new URL(`golden/${name}.json`, import.meta.url), "utf8")) as GameRecord;
      expect(record.rules, "RULES_VERSION a changé : npm run golden -- --update").toBe(RULES_VERSION);
      expect(record.checkpoints?.length).toBeGreaterThan(10);
      const { divergence } = replayChecked(record, card);
      expect(
        divergence,
        "Le moteur a changé de comportement : faire avancer RULES_VERSION, puis npm run golden -- --update",
      ).toBeNull();
    },
    60_000,
  );
});
