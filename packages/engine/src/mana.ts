/**
 * Mana : lecture des coûts, sources disponibles et solveur de paiement automatique.
 */
import { payLife, sacrifice } from "./actions";
import { RulesError } from "./errors";
import { linkedColors } from "./layers";
import { collectEvidence, evidenceCards } from "./stack";
import {
  bump,
  changeCounters,
  chars,
  defOf,
  emit,
  isCreature,
  moveObject,
  obj,
  sickForActivation,
  snapshot,
  tapObject,
} from "./state";
import { type ActiveReplacement, eventReplacements, playerSide } from "./statics";
import { matchesCard, matchesObjectFilter, matchesView, withChosen } from "./targets";
import { checkCondition } from "./triggers";
import type {
  GameObject,
  GameState,
  LkiSnapshot,
  ManaAbilityDef,
  ManaCost,
  ManaRestriction,
  ManaType,
  ObjectId,
  PlayerId,
  TaggedMana,
} from "./types";
import { MANA_TYPES } from "./types";

const SYMBOLS = new Set<string>(["W", "U", "B", "R", "G", "C"]);

/** "{2}{G}{G/W}" → { generic: 2, colored: { G: 1 }, hybrid: [["G","W"]], x: 0 }. Lève une erreur sur les symboles non gérés. */
export function parseManaCost(text: string): ManaCost {
  const cost: ManaCost = { generic: 0, colored: {}, x: 0 };
  for (const m of text.matchAll(/\{([^}]+)\}/g)) {
    const sym = m[1] as string;
    if (/^\d+$/.test(sym)) cost.generic += Number(sym);
    else if (sym === "X") cost.x += 1;
    else if (SYMBOLS.has(sym)) {
      const t = sym as ManaType;
      cost.colored[t] = (cost.colored[t] ?? 0) + 1;
    } else if (/^2\/[WUBRG]$/.test(sym)) {
      cost.twoHybrid = [...(cost.twoHybrid ?? []), sym[2] as ManaType];
    } else if (/^[WUBRG]\/[WUBRG]$/.test(sym)) {
      cost.hybrid = [...(cost.hybrid ?? []), sym.split("/") as [ManaType, ManaType]];
    } else throw new Error(`Symbole de mana non géré : {${sym}}`);
  }
  return cost;
}

export function manaValue(cost: ManaCost | null | undefined): number {
  if (!cost) return 0;
  return (
    cost.generic +
    Object.values(cost.colored).reduce((a, b) => a + (b ?? 0), 0) +
    (cost.hybrid?.length ?? 0) +
    2 * (cost.twoHybrid?.length ?? 0)
  );
}

export function costToText(cost: ManaCost | null): string {
  if (!cost) return "";
  let t = "{X}".repeat(cost.x);
  if (cost.generic > 0 || (manaValue(cost) === 0 && cost.x === 0)) t += `{${cost.generic}}`;
  for (const [a, b] of cost.hybrid ?? []) t += `{${a}/${b}}`;
  for (const m of cost.twoHybrid ?? []) t += `{2/${m}}`;
  for (const m of MANA_TYPES) t += `{${m}}`.repeat(cost.colored[m] ?? 0);
  return t;
}

/** Coût total à payer : X remplacé par sa valeur, coûts additionnels ajoutés, réduction de générique. */
export function totalCost(base: ManaCost | null | undefined, x: number, extra?: ManaCost, reduction = 0): ManaCost {
  const cost: ManaCost = {
    generic: (base?.generic ?? 0) + x * (base?.x ?? 0),
    colored: { ...(base?.colored ?? {}) },
    hybrid: [...(base?.hybrid ?? [])],
    twoHybrid: [...(base?.twoHybrid ?? []), ...(extra?.twoHybrid ?? [])],
    x: 0,
  };
  if (extra) {
    cost.generic += extra.generic;
    for (const m of MANA_TYPES) {
      const n = extra.colored[m] ?? 0;
      if (n) cost.colored[m] = (cost.colored[m] ?? 0) + n;
    }
    cost.hybrid = [...(cost.hybrid ?? []), ...(extra.hybrid ?? [])];
  }
  // 601.2f : les réductions ne diminuent que le générique.
  cost.generic = Math.max(0, cost.generic - reduction);
  return cost;
}

// ---------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------

export interface ManaSource {
  id: ObjectId;
  ability: number;
  colors: ManaType[];
  amount: number;
  isCreature: boolean;
  /** La source se sacrifie (Trésor) : utilisée en dernier recours. */
  sacrifice: boolean;
  /** Créature engagée pour la convocation. */
  convoke?: boolean;
  /** Carte de votre cimetière exilée pour la cave (702.66). */
  delve?: boolean;
  /** Artefact ou créature engagé pour la maîtrise de l'eau : ne paie que du générique. */
  waterbend?: boolean;
  /** Artefact engagé pour l'improvisation (702.126) : ne paie que du générique. */
  improvise?: boolean;
  /**
   * Sources exclusives : deux capacités qui engagent ou sacrifient le même permanent (Forêt qui a aussi « {T} : un mana
   * de n'importe quelle couleur ») ont la même clé, et une seule peut servir.
   */
  key: string;
}

