/**
 * Choix faits pour un élément déjà mis sur la pile, avant que quiconque reçoive la priorité (`announceNext`, appelé par
 * `advance`) :
 * - nouvelles cibles d'une copie de sort ou de capacité (707.10c). Toutes les cartes gérées qui copient disent « vous
 *   pouvez choisir de nouvelles cibles » ; les cibles d'origine sont proposées. Changée ou non, chaque cible devient
 *   la cible de la copie (garde, vaillance ; pas l'héroïsme : une copie n'est pas lancée) ;
 * - répartition de blessures ou de marqueurs entre les cibles (601.2d, 602.2b, 603.3d), gardée dans
 *   `StackItem.division` : à la résolution, la part d'une cible devenue illégale est perdue (608.2b).
 *
 * Une copie faite pendant un lancement (Pyromancer's Goggles) ou pendant une résolution (Thousand-Year Storm) passe
 * par le même chemin : ses cibles sont choisies dès que la priorité devrait être donnée.
 */
import { ask } from "./choices";
import { type EffectContext, evalAmount } from "./effects";
import { RulesError } from "./errors";
import { specsAndEffects, stackItemSpecs } from "./stack";
import { createObject, emit, newId, rulesEvent } from "./state";
import { legalTargets } from "./targets";
import type { ChoiceRequest, ChoiceValue, Effect, GameState, PendingStackChoice, PlayerId, StackItem } from "./types";

type Divided = Extract<Effect, { op: "damageDivided" | "countersDivided" }>;

/** Effet « répartissez … entre les cibles » d'un élément (au premier niveau de ses effets) et son mot « cible ». */
export function dividedEffect(s: GameState, item: StackItem): { effect: Divided; spec: string } | undefined {
  for (const e of specsAndEffects(s, item).effects) {
    if ((e.op === "damageDivided" || e.op === "countersDivided") && e.to.kind === "target") return { effect: e, spec: e.to.id };
  }
  return undefined;
}

/**
 * La répartition d'un élément mis sur la pile (sort lancé, capacité activée ou déclenchée) est à annoncer s'il a au
 * moins deux cibles (une seule reçoit tout). Idempotent : appelé pour chaque élément par `announceNext`.
 */
function queueDivision(s: GameState, item: StackItem): void {
  if (item.division || item.pendingChoices?.some((c) => c.step === "divide")) return;
  const d = dividedEffect(s, item);
  if (!d || (item.targets[d.spec]?.length ?? 0) < 2) return;
  item.pendingChoices = [...(item.pendingChoices ?? []), { step: "divide" }];
}

/**
 * Copie d'un sort ou d'une capacité sur la pile (707.10) : mêmes choix (mode, X, kicker, répartition) et mêmes cibles,
 * que son contrôleur pourra changer. Une copie de sort est un objet sur la pile (N11) : on peut la cibler, et ce qui
 * dépend de la source du sort (défense talismanique contre les éphémères…) la voit. Renvoie l'identifiant de la copie.
 */
export function copyStackItem(s: GameState, item: StackItem, controller: PlayerId): string {
  // « Ce sort ne peut pas être copié » (Choreographed Sparks).
  if (item.kind === "spell" && s.defs[item.sourceDefId]?.cantBeCopied) return "";
  let id: string;
  if (item.kind === "spell") {
    const src = s.objects[item.sourceId];
    // 707.10 : la copie appartient au joueur qui la met sur la pile.
    const o = createObject(s, src?.defId ?? item.sourceDefId, controller, "stack");
    o.cardCopy = true;
    if (src?.faceDefId) o.faceDefId = src.faceDefId;
    if (src?.faceDown) o.faceDown = { ...src.faceDown };
    id = o.id;
  } else id = newId(s, "copy");
  const retarget: PendingStackChoice[] = specsAndEffects(s, item)
    .specs.filter((spec) => (item.targets[spec.id]?.length ?? 0) > 0)
    .map((spec) => ({ step: "target", spec: spec.id }));
  const pending: PendingStackChoice[] = [
    ...retarget,
    ...(retarget.length ? [{ step: "announce" } as const] : []),
    // La répartition de l'original n'est pas encore annoncée (copie faite pendant le lancement).
    ...(item.pendingChoices?.some((c) => c.step === "divide") ? [{ step: "divide" } as const] : []),
  ];
  const copy: StackItem = {
    ...item,
    id,
    sourceId: item.kind === "spell" ? id : item.sourceId,
    controller,
    copy: true,
    riders: undefined,
    // Les modifications d'arrivée accordées au sort (marqueurs, célérité) ne sont pas copiables (707.2).
    arrival: undefined,
    manaSources: undefined,
    cast: item.cast ? { ...item.cast, spentFrom: undefined } : undefined,
    targets: { ...item.targets },
    pendingChoices: pending.length ? pending : undefined,
  };
  s.stack.push(copy);
  emit({ type: "copy", stackId: id, defId: item.sourceDefId, player: controller });
  if (item.kind === "spell") rulesEvent(s, { e: "copySpell", player: controller, stackId: id });
  return id;
}

