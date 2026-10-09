/**
 * Scry and surveil in one window (PLAN-L L6): the cards are dragged (or moved with the buttons) between the top of the
 * library and the bottom (scry) or the graveyard (surveil), and ordered in each zone. The engine asks two questions
 * (which cards go away, then the order of those that stay on top): the first one is answered on confirmation, the
 * second automatically with the order arranged here (`arrangedTopOrder`).
 */
import type { ChoiceValue, GameView, ObjectView } from "@mtgx/engine";
import { useState } from "react";
import { Card } from "../board/Card";
import { Dialog } from "../Dialog";
import { useT } from "../localize";
import type { PickRequest } from "./boardChoice";

/** Order of the cards left on top, waiting for the engine's "order" question about the same cards. */
let topOrder: string[] | null = null;

/** The order arranged for these cards, if any (read during the render; `clearTopOrder` once sent). */
export function arrangedTopOrder(items: readonly ChoiceValue[]): string[] | null {
  const order = topOrder;
  if (!order || order.length !== items.length || !items.every((x) => order.includes(String(x)))) return null;
  return order;
}

export function clearTopOrder(): void {
  topOrder = null;
}

export const isScryOrSurveil = (req: PickRequest) => req.intent === "scryBottom" || req.intent === "surveilGraveyard";

type Zone = "top" | "away";

export function ScryArrange({
  req,
  objects,
  onConfirm,
}: {
  req: PickRequest;
  view: GameView;
  objects: ObjectView[];
  onConfirm: (values: ChoiceValue[]) => void;
}) {
  const t = useT();
  const surveil = req.intent === "surveilGraveyard";
  const ids = req.options.map(String);
  const [zones, setZones] = useState<Record<Zone, string[]>>({ top: ids, away: [] });
  const [dragged, setDragged] = useState<string | null>(null);
  const face = (id: string) => objects.find((o) => o.id === id);
  /** Moves `id` into `zone` before `before` (at the end without it). */
  const move = (id: string, zone: Zone, before?: string) =>
    setZones((cur) => {
      const next: Record<Zone, string[]> = { top: cur.top.filter((x) => x !== id), away: cur.away.filter((x) => x !== id) };
      const at = before ? next[zone].indexOf(before) : -1;
      next[zone] = at < 0 ? [...next[zone], id] : [...next[zone].slice(0, at), id, ...next[zone].slice(at)];
      return next;
    });
  const shift = (zone: Zone, i: number, d: number) =>
    setZones((cur) => {
      const list = [...cur[zone]];
      const j = i + d;
      if (j < 0 || j >= list.length) return cur;
      [list[i], list[j]] = [list[j] as string, list[i] as string];
      return { ...cur, [zone]: list };
    });
  const valid = zones.away.length >= req.min && zones.away.length <= req.max;
  const confirm = () => {
    topOrder = zones.top.length > 1 ? [...zones.top] : null;
    onConfirm(zones.away);
  };
  const titles: Record<Zone, string> = {
    top: t("Top of the library (first: on top)"),
    away: surveil ? t("Graveyard") : t("Bottom of the library"),
  };
  const other = (zone: Zone): Zone => (zone === "top" ? "away" : "top");
  return (
    <Dialog title={req.prompt} className="wide scry-arrange" testId="scry-arrange">
      <p className="hint">{t("Drag the cards between the zones, or use the buttons.")}</p>
      {(["top", "away"] as const).map((zone) => (
        // biome-ignore lint/a11y/noStaticElementInteractions: drop zone of a drag and drop; each card's buttons do the same from the keyboard
        <div
          key={zone}
          className={`scry-zone ${zone}`}
          data-zone={zone}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (dragged) move(dragged, zone);
            setDragged(null);
          }}
        >
          <div className="scry-zone-title">
            {titles[zone]} <span>{zones[zone].length}</span>
          </div>
          <div className="scry-cards">
            {zones[zone].map((id, i) => {
              const o = face(id);
              return (
                // biome-ignore lint/a11y/noStaticElementInteractions: dragged card; its buttons do the same from the keyboard
                <div
                  key={id}
                  className="scry-card"
                  draggable
                  data-oid={id}
                  onDragStart={() => setDragged(id)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (dragged && dragged !== id) move(dragged, zone, id);
                    setDragged(null);
                  }}
                >
                  <span className="order-rank">{i + 1}</span>
                  {o && <Card face={o} obj={o} width="var(--pick-w)" />}
                  <div className="order-moves">
                    <button
                      type="button"
                      className="btn small"
                      aria-label={t("Earlier")}
                      disabled={i === 0}
                      onClick={() => shift(zone, i, -1)}
                    >
                      ←
                    </button>
                    <button
                      type="button"
                      className="btn small"
                      aria-label={zone === "top" ? titles.away : titles.top}
                      onClick={() => move(id, other(zone))}
                    >
                      {zone === "top" ? "↓" : "↑"}
                    </button>
                    <button
                      type="button"
                      className="btn small"
                      aria-label={t("Later")}
                      disabled={i === zones[zone].length - 1}
                      onClick={() => shift(zone, i, 1)}
                    >
                      →
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
      <div className="modal-actions">
        <button type="button" className="btn ghost" onClick={() => setZones({ top: ids, away: [] })}>
          {t("Reset")}
        </button>
        <button type="button" className="btn primary" disabled={!valid} onClick={confirm}>
          {t("Confirm")}
        </button>
      </div>
    </Dialog>
  );
}
