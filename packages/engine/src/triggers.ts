/**
 * Capacités déclenchées (603).
 *
 * - Détection : au moment de l'événement (via les événements de règles émis par state.ts / actions.ts).
 *   Les capacités « quitte le champ de bataille » regardent en arrière (603.10a) : pendant un lot
 *   d'événements simultanés (actions basées sur l'état, un effet), les sources sont celles présentes au début du lot.
 * - Mise sur la pile : juste avant qu'un joueur reçoive la priorité (603.3b), dans l'ordre APNAP ;
 *   chaque joueur ordonne ses déclenchements et choisit leurs cibles (603.3d) via les choix génériques.
 */
import { ask } from "./choices";
import { RulesError } from "./errors";
import { apnapOrder, chars, emit, newId, obj, onBattlefield, opponentsOf, type RulesEvent, snapshot } from "./state";
import { legalTargets, matchesObjectFilter, matchesView } from "./targets";
import type {
  CardDef,
  Condition,
  GameState,
  LkiSnapshot,
  ObjectFilter,
  ObjectId,
  PendingTrigger,
  PlayerId,
  StackItem,
  TriggerEventData,
  TriggeredAbilityDef,
  TriggerSpec,
} from "./types";

interface Source {
  id: ObjectId;
  view: LkiSnapshot;
}

const hasTriggers = (d: CardDef | undefined) => !!d?.abilities.some((a) => a.kind === "triggered");

