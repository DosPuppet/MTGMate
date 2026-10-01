/**
 * État de l'interface et logique d'interaction (lancement de sorts, ciblage, attaque, blocage).
 * Le moteur reste la seule source de vérité : on n'envoie que des décisions tirées des options légales.
 */

import type { AiLevel } from "@mtgx/ai";
import { CARDS, card, type DeckEntries, sideboardSwapError } from "@mtgx/cards";
import {
  type ActionOption,
  type AutopilotSettings,
  autoTarget,
  type CardDef,
  type CardFace,
  DEFAULT_AUTOPILOT,
  type Decision,
  type GameEvent,
  type GameRecord,
  type GameView,
  type ObjectView,
  type StackItemView,
  type Step,
  type TargetOption,
} from "@mtgx/engine";
import type { Clock, MatchInfo, RoomInfo, Seat, ServerMessage } from "@mtgx/server/protocol";
import { create } from "zustand";
import { soundsFor } from "./audio/eventSounds";
import { playSound, preloadSounds } from "./audio/sfx";
import { findObjectEl } from "./board/layout";
import { fastMode } from "./fast";
import { describeEvents, type Lang, type LogLine } from "./i18n";
import { boardPick, togglePick } from "./prompts/boardChoice";
import type { FromWorker, Sandbox, ScenarioSpec } from "./protocol";
import { scenarioCards } from "./scenario";
import { LocalSession, RemoteSession, ReplaySession, type Session } from "./session";

/** Définitions des cartes des decks (et du bac à sable ou du scénario), envoyées au worker de partie. */
function defsFor(decks: DeckEntries[], sandbox?: Sandbox, scenario?: ScenarioSpec): Record<string, CardDef> {
  const names = new Set<string>(decks.flatMap((d) => d.map(([, name]) => name)));
  for (const n of scenario ? scenarioCards(scenario) : []) names.add(n);
  for (const side of Object.values(sandbox ?? {})) {
    for (const n of [...(side.cards ?? []), ...(side.hand ?? []), ...(side.graveyard ?? [])]) names.add(n);
    for (const [n] of side.attach ?? []) names.add(n);
  }
  return Object.fromEntries([...names].map((n) => [n, card(n)]));
}

// ---------------------------------------------------------------------------
// Tutoriel : garde des décisions (guidage strict) et observateur des mises à jour, installés par tutorial/store.ts
// ---------------------------------------------------------------------------

/** Ce que le joueur demande : une décision, ou « fin du tour » (un réglage, pas une décision). */
export type PlayerIntent = Decision | { type: "endTurn" };

/** Renvoie un rappel si l'intention est refusée, null si elle est permise. */
type DecisionGuard = (intent: PlayerIntent, view: GameView) => string | null;
let guard: DecisionGuard | null = null;
let observer: ((view: GameView, events: GameEvent[]) => void) | null = null;

export function setDecisionGuard(g: DecisionGuard | null): void {
  guard = g;
}

export function setUpdateObserver(o: ((view: GameView, events: GameEvent[]) => void) | null): void {
  observer = o;
}

/** Intention refusée par le tutoriel : on prévient le joueur et on abandonne le lancement en cours. */
function refused(intent: PlayerIntent): boolean {
  const view = useGame.getState().view;
  const reason = view && guard ? guard(intent, view) : null;
  if (!reason) return false;
  playSound("error");
  useGame.getState().notify(reason);
  useGame.setState({ casting: null, abilityMenu: null, selectedBlocker: null, legendConfirm: null });
  return true;
}

type CastOption = Extract<ActionOption, { type: "cast" }>;
type ActivateOption = Extract<ActionOption, { type: "activate" }>;
export type PlayableOption = CastOption | ActivateOption;

export interface Casting {
  option: PlayableOption;
  sourceId: string;
  mode: number | null;
  x: number | null;
  kicked: boolean | null;
  /** Coûts additionnels choisis (cartes défaussées, permanents sacrifiés). */
  discard: string[] | null;
  sacrifice: string[] | null;
  /** Permanents à engager pour le coût (station, équipage). */
  tap: string[] | null;
  /** Matériaux d'une fabrication. */
  materials: string[] | null;
  /** Façon de payer le sort : coût normal, sans payer (Omniscience, Etali), coût alternatif. */
  payMode: "normal" | "free" | "alt" | null;
  targets: Record<string, string[]>;
  stage: "mode" | "pay" | "x" | "kicker" | "target" | "discard" | "sacrifice" | "tap" | "materials";
  spec: TargetOption | null;
  /** Cibles déjà désignées pour `spec` quand il en accepte plusieurs. */
  picked?: string[];
  /** Cible désignée par glisser-déposer, utilisée pour la première cible compatible. */
  preset?: string;
}

/** Effet visuel éphémère : chiffre de dégâts/soin, silhouette d'une créature qui meurt. */
export interface Fx {
  id: number;
  kind: "damage" | "heal" | "death";
  /** Objet ou joueur visé (data-oid). */
  target: string;
  amount: number;
  /** Décalage (s) pour échelonner les effets d'un même lot. */
  delay: number;
  /** Position capturée avant la mise à jour de l'écran (utile si l'objet disparaît). */
  rect: { x: number; y: number; w: number; h: number } | null;
}

export interface Hover {
  face: CardFace;
  obj?: ObjectView;
}

/** Partie en ligne (salon sur le serveur). */
/** Match contre l'IA au meilleur des trois manches (le serveur tient celui d'un match en ligne). */
export interface LocalMatch {
  bestOf: 3;
  wins: Record<string, number>;
  game: number;
  winner: string | null;
  /** Deck et réserve de la manche en cours, et ceux du début du match (un échange garde les mêmes cartes). */
  deck: { main: DeckEntries; sideboard: DeckEntries };
  original: { main: DeckEntries; sideboard: DeckEntries };
  aiDeck: DeckEntries;
  aiLevel?: AiLevel;
}

export interface OnlineState {
  status: "connecting" | RoomInfo["status"];
  /** Match (BO1 ou BO3) et deck actuel du joueur (point de départ de la réserve entre deux manches). */
  match?: MatchInfo;
  deck?: RoomInfo["deck"];
  code: string | null;
  seat: Seat | null;
  players: RoomInfo["players"];
  /** Adversaire déconnecté : échéance de son retour (Date.now()). */
  opponent: { connected: boolean; deadline: number | null };
  /** Minuteur de la décision en cours ; `deadline` en Date.now(). */
  clock: (Clock & { deadline: number }) | null;
  error: string | null;
  /** Connexion au serveur perdue : reconnexion en cours. */
  reconnecting: boolean;
}

