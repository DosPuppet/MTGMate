/**
 * Tutorial in progress: lesson and step, progress kept in the browser (resumed at the start of the lesson),
 * strict guidance of decisions and steps advancing as the game updates.
 */
import { create } from "zustand";
import { setDecisionGuard, setUpdateObserver, useGame } from "../store";
import { t, textIn, textLang } from "../translate";
import { LESSONS, lessonById } from "./lessons";
import { alwaysAllowed, type Ctx, matches, type Step } from "./runtime";

const KEY = "planecircle.tutorial";

export interface Progress {
  /** Completed lessons. */
  done: string[];
  /** Lesson to resume: the one in progress, or the one after the last completed. */
  current: string | null;
}

/** Lesson ids before PLAN-I (French), in progress saved by earlier versions. */
const LEGACY_IDS: Record<string, string> = {
  ecran: "screen",
  attaque: "attack",
  blocage: "block",
  sorts: "spells",
  pile: "stack",
  capacites: "abilities",
  partie: "game",
};

function loadProgress(): Progress {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<Progress> | null;
    const id = (x: string) => LEGACY_IDS[x] ?? x;
    const done = (raw?.done ?? []).map(id).filter((x) => lessonById(x));
    const current = raw?.current && lessonById(id(raw.current)) ? id(raw.current) : null;
    return { done, current };
  } catch {
    return { done: [], current: null };
  }
}

function saveProgress(p: Progress): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // storage unavailable: progress is not kept
  }
}

interface TutorialStore {
  lessonId: string | null;
  step: number;
  /** Lesson complete: the bubble offers what comes next. */
  finished: boolean;
  /** "Play all lessons": the next lesson is offered first. */
  chain: boolean;
  progress: Progress;
  /** Last known state of the game (predicates, dynamic texts, tips). */
  ctx: Ctx | null;
  start(id: string, chain?: boolean): void;
  restart(): void;
  /** "Next" button of an explanation. */
  next(): void;
  /** Next lesson (or the tutorial menu after the last one). */
  startNext(): void;
  quit(): void;
  resetProgress(): void;
  /** Re-evaluates the current step (game update, card hover). */
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
    // The game can go on freely after the lesson.
    pause(false);
  };

  /** Completes the steps whose condition is met, up to an explanation or a waiting step. */
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
    // The opponent waits during an explanation.
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

/** Guided step in progress: the panel of an opponent's spell waits for the player's click instead of passing by itself. */
export function useTutorialHold(): boolean {
  return useTutorial((t) => {
    const st = lessonById(t.lessonId)?.steps[t.step];
    return !!st && !t.finished && !st.free;
  });
}

// Strict guidance: only the decisions the step expects go through. The reminder is returned in the interface language.
setDecisionGuard((intent, view) => {
  const tuto = useTutorial.getState();
  const st = lessonById(tuto.lessonId)?.steps[tuto.step];
  if (!st || tuto.finished || st.free || alwaysAllowed(intent)) return null;
  if (st.next) return t('Read the guide\'s message, then click "Next".');
  if (st.allow?.some((a) => matches(a, intent, view))) return null;
  return st.hint ? textIn(textLang(), st.hint) : t("Follow the guide's instructions.");
});

setUpdateObserver((view, events) => {
  if (!useTutorial.getState().lessonId) return;
  useTutorial.setState({ ctx: { view, events, hovered: useGame.getState().hover?.face.name ?? null } });
  useTutorial.getState().refresh();
});

useGame.subscribe((s, prev) => {
  const t = useTutorial.getState();
  if (!t.lessonId) return;
  // Game left (game over, back button): the lesson stops, the progress stays.
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
