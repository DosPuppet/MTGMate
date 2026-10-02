/**
 * Test de fumée : cartes gérées des extensions sans fichier propre (`OWN_FILES`). Depuis The Hobbit, chaque extension a
 * le sien ; ce fichier reprend une extension ajoutée sans fichier.
 */
import { expect, it } from "vitest";
import { OTHER_SETS, smokeTest } from "./harness";

smokeTest(OTHER_SETS());

it("les extensions sans fichier de fumée propre sont testées ici", () => {
  expect(Array.isArray(OTHER_SETS())).toBe(true);
});