/**
 * Pose la prochaine question en attente d'un élément de pile, ou règle d'office celles qui n'ont pas de choix.
 * Renvoie true si une question a été posée.
 */
export function announceNext(s: GameState): boolean {
  for (const item of s.stack) {
    queueDivision(s, item);
    while (item.pendingChoices?.length) {
      const c = item.pendingChoices[0] as PendingStackChoice;
      const request = requestFor(s, item, c);
      if (request) {
        ask(s, item.controller, request, { kind: "stackChoice", stackId: item.id });
        return true;
      }
      item.pendingChoices.shift();
    }
    if (item.pendingChoices) item.pendingChoices = undefined;
  }
  return false;
}

/** Réponse à la question posée par `announceNext` pour l'élément `stackId`. */
export function answerStackChoice(s: GameState, stackId: string, request: ChoiceRequest, values: ChoiceValue[]): void {
  const item = s.stack.find((x) => x.id === stackId);
  const c = item?.pendingChoices?.[0];
  if (!item || !c) throw new RulesError("Aucun choix en attente pour cet élément de la pile");
  if (c.step === "target" && request.type === "pick") applyRetarget(s, item, c.spec, request, values);
  else if (c.step === "divide" && request.type === "divide") {
    const d = dividedEffect(s, item);
    if (!d) throw new RulesError("Rien à répartir");
    item.division = { ...item.division, [d.spec]: values.map(Number) };
  } else throw new RulesError("Réponse inattendue");
  item.pendingChoices = item.pendingChoices?.slice(1);
}

/**
 * Nouvelles cibles choisies pour un mot « cible » d'un élément de la pile (réponse à `retargetRequest`). Une cible gardée
 * reste à sa place (la répartition suit l'ordre des cibles) ; les nouvelles prennent les places libérées. Rejouer la même
 * réponse ne change rien.
 */
export function applyRetarget(
  s: GameState,
  item: StackItem,
  specId: string,
  request: ChoiceRequest,
  values: ChoiceValue[],
): void {
  const orig = item.targets[specId] ?? [];
  const chosen = values.map(String);
  const fresh = chosen.filter((id) => !orig.includes(id));
  const next = orig.map((id) => (chosen.includes(id) || !exists(s, id) ? id : (fresh.shift() ?? id)));
  const g = request.type === "pick" ? request.group : undefined;
  if (g) {
    const holders = next.map((id) => g.holders[id] ?? id);
    if (g.kind === "same" && new Set(holders).size > 1) throw new RulesError("Les cibles doivent appartenir au même joueur");
    if (g.kind === "different" && new Set(holders).size !== holders.length)
      throw new RulesError("Les cibles doivent être contrôlées par des joueurs différents");
  }
  item.targets = { ...item.targets, [specId]: next };
}

