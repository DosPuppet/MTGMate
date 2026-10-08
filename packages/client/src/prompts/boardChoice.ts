/**
 * Choice "among permanents" (targets of a triggered ability, e.g. "put a +1/+1 counter on up to two target
 * creatures", or a choice during a resolution): MTGA-style, it is made directly on the battlefield (options highlighted, click to
 * select) rather than in a window that mixes your permanents and the opponent's.
 */
import type { CardFace, ChoiceRequest, GameView } from "@mtgx/engine";

export type PickRequest = Extract<ChoiceRequest, { type: "pick" }>;

/** The pending request, if it is yours and is chosen on the board (permanents and players only). */
export function boardPick(view: GameView | null | undefined): PickRequest | null {
  const p = view?.pending;
  if (!view || p?.kind !== "choice" || p.player !== view.viewer) return null;
  const req = p.request;
  if (req?.type !== "pick" || req.options.length === 0) return null;
  const onBoard = new Set(view.battlefield.map((o) => o.id));
  // At least one permanent: a choice between players only stays in the window (named buttons).
  if (!req.options.some((id) => onBoard.has(id))) return null;
  const ok = req.options.every((id) => !req.labels?.[id] && (onBoard.has(id) || !!view.players[id]));
  return ok ? req : null;
}

/** Selection after a click on `id` (removes, replaces or adds depending on the maximum and the group constraint). */
export function togglePick(req: PickRequest, cur: string[], id: string): string[] {
  if (cur.includes(id)) return cur.filter((x) => x !== id);
  if (req.max === 1) return [id];
  const g = req.group;
  // "of the same player": changing player restarts the selection; "of different players": replaces the option of the same player.
  if (g?.kind === "same" && cur.some((x) => g.holders[x] !== g.holders[id])) return [id];
  const kept = g?.kind === "different" ? cur.filter((x) => g.holders[x] !== g.holders[id]) : cur;
  return kept.length >= req.max ? kept : [...kept, id];
}

/** The selection respects the request's minimum and maximum. */
export function pickValid(req: PickRequest, cur: string[]): boolean {
  return cur.length >= req.min && cur.length <= req.max;
}

/**
 * Prompt without the reminder of its source ("Felidar Savior — +1/+1 counters: choose…" → "choose…"): the card and
 * its ability are already shown next to it. The separator is ": " in English and " : " in French.
 */
export function shortPrompt(prompt: string, source: { face: CardFace; effect?: string } | null): string {
  if (!source) return prompt;
  const heads = [source.effect && `${source.face.name} — ${source.effect}`, source.face.name];
  const prefixes = heads.flatMap((h) => (h ? [`${h} : `, `${h}: `] : []));
  const p = prefixes.find((x) => x && prompt.startsWith(x));
  return p ? prompt.slice(p.length) : prompt;
}

/**
 * The effect asking the question: the object on top of the stack during its resolution (608.2), or the trigger whose
 * targets are being chosen (not on the stack yet).
 */
export function choiceSource(view: GameView): { face: CardFace; effect?: string } | null {
  const p = view.pending;
  if (p?.kind !== "choice") return null;
  if (p.source) return p.source;
  // 903.9a and 903.9b: the commander card that may be returned to the command zone (graveyard, exile, hand; in the
  // library, only its name, in the question).
  if (p.purpose?.kind === "commanderZone") {
    const card = p.purpose.card;
    const o =
      view.hand.find((x) => x.id === card) ??
      view.exile.find((x) => x.id === card) ??
      Object.values(view.players)
        .flatMap((pl) => pl.graveyard)
        .find((x) => x.id === card);
    return o ? { face: o } : null;
  }
  if (p.purpose?.kind !== "effect") return null;
  const top = view.stack[view.stack.length - 1];
  return top ? { face: top, effect: top.effect } : null;
}
