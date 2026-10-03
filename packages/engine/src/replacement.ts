/**
 * Effets de remplacement et de prévention (614–615).
 *
 * - Portés par une carte : « arrive engagé », « arrive avec N marqueurs » (appliqués pendant le
 *   changement de zone, avant que les capacités déclenchées ne voient l'objet arriver).
 * - Créés par une résolution, jusqu'à la fin du tour : « si elle devait mourir, exilez-la à la place »,
 *   prévention des blessures de combat.
 * - « Au lieu du cimetière » (614.1a) : `replaceGraveyard`, qui applique l'ordre de 616.1 (auto-remplacement
 *   d'abord, puis un seul remplacement choisi pour le joueur affecté).
 * Limite : pour les autres événements (blessures, pioche, PV), plusieurs remplacements s'appliquent dans l'ordre du code.
 */

import { createTokens, gainLife } from "./actions";
import { boardAmount, evalAmount, staticContext } from "./effects";
import { copiableExceptions, copiedDefId, mergeMods } from "./layers";
import { manaValue } from "./mana";
import { changeCounters, chars, moveObject, newId, nextTimestamp, P1P1, setPrepared } from "./state";
import { controlledAbilitiesWithSource, playerStatic } from "./statics";
import { matchesCard, matchesObjectFilter, protectedFrom, sourceView, withChosen } from "./targets";
import { checkCondition } from "./triggers";
import { countTurnEvents } from "./turnlog";
import type { Amount, Color, Condition, GameObject, GameState, LayerMods, ObjectId, PlayerId, TokenSpec, Zone } from "./types";
import { BASIC_LAND_TYPES } from "./types";

/** Contexte d'arrivée sur le champ de bataille (valeur de X, kicker du sort qui arrive). */
export interface EntersContext {
  x?: number;
  kicked?: boolean;
  /** Arrive depuis la résolution d'un sort (« si vous l'avez lancé »). */
  cast?: boolean;
  /** Aura : l'objet auquel elle arrive attachée. */
  attachTo?: string;
  /** Lancé depuis la main (Myojin). */
  castFromHand?: boolean;
  castFromGraveyard?: boolean;
  castFromExile?: boolean;
  /** Choix fait pendant la résolution (« en arrivant, choisissez… »). */
  chosen?: GameObject["chosen"];
  /** Terrain choc : les points de vie ont été payés (sinon il arrive engagé). */
  shockPaid?: boolean;
  /** Mana dépensé pour le lancer (Dyadrine). */
  manaSpent?: number;
  /** Dévorer : nombre de permanents sacrifiés en arrivant. */
  devoured?: number;
  /** Waxen Shapethief : définition copiée en arrivant (couche 1). */
  copyOf?: string;
  /** 707.9b : exceptions copiables du modèle (`copiableExceptions`), reprises par la copie. */
  copyMods?: LayerMods;
  /** Mana dépensé par type et évocation : lus par les conditions des capacités d'arrivée (Deceit). */
  spentColors?: GameObject["spentColors"];
  evoked?: boolean;
  /** Émeute (702.136) : le choix fait en résolvant le sort (sinon le choix par défaut, `defaultRiot`). */
  riot?: "counter" | "haste";
  /** Lancé par Web-slinging ou pour son coût de chaos ; créature renvoyée pour le Web-slinging. */
  castVia?: GameObject["castVia"];
  costBounced?: ObjectId[];
  /**
   * Modifications d'arrivée imposées par l'effet qui le met sur le champ de bataille (614.1c, 614.12) : elles sont en
   * place avant l'événement d'arrivée, que les déclencheurs voient donc (« chaque fois qu'un Zombie arrive »).
   */
  tapped?: boolean;
  /** 508.4 : arrive attaquant ce joueur ou ce planeswalker (sans avoir été déclaré attaquant). */
  attacking?: string;
  counters?: { kind: string; n: number }[];
  mods?: LayerMods;
  /** Les `mods` sont les exceptions d'une copie (jeton copie « sauf que… ») : copiables (707.9b). */
  modsCopiable?: boolean;
  /** Célérité jusqu'à la fin du tour (Summon: Fenrir). */
  haste?: boolean;
  /** Imminence (702.176a) : N marqueurs de temps ; ce n'est pas une créature tant qu'il en a. */
  impending?: number;
  /** « Arrive comme une copie » : le choix a été fait (même s'il était de ne rien copier) ; sinon choix automatique. */
  copyChosen?: boolean;
}

