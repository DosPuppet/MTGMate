/**
 * Vue d'un joueur : tout ce qui est public + sa propre main + les options de sa décision.
 * Les informations cachées (main adverse, bibliothèques) ne sortent jamais du moteur.
 */

import { copiedDefId } from "./layers";
import { legalActions } from "./legal";
import { costToText } from "./mana";
import { canPlayLand, castTerms, modesOf } from "./stack";
import { chars, decider, isCreature, isSummoningSick, obj } from "./state";
import { playerStatic } from "./statics";
import { pendingTriggerSource } from "./triggers";
import { attackableDefenders, attackCandidates, blockCandidates } from "./turn";
import type {
  ActionOption,
  CardDef,
  CardType,
  ChoicePurpose,
  ChoiceRequest,
  Color,
  GameEvent,
  GameState,
  Keyword,
  ManaType,
  ObjectId,
  PlayerId,
  Step,
  Zone,
} from "./types";

export interface CardFace {
  defId: string;
  name: string;
  typeLine: string;
  manaCost: string;
  text: string;
  image?: string;
  fr?: CardDef["fr"];
  basePower?: number;
  baseToughness?: number;
  implemented: boolean;
  isToken: boolean;
  /** Sort attaché d'une carte « à préparer » (affiché dans l'aperçu). */
  prepareFace?: CardDef["prepareFace"];
  /** Carte à plusieurs faces : sa disposition et ses autres faces (verso, aventure, autre moitié). */
  layout?: CardDef["layout"];
  otherFaces?: CardDef["prepareFace"][];
}

export interface ObjectView extends CardFace {
  id: ObjectId;
  uid: string;
  owner: PlayerId;
  controller: PlayerId;
  zone: Zone;
  types: CardType[];
  subtypes: string[];
  colors: Color[];
  tapped: boolean;
  damage: number;
  counters: Record<string, number>;
  power?: number;
  toughness?: number;
  keywords: Keyword[];
  sick: boolean;
  attacking: boolean;
  blocking: ObjectId | null;
  /** Aura ou Équipement : le permanent auquel il est attaché. */
  attachedTo: ObjectId | null;
  /** Choix fait en arrivant (type de créature, couleur). */
  chosen: {
    creatureType?: string;
    color?: Color;
  } | null;
  /** Reality Fracture : permanent préparé (son sort peut être lancé depuis l'exil). */
  prepared?: boolean;
  /** Classe : niveau atteint (au-delà de 1) ; Affaire : résolue. */
  classLevel?: number;
  solved?: boolean;
  /** Permanent (ou sort) face cachée du spectateur : la vraie carte, que lui seul connaît (708.5). */
  faceDownCard?: CardFace;
  /** Coût de sa garde (imprimée ou accordée), pour l'affichage : « {2} », « 3 PV »… */
  ward?: string;
}

export interface StackItemView extends CardFace {
  id: string;
  uid: string;
  kind: "spell" | "ability";
  controller: PlayerId;
  sourceId: ObjectId;
  targets: string[];
  x: number;
  kicked: boolean;
  mode: number;
  /** Copie d'un sort (Thousand-Year Storm). */
  copy: boolean;
  /** L'effet joué, quand la carte en a plusieurs : mode choisi d'un sort modal, ou capacité (activée, déclenchée). */
  effect?: string;
}

export interface PlayerView {
  id: PlayerId;
  name: string;
  life: number;
  libraryCount: number;
  handCount: number;
  graveyard: ObjectView[];
  manaPool: Record<ManaType, number>;
  lost: boolean;
  /** Emblèmes (zone de commandement). */
  emblems: { name: string; text: string }[];
  /** Vitesse (702.179), absente tant qu'elle n'a pas démarré. */
  speed?: number;
}

export type PendingView =
  | { kind: "mulligan"; player: PlayerId; mulligans: number }
  | { kind: "bottomCards"; player: PlayerId; count: number }
  | { kind: "priority"; player: PlayerId; actions?: ActionOption[] }
  /** `defenders` : adversaires et planeswalkers adverses attaquables. */
  | { kind: "declareAttackers"; player: PlayerId; candidates?: ObjectId[]; defenders?: string[] }
  | { kind: "declareBlockers"; player: PlayerId; candidates?: { blocker: ObjectId; attackers: ObjectId[] }[] }
  | { kind: "discard"; player: PlayerId; count: number }
  | {
      kind: "choice";
      player: PlayerId;
      /** Présents seulement pour le joueur qui choisit. */
      request?: ChoiceRequest;
      purpose?: ChoicePurpose;
      /** Objets mentionnés par la demande (y compris cachés, ex. dessus de bibliothèque pour un regard). */
      objects?: ObjectView[];
      /** Déclenchement dont on choisit les cibles ou le mode : sa carte et sa capacité (pas encore sur la pile). */
      source?: { face: CardFace; effect?: string };
    };

