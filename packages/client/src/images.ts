/**
 * Images des cartes : directement depuis Scryfall, ou relayées par le serveur Planecircle (/scry/) quand le réseau
 * du joueur bloque cards.scryfall.io (proxy d'entreprise, d'école…).
 *
 * - `auto` (par défaut) : direct, et bascule sur le relais si une image de Scryfall ne charge pas ;
 * - `on` / `off` : choix du joueur (case « Images par le serveur Planecircle »), mémorisé.
 *
 * Toute URL d'image affichée passe par `imageUrl`.
 *
 * Illustrations personnelles (`tools/custom-art.ts`) : images locales servies sur /art/ (hors de Git). Elles ne remplacent
 * celles de Scryfall que pour les cartes d'un deck qui choisit l'impression personnelle (`CUSTOM_PRINTING` : tout le
 * préconstruit The Vision, ou une carte au choix dans l'éditeur de deck), les jetons et le dos des cartes d'un joueur dont
 * le deck en utilise, et quand la case « Illustrations personnelles » est cochée (par défaut ; mémorisé). Sans
 * /art/manifest.json sur le serveur, la case n'apparaît pas.
 */
import { create } from "zustand";

export type ImageMode = "auto" | "on" | "off";

const SCRYFALL = "https://cards.scryfall.io/";
const RELAY = "/scry/";
const KEY = "mtgx.images";
/** Petite image connue pour la détection (Forêt de FDN, format « small »). */
const PROBE = "small/front/8/d/8d8432a7-1c8a-4cfb-947c-ecf9791063eb.jpg";
const PROBE_TIMEOUT_MS = 4000;
const ART = "/art/";
const ART_KEY = "planecircle.customArt";

/** /art/manifest.json : nom anglais de la carte (ou de la face) → fichier préparé. */
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
  /** Mode `auto` : Scryfall ne répond pas, le relais est utilisé. */
  blocked: boolean;
  setMode(mode: ImageMode): void;
  /** Illustrations personnelles du serveur (null : aucune). */
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
      // Stockage indisponible (navigation privée) : le choix vaut pour cette visite.
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
      // Stockage indisponible : le choix vaut pour cette visite.
    }
    set({ customOn });
  },
}));

/** Le relais est-il utilisé en ce moment ? */
export const relayActive = (s: Pick<ImageStore, "mode" | "blocked"> = useImages.getState()): boolean =>
  s.mode === "on" || (s.mode === "auto" && s.blocked);

/** URL à afficher pour une image de Scryfall (relayée si besoin). */
export function imageUrl(url: string): string;
export function imageUrl(url: string | undefined): string | undefined;
export function imageUrl(url: string | undefined): string | undefined {
  if (!url?.startsWith(SCRYFALL) || !relayActive()) return url;
  return RELAY + url.slice(SCRYFALL.length);
}

/** Illustration personnelle d'une carte (par son nom anglais, ou celui de sa première face) ou d'un jeton. */
export function customImage(name: string, token = false): string | undefined {
  const { custom, customOn } = useImages.getState();
  if (!custom || !customOn) return undefined;
  const file = token ? custom.tokens[name] : (custom.cards[name] ?? custom.cards[name.split(" // ")[0] ?? ""]);
  return file ? ART + file : undefined;
}

/** Le serveur a-t-il une illustration personnelle pour cette carte (case cochée ou non) ? */
export function hasCustomArt(custom: ArtManifest | null, name: string): boolean {
  return !!custom && !!(custom.cards[name] ?? custom.cards[name.split(" // ")[0] ?? ""]);
}

/** Composants : se redessiner quand le relais s'active ou se coupe, ou que les illustrations personnelles changent. */
export const useRelayActive = (): boolean => {
  useImages((s) => s.customOn && s.custom);
  return useImages(relayActive);
};

/** Charge /art/manifest.json s'il existe (au démarrage), et applique le dos des cartes personnel. */
export async function loadCustomArt(): Promise<void> {
  try {
    const res = await fetch(`${ART}manifest.json`, { cache: "no-cache" });
    if (!res.ok || !res.headers.get("content-type")?.includes("json")) return;
    const custom = (await res.json()) as ArtManifest;
    if (custom?.version !== 1 || typeof custom.cards !== "object") return;
    useImages.setState({ custom: { ...custom, tokens: custom.tokens ?? {} } });
  } catch {
    // Pas d'illustrations personnelles (ou hors ligne).
  }
}

/** Dos personnel des cartes (s'il y en a un et que la case est cochée) : pour un joueur dont le deck en utilise. */
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
 * Mode `auto` : Scryfall est-il joignable ? Sinon, on passe par le relais, à condition qu'il réponde
 * (hors ligne, inutile de basculer). Appelé au démarrage, et quand une image directe échoue.
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
