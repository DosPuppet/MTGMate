/**
 * Lancer des sorts (601), activer des capacités (602), résoudre la pile (608).
 * Côté moteur, un lancement est atomique : le client envoie d'un coup mode, cibles, X et kicker,
 * et le paiement du mana est résolu automatiquement (réserve d'abord, puis solveur).
 */
import { createTokenCopy, loseLife, sacrifice as sacrificePermanent } from "./actions";
import { ask } from "./choices";
import { addEffect, announceDiscard, announceDiscardBatch, evalAmount, moveWithSpec, runEffect } from "./effects";
import { RulesError } from "./errors";
import { copiedDefId } from "./layers";
import { manaValue, payMana, totalCost } from "./mana";
import {
  bump,
  changeCounters,
  chars,
  emit,
  FACE_DOWN_DEF,
  FACE_DOWN_ID,
  isCreature,
  isSummoningSick,
  moveObject,
  newId,
  nextTimestamp,
  obj,
  onBattlefield,
  rulesEvent,
  shuffle,
  snapshot,
  tapObject,
  turnFaceUp,
  unlockDoor,
} from "./state";
import { controlledAbilitiesWithSource, playerStatic } from "./statics";
import { isLegalTarget, legalTargets, matchesCard, matchesObjectFilter, matchesView, validateTargets } from "./targets";
import { checkCondition, checkCrime, createDelayed, pushInline, simultaneously } from "./triggers";
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
  if (d.flashIf && checkCondition(s, d.flashIf, player)) return true;
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
  const turnExtra = s.players[player]?.extraLandsTurn;
  const extra = turnExtra?.turn === s.turn.number ? turnExtra.n : 0;
  return (
    1 + extra + controlledAbilities(s, player).reduce((n, ab) => n + (ab.kind === "playerStatic" ? (ab.extraLands ?? 0) : 0), 0)
  );
}

/** Permission de jouer une carte exilée (impulsion, Etali…) encore valable. */
function exilePermission(s: GameState, player: PlayerId, card: ObjectId) {
  return s.playPermissions?.find(
    (p) =>
      p.card === card &&
      p.player === player &&
      p.until >= s.turn.number &&
      // Possibility Technician : « tant que vous contrôlez un Kavu ».
      (!p.condition || checkCondition(s, p.condition, player, p.source)),
  );
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
    (o.zone === "library" && o.owner === player && s.players[player]?.library[0] === card && topCardPlayable(s, player, card)) ||
    // Ville à aventure (FIN) : la carte « en aventure » se joue comme terrain depuis l'exil (715.4).
    (o.zone === "exile" && !!o.onAdventure && o.owner === player) ||
    (o.zone === "graveyard" &&
      o.owner === player &&
      (graveyardTypeAvailable(s, player, card) === "Land" ||
        playerStatic(s, player, "playLandsFromGraveyard") ||
        playerStatic(s, player, "playFromGraveyard")));
  return allowed && sorceryTiming(s, player) && s.turn.landsPlayed < landsAllowed(s, player);
}

export function playLand(s: GameState, player: PlayerId, card: ObjectId, payLife = false): void {
  if (!canPlayLand(s, player, card)) throw new RulesError("Vous ne pouvez pas jouer ce terrain maintenant");
  const o = obj(s, card);
  // Terrains choc : « vous pouvez payer 2 points de vie ; sinon, il arrive engagé ».
  const shock = s.defs[o.defId]?.shockLand;
  if (payLife && !shock) throw new RulesError("Ce terrain ne demande pas de points de vie");
  if (payLife && shock) loseLife(s, player, shock);
  if (o.zone === "graveyard") s.turn.graveyardTypesUsed = [...(s.turn.graveyardTypesUsed ?? []), "Land"];
  const defId = o.defId;
  const fromExile = o.zone === "exile" ? exilePermission(s, player, card) : undefined;
  const id = moveObject(s, card, "battlefield", { controller: player, enters: { shockPaid: payLife } });
  s.turn.landsPlayed += 1;
  emit({ type: "playLand", player, objectId: id as string, defId });
  if (id) rulesEvent(s, { e: "playLand", player, objectId: id });
  // Lightstall Inquisitor : un terrain joué depuis l'exil ainsi arrive engagé.
  const landed = id ? s.objects[id] : undefined;
  if (landed && fromExile?.landsTapped) {
    landed.tapped = true;
    bump(s);
  }
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
export function spellReduction(
  s: GameState,
  player: PlayerId,
  d: CardDef,
  targets?: Record<string, string[]>,
  fromZone?: CastTerms["source"],
): number {
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
    for (const ab of chars(s, id).abilities) {
      if (ab.kind !== "costReduction") continue;
      // Réductions de vos permanents ; taxes des permanents adverses sur vos sorts (Thalia, the Survivor).
      const applies = ab.opponents ? o.controller !== player : o.controller === player;
      if (!applies || !matchesView(view, ab.filter, player)) continue;
      if (ab.condition && !checkCondition(s, ab.condition, o.controller, id)) continue;
      // « Les sorts lancés depuis un cimetière ou depuis l'exil » (Aven Interrupter, Doc Aurlock).
      const zone = fromZone === "flashback" ? "graveyard" : fromZone;
      if (ab.fromZones && !(zone === "graveyard" || zone === "exile" ? ab.fromZones.includes(zone) : false)) continue;
      r += ab.generic;
      if (ab.genericAmount !== undefined) r += evalAmount(s, reductionContext(o.controller, id, o.defId), ab.genericAmount);
    }
  }
  return r;
}

/** Modifications à l'arrivée d'un sort (Noctis ; prochain sort de créature : Summon: Fenrir, Summon: Brynhildr). */
function arrivalFor(s: GameState, player: PlayerId, d: CardDef, terms: CastTerms): StackItem["arrival"] {
  const counters: { kind: string; n: number }[] = terms.finality ? [{ kind: "finality", n: 1 }] : [];
  let haste = false;
  if (d.types.includes("Creature")) {
    const pending = (s.nextCreatureSpell ?? []).filter((x) => x.player === player && x.turn === s.turn.number);
    for (const p of pending) {
      if (p.counters) counters.push({ kind: "+1/+1", n: p.counters });
      if (p.haste) haste = true;
    }
    if (pending.length) s.nextCreatureSpell = (s.nextCreatureSpell ?? []).filter((x) => !pending.includes(x));
  }
  return counters.length || haste ? { counters, haste: haste || undefined } : undefined;
}

/** Cloud, Planet's Champion : réduction d'une capacité d'Équiper qui cible la créature. */
export function equipDiscount(s: GameState, player: PlayerId, ab: ActivatedAbilityDef, target: ObjectId | undefined): number {
  if (!target || !ab.label?.startsWith("Équiper") || s.objects[target]?.controller !== player) return 0;
  return s.defs[copiedDefId(s, target)]?.equipDiscountWhenTargeted ?? 0;
}

