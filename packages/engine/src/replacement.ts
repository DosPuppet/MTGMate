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

import { gainLife } from "./actions";
import { boardAmount, type EffectContext, evalAmount, type OpResult, runEffectWith, staticContext } from "./effects";
import { copiableExceptions, copiedDefId, mergeMods } from "./layers";
import { manaValue } from "./mana";
import { willHaveRiot } from "./stack";
import { changeCounters, chars, FACE_DOWN_ID, moveObject, newId, nextTimestamp, P1P1, setPrepared } from "./state";
import { controlledAbilitiesWithSource, playerStatic } from "./statics";
import { matchesCard, matchesObjectFilter, protectedFrom, sourceView, withChosen } from "./targets";
import { msg } from "./text";
import { checkCondition, pushInline } from "./triggers";
import { countTurnEvents } from "./turnlog";
import type {
  Amount,
  CastInfo,
  ChoiceRequest,
  ChoiceValue,
  Color,
  Condition,
  Effect,
  GameObject,
  GameState,
  LayerMods,
  ObjectId,
  PlayerId,
  Resolution,
  StackItem,
  TokenSpec,
  Zone,
} from "./types";

/** Contexte d'arrivée sur le champ de bataille (valeur de X, kicker du sort qui arrive). */
export interface EntersContext {
  x?: number;
  /** Loyauté de départ à la place de celle imprimée (copie d'Ob Nixilis, the Adversary). */
  loyalty?: number;
  kicked?: boolean;
  /** Arrive depuis la résolution d'un sort : comment il a été lancé (X, kicker, mana dépensé…), noté sur le permanent. */
  cast?: CastInfo;
  /** Aura : l'objet auquel elle arrive attachée. */
  attachTo?: string;
  /** Choix « en arrivant, choisissez… » (614.12), faits par `asEntersChoices`. */
  chosen?: GameObject["chosen"];
  /** Terrain choc : les points de vie ont été payés (sinon il arrive engagé). */
  shockPaid?: boolean;
  /** « Arrive comme une copie » (707.9) : définition copiée en arrivant (couche 1). */
  copyOf?: string;
  /** 707.9b : exceptions copiables du modèle (`copiableExceptions`) et de la copie (`chooseCopy.except`). */
  copyMods?: LayerMods;
  /** Copie « jusqu'à la fin du tour » (Cursed Mirror) ; sinon tant qu'il reste sur le champ de bataille. */
  copyDuration?: "endOfTurn";
  /** Cartes liées au permanent (702.82 : exilées en arrivant par Mimeoplasm). */
  linked?: ObjectId[];
  /** « Quand vous le faites, exilez cette carte » : la carte copiée d'un cimetière (Superior Spider-Man, 603.12). */
  exileCopied?: ObjectId;
  /** Émeute (702.136) : le choix fait en résolvant le sort (sinon le choix par défaut, `defaultRiot`). */
  riot?: "counter" | "haste";
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
  /**
   * Les effets « en arrivant » ont été faits avant le déplacement (même sans rien choisir) ; sinon, ils le sont en
   * arrivant, avec les réponses suggérées (`asEntersChoices`, mode `default`).
   */
  asEnters?: boolean;
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

/** Ce que les effets « en arrivant » apportent à l'arrivée (614.1c, 614.12), lu par `applyEntersReplacements`. */
export type EntersChoices = Pick<
  EntersContext,
  "asEnters" | "chosen" | "riot" | "copyOf" | "copyMods" | "copyDuration" | "counters" | "tapped" | "linked" | "exileCopied"
>;

/**
 * Comment la boucle « en arrivant » répond à ses questions :
 * - `ask` : elles sont posées (la résolution est suspendue, puis l'effet reprend avec la réponse) ;
 * - `auto` : la réponse suggérée (après un tirage au hasard, qui ne serait pas rejoué) ;
 * - `default` : la réponse suggérée, et seulement les choix (arrivée hors d'une résolution : retour d'un exil lié,
 *   jeton copie, ninjutsu ; le permanent est déjà en train d'arriver, les autres effets ne sont pas faits) ;
 * - `probe` : la première question seulement, sans rien faire (terrain proposé par `legalActions`) ;
 * - `{ first }` : la réponse donnée avec la décision de jouer un terrain, puis les réponses suggérées.
 */
export type EntersMode = "ask" | "auto" | "default" | "probe" | { first: ChoiceValue[] };

/** L'objet qui arrive : son identifiant (sur la pile, dans sa zone ou déjà sur le champ de bataille), sa face, son contrôleur. */
export interface Entering {
  id: ObjectId;
  defId: string;
  controller: PlayerId;
  /** X et kicker du sort qui se résout (X vaut 0 pour une carte qui n'est pas lancée, 107.3). */
  x?: number;
  kicked?: boolean;
}

type EntersAsk = Extract<OpResult, { ask: unknown }>;

/** Préfixe des choix « en arrivant » d'un sort de permanent qui se résout (opération `asEnters`, `finishResolution`). */
export const ENTERS_PREFIX = "enter:";

/** Effets « en arrivant » qui ne font que choisir : seuls faits hors d'une résolution, et sondés pour un terrain. */
const CHOICE_OPS: ReadonlySet<Effect["op"]> = new Set(["chooseOnEnter", "chooseCopy"]);
/** Résultats de ces choix, retirés avant chaque effet (un second choix du même genre est bien posé). */
const RESULT_KEYS = ["$chosen", "$copyOf", "$copyCard", "$devoured", "$ids:devoured"];

/** Émeute (702.136a) : un marqueur +1/+1 ou la célérité ; suggestion : la célérité s'il peut encore attaquer ce tour-ci. */
function riotRequest(s: GameState, controller: PlayerId): ChoiceRequest {
  const early = ["untap", "upkeep", "draw", "main1", "beginCombat"].includes(s.turn.step);
  return {
    type: "pick",
    intent: "other",
    prompt: msg("Riot: a +1/+1 counter or haste?"),
    options: ["counter", "haste"],
    labels: { counter: msg("A +1/+1 counter"), haste: msg("Gain haste") },
    min: 1,
    max: 1,
    suggested: [s.turn.active === controller && early ? "haste" : "counter"],
  };
}

/** Le choix « en arrivant » noté sur le permanent, d'après sa sorte et la réponse. */
export function chosenValue(kind: string, value: string): GameObject["chosen"] {
  if (kind === "cardName" || kind === "landName") return { cardName: value };
  if (kind === "parity") return { parity: value === "odd" ? "odd" : "even" };
  if (kind === "mode") return { mode: value };
  if (kind === "number") return { number: Number(value) };
  if (kind === "landType") return { landType: value };
  return kind === "color" ? { color: value as Color } : { creatureType: value };
}

/** Ce qu'un effet « en arrivant » terminé apporte à l'arrivée, d'après les valeurs qu'il a mémorisées (`diff`). */
function collectEntering(
  s: GameState,
  out: EntersChoices,
  e: Effect,
  diff: Record<string, ChoiceValue[]>,
  ctx: EffectContext,
): void {
  if (e.op === "chooseOnEnter") {
    const [kind, value] = (diff.$chosen ?? []).map(String);
    if (kind && value) out.chosen = { ...out.chosen, ...chosenValue(kind, value), ...(e.secret ? { secret: true } : {}) };
  } else if (e.op === "chooseCopy") {
    const [defId, model] = (diff.$copyOf ?? []).map(String);
    if (!defId) return;
    out.copyOf = defId;
    // 707.9b : les exceptions du modèle, puis celles de la copie, sont copiables.
    out.copyMods = mergeMods(copiableExceptions(s, model), e.except);
    if (e.duration) out.copyDuration = e.duration;
    if (e.counters) {
      const n = Math.max(0, evalAmount(s, ctx, e.counters.n));
      if (n > 0) out.counters = [...(out.counters ?? []), { kind: e.counters.kind, n }];
    }
    if (e.tapped) out.tapped = true;
    const card = diff.$copyCard?.[0];
    if (e.exile && card !== undefined) out.exileCopied = String(card);
  } else if (e.op === "devour") {
    const n = Number(diff.$devoured?.[0] ?? 0);
    if (n > 0) out.counters = [...(out.counters ?? []), { kind: P1P1, n: e.n * n }];
    const exiled = diff["$ids:devoured"] ?? [];
    if (exiled.length) out.linked = [...(out.linked ?? []), ...exiled.map(String)];
  }
}

/**
 * 614.1c, 614.12 (PLAN-H H9) : la seule boucle des effets « en arrivant » d'un permanent, quel que soit le chemin
 * d'arrivée : sort de permanent qui se résout (opération `asEnters`, `specsAndEffects`), copie d'un sort de permanent
 * (707.10 : le jeton), terrain joué (`playLand`, la réponse vient avec la décision), effet qui le met sur le champ de
 * bataille (`arrivalChoices`, `ops/zones.ts`), toute autre arrivée (`applyEntersReplacements`, mode `default`).
 *
 * Dans l'ordre : l'émeute (702.136, imprimée ou donnée), puis les effets de `CardDef.asEnters` ; s'il arrive comme une
 * copie, l'émeute et les effets « en arrivant » du modèle (707.9 : la copie fait les choix du permanent copié ; pas une
 * seconde copie). Des marqueurs mis sur `ref.self` sont ceux avec lesquels il arrive. Un permanent face cachée n'a aucun
 * effet « en arrivant » (708.2).
 *
 * Chaque effet terminé est noté dans `vars` (sous `prefix`) avec ce qu'il a mémorisé : la boucle rejouée (réponse à une
 * question, fin de la résolution) ne le refait pas. Renvoie la question à poser, sinon ce qu'apporte l'arrivée.
 */
export function asEntersChoices(
  s: GameState,
  vars: Record<string, ChoiceValue[]>,
  entering: Entering,
  prefix: string,
  mode: EntersMode,
): EntersAsk | EntersChoices {
  const out: EntersChoices = { asEnters: true };
  const own = s.defs[entering.defId];
  if (!own || entering.defId === FACE_DOWN_ID) return out;
  // Rien à faire : la plupart des arrivées (seules l'émeute et `asEnters` posent des questions).
  if (!own.asEnters?.length && (mode === "default" || mode === "probe" || !willHaveRiot(s, entering.controller, own))) return out;
  const scratch: Record<string, ChoiceValue[]> = {};
  const item: StackItem = {
    id: `${prefix}enters`,
    kind: "ability",
    controller: entering.controller,
    sourceId: entering.id,
    sourceDefId: entering.defId,
    abilityIndex: -1,
    mode: 0,
    targets: {},
    x: entering.x ?? 0,
    kicked: !!entering.kicked,
    sourceSnapshot: { keywords: [], power: 0, controller: entering.controller },
  };
  const sub: Resolution = {
    item,
    effects: [],
    pc: 0,
    controller: entering.controller,
    targets: {},
    vars: scratch,
    awaiting: null,
  };
  let given = 0;
  // La réponse à une question selon le mode ; `null` : la poser.
  const answer = (request: ChoiceRequest): ChoiceValue[] | null => {
    if (mode === "ask" || mode === "probe") return null;
    if (typeof mode === "object" && given++ === 0) return mode.first;
    return request.suggested;
  };
  const phases = [own];
  for (let phase = 0; phase < phases.length; phase++) {
    const d = phases[phase] as NonNullable<typeof own>;
    const ctx: EffectContext = {
      controller: entering.controller,
      sourceId: entering.id,
      sourceDefId: d.id,
      sourceSnapshot: item.sourceSnapshot,
      targets: {},
      x: entering.x ?? 0,
      kicked: !!entering.kicked,
      vars: scratch,
    };
    // 702.136 : émeute, imprimée ou donnée (Spider-Punk) ; hors d'une résolution, le choix par défaut (`defaultRiot`).
    if (out.riot === undefined && mode !== "default" && mode !== "probe" && willHaveRiot(s, entering.controller, d)) {
      const key = `${prefix}riot`;
      let v = vars[key];
      if (!v) {
        const request = riotRequest(s, entering.controller);
        const a = answer(request);
        if (a === null) return { ask: { player: entering.controller, request, key } };
        v = a;
        vars[key] = a;
      }
      out.riot = String(v[0]) === "haste" ? "haste" : "counter";
    }
    // Le modèle d'une copie : ses effets, sauf une autre copie.
    const effects = (d.asEnters ?? []).filter((e) => phase === 0 || e.op !== "chooseCopy");
    let skip = 0;
    for (let i = 0; i < effects.length; i++) {
      const e = effects[i] as Effect;
      if (skip > 0) {
        skip -= 1;
        continue;
      }
      // Hors d'une résolution (`default`) et pour sonder un terrain (`probe`) : les choix seulement.
      if ((mode === "default" || mode === "probe") && !CHOICE_OPS.has(e.op)) continue;
      // « Il arrive avec N marqueurs » : des marqueurs mis sur lui-même (614.1c).
      if (e.op === "addCounters" && e.what.kind === "self") {
        const n = Math.max(0, evalAmount(s, ctx, e.amount));
        if (n > 0) out.counters = [...(out.counters ?? []), { kind: e.kind ?? P1P1, n }];
        continue;
      }
      const slot = `${prefix}${phase}.${i}`;
      const done = vars[`${slot}!`];
      let diff: Record<string, ChoiceValue[]>;
      if (done) {
        diff = JSON.parse(String(done[0])) as Record<string, ChoiceValue[]>;
        skip = Number(done[1] ?? 0);
      } else {
        for (const k of RESULT_KEYS) delete scratch[k];
        const before = { ...scratch };
        let res: OpResult;
        for (let guard = 0; ; guard++) {
          for (const k of Object.keys(vars)) if (k.startsWith(`${slot}:`)) scratch[k] = vars[k] as ChoiceValue[];
          res = runEffectWith(s, sub, e, ctx, (k) => `${slot}:${k}`);
          if (!res || !("ask" in res) || guard >= 20) break;
          const a = answer(res.ask.request);
          if (a === null) return res;
          vars[res.ask.key] = a;
        }
        skip = res && "skip" in res ? res.skip : 0;
        diff = {};
        for (const [k, v] of Object.entries(scratch)) if (k.startsWith("$") && before[k] !== v) diff[k] = v;
        if (mode !== "probe") vars[`${slot}!`] = [JSON.stringify(diff), skip];
      }
      Object.assign(scratch, diff);
      collectEntering(s, out, e, diff, ctx);
    }
    const model = phase === 0 && out.copyOf ? s.defs[out.copyOf] : undefined;
    if (model) phases.push(model);
  }
  return out;
}

/**
 * Réunit le contexte d'arrivée et ce qu'apportent les effets « en arrivant » : ce que le contexte fixe déjà l'emporte
 * (une copie imposée), les marqueurs s'ajoutent, « engagé » vient de l'un ou de l'autre.
 */
export function withEntersChoices(ctx: EntersContext, choices: EntersChoices): EntersContext {
  const counters = [...(ctx.counters ?? []), ...(choices.counters ?? [])];
  const out: EntersContext = { ...choices, asEnters: true };
  for (const [k, v] of Object.entries(ctx)) if (v !== undefined) (out as Record<string, unknown>)[k] = v;
  out.counters = counters.length ? counters : undefined;
  out.tapped = ctx.tapped || choices.tapped || undefined;
  return out;
}

/**
 * Montant évalué à l'arrivée, du point de vue de `o` (la source du remplacement).
 * `entering` : l'objet qui arrive, exclu des comptes (« pour chaque Ange que vous contrôlez déjà »).
 */
function amountAtEntry(s: GameState, a: Amount, o: GameObject, ctx: EntersContext, entering?: GameObject): number {
  if (typeof a === "number") return a;
  if (a.kind === "x") return ctx.x ?? 0;
  if (a.kind === "kicked") return ctx.kicked ? a.yes : a.no;
  if (a.kind === "spent" && !a.of && a.what === "mana") return ctx.cast?.manaSpent ?? 0;
  // Coin of Mastery : « pour chaque mana d'une source d'artefact dépensé pour la lancer » (la créature qui arrive).
  if (a.kind === "spent" && !a.of && a.what === "artifact") return ctx.cast?.spentFrom?.artifact ?? 0;
  // Scarlet Spider, Ben Reilly : « X étant la valeur de mana de la créature renvoyée » (Web-slinging).
  if (a.kind === "manaValueOf" && a.ref.kind === "cost" && a.ref.paid === "bounced")
    return manaValue(s.defs[s.objects[ctx.cast?.costBounced?.[0] ?? ""]?.defId ?? ""]?.manaCost);
  // Convergence : « un marqueur pour chaque couleur de mana dépensée pour le lancer ».
  if (a.kind === "spent" && !a.of && a.what === "colors")
    return (["W", "U", "B", "R", "G"] as const).filter((c) => (ctx.cast?.spentColors?.[c] ?? 0) > 0).length;
  // Arithmétique (Slumbering Trudge : « 3 moins X »).
  if (a.kind === "sum") return a.of.reduce<number>((n, x) => n + amountAtEntry(s, x, o, ctx, entering), 0);
  if (a.kind === "neg") return -amountAtEntry(s, a.of, o, ctx, entering);
  if (a.kind === "max") return Math.max(...a.of.map((x) => amountAtEntry(s, x, o, ctx, entering)));
  // Bioengineered Future : terrains arrivés ce tour-ci sous le contrôle de la source.
  if (a.kind === "turnEvents") return countTurnEvents(s, a.query, o.controller);
  // Force sur le champ de bataille (« la plus grande force parmi les autres créatures que vous contrôlez », Prime Speaker
  // Zegana ; force totale), sans l'objet qui arrive.
  if (a.kind === "aggregate" && a.property === "power" && (a.fn === "max" || a.fn === "sum") && !a.zone && !a.of) {
    const f = withChosen(a.filter ?? {}, o);
    const powers = s.battlefield
      .filter((id) => id !== (entering ?? o).id && matchesObjectFilter(s, o.controller, id, f, o.id))
      .map((id) => chars(s, id).power);
    return a.fn === "max" ? Math.max(0, ...powers) : powers.reduce((n, x) => n + Math.max(0, x), 0);
  }
  if (a.kind === "count") {
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
  // Head of the Hunt : « quand vous le faites, créez un Loup 2/2 » : une capacité réflexive (603.12), à laquelle on peut
  // répondre.
  if (chosen.createToken && chosen.controller && chosen.sourceId)
    pushInline(s, chosen.controller, chosen.sourceId, s.objects[chosen.sourceId]?.defId ?? "", {
      targets: [],
      effects: [{ op: "createTokens", token: chosen.createToken, count: 1 }],
      label: `Un jeton ${chosen.createToken.name}`,
    });
  return { to: "exile", linkTo: chosen.link === "object" ? chosen.sourceId : undefined };
}

/** 614.1c–d : effets qui modifient la façon dont un permanent arrive sur le champ de bataille. */
export function applyEntersReplacements(s: GameState, o: GameObject, ctx: EntersContext): void {
  if (ctx.kicked) o.kicked = true;
  // Comment il a été lancé, connu dès l'arrivée (« si aucun mana n'a été dépensé pour la lancer », kicker, X).
  if (ctx.cast) o.cast = { ...ctx.cast };
  const own = s.defs[o.defId];
  // 303.4f : une Aura qui arrive sans être lancée enchante un objet choisi par celui qui la contrôle (automatiquement ici :
  // le premier possible ; les opérations de déplacement le demandent pendant une résolution).
  const attachTo = ctx.attachTo ?? (own?.enchant && !own.enchant.player ? auraHosts(s, o.controller, o.id)[0] : undefined);
  if (attachTo) o.attachedTo = attachTo;
  // 614.1c, 614.12 : les effets « en arrivant » qui n'ont pas été faits avant le déplacement (arrivée hors d'une
  // résolution : retour d'un exil lié, jeton copie, ninjutsu) : les choix seulement, avec la réponse suggérée. Un permanent
  // face cachée n'en a pas (708.2).
  if (!ctx.asEnters && !ctx.copyOf) {
    const res = asEntersChoices(s, {}, { id: o.id, defId: copiedDefId(s, o.id), controller: o.controller }, "", "default");
    if (!("ask" in res)) ctx = withEntersChoices(ctx, res);
  }
  // 707.9 : « arrive comme copie de … » (Waxen Shapethief), avant les autres remplacements (qui lisent la copie : émeute,
  // loyauté). Les exceptions du modèle, puis les siennes (Visage Bandit : « … en plus de ses autres types » ; Superior
  // Spider-Man : nom et F/E), sont copiables (707.9b) : une copie de ce permanent les reprend. Cursed Mirror : jusqu'à la
  // fin du tour.
  if (ctx.copyOf) {
    s.effects.push({
      id: newId(s, "e"),
      timestamp: nextTimestamp(s),
      affected: [o.id],
      duration: ctx.copyDuration ?? "permanent",
      copyOf: ctx.copyOf,
      ...ctx.copyMods,
      copiable: true,
    });
    s.version += 1; // cache des couches
    // Superior Spider-Man : « quand vous le faites, exilez cette carte » : une capacité réflexive (603.12).
    const card = ctx.exileCopied;
    if (card && s.objects[card]?.zone === "graveyard")
      pushInline(s, o.controller, o.id, o.defId, {
        targets: [],
        effects: [{ op: "moveTo", what: { kind: "target", id: "c" }, spec: { to: "exile" } }],
        bound: { c: [card] },
        label: "Exilez la carte copiée",
      });
  }
  // 702.82 : les cartes exilées en arrivant (Mimeoplasm) sont liées au permanent.
  if (ctx.linked?.length) o.linked = [...(o.linked ?? []), ...ctx.linked];
  // Modifications imposées par l'effet qui le met sur le champ de bataille, avant les autres remplacements (qui peuvent
  // dépendre des types ajoutés) et avant l'événement d'arrivée.
  if (ctx.tapped) o.tapped = true;
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
  // La suite lit la définition effective : celle que copie le permanent (707.9 : un Clone de planeswalker arrive avec la
  // loyauté de ce planeswalker), sinon sa face active (714.3a : une Saga au verso).
  const eff = s.defs[copiedDefId(s, o.id)];
  // 614.12 : « en arrivant, choisissez… » (faits par `asEntersChoices`).
  if (ctx.chosen) o.chosen = ctx.chosen;
  // Terrain choc : engagé, sauf si les points de vie ont été payés en le jouant (mis en jeu par un effet : engagé).
  if (eff?.shockLand && !ctx.shockPaid) o.tapped = true;
  // 714.3a : une Saga arrive avec un marqueur de savoir.
  if (eff?.saga) changeCounters(s, o, "lore", 1);
  // 306.5b : un planeswalker arrive avec sa loyauté imprimée.
  const loyalty = ctx.loyalty ?? eff?.loyalty;
  if (loyalty) changeCounters(s, o, "loyalty", loyalty);
  // X du sort qui l'a fait arriver, connu dès l'arrivée (escouade : « s'il a été payé », vérifié au déclenchement).
  if (ctx.x) o.x = ctx.x;
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
      // « Tant qu'un adversaire a perdu des PV ce tour-ci, … » (Vampire Socialite) : vue du contrôleur de la source.
      if (ab.condition && !checkCondition(s, ab.condition, src.controller, id)) continue;
      if (ab.entersTapped) o.tapped = true;
      if (ab.entersWithCounters !== undefined) {
        const n = amountAtEntry(s, ab.entersWithCounters, src, ctx, o);
        // Blue, Loyal Raptor : autant de marqueurs de chaque sorte présente sur la source.
        if (ab.counterKind === "*") for (const [k, c] of Object.entries(src.counters)) c > 0 && changeCounters(s, o, k, n);
        else changeCounters(s, o, ab.counterKind ?? P1P1, n);
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

/**
 * 615 : ces blessures sont-elles prévenues par un effet de prévention créé sur des objets fixés à la résolution (toutes
 * les blessures, ou seulement celles de combat) ? Un effet, pas une capacité : perdre ses capacités ne le retire pas.
 */
export function preventsDamageTo(s: GameState, target: string, combat: boolean): boolean {
  return s.replacements.some(
    (r) => (r.kind === "preventDamage" || (combat && r.kind === "preventCombatDamage")) && r.objects.includes(target),
  );
}

export function addReplacement(
  s: GameState,
  kind: "exileIfDies" | "preventCombatDamage" | "preventDamage",
  objects: ObjectId[],
  id: string,
): void {
  if (objects.length) s.replacements.push({ id, kind, objects });
}