/** Capacités de mana d'un objet, y compris celles intrinsèques aux types de terrain de base (305.6). */
export function manaAbilitiesOf(s: GameState, id: ObjectId): ManaAbilityDef[] {
  // Sur le champ de bataille, types et capacités viennent des couches (Imprisoned in the Moon…).
  const o = obj(s, id);
  const c = o.zone === "battlefield" ? chars(s, id) : { subtypes: defOf(s, id).subtypes, abilities: defOf(s, id).abilities };
  const list: ManaAbilityDef[] = [];
  const basic: Record<string, ManaType> = { Plains: "W", Island: "U", Swamp: "B", Mountain: "R", Forest: "G" };
  for (const sub of c.subtypes) {
    const m = basic[sub];
    if (m) list.push({ kind: "mana", cost: { tap: true }, produce: [m], amount: 1 });
  }
  for (const a of c.abilities) {
    if (a.kind !== "mana") continue;
    // « Ajoutez un mana de la couleur choisie » (Heraldic Banner).
    // Pit of Offerings : les couleurs des cartes exilées avec la source.
    if (a.produceLinkedColors) list.push({ ...a, produce: linkedColors(s, o.linked) });
    else list.push(a.produceChosen ? { ...a, produce: o.chosen?.color ? [o.chosen.color] : a.produce } : a);
  }
  return list;
}

/** Une capacité de mana sans coût de mana peut-elle être activée maintenant ? */
function canActivateMana(s: GameState, id: ObjectId, ab: ManaAbilityDef): boolean {
  const o = obj(s, id);
  if (ab.cost.mana) return false;
  if (chars(s, id).keywords.includes("noActivatedAbilities")) return false;
  if (ab.cost.tap && (o.tapped || sickForActivation(s, id))) return false;
  if (ab.tapAnother && !otherToTap(s, id)) return false;
  if (ab.condition && !checkCondition(s, ab.condition, o.controller, id)) return false;
  if (ab.oncePerTurn && s.turn.onceFired.includes(`mana:${id}`)) return false;
  if (ab.cost.payLife && (s.players[o.controller]?.life ?? 0) < ab.cost.payLife) return false;
  if (ab.cost.collectEvidence && !evidenceCards(s, o.controller, id, ab.cost.collectEvidence)) return false;
  return true;
}

/**
 * Gene Pollinator : le permanent engagé en plus, choisi automatiquement. D'abord un permanent sans capacité de mana
 * (pour ne pas priver le solveur d'une source), sinon n'importe lequel ; `strict` : seulement le premier cas.
 */
function otherToTap(s: GameState, id: ObjectId, strict = false): ObjectId | undefined {
  const me = obj(s, id).controller;
  const creature = manaAbilitiesOf(s, id).some((a) => a.tapAnother === "creature");
  const mine = s.battlefield.filter(
    (x) => x !== id && !obj(s, x).tapped && obj(s, x).controller === me && (!creature || isCreature(s, x)),
  );
  return mine.find((x) => manaAbilitiesOf(s, x).length === 0) ?? (strict ? undefined : mine[0]);
}

/**
 * « Chaque fois que [ce permanent] est engagé pour du mana, ajoutez un mana de plus » (R1, famille I) : les remplacements
 * de mana qui s'appliquent à cette source engagée, vus du joueur qui l'engage (Lavaleaper, Shimmerwilds Growth…).
 */
function manaReplacements(s: GameState, id: ObjectId, ab: ManaAbilityDef): ActiveReplacement[] {
  const o = s.objects[id];
  if (!o || !ab.cost.tap) return [];
  return eventReplacements(s, "mana").filter(
    (a) => playerSide(s, a, o.controller) && (!a.r.source || matchesObjectFilter(s, a.controller, id, a.r.source, a.sourceId)),
  );
}

/** Mana du même type ajouté en plus, quel que soit le type produit (connu du solveur). */
const sameTypeBonus = (reps: ActiveReplacement[]) =>
  reps.filter((a) => !a.r.manaProduced && (a.r.extraMana ?? "same") === "same").reduce((n, a) => n + (a.r.modify.add ?? 0), 0);

