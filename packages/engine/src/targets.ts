/**
 * Légalité des cibles (règle 115).
 */
import { RulesError } from "./errors";
import { chars, hasKeyword, snapshot } from "./layers";
import { obj } from "./state";
import { playerStatic } from "./statics";
import type { CardType, Color, GameState, LkiSnapshot, ObjectFilter, ObjectId, PlayerId, TargetSpec } from "./types";

/**
 * Vue d'une source (sort, source d'une capacité ou de blessures) : l'objet, ses dernières informations connues, sinon
 * la carte imprimée.
 */
export function sourceView(s: GameState, id?: ObjectId, defId?: string, controller?: PlayerId): LkiSnapshot | undefined {
  if (id && s.objects[id]) return snapshot(s, id);
  if (id && s.lki[id]) return s.lki[id];
  const d = defId ? s.defs[defId] : undefined;
  if (!d || !controller) return undefined;
  return {
    id: id ?? "",
    defId: d.id,
    owner: controller,
    controller,
    types: d.types,
    subtypes: d.subtypes,
    supertypes: d.supertypes,
    colors: d.colors,
    power: d.power ?? 0,
    toughness: d.toughness ?? 0,
    keywords: d.keywords,
    isToken: !!d.isToken,
    name: d.name,
  } as LkiSnapshot;
}

/**
 * Protection et défense talismanique « contre [filtre] » (702.16, 702.11d ; R4.2) : l'objet `id` est-il protégé de
 * cette source ? Une défense talismanique ne compte que pour le ciblage par un adversaire (`targetedByOpponent`).
 * Sans vue de la source, seule la protection contre tout (filtre vide) s'applique.
 */
export function protectedFrom(s: GameState, id: ObjectId, source: LkiSnapshot | undefined, targetedByOpponent = false): boolean {
  const o = s.objects[id];
  if (o?.zone !== "battlefield") return false;
  for (const r of chars(s, id).protections) {
    if (r.hexproofOnly && !targetedByOpponent) continue;
    if (source ? matchesView(source, r.from, o.controller, id) : Object.keys(r.from).length === 0) return true;
  }
  return false;
}

const PERMANENT_TYPES: readonly CardType[] = ["Artifact", "Creature", "Enchantment", "Land", "Planeswalker", "Battle"];

/** Le filtre s'applique-t-il à ces caractéristiques (objet vivant ou dernières informations connues) ? */
/** Marqueurs (d'une sorte donnée, ou de toute sorte) mis par ce joueur, d'après les entrées « joueur|sorte ». */
export function countersPutBy(entries: string[] | undefined, player: PlayerId, kind: boolean | string): boolean {
  return !!entries?.some((x) => (kind === true ? x.startsWith(`${player}|`) : x === `${player}|${kind}`));
}