/** Permanents qu'une carte « qui arrive comme une copie de … » peut copier en arrivant sous le contrôle de `controller`. */
export function copyCandidates(s: GameState, controller: PlayerId, cardId: ObjectId): ObjectId[] {
  const d = s.defs[s.objects[cardId]?.defId ?? ""];
  const filter = d?.entersAsCopyOf;
  if (!filter) return [];
  return s.battlefield.filter(
    (id) =>
      id !== cardId &&
      (d.entersAsCopyAnyController || s.objects[id]?.controller === controller) &&
      matchesObjectFilter(s, controller, id, filter, cardId),
  );
}

/** 303.4f : ce qu'une Aura qui arrive sans être lancée peut enchanter (permanents ; pas les Auras de joueur). */
export function auraHosts(s: GameState, controller: PlayerId, cardId: ObjectId): ObjectId[] {
  const enchant = s.defs[s.objects[cardId]?.defId ?? ""]?.enchant;
  if (!enchant || enchant.player) return [];
  return s.battlefield.filter(
    (id) =>
      id !== cardId &&
      !protectedFrom(s, id, sourceView(s, cardId)) &&
      matchesObjectFilter(s, controller, id, enchant.filter, cardId),
  );
}

/** Émeute sans choix fait en résolvant le sort : la célérité si la créature peut encore attaquer ce tour-ci, sinon le
 * marqueur. */
export function defaultRiot(s: GameState, o: GameObject): "counter" | "haste" {
  const early = ["untap", "upkeep", "draw", "main1", "beginCombat"].includes(s.turn.step);
  return s.turn.active === o.controller && early && !chars(s, o.id).keywords.includes("haste") ? "haste" : "counter";
}

/**
 * Montant évalué à l'arrivée, du point de vue de `o` (la source du remplacement).
 * `entering` : l'objet qui arrive, exclu des comptes (« pour chaque Ange que vous contrôlez déjà »).
 */
function amountAtEntry(s: GameState, a: Amount, o: GameObject, ctx: EntersContext, entering?: GameObject): number {
  if (typeof a === "number") return a;
  if (a.kind === "x") return ctx.x ?? 0;
  if (a.kind === "kicked") return ctx.kicked ? a.yes : a.no;
  if (a.kind === "manaSpent") return ctx.manaSpent ?? 0;
  // Scarlet Spider, Ben Reilly : « X étant la valeur de mana de la créature renvoyée » (Web-slinging).
  if (a.kind === "manaValueOf" && a.ref.kind === "costBounced")
    return manaValue(s.defs[s.objects[ctx.costBounced?.[0] ?? ""]?.defId ?? ""]?.manaCost);
  // Convergence : « un marqueur pour chaque couleur de mana dépensée pour le lancer ».
  if (a.kind === "colorsSpent") return (["W", "U", "B", "R", "G"] as const).filter((c) => (ctx.spentColors?.[c] ?? 0) > 0).length;
  // Arithmétique (Slumbering Trudge : « 3 moins X »).
  if (a.kind === "sum") return a.of.reduce<number>((n, x) => n + amountAtEntry(s, x, o, ctx, entering), 0);
  if (a.kind === "neg") return -amountAtEntry(s, a.of, o, ctx, entering);
  if (a.kind === "max") return Math.max(...a.of.map((x) => amountAtEntry(s, x, o, ctx, entering)));
  // Bioengineered Future : terrains arrivés ce tour-ci sous le contrôle de la source.
  if (a.kind === "turnEvents") return countTurnEvents(s, a.query, o.controller);
  if (a.kind === "maxPower") {
    // « la plus grande force parmi les autres créatures que vous contrôlez » (Prime Speaker Zegana)
    const f = withChosen(a.filter, o);
    return Math.max(
      0,
      ...s.battlefield
        .filter((id) => id !== (entering ?? o).id && matchesObjectFilter(s, o.controller, id, f, o.id))
        .map((id) => chars(s, id).power),
    );
  }
  if (a.kind === "count" || a.kind === "totalPower") {
    const f = withChosen(a.filter, o);
    const n = boardAmount(s, { ...a, filter: f }, o.controller, o.id);
    return entering && matchesObjectFilter(s, o.controller, entering.id, f, o.id) ? n - 1 : n;
  }
  // Les autres montants ne dépendent que de l'état de la partie (Gev, Scaled Scorch : « un marqueur pour chaque
  // adversaire qui a perdu des points de vie ce tour-ci »), vus de la source.
  return evalAmount(s, staticContext(s, o.controller, o.id), a);
}