/** Quantité produite (« {G} pour chaque Elfe que vous contrôlez »). */
function manaAmount(s: GameState, id: ObjectId, ab: ManaAbilityDef): number {
  // Source déjà sacrifiée pour payer le coût (Trésor) : quantité imprimée.
  const o = s.objects[id];
  if (!o) return ab.amount;
  const controller = o.controller;
  // Molten Tide, Lavaleaper, Roxanne : « chaque fois que [ce permanent] est engagé pour du mana, un mana de plus ».
  const extra = sameTypeBonus(manaReplacements(s, id, ab));
  // The Eternity Elevator : autant de mana que de marqueurs de charge.
  if (ab.amountCounters) return (o.counters[ab.amountCounters] ?? 0) + extra;
  // The Core : « X mana, où X est le nombre de cartes de permanent de votre cimetière ».
  if (ab.amountGraveyard) {
    const f = ab.amountGraveyard;
    return (s.players[controller]?.graveyard ?? []).filter((x) => matchesCard(s, controller, x, { ...f, controller: undefined }))
      .length;
  }
  if (ab.amountSelfPower) return Math.max(0, chars(s, id).power) + extra;
  // Loot, the Nexus : un mana pour chaque force différente parmi vos créatures.
  if (ab.amountDistinctPowers) {
    const powers = s.battlefield
      .filter((x) => obj(s, x).controller === controller && isCreature(s, x))
      .map((x) => chars(s, x).power);
    return new Set(powers).size + extra;
  }
  if (!ab.amountPer) return ab.amount + extra;
  const f = ab.amountPer;
  return s.battlefield.filter((x) => matchesObjectFilter(s, controller, x, f, id)).length + extra;
}

/** À quoi le mana est destiné (mana restreint : « dépensez ce mana uniquement pour lancer un sort d'Ange »). */
export interface ManaPurpose {
  spell?: LkiSnapshot;
  /** Capacité activée : sa source. */
  abilitySource?: ObjectId;
  /** Convocation (702.51) : les créatures dégagées peuvent payer {1} ou un mana de leur couleur. */
  convoke?: boolean;
  /** Cave (702.66, Teval) : chaque carte exilée de votre cimetière paie {1}. */
  delve?: boolean;
  /** Sort lancé depuis la main. */
  fromHand?: boolean;
  /**
   * Maîtrise de l'eau N : au plus N du générique peut être payé en engageant des artefacts et créatures dégagés (un {1}
   * chacun).
   */
  waterbend?: number;
  /** Improvisation (702.126) : chaque artefact dégagé peut payer {1} du générique. */
  improvise?: boolean;
  /**
   * Permanents sacrifiés pour payer le coût : leurs capacités de mana peuvent servir avant (601.2g, 602.2b), sauf celles qui
   * les sacrifient eux-mêmes (Trésor).
   */
  sacrificedForCost?: ReadonlySet<ObjectId>;
  /**
   * Cartes que le paiement ne doit pas consommer (preuves, cave) : la carte de cimetière qui s'exile pour payer le coût de
   * sa propre capacité (renouveau de Sage of the Fang, payé avec Cryptex).
   */
  keep?: readonly ObjectId[];
  /** Sources proposées à l'engagement manuel (`legalActions`) : les sources restreintes aussi. */
  manual?: boolean;
  /**
   * Objets choisis par le joueur pour la convocation, l'improvisation, la maîtrise de l'eau ou la cave : seuls ceux-là
   * servent pour ce mode de paiement, en premier, et tous doivent servir.
   */
  only?: Partial<Record<"convoke" | "improvise" | "waterbend" | "delve", ObjectId[]>>;
}

/** Cartes que le paiement ne consomme pas : celles de `keep`, et la source de la capacité payée (qui peut s'exiler). */
function kept(purpose?: ManaPurpose): ObjectId[] {
  return [...(purpose?.keep ?? []), ...(purpose?.abilitySource ? [purpose.abilitySource] : [])];
}

/** Pseudo-capacité de mana d'une créature engagée pour la convocation. */
export const CONVOKE = -1;
/** Pseudo-capacité de mana d'une carte du cimetière exilée pour la cave. */
export const DELVE = -2;
/** Pseudo-capacité : un artefact ou une créature engagé pour la maîtrise de l'eau ({1}). */
export const WATERBEND = -4;
/** Pseudo-capacité : un mana restreint de la réserve (`restrictedMana`, Ashling, Rimebound) ; `id` : `pool:<rang>`. */
export const RESTRICTED_POOL = -3;

function restrictionAllows(
  s: GameState,
  sourceId: ObjectId,
  ab: ManaAbilityDef,
  player: PlayerId,
  purpose?: ManaPurpose,
): boolean {
  // Engagée à la main, une source restreinte remplit la réserve marquée (`activateManaAbility`).
  if (purpose?.manual) return true;
  return allows(s, ab.restriction, s.objects[sourceId], sourceId, player, purpose);
}

