/**
 * Réserve entre deux manches d'un BO3 : on déplace des exemplaires entre le deck et la réserve. Le nouveau deck doit
 * contenir les mêmes cartes qu'au début du match (deck et réserve réunis) et rester légal (`sideboardSwapError`).
 */
import { CARDS, type DeckEntries, sideboardSwapError } from "@mtgx/cards";
import { useState } from "react";
import { useGame } from "../store";

const total = (d: DeckEntries) => d.reduce((n, [k]) => n + k, 0);

/** Retire un exemplaire de `name` de `from` et l'ajoute à `to`. */
function moveOne(from: DeckEntries, to: DeckEntries, name: string): [DeckEntries, DeckEntries] {
  const nextFrom = from.map(([n, x]) => [x === name ? n - 1 : n, x] as [number, string]).filter(([n]) => n > 0);
  const has = to.some(([, x]) => x === name);
  const nextTo = has
    ? to.map(([n, x]) => [x === name ? n + 1 : n, x] as [number, string])
    : [...to, [1, name] as [number, string]];
  return [nextFrom, nextTo];
}

export function SideboardEditor({
  start,
  original,
  waiting,
  onSubmit,
}: {
  /** Deck et réserve de la manche qui vient de se terminer (point de départ). */
  start: { main: DeckEntries; sideboard: DeckEntries };
  /** Deck et réserve du début du match (les mêmes cartes au total). */
  original: { main: DeckEntries; sideboard: DeckEntries };
  /** Réserve déjà envoyée : on attend l'adversaire. */
  waiting?: string;
  onSubmit: (main: DeckEntries, sideboard: DeckEntries) => void;
}) {
  const lang = useGame((s) => s.lang);
  // Format du match (contre l'IA, ou du salon en ligne) : le deck doit y rester légal.
  const format = useGame((s) => s.localMatch?.format ?? s.online?.match?.format);
  const [main, setMain] = useState(start.main);
  const [side, setSide] = useState(start.sideboard);
  const error = sideboardSwapError(original, { main, sideboard: side }, CARDS, format);
  const label = (name: string) => (lang === "fr" && CARDS[name]?.fr?.name) || name;
  const rows = (entries: DeckEntries, toSide: boolean) =>
    [...entries]
      .sort((a, b) => label(a[1]).localeCompare(label(b[1])))
      .map(([n, name]) => (
        <li key={name}>
          {!toSide && (
            <button
              type="button"
              className="btn tiny"
              disabled={!!waiting}
              title="Mettre un exemplaire dans le deck"
              onClick={() => {
                const [s, m] = moveOne(side, main, name);
                setSide(s);
                setMain(m);
              }}
            >
              ←
            </button>
          )}
          <span className="sb-count">{n}</span> {label(name)}
          {toSide && (
            <button
              type="button"
              className="btn tiny"
              disabled={!!waiting}
              title="Mettre un exemplaire en réserve"
              onClick={() => {
                const [m, s] = moveOne(main, side, name);
                setMain(m);
                setSide(s);
              }}
            >
              →
            </button>
          )}
        </li>
      ));
  return (
    <div className="sideboard-editor">
      {original.sideboard.length === 0 && main.length > 0 && (
        <p className="hint">Ce deck n'a pas de réserve : il est rejoué tel quel.</p>
      )}
      {original.sideboard.length > 0 && (
        <div className="sb-columns">
          <div>
            <h3>Deck ({total(main)})</h3>
            <ul>{rows(main, true)}</ul>
          </div>
          <div>
            <h3>Réserve ({total(side)})</h3>
            <ul>{rows(side, false)}</ul>
          </div>
        </div>
      )}
      {error && <p className="error">{error}</p>}
      <div className="modal-actions">
        {(main !== start.main || side !== start.sideboard) && !waiting && (
          <button
            type="button"
            className="btn"
            onClick={() => {
              setMain(start.main);
              setSide(start.sideboard);
            }}
          >
            Annuler les changements
          </button>
        )}
        <button type="button" className="btn primary" disabled={!!error || !!waiting} onClick={() => onSubmit(main, side)}>
          {waiting ?? "Manche suivante"}
        </button>
      </div>
    </div>
  );
}
