/**
 * Choix « parmi des permanents » (cibles d'une capacité déclenchée, ex. « mettez un marqueur +1/+1 sur jusqu'à deux
 * créatures ciblées », ou choix pendant une résolution) : façon MTGA, il se fait directement sur le champ de bataille (options en surbrillance, clic pour
 * sélectionner) plutôt que dans une fenêtre qui mêle vos permanents et ceux de l'adversaire.
 */
import type { CardFace, ChoiceRequest, GameView } from "@mtgx/engine";

export type PickRequest = Extract<ChoiceRequest, { type: "pick" }>;

/** La demande en cours, si elle est à vous et se choisit sur le plateau (permanents et joueurs seulement). */
export function boardPick(view: GameView | null | undefined): PickRequest | null {
  const p = view?.pending;
  if (!view || p?.kind !== "choice" || p.player !== view.viewer) return null;
  const req = p.request;
  if (req?.type !== "pick" || req.options.length === 0) return null;
  const onBoard = new Set(view.battlefield.map((o) => o.id));
  // Au moins un permanent : un choix entre joueurs seuls reste dans la fenêtre (boutons nommés).
  if (!req.options.some((id) => onBoard.has(id))) return null;
  const ok = req.options.every((id) => !req.labels?.[id] && (onBoard.has(id) || !!view.players[id]));
  return ok ? req : null;
}

/** Sélection après un clic sur `id` (retire, remplace ou ajoute selon le maximum et la contrainte de groupe). */
export function togglePick(req: PickRequest, cur: string[], id: string): string[] {
  if (cur.includes(id)) return cur.filter((x) => x !== id);
  if (req.max === 1) return [id];
  const g = req.group;
  // « d'un même joueur » : changer de joueur recommence la sélection ; « de joueurs différents » : remplace l'option du même joueur.
  if (g?.kind === "same" && cur.some((x) => g.holders[x] !== g.holders[id])) return [id];
  const kept = g?.kind === "different" ? cur.filter((x) => g.holders[x] !== g.holders[id]) : cur;
  return kept.length >= req.max ? kept : [...kept, id];
}

/** La sélection respecte le minimum et le maximum de la demande. */
export function pickValid(req: PickRequest, cur: string[]): boolean {
  return cur.length >= req.min && cur.length <= req.max;
}

/**
 * Consigne sans le rappel de sa source (« Felidar Savior — marqueurs +1/+1 : choisissez… » → « choisissez… ») :
 * la carte et sa capacité sont déjà montrées à côté.
 */
export function shortPrompt(prompt: string, source: { face: CardFace; effect?: string } | null): string {
  if (!source) return prompt;
  const prefixes = [source.effect && `${source.face.name} — ${source.effect} : `, `${source.face.name} : `];
  const p = prefixes.find((x) => x && prompt.startsWith(x));
  return p ? prompt.slice(p.length) : prompt;
}

/**
 * L'effet qui pose la question : l'objet au sommet de la pile pendant sa résolution (608.2), ou le déclenchement
 * dont on choisit les cibles (pas encore sur la pile).
 */
export function choiceSource(view: GameView): { face: CardFace; effect?: string } | null {
  const p = view.pending;
  if (p?.kind !== "choice") return null;
  if (p.source) return p.source;
  if (p.purpose?.kind !== "effect") return null;
  const top = view.stack[view.stack.length - 1];
  return top ? { face: top, effect: top.effect } : null;
}
