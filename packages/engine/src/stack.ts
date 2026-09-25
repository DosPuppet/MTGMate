/**
 * Lancer des sorts (601), activer des capacités (602), résoudre la pile (608).
 * Côté moteur, un lancement est atomique : le client envoie d'un coup mode, cibles, X et kicker,
 * et le paiement du mana est résolu automatiquement (réserve d'abord, puis solveur).
 */
import { putIntoGraveyard } from "./actions";
import { ask } from "./choices";
import { boardAmount, runEffect } from "./effects";
import { RulesError } from "./errors";
import { payMana, totalCost } from "./mana";
import { chars, emit, isSummoningSick, moveObject, newId, obj, rulesEvent } from "./state";
import { isLegalTarget, matchesObjectFilter, matchesView, validateTargets } from "./targets";
import { checkCondition, simultaneously } from "./triggers";
import type {
  ActivatedAbilityDef,
  CardDef,
  CastChoices,
  ChoiceValue,
  Effect,
  GameState,
  LkiSnapshot,
  ManaCost,
  ModeDef,
  ObjectId,
  PlayerId,
  StackItem,
  TargetSpec,
} from "./types";

export { RulesError };

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

/** Le sort vu comme un objet, pour les filtres (« les sorts de Dragon que vous lancez… »). */
function spellView(d: CardDef, player: PlayerId): LkiSnapshot {
  return {
    id: "",
    defId: d.id,
    owner: player,
    controller: player,
    types: d.types,
    subtypes: d.subtypes,
    supertypes: d.supertypes,
    colors: d.colors,
    power: d.power ?? 0,
    toughness: d.toughness ?? 0,
    keywords: d.keywords,
    isToken: false,
  };
}

/** Réduction de coût générique applicable à ce sort (601.2f). */
export function spellReduction(s: GameState, player: PlayerId, d: CardDef): number {
  let r = 0;
  const own = d.costReduction;
  if (own && (!own.condition || checkCondition(s, own.condition, player))) {
    const g = own.generic;
    r += typeof g === "number" ? g : g.kind === "count" || g.kind === "totalPower" ? boardAmount(s, g, player) : 0;
  }
  const view = spellView(d, player);
  for (const id of s.battlefield) {
    const o = obj(s, id);
    if (o.controller !== player) continue;
    for (const ab of s.defs[o.defId]?.abilities ?? []) {
      if (ab.kind === "costReduction" && matchesView(view, ab.filter, player)) r += ab.generic;
    }
  }
  return r;
}

/** Coût total d'un sort : coût de base ou de flashback, X, kicker, réductions. */
export function spellCost(
  s: GameState,
  player: PlayerId,
  d: CardDef,
  opts: { x?: number; kicked?: boolean; flashback?: boolean },
): ManaCost {
  const base = opts.flashback ? d.flashback : d.manaCost;
  return totalCost(base, opts.x ?? 0, opts.kicked ? d.kicker : undefined, spellReduction(s, player, d));
}

/** D'où ce sort peut-il être lancé par ce joueur ? */
export function castSource(s: GameState, player: PlayerId, card: ObjectId): "hand" | "flashback" | null {
  const o = s.objects[card];
  if (!o || o.owner !== player) return null;
  if (o.zone === "hand") return "hand";
  if (o.zone === "graveyard" && s.defs[o.defId]?.flashback) return "flashback";
  return null;
}

/** Options des coûts additionnels (cartes à défausser, permanents à sacrifier), ou null s'ils sont impayables. */
export function additionalOptions(
  s: GameState,
  player: PlayerId,
  card: ObjectId,
  d: CardDef,
): { discard?: { count: number; options: ObjectId[] }; sacrifice?: { count: number; options: ObjectId[] } } | null {
  const add = d.additionalCost;
  if (!add) return {};
  const out: ReturnType<typeof additionalOptions> = {};
  if (add.discard) {
    const options = (s.players[player]?.hand ?? []).filter((id) => id !== card);
    if (options.length < add.discard) return null;
    out.discard = { count: add.discard, options };
  }
  if (add.sacrifice) {
    const f = add.sacrifice.filter;
    const options = s.battlefield.filter((id) => obj(s, id).controller === player && matchesObjectFilter(s, player, id, f));
    if (options.length < add.sacrifice.count) return null;
    out.sacrifice = { count: add.sacrifice.count, options };
  }
  return out;
}