export function matchesView(v: LkiSnapshot, f: ObjectFilter, perspective: PlayerId, sourceId?: ObjectId): boolean {
  if (f.types && !f.types.some((t) => v.types.includes(t))) return false;
  if (f.notTypes?.some((t) => v.types.includes(t))) return false;
  if (f.subtype && !hasSubtype(v, f.subtype)) return false;
  if (f.controller === "you" && v.controller !== perspective) return false;
  if (f.controller === "opponent" && v.controller === perspective) return false;
  if (f.keyword && !v.keywords.includes(f.keyword)) return false;
  if (f.notKeyword && v.keywords.includes(f.notKeyword)) return false;
  if (f.other && v.id === sourceId) return false;
  if (f.self && v.id !== sourceId) return false;
  if (f.nontoken && v.isToken) return false;
  // Kid Loki : « chaque créature sur laquelle vous avez mis des marqueurs +1/+1 ce tour-ci ».
  if (f.countersPutByYouThisTurn && !countersPutBy(v.countersPutThisTurn, perspective, f.countersPutByYouThisTurn)) return false;
  // Un sort (vue de `spellView`) ; pour un objet, `matchesObjectFilter` lit sa définition.
  if (f.adventure !== undefined && !v.id && !!v.adventure !== f.adventure) return false;
  if (f.hasX !== undefined && !!v.hasX !== f.hasX) return false;
  if (f.suspected !== undefined && !!v.suspected !== f.suspected) return false;
  if (f.minPower !== undefined && v.power < f.minPower) return false;
  if (f.attacking !== undefined && !!v.attacking !== f.attacking) return false;
  if (f.maxManaValue !== undefined && (v.manaValue ?? 0) > f.maxManaValue) return false;
  if (f.manaValue !== undefined && (v.manaValue ?? 0) !== f.manaValue) return false;
  if (f.name && v.name !== f.name) return false;
  if (f.tapped !== undefined && !!v.tapped !== f.tapped) return false;
  if (f.equipped !== undefined && !!v.equipped !== f.equipped) return false;
  if (f.attachedToSelf && (!sourceId || v.attachedTo !== sourceId)) return false;
  if (f.enchanted !== undefined) {
    const by = v.enchantedBy ?? [];
    if (f.enchanted === "byYou" ? !by.includes(perspective) : by.length > 0 !== f.enchanted) return false;
  }
  if (f.wasAttachedToSource && !(sourceId && v.lastAttachedTo === sourceId && !v.attachedTo)) return false;
  if (f.crewedBySource && !(sourceId && v.crewedByThisTurn?.includes(sourceId))) return false;
  if (f.colors && !f.colors.some((c) => v.colors.includes(c))) return false;
  // « avec un marqueur » : `any` accepte n'importe quel type de marqueur.
  if (f.withCounter === "any" && !Object.values(v.counters ?? {}).some((n) => n > 0)) return false;
  if (f.noCounters && Object.values(v.counters ?? {}).some((n) => n > 0)) return false;
  if (f.withCounter && f.withCounter !== "any" && !((v.counters?.[f.withCounter] ?? 0) > 0)) return false;
  if (f.inCombat && !v.attacking && !v.blocking) return false;
  if (f.cast !== undefined && !!v.cast !== f.cast) return false;
  if (f.anySubtype && !f.anySubtype.some((t) => hasSubtype(v, t))) return false;
  if (f.notSubtype && hasSubtype(v, f.notSubtype)) return false;
  if (f.token !== undefined && v.isToken !== f.token) return false;
  if (f.minToughness !== undefined && v.toughness < f.minToughness) return false;
  if (f.nonbasic && v.supertypes.includes("Basic")) return false;
  if (f.damagedBySource && !(sourceId && v.damagedBy?.includes(sourceId))) return false;
  if (f.minManaValue !== undefined && (v.manaValue ?? 0) < f.minManaValue) return false;
  if (f.maxPower !== undefined && v.power > f.maxPower) return false;
  if (f.basic && !v.supertypes.includes("Basic")) return false;
  if (f.permanent && !v.types.some((t) => PERMANENT_TYPES.includes(t))) return false;
  if (f.nonland && v.types.includes("Land")) return false;
  if (f.anyOf && !f.anyOf.some((g) => matchesView(v, g, perspective, sourceId))) return false;
  if (f.legendary !== undefined && v.supertypes.includes("Legendary") !== f.legendary) return false;
  if (f.maxToughness !== undefined && v.toughness > f.maxToughness) return false;
  if (f.toughnessAbovePower && !(v.toughness > v.power)) return false;
  if (f.powerAboveBase && !(v.power > (v.basePower ?? v.power))) return false;
  if (f.withActivatedAbility && !(v.abilities ?? []).some((a) => a.kind === "activated")) return false;
  if (f.manaValueParity && ((v.manaValue ?? 0) % 2 === 0) !== (f.manaValueParity === "even")) return false;
  if (f.noManaSpent && (v.manaSpent ?? 0) > 0) return false;
  if (f.notOwned && v.owner === v.controller) return false;
  if (f.noneOfSubtypes && (v.subtypes.includes(ALL_CREATURE_TYPES) || f.noneOfSubtypes.some((t) => v.subtypes.includes(t))))
    return false;
  if (f.preparedSpell !== undefined && !!v.preparedSpell !== f.preparedSpell) return false;
  if (f.prepared !== undefined && !!v.prepared !== f.prepared) return false;
  if (f.warped !== undefined && !!v.warped !== f.warped) return false;
  if (f.blocking !== undefined && !!v.blocking !== f.blocking) return false;
  if (f.multicolored !== undefined && v.colors.length >= 2 !== f.multicolored) return false;
  if (f.colorCount !== undefined && v.colors.length !== f.colorCount) return false;
  if (f.not && matchesView(v, f.not, perspective, sourceId)) return false;
  if (f.manaSpentBelowValue && !((v.manaSpent ?? 0) < (v.manaValue ?? 0))) return false;
  if (f.damaged !== undefined && !!v.damaged !== f.damaged) return false;
  if (f.faceDown !== undefined && !!v.faceDown !== f.faceDown) return false;
  return true;
}