interface Store {
  screen: "lobby" | "decks" | "game" | "online" | "tutorial";
  /** Partie du tutoriel : le retour au menu ramène au menu du tutoriel. */
  tutorialGame: boolean;
  /** Deck ouvert dans le deckbuilder. */
  editingDeck: string | null;
  session: Session | null;
  online: OnlineState | null;
  view: GameView | null;
  faces: Record<string, CardFace>;
  log: LogLine[];
  toast: { text: string; id: number } | null;
  settings: AutopilotSettings;
  lang: Lang;
  casting: Casting | null;
  /** `unavailable` : capacités activées du permanent qu'on ne peut pas activer en ce moment (affichées grisées). */
  abilityMenu: {
    sourceId: string;
    options: ActionOption[];
    unavailable?: { label: string; cost: string }[];
  } | null;
  attackers: string[];
  /** Défenseur choisi pour chaque attaquant (multijoueur). */
  attackTargets: Record<string, string>;
  /** Attaquant « en visée » (plusieurs défenseurs possibles) : on clique ensuite sa cible, joueur ou planeswalker. */
  aimingAttacker: string | null;
  blocks: Record<string, string>;
  selectedBlocker: string | null;
  selection: string[];
  hover: Hover | null;
  /** Écran tactile : carte agrandie en surimpression (appui long). */
  peek: Hover | null;
  /** Écran étroit : barre latérale (réglages, aperçu, journal) ouverte en tiroir. */
  drawerOpen: boolean;
  graveyardOpen: string | null;
  /** Exil consulté (cartes possédées par ce joueur). */
  exileOpen: string | null;
  fx: Fx[];
  turnBanner: { id: number; text: string; mine: boolean } | null;
  spotlight: { id: number; face: CardFace; who: string } | null;
  /**
   * Élément de pile qui se résout (ou est contrecarré, ou n'a plus de cible légale), montré avant que son effet
   * s'applique ; la partie n'avance qu'après (voir `playbackTimes`).
   */
  resolving: { id: number; item: StackItemView; outcome: "resolve" | "fizzle" | "countered" } | null;
  /** Rythme des effets (durée pendant laquelle chaque résolution est montrée). */
  pace: Pace;
  setPace(pace: Pace): void;

  startGame(
    playerDeck: DeckEntries,
    aiDecks: DeckEntries[],
    sandbox?: Sandbox,
    aiLevel?: AiLevel,
    match?: { bestOf: 3; sideboard: DeckEntries },
  ): void;
  /** Match contre l'IA en cours (BO3). */
  localMatch: LocalMatch | null;
  /** Manche suivante d'un match : deck et réserve choisis (contre l'IA : relance ; en ligne : envoyés au serveur). */
  nextGame(main: DeckEntries, sideboard: DeckEntries): void;
  /** Tutoriel : partie mise en scène. */
  startScenario(scenario: ScenarioSpec): void;
  openTutorial(): void;
  openOnline(): void;
  createRoom(name: string, deck: DeckEntries, opts?: { sideboard?: DeckEntries; bestOf?: 1 | 3 }): void;
  joinRoom(code: string, name: string, deck: DeckEntries, sideboard?: DeckEntries): void;
  /** Reprend la partie en ligne de cet onglet (jeton de reconnexion), au chargement ou après une coupure. */
  resumeOnline(): void;
  leaveRoom(): void;
  rematch(): void;
  receiveOnline(msg: ServerMessage): void;
  backToLobby(): void;
  openDeckBuilder(deckId?: string | null): void;
  receive(msg: FromWorker): void;
  /** Applique une mise à jour de la partie (vue, journal, sons, effets). */
  applyUpdate(msg: Extract<FromWorker, { type: "update" }>): void;
  /** Replay en cours : position, point de vue, lecture automatique. */
  replay: {
    index: number;
    total: number;
    viewer: string;
    players: { id: string; name: string }[];
    playing: boolean;
    /** Replay arrêté avant la fin, ou enregistré avec une autre version des règles. */
    warning: string | null;
  } | null;
  /** Télécharge l'enregistrement de la partie (contre l'IA : à tout moment ; en ligne : une fois terminée). */
  exportGame(): void;
  /** Ouvre un enregistrement de partie dans le visionneur. */
  openReplay(record: GameRecord): void;
  replaySeek(index: number): void;
  replayViewer(player: string): void;
  replayPlay(on: boolean): void;
  decide(d: Decision): void;
  notify(text: string): void;
  /** Passer la priorité ; avec du mana flottant qui serait perdu, un premier appui avertit seulement. */
  passPriority(): void;
  /** Décision pour laquelle l'avertissement de mana flottant a déjà été donné. */
  floatWarned: string | null;
  clickHandCard(id: string): void;
  dropHandCard(id: string, targetId: string | null): void;
  clickPermanent(id: string): void;
  clickPlayer(id: string): void;
  beginCasting(option: PlayableOption, sourceId: string, preset?: string): void;
  /** Lancement d'un légendaire dont vous contrôlez déjà un exemplaire : en attente de confirmation. */
  legendConfirm: { option: PlayableOption; sourceId: string; preset?: string; name: string } | null;
  confirmLegend(): void;
  cancelLegend(): void;
  chooseMode(index: number): void;
  chooseX(x: number): void;
  chooseKicker(kicked: boolean): void;
  chooseNoTarget(): void;
  choosePayMode(mode: "normal" | "free" | "alt"): void;
  /** Désigne une cible (ou la retire, pour un mot « cible » qui en accepte plusieurs). */
  pickTarget(id: string): void;
  /** Valide les cibles déjà désignées (« jusqu'à N »). */
  confirmTargets(): void;
  chooseAdditional(kind: "discard" | "sacrifice" | "tap" | "materials", ids: string[]): void;
  cancel(): void;
  toggleAttacker(id: string): void;
  /** Cible choisie pour l'attaquant en visée. */
  aimAttackAt(defender: string): void;
  allAttack(): void;
  /** « Fin du tour » : passe douce (s'arrête si un adversaire agit), ou dure (`hard`). */
  endTurn(hard?: boolean): void;
  toggleStop(side: "own" | "opponent", step: Step): void;
  setFullControl(on: boolean): void;
  setHoldPriority(on: boolean): void;
  /** Réglages de l'automatisme imposés par le tutoriel (arrêts). */
  applySettings(partial: Partial<AutopilotSettings>): void;
  setLang(lang: Lang): void;
  setHover(h: Hover | null): void;
  setPeek(h: Hover | null): void;
  setDrawerOpen(open: boolean): void;
  toggleSelection(id: string): void;
  openGraveyard(player: string | null): void;
  openExile(player: string | null): void;
}

/**
 * Nom du légendaire en double si l'on lance ce sort : un permanent légendaire du même nom que vous contrôlez déjà
 * (sinon null). Seulement pour un vrai lancement de la carte (pas une capacité, ni face cachée).
 */
function legendDuplicate(view: GameView | null, option: PlayableOption, sourceId: string): string | null {
  if (!view || option.type !== "cast" || option.faceDown) return null;
  const card = [...view.hand, ...view.playableElsewhere, ...(view.players[view.viewer]?.graveyard ?? [])].find(
    (c) => c.id === sourceId,
  );
  if (!card) return null;
  const name = option.faceName ?? card.name;
  const typeLine = option.faceName ? (card.otherFaces?.find((f) => f?.name === option.faceName)?.typeLine ?? "") : card.typeLine;
  if (!/\bLegendary\b/.test(typeLine)) return null;
  const mine = view.battlefield.some((o) => o.controller === view.viewer && o.name === name && /\bLegendary\b/.test(o.typeLine));
  return mine ? name : null;
}

export function myActions(view: GameView | null): ActionOption[] {
  const p = view?.pending;
  return p?.kind === "priority" && p.player === view?.viewer ? (p.actions ?? []) : [];
}

