/**
 * Flèches SVG : cibles des sorts sur la pile, blocages, visée en cours.
 * Les positions sont recalculées à chaque image (les cartes peuvent être en cours d'animation).
 */
import { useEffect, useMemo, useRef } from "react";
import { useGame } from "../store";

interface ArrowSpec {
  key: string;
  from: string;
  to: string;
  kind: "target" | "block" | "pending-block" | "aim";
}

const MOUSE = "__mouse__";

function useArrowSpecs(): ArrowSpec[] {
  const view = useGame((s) => s.view);
  const blocks = useGame((s) => s.blocks);
  const casting = useGame((s) => s.casting);
  const attackers = useGame((s) => s.attackers);
  const attackTargets = useGame((s) => s.attackTargets);
  return useMemo(() => {
    const out: ArrowSpec[] = [];
    if (!view) return out;
    // Attaques contre un planeswalker (déclarées, ou en cours de sélection).
    for (const a of view.combat?.attackers ?? []) {
      if (!view.players[a.defender]) out.push({ key: `a-${a.id}`, from: a.id, to: a.defender, kind: "target" });
    }
    if (view.pending?.kind === "declareAttackers") {
      for (const id of attackers) {
        const d = attackTargets[id];
        if (d && !view.players[d]) out.push({ key: `pa-${id}`, from: id, to: d, kind: "pending-block" });
      }
    }
    for (const item of view.stack) {
      for (const t of item.targets) out.push({ key: `t-${item.id}-${t}`, from: item.id, to: t, kind: "target" });
    }
    for (const a of view.combat?.attackers ?? []) {
      for (const b of a.blockers) out.push({ key: `b-${b}-${a.id}`, from: b, to: a.id, kind: "block" });
    }
    for (const [b, a] of Object.entries(blocks)) out.push({ key: `pb-${b}-${a}`, from: b, to: a, kind: "pending-block" });
    if (casting) {
      for (const ids of Object.values(casting.targets)) {
        for (const t of ids) out.push({ key: `c-${casting.sourceId}-${t}`, from: casting.sourceId, to: t, kind: "target" });
      }
      if (casting.stage === "target") out.push({ key: "aim", from: casting.sourceId, to: MOUSE, kind: "aim" });
    }
    return out;
  }, [view, blocks, casting, attackers, attackTargets]);
}

function center(id: string): { x: number; y: number } | null {
  const el = document.querySelector(`[data-oid="${CSS.escape(id)}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

export function Arrows() {
  const specs = useArrowSpecs();
  const svg = useRef<SVGSVGElement>(null);
  const paths = useRef(new Map<string, SVGPathElement>());
  const mouse = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      mouse.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, []);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const box = svg.current?.getBoundingClientRect();
      for (const spec of specs) {
        const path = paths.current.get(spec.key);
        if (!path || !box) continue;
        const a = center(spec.from);
        const b = spec.to === MOUSE ? mouse.current : center(spec.to);
        if (!a || !b) {
          path.setAttribute("d", "");
          continue;
        }
        const x1 = a.x - box.left;
        const y1 = a.y - box.top;
        const x2 = b.x - box.left;
        const y2 = b.y - box.top;
        // Courbe légère : point de contrôle décalé perpendiculairement.
        const mx = (x1 + x2) / 2 - (y2 - y1) * 0.18;
        const my = (y1 + y2) / 2 + (x2 - x1) * 0.18;
        path.setAttribute("d", `M ${x1} ${y1} Q ${mx} ${my} ${x2} ${y2}`);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [specs]);

  return (
    <svg className="arrows" ref={svg} aria-hidden="true">
      <defs>
        {(["target", "block", "pending-block", "aim"] as const).map((k) => (
          <marker
            key={k}
            id={`head-${k}`}
            viewBox="0 0 10 10"
            refX="7"
            refY="5"
            markerWidth="5"
            markerHeight="5"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" className={`arrow-head ${k}`} />
          </marker>
        ))}
      </defs>
      {specs.map((s) => (
        <path
          key={s.key}
          ref={(el) => {
            if (el) paths.current.set(s.key, el);
            else paths.current.delete(s.key);
          }}
          className={`arrow ${s.kind}`}
          markerEnd={`url(#head-${s.kind})`}
        />
      ))}
    </svg>
  );
}