/** The Lunar Whale, Traveling Chocobo : la carte du dessus de la bibliothèque peut être jouée. */
function topCardPlayable(s: GameState, player: PlayerId, card: ObjectId): boolean {
  return controlledAbilitiesWithSource(s, player).some(
    ({ id, ab }) =>
      ab.kind === "playerStatic" &&
      !!ab.playTopCard &&
      (!ab.condition || checkCondition(s, ab.condition, player, id)) &&
      (!ab.playTopFilter || matchesCard(s, player, card, { ...ab.playTopFilter, controller: undefined }, id)),
  );
}

/** Kicker sans mana (FIN) : le permanent choisi automatiquement pour le payer, s'il y en a un. */
export function kickerCostPermanent(
  s: GameState,
  player: PlayerId,
  card: ObjectId,
  d: CardDef,
  exclude: ObjectId[] = [],
): ObjectId | undefined {
  const f = d.kickerCost?.sacrifice ?? d.kickerCost?.bounce;
  if (!f) return undefined;
  const mv = (id: ObjectId) => (s.objects[id]?.isToken ? -1 : manaValue(s.defs[s.objects[id]?.defId ?? ""]?.manaCost));
  return s.battlefield
    .filter(
      (id) =>
        id !== card &&
        !exclude.includes(id) &&
        s.objects[id]?.controller === player &&
        matchesObjectFilter(s, player, id, f, card),
    )
    .sort((a, b) => mv(a) - mv(b))[0];
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
    /** Zone d'où le sort est lancé (réductions et taxes « depuis un cimetière ou l'exil »). */
    fromZone?: CastTerms["source"];
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
    opts.free ? 0 : spellReduction(s, player, d, opts.targets, opts.fromZone),
  );
  if (!opts.anyMana) return cost;
  const colored =
    Object.values(cost.colored).reduce<number>((n, k) => n + (k ?? 0), 0) +
    (cost.hybrid?.length ?? 0) +
    (cost.twoHybrid?.length ?? 0);
  return { generic: cost.generic + colored, colored: {}, x: 0 };
}

/** Conditions de lancement d'une carte depuis sa zone actuelle. */
export interface CastTerms {
  /** {N} de plus (Lightstall Inquisitor). */
  extraCost?: number;
  /** Lançable d'ici seulement avec la distorsion (Timeline Culler, depuis le cimetière). */
  warpOnly?: boolean;
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
  /** Points de vie payés en plus (Wickerfolk Indomitable, depuis le cimetière). */
  payLife?: number;
  /** Seulement au moment où l'on pourrait lancer un rituel (carte complotée). */
  sorceryTiming?: boolean;
  /** Exilé au lieu d'aller au cimetière (Quistis Trepe). */
  exileAfter?: boolean;
  /** Le permanent arrive avec un marqueur de finalité (Noctis). */
  finality?: boolean;
}

/** 702.170 : la carte (depuis la main ou la pile) est exilée face visible et devient complotée. */
export function plotCard(s: GameState, id: ObjectId): ObjectId | null {
  const o = s.objects[id];
  if (!o) return null;
  const player = o.owner;
  const onStack = s.stack.findIndex((x) => x.id === id);
  if (onStack >= 0) s.stack.splice(onStack, 1);
  // Déjà exilée (Kellan Joins Up : « exilez une carte de votre main ; elle devient complotée ») : elle reste là.
  const exiled = o.zone === "exile" ? id : moveObject(s, id, "exile");
  const card = exiled ? s.objects[exiled] : undefined;
  if (!card) return null;
  card.plottedTurn = s.turn.number;
  emit({ type: "plotted", player, defId: card.defId });
  rulesEvent(s, { e: "plotted", card: card.id });
  // « Quand cette carte devient complotée » : la carte est en exil, la capacité se déclenche de là.
  for (const ab of s.defs[card.defId]?.abilities ?? []) {
    if (ab.kind === "triggered" && ab.trigger.on === "plottedSelf") {
      pushInline(s, player, card.id, card.defId, { targets: ab.targets, effects: ab.effects, label: ab.label });
    }
  }
  return card.id;
}

/** D'où, et à quelles conditions, ce joueur peut-il lancer cette carte ? */
/** 702.61 : un sort avec le second partagé est sur la pile — seules les capacités de mana restent possibles. */
export function splitSecondOnStack(s: GameState): boolean {
  // Yuriko, Blade of the Mighty : « pendant le combat, les joueurs ne peuvent ni lancer de sorts ni activer de capacités (hors mana) ».
  const combatSteps = ["beginCombat", "declareAttackers", "declareBlockers", "firstStrikeDamage", "combatDamage", "endCombat"];
  if (combatSteps.includes(s.turn.step) && s.playerOrder.some((p) => playerStatic(s, p, "noSpellsDuringCombat"))) return true;
  return s.stack.some((item) => {
    if (item.kind !== "spell") return false;
    const d = s.defs[item.sourceDefId];
    const instantOrSorcery = !!d && (d.types.includes("Instant") || d.types.includes("Sorcery"));
    return instantOrSorcery && playerStatic(s, item.controller, "splitSecondInstantsSorceries");
  });
}

/** Contexte minimal pour évaluer un montant hors résolution (réductions de coût). */
function reductionContext(controller: PlayerId, sourceId: string, sourceDefId: string) {
  return {
    controller,
    sourceId,
    sourceDefId,
    sourceSnapshot: { keywords: [], power: 0 },
    targets: {},
    x: 0,
    kicked: false,
  };
}

/** « Cette capacité coûte {N} de moins à activer » (Starport Security, Survey Mechan, The Dominion Bracelet). */
export function abilityReduction(s: GameState, player: PlayerId, source: ObjectId, ab: ActivatedAbilityDef): number {
  // Boom Scholar : les capacités d'exhaust de vos autres permanents coûtent moins.
  const exhaust = ab.exhaust
    ? controlledAbilitiesWithSource(s, player).reduce(
        (n, { id, ab: x }) => n + (x.kind === "playerStatic" && id !== source ? (x.exhaustReduction ?? 0) : 0),
        0,
      )
    : 0;
  const red = ab.reduction;
  const tax = chosenNameTax(s, source);
  if (!red) return exhaust - tax;
  if (red.condition && !checkCondition(s, red.condition, player, source)) return 0;
  return (
    exhaust - tax + Math.max(0, evalAmount(s, reductionContext(player, source, s.objects[source]?.defId ?? ""), red.generic))
  );
}

/** Elvish Refueler : pendant votre tour, tant qu'aucune capacité d'exhaust n'a été activée ce tour-ci. */
function exhaustReusable(s: GameState, player: PlayerId, ab: ActivatedAbilityDef): boolean {
  return (
    !!ab.exhaust &&
    s.turn.active === player &&
    !(s.players[player]?.turnStats.exhaustActivated ?? 0) &&
    playerStatic(s, player, "exhaustReuse")
  );
}

