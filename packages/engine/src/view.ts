/**
 * Vue d'un joueur : tout ce qui est public + sa propre main + les options de sa décision.
 * Les informations cachées (main adverse, bibliothèques) ne sortent jamais du moteur.
 */
import { legalActions } from "./legal";
import { costToText } from "./mana";
import { chars, isSummoningSick, obj, opponentsOf } from "./state";
import { attackCandidates, blockCandidates } from "./turn";
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
}

export type PendingView =
  | { kind: "mulligan"; player: PlayerId; mulligans: number }
  | { kind: "bottomCards"; player: PlayerId; count: number }
  | { kind: "priority"; player: PlayerId; actions?: ActionOption[] }
  | { kind: "declareAttackers"; player: PlayerId; candidates?: ObjectId[]; defenders?: PlayerId[] }
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
  combat: { attackers: { id: ObjectId; defender: PlayerId; blockers: ObjectId[] }[] } | null;
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
        pending = mine ? { ...p, candidates: attackCandidates(s, viewer), defenders: opponentsOf(s, viewer) } : { ...p };
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
    combat: s.combat
      ? { attackers: s.combat.attackers.map((a) => ({ id: a.id, defender: a.defender, blockers: [...a.blockers] })) }
      : null,
    pending,
    potentialAttackers: s.turn.active === viewer ? attackCandidates(s, viewer).length : 0,
    over: s.over,
    winner: s.winner,
  };
}

/** Retire des événements les informations cachées au spectateur. */
export function filterEvents(events: GameEvent[], viewer: PlayerId): GameEvent[] {
  return events.map((e) => (e.type === "draw" && e.player !== viewer ? { type: "draw", player: e.player } : e));
}