/** Marqueur de sous-type : « a tous les types de créature » (Soulstone Sanctuary). */
export const ALL_CREATURE_TYPES = "*";

/** Sous-types qui ne sont pas des types de créature (terrains, artefacts, enchantements). */
const NON_CREATURE_SUBTYPES = new Set([
  "Plains",
  "Island",
  "Swamp",
  "Mountain",
  "Forest",
  "Equipment",
  "Aura",
  "Treasure",
  "Food",
  "Clue",
  "Saga",
  "Vehicle",
]);

function hasSubtype(v: LkiSnapshot, t: string): boolean {
  if (v.subtypes.includes(t)) return true;
  // Changelin : tous les types de créature, dans toutes les zones (702.73a).
  if (v.keywords.includes("changeling") && !NON_CREATURE_SUBTYPES.has(t)) return true;
  return v.subtypes.includes(ALL_CREATURE_TYPES) && v.types.includes("Creature") && !NON_CREATURE_SUBTYPES.has(t);
}

/** Remplace « du type / de la couleur choisis » par le choix fait par la source en arrivant. */
export function withChosen(
  f: ObjectFilter,
  source:
    | { chosen?: { creatureType?: string; color?: Color; cardName?: string; parity?: "odd" | "even"; number?: number } }
    | undefined,
): ObjectFilter {
  if (!f.subtypeChosen && !f.colorChosen && !f.nameChosen && !f.parityChosen && !f.numberChosen) return f;
  const out: ObjectFilter = {
    ...f,
    subtypeChosen: undefined,
    colorChosen: undefined,
    nameChosen: undefined,
    parityChosen: undefined,
    numberChosen: undefined,
  };
  if (f.numberChosen) {
    // Sans choix, rien ne correspond (aucune valeur n'est négative).
    const n = source?.chosen?.number ?? -1;
    out.anyOf = [
      { manaValue: n },
      { types: ["Creature"], minPower: n, maxPower: n },
      { types: ["Creature"], minToughness: n, maxToughness: n },
    ];
  }
  if (f.parityChosen) out.manaValueParity = source?.chosen?.parity ?? "even";
  if (f.nameChosen) out.name = source?.chosen?.cardName ?? "—";
  // Sans choix (arrivée sans résolution), rien ne correspond.
  if (f.subtypeChosen) out.subtype = source?.chosen?.creatureType ?? "—";
  if (f.colorChosen) out.colors = source?.chosen?.color ? [source.chosen.color] : [];
  return out;
}

/** Force de la source (vivante, sinon dernière information connue). */
function sourcePower(s: GameState, sourceId?: ObjectId): number {
  if (!sourceId) return 0;
  if (s.objects[sourceId]?.zone === "battlefield") return chars(s, sourceId).power;
  return s.lki[sourceId]?.power ?? 0;
}

/** Remplace les bornes dynamiques du filtre par leur valeur actuelle. */
export function resolveFilter(s: GameState, f: ObjectFilter, sourceId?: ObjectId): ObjectFilter {
  // « Du type / de la couleur choisis » : le choix de la source (en jeu, sort qui se résout, sinon dernière information).
  if (f.subtypeChosen || f.colorChosen || f.nameChosen || f.parityChosen || f.numberChosen)
    f = withChosen(f, sourceId ? (s.objects[sourceId] ?? s.lki[sourceId]) : undefined);
  // Formation Breaker : « de force inférieure à celle de cette créature ».
  if (f.powerBelowSource) f = { ...f, powerBelowSource: undefined, maxPower: sourcePower(s, sourceId) - 1 };
  if (f.powerAboveSource) f = { ...f, powerAboveSource: undefined, minPower: sourcePower(s, sourceId) + 1 };
  if (f.maxManaValueColorsSpent) {
    const item = s.resolving?.item.id === sourceId ? s.resolving?.item : s.stack.find((x) => x.id === sourceId);
    const spent = item?.spentColors ?? (sourceId ? s.objects[sourceId]?.spentColors : undefined) ?? {};
    const n = (["W", "U", "B", "R", "G"] as const).filter((c) => (spent[c] ?? 0) > 0).length;
    f = { ...f, maxManaValueColorsSpent: undefined, maxManaValue: n };
  }
  if (f.maxManaValueX) {
    const x = (sourceId && s.objects[sourceId]?.castX) || 0;
    return { ...f, maxManaValueX: undefined, maxManaValue: x };
  }
  if (f.maxManaValueManaSpent) {
    // Sort de permanent en cours de résolution (Mockingbird) : le mana dépensé est sur l'élément de pile.
    const spent =
      (sourceId &&
        (s.objects[sourceId]?.manaSpent ?? s.lki[sourceId]?.manaSpent ?? s.stack.find((x) => x.id === sourceId)?.manaSpent)) ||
      0;
    return { ...f, maxManaValueManaSpent: undefined, maxManaValue: spent };
  }
  if (!f.maxManaValueSourcePower) return f;
  return { ...f, maxManaValueSourcePower: undefined, maxManaValue: sourcePower(s, sourceId) };
}

