/**
 * Adversaire scripté (tutoriel) : il joue les actions prévues, désignées par le nom des cartes,
 * puis se contente du minimum (passer, ne pas attaquer, blocages obligatoires, choix suggéré).
 * Le script est une donnée sérialisable, envoyée telle quelle au worker de partie.
 */
import {
  type ActionOption,
  type Agent,
  attackCandidates,
  type Decision,
  fallbackDecision,
  type GameState,
  legalActions,
  opponentsOf,
  type PlayerId,
  type Step,
  type TargetOption,
} from "@mtgx/engine";

/**
 * Cibles : "you" = l'adversaire du joueur scripté (le joueur humain), "self" = le joueur scripté,
 * sinon le nom d'un permanent ou d'un sort sur la pile (le premier qui est une cible légale).
 */
export type ScriptTarget = string;

export type ScriptAction =
  | { turn: number; do: "playLand"; card: string }
  | {
      turn: number;
      do: "cast";
      card: string;
      targets?: ScriptTarget[];
      /** Étape où lancer le sort (par défaut : première phase principale, pile vide). */
      step?: Step;
      /** En réponse à un sort ou une capacité du joueur (la pile n'est pas vide). */
      respond?: boolean;
    }
  | { turn: number; do: "activate"; card: string; ability?: number; targets?: ScriptTarget[]; step?: Step }
  | { turn: number; do: "attack"; with: string[] }
  | { turn: number; do: "block"; blocks: [blocker: string, attacker: string][] };

const nameOf = (s: GameState, id: string): string | undefined => s.defs[s.objects[id]?.defId ?? ""]?.name;

function resolveTarget(s: GameState, me: PlayerId, spec: TargetOption, t: ScriptTarget): string | undefined {
  if (t === "you") return spec.legal.find((id) => opponentsOf(s, me).includes(id));
  if (t === "self") return spec.legal.find((id) => id === me);
  return (
    spec.legal.find((id) => nameOf(s, id) === t) ??
    spec.legal.find((id) => s.stack.some((it) => it.id === id && s.defs[it.sourceDefId]?.name === t))
  );
}

function targetsFor(
  s: GameState,
  me: PlayerId,
  specs: TargetOption[],
  wanted: ScriptTarget[] = [],
): Record<string, string[]> | null {
  const out: Record<string, string[]> = {};
  specs.forEach((spec, i) => {
    const w = wanted[i];
    const id = w ? resolveTarget(s, me, spec, w) : spec.optional ? undefined : spec.legal[0];
    out[spec.id] = id ? [id] : [];
  });
  return specs.every((spec) => spec.optional || (out[spec.id]?.length ?? 0) > 0) ? out : null;
}

/** L'action prévue est-elle à faire maintenant (bon moment dans le tour) ? */
function timely(s: GameState, me: PlayerId, a: ScriptAction): boolean {
  if (a.do === "playLand") return s.turn.active === me && s.stack.length === 0 && s.turn.step.startsWith("main");
  if (a.do === "cast" && a.respond) return s.stack.length > 0;
  if (a.do === "cast" || a.do === "activate") {
    if (a.step) return s.turn.step === a.step;
    return s.turn.active === me && s.turn.step === "main1" && s.stack.length === 0;
  }
  return false;
}

function priorityDecision(s: GameState, me: PlayerId, a: ScriptAction, actions: ActionOption[]): Decision | null {
  if (a.do === "playLand") {
    const land = actions.find((o) => o.type === "playLand" && nameOf(s, o.card) === a.card);
    return land?.type === "playLand" ? { type: "playLand", card: land.card } : null;
  }
  if (a.do === "cast") {
    const cast = actions.find((o) => o.type === "cast" && nameOf(s, o.card) === a.card);
    if (cast?.type !== "cast") return null;
    const mode = cast.modes[0];
    const targets = targetsFor(s, me, mode?.targets ?? [], a.targets);
    return targets ? { type: "cast", card: cast.card, mode: mode?.index ?? 0, targets } : null;
  }
  if (a.do === "activate") {
    const act = actions.find(
      (o) => o.type === "activate" && nameOf(s, o.source) === a.card && (a.ability === undefined || o.ability === a.ability),
    );
    if (act?.type !== "activate") return null;
    const targets = targetsFor(s, me, act.targets, a.targets);
    return targets ? { type: "activate", source: act.source, ability: act.ability, targets } : null;
  }
  return null;
}

/** Permanent de `owner` sur le champ de bataille, par nom, en évitant ceux déjà pris. */
function permanent(s: GameState, name: string, among: string[], taken: string[]): string | undefined {
  return among.find((id) => !taken.includes(id) && nameOf(s, id) === name);
}

export function scriptedAgent(script: ScriptAction[], fallback?: Agent): Agent {
  const done = new Set<number>();
  /** Prochaine action du tour en cours parmi celles d'un type, dans l'ordre du script. */
  const next = (s: GameState, kinds: ScriptAction["do"][]) => {
    const i = script.findIndex((a, k) => !done.has(k) && a.turn === s.turn.number && kinds.includes(a.do));
    return i < 0 ? null : { i, a: script[i] as ScriptAction };
  };
  const base: Agent = fallback ?? ((s) => fallbackDecision(s, s.pending as NonNullable<GameState["pending"]>));

  return (s, me) => {
    const p = s.pending;
    if (!p) return { type: "pass" };
    if (p.kind === "priority") {
      const n = next(s, ["playLand", "cast", "activate"]);
      if (n && timely(s, me, n.a)) {
        const d = priorityDecision(s, me, n.a, legalActions(s, me));
        if (d) {
          done.add(n.i);
          return d;
        }
      }
      return fallback ? fallback(s, me) : { type: "pass" };
    }
    if (p.kind === "declareAttackers") {
      const n = next(s, ["attack"]);
      if (n?.a.do === "attack") {
        done.add(n.i);
        const defender = opponentsOf(s, me)[0] as PlayerId;
        const candidates = attackCandidates(s, me);
        const taken: string[] = [];
        for (const name of n.a.with) {
          const id = permanent(s, name, candidates, taken);
          if (id) taken.push(id);
        }
        return { type: "declareAttackers", attackers: taken.map((id) => ({ id, defender })) };
      }
    }
    if (p.kind === "declareBlockers") {
      const n = next(s, ["block"]);
      if (n?.a.do === "block") {
        done.add(n.i);
        const attackers = s.combat?.attackers.map((a) => a.id) ?? [];
        const used: string[] = [];
        const blocks: { blocker: string; attacker: string }[] = [];
        for (const [b, a] of n.a.blocks) {
          const blocker = permanent(
            s,
            b,
            s.battlefield.filter((id) => s.objects[id]?.controller === me),
            used,
          );
          const attacker = permanent(s, a, attackers, []);
          if (!blocker || !attacker) continue;
          used.push(blocker);
          blocks.push({ blocker, attacker });
        }
        return { type: "declareBlockers", blocks };
      }
    }
    return base(s, me);
  };
}