/** Question à poser pour ce choix, ou null s'il se règle d'office. */
function requestFor(s: GameState, item: StackItem, c: PendingStackChoice): ChoiceRequest | null {
  const name = s.defs[item.sourceDefId]?.name ?? "";
  if (c.step === "announce") {
    // Changées ou non, les cibles deviennent celles de la copie. Une copie n'est pas lancée : pas de crime (700.13).
    const all = Object.values(item.targets).flat();
    if (all.length) rulesEvent(s, { e: "targeted", stackId: item.id, controller: item.controller, targets: all });
    return null;
  }
  if (c.step === "target") return retargetRequest(s, item, c.spec, `${name} (copie)`);
  const d = dividedEffect(s, item);
  const among = d ? (item.targets[d.spec] ?? []) : [];
  if (!d || among.length < 2) return null;
  const total = evalAmount(s, contextOfItem(item), d.effect.total);
  if (total <= 0) return null;
  const each = Math.floor(total / among.length);
  const damage = d.effect.op === "damageDivided";
  return {
    type: "divide",
    intent: damage ? "divideDamage" : "divideCounters",
    prompt: `${name} : répartissez ${total} ${damage ? "blessures" : "marqueurs +1/+1"} entre les cibles`,
    among,
    total,
    minEach: total >= among.length ? 1 : 0,
    suggested: among.map((_, i) => each + (i < total - each * among.length ? 1 : 0)),
  };
}

/**
 * Nouvelles cibles d'un élément de la pile pour un mot « cible » (copie, 707.10c ; « vous pouvez choisir de nouvelles
 * cibles », Commandeer) : autant qu'à l'origine, celles d'origine proposées. Légales pour le contrôleur de l'élément.
 */
export function retargetRequest(s: GameState, item: StackItem, specId: string, name: string): ChoiceRequest | null {
  const spec = stackItemSpecs(s, item).find((x) => x.id === specId);
  const orig = item.targets[specId] ?? [];
  if (!spec || orig.length === 0) return null;
  // « une autre cible » : ce qui est ciblé par l'autre mot n'est pas proposé.
  const taken = new Set((spec.otherThan ?? []).flatMap((o) => item.targets[o] ?? []));
  const legalSpec = item.kicked && spec.kickedFilter ? { ...spec, filter: spec.kickedFilter } : spec;
  const legal = legalTargets(s, item.controller, legalSpec, item.sourceId).filter((id) => id !== item.id && !taken.has(id));
  // Une cible d'origine qui n'existe plus reste telle quelle (la copie ne la retrouvera pas à la résolution).
  const kept = orig.filter((id) => exists(s, id) && !taken.has(id));
  const count = orig.filter((id) => exists(s, id)).length;
  const options = [...new Set([...kept, ...legal])];
  if (count === 0 || options.length <= kept.length) return null;
  const suggested = [...kept, ...legal.filter((id) => !kept.includes(id))].slice(0, count);
  if (suggested.length < count) return null;
  const group =
    spec.samePlayer || spec.differentPlayers
      ? {
          kind: spec.samePlayer ? ("same" as const) : ("different" as const),
          holders: Object.fromEntries(
            options.map((id) => {
              const o = s.objects[id];
              return [id, o ? (o.zone === "battlefield" ? o.controller : o.owner) : id];
            }),
          ),
        }
      : undefined;
  return {
    type: "pick",
    intent: "changeTarget",
    prompt: `${name} : choisissez ${count > 1 ? `${count} cibles` : "la cible"}${spec.label ? ` — ${spec.label}` : ""} (celle${count > 1 ? "s" : ""} d'origine proposée${count > 1 ? "s" : ""})`,
    options,
    min: count,
    max: count,
    suggested,
    ...(group ? { group } : {}),
  };
}

/** Joueur, objet ou élément de pile encore présent. */
function exists(s: GameState, id: string): boolean {
  return !!s.players[id] || !!s.objects[id] || s.stack.some((x) => x.id === id);
}

/** Contexte d'effet d'un élément de pile, hors résolution (montant à répartir). */
function contextOfItem(item: StackItem): EffectContext {
  return {
    controller: item.controller,
    sourceId: item.sourceId,
    sourceDefId: item.sourceDefId,
    sourceSnapshot: item.sourceSnapshot,
    targets: item.targets,
    x: item.x,
    kicked: item.kicked,
    event: item.event,
    vars: {},
    paid: item.paid,
  };
}