/**
 * Distorsion d'une carte : la sienne, ou celle qu'accorde Tannuk, Steadfast Second aux cartes de votre main
 * (« les cartes d'artefact et de créature rouges de votre main ont la distorsion {2}{R} »).
 */
export function warpOf(s: GameState, player: PlayerId, card: ObjectId, d: CardDef): CardDef["warp"] {
  if (d.warp) return d.warp;
  const o = s.objects[card];
  if (o?.zone !== "hand") return undefined;
  for (const ab of controlledAbilities(s, player)) {
    if (ab.kind === "playerStatic" && ab.grantWarp && matchesView(spellView(d, player), ab.grantWarp.filter, player)) {
      return { cost: ab.grantWarp.cost };
    }
  }
  return undefined;
}

/** Sort face cachée (déguisement) : la définition « face cachée », au coût de {3} (702.168a). */
export const FACE_DOWN_SPELL: CardDef = { ...FACE_DOWN_DEF, manaCost: { generic: 3, colored: {}, x: 0 }, manaCostText: "{3}" };

/**
 * Faces lançables d'une carte : la carte elle-même (recto) et, pour une aventure, l'aventure (face 1), sauf si la
 * carte est déjà « en aventure » (on ne peut alors lancer que la créature).
 */
export function castableFaces(s: GameState, card: ObjectId, d: CardDef): [number | undefined, CardDef][] {
  const o = s.objects[card];
  const adventure = d.layout === "adventure" ? d.faceDefs?.[1] : undefined;
  // Carte de terrain à aventure (Villes de FIN) : seule l'Aventure se lance.
  if (d.types.includes("Land")) return adventure && !o?.onAdventure ? [[1, adventure]] : [];
  if (adventure && !o?.onAdventure)
    return [
      [undefined, d],
      [1, adventure],
    ];
  // Carte scindée (709.3) : l'une ou l'autre moitié se lance (portes d'une Salle comprises).
  if (d.layout === "split" && d.faceDefs?.length === 2)
    return [
      [0, d.faceDefs[0] as CardDef],
      [1, d.faceDefs[1] as CardDef],
    ];
  // Carte recto-verso modale (712.12) : l'une ou l'autre face se lance.
  const back = d.layout === "modal_dfc" ? d.faceDefs?.[1] : undefined;
  if (back && !back.types.includes("Land"))
    return [
      [undefined, d],
      [1, back],
    ];
  return [[undefined, d]];
}

/** Grand Abolisher : le joueur actif empêche ses adversaires de lancer des sorts ou d'activer ces capacités. */
function lockedOut(s: GameState, player: PlayerId): boolean {
  const active = s.turn.active;
  return active !== player && playerStatic(s, active, "lockOpponentsOnYourTurn");
}

export function castTerms(s: GameState, player: PlayerId, card: ObjectId): CastTerms | null {
  if (lockedOut(s, player)) return null;
  // High Noon : « chaque joueur ne peut pas lancer plus d'un sort à chaque tour ».
  if ((s.players[player]?.turnStats.spellsCast ?? 0) >= 1 && s.playerOrder.some((p) => playerStatic(s, p, "oneSpellPerTurn")))
    return null;
  const terms = baseCastTerms(s, player, card);
  // Weftwalking : « le premier sort que chaque joueur lance pendant chacun de ses tours peut être lancé sans payer ».
  if (
    terms &&
    !terms.free &&
    s.turn.active === player &&
    (s.players[player]?.turnStats.spellsCast ?? 0) === 0 &&
    s.playerOrder.some((p) => playerStatic(s, p, "firstSpellFree"))
  ) {
    return { ...terms, freeOptional: true };
  }
  return terms;
}

