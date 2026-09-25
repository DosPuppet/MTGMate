import type { CardFace, ObjectView } from "@mtgx/engine";
import { motion } from "motion/react";
import { type CSSProperties, useState } from "react";
import { faceImage, faceName, faceText, faceType } from "../i18n";
import { useGame } from "../store";

export type Glow = "playable" | "target" | "selectable" | "selected" | "attacking" | "blocking" | "activatable" | null;

const SPRING = { type: "spring", stiffness: 420, damping: 38 } as const;

/** Symboles de mana : "{2}{G}{G}" → pastilles colorées. */
export function ManaCost({ cost, size = 16 }: { cost: string; size?: number }) {
  const symbols = [...cost.matchAll(/\{([^}]+)\}/g)].map((m) => m[1] as string);
  return (
    <span className="mana-cost" style={{ "--sym": `${size}px` } as CSSProperties}>
      {symbols.map((s, i) =>
        /^[WUBRG]\/[WUBRG]$/.test(s) ? (
          <span key={i} className={`mana-sym hybrid mana-${s[0]}-${s[2]}`} title={`{${s}}`} />
        ) : (
          <span key={i} className={`mana-sym mana-${/^[WUBRGC]$/.test(s) ? s : "N"}`}>
            {/^[WUBRGC]$/.test(s) ? "" : s}
          </span>
        ),
      )}
    </span>
  );
}

/** Cadre texte : sert de repli si l'image ne charge pas, et d'apparence pour les jetons. */
function TextFrame({ face, obj }: { face: CardFace; obj?: ObjectView }) {
  const lang = useGame((s) => s.lang);
  const color = obj?.colors[0] ?? "C";
  return (
    <div className={`text-frame frame-${color}`}>
      <div className="tf-head">
        <span className="tf-name">{faceName(face, lang)}</span>
        <ManaCost cost={face.manaCost} size={10} />
      </div>
      <div className="tf-type">{faceType(face, lang)}</div>
      <div className="tf-text">{faceText(face, lang)}</div>
      {face.basePower !== undefined && (
        <div className="tf-pt">
          {face.basePower}/{face.baseToughness}
        </div>
      )}
    </div>
  );
}

interface CardProps {
  face: CardFace;
  obj?: ObjectView;
  /** Largeur CSS (variable ou valeur). */
  width: string;
  layoutId?: string;
  tapped?: boolean;
  glow?: Glow;
  showStats?: boolean;
  dim?: boolean;
  className?: string;
  onClick?: () => void;
  hoverable?: boolean;
  oid?: string;
}

export function Card({
  face,
  obj,
  width,
  layoutId,
  tapped,
  glow,
  showStats,
  dim,
  className,
  onClick,
  hoverable = true,
  oid,
}: CardProps) {
  const lang = useGame((s) => s.lang);
  const setHover = useGame((s) => s.setHover);
  const [failed, setFailed] = useState(false);
  const src = faceImage(face, lang);
  const height = `calc(${width} * 1.395)`;

  const power = obj?.power;
  const toughness = obj?.toughness;
  const buffed = power !== undefined && (power > (face.basePower ?? 0) || (toughness ?? 0) > (face.baseToughness ?? 0));
  const debuffed = power !== undefined && (power < (face.basePower ?? 0) || (toughness ?? 0) < (face.baseToughness ?? 0));

  return (
    <div
      className={`card-slot ${className ?? ""}`}
      style={{ width: tapped ? height : width, height }}
      data-oid={oid}
      onMouseEnter={hoverable ? () => setHover({ face, obj }) : undefined}
    >
      <motion.div
        layoutId={layoutId}
        layout
        transition={SPRING}
        className={`card ${glow ? `glow-${glow}` : ""} ${dim ? "dim" : ""} ${onClick ? "clickable" : ""}`}
        style={{ width, height }}
        animate={{ rotate: tapped ? 90 : 0 }}
        onClick={onClick}
      >
        <TextFrame face={face} obj={obj} />
        {src && !failed && (
          <img src={src} alt={faceName(face, lang)} draggable={false} onError={() => setFailed(true)} loading="lazy" />
        )}
        {showStats && obj && (
          <>
            {power !== undefined && (
              <div className={`pt-badge ${buffed ? "buffed" : ""} ${debuffed ? "debuffed" : ""}`}>
                {power}/{(toughness ?? 0) - obj.damage}
              </div>
            )}
            {obj.damage > 0 && <div className="dmg-badge">−{obj.damage}</div>}
            {obj.chosen && (
              <div className="chosen-badge" title="Choix fait en arrivant">
                {obj.chosen.creatureType ?? COLOR_NAME[obj.chosen.color ?? ""] ?? ""}
              </div>
            )}
            {obj.types.includes("Planeswalker") && (
              <div className="loyalty-badge" title="Loyauté">
                {obj.counters.loyalty ?? 0}
              </div>
            )}
            <CounterBadges counters={obj.counters} />
            {obj.sick && obj.types.includes("Creature") && (
              <div className="sick-badge" title="Mal d'invocation">
                z
              </div>
            )}
          </>
        )}
      </motion.div>
    </div>
  );
}

const COUNTER_LABEL: Record<string, string> = {
  stun: "Étourdi",
  loyalty: "Loyauté",
  revival: "Résurrection",
  fellowship: "Camaraderie",
  bait: "Appât",
  incubation: "Incubation",
  soul: "Âme",
  stash: "Butin",
};
const COLOR_NAME: Record<string, string> = { W: "Blanc", U: "Bleu", B: "Noir", R: "Rouge", G: "Vert" };

/** Pastilles de marqueurs : +N pour les +1/+1, -N pour les -1/-1, nom et nombre pour les autres. */
function CounterBadges({ counters }: { counters: Record<string, number> }) {
  const net = (counters["+1/+1"] ?? 0) - (counters["-1/-1"] ?? 0);
  const others = Object.entries(counters).filter(([k, n]) => n > 0 && k !== "+1/+1" && k !== "-1/-1" && k !== "loyalty");
  return (
    <div className="counter-badges">
      {net !== 0 && <span className={`counter-badge ${net < 0 ? "minus" : ""}`}>{net > 0 ? `+${net}` : net}</span>}
      {others.map(([k, n]) => (
        <span key={k} className="counter-badge other" title={COUNTER_LABEL[k] ?? k}>
          {COUNTER_LABEL[k] ?? k} {n}
        </span>
      ))}
    </div>
  );
}

export function CardBack({ width }: { width: string }) {
  return <div className="card-back" style={{ width, height: `calc(${width} * 1.395)` }} />;
}