/** Le mana restreint peut-il servir à ce paiement ? (`source` : ce qui l'a produit, pour « du type choisi »). */
function allows(
  s: GameState,
  r: ManaRestriction | undefined,
  o: { chosen?: GameObject["chosen"] } | undefined,
  sourceId: ObjectId,
  player: PlayerId,
  purpose?: ManaPurpose,
): boolean {
  if (!r) return true;
  if (!purpose) return false;
  if (r.notSpellFromHand) return !!purpose.abilitySource || (!!purpose.spell && !purpose.fromHand);
  if (r.spellNotFromHand) return !!purpose.spell && !purpose.fromHand;
  if (r.spell && purpose.spell && matchesView(purpose.spell, withChosen(r.spell, o), player, sourceId)) return true;
  const src = purpose.abilitySource;
  if (r.abilityOfSource && src && s.objects[src]) {
    return matchesView(snapshot(s, src), withChosen(r.abilityOfSource, o), player, sourceId);
  }
  if (r.abilityOfCreature && src && s.objects[src] && isCreature(s, src)) {
    return matchesView(snapshot(s, src), withChosen(r.abilityOfCreature, o), player, sourceId);
  }
  return false;
}

export function manaSources(
  s: GameState,
  player: PlayerId,
  exclude: ReadonlySet<ObjectId> = new Set(),
  purpose?: ManaPurpose,
): ManaSource[] {
  const out: ManaSource[] = [];
  for (const id of s.battlefield) {
    const o = obj(s, id);
    if (o.controller !== player || exclude.has(id)) continue;
    manaAbilitiesOf(s, id).forEach((ab, i) => {
      if (!canActivateMana(s, id, ab)) return;
      // Mana restreint : seulement utilisable par le solveur pour un paiement autorisé.
      if (!restrictionAllows(s, id, ab, player, purpose)) return;
      if (ab.tapAnother && !otherToTap(s, id, true)) return;
      if (ab.cost.sacrificeSelf && purpose?.sacrificedForCost?.has(id)) return;
      if (ab.cost.collectEvidence && !evidenceCards(s, o.controller, id, ab.cost.collectEvidence, kept(purpose))) return;
      // Aucune couleur possible (Pit of Offerings sans carte exilée colorée) : la capacité ne produit rien (106.7).
      if (ab.produce.length === 0) return;
      out.push({
        id,
        ability: i,
        colors: ab.produce,
        amount: manaAmount(s, id, ab),
        isCreature: defOf(s, id).types.includes("Creature"),
        sacrifice: !!ab.cost.sacrificeSelf,
        key: ab.cost.tap || ab.cost.sacrificeSelf ? id : `${id}#${i}`,
      });
    });
  }
  // Convocation : chaque créature dégagée sans capacité de mana paie {1} ou un mana de sa couleur (utilisée en dernier).
  if (purpose?.convoke) {
    for (const id of s.battlefield) {
      const o = obj(s, id);
      if (o.controller !== player || exclude.has(id) || o.tapped || !isCreature(s, id)) continue;
      if (manaAbilitiesOf(s, id).length) continue;
      if (purpose.only?.convoke && !purpose.only.convoke.includes(id)) continue;
      const colors = chars(s, id).colors;
      out.push({
        id,
        ability: CONVOKE,
        colors: [...colors, "C"],
        amount: 1,
        isCreature: true,
        sacrifice: false,
        convoke: true,
        key: id,
      });
    }
  }
  // Maîtrise de l'eau : chaque artefact ou créature dégagé paie {1} (même clé que ses capacités de mana : une seule sert).
  if (purpose?.waterbend) {
    for (const id of s.battlefield) {
      const o = obj(s, id);
      if (o.controller !== player || exclude.has(id) || o.tapped) continue;
      const types = chars(s, id).types;
      if (!types.includes("Artifact") && !types.includes("Creature")) continue;
      if (purpose.only?.waterbend && !purpose.only.waterbend.includes(id)) continue;
      out.push({ id, ability: WATERBEND, colors: [], amount: 1, isCreature: false, sacrifice: false, waterbend: true, key: id });
    }
  }
  // Improvisation : chaque artefact dégagé paie {1} (sans plafond ; même clé que ses capacités de mana).
  if (purpose?.improvise) {
    const taken = new Set(out.filter((x) => x.waterbend).map((x) => x.id));
    for (const id of s.battlefield) {
      const o = obj(s, id);
      if (o.controller !== player || exclude.has(id) || o.tapped || taken.has(id)) continue;
      if (!chars(s, id).types.includes("Artifact")) continue;
      if (purpose.only?.improvise && !purpose.only.improvise.includes(id)) continue;
      out.push({ id, ability: WATERBEND, colors: [], amount: 1, isCreature: false, sacrifice: false, improvise: true, key: id });
    }
  }
  // Mana restreint de la réserve : seulement pour un paiement permis (utilisé d'abord, il est déjà là).
  (s.players[player]?.restrictedMana ?? []).forEach((m, i) => {
    if (!allows(s, m.restriction, m.chosen ? { chosen: m.chosen } : undefined, m.source ?? `pool:${i}`, player, purpose)) return;
    out.push({
      id: `pool:${i}`,
      ability: RESTRICTED_POOL,
      colors: [m.type],
      amount: 1,
      isCreature: false,
      sacrifice: false,
      key: `pool:${i}`,
    });
  });
  // Cave : chaque carte du cimetière paie {1} (utilisée en tout dernier, choix automatique).
  if (purpose?.delve) {
    const keep = kept(purpose);
    for (const id of s.players[player]?.graveyard ?? []) {
      if (exclude.has(id) || keep.includes(id)) continue;
      if (purpose.only?.delve && !purpose.only.delve.includes(id)) continue;
      out.push({ id, ability: DELVE, colors: ["C"], amount: 1, isCreature: false, sacrifice: false, delve: true, key: id });
    }
  }
  // Préférence : terrains, puis créatures, puis sources sacrifiées, puis convocation et maîtrise de l'eau, puis cave ; les
  // moins flexibles d'abord.
  // Objets choisis par le joueur (convocation, improvisation, maîtrise de l'eau, cave) : en premier, ils doivent servir.
  const chosen = (x: ManaSource) =>
    (x.convoke && purpose?.only?.convoke) ||
    (x.waterbend && purpose?.only?.waterbend) ||
    (x.improvise && purpose?.only?.improvise) ||
    (x.delve && purpose?.only?.delve);
  const rank = (x: ManaSource) =>
    chosen(x)
      ? -2
      : x.ability === RESTRICTED_POOL
        ? -1
        : x.delve
          ? 4
          : x.convoke || x.waterbend || x.improvise
            ? 3
            : x.sacrifice
              ? 2
              : x.isCreature
                ? 1
                : 0;
  return out.sort((a, b) => rank(a) - rank(b) || a.colors.length - b.colors.length);
}

