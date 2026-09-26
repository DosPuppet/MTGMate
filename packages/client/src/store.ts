/**
 * État de l'interface et logique d'interaction (lancement de sorts, ciblage, attaque, blocage).
 * Le moteur reste la seule source de vérité : on n'envoie que des décisions tirées des options légales.
 */

import type { DeckEntries } from "@mtgx/cards";
import {
  type ActionOption,
  type AutopilotSettings,
  autoTarget,
  type CardFace,
  DEFAULT_AUTOPILOT,
  type Decision,
  type GameEvent,
  type GameView,
  type ObjectView,
  type Step,
  type TargetOption,
} from "@mtgx/engine";
import type { Clock, RoomInfo, Seat, ServerMessage } from "@mtgx/server/protocol";
import { create } from "zustand";
import { soundsFor } from "./audio/eventSounds";
import { playSound, preloadSounds } from "./audio/sfx";
import { findObjectEl } from "./board/layout";
import { describeEvents, type Lang, type LogLine } from "./i18n";
import type { FromWorker, Sandbox } from "./protocol";
import { LocalSession, RemoteSession, type Session } from "./session";

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
  /** Façon de payer le sort : coût normal, sans payer (Omniscience, Etali), coût alternatif. */
  payMode: "normal" | "free" | "alt" | null;
  targets: Record<string, string[]>;
  stage: "mode" | "pay" | "x" | "kicker" | "target" | "discard" | "sacrifice";
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
export interface OnlineState {
  status: "connecting" | RoomInfo["status"];
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
  screen: "lobby" | "decks" | "game" | "online";
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
  abilityMenu: { sourceId: string; options: ActionOption[] } | null;
  attackers: string[];
  /** Défenseur choisi pour chaque attaquant (multijoueur). */
  attackTargets: Record<string, string>;
  /** Défenseur appliqué aux prochaines créatures sélectionnées. */
  attackTarget: string | null;
  blocks: Record<string, string>;
  selectedBlocker: string | null;
  selection: string[];
  hover: Hover | null;
  graveyardOpen: string | null;
  fx: Fx[];
  turnBanner: { id: number; text: string; mine: boolean } | null;
  spotlight: { id: number; face: CardFace; who: string } | null;

  startGame(playerDeck: DeckEntries, aiDecks: DeckEntries[], sandbox?: Sandbox): void;
  openOnline(): void;
  createRoom(name: string, deck: DeckEntries): void;
  joinRoom(code: string, name: string, deck: DeckEntries): void;
  /** Reprend la partie en ligne de cet onglet (jeton de reconnexion), au chargement ou après une coupure. */
  resumeOnline(): void;
  leaveRoom(): void;
  rematch(): void;
  receiveOnline(msg: ServerMessage): void;
  backToLobby(): void;
  openDeckBuilder(deckId?: string | null): void;
  receive(msg: FromWorker): void;
  decide(d: Decision): void;
  notify(text: string): void;
  clickHandCard(id: string): void;
  dropHandCard(id: string, targetId: string | null): void;
  clickPermanent(id: string): void;
  clickPlayer(id: string): void;
  beginCasting(option: PlayableOption, sourceId: string, preset?: string): void;
  chooseMode(index: number): void;
  chooseX(x: number): void;
  chooseKicker(kicked: boolean): void;
  chooseNoTarget(): void;
  choosePayMode(mode: "normal" | "free" | "alt"): void;
  /** Désigne une cible (ou la retire, pour un mot « cible » qui en accepte plusieurs). */
  pickTarget(id: string): void;
  /** Valide les cibles déjà désignées (« jusqu'à N »). */
  confirmTargets(): void;
  chooseAdditional(kind: "discard" | "sacrifice", ids: string[]): void;
  cancel(): void;
  toggleAttacker(id: string): void;
  setAttackTarget(player: string): void;
  allAttack(): void;
  endTurn(): void;
  toggleStop(side: "own" | "opponent", step: Step): void;
  setFullControl(on: boolean): void;
  setLang(lang: Lang): void;
  setHover(h: Hover | null): void;
  toggleSelection(id: string): void;
  openGraveyard(player: string | null): void;
}

export function myActions(view: GameView | null): ActionOption[] {
  const p = view?.pending;
  return p?.kind === "priority" && p.player === view?.viewer ? (p.actions ?? []) : [];
}

