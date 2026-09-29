/**
 * Affichage générique de toute question posée par le moteur (ChoiceRequest) :
 * choisir des cartes ou des joueurs, un ordre, oui/non, un nombre, une répartition.
 */
import type { ChoiceValue, GameView, ObjectView } from "@mtgx/engine";
import { useEffect, useState } from "react";
import { Card } from "../board/Card";
import { faceName } from "../i18n";
import { useGame } from "../store";
import { boardPick, choiceSource, type PickRequest, pickValid, shortPrompt, togglePick } from "./boardChoice";
import { ZoneTabbed } from "./ZoneTabs";

type ChoiceView = Extract<NonNullable<GameView["pending"]>, { kind: "choice" }>;

function Label({ id, objects, view }: { id: string; objects: ObjectView[]; view: GameView }) {
  const lang = useGame((s) => s.lang);
  // Libellés fournis par le moteur pour les options qui ne sont ni des cartes ni des joueurs.
  const labels = view.pending?.kind === "choice" ? view.pending.request?.labels : undefined;
  if (labels?.[id]) return <>{labels[id]}</>;
  const o = objects.find((x) => x.id === id);
  if (o) return <>{faceName(o, lang)}</>;
  return <>{id === view.viewer ? "Vous" : (view.players[id]?.name ?? id)}</>;
}

function Option({
  id,
  objects,
  view,
  selected,
  onClick,
}: {
  id: string;
  objects: ObjectView[];
  view: GameView;
  selected?: boolean;
  onClick?: () => void;
}) {
  const o = objects.find((x) => x.id === id);
  if (o) return <Card face={o} obj={o} width="var(--pick-w)" glow={selected ? "selected" : null} onClick={onClick} />;
  return (
    <button type="button" className={`btn choice ${selected ? "primary" : ""}`} onClick={onClick}>
      <Label id={id} objects={objects} view={view} />
    </button>
  );
}

const capitalize = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/**
 * Choix parmi des permanents (façon MTGA) : pas de fenêtre ; les options sont en surbrillance sur le plateau et ce
 * panneau rappelle l'effet (carte qui se résout, consigne) et la sélection. Le bouton principal (Espace) valide aussi.
 */
function BoardChoicePanel({ view, req }: { view: GameView; req: PickRequest }) {
  const decide = useGame((s) => s.decide);
  const selection = useGame((s) => s.selection);
  const lang = useGame((s) => s.lang);
  const source = choiceSource(view);
  const valid = pickValid(req, selection);
  return (
    <div className="board-choice" role="dialog" aria-label={req.prompt}>
      {source && (
        <>
          <div className="board-choice-label">
            <strong>{faceName(source.face, lang)}</strong>
          </div>
          <Card face={source.face} width="var(--board-choice-w)" hoverable />
          {source.effect && <div className="board-choice-effect">{source.effect}</div>}
        </>
      )}
      <div className="effect-frame">
        <span className="effect-frame-kind">À vous de choisir</span>
        {capitalize(shortPrompt(req.prompt, source))}
      </div>
      <p className="board-choice-hint">
        Cliquez sur {req.max > 1 ? "les cartes" : "la carte"} en surbrillance — sélection : {selection.length} / {req.max}
      </p>
      <div className="board-choice-actions">
        <button
          type="button"
          className="btn small ghost"
          onClick={() => useGame.setState({ selection: req.suggested.map(String) })}
        >
          Suggestion
        </button>
        <button
          type="button"
          className="btn small primary"
          disabled={!valid}
          onClick={() => decide({ type: "choose", values: selection })}
        >
          {selection.length === 0 && req.min === 0 ? "Aucun" : "Valider"}
        </button>
      </div>
    </div>
  );
}

export function ChoicePrompt({ view }: { view: GameView }) {
  const pick = boardPick(view);
  if (pick) return <BoardChoicePanel view={view} req={pick} />;
  return <ChoiceModal view={view} />;
}

