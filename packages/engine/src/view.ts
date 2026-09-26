/**
 * Vue d'un joueur : tout ce qui est public + sa propre main + les options de sa décision.
 * Les informations cachées (main adverse, bibliothèques) ne sortent jamais du moteur.
 */
import { legalActions } from "./legal";
import { costToText } from "./mana";
import { canPlayLand, castTerms } from "./stack";
import { chars, isSummoningSick, obj } from "./state";
import { playerStatic } from "./statics";
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
  chosen: { creatureType?: string; color?: Color } | null;
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
    };

export interface GameView {
  viewer: PlayerId;
  /** Tous les autres joueurs (y compris éliminés), dans l'ordre du tour à partir du suivant. */
  opponents: PlayerId[];
  turn: { number: number; active: PlayerId; step: Step; landsPlayed: number };
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
  };
}

export function objectView(s: GameState, id: ObjectId): ObjectView {
  const o = obj(s, id);
  const d = s.defs[o.defId] as CardDef;
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
  };
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
    };
  });

  let pending: PendingView | null = null;
  const p = s.pending;
  if (p) {
    const mine = p.player === viewer;
    switch (p.kind) {
      case "priority":
        pending = mine ? { ...p, actions: legalActions(s, viewer) } : { ...p };
        break;
      case "declareAttackers":
        pending = mine ? { ...p, candidates: attackCandidates(s, viewer), defenders: attackableDefenders(s, viewer) } : { ...p };
        break;
      case "declareBlockers":
        pending = mine ? { ...p, candidates: blockCandidates(s, viewer) } : { ...p };
        break;
      case "choice": {
        if (!mine) {
          pending = { kind: "choice", player: p.player };
          break;
        }
        const r = p.request;
        const ids = r.type === "pick" ? r.options : r.type === "order" ? r.items : r.type === "divide" ? r.among : [];
        pending = { ...p, objects: ids.filter((id) => s.objects[id]).map((id) => objectView(s, id)) };
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
    hand: (s.players[viewer]?.hand ?? []).map((id) => objectView(s, id)),
    battlefield: s.battlefield.map((id) => objectView(s, id)),
    stack,
    exile: s.exile.map((id) => objectView(s, id)),
    playableExile: [
      ...s.exile.filter((id) => castTerms(s, viewer, id) || canPlayLand(s, viewer, id)),
      // Vizier of the Menagerie : « vous pouvez regarder la carte du dessus de votre bibliothèque à tout moment ».
      ...(playerStatic(s, viewer, "castCreaturesFromTop") && s.players[viewer]?.library[0]
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
