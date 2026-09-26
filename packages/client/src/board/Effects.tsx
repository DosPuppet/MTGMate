/**
 * Effets visuels pour suivre le rythme de la partie : blessures et soins qui s'envolent de leur cible
 * (avec un flash de la cible), silhouette des créatures qui meurent, bandeau de début de tour,
 * et mise en avant du sort que l'adversaire vient de lancer.
 */
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { faceName } from "../i18n";
import { type Fx, useGame } from "../store";
import { Card } from "./Card";
import { findObjectEl } from "./layout";

function targetRect(fx: Fx): Fx["rect"] {
  if (fx.rect) return fx.rect;
  const el = findObjectEl(fx.target);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height };
}

/** Secousse et flash de la cible au moment où l'effet s'affiche. */
function useImpact(fx: Fx) {
  useEffect(() => {
    if (fx.kind === "death") return;
    const t = setTimeout(() => {
      const el = findObjectEl(fx.target) as HTMLElement | null;
      if (!el) return;
      const hurt = fx.kind === "damage";
      el.animate(
        hurt
          ? [
              { transform: "translateX(0)", filter: "none" },
              { transform: "translateX(-5px)", filter: "brightness(1.8) sepia(1) hue-rotate(-40deg) saturate(4)" },
              { transform: "translateX(5px)" },
              { transform: "translateX(-3px)" },
              { transform: "translateX(0)", filter: "none" },
            ]
          : [{ filter: "none" }, { filter: "brightness(1.6) sepia(1) hue-rotate(60deg) saturate(3)" }, { filter: "none" }],
        { duration: hurt ? 380 : 600, easing: "ease-out" },
      );
    }, fx.delay * 1000);
    return () => clearTimeout(t);
  }, [fx]);
}

function FloatingNumber({ fx, origin }: { fx: Fx; origin: { x: number; y: number } }) {
  useImpact(fx);
  const [rect] = useState(() => targetRect(fx));
  if (!rect) return null;
  // Le chiffre part du haut de la cible (pas du centre, pour ne pas masquer un total de vie).
  const left = rect.x - origin.x + rect.w / 2;
  const top = rect.y - origin.y;
  if (fx.kind === "death") {
    return (
      <motion.div
        className="fx-ghost"
        style={{ left: rect.x - origin.x, top: rect.y - origin.y, width: rect.w, height: rect.h }}
        initial={{ opacity: 0.95, scale: 1, rotate: 0 }}
        animate={{ opacity: 0, scale: 0.7, rotate: -8, y: 30 }}
        transition={{ duration: 0.9, delay: fx.delay, ease: "easeIn" }}
      />
    );
  }
  return (
    <motion.div
      className={`fx-number ${fx.kind}`}
      style={{ left, top: top - 12, x: "-50%" }}
      initial={{ opacity: 0, y: 0, scale: 0.5 }}
      animate={{ opacity: [0, 1, 1, 0], y: -70, scale: [0.5, 1.35, 1.1, 1] }}
      transition={{ duration: 1.4, delay: fx.delay, times: [0, 0.15, 0.7, 1], ease: "easeOut" }}
    >
      {fx.kind === "damage" ? `−${fx.amount}` : `+${fx.amount}`}
    </motion.div>
  );
}

export function Effects() {
  const fx = useGame((s) => s.fx);
  const banner = useGame((s) => s.turnBanner);
  const spotlight = useGame((s) => s.spotlight);
  // Pendant un ciblage, l'encart cacherait la pile (dont les sorts peuvent être des cibles).
  const targeting = useGame((s) => s.casting?.stage === "target");
  const lang = useGame((s) => s.lang);
  const ref = useRef<HTMLDivElement>(null);
  const [origin, setOrigin] = useState({ x: 0, y: 0 });
  useLayoutEffect(() => {
    const r = ref.current?.getBoundingClientRect();
    if (r && (r.left !== origin.x || r.top !== origin.y)) setOrigin({ x: r.left, y: r.top });
  });
  return (
    <div className="fx-layer" ref={ref} aria-hidden="true">
      {fx.map((f) => (
        <FloatingNumber key={f.id} fx={f} origin={origin} />
      ))}
      <AnimatePresence>
        {banner && (
          <motion.div
            key={banner.id}
            className={`turn-banner ${banner.mine ? "mine" : ""}`}
            initial={{ opacity: 0, scale: 0.8, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 1.08 }}
            transition={{ duration: 0.3 }}
          >
            {banner.text}
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence mode="wait">
        {spotlight && !targeting && (
          <motion.div
            key={spotlight.id}
            className="spotlight"
            initial={{ opacity: 0, x: 40, scale: 0.85 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 40, scale: 0.9, transition: { duration: 0.15 } }}
            transition={{ duration: 0.25 }}
          >
            <div className="spotlight-label">
              {spotlight.who} joue <strong>{faceName(spotlight.face, lang)}</strong>
            </div>
            <Card face={spotlight.face} width="var(--spotlight-w)" hoverable={false} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