function ChoiceModal({ view }: { view: GameView }) {
  const decide = useGame((s) => s.decide);
  const p = view.pending as ChoiceView;
  const req = p.request;
  const [values, setValues] = useState<ChoiceValue[]>(req?.suggested ?? []);
  const [query, setQuery] = useState("");
  // Nouvelle question : on repart de la suggestion du moteur.
  useEffect(() => {
    setValues(req?.suggested ?? []);
    setQuery("");
  }, [req]);
  if (!req) return null;
  const objects = p.objects ?? [];
  const send = (v: ChoiceValue[]) => decide({ type: "choose", values: v });

  let body: React.ReactNode = null;
  let valid = true;
  switch (req.type) {
    case "pick": {
      const toggle = (id: string) => setValues((cur) => togglePick(req, cur.map(String), id));
      valid = values.length >= req.min && values.length <= req.max;
      // Longues listes (types de créature…) : recherche, et la suggestion en tête.
      const long = req.options.length > 20;
      const norm = (t: string) =>
        t
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "");
      const shown = long
        ? [
            ...req.options.filter((id) => values.includes(id)),
            ...req.options.filter((id) => !values.includes(id) && norm(req.labels?.[id] ?? id).includes(norm(query))),
          ].slice(0, 60)
        : req.options;
      body = (
        <>
          {long && (
            <input
              className="choice-search"
              placeholder="Rechercher…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              // biome-ignore lint/a11y/noAutofocus: la recherche est l'action principale de cette fenêtre
              autoFocus
            />
          )}
          {/* Cartes de plusieurs cimetières (ou de l'exil) : un onglet par zone. */}
          <ZoneTabbed view={view} objects={objects} ids={shown} selected={values.map(String)}>
            {(inTab) => (
              <div className={`hand-picker ${long ? "long" : ""}`}>
                {inTab.map((id) => (
                  <Option
                    key={id}
                    id={id}
                    objects={objects}
                    view={view}
                    selected={values.includes(id)}
                    onClick={() => toggle(id)}
                  />
                ))}
              </div>
            )}
          </ZoneTabbed>
          <p className="hint">
            {req.min === req.max ? `Choisissez ${req.min}` : `Choisissez de ${req.min} à ${req.max}`} — sélection :{" "}
            {values.length}
          </p>
        </>
      );
      break;
    }
    case "order": {
      const move = (i: number, d: number) =>
        setValues((cur) => {
          const next = [...cur];
          const j = i + d;
          if (j < 0 || j >= next.length) return cur;
          [next[i], next[j]] = [next[j] as ChoiceValue, next[i] as ChoiceValue];
          return next;
        });
      body = (
        <div className="hand-picker ordered">
          {values.map((id, i) => (
            <div key={String(id)} className="order-item">
              <span className="order-rank">{i + 1}</span>
              <Option id={String(id)} objects={objects} view={view} />
              <div className="order-moves">
                <button type="button" className="btn small" disabled={i === 0} onClick={() => move(i, -1)}>
                  ←
                </button>
                <button type="button" className="btn small" disabled={i === values.length - 1} onClick={() => move(i, 1)}>
                  →
                </button>
              </div>
            </div>
          ))}
        </div>
      );
      break;
    }
    case "yesNo":
      return (
        <div className="modal-backdrop">
          <div className="modal" role="dialog" aria-label={req.prompt}>
            <h2>{req.prompt}</h2>
            <div className="modal-actions">
              <button type="button" className="btn" onClick={() => send([0])}>
                Non
              </button>
              <button type="button" className="btn primary" onClick={() => send([1])}>
                Oui
              </button>
            </div>
          </div>
        </div>
      );
    case "number": {
      const v = Number(values[0] ?? req.min);
      body = (
        <div className="x-picker">
          <input type="range" min={req.min} max={req.max} value={v} onChange={(e) => setValues([Number(e.target.value)])} />
          <span className="x-value">{v}</span>
        </div>
      );
      break;
    }
    case "divide": {
      const nums = req.among.map((_, i) => Number(values[i] ?? 0));
      const sum = nums.reduce((a, b) => a + b, 0);
      valid = sum === req.total;
      const bump = (i: number, d: number) => setValues(nums.map((n, k) => (k === i ? Math.max(0, n + d) : n)));
      body = (
        <>
          <div className="divide-list">
            {req.among.map((id, i) => (
              <div key={id} className="divide-row">
                <span className="divide-name">
                  <Label id={id} objects={objects} view={view} />
                  {req.lethal?.needs[id] !== undefined && <em> (mortel : {req.lethal.needs[id]})</em>}
                </span>
                <button type="button" className="btn small" onClick={() => bump(i, -1)}>
                  −
                </button>
                <span className="divide-value">{nums[i]}</span>
                <button type="button" className="btn small" disabled={sum >= req.total} onClick={() => bump(i, 1)}>
                  +
                </button>
              </div>
            ))}
          </div>
          <p className="hint">
            Réparti : {sum} / {req.total}
          </p>
        </>
      );
      break;
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="modal wide" role="dialog" aria-label={req.prompt}>
        <h2>{req.prompt}</h2>
        {body}
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={() => setValues(req.suggested)}>
            Suggestion
          </button>
          <button type="button" className="btn primary" disabled={!valid} onClick={() => send(values)}>
            Valider
          </button>
        </div>
      </div>
    </div>
  );
}