function pendingKey(v: GameView | null): string {
  const p = v?.pending;
  if (!v || !p) return "none";
  // Deux choix successifs d'une même résolution : la question elle-même les distingue.
  const req =
    p.kind === "choice" && p.request
      ? `:${p.request.prompt}:${JSON.stringify(p.request.type === "pick" ? p.request.options : [])}`
      : "";
  return `${p.kind}:${p.player}:${v.turn.number}:${v.turn.step}:${v.stack.length}${req}`;
}

function targetSpecs(c: Casting): TargetOption[] {
  if (c.option.type === "cast") return c.option.modes.find((m) => m.index === c.mode)?.targets ?? [];
  return c.option.targets;
}

function buildDecision(c: Casting): Decision {
  if (c.option.type === "cast") {
    return {
      type: "cast",
      card: c.option.card,
      face: c.option.face,
      faceDown: c.option.faceDown,
      warp: c.option.warp,
      mode: c.mode ?? 0,
      targets: c.targets,
      x: c.x ?? undefined,
      kicked: c.kicked ?? false,
      discard: c.discard ?? undefined,
      sacrifice: c.sacrifice ?? undefined,
      tap: c.tap ?? undefined,
      free: c.payMode === "free" && !c.option.free ? true : undefined,
      alternative: c.payMode === "alt" ? true : undefined,
    };
  }
  return {
    type: "activate",
    source: c.option.source,
    ability: c.option.ability,
    targets: c.targets,
    x: c.x ?? undefined,
    discard: c.discard ?? undefined,
    sacrifice: c.sacrifice ?? undefined,
    tap: c.tap ?? undefined,
    materials: c.materials ?? undefined,
  };
}

let toastId = 0;
let fxId = 0;

/** Position d'un élément du plateau (avant qu'il ne disparaisse de l'écran). */
function rectOf(id: string): Fx["rect"] {
  const el = findObjectEl(id);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height };
}

/** Transforme les événements d'une mise à jour en effets visuels échelonnés. */
function playEffects(view: GameView, events: GameEvent[], faces: Record<string, CardFace>): void {
  const store = useGame;
  const fresh: Fx[] = [];
  let step = 0;
  const push = (kind: Fx["kind"], target: string, amount: number) => {
    fresh.push({ id: ++fxId, kind, target, amount, delay: Math.min(step * 0.22, 2.2), rect: rectOf(target) });
    step += 1;
  };
  let banner: Store["turnBanner"] = null;
  let spotlight: Store["spotlight"] = null;
  for (const e of events) {
    if (e.type === "damage" && !e.targetDefId && !view.players[e.target]) continue;
    if (e.type === "damage" && e.targetDefId) push("damage", e.target, e.amount);
    else if (e.type === "life") push(e.delta < 0 ? "damage" : "heal", e.player, Math.abs(e.delta));
    else if (e.type === "dies") push("death", e.objectId, 0);
    else if (e.type === "turnStart") {
      const mine = e.player === view.viewer;
      // Replay : pas de « À vous de jouer » (on ne joue pas), le nom du joueur actif.
      const replaying = !!store.getState().replay;
      banner = {
        id: ++fxId,
        mine,
        text: mine && !replaying ? "À vous de jouer" : `Tour de ${view.players[e.player]?.name ?? "l'adversaire"}`,
      };
    } else if ((e.type === "cast" || e.type === "activate" || e.type === "trigger") && e.player !== view.viewer) {
      const face = faces[e.defId];
      if (face) spotlight = { id: ++fxId, face, who: view.players[e.player]?.name ?? "L'adversaire" };
    }
  }
  if (!fresh.length && !banner && !spotlight) return;
  store.setState((s) => ({
    fx: [...s.fx, ...fresh],
    ...(banner ? { turnBanner: banner } : {}),
    ...(spotlight ? { spotlight } : {}),
  }));
  const ids = new Set(fresh.map((f) => f.id));
  const longest = fresh.reduce((m, f) => Math.max(m, f.delay), 0);
  setTimeout(() => store.setState((s) => ({ fx: s.fx.filter((f) => !ids.has(f.id)) })), (longest + 1.8) * 1000);
  if (banner) {
    const id = banner.id;
    setTimeout(() => store.getState().turnBanner?.id === id && store.setState({ turnBanner: null }), 1400);
  }
  if (spotlight) {
    const id = spotlight.id;
    setTimeout(() => store.getState().spotlight?.id === id && store.setState({ spotlight: null }), 1500);
  }
}

// ---------------------------------------------------------------------------
// Jeu en ligne : jeton de reconnexion (propre à l'onglet) et pseudo (retenu)
// ---------------------------------------------------------------------------

const TOKEN_KEY = "mtgmate.online";
const NAME_KEY = "mtgmate.name";

function loadToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