/** `forPayment` : le paiement automatique d'un coût, dont le solveur a vérifié la restriction (mana versé dans la réserve). */
export function activateManaAbility(
  s: GameState,
  player: PlayerId,
  id: ObjectId,
  ability: number,
  color?: ManaType,
  forPayment = false,
  keep: readonly ObjectId[] = [],
): void {
  const o = s.objects[id];
  if (!o || o.controller !== player) throw new RulesError("Vous ne contrôlez pas cette source");
  const ab = manaAbilitiesOf(s, id)[ability];
  if (!ab || !canActivateMana(s, id, ab)) throw new RulesError("Capacité de mana indisponible");
  const c = color ?? ab.produce[0];
  if (!c || !ab.produce.includes(c)) throw new RulesError("Couleur de mana invalide");
  // Annulable seulement si {T} est le seul coût, sans autre effet ni déclenchement (façon Arena).
  const simple =
    !!ab.cost.tap &&
    !ab.oncePerTurn &&
    !ab.tapAnother &&
    !ab.cost.sacrificeSelf &&
    !ab.cost.payLife &&
    !ab.addCounter &&
    !ab.removeCounter &&
    !ab.restriction &&
    !ab.rider;
  const triggersBefore = s.triggers.length;
  const poolBefore = s.players[player]?.manaPool[c] ?? 0;
  if (ab.cost.tap) tapObject(s, o);
  if (ab.oncePerTurn) s.turn.onceFired.push(`mana:${id}`);
  if (ab.tapAnother) tapObject(s, obj(s, otherToTap(s, id) as ObjectId));
  if (ab.cost.sacrificeSelf) sacrifice(s, id);
  // Haunted Screen : « {T}, payez 1 point de vie » ; Twitching Doll : « mettez un marqueur de nid sur cette créature ».
  if (ab.cost.payLife) payLife(s, player, ab.cost.payLife);
  // Cryptex : « {T}, réunissez des preuves 3 : ajoutez un mana… ».
  if (ab.cost.collectEvidence) collectEvidence(s, player, evidenceCards(s, player, id, ab.cost.collectEvidence, keep) ?? []);
  if (ab.addCounter && s.objects[id]?.zone === "battlefield") changeCounters(s, o, ab.addCounter, 1);
  if (ab.removeCounter && (o.counters[ab.removeCounter] ?? 0) > 0) changeCounters(s, o, ab.removeCounter, -1);
  const pool = s.players[player]?.manaPool;
  const pl = s.players[player];
  // Mana restreint (« ne dépensez ce mana que pour… », Woodland Weavemaster) ou porteur d'un effet (Cavern of Souls : « ne
  // peut pas être contrecarré ») engagé à la main : il va dans la réserve marquée avec sa source et son choix, pour que la
  // restriction et l'effet s'appliquent quand il sera dépensé.
  if (!forPayment && (ab.restriction || ab.rider) && pl) {
    const n = manaAmount(s, id, ab);
    const tag: TaggedMana = {
      type: c,
      ...(ab.restriction ? { restriction: ab.restriction } : {}),
      source: id,
      ...(o.chosen ? { chosen: o.chosen } : {}),
      ...(ab.rider ? { rider: ab.rider } : {}),
    };
    pl.restrictedMana = [...(pl.restrictedMana ?? []), ...Array.from({ length: n }, () => ({ ...tag }))];
  } else if (pool) pool[c] += manaAmount(s, id, ab);
  // Mana en plus d'un autre type (Shimmerwilds Growth : la couleur choisie) ou seulement pour ce type (Ultima : {C}).
  let otherBonus = false;
  for (const a of manaReplacements(s, id, ab)) {
    const same = (a.r.extraMana ?? "same") === "same";
    if ((same && !a.r.manaProduced) || (a.r.manaProduced && a.r.manaProduced !== c) || !pool) continue;
    const type: ManaType | undefined =
      a.r.extraMana === "chosen"
        ? s.objects[a.sourceId ?? ""]?.chosen?.color
        : a.r.extraMana === "any"
          ? c === "C"
            ? undefined
            : c
          : same
            ? c
            : (a.r.extraMana as ManaType);
    if (!type) continue;
    pool[type] += a.r.modify.add ?? 0;
    if (type !== c) otherBonus = true;
  }
  const amount = (pool?.[c] ?? 0) - poolBefore;
  if (simple && !otherBonus && s.triggers.length === triggersBefore && amount > 0)
    s.manaUndo = [...(s.manaUndo ?? []), { player, source: id, color: c, amount }];
  // La réserve a changé : une capacité statique peut en dépendre (Ozai, the Phoenix King).
  bump(s);
}

