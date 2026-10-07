/**
 * Question « nom » (nom de carte, de carte de terrain, type de créature) : les noms publics proposés par le moteur en
 * boutons, et une recherche dans tout le catalogue (noms français d'abord). Clavier : ↑ ↓ pour parcourir les résultats,
 * Entrée pour valider. La réponse est le nom anglais.
 */
import type { NameKind } from "@mtgx/engine";
import { useEffect, useMemo, useState } from "react";
import { nameLabel, searchNames } from "../names";
import { useGame } from "../store";

/** Écran tactile : pas de focus automatique (le clavier virtuel cacherait les noms proposés). */
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
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const results = useMemo(() => searchNames(of, query, lang), [of, query, lang]);
  // Nouvelle recherche : le premier résultat est choisi (ce qu'enverraient Entrée et « Valider »).
  // biome-ignore lint/correctness/useExhaustiveDependencies: seulement quand les résultats changent
  useEffect(() => {
    setCursor(0);
    if (results[0]) onChange(results[0]);
  }, [results]);
  // Le résultat parcouru au clavier reste visible dans la liste.
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
        placeholder={of === "creatureType" ? "Rechercher un type de créature…" : "Rechercher un nom de carte…"}
        aria-label="Rechercher un nom"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={onKey}
        // biome-ignore lint/a11y/noAutofocus: la recherche est l'action principale de cette fenêtre
        autoFocus={!coarsePointer()}
      />
      {results.length > 0 && (
        <div className="name-results" role="listbox" aria-label="Résultats">
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
      {query.trim() && results.length === 0 && <p className="hint">Aucun nom ne correspond à cette recherche.</p>}
      <p className="hint name-chosen">
        Votre choix : <strong>{value ? label(value) : "—"}</strong>
      </p>
    </div>
  );
}