export interface GameView {
  viewer: PlayerId;
  /** Tous les autres joueurs (y compris éliminés), dans l'ordre du tour à partir du suivant. */
  opponents: PlayerId[];
  turn: { number: number; active: PlayerId; step: Step; landsPlayed: number };
  /** 722 : joueur dont le contrôleur prend la décision en cours (sa main remplace alors `hand`). */
  controlling?: PlayerId;
  players: Record<PlayerId, PlayerView>;
  hand: ObjectView[];
  battlefield: ObjectView[];
  stack: StackItemView[];
  exile: ObjectView[];
  /** Cartes exilées que le spectateur peut jouer ce tour-ci. */
  playableExile: ObjectView[];
  combat: { attackers: { id: ObjectId; defender: string; blockers: ObjectId[] }[] } | null;
  pending: PendingView | null;
  /** Nombre de créatures du spectateur qui pourraient attaquer ce tour-ci (pour l'interface). */
  potentialAttackers: number;
  over: boolean;
  winner: PlayerId | null;
}

/** Libellé de l'effet joué : mode d'un sort modal (spree, tiered…), ou capacité d'un permanent. */
function playedEffect(s: GameState, item: GameState["stack"][number]): string | undefined {
  const d = s.defs[item.sourceDefId];
  if (!d) return undefined;
  if (item.kind === "spell") {
    const modes = modesOf(d);
    return modes.length > 1 ? modes[item.mode]?.label : undefined;
  }
  if (item.inline) return item.inline.label ?? "Capacité";
  const ab = d.abilities[item.abilityIndex];
  if (ab?.kind === "triggered" && ab.modes) {
    const mode = ab.modes[item.mode]?.label;
    return [ab.label, mode].filter(Boolean).join(" — ") || "Capacité déclenchée";
  }
  if (ab?.kind === "triggered") return ab.label ?? "Capacité déclenchée";
  if (ab?.kind === "activated") return ab.label ?? "Capacité activée";
  return "Capacité";
}

export function cardFace(d: CardDef): CardFace {
  return {
    defId: d.id,
    name: d.name,
    typeLine: d.typeLine,
    manaCost: d.manaCostText || costToText(d.manaCost),
    text: d.text,
    image: d.image,
    fr: d.fr,
    basePower: d.power,
    baseToughness: d.toughness,
    implemented: d.implemented,
    isToken: !!d.isToken,
    ...(d.prepareFace ? { prepareFace: d.prepareFace } : {}),
    ...(d.layout ? { layout: d.layout, otherFaces: otherFaces(d) } : {}),
  };
}

/**
 * Les faces autres que celle affichée (pour l'aperçu) : le verso, l'aventure, ou les deux moitiés d'une carte
 * scindée. Une face n'a sa propre image que si elle est imprimée à part (verso d'une carte recto-verso).
 */
function otherFaces(d: CardDef): NonNullable<CardFace["otherFaces"]> {
  const faces = d.faceDefs ?? [];
  return (d.layout === "split" ? faces : faces.slice(1)).map((f) => ({
    name: f.name,
    manaCost: f.manaCostText,
    typeLine: f.typeLine,
    text: f.text,
    image: f.image !== d.image ? f.image : undefined,
    fr: f.fr
      ? { name: f.fr.name, typeLine: f.fr.typeLine, text: f.fr.text, image: f.fr.image !== d.fr?.image ? f.fr.image : undefined }
      : undefined,
  }));
}

export function objectView(s: GameState, id: ObjectId): ObjectView {
  const o = obj(s, id);
  // Une copie (couche 1) s'affiche avec la face de ce qu'elle copie.
  const d = s.defs[o.zone === "battlefield" ? copiedDefId(s, id) : (o.faceDefId ?? o.defId)] as CardDef;
  const c = chars(s, id);
  const isCreature = c.types.includes("Creature");
  const attacking = !!s.combat?.attackers.some((a) => a.id === id);
  const blocking = s.combat?.blockers.find((b) => b.id === id)?.attacker ?? null;
  return {
    ...cardFace(d),
    id,
    uid: o.uid,
    owner: o.owner,
    controller: o.controller,
    zone: o.zone,
    types: c.types,
    subtypes: c.subtypes,
    colors: c.colors,
    tapped: o.tapped,
    damage: o.damage,
    counters: { ...o.counters },
    power: isCreature ? c.power : undefined,
    toughness: isCreature ? c.toughness : undefined,
    keywords: c.keywords,
    sick: o.zone === "battlefield" && isSummoningSick(s, id),
    attacking,
    blocking,
    attachedTo: o.attachedTo ?? null,
    chosen: o.chosen ?? null,
    name: c.name,
    ...(o.preparedCopy && s.objects[o.preparedCopy] ? { prepared: true } : {}),
    ...(o.classLevel && o.classLevel > 1 ? { classLevel: o.classLevel } : {}),
    ...(o.solved ? { solved: true } : {}),
    ...(c.keywords.includes("ward") ? { ward: wardCost(c.abilities) } : {}),
  };
}

