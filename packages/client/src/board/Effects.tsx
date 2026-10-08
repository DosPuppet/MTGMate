/**
 * Visual effects that follow the pace of the game: damage and healing floating up from their target
 * (with a flash of the target), silhouette of dying creatures, start-of-turn banner,
 * highlight of the spell the opponent just cast, and of each spell or ability as it resolves.
 */
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { faceName } from "../i18n";
import { useLocalize, useT } from "../localize";
import { type Fx, playbackTimes, useGame } from "../store";
import { Card } from "./Card";
import { findObjectEl } from "./layout";
import { EffectFrame, useRevealActive } from "./StackReveal";

function targetRect(fx: Fx): Fx["rect"] {
  if (fx.rect) return fx.rect;
  const el = findObjectEl(fx.target);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height };
}

/** Shake and flash of the target when the effect appears. */
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
  // The number starts from the top of the target (not the center, so as not to hide a life total).
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

/**
 * Speed (702.179): "⚡2" … "⚡MAX" just above the player's gauge, measured once the screen is up to date
 * (the gauge does not exist yet when the speed starts).
 */
function SpeedFloat({ fx, origin }: { fx: Fx; origin: { x: number; y: number } }) {
  const [rect, setRect] = useState<Fx["rect"]>(null);
  useLayoutEffect(() => {
    const measure = () => {
      const el = document.querySelector(`[data-speed-of="${fx.target}"]`);
      const r = el?.getBoundingClientRect();
      if (r) setRect({ x: r.left, y: r.top, w: r.width, h: r.height });
      return !!r;
    };
    if (measure()) return;
    const frame = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(frame);
  }, [fx.target]);
  if (!rect) return null;
  return (
    <motion.div
      className="fx-number speed"
      style={{ left: rect.x - origin.x + rect.w / 2, top: rect.y - origin.y - 22, x: "-50%" }}
      initial={{ opacity: 0, y: 0, scale: 0.5 }}
      animate={{ opacity: [0, 1, 1, 0], y: -10, scale: [0.5, 1.2, 1, 1] }}
      transition={{ duration: 2, delay: fx.delay, times: [0, 0.12, 0.8, 1], ease: "easeOut" }}
    >
      ⚡{fx.amount >= 4 ? "MAX" : fx.amount}
    </motion.div>
  );
}

export function Effects() {
  const fx = useGame((s) => s.fx);
  const banner = useGame((s) => s.turnBanner);
  const spotlight = useGame((s) => s.spotlight);
  // While targeting, the panel would hide the stack (whose spells can be targets).
  const targeting = useGame((s) => s.casting?.stage === "target");
  // The stack panel (StackReveal) already shows the opponent's spell.
  const revealing = useRevealActive();
  // The effect played by the object shown (the most recent stack item from that card).
  const spotEffect = useGame((s) =>
    s.spotlight ? [...(s.view?.stack ?? [])].reverse().find((i) => i.defId === s.spotlight?.face.defId && i.effect) : undefined,
  );
  const lang = useGame((s) => s.lang);
  const resolving = useGame((s) => s.resolving);
  const pace = useGame((s) => s.pace);
  const view = useGame((s) => s.view);
  const t = useT();
  const loc = useLocalize();
  const ref = useRef<HTMLDivElement>(null);
  const [origin, setOrigin] = useState({ x: 0, y: 0 });
  useLayoutEffect(() => {
    const r = ref.current?.getBoundingClientRect();
    if (r && (r.left !== origin.x || r.top !== origin.y)) setOrigin({ x: r.left, y: r.top });
  });
  // The card name is set in bold inside the sentence: the template is split around a marker.
  const CARD = "\u0001";
  const [spotBefore = "", spotAfter = ""] = spotlight
    ? t("{player} plays {card}", { player: spotlight.who, card: CARD }).split(CARD)
    : [];
  return (
    <div className="fx-layer" ref={ref} aria-hidden="true">
      {fx.map((f) =>
        f.kind === "speed" ? (
          <SpeedFloat key={f.id} fx={f} origin={origin} />
        ) : (
          <FloatingNumber key={f.id} fx={f} origin={origin} />
        ),
      )}
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
            {loc(banner.text)}
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {resolving && view && (
          <motion.div
            key={resolving.id}
            className={`resolution ${resolving.outcome}`}
            initial={{ opacity: 0, x: 40, scale: 0.85 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={
              resolving.outcome === "resolve"
                ? { opacity: 0, scale: 1.12, filter: "brightness(1.8)", transition: { duration: 0.25 } }
                : { opacity: 0, y: 30, rotate: -6, filter: "grayscale(1)", transition: { duration: 0.3 } }
            }
            transition={{ duration: 0.22 }}
          >
            <div className="resolution-label">
              {resolving.outcome === "resolve"
                ? t("Resolving")
                : resolving.outcome === "countered"
                  ? t("Countered")
                  : t("No effect")}
              {" · "}
              {resolving.item.controller === view.viewer ? t("you") : (view.players[resolving.item.controller]?.name ?? "")}
            </div>
            <Card face={resolving.item} width="var(--spotlight-w)" hoverable={false} />
            {resolving.item.effect && <EffectFrame text={resolving.item.effect} ability={resolving.item.kind === "ability"} />}
            {resolving.outcome === "fizzle" && <div className="resolution-note">{t("Its targets are no longer legal.")}</div>}
            <div className="resolution-timer">
              <div className="resolution-bar" style={{ animationDuration: `${playbackTimes(pace).show}ms` }} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence mode="wait">
        {spotlight && !targeting && !revealing && !resolving && (
          <motion.div
            key={spotlight.id}
            className="spotlight"
            initial={{ opacity: 0, x: 40, scale: 0.85 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 40, scale: 0.9, transition: { duration: 0.15 } }}
            transition={{ duration: 0.25 }}
          >
            <div className="spotlight-label">
              {spotBefore}
              <strong>{faceName(spotlight.face, lang)}</strong>
              {spotAfter}
            </div>
            <Card face={spotlight.face} width="var(--spotlight-w)" hoverable={false} />
            {spotEffect && <EffectFrame text={spotEffect.effect as string} ability={spotEffect.kind === "ability"} />}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