export function castSpell(s: GameState, player: PlayerId, card: ObjectId, choices: CastChoices): void {
  const from = castSource(s, player, card);
  if (!from) throw new RulesError("Vous ne pouvez pas lancer cette carte d'ici");
  const o = obj(s, card);
  const d = s.defs[o.defId];
  if (!d || d.types.includes("Land")) throw new RulesError("Ce n'est pas un sort");
  if (!d.implemented) throw new RulesError(`${d.name} n'est pas encore géré par le moteur`);
  if (!canCastTiming(s, player, d)) throw new RulesError("Vous ne pouvez pas lancer ce sort maintenant");
  const flashback = from === "flashback";
  const modes = modesOf(d);
  const modeIndex = choices.mode ?? 0;
  const mode = modes[modeIndex];
  if (!mode) throw new RulesError("Mode invalide");
  const targets = validateTargets(s, player, mode.targets, choices.targets);
  const hasX = !!(flashback ? d.flashback?.x : d.manaCost?.x);
  const x = hasX ? Math.max(0, Math.floor(choices.x ?? 0)) : 0;
  const kicked = !!choices.kicked && !!d.kicker;
  const cost = spellCost(s, player, d, { x, kicked, flashback });

  // Coûts additionnels : vérifiés avant tout changement d'état.
  const opts = additionalOptions(s, player, card, d);
  if (!opts) throw new RulesError("Impossible de payer le coût additionnel");
  const discard = choices.discard ?? [];
  const sacrifice = choices.sacrifice ?? [];
  const check = (chosen: ObjectId[], spec?: { count: number; options: ObjectId[] }) => {
    const need = spec?.count ?? 0;
    if (chosen.length !== need || new Set(chosen).size !== need || chosen.some((id) => !spec?.options.includes(id))) {
      throw new RulesError("Choix du coût additionnel invalide");
    }
  };
  check(discard, opts.discard);
  check(sacrifice, opts.sacrifice);

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
    flashback,
  };
  s.stack.push(item);
  try {
    payMana(s, player, cost);
  } catch {
    throw new RulesError("Mana insuffisant");
  }
  if (discard.length) {
    emit({ type: "discard", player, defIds: discard.map((id) => obj(s, id).defId) });
    for (const id of discard) moveObject(s, id, "graveyard");
  }
  for (const id of sacrifice) putIntoGraveyard(s, id);
  s.priority.passes = 0;
  emit({ type: "cast", player, stackId, defId: d.id, targets: flatTargets(targets) });
  rulesEvent(s, { e: "cast", player, stackId });
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
  if (ab?.kind === "triggered") {
    // 603.4 : la condition d'une capacité « si… » est vérifiée à nouveau à la résolution.
    if (ab.condition && !checkCondition(s, ab.condition, item.controller, item.sourceId)) return { specs: [], effects: [] };
    return { specs: ab.targets, effects: ab.effects };
  }
  return ab?.kind === "activated" ? { specs: ab.targets, effects: ab.effects } : { specs: [], effects: [] };
}

/**
 * Commence la résolution de l'objet au sommet de la pile (608).
 * Renvoie true si la résolution est terminée, false si elle attend un choix (s.flow = "resolving").
 */
export function resolveTop(s: GameState): boolean {
  // L'objet reste sur la pile pendant toute sa résolution (608.2) ; il n'en sort qu'à la fin.
  const item = s.stack[s.stack.length - 1];
  if (!item) return true;
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
    s.stack.pop();
    emit({ type: "fizzle", stackId: item.id, defId: item.sourceDefId });
    if (item.kind === "spell") moveObject(s, item.sourceId, item.flashback ? "exile" : "graveyard");
    return true;
  }

  emit({ type: "resolve", stackId: item.id, defId: item.sourceDefId });
  s.resolving = { item, effects, pc: 0, controller: item.controller, targets: legal, vars: {}, awaiting: null };
  return continueResolution(s);
}

/** Exécute les effets restants ; s'arrête sur le premier choix à poser. */
export function continueResolution(s: GameState): boolean {
  const r = s.resolving;
  if (!r) return true;
  while (r.pc < r.effects.length && !s.over) {
    // Chaque effet est un ensemble d'événements simultanés (regard en arrière des déclencheurs).
    const result = simultaneously(s, () => runEffect(s, r, r.effects[r.pc] as Effect));
    if (result && "ask" in result) {
      r.awaiting = result.ask.key;
      ask(s, result.ask.player, result.ask.request, { kind: "effect" });
      s.flow = "resolving";
      return false;
    }
    if (result && "skip" in result) r.pc += result.skip;
    r.pc += 1;
  }
  finishResolution(s, r.item);
  s.resolving = null;
  return true;
}

/** Réponse à un choix posé pendant la résolution. */
export function answerResolutionChoice(s: GameState, values: ChoiceValue[]): boolean {
  const r = s.resolving;
  if (!r?.awaiting) throw new RulesError("Aucune résolution en attente");
  r.vars[r.awaiting] = values;
  r.awaiting = null;
  return continueResolution(s);
}

function finishResolution(s: GameState, item: StackItem): void {
  const i = s.stack.findIndex((x) => x.id === item.id);
  if (i >= 0) s.stack.splice(i, 1);
  if (item.kind === "spell" && s.objects[item.sourceId]) {
    const d = s.defs[item.sourceDefId];
    if (d && isPermanentCard(d)) {
      moveObject(s, item.sourceId, "battlefield", { controller: item.controller, enters: { x: item.x, kicked: item.kicked } });
    } else moveObject(s, item.sourceId, item.flashback ? "exile" : "graveyard");
  }
}