/** Filtre appliqué à une carte dans n'importe quelle zone (cimetière, bibliothèque, main…). */
export function matchesCard(s: GameState, controller: PlayerId, id: ObjectId, f: ObjectFilter, sourceId?: ObjectId): boolean {
  const o = s.objects[id];
  if (!o) return false;
  f = resolveFilter(s, f, sourceId);
  // « une autre carte » : la source morte est devenue une nouvelle carte du cimetière, reconnue par son identité
  // physique (Morcant's Loyalist : « renvoyez une autre carte d'Elfe ciblée »).
  if (f.other && sourceId && o.uid && o.uid === (s.objects[sourceId]?.uid ?? s.lki[sourceId]?.uid)) return false;
  // « mise dans un cimetière ce tour-ci » : l'objet a été créé dans sa zone pendant ce tour.
  if (f.enteredThisTurn && o.controlledSince !== s.turn.number) return false;
  // « carte de créature sans capacité » : pas de texte de règles.
  if (f.noAbilities && (s.defs[o.defId]?.text ?? "").trim()) return false;
  if (f.adventure !== undefined && (s.defs[o.defId]?.layout === "adventure") !== f.adventure) return false;
  return (
    matchesView(snapshot(s, id), { ...f, controller: undefined }, controller, sourceId) &&
    (f.controller === undefined || (f.controller === "you" ? o.owner === controller : o.owner !== controller))
  );
}

export function matchesObjectFilter(
  s: GameState,
  controller: PlayerId,
  id: ObjectId,
  f: ObjectFilter,
  sourceId?: ObjectId,
): boolean {
  const o = s.objects[id];
  if (o?.zone !== "battlefield") return false;
  if (f.attackedThisTurn && o.attackedTurn !== s.turn.number) return false;
  // « arrivé sous votre contrôle ce tour-ci » (Cloudspire Coordinator).
  if (f.enteredThisTurn && o.controlledSince !== s.turn.number) return false;
  if (f.notOwned && o.owner === o.controller) return false;
  if (f.dealtDamageThisTurn && o.dealtDamageTurn !== s.turn.number) return false;
  if (f.disguise !== undefined && !!s.defs[o.defId]?.disguise !== f.disguise) return false;
  // Fractal Tender : « si vous avez mis un marqueur sur cette créature ce tour-ci ».
  if (
    f.countersPutByYouThisTurn &&
    !countersPutBy(o.countersPutTurn === s.turn.number ? o.countersPutKinds : undefined, controller, f.countersPutByYouThisTurn)
  )
    return false;
  // « autre que la créature enchantée » (Sporogenic Infection, Saw) ; « la créature équipée / le terrain enchanté ».
  if (f.notAttachedToSource && sourceId && s.objects[sourceId]?.attachedTo === id) return false;
  if (f.attachedToSource && (!sourceId || s.objects[sourceId]?.attachedTo !== id)) return false;
  if (f.notSameNameAs) {
    const name = chars(s, id).name;
    const other = f.notSameNameAs;
    if (
      s.battlefield.some((x) => x !== id && chars(s, x).name === name && matchesObjectFilter(s, controller, x, other, sourceId))
    )
      return false;
  }
  return matchesView(snapshot(s, id), resolveFilter(s, f, sourceId), controller, sourceId);
}