function baseCastTerms(s: GameState, player: PlayerId, card: ObjectId): CastTerms | null {
  const o = s.objects[card];
  if (!o) return null;
  const d = s.defs[o.defId];
  if (!d) return null;
  if (d.castCondition && !checkCondition(s, d.castCondition, player, card)) return null;
  if (o.zone === "hand") {
    if (o.owner !== player) return null;
    // Buster Sword : un sort de votre main sans payer son coût de mana, ce tour-ci.
    const handPerm = exilePermission(s, player, card);
    if (handPerm) return { source: "hand", free: handPerm.free, anyTime: handPerm.anyTime };
    // Omnipresence : seulement si la valeur de mana ne dépasse pas le nombre de créatures que vous contrôlez.
    const creatures = () => s.battlefield.filter((id) => obj(s, id).controller === player && isCreature(s, id)).length;
    const free = controlledAbilities(s, player).some(
      (ab) =>
        ab.kind === "castPermission" &&
        ab.freeFromHand &&
        (!ab.freeMaxManaValueCreatures || manaValue(d.manaCost) <= creatures()),
    );
    return { source: "hand", freeOptional: free || undefined };
  }
  if (o.zone === "graveyard") {
    // Tinybones, the Pickpocket : une carte d'un autre cimetière, lançable avec du mana de n'importe quel type.
    const gyPerm = exilePermission(s, player, card);
    if (gyPerm) return { source: "graveyard", anyMana: gyPerm.anyMana, free: gyPerm.free, exileAfter: gyPerm.exileAfter };
    if (o.owner !== player) return null;
    if (s.turn.mayCastFromGraveyard?.includes(card)) return { source: "graveyard" };
    // Timeline Culler : « vous pouvez lancer cette carte depuis votre cimetière avec sa distorsion ».
    if (d.warp?.fromGraveyard) return { source: "graveyard", warpOnly: true };
    // Archmage's Newt : flashback {0}.
    if (s.turn.freeFlashbackGranted?.includes(card)) return { source: "flashback", free: true };
    if (d.flashback || s.turn.flashbackGranted?.includes(card)) return { source: "flashback" };
    const t = graveyardTypeAvailable(s, player, card);
    if (t && t !== "Land") return { source: "graveyard", graveyardType: t };
    // Hades, Sorcerer of Eld : « pendant votre tour, vous pouvez jouer des cartes depuis votre cimetière ».
    if (playerStatic(s, player, "playFromGraveyard")) return { source: "graveyard" };
    // Noctis, Prince of Lucis : les sorts d'artefact, en payant des PV en plus, avec un marqueur de finalité.
    const noctis = d.types.includes("Artifact")
      ? controlledAbilitiesWithSource(s, player).find(({ ab }) => ab.kind === "playerStatic" && !!ab.artifactsFromGraveyardLife)
          ?.ab
      : undefined;
    if (noctis?.kind === "playerStatic" && noctis.artifactsFromGraveyardLife) {
      if ((s.players[player]?.life ?? 0) < noctis.artifactsFromGraveyardLife) return null;
      return { source: "graveyard", payLife: noctis.artifactsFromGraveyardLife, finality: true };
    }
    const fromGy = d.castFromGraveyard;
    if (fromGy && (!fromGy.condition || checkCondition(s, fromGy.condition, player, card))) {
      // Wickerfolk Indomitable : « en payant 2 PV et en sacrifiant un artefact ou une créature en plus ».
      if (fromGy.payLife && (s.players[player]?.life ?? 0) < fromGy.payLife) return null;
      return { source: "graveyard", payLife: fromGy.payLife };
    }
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
    // The Lunar Whale : « vous pouvez jouer la carte du dessus de votre bibliothèque » (si elle a attaqué ce tour-ci).
    if (o.owner === player && top === card && topCardPlayable(s, player, card)) return { source: "library" };
    // Mm'menon, the Right Hand : « vous pouvez lancer des sorts d'artefact depuis le dessus de votre bibliothèque ».
    if (o.owner === player && top === card && d.types.includes("Artifact") && playerStatic(s, player, "castArtifactsFromTop")) {
      return { source: "library" };
    }
    return null;
  }
  if (o.zone === "exile") {
    // 702.170d : une carte complotée se lance sans payer son coût, à un tour ultérieur, au moment d'un rituel.
    if (o.plottedTurn !== undefined) {
      return o.owner === player && o.plottedTurn < s.turn.number ? { source: "exile", free: true, sorceryTiming: true } : null;
    }
    // Reality Fracture : la copie du sort d'un permanent préparé, lançable par le contrôleur actuel de ce permanent.
    if (o.preparedFor) {
      const perm = s.objects[o.preparedFor];
      return perm?.zone === "battlefield" && perm.controller === player && perm.preparedCopy === card
        ? { source: "exile" }
        : null;
    }
    // Null Summoner : la carte exilée et liée, lançable sous condition, avec du mana de n'importe quel type.
    for (const id of s.battlefield) {
      const src = obj(s, id);
      if (src.controller !== player || !src.linked?.includes(card)) continue;
      const ab = chars(s, id).abilities.find((a) => a.kind === "castPermission" && a.linkedCards);
      if (ab?.kind === "castPermission" && (!ab.condition || checkCondition(s, ab.condition, player, id))) {
        return { source: "exile", anyMana: true };
      }
    }
    // 715.4 : la carte « en aventure » : son propriétaire peut lancer la créature.
    if (o.onAdventure && o.owner === player) return { source: "exile" };
    // 702.185a : exilée par la distorsion, lançable depuis l'exil à partir du tour suivant.
    if (o.warpExiledTurn !== undefined && o.owner === player && s.turn.number > o.warpExiledTurn) return { source: "exile" };
    const perm = exilePermission(s, player, card);
    if (perm)
      return { source: "exile", free: perm.free, anyTime: perm.anyTime, extraCost: perm.extraCost, anyMana: perm.anyMana };
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
  flashback = false,
): {
  discard?: { count: number; options: ObjectId[] };
  sacrifice?: { count: number; options: ObjectId[]; orPay?: ManaCost; orPayAffordable?: boolean };
} | null {
  // Twinned Vision : « Flashback—{1}{U/R}{U/R}, défaussez une carte ».
  let add = flashback && d.flashbackDiscard ? { ...d.additionalCost, discard: d.flashbackDiscard } : d.additionalCost;
  // Wickerfolk Indomitable : sacrifice supplémentaire quand elle est lancée depuis le cimetière.
  const gySac = s.objects[card]?.zone === "graveyard" ? d.castFromGraveyard?.sacrifice : undefined;
  if (gySac) add = { ...add, sacrifice: { filter: gySac, count: 1 } };
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
  const cardDef = s.defs[o.defId];
  if (!cardDef || (cardDef.types.includes("Land") && cardDef.layout !== "adventure"))
    throw new RulesError("Ce n'est pas un sort");
  if (!cardDef.implemented) throw new RulesError(`${cardDef.name} n'est pas encore géré par le moteur`);
  // Face lancée : la carte elle-même, ou son aventure (715.3).
  const face = castableFaces(s, card, cardDef).find(([f]) => f === choices.face);
  if (!face) throw new RulesError("Cette face ne peut pas être lancée");
  // Déguisement (702.168a) : lancée face cachée comme une créature 2/2 sans nom pour {3}.
  if (choices.faceDown && !cardDef.disguise) throw new RulesError("Cette carte ne peut pas être lancée face cachée");
  // Distorsion (702.185) : depuis la main (ou le cimetière si la carte le permet), pour son coût de distorsion.
  const warp = choices.warp ? warpOf(s, player, card, cardDef) : undefined;
  if (choices.warp && (!warp || (terms.source !== "hand" && !(terms.source === "graveyard" && warp.fromGraveyard)))) {
    throw new RulesError("Cette carte ne peut pas être lancée avec la distorsion");
  }
  if (terms.warpOnly && !choices.warp) throw new RulesError("Cette carte ne se lance d'ici qu'avec la distorsion");
  if (warp?.life && (s.players[player]?.life ?? 0) < warp.life) throw new RulesError("Pas assez de points de vie");
  const d = choices.faceDown ? FACE_DOWN_SPELL : warp ? { ...face[1], manaCost: warp.cost } : face[1];
  if (splitSecondOnStack(s)) throw new RulesError("Aucun sort ni capacité maintenant (second partagé ou combat)");
  // Harbinger of the Tides : « comme s'il avait le flash si vous payez {2} de plus ».
  const flashExtra = !terms.anyTime && !canCastTiming(s, player, d) ? d.flashExtraCost : undefined;
  if (!terms.anyTime && !canCastTiming(s, player, d) && !flashExtra)
    throw new RulesError("Vous ne pouvez pas lancer ce sort maintenant");
  if (terms.sorceryTiming && !sorceryTiming(s, player)) throw new RulesError("Seulement au moment d'un rituel");
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
  // Kicker sans mana : le permanent à sacrifier ou à renvoyer (choisi automatiquement : le moins cher, jeton d'abord).
  const kickerPermanent = kicked && d.kickerCost ? kickerCostPermanent(s, player, card, d, flatTargets(targets)) : undefined;
  if (kicked && d.kickerCost && !kickerPermanent) throw new RulesError("Impossible de payer le kicker");

  // Coûts additionnels : vérifiés avant tout changement d'état.
  const opts = additionalOptions(s, player, card, d, flashback);
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
  let cost = spellCost(s, player, d, {
    x,
    kicked,
    flashback,
    free,
    alternative,
    anyMana: terms.anyMana,
    targets,
    fromZone: terms.source,
  });
  // Terror of the Peaks : « les sorts de vos adversaires qui ciblent cette créature coûtent 3 PV de plus ».
  const lifeTax = flatTargets(targets).reduce((n, id) => {
    const t = s.objects[id];
    if (t?.zone !== "battlefield" || t.controller === player) return n;
    return n + chars(s, id).abilities.reduce((m, ab) => m + (ab.kind === "playerStatic" ? (ab.targetLifeTax ?? 0) : 0), 0);
  }, 0);
  if (lifeTax > (s.players[player]?.life ?? 0)) throw new RulesError("Pas assez de points de vie");
  // Spree : les coûts supplémentaires des modes choisis (payés même si le sort est gratuit).
  if (mode.extraCost) cost = addCosts(cost, mode.extraCost);
  if (opts.sacrifice?.orPay && sacrifice.length === 0) cost = addCosts(cost, opts.sacrifice.orPay);
  if (flashExtra) cost = addCosts(cost, flashExtra);
  if (terms.extraCost) cost = addCosts(cost, { generic: terms.extraCost, colored: {}, x: 0 });

  // 601.2a : le sort passe sur la pile (nouvel objet), puis on paie les coûts (601.2g–h).
  if (terms.graveyardType) s.turn.graveyardTypesUsed = [...(s.turn.graveyardTypesUsed ?? []), terms.graveyardType];
  if (terms.removeCounters) removeCountersAmongCreatures(s, player, terms.removeCounters);
  const view = spellView(d, player);
  // Lancer la copie d'un sort préparé dé-prépare son permanent (même si le sort est ensuite contrecarré).
  const preparedFor = o.preparedFor ? s.objects[o.preparedFor] : undefined;
  if (preparedFor?.preparedCopy === card) delete preparedFor.preparedCopy;
  // Permission à usage unique (Buster Sword) : les autres cartes du groupe la perdent.
  const group = exilePermission(s, player, card)?.group;
  if (group) s.playPermissions = (s.playPermissions ?? []).filter((p) => p.group !== group);
  const stackId = moveObject(s, card, "stack", { controller: player }) as string;
  // Seule une Aventure part « en aventure » ; un présage (même disposition Scryfall) est mélangé dans la bibliothèque.
  const adventure = choices.face !== undefined && cardDef.layout === "adventure" && d.subtypes.includes("Adventure");
  if (choices.face !== undefined) obj(s, stackId).faceDefId = d.id;
  if (choices.faceDown && cardDef.disguise) {
    const spellObj = obj(s, stackId);
    s.defs[FACE_DOWN_ID] ??= FACE_DOWN_DEF;
    spellObj.faceDown = { card: spellObj.defId, ward: true, upCosts: [cardDef.disguise] };
    spellObj.defId = FACE_DOWN_ID;
  }
  // Theorist's Proxy : « le prochain sort que vous lancez ce tour-ci ne peut pas être contrecarré ».
  const caster0 = s.players[player];
  const uncounterable = caster0?.nextSpellUncounterableTurn === s.turn.number;
  if (caster0 && uncounterable) delete caster0.nextSpellUncounterableTurn;
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
    // Quistis Trepe : exilé en quittant la pile, comme un flashback.
    flashback: flashback || !!terms.exileAfter,
    arrival: arrivalFor(s, player, d, terms),
    adventure: adventure || undefined,
    warped: warp ? true : undefined,
    manaSpent: free ? 0 : manaValue(cost),
    fromHand: terms.source === "hand" || undefined,
    // Permanents sacrifiés comme coût additionnel (« si le permanent sacrifié était un Véhicule »).
    sacrificed: sacrifice.length ? [...sacrifice] : undefined,
    uncounterable: uncounterable || undefined,
  };
  s.stack.push(item);
  try {
    const used = payMana(s, player, cost, undefined, {
      spell: view,
      convoke: d.keywords.includes("convoke"),
      fromHand: terms.source === "hand",
    });
    // Effets associés au mana dépensé, si ce sort correspond (Carnelian Orb, Pyromancer's Goggles).
    const riders = used.flatMap((ab) => (ab.rider && matchesView(view, ab.rider.spell, player) ? [ab.rider.effect] : []));
    if (riders.length) item.riders = riders;
  } catch {
    throw new RulesError("Mana insuffisant");
  }
  // Distorsion « Warp—{B}, Pay 2 life » : les points de vie font partie du coût.
  if (warp?.life) loseLife(s, player, warp.life);
  if (terms.payLife) loseLife(s, player, terms.payLife);
  if (lifeTax) loseLife(s, player, lifeTax);
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
    announceDiscardBatch(s, player, discard.length);
  }
  for (const id of sacrifice) sacrificePermanent(s, id);
  if (kickerPermanent && d.kickerCost?.sacrifice) sacrificePermanent(s, kickerPermanent);
  else if (kickerPermanent) moveObject(s, kickerPermanent, "hand");
  s.priority.passes = 0;
  emit({ type: "cast", player, stackId, defId: d.id, targets: flatTargets(targets) });
  const caster = s.players[player];
  const instantOrSorcery = d.types.includes("Instant") || d.types.includes("Sorcery");
  const before = caster?.turnStats.instantSorceryCast ?? 0;
  if (caster) {
    caster.turnStats.spellsCast += 1;
    if (d.types.includes("Creature") && d.supertypes.includes("Legendary"))
      caster.turnStats.legendaryCreatureSpells = (caster.turnStats.legendaryCreatureSpells ?? 0) + 1;
    if (terms.source === "hand") caster.turnStats.handSpells = (caster.turnStats.handSpells ?? 0) + 1;
    bump(s); // des capacités statiques en dépendent (« si vous avez lancé deux sorts ce tour-ci »)
    if (warp) s.turn.spellWarped = true;
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
  return {
    generic: a.generic + b.generic,
    colored,
    x: a.x,
    hybrid: [...(a.hybrid ?? []), ...(b.hybrid ?? [])],
    twoHybrid: [...(a.twoHybrid ?? []), ...(b.twoHybrid ?? [])],
  };
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
  checkCrime(s, controller, all);
}

