/**
 * Lancer des sorts (601), activer des capacités (602), résoudre la pile (608).
 * Côté moteur, un lancement est atomique : le client envoie d'un coup mode, cibles, X et kicker,
 * et le paiement du mana est résolu automatiquement (réserve d'abord, puis solveur).
 */
import { putIntoGraveyard } from "./actions";
import { type EffectContext, runEffects } from "./effects";
import { payMana, totalCost } from "./mana";
import { chars, emit, isSummoningSick, moveObject, newId, obj } from "./state";
import { isLegalTarget, validateTargets } from "./targets";
import type {
  ActivatedAbilityDef,
  CardDef,
  CastChoices,
  Effect,
  GameState,
  ModeDef,
  ObjectId,
  PlayerId,
  StackItem,
  TargetSpec,
} from "./types";

export class RulesError extends Error {}

export function isPermanentCard(d: CardDef): boolean {
  return !d.types.includes("Instant") && !d.types.includes("Sorcery");
}

/** Modes d'un sort ; un permanent sans cible a un unique mode vide. */
export function modesOf(d: CardDef): ModeDef[] {
  return d.spell?.modes ?? [{ targets: [], effects: [] }];
}

export function sorceryTiming(s: GameState, player: PlayerId): boolean {
  return s.turn.active === player && (s.turn.step === "main1" || s.turn.step === "main2") && s.stack.length === 0;
}

export function canCastTiming(s: GameState, player: PlayerId, d: CardDef): boolean {
  if (d.types.includes("Instant") || d.keywords.includes("flash")) return true;
  return sorceryTiming(s, player);
}

export function canPlayLand(s: GameState, player: PlayerId, card: ObjectId): boolean {
  const o = s.objects[card];
  if (o?.zone !== "hand" || o.owner !== player) return false;
  const d = s.defs[o.defId];
  return !!d?.types.includes("Land") && sorceryTiming(s, player) && s.turn.landsPlayed < 1;
}

export function playLand(s: GameState, player: PlayerId, card: ObjectId): void {
  if (!canPlayLand(s, player, card)) throw new RulesError("Vous ne pouvez pas jouer ce terrain maintenant");
  const defId = obj(s, card).defId;
  const id = moveObject(s, card, "battlefield", { controller: player });
  s.turn.landsPlayed += 1;
  emit({ type: "playLand", player, objectId: id as string, defId });
}

function flatTargets(t: Record<string, string[]>): string[] {
  return Object.values(t).flat();
}

export function castSpell(s: GameState, player: PlayerId, card: ObjectId, choices: CastChoices): void {
  const o = s.objects[card];
  if (o?.zone !== "hand" || o.owner !== player) throw new RulesError("Cette carte n'est pas dans votre main");
  const d = s.defs[o.defId];
  if (!d || d.types.includes("Land")) throw new RulesError("Ce n'est pas un sort");
  if (!d.implemented) throw new RulesError(`${d.name} n'est pas encore géré par le moteur`);
  if (!canCastTiming(s, player, d)) throw new RulesError("Vous ne pouvez pas lancer ce sort maintenant");
  const modes = modesOf(d);
  const modeIndex = choices.mode ?? 0;
  const mode = modes[modeIndex];
  if (!mode) throw new RulesError("Mode invalide");
  const targets = validateTargets(s, player, mode.targets, choices.targets);
  const x = d.manaCost?.x ? Math.max(0, Math.floor(choices.x ?? 0)) : 0;
  const kicked = !!choices.kicked && !!d.kicker;
  const cost = totalCost(d.manaCost, x, kicked ? d.kicker : undefined);

  // 601.2a : le sort passe sur la pile (nouvel objet), puis on paie les coûts (601.2g–h).
  const stackId = moveObject(s, card, "stack", { controller: player }) as string;
  const item: StackItem = {
    id: stackId,
    kind: "spell",
    controller: player,
    sourceId: stackId,
    sourceDefId: d.id,
    abilityIndex: -1,
    mode: modeIndex,
    targets,
    x,
    kicked,
    sourceSnapshot: { keywords: d.keywords, power: d.power ?? 0, controller: player },
  };
  s.stack.push(item);
  try {
    payMana(s, player, cost);
  } catch {
    throw new RulesError("Mana insuffisant");
  }
  s.priority.passes = 0;
  emit({ type: "cast", player, stackId, defId: d.id, targets: flatTargets(targets) });
}

export function activatedAbility(s: GameState, source: ObjectId, index: number): ActivatedAbilityDef | null {
  const d = s.defs[s.objects[source]?.defId ?? ""];
  const ab = d?.abilities[index];
  return ab?.kind === "activated" ? ab : null;
}

