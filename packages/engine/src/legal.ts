/**
 * Énumération exhaustive des actions légales pour le joueur qui a la priorité.
 * L'interface ne met en surbrillance que ces options ; l'IA et l'autopilot s'en servent aussi.
 */
import { availableMana, canPay, manaAbilitiesOf, manaSources, manaValue, totalCost } from "./mana";
import {
  abilitiesOf,
  activatedAbility,
  additionalOptions,
  canCastTiming,
  canPayNonManaCost,
  canPlayLand,
  castSource,
  modesOf,
  sacrificeOptions,
  sorceryTiming,
  spellCost,
} from "./stack";
import { obj } from "./state";
import { legalTargets } from "./targets";
import type { ActionOption, GameState, ManaCost, ObjectId, PlayerId, TargetOption, TargetSpec } from "./types";

function targetOptions(s: GameState, player: PlayerId, specs: TargetSpec[], sourceId?: ObjectId): TargetOption[] {
  return specs.map((t) => {
    const legal = legalTargets(s, player, t, sourceId);
    const opt: TargetOption = {
      id: t.id,
      label: t.label,
      optional: !!t.optional,
      legal,
      count: t.count && t.count > 1 ? t.count : undefined,
      kickedCount: t.kickedCount,
      otherThan: t.otherThan,
      attachedToTarget: t.attachedToTarget,
    };
    if (t.samePlayer || t.differentPlayers) {
      const holders: Record<string, string> = {};
      for (const id of legal) {
        const o = s.objects[id];
        holders[id] = o ? (o.zone === "battlefield" ? o.controller : o.owner) : id;
      }
      opt.group = { kind: t.samePlayer ? "same" : "different", holders };
    }
    return opt;
  });
}

function targetsAvailable(opts: TargetOption[]): boolean {
  return opts.every((t) => {
    if (t.optional) return true;
    const need = t.count ?? 1;
    if (t.group?.kind === "different") return new Set(Object.values(t.group.holders)).size >= need;
    return t.legal.length >= need;
  });
}

/** Plus grande valeur de X payable pour un coût qui dépend de X. */
function maxXFor(s: GameState, player: PlayerId, costAt: (x: number) => ManaCost): number {
  const upper = availableMana(s, player) - manaValue(costAt(0));
  for (let x = upper; x > 0; x--) if (canPay(s, player, costAt(x))) return x;
  return 0;
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

  // Cartes en main, et cartes avec flashback dans le cimetière.
  const graveyard = (s.players[player]?.graveyard ?? []).filter(
    (id) => s.defs[obj(s, id).defId]?.flashback || s.turn.mayCastFromGraveyard?.includes(id),
  );
  const exiled = (s.turn.mayPlayFromExile ?? []).filter(
    (id) => s.objects[id]?.zone === "exile" && s.objects[id]?.owner === player,
  );
  for (const card of [...hand, ...graveyard, ...exiled]) {
    const d = s.defs[obj(s, card).defId];
    if (!d) continue;
    if (d.types.includes("Land")) {
      if (canPlayLand(s, player, card)) out.push({ type: "playLand", card });
      continue;
    }
    if (!d.implemented || !canCastTiming(s, player, d)) continue;
    const source = castSource(s, player, card);
    const flashback = source === "flashback";
    const modes = modesOf(d)
      .map((m, index) => ({ index, label: m.label, targets: targetOptions(s, player, m.targets, card) }))
      .filter((m) => targetsAvailable(m.targets));
    if (modes.length === 0 || !canPay(s, player, spellCost(s, player, d, { flashback }))) continue;
    const additional = additionalOptions(s, player, card, d);
    if (!additional) continue;
    const hasX = !!(flashback ? d.flashback?.x : d.manaCost?.x);
    out.push({
      type: "cast",
      card,
      modes,
      xMax: hasX ? maxXFor(s, player, (x) => spellCost(s, player, d, { x, flashback })) : null,
      kickerAffordable: !!d.kicker && !flashback && canPay(s, player, spellCost(s, player, d, { kicked: true })),
      fromGraveyard: source === "graveyard" || source === "flashback" ? true : undefined,
      fromExile: source === "exile" ? true : undefined,
      additional: additional.discard || additional.sacrifice ? additional : undefined,
    });
  }

  const ownGraveyard = (s.players[player]?.graveyard ?? []).filter((id) =>
    s.defs[obj(s, id).defId]?.abilities.some((ab) => ab.kind === "activated" && ab.fromGraveyard),
  );
  for (const id of [...s.battlefield, ...ownGraveyard]) {
    const o = obj(s, id);
    if (o.zone === "battlefield" ? o.controller !== player : o.owner !== player) continue;
    abilitiesOf(s, id).forEach((_, index) => {
      const ab = activatedAbility(s, id, index);
      if (!ab || !!ab.fromGraveyard !== (o.zone === "graveyard") || !canPayNonManaCost(s, id, ab, index)) return;
      if (ab.sorcerySpeed && !sorceryTiming(s, player)) return;
      const exclude = ab.cost.tap ? new Set([id]) : undefined;
      if (ab.cost.mana && !canPay(s, player, totalCost(ab.cost.mana, 0), exclude)) return;
      const targets = targetOptions(s, player, ab.targets, id);
      if (!targetsAvailable(targets)) return;
      out.push({
        type: "activate",
        source: id,
        ability: index,
        label: ab.label,
        targets,
        xMax: maxX(s, player, ab.cost.mana, exclude),
        additional: ab.cost.sacrifice
          ? { sacrifice: { count: ab.cost.sacrifice.count, options: sacrificeOptions(s, player, id, ab) } }
          : undefined,
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
