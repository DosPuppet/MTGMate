/**
 * État de l'interface et logique d'interaction (lancement de sorts, ciblage, attaque, blocage).
 * Le moteur reste la seule source de vérité : on n'envoie que des décisions tirées des options légales.
 */
import {
  type ActionOption,
  type AutopilotSettings,
  autoTarget,
  type CardFace,
  DEFAULT_AUTOPILOT,
  type Decision,
  type GameView,
  type ObjectView,
  type Step,
  type TargetOption,
} from "@mtgx/engine";
import { create } from "zustand";
import { describeEvents, type Lang, type LogLine } from "./i18n";
import type { FromWorker } from "./protocol";
import { LocalSession } from "./session";

type CastOption = Extract<ActionOption, { type: "cast" }>;
type ActivateOption = Extract<ActionOption, { type: "activate" }>;
export type PlayableOption = CastOption | ActivateOption;

export interface Casting {
  option: PlayableOption;
  sourceId: string;
  mode: number | null;
  x: number | null;
  kicked: boolean | null;
  targets: Record<string, string[]>;
  stage: "mode" | "x" | "kicker" | "target";
  spec: TargetOption | null;
  /** Cible désignée par glisser-déposer, utilisée pour la première cible compatible. */
  preset?: string;
}

export interface Hover {
  face: CardFace;
  obj?: ObjectView;
}

interface Store {
  screen: "lobby" | "game";
  session: LocalSession | null;
  view: GameView | null;
  faces: Record<string, CardFace>;
  log: LogLine[];
  toast: { text: string; id: number } | null;
  settings: AutopilotSettings;
  lang: Lang;
  casting: Casting | null;
  abilityMenu: { sourceId: string; options: ActionOption[] } | null;
  attackers: string[];
  blocks: Record<string, string>;
  selectedBlocker: string | null;
  selection: string[];
  hover: Hover | null;
  graveyardOpen: string | null;

  startGame(playerDeck: string, aiDeck: string): void;
  backToLobby(): void;
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
  cancel(): void;
  toggleAttacker(id: string): void;
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
    };
  }
  return { type: "activate", source: c.option.source, ability: c.option.ability, targets: c.targets, x: c.x ?? undefined };
}

let toastId = 0;

export const useGame = create<Store>((set, get) => {
  /** Avance dans les choix d'un lancement ; envoie la décision quand tout est choisi. */
  const continueCasting = (c: Casting) => {
    if (c.option.type === "cast" && c.mode === null) {
      if (c.option.modes.length > 1) return set({ casting: { ...c, stage: "mode" } });
      c.mode = c.option.modes[0]?.index ?? 0;
    }
    if (c.x === null) {
      if (c.option.xMax !== null && c.option.xMax > 0) return set({ casting: { ...c, stage: "x" } });
      c.x = c.option.xMax ?? 0;
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
      const auto = get().settings.fullControl ? null : autoTarget(spec);
      if (auto) {
        c.targets[spec.id] = [auto];
        continue;
      }
      return set({ casting: { ...c, stage: "target", spec } });
    }
    get().decide(buildDecision(c));
  };

  const sendSettings = (settings: AutopilotSettings) => {
    set({ settings });
    get().session?.send({ type: "settings", settings });
  };

  return {
    screen: "lobby",
    session: null,
    view: null,
    faces: {},
    log: [],
    toast: null,
    settings: structuredClone(DEFAULT_AUTOPILOT),
    lang: "fr",
    casting: null,
    abilityMenu: null,
    attackers: [],
    blocks: {},
    selectedBlocker: null,
    selection: [],
    hover: null,
    graveyardOpen: null,

    startGame(playerDeck, aiDeck) {
      get().session?.close();
      const session = new LocalSession((m) => get().receive(m));
      const settings = { ...get().settings, passUntilTurn: null };
      set({ screen: "game", session, view: null, log: [], casting: null, attackers: [], blocks: {}, selection: [], settings });
      session.send({ type: "start", seed: Math.floor(Math.random() * 2 ** 31), playerName: "Vous", playerDeck, aiDeck });
      session.send({ type: "settings", settings });
    },

    backToLobby() {
      get().session?.close();
      set({ screen: "lobby", session: null, view: null, casting: null, hover: null });
    },

    receive(msg) {
      if (msg.type === "error") return get().notify(msg.message);
      const { view, events, faces } = msg;
      const lines = describeEvents(events, view, faces, get().lang);
      const changed = pendingKey(get().view) !== pendingKey(view);
      set((s) => ({
        view,
        faces,
        log: [...s.log, ...lines].slice(-400),
        ...(changed ? { casting: null, abilityMenu: null, attackers: [], blocks: {}, selectedBlocker: null, selection: [] } : {}),
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
        if (casting.spec.legal.includes(id)) {
          const c = { ...casting, targets: { ...casting.targets, [casting.spec.id]: [id] } };
          return continueCasting(c);
        }
        return get().notify("Cible invalide.");
      }
      const p = view.pending;
      if (!p || p.player !== view.viewer) return;
      if (p.kind === "declareAttackers") return get().toggleAttacker(id);
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
      const { casting } = get();
      if (casting?.stage === "target" && casting.spec) {
        if (casting.spec.legal.includes(id))
          return continueCasting({ ...casting, targets: { ...casting.targets, [casting.spec.id]: [id] } });
        get().notify("Cible invalide.");
      }
    },

    beginCasting(option, sourceId, preset) {
      set({ abilityMenu: null });
      continueCasting({ option, sourceId, mode: null, x: null, kicked: null, targets: {}, stage: "mode", spec: null, preset });
    },

    chooseMode(index) {
      const c = get().casting;
      if (c) continueCasting({ ...c, mode: index });
    },

    chooseX(x) {
      const c = get().casting;
      if (c) continueCasting({ ...c, x });
    },

    chooseKicker(kicked) {
      const c = get().casting;
      if (c) continueCasting({ ...c, kicked });
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
      set({ attackers: cur.includes(id) ? cur.filter((a) => a !== id) : [...cur, id] });
    },

    allAttack() {
      const p = get().view?.pending;
      if (p?.kind === "declareAttackers") set({ attackers: [...(p.candidates ?? [])] });
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
