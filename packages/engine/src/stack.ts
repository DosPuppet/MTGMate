/**
 * Lancer des sorts (601), activer des capacités (602), résoudre la pile (608).
 * Côté moteur, un lancement est atomique : le client envoie d'un coup mode, cibles, X et kicker,
 * et le paiement du mana est résolu automatiquement (réserve d'abord, puis solveur).
 */
import { loseLife, putIntoGraveyard } from "./actions";
import { ask } from "./choices";
import { announceDiscard, evalAmount, runEffect } from "./effects";
import { RulesError } from "./errors";
import { payMana, totalCost } from "./mana";
import {
  bump,
  changeCounters,
  chars,
  emit,
  isCreature,
  isSummoningSick,
  moveObject,
  newId,
  nextTimestamp,
  obj,
  onBattlefield,
  rulesEvent,
  snapshot,
  tapObject,
} from "./state";
import { controlledAbilitiesWithSource, playerStatic } from "./statics";
import { isLegalTarget, legalTargets, matchesObjectFilter, matchesView, validateTargets } from "./targets";
import { checkCondition, simultaneously } from "./triggers";
import type {
  ActivatedAbilityDef,
  CardDef,
  CastChoices,
  ChoiceValue,
  Color,
  Effect,
  GameObject,
  GameState,
  LkiSnapshot,
  ManaCost,
  ManaType,
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

/** Mot « cible » d'un sort d'Aura (303.4a). */
export const ENCHANT_SPEC = "enchant";

/** Modes d'un sort ; un permanent sans cible a un unique mode vide, une Aura cible ce qu'elle enchantera. */
export function modesOf(d: CardDef): ModeDef[] {
  if (d.spell) return d.spell.modes;
  if (d.enchant) {
    return [{ targets: [{ id: ENCHANT_SPEC, label: d.enchant.label, filter: { objects: d.enchant.filter } }], effects: [] }];
  }
  return [{ targets: [], effects: [] }];
}

export function sorceryTiming(s: GameState, player: PlayerId): boolean {
  return s.turn.active === player && (s.turn.step === "main1" || s.turn.step === "main2") && s.stack.length === 0;
}

export function canCastTiming(s: GameState, player: PlayerId, d: CardDef): boolean {
  if (d.types.includes("Instant") || d.keywords.includes("flash")) return true;
  if (sorceryTiming(s, player)) return true;
  // « Vous pouvez lancer des sorts comme s'ils avaient le flash. »
  return s.battlefield.some(
    (id) => obj(s, id).controller === player && chars(s, id).abilities.some((ab) => ab.kind === "castPermission" && ab.flash),
  );
}

/** Capacités (sur le champ de bataille) des permanents que ce joueur contrôle. */
function controlledAbilities(s: GameState, player: PlayerId): CardDef["abilities"] {
  return controlledAbilitiesWithSource(s, player).map((e) => e.ab);
}

/** Nombre de terrains que le joueur peut jouer ce tour-ci (305.2 : 1, plus les effets comme Loot). */
export function landsAllowed(s: GameState, player: PlayerId): number {
  return 1 + controlledAbilities(s, player).reduce((n, ab) => n + (ab.kind === "playerStatic" ? (ab.extraLands ?? 0) : 0), 0);
}

/** Permission de jouer une carte exilée (impulsion, Etali…) encore valable. */
function exilePermission(s: GameState, player: PlayerId, card: ObjectId) {
  return s.playPermissions?.find((p) => p.card === card && p.player === player && p.until >= s.turn.number);
}

/** Muldrotha : type de permanent encore disponible pour jouer cette carte depuis le cimetière ce tour-ci. */
function graveyardTypeAvailable(s: GameState, player: PlayerId, card: ObjectId): string | null {
  if (s.turn.active !== player) return null;
  if (!controlledAbilities(s, player).some((ab) => ab.kind === "castPermission" && ab.graveyardPermanentTypes)) return null;
  const d = s.defs[obj(s, card).defId];
  const used = s.turn.graveyardTypesUsed ?? [];
  return d?.types.find((t) => PERMANENT_TYPES.includes(t) && !used.includes(t)) ?? null;
}

const PERMANENT_TYPES: readonly string[] = ["Artifact", "Creature", "Enchantment", "Land", "Planeswalker", "Battle"];

export function canPlayLand(s: GameState, player: PlayerId, card: ObjectId): boolean {
  const o = s.objects[card];
  if (!o) return false;
  const d = s.defs[o.defId];
  if (!d?.types.includes("Land")) return false;
  const allowed =
    (o.zone === "hand" && o.owner === player) ||
    (o.zone === "exile" && !!exilePermission(s, player, card) && !exilePermission(s, player, card)?.anyTime) ||
    (o.zone === "graveyard" && o.owner === player && graveyardTypeAvailable(s, player, card) === "Land");
  return allowed && sorceryTiming(s, player) && s.turn.landsPlayed < landsAllowed(s, player);
}

export function playLand(s: GameState, player: PlayerId, card: ObjectId): void {
  if (!canPlayLand(s, player, card)) throw new RulesError("Vous ne pouvez pas jouer ce terrain maintenant");
  const o = obj(s, card);
  if (o.zone === "graveyard") s.turn.graveyardTypesUsed = [...(s.turn.graveyardTypesUsed ?? []), "Land"];
  const defId = o.defId;
  const id = moveObject(s, card, "battlefield", { controller: player });
  s.turn.landsPlayed += 1;
  emit({ type: "playLand", player, objectId: id as string, defId });
}

function flatTargets(t: Record<string, string[]>): string[] {
  return Object.values(t).flat();
}

/** Le sort vu comme un objet, pour les filtres (« les sorts de Dragon que vous lancez… »). */
export function spellView(d: CardDef, player: PlayerId): LkiSnapshot {
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
export function spellReduction(s: GameState, player: PlayerId, d: CardDef, targets?: Record<string, string[]>): number {
  let r = 0;
  const own = d.costReduction;
  const cond = own?.condition;
  let ok = !cond;
  if (cond?.kind === "targetMatches") {
    // « Ce sort coûte {3} de moins s'il cible une créature engagée » (Luminous Rebuke).
    const spec = modesOf(d)[0]?.targets.find((t) => t.id === cond.spec);
    const ids = targets ? (targets[cond.spec] ?? []) : spec ? legalTargets(s, player, spec) : [];
    ok = ids.some((id) => matchesObjectFilter(s, player, id, cond.filter));
  } else if (cond) ok = checkCondition(s, cond, player);
  if (own && ok) {
    r += evalAmount(
      s,
      {
        controller: player,
        sourceId: "",
        sourceDefId: d.id,
        sourceSnapshot: { keywords: [], power: 0 },
        targets: {},
        x: 0,
        kicked: false,
      },
      own.generic,
    );
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

/** Coût total d'un sort : coût de base, de flashback ou alternatif (ou rien), X, kicker, réductions. */
export function spellCost(
  s: GameState,
  player: PlayerId,
  d: CardDef,
  opts: {
    x?: number;
    kicked?: boolean;
    flashback?: boolean;
    /** Sans payer le coût de mana (118.9) : X vaut 0, le kicker reste payable. */
    free?: boolean;
    /** Coût alternatif de la carte (Blasphemous Edict). */
    alternative?: boolean;
    /** Du mana de n'importe quel type peut être dépensé : les symboles colorés deviennent génériques. */
    anyMana?: boolean;
    /** Cibles choisies (réduction « si ce sort cible… ») ; absentes : on suppose la cible la plus favorable. */
    targets?: Record<string, string[]>;
  },
): ManaCost {
  const empty: ManaCost = { generic: 0, colored: {}, x: 0 };
  const base = opts.free
    ? empty
    : opts.alternative && d.altCost
      ? d.altCost.mana
      : opts.flashback
        ? (d.flashback ?? d.manaCost)
        : d.manaCost;
  const cost = totalCost(
    base,
    opts.free ? 0 : (opts.x ?? 0),
    opts.kicked ? d.kicker : undefined,
    opts.free ? 0 : spellReduction(s, player, d, opts.targets),
  );
  if (!opts.anyMana) return cost;
  const colored = Object.values(cost.colored).reduce<number>((n, k) => n + (k ?? 0), 0) + (cost.hybrid?.length ?? 0);
  return { generic: cost.generic + colored, colored: {}, x: 0 };
}

/** Conditions de lancement d'une carte depuis sa zone actuelle. */
export interface CastTerms {
  source: "hand" | "graveyard" | "exile" | "flashback" | "library";
  /** Doit être lancée sans payer son coût de mana (Etali). */
  free?: boolean;
  /** Peut être lancée sans payer son coût de mana, au choix (Omniscience). */
  freeOptional?: boolean;
  /** Ignore les restrictions de timing (Etali : lancée pendant la résolution, approximation). */
  anyTime?: boolean;
  /** Du mana de n'importe quel type peut être dépensé (Tinybones). */
  anyMana?: boolean;
  /** Muldrotha : type de permanent utilisé. */
  graveyardType?: string;
  /** Quilled Greatwurm : marqueurs à retirer parmi vos créatures. */
  removeCounters?: number;
}

/** D'où, et à quelles conditions, ce joueur peut-il lancer cette carte ? */
/** 702.61 : un sort avec le second partagé est sur la pile — seules les capacités de mana restent possibles. */
export function splitSecondOnStack(s: GameState): boolean {
  return s.stack.some((item) => {
    if (item.kind !== "spell") return false;
    const d = s.defs[item.sourceDefId];
    const instantOrSorcery = !!d && (d.types.includes("Instant") || d.types.includes("Sorcery"));
    return instantOrSorcery && playerStatic(s, item.controller, "splitSecondInstantsSorceries");
  });
}

export function castTerms(s: GameState, player: PlayerId, card: ObjectId): CastTerms | null {
  const o = s.objects[card];
  if (!o) return null;
  const d = s.defs[o.defId];
  if (!d) return null;
  if (d.castCondition && !checkCondition(s, d.castCondition, player, card)) return null;
  if (o.zone === "hand") {
    if (o.owner !== player) return null;
    const free = controlledAbilities(s, player).some((ab) => ab.kind === "castPermission" && ab.freeFromHand);
    return { source: "hand", freeOptional: free || undefined };
  }
  if (o.zone === "graveyard") {
    if (o.owner !== player) return null;
    if (s.turn.mayCastFromGraveyard?.includes(card)) return { source: "graveyard" };
    if (d.flashback || s.turn.flashbackGranted?.includes(card)) return { source: "flashback" };
    const t = graveyardTypeAvailable(s, player, card);
    if (t && t !== "Land") return { source: "graveyard", graveyardType: t };
    if (d.graveyardCastRemoveCounters && countersAmongCreatures(s, player) >= d.graveyardCastRemoveCounters) {
      return { source: "graveyard", removeCounters: d.graveyardCastRemoveCounters };
    }
    return null;
  }
  if (o.zone === "library") {
    // Vizier of the Menagerie : créatures du dessus de votre bibliothèque, mana de n'importe quel type.
    const top = s.players[o.owner]?.library[0];
    if (o.owner === player && top === card && d.types.includes("Creature") && playerStatic(s, player, "castCreaturesFromTop")) {
      return { source: "library", anyMana: true };
    }
    return null;
  }
  if (o.zone === "exile") {
    const perm = exilePermission(s, player, card);
    if (perm) return { source: "exile", free: perm.free, anyTime: perm.anyTime };
    // Tinybones : cartes d'adversaires exilées avec un marqueur de butin, pendant votre tour.
    if (
      o.owner !== player &&
      (o.counters.stash ?? 0) > 0 &&
      s.turn.active === player &&
      controlledAbilities(s, player).some((ab) => ab.kind === "castPermission" && ab.stash)
    ) {
      return { source: "exile", anyMana: true };
    }
  }
  return null;
}

/** D'où ce sort peut-il être lancé par ce joueur ? */
export function castSource(s: GameState, player: PlayerId, card: ObjectId): CastTerms["source"] | null {
  return castTerms(s, player, card)?.source ?? null;
}

/** Marqueurs (tous types) sur les créatures que ce joueur contrôle. */
function countersAmongCreatures(s: GameState, player: PlayerId): number {
  return s.battlefield
    .filter((id) => obj(s, id).controller === player && isCreature(s, id))
    .reduce((n, id) => n + Object.values(obj(s, id).counters).reduce((a, b) => a + Math.max(0, b), 0), 0);
}

/** Retire N marqueurs parmi les créatures du joueur (les plus chargées d'abord ; approximation : sans choix). */
function removeCountersAmongCreatures(s: GameState, player: PlayerId, n: number): void {
  let left = n;
  const ids = s.battlefield
    .filter((id) => obj(s, id).controller === player && isCreature(s, id))
    .sort((a, b) => countersOf(s, b) - countersOf(s, a));
  for (const id of ids) {
    const o = obj(s, id);
    for (const [kind, k] of Object.entries(o.counters)) {
      if (left <= 0) return;
      const take = Math.min(k, left);
      if (take > 0) {
        changeCounters(s, o, kind, -take);
        left -= take;
      }
    }
  }
}

function countersOf(s: GameState, id: ObjectId): number {
  return Object.values(obj(s, id).counters).reduce((a, b) => a + Math.max(0, b), 0);
}

/** Options des coûts additionnels (cartes à défausser, permanents à sacrifier), ou null s'ils sont impayables. */
export function additionalOptions(
  s: GameState,
  player: PlayerId,
  card: ObjectId,
  d: CardDef,
): {
  discard?: { count: number; options: ObjectId[] };
  sacrifice?: { count: number; options: ObjectId[]; orPay?: ManaCost; orPayAffordable?: boolean };
} | null {
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
    // « Sacrifiez une créature ou payez {3}{B} » : sans créature, il reste l'option de payer.
    if (options.length < add.sacrifice.count && !add.sacrifice.orPay) return null;
    out.sacrifice = { count: add.sacrifice.count, options, orPay: add.sacrifice.orPay };
  }
  return out;
}

export function castSpell(s: GameState, player: PlayerId, card: ObjectId, choices: CastChoices): void {
  const terms = castTerms(s, player, card);
  if (!terms) throw new RulesError("Vous ne pouvez pas lancer cette carte d'ici");
  const o = obj(s, card);
  const d = s.defs[o.defId];
  if (!d || d.types.includes("Land")) throw new RulesError("Ce n'est pas un sort");
  if (!d.implemented) throw new RulesError(`${d.name} n'est pas encore géré par le moteur`);
  if (splitSecondOnStack(s)) throw new RulesError("Un sort avec le second partagé est sur la pile");
  // Harbinger of the Tides : « comme s'il avait le flash si vous payez {2} de plus ».
  const flashExtra = !terms.anyTime && !canCastTiming(s, player, d) ? d.flashExtraCost : undefined;
  if (!terms.anyTime && !canCastTiming(s, player, d) && !flashExtra)
    throw new RulesError("Vous ne pouvez pas lancer ce sort maintenant");
  const flashback = terms.source === "flashback";
  const free = !!terms.free || (!!choices.free && !!terms.freeOptional);
  if (choices.free && !free) throw new RulesError("Ce sort ne peut pas être lancé sans payer son coût");
  const alternative = !!choices.alternative && !free;
  if (alternative && !(d.altCost && checkCondition(s, d.altCost.condition, player))) {
    throw new RulesError("Coût alternatif indisponible");
  }
  const modes = modesOf(d);
  const modeIndex = choices.mode ?? 0;
  const mode = modes[modeIndex];
  if (!mode) throw new RulesError("Mode invalide");
  const targets = validateTargets(s, player, mode.targets, choices.targets, { kicked: !!choices.kicked, sourceId: card });
  const hasX = !free && !!(flashback ? (d.flashback ?? d.manaCost)?.x : d.manaCost?.x);
  const x = hasX ? Math.max(0, Math.floor(choices.x ?? 0)) : 0;
  const kicked = !!choices.kicked && !!d.kicker;

  // Coûts additionnels : vérifiés avant tout changement d'état.
  const opts = additionalOptions(s, player, card, d);
  if (!opts) throw new RulesError("Impossible de payer le coût additionnel");
  const discard = choices.discard ?? [];
  const sacrifice = choices.sacrifice ?? [];
  const check = (chosen: ObjectId[], spec?: { count: number; options: ObjectId[]; orPay?: ManaCost }) => {
    const need = spec?.count ?? 0;
    if (spec?.orPay && chosen.length === 0) return; // on paiera le mana à la place
    if (chosen.length !== need || new Set(chosen).size !== need || chosen.some((id) => !spec?.options.includes(id))) {
      throw new RulesError("Choix du coût additionnel invalide");
    }
  };
  check(discard, opts.discard);
  check(sacrifice, opts.sacrifice);
  let cost = spellCost(s, player, d, { x, kicked, flashback, free, alternative, anyMana: terms.anyMana, targets });
  if (opts.sacrifice?.orPay && sacrifice.length === 0) cost = addCosts(cost, opts.sacrifice.orPay);
  if (flashExtra) cost = addCosts(cost, flashExtra);

  // 601.2a : le sort passe sur la pile (nouvel objet), puis on paie les coûts (601.2g–h).
  if (terms.graveyardType) s.turn.graveyardTypesUsed = [...(s.turn.graveyardTypesUsed ?? []), terms.graveyardType];
  if (terms.removeCounters) removeCountersAmongCreatures(s, player, terms.removeCounters);
  const view = spellView(d, player);
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
    fromHand: terms.source === "hand" || undefined,
  };
  s.stack.push(item);
  try {
    const used = payMana(s, player, cost, undefined, { spell: view, convoke: d.keywords.includes("convoke") });
    // Effets associés au mana dépensé, si ce sort correspond (Carnelian Orb, Pyromancer's Goggles).
    const riders = used.flatMap((ab) => (ab.rider && matchesView(view, ab.rider.spell, player) ? [ab.rider.effect] : []));
    if (riders.length) item.riders = riders;
  } catch {
    throw new RulesError("Mana insuffisant");
  }
  // Pyromancer's Goggles : « copiez ce sort ».
  for (const r of item.riders ?? []) if (r === "copy") copySpellItem(s, item, player);
  // Teach by Example : « la prochaine fois que vous lancez un éphémère ou un rituel ce tour-ci, copiez-le ».
  if (d.types.includes("Instant") || d.types.includes("Sorcery")) {
    const pending = (s.nextSpellCopies ?? []).filter((x) => x.player === player && x.turn === s.turn.number);
    for (const _ of pending) copySpellItem(s, item, player);
    if (pending.length) s.nextSpellCopies = (s.nextSpellCopies ?? []).filter((x) => !pending.includes(x));
  }
  if (discard.length) {
    emit({ type: "discard", player, defIds: discard.map((id) => obj(s, id).defId) });
    for (const id of discard) announceDiscard(s, player, moveObject(s, id, "graveyard"));
  }
  for (const id of sacrifice) putIntoGraveyard(s, id);
  s.priority.passes = 0;
  emit({ type: "cast", player, stackId, defId: d.id, targets: flatTargets(targets) });
  const caster = s.players[player];
  const instantOrSorcery = d.types.includes("Instant") || d.types.includes("Sorcery");
  const before = caster?.turnStats.instantSorceryCast ?? 0;
  if (caster) {
    caster.turnStats.spellsCast += 1;
    if (instantOrSorcery) caster.turnStats.instantSorceryCast += 1;
    if (!d.types.includes("Creature")) caster.turnStats.noncreatureCast += 1;
  }
  rulesEvent(s, { e: "cast", player, stackId, instantSorceryBefore: instantOrSorcery ? before : undefined });
  announceTargets(s, stackId, player, targets);
}

/** Copie d'un sort sur la pile (707.10), mêmes choix et mêmes cibles. */
export function copySpellItem(s: GameState, item: StackItem, controller: PlayerId): void {
  const copyId = newId(s, "copy");
  s.stack.push({
    ...item,
    id: copyId,
    sourceId: copyId,
    controller,
    copy: true,
    riders: undefined,
    targets: { ...item.targets },
  });
  emit({ type: "copy", stackId: copyId, defId: item.sourceDefId, player: controller });
}

/** Somme de deux coûts de mana. */
function addCosts(a: ManaCost, b: ManaCost): ManaCost {
  const colored = { ...a.colored };
  for (const [k, n] of Object.entries(b.colored)) colored[k as ManaType] = (colored[k as ManaType] ?? 0) + (n ?? 0);
  return { generic: a.generic + b.generic, colored, x: a.x, hybrid: [...(a.hybrid ?? []), ...(b.hybrid ?? [])] };
}

/** Choix « en arrivant » fait pendant la résolution (voir l'effet chooseOnEnter). */
function chosenFrom(vars: Record<string, ChoiceValue[]>): GameObject["chosen"] {
  const [kind, value] = (vars.$chosen ?? []).map(String);
  if (!kind || !value) return undefined;
  if (kind === "cardName") return { cardName: value };
  return kind === "color" ? { color: value as Color } : { creatureType: value };
}

/** Signale les cibles d'un élément mis sur la pile (garde, « devient la cible »). */
export function announceTargets(s: GameState, stackId: string, controller: PlayerId, targets: Record<string, string[]>): void {
  const all = flatTargets(targets);
  if (all.length) rulesEvent(s, { e: "targeted", stackId, controller, targets: all });
}

/** 701.5 : contrecarre l'élément de pile ; un sort contrecarré va au cimetière (exil s'il a été lancé en flashback). */
export function counterItem(s: GameState, id: string, by: string): boolean {
  const i = s.stack.findIndex((x) => x.id === id);
  const item = s.stack[i];
  if (!item || s.resolving?.item.id === id) return false;
  if (item.kind === "spell" && s.defs[item.sourceDefId]?.cantBeCountered) return false;
  // Sphinx of the Final Word : « les éphémères et rituels que vous contrôlez ne peuvent pas être contrecarrés ».
  const types = s.defs[item.sourceDefId]?.types ?? [];
  if (
    item.kind === "spell" &&
    (types.includes("Instant") || types.includes("Sorcery")) &&
    playerStatic(s, item.controller, "protectSpells")
  ) {
    return false;
  }
  s.stack.splice(i, 1);
  emit({ type: "countered", stackId: item.id, defId: item.sourceDefId, by });
  // Dernières informations connues (« son contrôleur crée… »).
  if (item.kind === "spell" && s.objects[item.sourceId]) s.lki[item.id] = snapshot(s, item.sourceId);
  if (item.kind === "spell" && s.objects[item.sourceId]) moveObject(s, item.sourceId, item.flashback ? "exile" : "graveyard");
  return true;
}

/** Capacités d'un objet : calculées par les couches sur le champ de bataille (accordées, perdues), imprimées ailleurs. */
export function abilitiesOf(s: GameState, id: ObjectId): CardDef["abilities"] {
  const o = s.objects[id];
  if (!o) return [];
  return o.zone === "battlefield" ? chars(s, id).abilities : (s.defs[o.defId]?.abilities ?? []);
}

export function activatedAbility(s: GameState, source: ObjectId, index: number): ActivatedAbilityDef | null {
  const ab = abilitiesOf(s, source)[index];
  return ab?.kind === "activated" ? ab : null;
}

/** Permanents qui peuvent être sacrifiés pour le coût de la capacité (hors source). */
export function sacrificeOptions(s: GameState, player: PlayerId, source: ObjectId, ab: ActivatedAbilityDef): ObjectId[] {
  const f = ab.cost.sacrifice?.filter;
  if (!f) return [];
  return s.battlefield.filter(
    (id) => id !== source && obj(s, id).controller === player && matchesObjectFilter(s, player, id, f, source),
  );
}

function tapOthersOptions(s: GameState, player: PlayerId, source: ObjectId, ab: ActivatedAbilityDef): ObjectId[] {
  const f = ab.cost.tapOthers?.filter;
  if (!f) return [];
  return s.battlefield.filter(
    (id) =>
      id !== source && obj(s, id).controller === player && !obj(s, id).tapped && matchesObjectFilter(s, player, id, f, source),
  );
}

/** Équipage N : créatures dégagées (autres que la source) de force totale N ou plus, les plus faibles d'abord. */
function crewOptions(s: GameState, player: PlayerId, source: ObjectId, n: number): ObjectId[] | null {
  const ids = s.battlefield
    .filter((id) => id !== source && obj(s, id).controller === player && !obj(s, id).tapped && isCreature(s, id))
    .sort((a, b) => chars(s, a).power - chars(s, b).power);
  const out: ObjectId[] = [];
  let total = 0;
  for (const id of ids) {
    if (total >= n) break;
    out.push(id);
    total += Math.max(0, chars(s, id).power);
  }
  return total >= n ? out : null;
}

/** Une source dont le nom a été choisi par un Sorcerous Spyglass. */
function spyglassed(s: GameState, source: ObjectId): boolean {
  const name = s.objects[source] && chars(s, source).name;
  return s.battlefield.some((id) => {
    const o = obj(s, id);
    return o.chosen?.cardName === name && s.defs[o.defId]?.chooseOnEnter === "cardName";
  });
}

/** Zone d'où s'active une capacité : champ de bataille, cimetière ou main. */
export function abilityZone(ab: ActivatedAbilityDef): "battlefield" | "graveyard" | "hand" {
  return ab.fromGraveyard ? "graveyard" : ab.fromHand ? "hand" : "battlefield";
}

/** Les coûts non-mana de la capacité peuvent-ils être payés ? */
export function canPayNonManaCost(s: GameState, source: ObjectId, ab: ActivatedAbilityDef, index = -1): boolean {
  const o = s.objects[source];
  if (!o || o.zone !== abilityZone(ab)) return false;
  if (ab.once && o.used?.includes(index)) return false;
  if (ab.oncePerTurn && o.activatedTurn?.[index] === s.turn.number) return false;
  const who = abilityZone(ab) !== "battlefield" ? o.owner : o.controller;
  if (ab.activationCondition && !checkCondition(s, ab.activationCondition, who, source)) return false;
  // Sorcerous Spyglass : les capacités (non de mana) des sources du nom choisi ne peuvent pas être activées.
  if (spyglassed(s, source)) return false;
  if (ab.cost.crew !== undefined && crewOptions(s, who, source, ab.cost.crew) === null) return false;
  if (ab.cost.tap && (o.tapped || isSummoningSick(s, source))) return false;
  // 606.3 : une seule capacité de loyauté par planeswalker et par tour ; on ne peut pas retirer plus que sa loyauté.
  if (ab.cost.loyalty !== undefined) {
    if (o.loyaltyTurn === s.turn.number) return false;
    if (ab.cost.loyalty < 0 && (o.counters.loyalty ?? 0) < -ab.cost.loyalty) return false;
  }
  if (ab.cost.tapAttached) {
    const host = o.attachedTo;
    if (!host || !onBattlefield(s, host) || obj(s, host).tapped || isSummoningSick(s, host)) return false;
  }
  const player = abilityZone(ab) !== "battlefield" ? o.owner : o.controller;
  if (ab.cost.removeCounters && (o.counters[ab.cost.removeCounters.kind] ?? 0) < ab.cost.removeCounters.n) return false;
  if (ab.cost.payLife && (s.players[player]?.life ?? 0) < ab.cost.payLife) return false;
  if (ab.cost.sacrifice && sacrificeOptions(s, player, source, ab).length < ab.cost.sacrifice.count) return false;
  if (ab.cost.tapOthers && tapOthersOptions(s, player, source, ab).length < ab.cost.tapOthers.count) return false;
  return true;
}

export function activateAbility(s: GameState, player: PlayerId, source: ObjectId, index: number, choices: CastChoices): void {
  const o = s.objects[source];
  const ab = activatedAbility(s, source, index);
  if (!ab || !o) throw new RulesError("Capacité inconnue");
  const zone = abilityZone(ab);
  if (o.zone !== zone || (zone === "battlefield" ? o.controller : o.owner) !== player) {
    throw new RulesError("Vous ne contrôlez pas ce permanent");
  }
  if (
    ab.sorcerySpeed &&
    !(s.turn.active === player && (s.turn.step === "main1" || s.turn.step === "main2") && s.stack.length === 0)
  ) {
    throw new RulesError("Cette capacité s'active seulement en rituel");
  }
  if (!canPayNonManaCost(s, source, ab, index)) throw new RulesError("Impossible de payer le coût");
  if (splitSecondOnStack(s)) throw new RulesError("Un sort avec le second partagé est sur la pile");
  let sacrificed: ObjectId[] = [];
  if (ab.cost.sacrifice) {
    const options = sacrificeOptions(s, player, source, ab);
    sacrificed = choices.sacrifice ?? options.slice(0, ab.cost.sacrifice.count);
    if (sacrificed.length !== ab.cost.sacrifice.count || sacrificed.some((id) => !options.includes(id))) {
      throw new RulesError("Sacrifice invalide");
    }
  }
  const targets = validateTargets(s, player, ab.targets, choices.targets, { sourceId: source });
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
    // Capacité accordée (pas dans la définition imprimée) : ses effets voyagent avec elle.
    inline: s.defs[o.defId]?.abilities[index] === ab ? undefined : { targets: ab.targets, effects: ab.effects, label: ab.label },
  };
  s.stack.push(item);
  // Coûts : mana (sans engager la source si elle doit s'engager pour le coût), puis {T}, puis sacrifice.
  // Les permanents choisis pour d'autres coûts (sacrifier, engager, équipage) ne servent pas à payer le mana.
  const tapOthers = ab.cost.tapOthers ? tapOthersOptions(s, player, source, ab).slice(0, ab.cost.tapOthers.count) : [];
  const crew = ab.cost.crew !== undefined ? (crewOptions(s, player, source, ab.cost.crew) ?? []) : [];
  if (ab.cost.mana) {
    const reserved = new Set([...sacrificed, ...tapOthers, ...crew, ...(ab.cost.tap ? [source] : [])]);
    try {
      payMana(s, player, totalCost(ab.cost.mana, x), reserved, { abilitySource: source });
    } catch {
      throw new RulesError("Mana insuffisant");
    }
  }
  if (ab.cost.tap) tapObject(s, o);
  if (ab.cost.tapAttached && o.attachedTo) tapObject(s, obj(s, o.attachedTo));
  if (ab.cost.loyalty !== undefined) {
    o.loyaltyTurn = s.turn.number;
    if (ab.cost.loyalty !== 0) changeCounters(s, o, "loyalty", ab.cost.loyalty);
  }
  if (ab.once) o.used = [...(o.used ?? []), index];
  if (ab.oncePerTurn) o.activatedTurn = { ...(o.activatedTurn ?? {}), [index]: s.turn.number };
  if (ab.cost.addCounters) changeCounters(s, o, ab.cost.addCounters.kind, ab.cost.addCounters.n);
  for (const id of crew) tapObject(s, obj(s, id));
  if (ab.cost.removeCounters) changeCounters(s, o, ab.cost.removeCounters.kind, -ab.cost.removeCounters.n);
  if (ab.cost.payLife) loseLife(s, player, ab.cost.payLife);
  for (const id of tapOthers) tapObject(s, obj(s, id));
  // Les permanents sacrifiés restent consultables (dernières informations connues : « sa endurance »).
  item.sacrificed = sacrificed.length ? [...sacrificed] : undefined;
  for (const id of sacrificed) putIntoGraveyard(s, id);
  if (ab.cost.sacrificeSelf) putIntoGraveyard(s, source);
  if (ab.cost.exileSelf) moveObject(s, source, "exile");
  if (ab.cost.discardSelf) announceDiscard(s, player, moveObject(s, source, "graveyard"));
  if (ab.cost.bounceSelf) moveObject(s, source, "hand");
  s.priority.passes = 0;
  emit({ type: "activate", player, stackId: item.id, defId: o.defId, targets: flatTargets(targets) });
  announceTargets(s, item.id, player, targets);
}

/** Mots « cible » d'un élément de pile (Bolt Bend). */
export function stackItemSpecs(s: GameState, item: StackItem): TargetSpec[] {
  return specsAndEffects(s, item).specs;
}

function specsAndEffects(s: GameState, item: StackItem): { specs: TargetSpec[]; effects: Effect[] } {
  const d = s.defs[item.sourceDefId];
  if (!d) return { specs: [], effects: [] };
  if (item.kind === "spell") {
    const mode = modesOf(d)[item.mode];
    const effects = mode?.effects ?? [];
    // 614.12 : « en arrivant, choisissez… » — le choix se fait pendant la résolution du sort de permanent.
    if (d.chooseOnEnter && isPermanentCard(d) && !item.copy) {
      return { specs: mode?.targets ?? [], effects: [...effects, { op: "chooseOnEnter", kind: d.chooseOnEnter }] };
    }
    return { specs: mode?.targets ?? [], effects };
  }
  // Capacité retardée, réflexive ou accordée : ses effets voyagent avec elle.
  if (item.inline) return { specs: item.inline.targets, effects: item.inline.effects };
  const ab = d.abilities[item.abilityIndex];
  if (ab?.kind === "triggered") {
    // 603.4 : la condition d'une capacité « si… » est vérifiée à nouveau à la résolution.
    if (ab.condition && !checkCondition(s, ab.condition, item.controller, item.sourceId)) return { specs: [], effects: [] };
    if (ab.modes) {
      const mode = ab.modes[item.mode];
      return { specs: mode?.targets ?? [], effects: mode?.effects ?? [] };
    }
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
  // Références figées d'une capacité retardée (`bind`) : conservées telles quelles, ce ne sont pas des cibles.
  const legal: Record<string, string[]> = { ...(item.inline?.bound ?? {}) };
  let chosen = 0;
  let stillLegal = 0;
  for (const spec of specs) {
    const ids = item.targets[spec.id] ?? [];
    chosen += ids.length;
    legal[spec.id] = ids.filter((id) => isLegalTarget(s, item.controller, spec, id, item.sourceId));
    stillLegal += legal[spec.id]?.length ?? 0;
  }
  if (chosen > 0 && stillLegal === 0) {
    s.stack.pop();
    emit({ type: "fizzle", stackId: item.id, defId: item.sourceDefId });
    if (item.kind === "spell" && s.objects[item.sourceId]) moveObject(s, item.sourceId, item.flashback ? "exile" : "graveyard");
    return true;
  }

  emit({ type: "resolve", stackId: item.id, defId: item.sourceDefId });
  s.resolving = {
    item,
    effects,
    pc: 0,
    controller: item.controller,
    targets: legal,
    // Capacité retardée : valeurs figées à sa création.
    vars: { ...(item.inline?.vars ?? {}) },
    awaiting: null,
  };
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
  finishResolution(s, r.item, r.targets, r.vars);
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

function finishResolution(
  s: GameState,
  item: StackItem,
  targets: Record<string, string[]>,
  vars: Record<string, ChoiceValue[]> = {},
): void {
  const i = s.stack.findIndex((x) => x.id === item.id);
  if (i >= 0) s.stack.splice(i, 1);
  if (item.kind === "spell" && s.objects[item.sourceId]) {
    const d = s.defs[item.sourceDefId];
    if (d && isPermanentCard(d)) {
      // 303.4f : une Aura arrive attachée à l'objet qu'elle ciblait.
      moveObject(s, item.sourceId, "battlefield", {
        controller: item.controller,
        enters: {
          x: item.x,
          kicked: item.kicked,
          cast: true,
          castFromHand: item.fromHand,
          attachTo: d.enchant ? targets[ENCHANT_SPEC]?.[0] : undefined,
          chosen: chosenFrom(vars),
        },
      });
      // Carnelian Orb : « il acquiert la célérité jusqu'à la fin du tour ».
      const entered = s.battlefield[s.battlefield.length - 1];
      if (item.riders?.includes("haste") && entered) {
        bump(s);
        s.effects.push({
          id: newId(s, "e"),
          timestamp: nextTimestamp(s),
          affected: [entered],
          addKeywords: ["haste"],
          duration: "endOfTurn",
        });
      }
    } else moveObject(s, item.sourceId, item.flashback ? "exile" : "graveyard");
  }
}