/** Annule l'engagement d'une source pour son mana (voir `GameState.manaUndo`) : elle se dégage, le mana disparaît. */
export function undoMana(s: GameState, player: PlayerId, source: ObjectId): void {
  const entry = s.manaUndo?.find((x) => x.player === player && x.source === source);
  const o = s.objects[source];
  const pool = s.players[player]?.manaPool;
  if (!entry || !o?.tapped || !pool || pool[entry.color] < entry.amount) throw new RulesError("Ce mana ne peut plus être annulé");
  pool[entry.color] -= entry.amount;
  o.tapped = false;
  s.manaUndo = s.manaUndo?.filter((x) => x !== entry);
  bump(s);
}

// ---------------------------------------------------------------------------
// Solveur
// ---------------------------------------------------------------------------

export interface PaymentPlan {
  /** Capacités de mana à activer. */
  taps: { id: ObjectId; ability: number; color: ManaType }[];
  /** Mana dépensé de la réserve, par type, une fois les capacités activées. */
  spend: Record<ManaType, number>;
}

const zero = (): Record<ManaType, number> => ({ W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 });

/**
 * Cherche comment payer `cost` avec la réserve puis les sources disponibles.
 * Renvoie le plan de paiement, ou null si c'est impossible.
 */
export function solvePayment(
  s: GameState,
  player: PlayerId,
  cost: ManaCost,
  exclude: ReadonlySet<ObjectId> = new Set(),
  purpose?: ManaPurpose,
): PaymentPlan | null {
  // « {T}, engagez une créature dégagée : ajoutez un mana » (Springleaf Drum) : les sources de ce genre se partagent les
  // permanents à engager. Un plan qui en utilise plus qu'il n'y a de permanents disponibles est refait sans l'une d'elles.
  let without = new Set(exclude);
  for (let tries = 0; tries < 8; tries++) {
    const plan = solvePaymentOnce(s, player, cost, without, purpose);
    if (!plan) return null;
    const sharing = plan.taps.filter((t) => t.ability >= 0 && manaAbilitiesOf(s, t.id)[t.ability]?.tapAnother);
    if (sharing.length <= 1) return plan;
    const inPlan = new Set(plan.taps.map((t) => t.id));
    const creature = sharing.some((t) => manaAbilitiesOf(s, t.id)[t.ability]?.tapAnother === "creature");
    const others = s.battlefield.filter(
      (x) =>
        !inPlan.has(x) &&
        !without.has(x) &&
        !obj(s, x).tapped &&
        obj(s, x).controller === player &&
        (!creature || isCreature(s, x)) &&
        manaAbilitiesOf(s, x).length === 0,
    );
    if (sharing.length <= others.length) return plan;
    without = new Set([...without, (sharing.at(-1) as { id: ObjectId }).id]);
  }
  return null;
}

