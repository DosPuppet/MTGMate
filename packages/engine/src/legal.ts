/**
 * Énumération exhaustive des actions légales pour le joueur qui a la priorité.
 * L'interface ne met en surbrillance que ces options ; l'IA et l'autopilot s'en servent aussi.
 */
import { availableMana, canPay, manaAbilitiesOf, manaSources, manaValue, totalCost } from "./mana";
import { activatedAbility, canCastTiming, canPayNonManaCost, canPlayLand, modesOf, sorceryTiming } from "./stack";
import { obj } from "./state";
import { legalTargets } from "./targets";
import type { ActionOption, GameState, ManaCost, ObjectId, PlayerId, TargetOption, TargetSpec } from "./types";

function targetOptions(s: GameState, player: PlayerId, specs: TargetSpec[]): TargetOption[] {
  return specs.map((t) => ({ id: t.id, label: t.label, optional: !!t.optional, legal: legalTargets(s, player, t) }));
}

function targetsAvailable(opts: TargetOption[]): boolean {
  return opts.every((t) => t.optional || t.legal.length > 0);
}

/** Plus grande valeur de X payable (null si le coût n'a pas de X). */
function maxX(s: GameState, player: PlayerId, cost: ManaCost | null | undefined, exclude?: ReadonlySet<ObjectId>): number | null {
  if (!cost?.x) return null;
  const upper = Math.floor((availableMana(s, player, exclude) - manaValue(cost)) / cost.x);
  for (let x = upper; x > 0; x--) if (canPay(s, player, totalCost(cost, x), exclude)) return x;
  return 0;
}

export function legalActions(s: GameState, player: PlayerId): ActionOption[] {
  const p = s.pending;
  if (p?.kind !== "priority" || p.player !== player) return [];
  const out: ActionOption[] = [{ type: "pass" }];
  const hand = s.players[player]?.hand ?? [];

  for (const card of hand) {
    const d = s.defs[obj(s, card).defId];
    if (!d) continue;
    if (d.types.includes("Land")) {
      if (canPlayLand(s, player, card)) out.push({ type: "playLand", card });
      continue;
    }
    if (!d.implemented || !canCastTiming(s, player, d)) continue;
    const modes = modesOf(d)
      .map((m, index) => ({ index, label: m.label, targets: targetOptions(s, player, m.targets) }))
      .filter((m) => targetsAvailable(m.targets));
    if (modes.length === 0 || !canPay(s, player, totalCost(d.manaCost, 0))) continue;
    out.push({
      type: "cast",
      card,
      modes,
      xMax: maxX(s, player, d.manaCost),
      kickerAffordable: !!d.kicker && canPay(s, player, totalCost(d.manaCost, 0, d.kicker)),
    });
  }

  for (const id of s.battlefield) {
    const o = obj(s, id);
    if (o.controller !== player) continue;
    const d = s.defs[o.defId];
    d?.abilities.forEach((_, index) => {
      const ab = activatedAbility(s, id, index);
      if (!ab || !canPayNonManaCost(s, id, ab)) return;
      if (ab.sorcerySpeed && !sorceryTiming(s, player)) return;
      const exclude = ab.cost.tap ? new Set([id]) : undefined;
      if (ab.cost.mana && !canPay(s, player, totalCost(ab.cost.mana, 0), exclude)) return;
      const targets = targetOptions(s, player, ab.targets);
      if (!targetsAvailable(targets)) return;
      out.push({
        type: "activate",
        source: id,
        ability: index,
        label: ab.label,
        targets,
        xMax: maxX(s, player, ab.cost.mana, exclude),
      });
    });
  }

  for (const src of manaSources(s, player)) {
    const ab = manaAbilitiesOf(s, src.id)[src.ability];
    if (ab) out.push({ type: "tapForMana", source: src.id, ability: src.ability, colors: ab.produce });
  }
  return out;
}

/** Actions « significatives » : tout sauf passer et produire du mana. */
export function meaningfulActions(s: GameState, player: PlayerId): ActionOption[] {
  return legalActions(s, player).filter((a) => a.type !== "pass" && a.type !== "tapForMana");
}
