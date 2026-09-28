/**
 * Le guide du tutoriel : une bulle de texte près de l'élément concerné, entouré d'un anneau lumineux.
 * L'anneau ne capte pas les clics : l'élément reste jouable dessous.
 */
import type { GameView } from "@mtgx/engine";
import { Fragment, useEffect, useRef, useState } from "react";
import { ManaCost } from "../board/Card";
import { findObjectEl } from "../board/layout";
import { useGame } from "../store";
import { LESSONS, lessonById } from "./lessons";
import { placeBubble, type Rect } from "./placement";
import { stepText, type Target } from "./runtime";
import { useTutorial } from "./store";

const SELECTORS: Record<Exclude<Target, object>, string[]> = {
  myLife: ['[data-tuto="life-me"]'],
  oppLife: ['[data-tuto="life-opp"]'],
  hand: ['[data-tuto="hand"]'],
  myField: ['[data-tuto="field-me"]'],
  oppField: ['[data-tuto="field-opp"]'],
  library: ['[data-tuto="library-me"]'],
  graveyard: ['[data-tuto="graveyard-me"]'],
  phaseBar: ['[data-tuto="phase-bar"]'],
  stops: ['[data-tuto="stops"]'],
  mainButton: ['[data-tuto="main-button"]'],
  endTurn: ['[data-tuto="end-turn"]'],
  log: [".sidebar .log"],
  preview: [".sidebar .preview"],
  // Le panneau d'un sort adverse (bouton OK) s'il est affiché, sinon la pile.
  stack: [".stack-reveal", '[data-tuto="stack"]'],
  settings: [".sidebar .settings"],
};

function cardId(t: Extract<Target, object>, v: GameView): string | undefined {
  const owner = t.owner === "opponent" ? v.opponents[0] : v.viewer;
  if (t.zone === "stack") return v.stack.find((it) => it.name === t.card)?.id;
  if (t.zone !== "battlefield") {
    const inHand = v.hand.find((o) => o.name === t.card)?.id;
    if (inHand || t.zone === "hand") return inHand;
  }
  return v.battlefield.find((o) => o.name === t.card && o.controller === owner)?.id;
}

function targetElement(t: Target | undefined, v: GameView | null): Element | null {
  if (!t || !v) return null;
  if (typeof t === "object") {
    const id = cardId(t, v);
    return id ? findObjectEl(id) : null;
  }
  for (const sel of SELECTORS[t]) {
    const el = document.querySelector(sel);
    if (el) return el;
  }
  return null;
}

/** Ce que la bulle doit éviter de recouvrir : cartes et joueurs du plateau, main, boutons, fenêtres de choix. */
const OBSTACLES = ".board [data-oid], .board [data-oids], .action-panel, .stack-reveal, .modal, .banner";

function rectOf(el: Element | null): Rect | null {
  const r = el?.getBoundingClientRect();
  return r && r.width > 0 && r.height > 0 ? { x: r.left, y: r.top, w: r.width, h: r.height } : null;
}

const keyOf = (r: Rect | null) => (r ? `${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.w)},${Math.round(r.h)}` : "");

/**
 * Anneau autour de la cible et position de la bulle, suivis à chaque image
 * (animations, redimensionnement, cartes qui bougent).
 */
function useCoachLayout(
  target: Target | undefined,
  bubble: React.RefObject<HTMLDivElement | null>,
): { ring: Rect | null; pos: { left: number; top: number } | null } {
  const view = useGame((s) => s.view);
  const [layout, setLayout] = useState<{ ring: Rect | null; pos: { left: number; top: number } | null }>({
    ring: null,
    pos: null,
  });
  const last = useRef("");
  useEffect(() => {
    let raf = 0;
    let frame = 0;
    const tick = () => {
      // Tous les 4 images : assez pour suivre les cartes, sans mesurer tout le plateau en permanence.
      if (frame++ % 4 === 0) {
        const ring = rectOf(targetElement(target, view));
        const b = bubble.current;
        const size = { w: b?.offsetWidth ?? 360, h: b?.offsetHeight ?? 120 };
        const obstacles = [...document.querySelectorAll(OBSTACLES)]
          .filter((el) => !b?.contains(el))
          .map((el) => rectOf(el))
          .filter((r): r is Rect => !!r)
          .map((r) => ({ r, weight: 1 }));
        const pos = placeBubble(ring, size, { w: window.innerWidth, h: window.innerHeight }, obstacles, GAP + PAD);
        const key = `${keyOf(ring)}|${Math.round(pos.left)},${Math.round(pos.top)}`;
        if (key !== last.current) {
          last.current = key;
          setLayout({ ring, pos });
        }
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [target, view, bubble]);
  return layout;
}

/** Texte du guide : **gras** et symboles de mana ({G}, {1}…). */
export function RichText({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|\{[^}]+\}(?:\{[^}]+\})*)/g);
  return (
    <>
      {parts.map((p, i) => {
        const key = `${i}-${p}`;
        if (p.startsWith("**")) return <strong key={key}>{p.slice(2, -2)}</strong>;
        if (p.startsWith("{")) return <ManaCost key={key} cost={p} size={15} />;
        return <Fragment key={key}>{p}</Fragment>;
      })}
    </>
  );
}