export function isLegalTarget(s: GameState, controller: PlayerId, spec: TargetSpec, id: string, sourceId?: ObjectId): boolean {
  const player = s.players[id];
  if (player) {
    if (player.lost || !spec.filter.players) return false;
    // « Vous avez la défense talismanique » (Crystal Barricade).
    if (id !== controller && playerStatic(s, id, "hexproof")) return false;
    if (id !== controller && playerStatic(s, id, "protectionFromOpponents")) return false;
    if (spec.filter.players === "you") return id === controller;
    if (spec.filter.players === "opponent") return id !== controller;
    return true;
  }
  // Sort ou capacité sur la pile (« sort ou capacité ciblé avec une seule cible »).
  const stackItem = s.stack.find((x) => x.id === id);
  // « capacité activée ou déclenchée ciblée » : les sorts relèvent du filtre `spells` (Louisoix's Sacrifice).
  const onlyTriggered = spec.filter.stackItems?.triggeredOnly;
  if (
    stackItem &&
    spec.filter.stackItems &&
    !((spec.filter.stackItems.abilitiesOnly || onlyTriggered) && stackItem.kind === "spell") &&
    !(
      onlyTriggered &&
      stackItem.abilityIndex >= 0 &&
      s.defs[stackItem.sourceDefId]?.abilities[stackItem.abilityIndex]?.kind !== "triggered" &&
      !stackItem.inline
    )
  ) {
    const si = spec.filter.stackItems;
    if (si.controller === "you" && stackItem.controller !== controller) return false;
    if (si.source) {
      const src =
        s.objects[stackItem.sourceId]?.zone === "battlefield" ? snapshot(s, stackItem.sourceId) : s.lki[stackItem.sourceId];
      if (!src || !matchesView(src, si.source, controller, sourceId)) return false;
    }
    const n = Object.values(stackItem.targets).flat().length;
    return !spec.filter.stackItems.singleTarget || n === 1;
  }
  const o = s.objects[id];
  if (o && o.zone === "stack") {
    // Sort sur la pile (l'identifiant de l'objet est celui de l'élément de pile).
    const f = spec.filter.spells;
    return !!f && s.stack.some((x) => x.id === id && x.kind === "spell") && matchesView(snapshot(s, id), f, controller, sourceId);
  }
  if (o && o.zone === "exile") {
    const ex = spec.filter.exiled;
    if (!ex || o.faceDown || o.cardCopy || o.preparedFor) return false;
    if (ex.withWarp && !s.defs[o.defId]?.warp) return false;
    if (ex.own !== undefined && (o.owner === controller) !== ex.own) return false;
    if (
      ex.linked &&
      !(sourceId && ((s.objects[sourceId]?.linked ?? []).includes(id) || s.objects[sourceId]?.linkedUids?.includes(o.uid)))
    )
      return false;
    return !ex.filter || matchesCard(s, controller, id, { ...ex.filter, controller: undefined }, sourceId);
  }
  if (o && o.zone === "graveyard") {
    const cards = spec.filter.cards;
    if (!cards) return false;
    if (cards.whose === "you" && o.owner !== controller) return false;
    if (cards.whose === "opponent" && o.owner === controller) return false;
    return matchesCard(s, controller, id, { ...cards.filter, controller: undefined }, sourceId);
  }
  if (!spec.filter.objects || !matchesObjectFilter(s, controller, id, spec.filter.objects, sourceId)) return false;
  // Défense talismanique : ne peut pas être la cible de sorts ou capacités adverses.
  // Nowhere to Run : les créatures adverses sont ciblables comme si elles n'avaient pas la défense talismanique.
  if (
    obj(s, id).controller !== controller &&
    hasKeyword(s, id, "hexproof") &&
    !(chars(s, id).types.includes("Creature") && playerStatic(s, controller, "ignoreOpponentsHexproofWard"))
  )
    return false;
  // Protection contre [filtre] (702.16b), défense talismanique contre [filtre] si la source est adverse.
  if (protectedFrom(s, id, sourceId ? sourceView(s, sourceId) : undefined, obj(s, id).controller !== controller)) return false;
  return true;
}

export function legalTargets(s: GameState, controller: PlayerId, spec: TargetSpec, sourceId?: ObjectId): string[] {
  const out: string[] = [];
  const ok = (id: string) => isLegalTarget(s, controller, spec, id, sourceId);
  if (spec.filter.players) for (const p of s.playerOrder) if (ok(p)) out.push(p);
  if (spec.filter.objects) for (const id of s.battlefield) if (ok(id)) out.push(id);
  if (spec.filter.cards) for (const p of s.playerOrder) for (const id of s.players[p]?.graveyard ?? []) if (ok(id)) out.push(id);
  if (spec.filter.exiled) for (const id of s.exile) if (ok(id)) out.push(id);
  if (spec.filter.spells)
    for (const item of s.stack) if (item.kind === "spell" && item.id !== sourceId && ok(item.id)) out.push(item.id);
  if (spec.filter.stackItems)
    for (const item of s.stack) if (item.id !== sourceId && !out.includes(item.id) && ok(item.id)) out.push(item.id);
  return out;
}

