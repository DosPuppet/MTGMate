/**
 * Écrans tactiles (tablette, téléphone) : pas de survol, donc l'aperçu d'une carte passe par l'appui long,
 * et une carte de la main se lève au premier tap avant d'être jouée au second.
 */
import { type PointerEvent, useRef } from "react";

/** Pointeur principal tactile (pas de survol). Un ordinateur à écran tactile garde le comportement de la souris. */
export const isTouch = (): boolean =>
  typeof window !== "undefined" && window.matchMedia("(hover: none), (pointer: coarse)").matches;

/** Durée de l'appui long (ms) et tolérance de mouvement (px) avant qu'il soit annulé (glisser, défilement). */
const LONG_PRESS_MS = 450;
const MOVE_TOLERANCE = 10;

let lastLongPress = 0;
/** Vrai juste après un appui long : le tap qui le termine ne doit pas jouer la carte. */
export const justLongPressed = (): boolean => Date.now() - lastLongPress < 700;

/**
 * Gestionnaires d'appui long (doigt seulement) à étaler sur l'élément : `onLong` est appelé après LONG_PRESS_MS
 * sans mouvement. Le clic qui suit est absorbé.
 */
export function useLongPress(onLong: (() => void) | undefined) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef({ x: 0, y: 0 });
  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  if (!onLong) return {};
  return {
    onPointerDown(e: PointerEvent) {
      if (e.pointerType === "mouse") return;
      start.current = { x: e.clientX, y: e.clientY };
      clear();
      timer.current = setTimeout(() => {
        timer.current = null;
        lastLongPress = Date.now();
        onLong();
      }, LONG_PRESS_MS);
    },
    onPointerMove(e: PointerEvent) {
      if (timer.current && Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > MOVE_TOLERANCE) clear();
    },
    onPointerUp: clear,
    onPointerCancel: clear,
    onClickCapture(e: { stopPropagation(): void; preventDefault(): void }) {
      if (!justLongPressed()) return;
      e.stopPropagation();
      e.preventDefault();
    },
  };
}