/** Les coûts non-mana de la capacité peuvent-ils être payés ? */
export function canPayNonManaCost(s: GameState, source: ObjectId, ab: ActivatedAbilityDef): boolean {
  const o = s.objects[source];
  if (o?.zone !== "battlefield") return false;
  if (ab.cost.tap && (o.tapped || isSummoningSick(s, source))) return false;
  return true;
}

export function activateAbility(s: GameState, player: PlayerId, source: ObjectId, index: number, choices: CastChoices): void {
  const o = s.objects[source];
  if (o?.zone !== "battlefield" || o.controller !== player) throw new RulesError("Vous ne contrôlez pas ce permanent");
  const ab = activatedAbility(s, source, index);
  if (!ab) throw new RulesError("Capacité inconnue");
  if (
    ab.sorcerySpeed &&
    !(s.turn.active === player && (s.turn.step === "main1" || s.turn.step === "main2") && s.stack.length === 0)
  ) {
    throw new RulesError("Cette capacité s'active seulement en rituel");
  }
  if (!canPayNonManaCost(s, source, ab)) throw new RulesError("Impossible de payer le coût");
  const targets = validateTargets(s, player, ab.targets, choices.targets);
  const x = ab.cost.mana?.x ? Math.max(0, Math.floor(choices.x ?? 0)) : 0;
  const c = chars(s, source);
  const item: StackItem = {
    id: newId(s, "a"),
    kind: "ability",
    controller: player,
    sourceId: source,
    sourceDefId: o.defId,
    abilityIndex: index,
    mode: 0,
    targets,
    x,
    kicked: false,
    sourceSnapshot: { keywords: c.keywords, power: c.power, controller: player },
  };
  s.stack.push(item);
  // Coûts : mana (sans engager la source si elle doit s'engager pour le coût), puis {T}, puis sacrifice.
  if (ab.cost.mana) {
    try {
      payMana(s, player, totalCost(ab.cost.mana, x), ab.cost.tap ? new Set([source]) : undefined);
    } catch {
      throw new RulesError("Mana insuffisant");
    }
  }
  if (ab.cost.tap) o.tapped = true;
  if (ab.cost.sacrificeSelf) putIntoGraveyard(s, source);
  s.priority.passes = 0;
  emit({ type: "activate", player, stackId: item.id, defId: o.defId, targets: flatTargets(targets) });
}

function specsAndEffects(s: GameState, item: StackItem): { specs: TargetSpec[]; effects: Effect[] } {
  const d = s.defs[item.sourceDefId];
  if (!d) return { specs: [], effects: [] };
  if (item.kind === "spell") {
    const mode = modesOf(d)[item.mode];
    return { specs: mode?.targets ?? [], effects: mode?.effects ?? [] };
  }
  const ab = d.abilities[item.abilityIndex];
  return ab?.kind === "activated" ? { specs: ab.targets, effects: ab.effects } : { specs: [], effects: [] };
}

export function resolveTop(s: GameState): void {
  const item = s.stack.pop();
  if (!item) return;
  const { specs, effects } = specsAndEffects(s, item);

  // 608.2b : on revérifie les cibles. Si toutes sont devenues illégales, le sort ne se résout pas.
  const legal: Record<string, string[]> = {};
  let chosen = 0;
  let stillLegal = 0;
  for (const spec of specs) {
    const ids = item.targets[spec.id] ?? [];
    chosen += ids.length;
    legal[spec.id] = ids.filter((id) => isLegalTarget(s, item.controller, spec, id));
    stillLegal += legal[spec.id]?.length ?? 0;
  }
  if (chosen > 0 && stillLegal === 0) {
    emit({ type: "fizzle", stackId: item.id, defId: item.sourceDefId });
    if (item.kind === "spell") moveObject(s, item.sourceId, "graveyard");
    return;
  }

  emit({ type: "resolve", stackId: item.id, defId: item.sourceDefId });
  const ctx: EffectContext = {
    controller: item.controller,
    sourceId: item.sourceId,
    sourceDefId: item.sourceDefId,
    sourceSnapshot: item.sourceSnapshot,
    targets: legal,
    x: item.x,
    kicked: item.kicked,
  };
  runEffects(s, ctx, effects);

  if (item.kind === "spell" && s.objects[item.sourceId]) {
    const d = s.defs[item.sourceDefId];
    if (d && isPermanentCard(d)) moveObject(s, item.sourceId, "battlefield", { controller: item.controller });
    else moveObject(s, item.sourceId, "graveyard");
  }
}
