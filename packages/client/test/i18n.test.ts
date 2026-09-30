/** Textes de l'interface : noms de cartes des invites du moteur, journal (cartes révélées, poison, défaite). */
import { type CardFace, cardRef, type GameView } from "@mtgx/engine";
import { describe, expect, it } from "vitest";
import { describeEvents, localizeText } from "../src/i18n";

const face = (defId: string, name: string, fr: string) => ({ defId, name, fr: { name: fr } }) as unknown as CardFace;
const faces = { bolt: face("bolt", "Lightning Bolt", "Foudre"), bear: face("bear", "Bear Cub", "Ourson") };
const view = {
  viewer: "p1",
  players: { p1: { id: "p1", name: "Alice" }, p2: { id: "p2", name: "Bob" } },
} as unknown as GameView;

describe("textes de l'interface", () => {
  it("les repères de carte du moteur deviennent le nom dans la langue choisie", () => {
    const prompt = `Répartissez les 3 blessures de ${cardRef("bear")}`;
    expect(localizeText(prompt, faces, "fr")).toBe("Répartissez les 3 blessures de Ourson");
    expect(localizeText(prompt, faces, "en")).toBe("Répartissez les 3 blessures de Bear Cub");
    expect(localizeText(`Règle des légendes : ${cardRef("inconnue")}`, faces, "fr")).toBe("Règle des légendes : cette carte");
  });

  it("journal : cartes révélées, marqueurs poison, défaite par poison", () => {
    const lines = describeEvents(
      [
        { type: "reveal", player: "p2", defIds: ["bolt", "bear"] },
        { type: "poison", player: "p1", amount: 2, total: 9 },
        { type: "lose", player: "p2", reason: "poison" },
      ],
      view,
      faces,
      "fr",
    ).map((l) => l.text);
    expect(lines).toEqual([
      "Bob révèle Foudre, Ourson.",
      "Vous recevez 2 marqueurs poison (9).",
      "Bob perd (10 marqueurs poison).",
    ]);
  });
});
