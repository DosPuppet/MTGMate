/**
 * Combat damage preview (Arena style): from the view and the blocks being chosen, the life each player would lose and
 * the creatures that would die. A simple, pure and tested computation: first strike, double strike, deathtouch,
 * trample and lifelink; no replacements, no triggers, no prevented damage.
 */
import type { GameView, ObjectView } from "@mtgx/engine";

export interface CombatPreview {
  /** Life lost (or gained through lifelink, as a negative number) per player. */
  lifeLoss: Record<string, number>;
  /** Creatures that would die. */
  dies: string[];
}

interface Fighter {
  o: ObjectView;
  damage: number;
}

const has = (o: ObjectView, k: string) => (o.keywords as string[]).includes(k);
const lethal = (f: Fighter, deathtouch: boolean) =>
  deathtouch ? (f.damage > 0 ? 0 : 1) : Math.max(0, (f.o.toughness ?? 0) - (f.o.damage ?? 0) - f.damage);
const dead = (f: Fighter, deathtouched: boolean) =>
  (f.o.toughness ?? 0) - (f.o.damage ?? 0) - f.damage <= 0 || (deathtouched && f.damage > 0);

/**
 * `attackers`: attackers and the defender they attack; `blocks`: blocker → attacker. Without attackers, null.
 */
export function combatPreview(
  view: GameView,
  attackers: { id: string; defender: string }[],
  blocks: Record<string, string>,
): CombatPreview | null {
  if (attackers.length === 0) return null;
  const byId = new Map(view.battlefield.map((o) => [o.id, o]));
  const lifeLoss: Record<string, number> = {};
  const hurt = (p: string, n: number) => {
    lifeLoss[p] = (lifeLoss[p] ?? 0) + n;
  };
  const fighters = new Map<string, Fighter>();
  const fighter = (id: string): Fighter | null => {
    const o = byId.get(id);
    if (!o) return null;
    const f = fighters.get(id) ?? { o, damage: 0 };
    fighters.set(id, f);
    return f;
  };
  const deathtouched = new Set<string>();
  const defenderPlayer = (d: string) => (view.players[d] ? d : (byId.get(d)?.controller ?? d));

  for (const a of attackers) {
    const att = fighter(a.id);
    if (!att) continue;
    const blockers = Object.entries(blocks)
      .filter(([, target]) => target === a.id)
      .map(([b]) => fighter(b))
      .filter((f): f is Fighter => !!f);
    const power = Math.max(0, att.o.power ?? 0);
    const first = has(att.o, "firstStrike") || has(att.o, "doubleStrike");
    const strikes = has(att.o, "doubleStrike") ? 2 : 1;
    const dt = has(att.o, "deathtouch");
    const link = has(att.o, "lifelink");
    // The attacker's damage: assigned to kill as many blockers as possible, the rest to the player if it has trample.
    const dealAttacker = () => {
      if (blockers.length === 0) {
        hurt(defenderPlayer(a.defender), power);
        if (link) hurt(att.o.controller, -power);
        return;
      }
      let left = power;
      for (const b of blockers) {
        const need = lethal(b, dt);
        const give = Math.min(left, need);
        b.damage += give;
        if (dt && give > 0) deathtouched.add(b.o.id);
        left -= give;
      }
      if (left > 0 && has(att.o, "trample")) hurt(defenderPlayer(a.defender), left);
      else if (left > 0 && blockers[0]) blockers[0].damage += left;
      if (link) hurt(att.o.controller, -power);
    };
    const dealBlockers = (onlyFirst: boolean) => {
      for (const b of blockers) {
        if (dead(b, deathtouched.has(b.o.id))) continue;
        const bFirst = has(b.o, "firstStrike") || has(b.o, "doubleStrike");
        if (onlyFirst !== bFirst && !(has(b.o, "doubleStrike") && !onlyFirst)) continue;
        const p = Math.max(0, b.o.power ?? 0);
        att.damage += p;
        if (has(b.o, "deathtouch") && p > 0) deathtouched.add(att.o.id);
        if (has(b.o, "lifelink")) hurt(b.o.controller, -p);
      }
    };
    // First-strike damage step, then the regular one.
    if (first) dealAttacker();
    dealBlockers(true);
    const attackerAlive = !dead(att, deathtouched.has(att.o.id));
    if (attackerAlive && (!first || strikes === 2)) dealAttacker();
    dealBlockers(false);
  }
  const dies = [...fighters.values()].filter((f) => dead(f, deathtouched.has(f.o.id))).map((f) => f.o.id);
  return { lifeLoss, dies };
}