/** Coût de la garde (702.21) lu dans sa capacité déclenchée : « à moins de payer … ». */
function wardCost(abilities: CardDef["abilities"]): string | undefined {
  const costs = abilities.flatMap((ab) => {
    if (ab.kind !== "triggered" || ab.trigger.on !== "becomesTarget" || ab.label !== "Garde") return [];
    const pay = ab.effects[0];
    if (pay?.op !== "unlessPay") return [];
    const parts = [
      pay.mana ? costToText(pay.mana) : "",
      pay.life ? `${pay.life} PV` : "",
      pay.lifeAmount ? "PV égaux à sa force" : "",
      pay.discard ? (pay.discardRandom ? "une carte au hasard" : "défausser une carte") : "",
      pay.sacrifice ? `sacrifier ${pay.sacrifice} permanents${pay.sacrificeNonland ? " non-terrains" : ""}` : "",
    ].filter(Boolean);
    return parts.length ? [parts.join(" et ")] : [];
  });
  return costs.length ? costs.join(", ") : undefined;
}

/** 708.5 : le contrôleur d'un permanent face cachée peut le regarder ; les autres joueurs non. */
function withFaceDownCard(s: GameState, v: ObjectView, viewer: PlayerId): ObjectView {
  const o = s.objects[v.id];
  // Found Footage : « vous pouvez regarder les créatures face cachée de vos adversaires à tout moment ».
  const sees = o?.controller === viewer || (!!o && playerStatic(s, viewer, "seeFaceDown") && isCreature(s, o.id));
  const card = o?.faceDown && sees ? s.defs[o.faceDown.card] : undefined;
  return card ? { ...v, faceDownCard: cardFace(card) } : v;
}

