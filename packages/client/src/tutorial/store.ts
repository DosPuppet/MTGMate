/**
 * Tutoriel en cours : leçon et étape, progression conservée dans le navigateur (reprise au début de la leçon),
 * guidage strict des décisions et avancée des étapes au fil des mises à jour de la partie.
 */
import { create } from "zustand";
import { setDecisionGuard, setUpdateObserver, useGame } from "../store";
import { LESSONS, lessonById } from "./lessons";
import { alwaysAllowed, type Ctx, matches, type Step } from "./runtime";

const KEY = "mtgmate.tutorial";

export interface Progress {
  /** Leçons terminées. */
  done: string[];
  /** Leçon à reprendre : celle en cours, ou la suivante de la dernière terminée. */
  current: string | null;
}

function loadProgress(): Progress {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<Progress> | null;
    const done = (raw?.done ?? []).filter((id) => lessonById(id));
    const current = raw?.current && lessonById(raw.current) ? raw.current : null;
    return { done, current };
  } catch {
    return { done: [], current: null };
  }
}

function saveProgress(p: Progress): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // stockage indisponible : la progression n'est pas conservée
  }
}

interface TutorialStore {
  lessonId: string | null;
  step: number;
  /** Leçon terminée : la bulle propose la suite. */
  finished: boolean;
  /** « Tout dérouler » : la leçon suivante est proposée en premier. */
  chain: boolean;
  progress: Progress;
  /** Dernier état connu de la partie (prédicats, textes dynamiques, conseils). */
  ctx: Ctx | null;
  start(id: string, chain?: boolean): void;
  restart(): void;
  /** Bouton « Suivant » d'une explication. */
  next(): void;
  /** Leçon suivante (ou le menu du tutoriel après la dernière). */
  startNext(): void;
  quit(): void;
  resetProgress(): void;
  /** Réévalue l'étape en cours (mise à jour de la partie, survol d'une carte). */
  refresh(): void;
}

export const useTutorial = create<TutorialStore>((set, get) => {
  const lesson = () => lessonById(get().lessonId);
  const currentStep = (): Step | undefined => lesson()?.steps[get().step];
  const pause = (paused: boolean) => useGame.getState().session?.send({ type: "pause", paused });

  const updateProgress = (p: Progress) => {
    saveProgress(p);
    set({ progress: p });
  };

  const finish = () => {
    const l = lesson();
    if (!l) return;
    const i = LESSONS.indexOf(l);
    const { done } = get().progress;
    updateProgress({ done: done.includes(l.id) ? done : [...done, l.id], current: LESSONS[i + 1]?.id ?? null });
    set({ finished: true });
    // La partie peut continuer librement après la leçon.
    pause(false);
  };

  /** Termine les étapes dont la condition est remplie, jusqu'à une explication ou une étape en attente. */
  const evaluate = () => {
    for (let guard = 0; guard < 100; guard++) {
      const st = currentStep();
      const ctx = get().ctx;
      if (!st || get().finished || st.next || !ctx || !st.until?.(ctx)) return;
      advance();
    }
  };

  const enter = (i: number) => {
    set({ step: i });
    const st = currentStep();
    if (!st) return;
    if (st.settings) useGame.getState().applySettings(st.settings);
    // L'adversaire attend pendant une explication.
    pause(!!st.next);
  };

  const advance = () => {
    const l = lesson();
    if (!l) return;
    if (get().step + 1 >= l.steps.length) finish();
    else enter(get().step + 1);
  };

  return {
    lessonId: null,
    step: 0,
    finished: false,
    chain: false,
    progress: loadProgress(),
    ctx: null,

    start(id, chain = false) {
      const l = lessonById(id);
      if (!l) return;
      set({ lessonId: id, step: 0, finished: false, chain, ctx: null });
      updateProgress({ ...get().progress, current: id });
      useGame.getState().startScenario(l.scenario);
      enter(0);
    },

    restart() {
      const id = get().lessonId;
      if (id) get().start(id, get().chain);
    },

    next() {
      if (currentStep()?.next && !get().finished) {
        advance();
        evaluate();
      }
    },

    startNext() {
      const l = lesson();
      const following = l ? LESSONS[LESSONS.indexOf(l) + 1] : undefined;
      if (following) get().start(following.id, get().chain);
      else get().quit();
    },

    quit() {
      set({ lessonId: null, finished: false, ctx: null });
      useGame.getState().backToLobby();
    },

    resetProgress() {
      updateProgress({ done: [], current: null });
    },

    refresh: evaluate,
  };
});

/** Étape guidée en cours : le panneau d'un sort adverse attend le clic du joueur au lieu de passer tout seul. */
export function useTutorialHold(): boolean {
  return useTutorial((t) => {
    const st = lessonById(t.lessonId)?.steps[t.step];
    return !!st && !t.finished && !st.free;
  });
}

// Guidage strict : seules les décisions attendues par l'étape passent.
setDecisionGuard((intent, view) => {
  const t = useTutorial.getState();
  const st = lessonById(t.lessonId)?.steps[t.step];
  if (!st || t.finished || st.free || alwaysAllowed(intent)) return null;
  if (st.next) return "Lisez le message du guide, puis cliquez sur « Suivant ».";
  if (st.allow?.some((a) => matches(a, intent, view))) return null;
  return st.hint ?? "Suivez les indications du guide.";
});

setUpdateObserver((view, events) => {
  if (!useTutorial.getState().lessonId) return;
  useTutorial.setState({ ctx: { view, events, hovered: useGame.getState().hover?.face.name ?? null } });
  useTutorial.getState().refresh();
});

useGame.subscribe((s, prev) => {
  const t = useTutorial.getState();
  if (!t.lessonId) return;
  // Partie quittée (fin de partie, bouton retour) : la leçon s'arrête, la progression reste.
  if (prev.screen === "game" && s.screen !== "game") {
    useTutorial.setState({ lessonId: null, finished: false, ctx: null });
    return;
  }
  if (s.hover !== prev.hover && t.ctx) {
    const name = s.hover?.face.name ?? null;
    if (name && name !== t.ctx.hovered) {
      useTutorial.setState({ ctx: { ...t.ctx, hovered: name } });
      t.refresh();
    }
  }
});
