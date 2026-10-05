import { FORMAT_LABELS, FORMATS, isFormat } from "@mtgx/cards";
import type { Format } from "@mtgx/engine";

const FORMAT_KEY = "planecircle.format";

const HINTS: Record<Format, string> = {
  standard: "Seules les cartes légales en Standard : les cartes bannies ou hors Standard sont refusées.",
  unlimited: "Toutes les cartes du catalogue, même bannies ou hors Standard ; 60 cartes minimum, 4 exemplaires au plus.",
};

/** Format retenu d'une partie à l'autre (le stockage peut être indisponible : navigation privée, aperçu). */
export function loadFormat(): Format {
  try {
    const v = localStorage.getItem(FORMAT_KEY);
    return isFormat(v) ? v : "standard";
  } catch {
    return "standard";
  }
}

export function saveFormat(format: Format): void {
  try {
    localStorage.setItem(FORMAT_KEY, format);
  } catch {
    // réglage non conservé
  }
}

/** Choix du format de la partie (Standard, ou sans limite). */
export function FormatChoice({ value, onChange }: { value: Format; onChange: (f: Format) => void }) {
  return (
    <div className="ai-level">
      <div className="ai-count">
        <span>Format</span>
        <div className="seg">
          {FORMATS.map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={value === f}
              className={value === f ? "on" : ""}
              onClick={() => onChange(f)}
            >
              {FORMAT_LABELS[f]}
            </button>
          ))}
        </div>
      </div>
      <div className="hint ai-level-hint">{HINTS[value]}</div>
    </div>
  );
}