/** Condition d'une capacité « arrive avec » : le kicker et X du sort lancé sont connus à l'arrivée. */
function conditionAtEntry(s: GameState, c: Condition, o: GameObject, ctx: EntersContext): boolean {
  if (c.kind === "kicked") return !!ctx.kicked;
  if (c.kind === "xAtLeast") return (ctx.x ?? 0) >= c.n;
  if (c.kind === "not") return !conditionAtEntry(s, c.cond, o, ctx);
  if (c.kind === "all") return c.of.every((x) => conditionAtEntry(s, x, o, ctx));
  if (c.kind === "any") return c.of.some((x) => conditionAtEntry(s, x, o, ctx));
  return checkCondition(s, c, o.controller, o.id);
}

/** Choix par défaut quand un permanent « à choix » arrive sans résolution : le type ou la couleur les plus présents. */
function defaultChoice(
  s: GameState,
  o: GameObject,
  kind: "creatureType" | "color" | "cardName" | "landName" | "landType" | "parity" | "mode" | "number",
): NonNullable<GameObject["chosen"]> {
  // Multiversal Passage mis en jeu sans avoir été joué : le type de terrain de base le plus présent chez son contrôleur.
  if (kind === "landType") {
    const count = (t: string) =>
      s.battlefield.filter((id) => s.objects[id]?.controller === o.controller && chars(s, id).subtypes.includes(t)).length;
    const best = [...BASIC_LAND_TYPES].sort((a, b) => count(b) - count(a))[0];
    return { landType: best };
  }
  // Siège mis en jeu sans résolution : le premier mode.
  if (kind === "mode") return { mode: s.defs[o.defId]?.enterModes?.[0] ?? "—" };
  // Gollum mis en jeu sans résolution : « pair » par défaut.
  if (kind === "parity") return { parity: "even" };
  // Talion mis en jeu sans résolution : 2.
  if (kind === "number") return { number: 2 };
  // Petrified Hamlet : le nom est choisi par sa capacité déclenchée d'arrivée ; rien avant sa résolution.
  if (kind === "landName") return { cardName: "—" };
  if (kind === "cardName") {
    // Nom le plus présent chez les adversaires (un terrain pour Petrified Hamlet).
    const names = s.battlefield
      .filter((id) => s.objects[id]?.controller !== o.controller)
      .map((id) => s.defs[s.objects[id]?.defId ?? ""]?.name ?? "");
    return { cardName: names[0] ?? "—" };
  }
  const tally = new Map<string, number>();
  const pl = s.players[o.controller];
  const ids = [
    ...s.battlefield.filter((id) => s.objects[id]?.controller === o.controller),
    ...(pl?.hand ?? []),
    ...(pl?.library ?? []),
  ];
  for (const id of ids) {
    const d = s.defs[s.objects[id]?.defId ?? ""];
    if (!d) continue;
    const keys = kind === "color" ? d.colors : d.types.includes("Creature") ? d.subtypes : [];
    for (const k of keys) tally.set(k, (tally.get(k) ?? 0) + 1);
  }
  const best = [...tally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  return kind === "color" ? { color: (best as Color | undefined) ?? "W" } : { creatureType: best ?? "Human" };
}

/** Un remplacement « exilez-le à la place » qui s'applique à un objet sur le point d'aller au cimetière. */
interface GraveyardCandidate {
  /** Contrôleur du remplacement (source, créateur de l'effet) ; absent pour une règle (marqueur de finalité). */
  controller?: PlayerId;
  sourceId?: ObjectId;
  link?: "object" | "uid";
  gainLife?: number;
  createToken?: TokenSpec;
  timestamp: number;
}

/** Destination après les remplacements « au lieu du cimetière » (614.1a, 616.1). */
export interface GraveyardOutcome {
  to: Zone;
  /** Progenitus : mélanger la bibliothèque après le déplacement. */
  shuffle?: boolean;
  /** Source à laquelle lier le nouvel objet (Valgavoth). */
  linkTo?: ObjectId;
}

function graveyardCandidates(s: GameState, o: GameObject): GraveyardCandidate[] {
  const out: GraveyardCandidate[] = [];
  const fromBattlefield = o.zone === "battlefield";
  // Effets créés par une résolution : « si elle devait mourir ce tour-ci, exilez-la à la place » (Lava Coil).
  if (fromBattlefield) {
    for (const r of s.replacements) if (r.kind === "exileIfDies" && r.objects.includes(o.id)) out.push({ timestamp: 0 });
    // 122.1h : marqueur de finalité.
    if ((o.counters.finality ?? 0) > 0) out.push({ timestamp: 0 });
  }
  // Capacités des permanents et emblèmes de chaque joueur.
  const graveyardOwner = o.owner;
  for (const p of s.playerOrder) {
    for (const { id, ab } of controlledAbilitiesWithSource(s, p)) {
      if (ab.kind !== "graveyardReplacement") continue;
      if (ab.fromBattlefield && !fromBattlefield) continue;
      if (ab.graveyardOf === "you" && graveyardOwner !== p) continue;
      if (ab.graveyardOf === "opponent" && graveyardOwner === p) continue;
      if (ab.notControlledByYou && o.controller === p) continue;
      if (ab.condition && !checkCondition(s, ab.condition, p, id)) continue;
      if (ab.filter) {
        const ok = fromBattlefield ? matchesObjectFilter(s, p, o.id, ab.filter, id) : matchesCard(s, p, o.id, ab.filter, id);
        if (!ok) continue;
      }
      out.push({
        controller: p,
        sourceId: id,
        link: ab.link,
        gainLife: ab.gainLife,
        createToken: ab.createToken,
        timestamp: s.objects[id]?.timestamp ?? 0,
      });
    }
  }
  return out;
}

/**
 * 614.1a / 616.1 : l'objet `o` devrait aller au cimetière. On applique d'abord son propre remplacement (616.1a :
 * Progenitus est mélangé dans la bibliothèque) ; sinon, parmi les « exilez-le à la place », le joueur affecté (le
 * contrôleur de l'objet, ou son propriétaire hors du champ de bataille) en choisit un (616.1e). Approximation (choix
 * auto) : il écarte d'abord ceux qui profitent à un adversaire (PV gagnés, carte liée), puis prend le plus ancien. Une
 * fois l'objet exilé, les autres ne s'appliquent plus (616.1f).
 */
export function replaceGraveyard(s: GameState, o: GameObject): GraveyardOutcome {
  if (!o.isToken && s.defs[o.defId]?.shuffleIntoLibrary) return { to: "library", shuffle: true };
  const candidates = graveyardCandidates(s, o);
  if (candidates.length === 0) return { to: "graveyard" };
  const chooser = o.zone === "battlefield" ? o.controller : o.owner;
  const helpsOpponent = (c: GraveyardCandidate) =>
    c.controller && c.controller !== chooser && (!!c.gainLife || !!c.link) ? 1 : 0;
  const chosen = [...candidates].sort((a, b) => helpsOpponent(a) - helpsOpponent(b) || a.timestamp - b.timestamp)[0];
  if (!chosen) return { to: "graveyard" };
  if (chosen.link === "uid" && chosen.sourceId) {
    const src = s.objects[chosen.sourceId];
    if (src) src.linkedUids = [...(src.linkedUids ?? []), o.uid];
  }
  if (chosen.gainLife && chosen.controller) gainLife(s, chosen.controller, chosen.gainLife);
  // Head of the Hunt : « quand vous le faites, créez un Loup 2/2 ».
  if (chosen.createToken && chosen.controller) createTokens(s, chosen.controller, chosen.createToken, 1);
  return { to: "exile", linkTo: chosen.link === "object" ? chosen.sourceId : undefined };
}

/** 614.1c–d : effets qui modifient la façon dont un permanent arrive sur le champ de bataille. */
export function applyEntersReplacements(s: GameState, o: GameObject, ctx: EntersContext): void {
  if (ctx.kicked) o.kicked = true;
  if (ctx.cast) o.cast = true;
  if (ctx.castFromHand) o.castFromHand = true;
  if (ctx.castFromGraveyard) o.castFromGraveyard = true;
  if (ctx.castFromExile) o.castFromExile = true;
  // Mana dépensé, connu dès l'arrivée (« si aucun mana n'a été dépensé pour la lancer »).
  if (ctx.manaSpent !== undefined) o.manaSpent = ctx.manaSpent;
  if (ctx.spentColors) o.spentColors = ctx.spentColors;
  if (ctx.evoked) o.evoked = true;
  if (ctx.castVia) o.castVia = ctx.castVia;
  if (ctx.costBounced) o.costBounced = ctx.costBounced;
  const own = s.defs[o.defId];
  // 303.4f : une Aura qui arrive sans être lancée enchante un objet choisi par celui qui la contrôle (automatiquement ici :
  // le premier possible ; les opérations de déplacement le demandent pendant une résolution).
  const attachTo = ctx.attachTo ?? (own?.enchant && !own.enchant.player ? auraHosts(s, o.controller, o.id)[0] : undefined);
  if (attachTo) o.attachedTo = attachTo;
  // 707.5 : « arrive comme une copie » aussi sans être lancé (réanimé, clignotant) ; choix automatique hors résolution.
  if (!ctx.copyOf && !ctx.copyChosen && own?.entersAsCopyOf) {
    const model = copyCandidates(s, o.controller, o.id)[0];
    if (model) ctx = { ...ctx, copyOf: copiedDefId(s, model), copyMods: copiableExceptions(s, model) };
  }
  // Modifications imposées par l'effet qui le met sur le champ de bataille, avant les autres remplacements (qui peuvent
  // dépendre des types ajoutés) et avant l'événement d'arrivée.
  if (ctx.tapped) o.tapped = true;
  if (ctx.impending) o.impending = true;
  if (ctx.mods && Object.values(ctx.mods).some((v) => v !== undefined)) {
    s.effects.push({
      id: newId(s, "e"),
      timestamp: nextTimestamp(s),
      affected: [o.id],
      duration: "permanent",
      ...ctx.mods,
      ...(ctx.modsCopiable ? { copiable: true } : {}),
    });
    s.version += 1;
  }
  if (ctx.haste) {
    s.effects.push({
      id: newId(s, "e"),
      timestamp: nextTimestamp(s),
      affected: [o.id],
      duration: "endOfTurn",
      addKeywords: ["haste"],
    });
    s.version += 1;
  }
  // 702.136 : émeute, imprimée ou donnée (Spider-Punk : « vos autres Araignées ont l'émeute »).
  if (chars(s, o.id).keywords.includes("riot")) {
    if ((ctx.riot ?? defaultRiot(s, o)) === "haste") {
      s.effects.push({
        id: newId(s, "e"),
        timestamp: nextTimestamp(s),
        affected: [o.id],
        duration: "permanent",
        addKeywords: ["haste"],
      });
      s.version += 1;
    } else changeCounters(s, o, P1P1, 1);
  }
  if (ctx.attacking && s.combat) s.combat.attackers.push({ id: o.id, defender: ctx.attacking, blockers: [], blocked: false });
  // 707.9 : « arrive comme copie de … » (Waxen Shapethief). Les exceptions du modèle, puis les siennes, sont copiables
  // (707.9b) : une copie de ce permanent les reprend.
  if (ctx.copyOf) {
    const own = s.defs[o.defId];
    const graveyard = own?.entersAsCopyOfGraveyard;
    const mods = mergeMods(ctx.copyMods, {
      // Visage Bandit : « sauf que c'est un Métamorphe Voleur en plus de ses autres types ».
      addSubtypes: own?.entersAsCopyAddSubtypes,
      // Mockingbird : « … et elle a le vol ».
      addKeywords: own?.entersAsCopyAddKeywords,
      // Superior Spider-Man : « sauf que son nom est … et que c'est un 4/4 ».
      setName: graveyard?.name ?? (own?.entersAsCopyKeepName ? own.name : undefined),
      setPower: graveyard?.power,
      setToughness: graveyard?.power !== undefined ? graveyard.toughness : undefined,
    });
    s.effects.push({
      id: newId(s, "e"),
      timestamp: nextTimestamp(s),
      affected: [o.id],
      duration: "permanent",
      copyOf: ctx.copyOf,
      ...mods,
      copiable: true,
    });
    s.version += 1; // cache des couches
  }
  // La suite lit la définition effective : celle que copie le permanent (707.9 : un Clone de planeswalker arrive avec la
  // loyauté de ce planeswalker), sinon sa face active (714.3a : une Saga au verso).
  const eff = s.defs[copiedDefId(s, o.id)];
  // 614.12 : « en arrivant, choisissez… » (le choix vient de la résolution, sinon choix par défaut).
  const choose = eff?.chooseOnEnter;
  if (choose) o.chosen = ctx.chosen ?? defaultChoice(s, o, choose);
  // 702.82 : dévorer N (les permanents ont été sacrifiés pendant la résolution).
  const devour = eff?.devour;
  if (devour && ctx.devoured) changeCounters(s, o, P1P1, devour.n * ctx.devoured);
  // Terrain choc : engagé, sauf si les points de vie ont été payés en le jouant (mis en jeu par un effet : engagé).
  if (eff?.shockLand && !ctx.shockPaid) o.tapped = true;
  // 714.3a : une Saga arrive avec un marqueur de savoir.
  if (eff?.saga) changeCounters(s, o, "lore", 1);
  // 306.5b : un planeswalker arrive avec sa loyauté imprimée.
  const loyalty = eff?.loyalty;
  if (loyalty) changeCounters(s, o, "loyalty", loyalty);
  // Marqueurs imposés par l'effet (« avec un marqueur +1/+1 », Imminence) : mis en arrivant (122.6).
  for (const c of ctx.counters ?? []) changeCounters(s, o, c.kind, c.n);
  if (ctx.impending) changeCounters(s, o, "time", ctx.impending);
  // Remplacements portés par d'autres permanents (« les créatures de vos adversaires arrivent engagées »).
  for (const id of s.battlefield) {
    const src = s.objects[id];
    if (!src || id === o.id) continue;
    // Capacités calculées : porte déverrouillée d'une Salle, verso, copie.
    for (const ab of chars(s, id).abilities) {
      if (ab.kind !== "replacement" || !ab.affects) continue;
      if (!matchesObjectFilter(s, src.controller, o.id, ab.affects, id)) continue;
      if (ab.entersTapped) o.tapped = true;
      if (ab.entersWithCounters !== undefined) {
        changeCounters(s, o, ab.counterKind ?? P1P1, amountAtEntry(s, ab.entersWithCounters, src, ctx, o));
      }
    }
  }
  for (const ab of eff?.abilities ?? []) {
    if (ab.kind !== "replacement" || ab.affects) continue;
    if (ab.condition && !conditionAtEntry(s, ab.condition, o, ctx)) continue;
    if (ab.entersTapped) o.tapped = true;
    if (ab.entersPrepared) setPrepared(s, o, true);
    if (ab.entersWithCounters !== undefined)
      changeCounters(s, o, ab.counterKind ?? P1P1, amountAtEntry(s, ab.entersWithCounters, o, ctx));
  }
  // The Wandering Minstrel : « les terrains que vous contrôlez arrivent dégagés ».
  if (o.tapped && eff?.types.includes("Land") && playerStatic(s, o.controller, "landsEnterUntapped")) o.tapped = false;
  // « Arrive engagé » : des statiques en dépendent (« vos autres créatures engagées ont la défense talismanique »).
  s.version += 1;
}

/** 610.3 : la source d'un exil « jusqu'à ce que » quitte le champ de bataille : les cartes reviennent. */
export function releaseLinkedExile(s: GameState, sourceId: ObjectId): void {
  const links = s.linkedExile.filter((l) => l.sourceId === sourceId);
  if (links.length === 0) return;
  s.linkedExile = s.linkedExile.filter((l) => l.sourceId !== sourceId);
  for (const l of links) {
    for (const id of l.cards) {
      const o = s.objects[id];
      if (o?.zone === "exile") moveObject(s, id, l.toHand ? "hand" : "battlefield", { controller: o.owner });
    }
  }
}

/** 615 : ces blessures de combat sont-elles prévenues ? */
export function preventsCombatDamage(s: GameState, target: string): boolean {
  return s.replacements.some((r) => r.kind === "preventCombatDamage" && r.objects.includes(target));
}

export function addReplacement(s: GameState, kind: "exileIfDies" | "preventCombatDamage", objects: ObjectId[], id: string): void {
  if (objects.length) s.replacements.push({ id, kind, objects });
}
