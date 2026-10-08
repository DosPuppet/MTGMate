/**
 * "Name" question (card name, land card name, creature type): the public names offered by the engine as buttons, and a
 * search in the whole catalog (French names first). Keyboard: ↑ ↓ to go through the results, Enter to confirm. The
 * answer is the English name.
 */
import type { NameKind } from "@mtgx/engine";
import { useEffect, useMemo, useState } from "react";
import { useT } from "../localize";
import { nameLabel, searchNames } from "../names";
import { useGame } from "../store";

/** Touch screen: no automatic focus (the virtual keyboard would hide the offered names). */
const coarsePointer = () => typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;

export function NameSearch({
  of,
  featured,
  suggested,
  value,
  onChange,
  onSubmit,
}: {
  of: NameKind;
  featured: string[];
  suggested: string;
  value: string;
  onChange: (name: string) => void;
  onSubmit: (name: string) => void;
}) {
  const lang = useGame((s) => s.lang);
  const t = useT();
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const results = useMemo(() => searchNames(of, query, lang), [of, query, lang]);
  // New search: the first result is chosen (what Enter and "Confirm" would send).
  // biome-ignore lint/correctness/useExhaustiveDependencies: only when the results change
  useEffect(() => {
    setCursor(0);
    if (results[0]) onChange(results[0]);
  }, [results]);
  // The result reached with the keyboard stays visible in the list.
  useEffect(() => {
    document.getElementById(`name-result-${cursor}`)?.scrollIntoView({ block: "nearest" });
  }, [cursor]);
  const label = (n: string) => nameLabel(n, of, lang);
  const english = (n: string) => (label(n) !== n ? n : null);
  const shown = featured.includes(suggested) || !suggested ? featured : [suggested, ...featured];
  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!results.length) return;
      const next = Math.max(0, Math.min(results.length - 1, cursor + (e.key === "ArrowDown" ? 1 : -1)));
      setCursor(next);
      onChange(results[next] as string);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const n = results[cursor] ?? (query.trim() ? undefined : value);
      if (n) onSubmit(n);
    }
  };
  return (
    <div className="name-search">
      {shown.length > 0 && (
        <div className="name-featured">
          {shown.map((n) => (
            <button
              key={n}
              type="button"
              className={`btn small choice ${n === value ? "primary" : ""} ${n === suggested ? "suggested" : ""}`}
              onClick={() => onChange(n)}
              onDoubleClick={() => onSubmit(n)}
            >
              {label(n)}
            </button>
          ))}
        </div>
      )}
      <input
        className="choice-search"
        type="search"
        enterKeyHint="done"
        placeholder={of === "creatureType" ? t("Search for a creature type…") : t("Search for a card name…")}
        aria-label={t("Search for a name")}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={onKey}
        // biome-ignore lint/a11y/noAutofocus: the search is the main action of this window
        autoFocus={!coarsePointer()}
      />
      {results.length > 0 && (
        <div className="name-results" role="listbox" aria-label={t("Results")}>
          {results.map((n, i) => (
            <button
              key={n}
              id={`name-result-${i}`}
              type="button"
              role="option"
              aria-selected={n === value}
              className={`name-result ${n === value ? "selected" : ""} ${i === cursor ? "active" : ""}`}
              onClick={() => {
                setCursor(i);
                onChange(n);
              }}
              onDoubleClick={() => onSubmit(n)}
            >
              {label(n)}
              {english(n) && <small>{english(n)}</small>}
            </button>
          ))}
        </div>
      )}
      {query.trim() && results.length === 0 && <p className="hint">{t("No name matches this search.")}</p>}
      <p className="hint name-chosen">
        {t("Your choice:")} <strong>{value ? label(value) : "—"}</strong>
      </p>
    </div>
  );
}