export function projectView(s: GameState, viewer: PlayerId): GameView {
  const players: Record<PlayerId, PlayerView> = {};
  for (const p of s.playerOrder) {
    const pl = s.players[p];
    if (!pl) continue;
    players[p] = {
      id: p,
      name: pl.name,
      life: pl.life,
      libraryCount: pl.library.length,
      handCount: pl.hand.length,
      speed: pl.speed,
      graveyard: pl.graveyard.map((id) => objectView(s, id)),
      manaPool: { ...pl.manaPool },
      lost: pl.lost,
      emblems: pl.command.map((id) => {
        const d = s.defs[obj(s, id).defId];
        return { name: d?.name ?? "Emblème", text: d?.text ?? "" };
      }),
    };
  }

  const stack: StackItemView[] = s.stack.map((item) => {
    const d = s.defs[item.sourceDefId] as CardDef;
    return {
      ...cardFace(d),
      id: item.id,
      uid: s.objects[item.sourceId]?.uid ?? item.id,
      kind: item.kind,
      controller: item.controller,
      sourceId: item.sourceId,
      targets: Object.values(item.targets).flat(),
      x: item.x,
      kicked: item.kicked,
      mode: item.mode,
      copy: item.copy ?? false,
      ...(playedEffect(s, item) ? { effect: playedEffect(s, item) } : {}),
    };
  });

  let pending: PendingView | null = null;
  // 722 : le joueur qui contrôle le tour voit la décision comme la sienne (options du joueur contrôlé).
  const actor = decider(s);
  const p = s.pending ? { ...s.pending, player: actor ?? s.pending.player } : null;
  const who = s.pending?.player ?? viewer;
  if (p) {
    const mine = p.player === viewer;
    switch (p.kind) {
      case "priority":
        pending = mine ? { ...p, actions: legalActions(s, who) } : { ...p };
        break;
      case "declareAttackers":
        pending = mine ? { ...p, candidates: attackCandidates(s, who), defenders: attackableDefenders(s, who) } : { ...p };
        break;
      case "declareBlockers":
        pending = mine ? { ...p, candidates: blockCandidates(s, who) } : { ...p };
        break;
      case "choice": {
        if (!mine) {
          pending = { kind: "choice", player: p.player };
          break;
        }
        const r = p.request;
        const ids = r.type === "pick" ? r.options : r.type === "order" ? r.items : r.type === "divide" ? r.among : [];
        pending = { ...p, objects: ids.filter((id) => s.objects[id]).map((id) => objectView(s, id)) };
        const trig =
          p.purpose.kind === "triggerTarget" || p.purpose.kind === "triggerMode"
            ? pendingTriggerSource(s, p.purpose.trigger)
            : null;
        const def = trig ? s.defs[trig.defId] : undefined;
        if (trig && def) pending.source = { face: cardFace(def), ...(trig.label ? { effect: trig.label } : {}) };
        break;
      }
      default:
        pending = { ...p };
    }
  }

  return {
    viewer,
    opponents: (() => {
      const i = s.playerOrder.indexOf(viewer);
      return [...s.playerOrder.slice(i + 1), ...s.playerOrder.slice(0, Math.max(0, i))];
    })(),
    turn: { number: s.turn.number, active: s.turn.active, step: s.turn.step, landsPlayed: s.turn.landsPlayed },
    players,
    // Pendant un tour contrôlé, le contrôleur voit et joue la main du joueur contrôlé quand il décide pour lui.
    hand: (s.players[actor === viewer && who !== viewer ? who : viewer]?.hand ?? []).map((id) => objectView(s, id)),
    controlling: actor === viewer && who !== viewer ? who : undefined,
    battlefield: s.battlefield.map((id) => withFaceDownCard(s, objectView(s, id), viewer)),
    stack,
    exile: s.exile.map((id) => objectView(s, id)),
    playableExile: [
      ...s.exile.filter((id) => castTerms(s, viewer, id) || canPlayLand(s, viewer, id)),
      // Vizier of the Menagerie : « vous pouvez regarder la carte du dessus de votre bibliothèque à tout moment ».
      ...((playerStatic(s, viewer, "castCreaturesFromTop") ||
        playerStatic(s, viewer, "castArtifactsFromTop") ||
        playerStatic(s, viewer, "lookAtTopCard")) &&
      s.players[viewer]?.library[0]
        ? [s.players[viewer]?.library[0] as string]
        : []),
    ].map((id) => objectView(s, id)),
    combat: s.combat
      ? { attackers: s.combat.attackers.map((a) => ({ id: a.id, defender: a.defender, blockers: [...a.blockers] })) }
      : null,
    pending,
    potentialAttackers: s.turn.active === viewer ? attackCandidates(s, viewer).length : 0,
    over: s.over,
    winner: s.winner,
  };
}

const HIDDEN_ZONES: ReadonlySet<Zone> = new Set(["hand", "library"]);

/**
 * Retire des événements les informations cachées au spectateur : cartes piochées par un autre joueur,
 * cartes d'un autre joueur déplacées d'une zone cachée à une autre (recherche vers la main, remise
 * dans la bibliothèque…).
 */
export function filterEvents(events: GameEvent[], viewer: PlayerId): GameEvent[] {
  return events.map((e) => {
    if (e.type === "draw" && e.player !== viewer) return { type: "draw", player: e.player };
    if (e.type === "moved" && e.owner !== viewer && HIDDEN_ZONES.has(e.from) && HIDDEN_ZONES.has(e.to)) {
      return { type: "moved", owner: e.owner, from: e.from, to: e.to };
    }
    return e;
  });
}

const DEF_KEYS = new Set(["defId", "sourceDefId", "targetDefId", "attackerDefId", "blockerDefId", "toDefId"]);

/** Identifiants de définitions cités dans une valeur JSON (vue, événements). */
function collectDefIds(value: unknown, out: Set<string>): void {
  if (Array.isArray(value)) {
    for (const v of value) collectDefIds(v, out);
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      if (DEF_KEYS.has(k) && typeof v === "string") {
        out.add(v);
      } else if (k === "defIds" && Array.isArray(v)) {
        for (const d of v) if (typeof d === "string") out.add(d);
      } else {
        collectDefIds(v, out);
      }
    }
  }
}

/**
 * Faces des cartes que le spectateur a le droit de connaître : celles citées par sa vue et ses
 * événements filtrés (jamais la decklist adverse entière).
 */
export function visibleFaces(s: GameState, view: GameView, events: GameEvent[]): Record<string, CardFace> {
  const ids = new Set<string>();
  collectDefIds(view, ids);
  collectDefIds(events, ids);
  const out: Record<string, CardFace> = {};
  for (const id of ids) {
    const d = s.defs[id];
    if (d) out[id] = cardFace(d);
  }
  return out;
}