function liveSources(s: GameState): Source[] {
  const out: Source[] = [];
  for (const id of s.battlefield) {
    if (hasTriggers(s.defs[obj(s, id).defId])) out.push({ id, view: snapshot(s, id) });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Lots d'événements simultanés (regard en arrière)
// ---------------------------------------------------------------------------

let batchBefore: Source[] | null = null;

/** Exécute `fn` comme un ensemble d'événements simultanés (actions basées sur l'état, un effet…). */
export function simultaneously<T>(s: GameState, fn: () => T): T {
  if (batchBefore) return fn();
  batchBefore = liveSources(s);
  try {
    return fn();
  } finally {
    batchBefore = null;
  }
}

// ---------------------------------------------------------------------------
// Conditions
// ---------------------------------------------------------------------------

export function checkCondition(s: GameState, c: Condition, controller: PlayerId, sourceId?: ObjectId): boolean {
  switch (c.kind) {
    case "attackedThisTurn":
      return s.turn.attacked && s.turn.active === controller;
    case "creatureDiedThisTurn":
      return s.turn.creatureDied;
    case "controls": {
      const n = s.battlefield.filter((id) =>
        matchesObjectFilter(s, controller, id, { ...c.filter, controller: "you" }, sourceId),
      ).length;
      return n >= (c.atLeast ?? 1);
    }
    case "lifeAtLeast":
      return (s.players[controller]?.life ?? 0) >= c.amount;
    case "kicked":
      return false; // évalué à l'arrivée (replacement.ts) ou à la résolution
  }
}

// ---------------------------------------------------------------------------
// Détection
// ---------------------------------------------------------------------------

function matchWho(who: "self" | ObjectFilter, v: LkiSnapshot, src: Source): boolean {
  return who === "self" ? v.id === src.id : matchesView(v, who, src.view.controller, src.id);
}

function whose(rel: "you" | "opponent" | "any", player: PlayerId, controller: PlayerId): boolean {
  return rel === "any" || (rel === "you" ? player === controller : player !== controller);
}

function liveView(s: GameState, id: ObjectId | null): LkiSnapshot | null {
  return id && s.objects[id] ? snapshot(s, id) : null;
}

/** L'événement correspond-il au déclencheur ? Renvoie les données de l'événement, ou null. */
function matchTrigger(s: GameState, ev: RulesEvent, t: TriggerSpec, src: Source): TriggerEventData | null {
  const me = src.view.controller;
  switch (t.on) {
    case "enters": {
      if (ev.e !== "zone" || ev.to !== "battlefield") return null;
      const v = liveView(s, ev.newId);
      return v && matchWho(t.who, v, src) ? { objectId: v.id, player: v.controller } : null;
    }
    case "dies": {
      if (ev.e !== "zone" || ev.from !== "battlefield" || ev.to !== "graveyard" || !ev.lki) return null;
      if (!ev.lki.types.includes("Creature")) return null;
      return matchWho(t.who, ev.lki, src)
        ? { objectId: ev.lki.id, newObjectId: ev.newId ?? undefined, player: ev.lki.controller }
        : null;
    }
    case "leaves": {
      if (ev.e !== "zone" || ev.from !== "battlefield" || !ev.lki) return null;
      return ev.lki.id === src.id ? { objectId: ev.lki.id, newObjectId: ev.newId ?? undefined } : null;
    }
    case "attacks": {
      if (ev.e !== "attack") return null;
      const v = liveView(s, ev.attacker);
      return v && matchWho(t.who, v, src) ? { objectId: ev.attacker, player: ev.defender } : null;
    }
    case "dealsCombatDamage": {
      if (ev.e !== "damage" || !ev.combat || !ev.sourceId) return null;
      const toPlayer = !!s.players[ev.target];
      if (t.toPlayer && !toPlayer) return null;
      const v = liveView(s, ev.sourceId) ?? s.lki[ev.sourceId] ?? null;
      if (!v || !matchWho(t.who, v, src)) return null;
      return { objectId: ev.sourceId, player: toPlayer ? ev.target : undefined, amount: ev.amount };
    }
    case "castSpell": {
      if (ev.e !== "cast" || !whose(t.by, ev.player, me)) return null;
      const v = liveView(s, ev.stackId);
      if (t.filter && (!v || !matchesView(v, t.filter, me, src.id))) return null;
      return { objectId: ev.stackId, player: ev.player };
    }
    case "step":
      return ev.e === "step" && ev.step === t.step && whose(t.whose, ev.active, me) ? { player: ev.active } : null;
    case "landfall": {
      if (ev.e !== "zone" || ev.to !== "battlefield") return null;
      const v = liveView(s, ev.newId);
      return v?.types.includes("Land") && v.controller === me ? { objectId: v.id, player: me } : null;
    }
    case "gainLife":
      return ev.e === "lifeGain" && ev.player === me ? { player: me, amount: ev.amount } : null;
  }
}

export function detectTriggers(s: GameState, ev: RulesEvent): void {
  if (s.over) return;
  const leaving = ev.e === "zone" && ev.from === "battlefield";
  let sources: Source[];
  if (leaving) {
    sources = batchBefore ?? liveSources(s);
    // L'objet qui part peut se déclencher lui-même (« quand cette créature meurt »).
    if (ev.lki && hasTriggers(s.defs[ev.lki.defId]) && !sources.some((x) => x.id === ev.lki?.id)) {
      sources = [...sources, { id: ev.lki.id, view: ev.lki }];
    }
  } else {
    sources = liveSources(s);
  }
  for (const src of sources) {
    const d = s.defs[src.view.defId];
    d?.abilities.forEach((ab, index) => {
      if (ab.kind !== "triggered") return;
      const data = matchTrigger(s, ev, ab.trigger, src);
      if (!data) return;
      if (ab.condition && !checkCondition(s, ab.condition, src.view.controller, src.id)) return;
      s.triggers.push({
        id: newId(s, "t"),
        sourceId: src.id,
        sourceDefId: src.view.defId,
        abilityIndex: index,
        controller: src.view.controller,
        sourceSnapshot: { keywords: src.view.keywords, power: src.view.power, controller: src.view.controller },
        event: data,
        targets: {},
      });
    });
  }
}

// ---------------------------------------------------------------------------
// Mise sur la pile
// ---------------------------------------------------------------------------

export function triggeredAbility(s: GameState, t: { sourceDefId: string; abilityIndex: number }): TriggeredAbilityDef | null {
  const ab = s.defs[t.sourceDefId]?.abilities[t.abilityIndex];
  return ab?.kind === "triggered" ? ab : null;
}

function triggerLabel(s: GameState, t: PendingTrigger): string {
  const ab = triggeredAbility(s, t);
  return `${s.defs[t.sourceDefId]?.name ?? "?"}${ab?.label ? ` — ${ab.label}` : ""}`;
}

/**
 * Met les capacités déclenchées en attente sur la pile, en posant les questions nécessaires.
 * Renvoie true si quelque chose a changé (capacité mise sur la pile ou question posée).
 */
export function processTriggers(s: GameState): boolean {
  if (s.triggers.length === 0) return false;
  let changed = false;
  // 603.3b : APNAP — le joueur actif met les siennes en premier (elles se résoudront en dernier).
  for (const p of apnapOrder(s)) {
    const mine = s.triggers.filter((t) => t.controller === p);
    if (mine.length === 0) continue;
    if (mine.length > 1 && !mine.every((t) => t.ordered)) {
      ask(
        s,
        p,
        {
          type: "order",
          intent: "triggerOrder",
          prompt: "Ordre de résolution de vos capacités déclenchées (la première se résout en premier)",
          items: mine.map((t) => t.id),
          labels: Object.fromEntries(mine.map((t) => [t.id, triggerLabel(s, t)])),
          suggested: mine.map((t) => t.id),
          autoOk: true,
        },
        { kind: "triggerOrder", player: p },
      );
      return true;
    }
    // Dans l'ordre de résolution voulu, la dernière va sur la pile en premier.
    for (const t of [...mine].reverse()) {
      if (!chooseTriggerTargets(s, t)) return true; // question posée
      s.triggers = s.triggers.filter((x) => x.id !== t.id);
      const ab = triggeredAbility(s, t);
      if (!ab) continue;
      // 603.3d : une capacité sans cible légale pour une cible requise est retirée.
      if (ab.targets.some((spec) => !spec.optional && (t.targets[spec.id]?.length ?? 0) === 0)) continue;
      const item: StackItem = {
        id: newId(s, "a"),
        kind: "ability",
        controller: t.controller,
        sourceId: t.sourceId,
        sourceDefId: t.sourceDefId,
        abilityIndex: t.abilityIndex,
        mode: 0,
        targets: t.targets,
        x: 0,
        kicked: false,
        sourceSnapshot: t.sourceSnapshot,
        event: t.event,
      };
      s.stack.push(item);
      s.priority.passes = 0;
      changed = true;
      emit({
        type: "trigger",
        player: t.controller,
        stackId: item.id,
        defId: t.sourceDefId,
        targets: Object.values(t.targets).flat(),
      });
    }
  }
  return changed;
}

/** Choisit les cibles d'un déclenchement ; renvoie false si une question a été posée. */
function chooseTriggerTargets(s: GameState, t: PendingTrigger): boolean {
  const ab = triggeredAbility(s, t);
  if (!ab) return true;
  for (const spec of ab.targets) {
    if (t.targets[spec.id] !== undefined) continue;
    const legal = legalTargets(s, t.controller, spec);
    if (legal.length === 0) {
      t.targets[spec.id] = [];
      continue;
    }
    if (legal.length === 1 && !spec.optional) {
      t.targets[spec.id] = legal;
      continue;
    }
    ask(
      s,
      t.controller,
      {
        type: "pick",
        intent: "triggerTarget",
        prompt: `${triggerLabel(s, t)} : choisissez ${spec.label ?? "une cible"}`,
        options: legal,
        min: spec.optional ? 0 : 1,
        max: 1,
        suggested: [suggestTarget(s, t.controller, legal)],
      },
      { kind: "triggerTarget", trigger: t.id, spec: spec.id },
    );
    return false;
  }
  return true;
}

/** Cible proposée par défaut : la meilleure créature adverse, sinon un adversaire, sinon la première option. */
function suggestTarget(s: GameState, controller: PlayerId, legal: string[]): string {
  const opps = new Set(opponentsOf(s, controller));
  const theirs = legal
    .filter((id) => onBattlefield(s, id) && opps.has(obj(s, id).controller))
    .sort((a, b) => chars(s, b).power - chars(s, a).power);
  return theirs[0] ?? legal.find((id) => opps.has(id)) ?? (legal[0] as string);
}

export function answerTriggerOrder(s: GameState, player: PlayerId, order: string[]): void {
  const mine = new Map(s.triggers.filter((t) => t.controller === player).map((t) => [t.id, t]));
  const others = s.triggers.filter((t) => t.controller !== player);
  const ordered = order.map((id) => mine.get(id)).filter((t): t is PendingTrigger => !!t);
  for (const t of ordered) t.ordered = true;
  s.triggers = [...others, ...ordered];
}

export function answerTriggerTarget(s: GameState, triggerId: string, specId: string, values: string[]): void {
  const t = s.triggers.find((x) => x.id === triggerId);
  if (!t) throw new RulesError("Capacité déclenchée introuvable");
  t.targets[specId] = values;
}