function solvePaymentOnce(
  s: GameState,
  player: PlayerId,
  cost: ManaCost,
  exclude: ReadonlySet<ObjectId>,
  purpose?: ManaPurpose,
): PaymentPlan | null {
  // Hybrides monocolores {2/W} : on essaie d'abord de tout payer en couleur, puis avec de plus en plus de génériques.
  const two = cost.twoHybrid ?? [];
  if (two.length > 0) {
    const masks = [...Array(1 << two.length).keys()].sort((a, b) => bitCount(a) - bitCount(b));
    for (const mask of masks) {
      const c: ManaCost = { ...cost, colored: { ...cost.colored }, twoHybrid: [] };
      two.forEach((m, i) => {
        if (mask & (1 << i)) c.generic += 2;
        else c.colored[m] = (c.colored[m] ?? 0) + 1;
      });
      const plan = solvePayment(s, player, c, exclude, purpose);
      if (plan) return plan;
    }
    return null;
  }
  const pool = { ...(s.players[player]?.manaPool ?? zero()) } as Record<ManaType, number>;
  // Une même source à plusieurs capacités (Tablet of Discovery : {R}, ou {R}{R} pour un éphémère ou un rituel) : celle qui
  // produit le plus d'abord, son surplus paie le générique.
  const listed = manaSources(s, player, exclude, purpose);
  const byKey = new Map<string, ManaSource[]>();
  for (const src of listed) byKey.set(src.key, [...(byKey.get(src.key) ?? []), src]);
  const sources = [...byKey.values()].flatMap((group) => [...group].sort((a, b) => b.amount - a.amount));
  // Symboles à payer : chacun accepte un ensemble de types (un seul pour un symbole coloré, deux pour un hybride).
  const pips: ManaType[][] = [];
  for (const m of MANA_TYPES) for (let i = 0; i < (cost.colored[m] ?? 0); i++) pips.push([m]);
  for (const pair of cost.hybrid ?? []) pips.push([...pair]);
  const supply = (colors: ManaType[]) =>
    colors.reduce((n, m) => n + pool[m], 0) + sources.filter((x) => x.colors.some((c) => colors.includes(c))).length;
  pips.sort((a, b) => supply(a) - supply(b));

  const used = new Set<string>();
  const taps: PaymentPlan["taps"] = [];
  const extra = zero();
  const spend = zero();

  const assign = (i: number): boolean => {
    if (i === pips.length) return true;
    const allowed = pips[i] as ManaType[];
    // 1. La réserve (gratuite), puis le surplus des sources qui produisent plusieurs mana.
    for (const bucket of [pool, extra]) {
      for (const m of allowed) {
        if (bucket[m] <= 0) continue;
        bucket[m] -= 1;
        spend[m] += 1;
        if (assign(i + 1)) return true;
        bucket[m] += 1;
        spend[m] -= 1;
      }
    }
    // 2. Une source non utilisée.
    for (let k = 0; k < sources.length; k++) {
      const src = sources[k] as ManaSource;
      if (used.has(src.key)) continue;
      for (const m of allowed) {
        if (!src.colors.includes(m)) continue;
        used.add(src.key);
        taps.push({ id: src.id, ability: src.ability, color: m });
        extra[m] += src.amount - 1;
        spend[m] += 1;
        if (assign(i + 1)) return true;
        spend[m] -= 1;
        extra[m] -= src.amount - 1;
        taps.pop();
        used.delete(src.key);
      }
    }
    return false;
  };
  if (!assign(0)) return null;

  // Générique : réserve (incolore d'abord), surplus, puis sources restantes dans l'ordre de préférence.
  let generic = cost.generic;
  for (const bucket of [pool, extra]) {
    for (const m of ["C", ...MANA_TYPES.filter((x) => x !== "C")] as ManaType[]) {
      const n = Math.min(generic, bucket[m]);
      bucket[m] -= n;
      spend[m] += n;
      generic -= n;
    }
  }
  // Maîtrise de l'eau : au plus `purpose.waterbend` artefacts et créatures engagés.
  let waterbent = 0;
  for (let k = 0; k < sources.length && generic > 0; k++) {
    const src = sources[k] as ManaSource;
    if (used.has(src.key)) continue;
    if (src.waterbend && waterbent >= (purpose?.waterbend ?? 0)) continue;
    if (src.waterbend) waterbent += 1;
    const m = (src.colors[0] ?? "C") as ManaType;
    used.add(src.key);
    taps.push({ id: src.id, ability: src.ability, color: m });
    const n = Math.min(generic, src.amount);
    spend[m] += n;
    generic -= n;
  }
  return generic > 0 ? null : { taps, spend };
}

function bitCount(n: number): number {
  let c = 0;
  for (let x = n; x; x >>= 1) c += x & 1;
  return c;
}

/** Quantité maximale de mana disponible (réserve + sources). */
export function availableMana(
  s: GameState,
  player: PlayerId,
  exclude: ReadonlySet<ObjectId> = new Set(),
  purpose?: ManaPurpose,
): number {
  const pool = s.players[player]?.manaPool;
  const inPool = pool ? MANA_TYPES.reduce((n, m) => n + pool[m], 0) : 0;
  // Sources exclusives (même permanent engagé) : seule la plus productive compte.
  const best = new Map<string, number>();
  for (const src of manaSources(s, player, exclude, purpose)) best.set(src.key, Math.max(best.get(src.key) ?? 0, src.amount));
  return inPool + [...best.values()].reduce((n, a) => n + a, 0);
}

