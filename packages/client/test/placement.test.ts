import { describe, expect, it } from "vitest";
import { placeBubble, type Rect } from "../src/tutorial/placement";

const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const VIEW = { w: 1500, h: 880 };
const SIZE = { w: 380, h: 120 };

describe("placeBubble", () => {
  it("se place près de la cible sans la recouvrir", () => {
    const target = { x: 400, y: 740, w: 150, h: 140 }; // une carte de la main
    const { left, top } = placeBubble(target, SIZE, VIEW, []);
    const bubble = { x: left, y: top, ...SIZE };
    expect(overlaps(bubble, target)).toBe(false);
    expect(top + SIZE.h).toBeLessThanOrEqual(target.y); // au-dessus de la main
  });

  it("évite les cartes à cliquer quand une autre position est libre", () => {
    const target = { x: 300, y: 450, w: 700, h: 170 }; // votre champ de bataille
    const attackers = { x: 500, y: 200, w: 260, h: 150 }; // les attaquants adverses, juste au-dessus
    const { left, top } = placeBubble(target, SIZE, VIEW, [{ r: attackers, weight: 1 }]);
    const bubble = { x: left, y: top, ...SIZE };
    expect(overlaps(bubble, target)).toBe(false);
    expect(overlaps(bubble, attackers)).toBe(false);
  });

  it("reste dans l'écran", () => {
    const target = { x: 1450, y: 5, w: 40, h: 40 };
    const { left, top } = placeBubble(target, SIZE, VIEW, []);
    expect(left).toBeGreaterThanOrEqual(12);
    expect(left + SIZE.w).toBeLessThanOrEqual(VIEW.w - 12);
    expect(top).toBeGreaterThanOrEqual(12);
    expect(top + SIZE.h).toBeLessThanOrEqual(VIEW.h - 12);
  });

  it("sans cible, recouvre le moins possible une fenêtre de choix", () => {
    const modal = { x: 30, y: 120, w: 1100, h: 630 };
    const buttons = { x: 930, y: 690, w: 180, h: 40 };
    const { left, top } = placeBubble(null, SIZE, VIEW, [
      { r: modal, weight: 1 },
      { r: buttons, weight: 1 },
    ]);
    const bubble = { x: left, y: top, ...SIZE };
    expect(overlaps(bubble, buttons)).toBe(false);
    expect(left).toBeGreaterThan(1000); // sur le bord droit (barre latérale)
  });
});
