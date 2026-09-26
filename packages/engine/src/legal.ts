/**
 * Énumération exhaustive des actions légales pour le joueur qui a la priorité.
 * L'interface ne met en surbrillance que ces options ; l'IA et l'autopilot s'en servent aussi.
 */
import { availableMana, canPay, manaAbilitiesOf, manaSources, manaValue, totalCost } from "./mana";
import {
  abilitiesOf,
  abilityZone,
  activatedAbility,
  additionalOptions,
  canCastTiming,
  canPayNonManaCost,
  canPlayLand,
  castTerms,
  instantLoyalty,
  modesOf,
  sacrificeOptions,
  sorceryTiming,
  spellCost,
  spellView,
  splitSecondOnStack,
} from "./stack";
import { obj } from "./state";
import { legalTargets } from "./targets";
import { checkCondition } from "./triggers";
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

  // Cartes jouables : main, cimetière (flashback, Muldrotha, Zul Ashur…) et exil (impulsion, Etali, Tinybones).
  const graveyard = (s.players[player]?.graveyard ?? []).filter((id) => castTerms(s, player, id) || canPlayLand(s, player, id));
  const exiled = s.exile.filter((id) => castTerms(s, player, id) || canPlayLand(s, player, id));
  // Dessus de la bibliothèque (Vizier of the Menagerie).
  const top = s.players[player]?.library[0];
  if (top && castTerms(s, player, top)) exiled.push(top);
  for (const card of [...hand, ...graveyard, ...exiled]) {
    const d = s.defs[obj(s, card).defId];
    if (!d) continue;
    if (d.types.includes("Land")) {
      if (canPlayLand(s, player, card)) out.push({ type: "playLand", card });
      continue;
    }
    const terms = castTerms(s, player, card);
    if (!terms || !d.implemented) continue;
    // Timing : normal, ignoré (Etali), ou flash moyennant un surcoût (Harbinger of the Tides).
    const onTime = terms.anyTime || canCastTiming(s, player, d);
    if (!onTime && !d.flashExtraCost) continue;
    const timingExtra = onTime ? undefined : d.flashExtraCost;
    const flashback = terms.source === "flashback";
    const modes = modesOf(d)
      .map((m, index) => ({ index, label: m.label, targets: targetOptions(s, player, m.targets, card) }))
      .filter((m) => targetsAvailable(m.targets));
    if (modes.length === 0) continue;
    const additional = additionalOptions(s, player, card, d);
    if (!additional) continue;
    const purpose = { spell: spellView(d, player), convoke: d.keywords.includes("convoke"), fromHand: terms.source === "hand" };
    const base = { flashback, anyMana: terms.anyMana };
    // « Sacrifiez une créature ou payez {3}{B} » : sans créature à sacrifier, le mana s'ajoute au coût.
    const sac = additional.sacrifice;
    const mustPayInstead = !!sac?.orPay && sac.options.length < sac.count;
    const withExtra = (c: ManaCost) => {
      const a = mustPayInstead && sac?.orPay ? totalCost(c, 0, sac.orPay) : c;
      return timingExtra ? totalCost(a, 0, timingExtra) : a;
    };
    const normal = !terms.free && canPay(s, player, withExtra(spellCost(s, player, d, base)), undefined, purpose);
    const freeAvailable = !!terms.freeOptional;
    const altAvailable =
      !terms.free &&
      !!d.altCost &&
      checkCondition(s, d.altCost.condition, player) &&
      canPay(s, player, withExtra(spellCost(s, player, d, { ...base, alternative: true })), undefined, purpose);
    if (!terms.free && !normal && !freeAvailable && !altAvailable) continue;
    // Le mana à payer à la place du sacrifice est-il disponible ?
    if (sac?.orPay) {
      sac.orPayAffordable = canPay(s, player, totalCost(spellCost(s, player, d, base), 0, sac.orPay), undefined, purpose);
    }
    const hasX = !terms.free && !!(flashback ? (d.flashback ?? d.manaCost)?.x : d.manaCost?.x);
    out.push({
      type: "cast",
      card,
      modes,
      xMax: hasX && normal ? maxXFor(s, player, (x) => withExtra(spellCost(s, player, d, { ...base, x }))) : null,
      kickerAffordable:
        !!d.kicker &&
        !flashback &&
        canPay(s, player, withExtra(spellCost(s, player, d, { ...base, kicked: true, free: terms.free })), undefined, purpose),
      fromGraveyard: terms.source === "graveyard" || terms.source === "flashback" ? true : undefined,
      fromExile: terms.source === "exile" ? true : undefined,
      free: terms.free || undefined,
      freeAvailable: freeAvailable || undefined,
      altAvailable: altAvailable || undefined,
      normalAvailable: normal || undefined,
      additional: additional.discard || additional.sacrifice ? additional : undefined,
    });
  }

  const offField = (zone: "graveyard" | "hand", flag: "fromGraveyard" | "fromHand") =>
    (s.players[player]?.[zone] ?? []).filter((id) =>
      s.defs[obj(s, id).defId]?.abilities.some((ab) => ab.kind === "activated" && ab[flag]),
    );
  for (const id of [...s.battlefield, ...offField("graveyard", "fromGraveyard"), ...offField("hand", "fromHand")]) {
    const o = obj(s, id);
    if (o.zone === "battlefield" ? o.controller !== player : o.owner !== player) continue;
    abilitiesOf(s, id).forEach((_, index) => {
      const ab = activatedAbility(s, id, index);
      if (!ab || abilityZone(ab) !== o.zone || !canPayNonManaCost(s, id, ab, index)) return;
      if (ab.sorcerySpeed && !instantLoyalty(s, player, id, ab) && !sorceryTiming(s, player)) return;
      const exclude = ab.cost.tap ? new Set([id]) : undefined;
      if (ab.cost.mana && !canPay(s, player, totalCost(ab.cost.mana, 0), exclude, { abilitySource: id })) return;
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
  // 702.61 : second partagé — ni sorts ni capacités (hors mana) tant que le sort est sur la pile.
  if (splitSecondOnStack(s)) return out.filter((a) => a.type === "pass" || a.type === "tapForMana");
  return out;
}

/** Actions « significatives » : tout sauf passer et produire du mana. */
export function meaningfulActions(s: GameState, player: PlayerId): ActionOption[] {
  return legalActions(s, player).filter((a) => a.type !== "pass" && a.type !== "tapForMana");
}