function pendingKey(v: GameView | null): string {
  const p = v?.pending;
  if (!v || !p) return "none";
  return `${p.kind}:${p.player}:${v.turn.number}:${v.turn.step}:${v.stack.length}`;
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
      mode: c.mode ?? 0,
      targets: c.targets,
      x: c.x ?? undefined,
      kicked: c.kicked ?? false,
      discard: c.discard ?? undefined,
      sacrifice: c.sacrifice ?? undefined,
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
    sacrifice: c.sacrifice ?? undefined,
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
      banner = { id: ++fxId, mine, text: mine ? "À vous de jouer" : `Tour de ${view.players[e.player]?.name ?? "l'adversaire"}` };
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

export const useGame = create<Store>((set, get) => {
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
    for (const spec of targetSpecs(c)) {
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
    get().decide(buildDecision(c));
  };

  const sendSettings = (settings: AutopilotSettings) => {
    set({ settings });
    get().session?.send({ type: "settings", settings });
  };

  return {
    screen: "lobby",
    editingDeck: null,
    session: null,
    online: null,
    view: null,
    faces: {},
    log: [],
    toast: null,
    settings: structuredClone(DEFAULT_AUTOPILOT),
    lang: "fr",
    casting: null,
    abilityMenu: null,
    attackers: [],
    attackTargets: {},
    attackTarget: null,
    blocks: {},
    selectedBlocker: null,
    selection: [],
    hover: null,
    graveyardOpen: null,
    fx: [],
    turnBanner: null,
    spotlight: null,

    startGame(playerDeck, aiDecks, sandbox) {
      get().session?.close();
      set({ online: null });
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
        sandbox,
      });
      session.send({ type: "settings", settings });
    },

    openOnline() {
      set({ screen: "online" });
    },

    createRoom(name, deck) {
      connectRemote().raw({ type: "create", name, deck });
      saveName(name);
    },

    joinRoom(code, name, deck) {
      connectRemote().raw({ type: "join", code, name, deck });
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
      set({ online: null, session: null, screen: "lobby", view: null, casting: null, hover: null });
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

    backToLobby() {
      if (get().online) return get().leaveRoom();
      get().session?.close();
      set({ screen: "lobby", session: null, view: null, casting: null, hover: null });
    },

    receive(msg) {
      if (msg.type === "error") {
        playSound("error");
        return get().notify(msg.message);
      }
      const { view, events, faces } = msg;
      const lines = describeEvents(events, view, faces, get().lang, get().view);
      for (const cue of soundsFor(events, view, get().view, faces)) playSound(cue.key, cue);
      playEffects(view, events, faces);
      const changed = pendingKey(get().view) !== pendingKey(view);
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
              blocks: {},
              selectedBlocker: null,
              selection: [],
            }
          : {}),
      }));
    },

    decide(d) {
      get().session?.send({ type: "decision", decision: d });
      set({ casting: null, abilityMenu: null, selectedBlocker: null });
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
      const land = acts.find((a) => a.type === "playLand" && a.card === id);
      if (land) return get().decide({ type: "playLand", card: id });
      const cast = acts.find((a): a is CastOption => a.type === "cast" && a.card === id);
      // Capacités activées depuis la main (cycle, « défaussez cette carte : … »).
      const fromHand = acts.filter((a): a is ActivateOption => a.type === "activate" && a.source === id);
      if (fromHand.length && (cast || fromHand.length > 1))
        return set({ abilityMenu: { sourceId: id, options: [...(cast ? [cast] : []), ...fromHand] } });
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
      const p = view.pending;
      if (!p || p.player !== view.viewer) return;
      if (p.kind === "declareAttackers") {
        // Clic sur un planeswalker adverse : il devient la cible des prochains attaquants.
        if (p.defenders?.includes(id)) return set({ attackTarget: id });
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
        const acts = myActions(view);
        const activations = acts.filter((a): a is ActivateOption => a.type === "activate" && a.source === id);
        const mana = acts.filter((a) => a.type === "tapForMana" && a.source === id);
        if (activations.length + mana.length > 1)
          return set({ abilityMenu: { sourceId: id, options: [...activations, ...mana] } });
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
        return set({ attackTarget: id });
      }
      if (casting?.stage === "target" && casting.spec) {
        if (casting.spec.legal.includes(id)) return get().pickTarget(id);
        get().notify("Cible invalide.");
      }
    },

    beginCasting(option, sourceId, preset) {
      set({ abilityMenu: null });
      continueCasting({
        option,
        sourceId,
        mode: null,
        x: null,
        kicked: null,
        discard: null,
        sacrifice: null,
        payMode: null,
        targets: {},
        stage: "mode",
        spec: null,
        preset,
      });
    },

    chooseMode(index) {
      const c = get().casting;
      if (c) continueCasting({ ...c, mode: index });
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
      set({ casting: null, abilityMenu: null, selectedBlocker: null });
    },

    toggleAttacker(id) {
      const p = get().view?.pending;
      if (p?.kind !== "declareAttackers" || !p.candidates?.includes(id)) return;
      const cur = get().attackers;
      if (cur.includes(id)) return set({ attackers: cur.filter((a) => a !== id) });
      const target = get().attackTarget ?? p.defenders?.[0];
      set({ attackers: [...cur, id], attackTargets: target ? { ...get().attackTargets, [id]: target } : get().attackTargets });
    },

    setAttackTarget(player) {
      set({ attackTarget: player });
    },

    allAttack() {
      const p = get().view?.pending;
      if (p?.kind !== "declareAttackers") return;
      const target = get().attackTarget ?? p.defenders?.[0];
      const ids = p.candidates ?? [];
      set({
        attackers: [...ids],
        attackTargets: target ? Object.fromEntries(ids.map((id) => [id, get().attackTargets[id] ?? target])) : {},
      });
    },

    endTurn() {
      const v = get().view;
      if (!v) return;
      set({ casting: null, attackers: [] });
      sendSettings({ ...get().settings, passUntilTurn: v.turn.number });
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

    setLang(lang) {
      set({ lang });
    },

    setHover(h) {
      set({ hover: h });
    },

    toggleSelection(id) {
      const cur = get().selection;
      set({ selection: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] });
    },

    openGraveyard(player) {
      set({ graveyardOpen: player });
    },
  };
});
