/**
 * Sideboard between two games of a BO3: copies are moved between the deck and the sideboard. The new deck must contain
 * the same cards as at the start of the match (deck and sideboard together) and stay legal (`sideboardSwapError`).
 */
import { CARDS, type DeckEntries, type DeckEntry, sideboardSwapError } from "@mtgx/cards";
import { useState } from "react";
import { useT } from "../localize";
import { useGame } from "../store";
import { textIn } from "../translate";

const total = (d: DeckEntries) => d.reduce((n, [k]) => n + k, 0);

/** Removes one copy of `name` from `from` and adds it to `to`. */
function moveOne(from: DeckEntries, to: DeckEntries, name: string): [DeckEntries, DeckEntries] {
  // The chosen printing follows the card from one list to the other.
  const printing = from.find(([, x]) => x === name)?.[2];
  const nextFrom = from.map(([n, x, p]): DeckEntry => [x === name ? n - 1 : n, x, p]).filter(([n]) => n > 0);
  const has = to.some(([, x]) => x === name);
  const nextTo = has
    ? to.map(([n, x, p]): DeckEntry => [x === name ? n + 1 : n, x, p])
    : [...to, (printing ? [1, name, printing] : [1, name]) as DeckEntry];
  return [nextFrom, nextTo];
}

export function SideboardEditor({
  start,
  original,
  waiting,
  onSubmit,
}: {
  /** Deck and sideboard of the game that just ended (starting point). */
  start: { main: DeckEntries; sideboard: DeckEntries };
  /** Deck and sideboard at the start of the match (the same cards in total). */
  original: { main: DeckEntries; sideboard: DeckEntries };
  /** Sideboard already sent: waiting for the opponent. */
  waiting?: string;
  onSubmit: (main: DeckEntries, sideboard: DeckEntries) => void;
}) {
  const lang = useGame((s) => s.lang);
  const t = useT();
  // Format of the match (against the AI, or of the online room): the deck must stay legal in it.
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
              title={t("Put a copy in the deck")}
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
              title={t("Put a copy in the sideboard")}
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
        <p className="hint">{t("This deck has no sideboard: it is played again as is.")}</p>
      )}
      {original.sideboard.length > 0 && (
        <div className="sb-columns">
          <div>
            <h3>{t("Deck ({n})", { n: total(main) })}</h3>
            <ul>{rows(main, true)}</ul>
          </div>
          <div>
            <h3>{t("Sideboard ({n})", { n: total(side) })}</h3>
            <ul>{rows(side, false)}</ul>
          </div>
        </div>
      )}
      {error && <p className="error">{textIn(lang, error)}</p>}
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
            {t("Undo the changes")}
          </button>
        )}
        <button type="button" className="btn primary" disabled={!!error || !!waiting} onClick={() => onSubmit(main, side)}>
          {waiting ?? t("Next game")}
        </button>
      </div>
    </div>
  );
}
