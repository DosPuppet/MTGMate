import { FORMAT_LABELS, FORMATS, isFormat } from "@mtgx/cards";
import type { Format } from "@mtgx/engine";
import { useT } from "../localize";

const FORMAT_KEY = "planecircle.format";

function hint(format: Format, t: ReturnType<typeof useT>): string {
  switch (format) {
    case "standard":
      return t("Only cards legal in Standard: banned cards and cards not in Standard are refused.");
    case "unlimited":
      return t("All the cards of the catalog, even banned or not in Standard; 60 cards minimum, 4 copies at most.");
    case "commander":
      return t(
        "From 2 to 4 players, 40 life: 100 cards including your commander, one copy of each card, all within its color identity.",
      );
  }
}

/** Format kept from one game to the next (storage can be unavailable: private browsing, preview). */
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
    // setting not kept
  }
}

/** Choice of the game format (Standard, unlimited, Commander; `formats`: the ones offered). */
export function FormatChoice({
  value,
  onChange,
  formats = FORMATS,
}: {
  value: Format;
  onChange: (f: Format) => void;
  formats?: readonly Format[];
}) {
  const t = useT();
  return (
    <div className="ai-level">
      <div className="ai-count">
        <span>{t("Format")}</span>
        <div className="seg">
          {formats.map((f) => (
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
      <div className="hint ai-level-hint">{hint(value, t)}</div>
    </div>
  );
}