/** Enregistrement de partie téléchargé en fichier JSON (« mtgmate-partie-2026-09-29-1432.json »). */
function downloadRecord(record: GameRecord): void {
  const stamp = new Date().toISOString().slice(0, 16).replace("T", "-").replace(":", "");
  const blob = new Blob([JSON.stringify(record)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `mtgmate-partie-${stamp}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** Lecture automatique du replay : une étape toutes les 700 ms. */
let replayTimer: ReturnType<typeof setInterval> | null = null;

function saveToken(token: string | null): void {
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    // stockage indisponible : pas de reconnexion automatique
  }
}

export function loadName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
}

function saveName(name: string): void {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    // réglage non conservé
  }
}

const EMPTY_ONLINE: OnlineState = {
  status: "connecting",
  code: null,
  seat: null,
  players: [],
  opponent: { connected: true, deadline: null },
  clock: null,
  error: null,
  reconnecting: false,
};

/** Délai entre deux tentatives de reconnexion, et nombre de tentatives (≈ délai de retour du serveur). */
const RETRY_MS = 2000;
const MAX_RETRIES = 30;
let retries = 0;

/**
 * Ouvre une connexion au serveur (en fermant la session précédente). En cas de coupure pendant
 * une partie, on retente la reconnexion avec le jeton de l'onglet.
 */
function connectRemote(keep?: OnlineState | null): RemoteSession {
  const store = useGame;
  store.getState().session?.close();
  const session: RemoteSession = new RemoteSession(
    (m) => {
      retries = 0;
      store.getState().receiveOnline(m);
    },
    () => {
      const { online, session: current } = store.getState();
      if (current !== session || !online || !loadToken()) return;
      store.setState({ online: { ...online, reconnecting: true } });
      if (retries++ < MAX_RETRIES) setTimeout(() => store.getState().resumeOnline(), RETRY_MS);
    },
  );
  store.setState({ session, online: keep ? { ...keep, error: null } : { ...EMPTY_ONLINE } });
  return session;
}

/** Rythme des effets, réglé par le joueur (barre latérale), retenu d'une partie à l'autre. */
export type Pace = "slow" | "normal" | "fast" | "none";

export const PACES: { pace: Pace; label: string; hint: string }[] = [
  { pace: "slow", label: "Lent", hint: "Chaque effet est montré près de 2 secondes" },
  { pace: "normal", label: "Normal", hint: "Chaque effet est montré un peu plus d'une seconde" },
  { pace: "fast", label: "Rapide", hint: "Chaque effet est montré une demi-seconde" },
  { pace: "none", label: "Sans pause", hint: "Les effets s'appliquent aussitôt, sans être montrés" },
];

/**
 * Rythme de la partie : chaque résolution est montrée (`resolving`) pendant `show` ms avant que son effet s'applique,
 * puis le résultat reste visible `after` ms avant l'étape suivante. Un instant en mode rapide des tests.
 */
export function playbackTimes(pace: Pace): { show: number; after: number } {
  if (fastMode()) return { show: 40, after: 0 };
  return {
    slow: { show: 1900, after: 700 },
    normal: { show: 1100, after: 400 },
    fast: { show: 500, after: 150 },
    none: { show: 0, after: 0 },
  }[pace];
}

const PACE_KEY = "mtgmate.pace";
const SETTINGS_KEY = "mtgmate.autopilot";
const LANG_KEY = "mtgmate.lang";

/** Réglages de l'automatisme retenus d'une session à l'autre (arrêts, contrôle total, garder la priorité). */
function loadSettings(): AutopilotSettings {
  const base = structuredClone(DEFAULT_AUTOPILOT);
  try {
    const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "null") as Partial<AutopilotSettings> | null;
    if (!raw || typeof raw !== "object") return base;
    return {
      ...base,
      ...(typeof raw.fullControl === "boolean" ? { fullControl: raw.fullControl } : {}),
      ...(typeof raw.holdPriority === "boolean" ? { holdPriority: raw.holdPriority } : {}),
      ...(typeof raw.revealOpponentStack === "boolean" ? { revealOpponentStack: raw.revealOpponentStack } : {}),
      ...(raw.stops && Array.isArray(raw.stops.own) && Array.isArray(raw.stops.opponent)
        ? { stops: { own: raw.stops.own, opponent: raw.stops.opponent } }
        : {}),
    };
  } catch {
    return base;
  }
}

function saveSettings(s: AutopilotSettings): void {
  try {
    const { fullControl, holdPriority, revealOpponentStack, stops } = s;
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ fullControl, holdPriority, revealOpponentStack, stops }));
  } catch {
    // Stockage indisponible (navigation privée) : réglages de la session seulement.
  }
}

function loadLang(): Lang {
  try {
    return localStorage.getItem(LANG_KEY) === "en" ? "en" : "fr";
  } catch {
    return "fr";
  }
}

function loadPace(): Pace {
  try {
    const v = localStorage.getItem(PACE_KEY);
    return PACES.some((p) => p.pace === v) ? (v as Pace) : "normal";
  } catch {
    return "normal";
  }
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Mises à jour reçues pas encore affichées, avec la session qui les a envoyées (ignorées si elle a changé). */
const playback: { msg: Extract<FromWorker, { type: "update" }>; session: Session | null }[] = [];
let pumping = false;
let resolvingNow = false;

/** Une résolution est montrée, ou des mises à jour attendent : la vue affichée n'est pas encore la dernière. */
function playbackBusy(): boolean {
  return resolvingNow || playback.length > 0;
}

/** L'élément de pile que la mise à jour fait quitter la pile (résolu, contrecarré ou sans cible), s'il est affiché. */
function leavingItem(
  view: GameView | null,
  events: GameEvent[],
): { item: StackItemView; outcome: "resolve" | "fizzle" | "countered" } | null {
  for (const e of events) {
    if (e.type !== "resolve" && e.type !== "fizzle" && e.type !== "countered") continue;
    const item = view?.stack.find((x) => x.id === e.stackId);
    if (item) return { item, outcome: e.type };
  }
  return null;
}

export const useGame = create<Store>((set, get) => {
  /** Affiche les mises à jour en attente une à une, en montrant chaque résolution avant d'en appliquer l'effet. */
  const pump = async () => {
    if (pumping) return;
    pumping = true;
    try {
      while (playback.length) {
        const next = playback[0];
        if (!next) break;
        if (next.session !== get().session) {
          playback.shift();
          continue;
        }
        const leaving = leavingItem(get().view, next.msg.events);
        const times = playbackTimes(get().pace);
        if (leaving && times.show > 0) {
          resolvingNow = true;
          set({ resolving: { id: ++fxId, ...leaving } });
          await sleep(times.show);
          resolvingNow = false;
          // La partie a changé pendant l'attente (retour au menu, nouvelle partie) : on abandonne cette étape.
          if (next.session !== get().session) continue;
        }
        playback.shift();
        set({ resolving: null });
        get().applyUpdate(next.msg);
        if (leaving && playback.length > 0 && times.after > 0) await sleep(times.after);
      }
    } finally {
      pumping = false;
      resolvingNow = false;
      if (get().resolving) set({ resolving: null });
    }
  };
  /** Choix sur le plateau en cours (façon MTGA) : un clic sélectionne ou retire l'option. Renvoie false hors de ce mode. */
  const pickOnBoard = (id: string): boolean => {
    const req = boardPick(get().view);
    if (!req) return false;
    if (req.options.includes(id)) set({ selection: togglePick(req, get().selection, id) });
    else get().notify("Ce choix n'est pas possible.");
    return true;
  };
  /** Avance dans les choix d'un lancement ; envoie la décision quand tout est choisi. */
  const continueCasting = (c: Casting) => {
    if (c.option.type === "cast" && c.mode === null) {
      if (c.option.modes.length > 1) return set({ casting: { ...c, stage: "mode" } });
      c.mode = c.option.modes[0]?.index ?? 0;
    }
    if (c.option.type === "cast" && c.payMode === null) {
      const o = c.option;
      const modes = o.free
        ? (["free"] as const)
        : ([o.normalAvailable && "normal", o.freeAvailable && "free", o.altAvailable && "alt"].filter(Boolean) as (
            | "normal"
            | "free"
            | "alt"
          )[]);
      // Sans payer est toujours le meilleur choix, sauf pour un sort à X (X vaut alors 0).
      if (modes.length === 1 || (modes.includes("free") && o.xMax === null))
        c.payMode = modes.includes("free") ? "free" : (modes[0] ?? "normal");
      else return set({ casting: { ...c, stage: "pay" } });
    }
    if (c.x === null) {
      if (c.payMode !== "free" && c.option.xMax !== null && c.option.xMax > 0) return set({ casting: { ...c, stage: "x" } });
      c.x = c.payMode === "free" ? 0 : (c.option.xMax ?? 0);
    }
    if (c.option.type === "cast" && c.kicked === null) {
      if (c.option.kickerAffordable) return set({ casting: { ...c, stage: "kicker" } });
      c.kicked = false;
    }
    // Marchandage (kicker sans mana) : le permanent sacrifié, s'il y a le choix.
    if (
      c.option.type === "cast" &&
      c.kicked &&
      !c.option.additional?.sacrifice &&
      (c.option.kickerPermanents?.length ?? 0) > 1 &&
      c.sacrifice === null
    )
      return set({ casting: { ...c, stage: "sacrifice", spec: null } });
    // Travail d'équipe : les créatures à engager.
    if (c.option.type === "cast" && c.kicked && c.option.kickerTap && c.tap === null)
      return set({ casting: { ...c, stage: "tap", spec: null } });
    for (const spec0 of targetSpecs(c)) {
      // Cadeau promis (Bloomburrow) : « à la place, un permanent non-terrain ciblé ».
      const spec = c.kicked && spec0.kickedLegal ? { ...spec0, legal: spec0.kickedLegal } : spec0;
      if (c.targets[spec.id] !== undefined) continue;
      if (c.preset && spec.legal.includes(c.preset)) {
        c.targets[spec.id] = [c.preset];
        c.preset = undefined;
        continue;
      }
      // Cible optionnelle sans aucune option légale : rien à demander.
      if (spec.optional && spec.legal.length === 0) {
        c.targets[spec.id] = [];
        continue;
      }
      const auto = get().settings.fullControl ? null : autoTarget(spec);
      if (auto) {
        c.targets[spec.id] = [auto];
        continue;
      }
      let effective = c.kicked && spec.kickedCount ? { ...spec, count: spec.kickedCount } : spec;
      // « Équipement attaché à cette créature » : seules les options attachées à la cible déjà choisie.
      const host = spec.attachedToTarget;
      if (host) {
        const hosts = c.targets[host] ?? [];
        const legal = spec.legal.filter((id) =>
          hosts.includes(get().view?.battlefield.find((o) => o.id === id)?.attachedTo ?? ""),
        );
        effective = { ...effective, legal };
        if (legal.length === 0 && spec.optional) {
          c.targets[spec.id] = [];
          continue;
        }
      }
      return set({ casting: { ...c, stage: "target", spec: effective, picked: [] } });
    }
    // Coûts additionnels : choisis en dernier, une fois les cibles connues.
    const extra = c.option.type === "cast" || c.option.type === "activate" ? c.option.additional : undefined;
    if (extra && "discard" in extra && extra.discard && c.discard === null)
      return set({ casting: { ...c, stage: "discard", spec: null } });
    if (extra?.sacrifice && c.sacrifice === null) return set({ casting: { ...c, stage: "sacrifice", spec: null } });
    if (extra && "tap" in extra && extra.tap && c.tap === null) return set({ casting: { ...c, stage: "tap", spec: null } });
    if (extra && "materials" in extra && extra.materials && c.materials === null)
      return set({ casting: { ...c, stage: "materials", spec: null } });
    get().decide(buildDecision(c));
  };

  const sendSettings = (settings: AutopilotSettings) => {
    set({ settings });
    saveSettings(settings);
    get().session?.send({ type: "settings", settings });
  };

  /** Lance une partie contre l'IA dans un nouveau worker. */
  function startLocal(
    playerDeck: DeckEntries,
    aiDecks: DeckEntries[],
    sandbox?: Sandbox,
    aiLevel?: AiLevel,
    startingPlayer?: string,
  ): void {
    get().session?.close();
    preloadSounds();
    const session = new LocalSession((m) => get().receive(m));
    const settings = { ...get().settings, passUntilTurn: null };
    set({ screen: "game", session, view: null, log: [], casting: null, attackers: [], blocks: {}, selection: [], settings });
    session.send({
      type: "start",
      seed: Math.floor(Math.random() * 2 ** 31),
      playerName: "Vous",
      playerDeck,
      aiDecks,
      defs: defsFor([playerDeck, ...aiDecks], sandbox),
      sandbox,
      fast: fastMode(),
      aiLevel,
      startingPlayer,
    });
    session.send({ type: "settings", settings });
  }

  return {
    screen: "lobby",
    replay: null,
    tutorialGame: false,
    editingDeck: null,
    session: null,
    online: null,
    view: null,
    faces: {},
    log: [],
    toast: null,
    floatWarned: null,
    settings: loadSettings(),
    lang: loadLang(),
    casting: null,
    abilityMenu: null,
    attackers: [],
    attackTargets: {},
    aimingAttacker: null,
    blocks: {},
    selectedBlocker: null,
    selection: [],
    hover: null,
    peek: null,
    drawerOpen: false,
    graveyardOpen: null,
    exileOpen: null,
    fx: [],
    turnBanner: null,
    spotlight: null,
    resolving: null,
    pace: loadPace(),
    setPace(pace) {
      set({ pace });
      try {
        localStorage.setItem(PACE_KEY, pace);
      } catch {
        // stockage indisponible : réglage non retenu
      }
    },

    startGame(playerDeck, aiDecks, sandbox, aiLevel, match) {
      get().session?.close();
      const localMatch: LocalMatch | null =
        match && aiDecks.length === 1
          ? {
              bestOf: 3,
              wins: { p1: 0, p2: 0 },
              game: 1,
              winner: null,
              deck: { main: playerDeck, sideboard: match.sideboard },
              original: { main: playerDeck, sideboard: match.sideboard },
              aiDeck: aiDecks[0] as DeckEntries,
              aiLevel,
            }
          : null;
      set({ online: null, tutorialGame: false, replay: null, localMatch });
      startLocal(playerDeck, aiDecks, sandbox, aiLevel);
    },

    nextGame(main, sideboard) {
      const online = get().online;
      if (online) {
        (get().session as RemoteSession | null)?.raw({ type: "sideboard", main, sideboard });
        return;
      }
      const m = get().localMatch;
      if (!m || m.winner) return;
      const error = sideboardSwapError(m.original, { main, sideboard }, CARDS);
      if (error) return get().notify(error);
      // Le perdant de la manche précédente commence.
      const last = get().view;
      const loser = last?.winner ? (last.winner === "p1" ? "p2" : "p1") : undefined;
      set({ localMatch: { ...m, deck: { main, sideboard }, game: m.game + 1 } });
      startLocal(main, [m.aiDeck], undefined, m.aiLevel, loser);
    },

    localMatch: null,
    startScenario(scenario) {
      get().session?.close();
      preloadSounds();
      const session = new LocalSession((m) => get().receive(m));
      // Réglages par défaut : le tutoriel fixe lui-même les arrêts dont il a besoin.
      const settings = structuredClone(DEFAULT_AUTOPILOT);
      set({
        screen: "game",
        tutorialGame: true,
        replay: null,
        localMatch: null,
        online: null,
        session,
        view: null,
        log: [],
        fx: [],
        casting: null,
        attackers: [],
        blocks: {},
        selection: [],
        hover: null,
        settings,
      });
      session.send({
        type: "start",
        seed: 1,
        playerName: "Vous",
        playerDeck: [],
        aiDecks: [],
        defs: defsFor([], undefined, scenario),
        scenario,
        fast: fastMode(),
      });
      session.send({ type: "settings", settings });
    },

    openTutorial() {
      set({ screen: "tutorial" });
    },

    openOnline() {
      set({ screen: "online", tutorialGame: false });
    },

    createRoom(name, deck, opts = {}) {
      set({ localMatch: null });
      connectRemote().raw({ type: "create", name, deck, sideboard: opts.sideboard, bestOf: opts.bestOf });
      saveName(name);
    },

    joinRoom(code, name, deck, sideboard) {
      set({ localMatch: null });
      connectRemote().raw({ type: "join", code, name, deck, sideboard });
      saveName(name);
    },

    resumeOnline() {
      const token = loadToken();
      if (!token) return;
      connectRemote(get().online?.status === "connecting" ? undefined : get().online).raw({ type: "rejoin", token });
    },

    leaveRoom() {
      const session = get().session;
      if (session instanceof RemoteSession) session.raw({ type: "leave" });
      session?.close();
      saveToken(null);
      set({
        online: null,
        session: null,
        screen: "lobby",
        view: null,
        casting: null,
        hover: null,
        peek: null,
        drawerOpen: false,
      });
    },

    rematch() {
      const session = get().session;
      if (session instanceof RemoteSession) session.raw({ type: "rematch" });
    },

    receiveOnline(msg) {
      const online = get().online;
      if (!online) return;
      switch (msg.type) {
        case "room": {
          const r = msg.room;
          saveToken(r.token);
          const starting = r.status === "playing" && online.status !== "playing";
          set({
            online: {
              ...online,
              status: r.status,
              code: r.code,
              seat: r.seat,
              players: r.players,
              match: r.match,
              deck: r.deck,
              error: null,
              reconnecting: false,
            },
            ...(starting
              ? { screen: "game", view: null, log: [], casting: null, attackers: [], blocks: {}, selection: [], fx: [] }
              : r.status === "waiting"
                ? { screen: "online" }
                : {}),
          });
          if (starting) {
            preloadSounds();
            get().session?.send({ type: "settings", settings: get().settings });
          }
          return;
        }
        case "update":
          set({
            online: { ...online, clock: msg.clock ? { ...msg.clock, deadline: Date.now() + msg.clock.remainingMs } : null },
            ...(get().screen !== "game" ? { screen: "game" } : {}),
          });
          get().receive({ type: "update", view: msg.view, events: msg.events, faces: msg.faces });
          return;
        case "opponent":
          set({
            online: {
              ...online,
              opponent: { connected: msg.connected, deadline: msg.remainingMs === null ? null : Date.now() + msg.remainingMs },
            },
          });
          return;
        case "record":
          downloadRecord(msg.record);
          return;
        case "error":
          if (msg.code === "rules") return get().receive({ type: "error", message: msg.message });
          if (msg.code === "token") {
            // La partie de cet onglet n'existe plus.
            saveToken(null);
            get().session?.close();
            set({ online: null, session: null, ...(get().screen === "game" ? { screen: "lobby", view: null } : {}) });
            return;
          }
          playSound("error");
          set({ online: { ...online, error: msg.message, status: online.code ? online.status : "connecting" } });
          if (!online.code || msg.code === "closed") {
            // Création ou arrivée refusée, ou salon fermé par le serveur : on ferme la connexion.
            if (msg.code === "closed") saveToken(null);
            get().session?.close();
            set({ session: null, online: { ...online, error: msg.message, status: "connecting" } });
          }
          return;
      }
    },

    openDeckBuilder(deckId) {
      set({ screen: "decks", editingDeck: deckId ?? get().editingDeck });
    },

    exportGame() {
      get().session?.send({ type: "export" });
    },

    openReplay(record) {
      get().session?.close();
      if (replayTimer) clearInterval(replayTimer);
      replayTimer = null;
      let session: ReplaySession;
      try {
        session = new ReplaySession(record, card);
      } catch (e) {
        return get().notify(`Replay impossible : ${e instanceof Error ? e.message : String(e)}`);
      }
      const viewer = record.players[0]?.id ?? "p1";
      set({
        screen: "game",
        tutorialGame: false,
        online: null,
        localMatch: null,
        session,
        log: [],
        fx: [],
        // Rien de la partie précédente : bandeau de tour, sort adverse montré, message.
        turnBanner: null,
        spotlight: null,
        toast: null,
        casting: null,
        attackers: [],
        blocks: {},
        selection: [],
        replay: {
          index: 0,
          total: session.states.length - 1,
          viewer,
          players: record.players.map((p) => ({ id: p.id, name: p.name })),
          playing: false,
          warning: session.warning,
        },
      });
      const { view, faces } = session.frame(0, viewer, false);
      set({ view, faces });
    },

    replaySeek(index) {
      const { replay, session } = get();
      if (!replay || !(session instanceof ReplaySession)) return;
      const i = Math.max(0, Math.min(replay.total, index));
      // Une étape en avant : ses événements (journal, sons, effets) ; un saut : l'état seul, journal vidé.
      const step = i === replay.index + 1;
      const frame = session.frame(i, replay.viewer, step);
      if (step) {
        get().receive({ type: "update", ...frame });
      } else set({ view: frame.view, faces: frame.faces, log: [] });
      set({ replay: { ...replay, index: i } });
      if (i >= replay.total) get().replayPlay(false);
    },

    replayViewer(player) {
      const { replay, session } = get();
      if (!replay || !(session instanceof ReplaySession)) return;
      const frame = session.frame(replay.index, player, false);
      set({ replay: { ...replay, viewer: player }, view: frame.view, faces: frame.faces, log: [] });
    },

    replayPlay(on) {
      const replay = get().replay;
      if (!replay) return;
      if (replayTimer) clearInterval(replayTimer);
      replayTimer = null;
      if (on)
        replayTimer = setInterval(() => {
          const r = get().replay;
          if (r) get().replaySeek(r.index + 1);
        }, 700);
      set({ replay: { ...replay, playing: on } });
    },

    backToLobby() {
      if (replayTimer) clearInterval(replayTimer);
      replayTimer = null;
      if (get().replay) set({ replay: null });
      if (get().online) return get().leaveRoom();
      get().session?.close();
      set({
        screen: get().tutorialGame && get().screen === "game" ? "tutorial" : "lobby",
        tutorialGame: false,
        session: null,
        view: null,
        casting: null,
        hover: null,
        peek: null,
        drawerOpen: false,
      });
    },

    receive(msg) {
      if (msg.type === "record") {
        if (msg.record) downloadRecord(msg.record);
        else get().notify("Cette partie n'est pas enregistrée (tutoriel ou bac à sable).");
        return;
      }
      if (msg.type === "error") {
        playSound("error");
        return get().notify(msg.message);
      }
      // Rejeu : les étapes s'affichent tout de suite (le visionneur a ses propres commandes).
      if (get().replay) return get().applyUpdate(msg);
      playback.push({ msg, session: get().session });
      void pump();
    },

    applyUpdate(msg) {
      const { view, events, faces } = msg;
      // Match contre l'IA : la manche qui se termine compte (deux victoires emportent le match, trois manches au plus).
      const m = get().localMatch;
      if (m && !m.winner && view.over && !get().view?.over) {
        const wins = { ...m.wins };
        if (view.winner) wins[view.winner] = (wins[view.winner] ?? 0) + 1;
        const decided = (wins.p1 ?? 0) >= 2 || (wins.p2 ?? 0) >= 2 || m.game >= m.bestOf;
        const winner = decided ? ((wins.p1 ?? 0) > (wins.p2 ?? 0) ? "p1" : (wins.p2 ?? 0) > (wins.p1 ?? 0) ? "p2" : null) : null;
        set({ localMatch: { ...m, wins, winner: decided ? (winner ?? "nul") : null } });
      }
      const lines = describeEvents(events, view, faces, get().lang, get().view);
      for (const cue of soundsFor(events, view, get().view, faces)) playSound(cue.key, cue);
      playEffects(view, events, faces);
      const changed = pendingKey(get().view) !== pendingKey(view);
      // Passe douce : un sort ou une capacité adverse rend la main ; la passe jusqu'à la fin du tour s'arrête là.
      const st = get().settings;
      const top = view.stack[view.stack.length - 1];
      if (
        st.passUntilTurn !== null &&
        st.passMode !== "hard" &&
        view.pending?.kind === "priority" &&
        view.pending.player === view.viewer &&
        top &&
        top.controller !== view.viewer
      )
        sendSettings({ ...st, passUntilTurn: null });
      // Créatures qui doivent attaquer : déjà sélectionnées (et impossibles à retirer côté moteur).
      const p = view.pending;
      const forced =
        p?.kind === "declareAttackers" && p.player === view.viewer
          ? (p.candidates ?? []).filter((id) => view.battlefield.find((o) => o.id === id)?.keywords.includes("mustAttack"))
          : [];
      set((s) => ({
        view,
        faces,
        log: [...s.log, ...lines].slice(-400),
        ...(changed
          ? {
              casting: null,
              abilityMenu: null,
              attackers: forced,
              attackTargets: {},
              aimingAttacker: null,
              legendConfirm: null,
              blocks: {},
              selectedBlocker: null,
              selection: [],
            }
          : {}),
      }));
      observer?.(view, events);
    },

    decide(d) {
      // Pendant qu'une résolution est montrée, la vue affichée n'est pas encore celle de la partie.
      if (playbackBusy()) return;
      if (refused(d)) return;
      get().session?.send({ type: "decision", decision: d });
      set({ casting: null, abilityMenu: null, selectedBlocker: null, selection: [] });
    },

    passPriority() {
      const v = get().view;
      if (!v) return;
      const pool: Record<string, number> = v.players[v.viewer]?.manaPool ?? {};
      const floating = Object.values(pool).some((n) => n > 0);
      const key = pendingKey(v);
      // Pile vide : l'étape va finir et la réserve se vider.
      if (floating && v.stack.length === 0 && get().floatWarned !== key) {
        set({ floatWarned: key });
        return get().notify("Mana inutilisé : il sera perdu à la fin de l'étape. Appuyez de nouveau pour passer.");
      }
      get().decide({ type: "pass" });
    },

    notify(text) {
      const id = ++toastId;
      set({ toast: { text, id } });
      setTimeout(() => {
        if (get().toast?.id === id) set({ toast: null });
      }, 2600);
    },

    clickHandCard(id) {
      const { view, casting } = get();
      if (!view) return;
      if (casting) return get().cancel();
      const p = view.pending;
      if ((p?.kind === "discard" || p?.kind === "bottomCards") && p.player === view.viewer) return get().toggleSelection(id);
      const acts = myActions(view);
      const lands = acts.filter((a) => a.type === "playLand" && a.card === id);
      const casts = acts.filter((a): a is CastOption => a.type === "cast" && a.card === id);
      // Terrain choc : payer les points de vie (dégagé) ou non (engagé) ; Ville à aventure : jouer le terrain ou lancer l'Aventure.
      if (lands.length > 1 || (lands.length === 1 && casts.length > 0))
        return set({ abilityMenu: { sourceId: id, options: [...lands, ...casts] } });
      if (lands.length === 1) return get().decide({ type: "playLand", card: id });
      const cast = casts[0];
      // Capacités activées depuis la main (cycle, « défaussez cette carte : … »), ou plusieurs faces (aventure).
      const fromHand = acts.filter((a): a is ActivateOption => a.type === "activate" && a.source === id);
      if (casts.length + fromHand.length > 1) return set({ abilityMenu: { sourceId: id, options: [...casts, ...fromHand] } });
      if (fromHand[0] && !cast) return get().beginCasting(fromHand[0], id);
      if (cast) return get().beginCasting(cast, id);
      if (p?.kind === "priority" && p.player === view.viewer) {
        const card = view.hand.find((c) => c.id === id);
        if (card && !card.implemented) get().notify("Cette carte n'est pas encore gérée par le moteur.");
        else if (card?.types.includes("Land")) get().notify("Vous ne pouvez pas jouer de terrain maintenant.");
        else get().notify("Impossible de lancer ce sort maintenant (timing ou mana).");
      }
    },

    dropHandCard(id, targetId) {
      const cast = myActions(get().view).find((a): a is CastOption => a.type === "cast" && a.card === id);
      if (cast && targetId) return get().beginCasting(cast, id, targetId);
      get().clickHandCard(id);
    },

    clickPermanent(id) {
      const { view, casting } = get();
      if (!view) return;
      if (casting?.stage === "target" && casting.spec) {
        if (casting.spec.legal.includes(id)) return get().pickTarget(id);
        return get().notify("Cible invalide.");
      }
      if (pickOnBoard(id)) return;
      const p = view.pending;
      if (!p || p.player !== view.viewer) return;
      if (p.kind === "declareAttackers") {
        // Planeswalker attaquable : cible de l'attaquant en visée.
        if (p.defenders?.includes(id)) return get().aimAttackAt(id);
        return get().toggleAttacker(id);
      }
      if (p.kind === "declareBlockers") {
        const cands = p.candidates ?? [];
        const mine = cands.find((c) => c.blocker === id);
        const blocks = { ...get().blocks };
        if (mine) {
          if (blocks[id]) {
            delete blocks[id];
            return set({ blocks, selectedBlocker: null });
          }
          if (mine.attackers.length === 1) {
            blocks[id] = mine.attackers[0] as string;
            return set({ blocks, selectedBlocker: null });
          }
          return set({ selectedBlocker: get().selectedBlocker === id ? null : id });
        }
        const sel = get().selectedBlocker;
        const selCand = cands.find((c) => c.blocker === sel);
        if (sel && selCand?.attackers.includes(id)) {
          blocks[sel] = id;
          return set({ blocks, selectedBlocker: null });
        }
        return;
      }
      if (p.kind === "priority") {
        // Terrain engagé pour son mana, encore inutilisé : un clic l'annule (façon Arena).
        if (view.battlefield.find((o) => o.id === id)?.undoMana) return get().decide({ type: "undoMana", source: id });
        const acts = myActions(view);
        const activations = acts.filter((a): a is ActivateOption => a.type === "activate" && a.source === id);
        const mana = acts.filter((a) => a.type === "tapForMana" && a.source === id);
        // Capacités activées impossibles en ce moment (mana, cible, timing) : montrées grisées plutôt que tues, pour
        // qu'un clic sur un terrain ne l'engage pas en silence pour son mana (Rogue's Passage sans {4} disponible).
        const perm = view.battlefield.find((o) => o.id === id);
        const unavailable = (perm?.controller === view.viewer ? (perm.activated ?? []) : []).filter(
          (a) => !activations.some((x) => x.ability === a.index),
        );
        if (activations.length + mana.length > 1 || (unavailable.length > 0 && activations.length + mana.length > 0))
          return set({ abilityMenu: { sourceId: id, options: [...activations, ...mana], unavailable } });
        if (unavailable.length > 0 && activations.length + mana.length === 0)
          return get().notify(`${unavailable[0]?.label} : impossible maintenant (mana, cible ou moment).`);
        if (activations[0]) return get().beginCasting(activations[0], id);
        const m = mana[0];
        if (m?.type === "tapForMana")
          return get().decide({ type: "tapForMana", source: id, ability: m.ability, color: m.colors[0] });
      }
    },

    clickPlayer(id) {
      const { casting, view } = get();
      const p = view?.pending;
      if (p?.kind === "declareAttackers" && p.player === view?.viewer && p.defenders?.includes(id)) {
        return get().aimAttackAt(id);
      }
      if (pickOnBoard(id)) return;
      if (casting?.stage === "target" && casting.spec) {
        if (casting.spec.legal.includes(id)) return get().pickTarget(id);
        get().notify("Cible invalide.");
      }
    },

    beginCasting(option, sourceId, preset) {
      set({ abilityMenu: null });
      // Règle des légendaires (704.5j) : prévenir avant de lancer un doublon (on ne peut plus annuler ensuite).
      const dup = legendDuplicate(get().view, option, sourceId);
      if (dup && get().legendConfirm?.sourceId !== sourceId) {
        return set({ legendConfirm: { option, sourceId, preset, name: dup } });
      }
      set({ legendConfirm: null });
      continueCasting({
        option,
        sourceId,
        mode: null,
        x: null,
        kicked: null,
        discard: null,
        sacrifice: null,
        tap: null,
        materials: null,
        payMode: null,
        targets: {},
        stage: "mode",
        spec: null,
        preset,
      });
    },

    legendConfirm: null,

    confirmLegend() {
      const c = get().legendConfirm;
      if (c) get().beginCasting(c.option, c.sourceId, c.preset);
    },

    cancelLegend() {
      set({ legendConfirm: null });
    },

    chooseMode(index) {
      const c = get().casting;
      if (!c) return;
      // « Si le coût additionnel a été payé, choisissez les deux » : ce mode impose de le payer.
      const needs = c.option.type === "cast" && c.option.modes.find((m) => m.index === index)?.requiresKicker;
      continueCasting({ ...c, mode: index, ...(needs ? { kicked: true } : {}) });
    },

    choosePayMode(payMode) {
      const c = get().casting;
      if (c) continueCasting({ ...c, payMode });
    },

    chooseX(x) {
      const c = get().casting;
      if (c) continueCasting({ ...c, x });
    },

    chooseKicker(kicked) {
      const c = get().casting;
      if (c) continueCasting({ ...c, kicked });
    },

    chooseAdditional(kind, ids) {
      const c = get().casting;
      if (c) continueCasting({ ...c, [kind]: ids });
    },

    pickTarget(id) {
      const c = get().casting;
      if (!c?.spec || c.stage !== "target") return;
      const max = c.spec.count ?? 1;
      if (max === 1) return continueCasting({ ...c, targets: { ...c.targets, [c.spec.id]: [id] } });
      const cur = c.picked ?? [];
      const g = c.spec.group;
      let picked: string[];
      if (cur.includes(id)) picked = cur.filter((x) => x !== id);
      else if (g?.kind === "same" && cur.some((x) => g.holders[x] !== g.holders[id])) picked = [id];
      else picked = [...(g?.kind === "different" ? cur.filter((x) => g.holders[x] !== g.holders[id]) : cur), id];
      if (picked.length >= max) return continueCasting({ ...c, targets: { ...c.targets, [c.spec.id]: picked }, picked: [] });
      set({ casting: { ...c, picked } });
    },

    confirmTargets() {
      const c = get().casting;
      if (!c?.spec) return;
      const picked = c.picked ?? [];
      if (picked.length === 0 && !c.spec.optional) return;
      continueCasting({ ...c, targets: { ...c.targets, [c.spec.id]: picked }, picked: [] });
    },

    chooseNoTarget() {
      const c = get().casting;
      if (c?.spec?.optional) continueCasting({ ...c, targets: { ...c.targets, [c.spec.id]: [] } });
    },

    cancel() {
      set({ casting: null, abilityMenu: null, selectedBlocker: null, aimingAttacker: null, legendConfirm: null });
    },

    toggleAttacker(id) {
      const p = get().view?.pending;
      if (p?.kind !== "declareAttackers" || !p.candidates?.includes(id)) return;
      const cur = get().attackers;
      // Créature déjà attaquante : elle n'attaque plus.
      if (cur.includes(id)) return set({ attackers: cur.filter((a) => a !== id), aimingAttacker: null });
      const defenders = p.defenders ?? [];
      // Plusieurs cibles possibles (façon MTGA) : la créature est « en visée », on clique ensuite sa cible.
      if (defenders.length > 1) return set({ aimingAttacker: get().aimingAttacker === id ? null : id });
      const target = defenders[0];
      set({ attackers: [...cur, id], attackTargets: target ? { ...get().attackTargets, [id]: target } : get().attackTargets });
    },

    aimAttackAt(defender) {
      const aiming = get().aimingAttacker;
      if (!aiming) return get().notify("Cliquez d'abord la créature qui attaque, puis sa cible.");
      set({
        attackers: get().attackers.includes(aiming) ? get().attackers : [...get().attackers, aiming],
        attackTargets: { ...get().attackTargets, [aiming]: defender },
        aimingAttacker: null,
      });
    },

    allAttack() {
      const p = get().view?.pending;
      if (p?.kind !== "declareAttackers") return;
      // Tous attaquent le premier adversaire, sauf ceux dont la cible est déjà choisie.
      const target = p.defenders?.[0];
      const ids = p.candidates ?? [];
      set({
        attackers: [...ids],
        attackTargets: target ? Object.fromEntries(ids.map((id) => [id, get().attackTargets[id] ?? target])) : {},
      });
    },

    endTurn(hard) {
      const v = get().view;
      if (!v || refused({ type: "endTurn" })) return;
      set({ casting: null, attackers: [] });
      sendSettings({ ...get().settings, passUntilTurn: v.turn.number, passMode: hard ? "hard" : "soft" });
    },

    toggleStop(side, step) {
      const s = get().settings;
      const list = s.stops[side];
      const next = list.includes(step) ? list.filter((x) => x !== step) : [...list, step];
      sendSettings({ ...s, stops: { ...s.stops, [side]: next } });
    },

    setFullControl(on) {
      sendSettings({ ...get().settings, fullControl: on });
    },

    setHoldPriority(on) {
      sendSettings({ ...get().settings, holdPriority: on });
    },

    applySettings(partial) {
      sendSettings({ ...get().settings, ...partial });
    },

    setLang(lang) {
      set({ lang });
      try {
        localStorage.setItem(LANG_KEY, lang);
      } catch {
        // Stockage indisponible : langue de la session seulement.
      }
    },

    setHover(h) {
      set({ hover: h });
    },

    setPeek(h) {
      set(h ? { peek: h, hover: h } : { peek: null });
    },

    setDrawerOpen(open) {
      set({ drawerOpen: open });
    },

    toggleSelection(id) {
      const cur = get().selection;
      set({ selection: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] });
    },

    openGraveyard(player) {
      set({ graveyardOpen: player });
    },

    openExile(player) {
      set({ exileOpen: player });
    },
  };
});