/** 701.5 : contrecarre l'élément de pile ; un sort contrecarré va au cimetière (exil s'il a été lancé en flashback). */
export function counterItem(s: GameState, id: string, by: string, exile = false): boolean {
  const i = s.stack.findIndex((x) => x.id === id);
  const item = s.stack[i];
  if (!item || s.resolving?.item.id === id) return false;
  if (item.kind === "spell" && (s.defs[item.sourceDefId]?.cantBeCountered || item.uncounterable)) return false;
  // Frenzied Baloth : « les sorts de créature que vous contrôlez ne peuvent pas être contrecarrés ».
  if (
    item.kind === "spell" &&
    s.defs[item.sourceDefId]?.types.includes("Creature") &&
    playerStatic(s, item.controller, "protectCreatureSpells")
  ) {
    return false;
  }
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
  if (item.kind === "spell" && s.objects[item.sourceId])
    moveObject(s, item.sourceId, item.flashback || exile ? "exile" : "graveyard");
  return true;
}

/** « Renvoyez le sort ciblé dans la main de son propriétaire » : une copie cesse d'exister. */
export function bounceSpell(s: GameState, id: string): void {
  const i = s.stack.findIndex((x) => x.id === id);
  const item = s.stack[i];
  if (item?.kind !== "spell" || s.resolving?.item.id === id) return;
  s.stack.splice(i, 1);
  if (s.objects[item.sourceId]) moveObject(s, item.sourceId, "hand");
  bump(s);
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

export function tapOthersOptions(s: GameState, player: PlayerId, source: ObjectId, ab: ActivatedAbilityDef): ObjectId[] {
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
    .sort((a, b) => crewPower(s, a) - crewPower(s, b));
  const out: ObjectId[] = [];
  let total = 0;
  for (const id of ids) {
    if (total >= n) break;
    out.push(id);
    total += Math.max(0, crewPower(s, id));
  }
  return total >= n ? out : null;
}

/** Force comptée pour monter et équiper : endurance (Interface Ace), +2 pour les pilotes. */
function crewPower(s: GameState, id: ObjectId): number {
  const c = chars(s, id);
  return (c.keywords.includes("crewWithToughness") ? c.toughness : c.power) + (c.keywords.includes("crewPlus2") ? 2 : 0);
}

/** Une source dont le nom a été choisi par un Sorcerous Spyglass. */
function spyglassed(s: GameState, source: ObjectId): boolean {
  const name = s.objects[source] && chars(s, source).name;
  return s.battlefield.some((id) => {
    const o = obj(s, id);
    const d = s.defs[o.defId];
    return o.chosen?.cardName === name && d?.chooseOnEnter === "cardName" && !d.chosenNameTax;
  });
}

/** Skyseer's Chariot : {N} de plus pour les capacités activées des sources du nom choisi. */
function chosenNameTax(s: GameState, source: ObjectId): number {
  const name = s.objects[source] && chars(s, source).name;
  return s.battlefield.reduce((n, id) => {
    const o = obj(s, id);
    const tax = s.defs[o.defId]?.chosenNameTax ?? 0;
    return n + (tax && o.chosen?.cardName === name ? tax : 0);
  }, 0);
}

/** Jace's Machinations : capacité de loyauté d'un Jace activable à vitesse d'éphémère ce tour-ci. */
export function instantLoyalty(s: GameState, player: PlayerId, source: ObjectId, ab: ActivatedAbilityDef): boolean {
  return (
    ab.cost.loyalty !== undefined &&
    s.players[player]?.jaceInstantTurn === s.turn.number &&
    chars(s, source).subtypes.includes("Jace")
  );
}

/** Cartes de votre cimetière exilables pour le coût (« exilez une autre carte de créature de votre cimetière ») : les moins chères d'abord. */
function graveyardExileOptions(s: GameState, source: ObjectId, ab: ActivatedAbilityDef): ObjectId[] {
  const f = ab.cost.exileFromGraveyard;
  const o = s.objects[source];
  if (!f || !o) return [];
  return (s.players[o.owner]?.graveyard ?? [])
    .filter((id) => id !== source && matchesCard(s, o.owner, id, { ...f.filter, controller: undefined }))
    .sort((a, b) => manaValue(s.defs[obj(s, a).defId]?.manaCost) - manaValue(s.defs[obj(s, b).defId]?.manaCost));
}

/** Permanent dont on retire un marqueur pour le coût (celui qui en porte le plus). */
function counterSource(s: GameState, player: PlayerId, source: ObjectId, ab: ActivatedAbilityDef): ObjectId | null {
  const c = ab.cost.removeCounterFrom;
  if (!c) return null;
  const ids = s.battlefield
    .filter(
      (id) =>
        obj(s, id).controller === player &&
        (obj(s, id).counters[c.kind] ?? 0) > 0 &&
        matchesObjectFilter(s, player, id, c.filter, source),
    )
    .sort((a, b) => (obj(s, b).counters[c.kind] ?? 0) - (obj(s, a).counters[c.kind] ?? 0));
  return ids[0] ?? null;
}

/** Zone d'où s'active une capacité : champ de bataille, cimetière ou main. */
export function abilityZone(ab: ActivatedAbilityDef): "battlefield" | "graveyard" | "hand" {
  return ab.fromGraveyard ? "graveyard" : ab.fromHand ? "hand" : "battlefield";
}

/** Les coûts non-mana de la capacité peuvent-ils être payés ? */
export function canPayNonManaCost(s: GameState, source: ObjectId, ab: ActivatedAbilityDef, index = -1): boolean {
  const o = s.objects[source];
  if (!o || o.zone !== abilityZone(ab)) return false;
  if (o.zone === "battlefield" && !ab.specialAction && chars(s, source).keywords.includes("noActivatedAbilities")) return false;
  if (ab.once && o.used?.includes(index) && !exhaustReusable(s, o.controller, ab)) return false;
  if (
    o.zone === "battlefield" &&
    lockedOut(s, o.controller) &&
    chars(s, source).types.some((t) => t === "Artifact" || t === "Creature" || t === "Enchantment")
  )
    return false;
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
  if (ab.cost.exileFromGraveyard && graveyardExileOptions(s, source, ab).length < ab.cost.exileFromGraveyard.count) return false;
  if (ab.cost.removeCounterFrom && !counterSource(s, who, source, ab)) return false;
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
    !instantLoyalty(s, player, source, ab) &&
    !(s.turn.active === player && (s.turn.step === "main1" || s.turn.step === "main2") && s.stack.length === 0)
  ) {
    throw new RulesError("Cette capacité s'active seulement en rituel");
  }
  if (!canPayNonManaCost(s, source, ab, index)) throw new RulesError("Impossible de payer le coût");
  if (splitSecondOnStack(s)) throw new RulesError("Aucun sort ni capacité maintenant (second partagé ou combat)");
  let sacrificed: ObjectId[] = [];
  if (ab.cost.sacrifice) {
    const options = sacrificeOptions(s, player, source, ab);
    sacrificed = choices.sacrifice ?? options.slice(0, ab.cost.sacrifice.count);
    if (sacrificed.length !== ab.cost.sacrifice.count || sacrificed.some((id) => !options.includes(id))) {
      throw new RulesError("Sacrifice invalide");
    }
  }
  const targets = validateTargets(s, player, ab.targets, choices.targets, { sourceId: source });
  const x =
    ab.cost.mana?.x || ab.cost.loyaltyX || ab.cost.tapX || ab.cost.exileFromGraveyardX || ab.cost.sacrificeX
      ? Math.max(0, Math.floor(choices.x ?? 0))
      : 0;
  if (ab.cost.sacrificeX && x < 1) throw new RulesError("Sacrifiez au moins un permanent");
  if (ab.cost.loyaltyX && x > (o.counters.loyalty ?? 0)) throw new RulesError("Pas assez de marqueurs de loyauté");
  const c = chars(s, source);
  // Action spéciale (116.2, déverrouiller une porte) : les coûts sont payés, les effets s'appliquent sans la pile.
  if (ab.specialAction) {
    if (ab.cost.mana) {
      // Doc Aurlock : comploter depuis la main coûte {2} de moins.
      const plotReduction = ab.effects.some((e) => e.op === "plot")
        ? controlledAbilitiesWithSource(s, player).reduce(
            (n, { ab: x }) => n + (x.kind === "playerStatic" ? (x.plotReduction ?? 0) : 0),
            0,
          )
        : 0;
      try {
        payMana(s, player, totalCost(ab.cost.mana, 0, undefined, plotReduction), undefined, { abilitySource: source });
      } catch {
        throw new RulesError("Mana insuffisant");
      }
    }
    for (const e of ab.effects) {
      if (e.op === "unlockDoor") unlockDoor(s, source, e.door);
      if (e.op === "turnFaceUp") turnFaceUp(s, source);
      if (e.op === "plot") plotCard(s, source);
    }
    s.priority.passes = 0;
    return;
  }
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
  // Permanents à engager : choisis par le joueur (station), sinon automatiquement.
  const tapOptions = ab.cost.tapOthers ? tapOthersOptions(s, player, source, ab) : [];
  const tapOthers = ab.cost.tapOthers
    ? choices.tap?.length
      ? choices.tap
      : [...tapOptions].sort((a, b) => chars(s, b).power - chars(s, a).power).slice(0, ab.cost.tapOthers.count)
    : [];
  if (
    ab.cost.tapOthers &&
    (tapOthers.length !== ab.cost.tapOthers.count ||
      new Set(tapOthers).size !== tapOthers.length ||
      tapOthers.some((id) => !tapOptions.includes(id)))
  ) {
    throw new RulesError("Permanents à engager invalides");
  }
  const crew = ab.cost.crew !== undefined ? (crewOptions(s, player, source, ab.cost.crew) ?? []) : [];
  if (ab.cost.mana) {
    const reserved = new Set([...sacrificed, ...tapOthers, ...crew, ...(ab.cost.tap ? [source] : [])]);
    try {
      // Warrior's Blades : {1} de moins par marqueur +1/+1 sur la créature ciblée.
      const t = ab.reduceByTargetCounters ? targets.t?.[0] : undefined;
      const reduction =
        (t ? (s.objects[t]?.counters["+1/+1"] ?? 0) : 0) +
        abilityReduction(s, player, source, ab) +
        equipDiscount(s, player, ab, targets.t?.[0]);
      payMana(s, player, totalCost(ab.cost.mana, x, undefined, reduction), reserved, { abilitySource: source });
    } catch {
      throw new RulesError("Mana insuffisant");
    }
  }
  if (ab.cost.tap) tapObject(s, o);
  if (ab.cost.tapAttached && o.attachedTo) tapObject(s, obj(s, o.attachedTo));
  if (ab.cost.loyalty !== undefined) {
    o.loyaltyTurn = s.turn.number;
    const cost = ab.cost.loyaltyX ? -x : ab.cost.loyalty;
    if (cost !== 0) changeCounters(s, o, "loyalty", cost);
    const pl = s.players[player];
    if (pl) pl.turnStats.loyaltyActivations += 1;
    rulesEvent(s, { e: "loyalty", player, sourceId: source, cost });
  }
  if (ab.once && !o.used?.includes(index)) o.used = [...(o.used ?? []), index];
  if (ab.exhaust) {
    const pl = s.players[player];
    const stats = pl?.turnStats;
    if (stats) stats.exhaustActivated = (stats.exhaustActivated ?? 0) + 1;
    rulesEvent(s, { e: "exhaust", player, source });
    // Pit Automaton : la prochaine capacité d'exhaust de ce tour est copiée (mêmes cibles).
    if (pl?.copyNextExhaustTurn === s.turn.number) {
      pl.copyNextExhaustTurn = undefined;
      s.stack.push({ ...item, id: newId(s, "copy"), copy: true, targets: { ...item.targets } });
    }
  }
  if (ab.oncePerTurn) o.activatedTurn = { ...(o.activatedTurn ?? {}), [index]: s.turn.number };
  if (ab.cost.addCounters) changeCounters(s, o, ab.cost.addCounters.kind, ab.cost.addCounters.n);
  for (const id of crew) tapObject(s, obj(s, id));
  if (crew.length) {
    o.crewedBy = { turn: s.turn.number, ids: [...crew] };
    rulesEvent(s, { e: "crewed", vehicle: source, crew: [...crew] });
  }
  if (ab.cost.exertSelf) o.exerted = true;
  if (ab.cost.removeCounters) changeCounters(s, o, ab.cost.removeCounters.kind, -ab.cost.removeCounters.n);
  if (ab.cost.payLife) loseLife(s, player, ab.cost.payLife);
  for (const id of tapOthers) tapObject(s, obj(s, id));
  // Les permanents sacrifiés restent consultables (dernières informations connues : « sa endurance »).
  item.sacrificed = sacrificed.length ? [...sacrificed] : undefined;
  item.tappedForCost = tapOthers.length ? [...tapOthers] : undefined;
  for (const id of sacrificed) sacrificePermanent(s, id);
  if (ab.cost.sacrificeSelf) sacrificePermanent(s, source);
  // La source quitte sa zone pour payer le coût : on garde ses dernières informations (« cette carte », où qu'elle soit).
  if (ab.cost.exileSelf || ab.cost.discardSelf || ab.cost.bounceSelf) s.lki[source] ??= snapshot(s, source);
  if (ab.cost.exileFromGraveyard) {
    for (const id of graveyardExileOptions(s, source, ab).slice(0, ab.cost.exileFromGraveyard.count)) moveObject(s, id, "exile");
  }
  // « Retirez un marqueur d'une créature que vous contrôlez » : celle qui en porte le plus.
  const counterFrom = ab.cost.removeCounterFrom ? counterSource(s, player, source, ab) : null;
  if (counterFrom && ab.cost.removeCounterFrom) changeCounters(s, obj(s, counterFrom), ab.cost.removeCounterFrom.kind, -1);
  // « Engagez X artefacts dégagés » : X choisi à l'activation.
  if (ab.cost.tapX) {
    const f = ab.cost.tapX;
    const options = s.battlefield.filter(
      (id) =>
        id !== source && obj(s, id).controller === player && !obj(s, id).tapped && matchesObjectFilter(s, player, id, f, source),
    );
    const chosen = choices.tap?.length === x ? choices.tap : options.slice(0, x);
    if (chosen.length < x || chosen.some((id) => !options.includes(id)))
      throw new RulesError("Pas assez de permanents à engager");
    for (const id of chosen) tapObject(s, obj(s, id));
  }
  // Winter, Cursed Rider : « exilez X cartes d'artefact de votre cimetière » (choisies automatiquement).
  if (ab.cost.exileFromGraveyardX) {
    const f = ab.cost.exileFromGraveyardX;
    const options = (s.players[player]?.graveyard ?? []).filter((id) => id !== source && matchesCard(s, player, id, f, source));
    if (options.length < x) throw new RulesError("Pas assez de cartes à exiler");
    for (const id of options.slice(0, x)) moveObject(s, id, "exile");
  }
  // Radiant Lotus : « sacrifiez un ou plusieurs artefacts » (les autres d'abord, la source en dernier).
  if (ab.cost.sacrificeX) {
    const f = ab.cost.sacrificeX;
    const options = s.battlefield
      .filter((id) => obj(s, id).controller === player && matchesObjectFilter(s, player, id, f, source))
      .sort((a, b) => (a === source ? 1 : 0) - (b === source ? 1 : 0));
    if (options.length < x) throw new RulesError("Pas assez de permanents à sacrifier");
    item.sacrificed = options.slice(0, x);
    for (const id of options.slice(0, x)) sacrificePermanent(s, id);
  }
  if (ab.cost.exileSelf) moveObject(s, source, "exile");
  if (ab.cost.discardSelf) {
    const card = moveObject(s, source, "graveyard");
    announceDiscard(s, player, card);
    announceDiscardBatch(s, player, 1);
    if (ab.cycling && card) rulesEvent(s, { e: "cycled", player, card, x });
  }
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
    if (d.devour && isPermanentCard(d)) {
      const op: Effect = { op: "devour", filter: d.devour.filter, graveyardUpToX: d.devour.graveyardUpToX };
      return { specs: mode?.targets ?? [], effects: [...effects, op] };
    }
    if (d.entersAsCopyOf && isPermanentCard(d) && !item.copy) {
      return { specs: mode?.targets ?? [], effects: [...effects, { op: "chooseCopy", filter: d.entersAsCopyOf }] };
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
  // 707.10 : la copie d'un sort de permanent devient un jeton en se résolvant (Double Down).
  if (item.kind === "spell" && item.copy && !s.objects[item.sourceId]) {
    const d = s.defs[item.sourceDefId];
    if (d && isPermanentCard(d)) createTokenCopy(s, item.controller, d.id);
    return;
  }
  if (item.kind === "spell" && s.objects[item.sourceId]) {
    const d = s.defs[item.sourceDefId];
    if (d && isPermanentCard(d)) {
      // Verso d'une carte recto-verso modale lancé : le permanent arrive avec cette face.
      const face = s.objects[item.sourceId]?.faceDefId;
      // 303.4f : une Aura arrive attachée à l'objet qu'elle ciblait.
      const enteredId = moveObject(s, item.sourceId, "battlefield", {
        controller: item.controller,
        enters: {
          x: item.x,
          kicked: item.kicked,
          cast: true,
          castFromHand: item.fromHand,
          attachTo: d.enchant ? targets[ENCHANT_SPEC]?.[0] : undefined,
          chosen: chosenFrom(vars),
          manaSpent: item.manaSpent,
          devoured: Number(vars.$devoured?.[0] ?? 0),
          copyOf: vars.$copyOf?.[0] !== undefined ? String(vars.$copyOf[0]) : undefined,
        },
      });
      const arrived = enteredId ? s.objects[enteredId] : undefined;
      if (arrived && item.manaSpent !== undefined) arrived.manaSpent = item.manaSpent;
      // Marqueurs et célérité à l'arrivée (Torgal, Summon: Fenrir, Summon: Brynhildr, Noctis).
      if (arrived && item.arrival) {
        for (const c of item.arrival.counters ?? []) changeCounters(s, arrived, c.kind, c.n);
        if (item.arrival.haste) addEffect(s, [arrived.id], { addKeywords: ["haste"] }, "endOfTurn");
      }
      if (arrived && item.x) arrived.castX = item.x;
      // Mimeoplasm : les cartes exilées en arrivant sont liées au permanent.
      if (arrived && vars["$ids:devoured"]?.length)
        arrived.linked = [...(arrived.linked ?? []), ...vars["$ids:devoured"].map(String)];
      // Distorsion : exilé au début de la prochaine étape de fin.
      if (item.warped && arrived) {
        arrived.warped = true;
        createDelayed(s, item.controller, arrived.id, arrived.defId, {
          targets: [],
          effects: [{ op: "warpExile", what: { kind: "target", id: "w" } }],
          bound: { w: [arrived.id] },
          label: "Distorsion : exilez-le",
        });
      }
      const card = arrived ? s.defs[arrived.defId] : undefined;
      if (face && arrived && card?.layout === "split") {
        // Salle (709.5d) : la porte lancée est déverrouillée à l'arrivée.
        const door = card.faceDefs?.findIndex((f) => f.id === face) ?? -1;
        if (door >= 0) unlockDoor(s, arrived.id, door);
      } else if (face && arrived) {
        arrived.faceDefId = face;
        bump(s);
      }
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
    } else resolvedSpellAway(s, item, d);
  }
}

/**
 * Destination d'un éphémère ou d'un rituel qui a fini de se résoudre : cimetière ; exil pour un flashback ;
 * exil « en aventure » pour une aventure (715.4) ; bibliothèque mélangée pour un présage.
 */
function resolvedSpellAway(s: GameState, item: StackItem, d: CardDef | undefined): void {
  // Esper Origins : exilé, puis sur le champ de bataille transformé avec un marqueur de finalité.
  if (item.toBattlefieldTransformed) {
    const exiled = moveObject(s, item.sourceId, "exile");
    if (exiled)
      moveWithSpec(s, item.controller, exiled, { to: "battlefield", transformed: true, counters: { kind: "finality", n: 1 } });
    return;
  }
  // Lilah : exilé et comploté au lieu d'aller au cimetière.
  if (item.plotOnResolve && !item.flashback) {
    plotCard(s, item.sourceId);
    return;
  }
  // « Exilez [ce sort] » (Step Between Worlds).
  if (d?.exileOnResolve) {
    moveObject(s, item.sourceId, "exile");
    return;
  }
  if (item.adventure && !item.flashback) {
    const id = moveObject(s, item.sourceId, "exile");
    const o = id ? s.objects[id] : undefined;
    if (o) o.onAdventure = true;
    return;
  }
  if (!item.flashback && d?.subtypes.includes("Omen")) {
    const id = moveObject(s, item.sourceId, "library");
    const owner = id ? s.objects[id]?.owner : undefined;
    if (owner) shuffle(s, s.players[owner]?.library ?? []);
    return;
  }
  moveObject(s, item.sourceId, item.flashback ? "exile" : "graveyard");
}