/** Vérifie un choix de cibles complet pour une liste de spécifications. */
export function validateTargets(
  s: GameState,
  controller: PlayerId,
  specs: TargetSpec[],
  chosen: Record<string, string[]> = {},
  opts: { kicked?: boolean; sourceId?: ObjectId; x?: number } = {},
): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const spec of specs) {
    const ids = chosen[spec.id] ?? [];
    // « X créatures ciblées » : exactement X cibles (« jusqu'à X » : au plus X, vérifié plus bas).
    if (spec.countX === true && ids.length !== Math.max(0, opts.x ?? 0))
      throw new RulesError(`${opts.x ?? 0} cible(s) requise(s)`);
    const max = spec.countX ? Math.max(0, opts.x ?? 0) : (opts.kicked && spec.kickedCount) || spec.count || 1;
    const hostSpec = spec.attachedToTarget;
    if (hostSpec && ids.some((id) => !(chosen[hostSpec] ?? []).includes(s.objects[id]?.attachedTo ?? ""))) {
      throw new RulesError("La cible doit être attachée à l'autre cible");
    }
    for (const other of spec.otherThan ?? []) {
      if (ids.some((id) => (chosen[other] ?? []).includes(id))) throw new RulesError("Ces cibles doivent être différentes");
    }
    if (ids.length > max) throw new RulesError(max === 1 ? "Une seule cible par mot « cible »" : `${max} cibles au maximum`);
    if (new Set(ids).size !== ids.length) throw new RulesError("Même cible choisie deux fois");
    if (ids.length === 0 && !spec.optional) throw new RulesError(`Cible manquante : ${spec.label ?? spec.id}`);
    const min = spec.minCount ?? max;
    if (!spec.optional && !spec.kickedCount && ids.length < min)
      throw new RulesError(min === max ? `${max} cibles requises` : `Au moins ${min} cible(s)`);
    // Cadeau promis ou kicker : un autre filtre (« à la place, un permanent non-terrain ciblé »).
    const legalSpec = opts.kicked && spec.kickedFilter ? { ...spec, filter: spec.kickedFilter } : spec;
    for (const id of ids)
      if (!isLegalTarget(s, controller, legalSpec, id, opts.sourceId)) throw new RulesError(`Cible illégale : ${id}`);
    const holders = ids.map((id) => s.objects[id]?.[s.objects[id]?.zone === "battlefield" ? "controller" : "owner"] ?? id);
    if (spec.samePlayer && new Set(holders).size > 1) throw new RulesError("Les cibles doivent appartenir au même joueur");
    if (spec.differentPlayers && new Set(holders).size !== holders.length)
      throw new RulesError("Les cibles doivent être contrôlées par des joueurs différents");
    if (spec.shareCreatureType && ids.length > 1 && !shareCreatureType(s, ids))
      throw new RulesError("Les cibles doivent partager un type de créature");
    if (spec.maxTotalManaValue !== undefined) {
      const total = ids.reduce((n, id) => n + (snapshot(s, id).manaValue ?? 0), 0);
      if (total > spec.maxTotalManaValue) throw new RulesError(`Valeur de mana totale supérieure à ${spec.maxTotalManaValue}`);
    }
    result[spec.id] = ids;
  }
  return result;
}

/** Les objets partagent-ils un type de créature ? Un changelin (ou « tous les types ») les a tous. */
export function shareCreatureType(s: GameState, ids: ObjectId[]): boolean {
  const views = ids.map((id) => snapshot(s, id));
  const all = (v: LkiSnapshot) => v.keywords.includes("changeling") || v.subtypes.includes(ALL_CREATURE_TYPES);
  const [first, ...rest] = views.filter((v) => !all(v));
  // Que des changelins : ils partagent tous les types. Sinon, un type du premier que les autres ont aussi.
  if (!first) return true;
  return first.subtypes.some((t) => !NON_CREATURE_SUBTYPES.has(t) && rest.every((v) => v.subtypes.includes(t)));
}
