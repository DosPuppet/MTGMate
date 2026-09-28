/**
 * Placement de la bulle du guide : parmi quelques positions candidates (autour de la cible, bords de l'écran),
 * celle qui recouvre le moins ce que le joueur doit voir ou cliquer (cartes, boutons, fenêtres), et jamais la cible.
 * Pur (testé par `client/test/placement.test.ts`).
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Obstacle {
  r: Rect;
  /** Importance : recouvrir la cible coûte bien plus que recouvrir une carte quelconque. */
  weight: number;
}

const MARGIN = 12;

const overlap = (a: Rect, b: Rect): number =>
  Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) *
  Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));

export function placeBubble(
  target: Rect | null,
  size: { w: number; h: number },
  viewport: { w: number; h: number },
  obstacles: Obstacle[],
  gap = 20,
): { left: number; top: number } {
  const { w, h } = size;
  const maxX = viewport.w - w - MARGIN;
  const maxY = viewport.h - h - MARGIN;
  const near: [number, number][] = target
    ? [
        [target.x + target.w / 2 - w / 2, target.y + target.h + gap], // dessous
        [target.x + target.w / 2 - w / 2, target.y - gap - h], // dessus
        [target.x + target.w + gap, target.y + target.h / 2 - h / 2], // à droite
        [target.x - gap - w, target.y + target.h / 2 - h / 2], // à gauche
      ]
    : [[(viewport.w - w) / 2, viewport.h * 0.14]];
  const edges: [number, number][] = [
    [MARGIN, 70],
    [maxX, 70],
    [MARGIN, (viewport.h - h) / 2],
    [maxX, (viewport.h - h) / 2],
    [maxX, maxY],
    [(viewport.w - w) / 2, 70],
  ];
  const all = [...near, ...edges].map(([x, y]) => ({ x: clamp(x, MARGIN, maxX), y: clamp(y, MARGIN, maxY), w, h }));
  const weighted = target ? [...obstacles, { r: target, weight: 20 }] : obstacles;
  let best = all[0] as Rect;
  let bestScore = Number.POSITIVE_INFINITY;
  all.forEach((c, i) => {
    // À recouvrement égal, les positions proches de la cible passent avant les bords de l'écran.
    const score = weighted.reduce((s, o) => s + o.weight * overlap(c, o.r), 0) + i * 400;
    if (score < bestScore) {
      bestScore = score;
      best = c;
    }
  });
  return { left: best.x, top: best.y };
}