const GAP = 14;
const PAD = 6;

export function Coach() {
  const t = useTutorial();
  const lesson = lessonById(t.lessonId);
  const step = lesson?.steps[t.step];
  const ref = useRef<HTMLDivElement>(null);
  const { ring: rect, pos } = useCoachLayout(t.finished ? undefined : step?.target, ref);
  const [hidden, setHidden] = useState(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: la bulle réapparaît à chaque nouvelle étape
  useEffect(() => setHidden(false), [t.lessonId, t.step, t.finished]);
  if (!lesson || !step) return null;
  const index = LESSONS.indexOf(lesson);
  const nextLesson = LESSONS[index + 1];
  const tip = step.free && t.ctx ? step.tips?.find((x) => t.ctx && x.when(t.ctx))?.text : undefined;

  if (hidden) {
    return (
      <button type="button" className="coach-reopen" onClick={() => setHidden(false)}>
        Guide
      </button>
    );
  }

  return (
    <>
      {rect && !t.finished && (
        <div
          className={`coach-ring ${step.next ? "dim" : ""}`}
          style={{ left: rect.x - PAD, top: rect.y - PAD, width: rect.w + PAD * 2, height: rect.h + PAD * 2 }}
        />
      )}
      <div
        ref={ref}
        className={`coach ${t.finished ? "done" : ""}`}
        style={{
          width: "min(380px, calc(100vw - 24px))",
          left: pos?.left ?? 12,
          top: pos?.top ?? 70,
          visibility: pos ? "visible" : "hidden",
        }}
        role="dialog"
      >
        <div className="coach-head">
          <span>
            Leçon {index + 1}/{LESSONS.length} · {lesson.title}
          </span>
          {!t.finished && (
            <span className="coach-count">
              {t.step + 1}/{lesson.steps.length}
            </span>
          )}
        </div>
        {t.finished ? (
          <>
            <div className="coach-text">
              <strong>Leçon terminée !</strong>{" "}
              {nextLesson ? `Suite : « ${nextLesson.title} ».` : "Vous avez terminé tout le tutoriel. Bravo !"}
            </div>
            <div className="coach-actions">
              {nextLesson && (
                <button type="button" className={`btn small ${t.chain ? "primary" : ""}`} onClick={t.startNext}>
                  Leçon suivante
                </button>
              )}
              <button type="button" className={`btn small ${t.chain && nextLesson ? "" : "primary"}`} onClick={t.quit}>
                Menu du tutoriel
              </button>
              <button type="button" className="btn small ghost" onClick={() => setHidden(true)} title="Masquer le guide">
                Masquer
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="coach-text">
              <RichText text={stepText(step, t.ctx)} />
            </div>
            {tip && (
              <div className="coach-tip">
                <RichText text={tip} />
              </div>
            )}
            <div className="coach-actions">
              {step.next && (
                <button type="button" className="btn small primary coach-next" onClick={t.next}>
                  {t.step + 1 === lesson.steps.length ? "Terminer" : "Suivant"}
                </button>
              )}
              <span className="coach-spacer" />
              {step.free && (
                <button type="button" className="btn small ghost" onClick={() => setHidden(true)} title="Masquer le guide">
                  Masquer
                </button>
              )}
              <button type="button" className="btn small ghost" onClick={t.restart} title="Recommencer la leçon">
                Recommencer
              </button>
              <button type="button" className="btn small ghost" onClick={t.quit}>
                Quitter
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
