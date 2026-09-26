/**
 * Effets sonores (Web Audio) : tampons décodés et mis en cache, variantes tirées au hasard,
 * légère variation de hauteur, garde-fous contre la cacophonie.
 * Le son ne doit jamais casser une partie : toute erreur (fichier, décodage, contexte refusé) est ignorée.
 */
import { create } from "zustand";
import { SOUND_FILES, SOUNDS, type SoundKey } from "./sounds";

const BASE = `${import.meta.env.BASE_URL}sounds/`;
/** Écart minimal entre deux lectures du même son. */
const MIN_GAP_MS = 60;
const MAX_VOICES = 8;
const STORAGE_KEY = "mtgmate.audio";

// ---------------------------------------------------------------------------
// Réglages (préférence propre à ce navigateur)
// ---------------------------------------------------------------------------

interface AudioSettings {
  volume: number;
  muted: boolean;
}

function loadSettings(): AudioSettings {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as Partial<AudioSettings> | null;
    return {
      volume: typeof raw?.volume === "number" ? Math.min(1, Math.max(0, raw.volume)) : 0.7,
      muted: raw?.muted === true,
    };
  } catch {
    return { volume: 0.7, muted: false };
  }
}

export const useAudio = create<AudioSettings & { setVolume(v: number): void; toggleMute(): void }>((set, get) => {
  const save = () => {
    try {
      const { volume, muted } = get();
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ volume, muted }));
    } catch {
      // stockage indisponible (navigation privée…) : réglage non conservé
    }
  };
  return {
    ...loadSettings(),
    setVolume(volume) {
      set({ volume, muted: volume === 0 ? get().muted : false });
      save();
    },
    toggleMute() {
      set({ muted: !get().muted });
      save();
    },
  };
});

// ---------------------------------------------------------------------------
// Lecture
// ---------------------------------------------------------------------------

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
const buffers = new Map<string, Promise<AudioBuffer | null>>();
const lastPlayed = new Map<SoundKey, number>();
let voices = 0;

/** Journal des sons joués (mode dev) : vérifié par les tests Playwright. */
const devLog: string[] | null = import.meta.env.DEV ? [] : null;
if (devLog) (window as unknown as { __sfxLog: string[] }).__sfxLog = devLog;

function context(): AudioContext | null {
  if (ctx) return ctx;
  try {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.connect(ctx.destination);
    applyVolume();
  } catch {
    ctx = null;
  }
  return ctx;
}

function applyVolume(): void {
  const { volume, muted } = useAudio.getState();
  if (master) master.gain.value = muted ? 0 : volume;
}
useAudio.subscribe(applyVolume);

function load(file: string): Promise<AudioBuffer | null> {
  let p = buffers.get(file);
  if (!p) {
    const c = context();
    p = c
      ? fetch(BASE + file)
          .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`${r.status}`))))
          .then((data) => c.decodeAudioData(data))
          .catch(() => null)
      : Promise.resolve(null);
    buffers.set(file, p);
  }
  return p;
}

/**
 * Les navigateurs bloquent le son tant que l'utilisateur n'a pas interagi avec la page :
 * on reprend le contexte au premier geste (appelé par les écouteurs de main.tsx).
 */
export function unlockAudio(): void {
  const c = context();
  if (c?.state === "suspended") c.resume().catch(() => {});
}

/** Charge tous les sons à l'avance (début de partie), pour qu'ils partent sans latence. */
export function preloadSounds(): void {
  for (const f of SOUND_FILES) void load(f);
}

export function playSound(key: SoundKey, opts: { delay?: number; gain?: number } = {}): void {
  const { muted, volume } = useAudio.getState();
  if (muted || volume === 0) return;
  const c = context();
  if (!c) return;
  const now = performance.now() + (opts.delay ?? 0) * 1000;
  if (now - (lastPlayed.get(key) ?? Number.NEGATIVE_INFINITY) < MIN_GAP_MS) return;
  lastPlayed.set(key, now);
  const def = SOUNDS[key];
  const file = def.files[Math.floor(Math.random() * def.files.length)] as string;
  devLog?.push(key);
  void load(file).then((buffer) => {
    if (!buffer || !master || voices >= MAX_VOICES) return;
    try {
      const src = c.createBufferSource();
      src.buffer = buffer;
      if (!("steady" in def && def.steady)) src.playbackRate.value = 0.95 + Math.random() * 0.1;
      const gain = c.createGain();
      gain.gain.value = Math.min(1, def.volume * (opts.gain ?? 1));
      src.connect(gain).connect(master);
      voices += 1;
      src.onended = () => {
        voices -= 1;
      };
      src.start(c.currentTime + Math.max(0, (now - performance.now()) / 1000));
    } catch {
      // lecture impossible : on continue sans son
    }
  });
  if ("layer" in def && def.layer) playSound(def.layer as SoundKey, opts);
}
