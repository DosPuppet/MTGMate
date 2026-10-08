/**
 * Card images: straight from Scryfall, or relayed by the Planecircle server (/scry/) when the player's network blocks
 * cards.scryfall.io (company or school proxy…).
 *
 * - `auto` (default): direct, and switches to the relay if a Scryfall image does not load;
 * - `on` / `off`: the player's choice (checkbox "Images through the Planecircle server"), remembered.
 *
 * Every image URL displayed goes through `imageUrl`.
 *
 * Custom art (`tools/custom-art.ts`): local images served on /art/ (outside Git). They replace Scryfall's only for the
 * cards of a deck that chooses the custom printing (`CUSTOM_PRINTING`: the whole The Vision precon, or any card chosen
 * in the deck builder), the tokens and the card back of a player whose deck uses some, and when the "Custom art"
 * checkbox is ticked (default; remembered). Without /art/manifest.json on the server, the checkbox does not appear.
 */
import { create } from "zustand";

export type ImageMode = "auto" | "on" | "off";

const SCRYFALL = "https://cards.scryfall.io/";
const RELAY = "/scry/";
const KEY = "mtgx.images";
/** Small known image for the detection (FDN Forest, "small" format). */
const PROBE = "small/front/8/d/8d8432a7-1c8a-4cfb-947c-ecf9791063eb.jpg";
const PROBE_TIMEOUT_MS = 4000;
const ART = "/art/";
const ART_KEY = "planecircle.customArt";

/** /art/manifest.json: English name of the card (or of the face) → prepared file. */
export interface ArtManifest {
  version: 1;
  cards: Record<string, string>;
  tokens: Record<string, string>;
  back?: string;
}

function load(): ImageMode {
  try {
    const v = localStorage.getItem(KEY);
    return v === "on" || v === "off" ? v : "auto";
  } catch {
    return "auto";
  }
}

function loadCustomOn(): boolean {
  try {
    return localStorage.getItem(ART_KEY) !== "off";
  } catch {
    return true;
  }
}

interface ImageStore {
  mode: ImageMode;
  /** `auto` mode: Scryfall does not answer, the relay is used. */
  blocked: boolean;
  setMode(mode: ImageMode): void;
  /** The server's custom art (null: none). */
  custom: ArtManifest | null;
  customOn: boolean;
  setCustomOn(on: boolean): void;
}

export const useImages = create<ImageStore>((set) => ({
  mode: load(),
  blocked: false,
  setMode(mode) {
    try {
      if (mode === "auto") localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, mode);
    } catch {
      // Storage unavailable (private browsing): the choice holds for this visit.
    }
    set({ mode });
  },
  custom: null,
  customOn: loadCustomOn(),
  setCustomOn(customOn) {
    try {
      if (customOn) localStorage.removeItem(ART_KEY);
      else localStorage.setItem(ART_KEY, "off");
    } catch {
      // Storage unavailable: the choice holds for this visit.
    }
    set({ customOn });
  },
}));

/** Is the relay in use right now? */
export const relayActive = (s: Pick<ImageStore, "mode" | "blocked"> = useImages.getState()): boolean =>
  s.mode === "on" || (s.mode === "auto" && s.blocked);

/** URL to display for a Scryfall image (relayed if needed). */
export function imageUrl(url: string): string;
export function imageUrl(url: string | undefined): string | undefined;
export function imageUrl(url: string | undefined): string | undefined {
  if (!url?.startsWith(SCRYFALL) || !relayActive()) return url;
  return RELAY + url.slice(SCRYFALL.length);
}

/** Custom art of a card (by its English name, or that of its first face) or of a token. */
export function customImage(name: string, token = false): string | undefined {
  const { custom, customOn } = useImages.getState();
  if (!custom || !customOn) return undefined;
  const file = token ? custom.tokens[name] : (custom.cards[name] ?? custom.cards[name.split(" // ")[0] ?? ""]);
  return file ? ART + file : undefined;
}

/** Does the server have custom art for this card (checkbox ticked or not)? */
export function hasCustomArt(custom: ArtManifest | null, name: string): boolean {
  return !!custom && !!(custom.cards[name] ?? custom.cards[name.split(" // ")[0] ?? ""]);
}

/** Components: re-render when the relay turns on or off, or when the custom art changes. */
export const useRelayActive = (): boolean => {
  useImages((s) => s.customOn && s.custom);
  return useImages(relayActive);
};

/** Loads /art/manifest.json if it exists (at start-up), and applies the custom card back. */
export async function loadCustomArt(): Promise<void> {
  try {
    const res = await fetch(`${ART}manifest.json`, { cache: "no-cache" });
    if (!res.ok || !res.headers.get("content-type")?.includes("json")) return;
    const custom = (await res.json()) as ArtManifest;
    if (custom?.version !== 1 || typeof custom.cards !== "object") return;
    useImages.setState({ custom: { ...custom, tokens: custom.tokens ?? {} } });
  } catch {
    // No custom art (or offline).
  }
}

/** Custom card back (if there is one and the checkbox is ticked): for a player whose deck uses some. */
export function useCustomBack(): string | undefined {
  return useImages((s) => (s.customOn && s.custom?.back ? ART + s.custom.back : undefined));
}

function loads(src: string): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    const timer = setTimeout(() => resolve(false), PROBE_TIMEOUT_MS);
    img.onload = () => {
      clearTimeout(timer);
      resolve(img.naturalWidth > 0);
    };
    img.onerror = () => {
      clearTimeout(timer);
      resolve(false);
    };
    img.src = src;
  });
}

let checking: Promise<void> | null = null;
/**
 * `auto` mode: can Scryfall be reached? Otherwise, the relay is used, provided it answers
 * (offline, no point switching). Called at start-up, and when a direct image fails.
 */
export function detectBlockedScryfall(): Promise<void> {
  if (useImages.getState().mode !== "auto" || useImages.getState().blocked) return Promise.resolve();
  checking ??= (async () => {
    if (await loads(`${SCRYFALL}${PROBE}?probe=${Date.now()}`)) return;
    if (await loads(`${RELAY}${PROBE}`)) useImages.setState({ blocked: true });
  })().finally(() => {
    checking = null;
  });
  return checking;
}