export function canPay(
  s: GameState,
  player: PlayerId,
  cost: ManaCost,
  exclude?: ReadonlySet<ObjectId>,
  purpose?: ManaPurpose,
): boolean {
  return solvePayment(s, player, cost, exclude, purpose) !== null;
}

/** Active les sources nécessaires puis retire le coût de la réserve. Lève une erreur si impossible. */
export function payMana(
  s: GameState,
  player: PlayerId,
  cost: ManaCost,
  exclude?: ReadonlySet<ObjectId>,
  purpose?: ManaPurpose,
  /** Reçoit les activations du paiement automatique : source, capacité et quantité produite. */
  sources?: { id: ObjectId; ab?: ManaAbilityDef; amount: number; chosen?: GameObject["chosen"] }[],
  /** Reçoit le mana dépensé, par type (« si {U}{U} a été dépensé pour le lancer »). */
  spent?: Partial<Record<ManaType, number>>,
): ManaAbilityDef[] {
  const plan = solvePayment(s, player, cost, exclude, purpose);
  if (!plan) throw new RulesError("Mana insuffisant");
  // Les objets choisis par le joueur pour la convocation (ou l'improvisation, la maîtrise de l'eau, la cave) servent tous.
  const tapped = new Set(plan.taps.map((t) => t.id));
  for (const ids of Object.values(purpose?.only ?? {}))
    if (ids?.some((id) => !tapped.has(id))) throw new RulesError("Trop d'objets choisis pour payer ce coût");
  if (spent) for (const m of MANA_TYPES) if (plan.spend[m]) spent[m] = plan.spend[m];
  if (sources) {
    for (const t of plan.taps) {
      if (t.ability === RESTRICTED_POOL) {
        // Mana marqué : sa source et son effet (Cavern of Souls), avec le choix figé à la production.
        const m = s.players[player]?.restrictedMana?.[Number(t.id.slice("pool:".length))];
        sources.push({
          id: m?.source ?? t.id,
          ab: m?.rider ? ({ rider: m.rider } as ManaAbilityDef) : undefined,
          amount: 1,
          chosen: m?.chosen,
        });
        continue;
      }
      const ab = t.ability < 0 ? undefined : manaAbilitiesOf(s, t.id)[t.ability];
      sources.push({ id: t.id, ab, amount: ab ? manaAmount(s, t.id, ab) : 1 });
    }
  }
  // Capacités de mana utilisées (effets associés au mana dépensé : Carnelian Orb…).
  const used = plan.taps
    .filter((t) => t.ability >= 0)
    .map((t) => manaAbilitiesOf(s, t.id)[t.ability])
    .filter((a): a is ManaAbilityDef => !!a);
  const pool = s.players[player]?.manaPool;
  if (!pool) throw new Error("Joueur inconnu");
  const usedRestricted = new Set<number>();
  for (const t of plan.taps) {
    if (t.ability === RESTRICTED_POOL) {
      // Mana restreint de la réserve : il rejoint la réserve pour être dépensé aussitôt.
      usedRestricted.add(Number(t.id.slice("pool:".length)));
      pool[t.color] += 1;
    } else if (t.ability === WATERBEND) {
      // L'artefact ou la créature engagé paie {1}.
      tapObject(s, obj(s, t.id));
      pool.C += 1;
    } else if (t.ability === CONVOKE) {
      // La créature engagée paie un mana de sa couleur (ou {1}).
      tapObject(s, obj(s, t.id));
      pool[t.color] += 1;
    } else if (t.ability === DELVE) {
      // La carte exilée de votre cimetière paie {1} (702.66a).
      const o = obj(s, t.id);
      emit({ type: "moved", owner: o.owner, objectId: t.id, defId: o.defId, from: "graveyard", to: "exile" });
      moveObject(s, t.id, "exile");
      pool.C += 1;
    } else activateManaAbility(s, player, t.id, t.ability, t.color, true, kept(purpose));
  }
  const pl = s.players[player];
  if (pl?.restrictedMana && usedRestricted.size) {
    pl.restrictedMana = pl.restrictedMana.filter((_, i) => !usedRestricted.has(i));
    if (pl.restrictedMana.length === 0) pl.restrictedMana = undefined;
  }
  for (const m of MANA_TYPES) {
    // Le solveur a promis ce mana : un manque ici est un bug, pas une décision illégale.
    if (pool[m] < plan.spend[m]) throw new Error(`Paiement incohérent : ${m} manquant`);
    pool[m] -= plan.spend[m];
  }
  // La réserve a changé : une capacité statique peut en dépendre (Ozai, the Phoenix King).
  bump(s);
  return used;
}
