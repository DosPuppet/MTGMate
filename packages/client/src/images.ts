/**
 * Images des cartes : directement depuis Scryfall, ou relayées par le serveur Planecircle (/scry/) quand le réseau
 * du joueur bloque cards.scryfall.io (proxy d'entreprise, d'école…).
 *
 * - `auto` (par défaut) : direct, et bascule sur le relais si une image de Scryfall ne charge pas ;
 * - `on` / `off` : choix du joueur (case « Images par le serveur Planecircle »), mémorisé.
 *
 * Toute URL d'image affichée passe par `imageUrl`.
 */
import { create } from "zustand";

export type ImageMode = "auto" | "on" | "off";

const SCRYFALL = "https://cards.scryfall.io/";
const RELAY = "/scry/";
const KEY = "mtgx.images";
/** Petite image connue pour la détection (Forêt de FDN, format « small »). */
const PROBE = "small/front/8/d/8d8432a7-1c8a-4cfb-947c-ecf9791063eb.jpg";
const PROBE_TIMEOUT_MS = 4000;

function load(): ImageMode {
  try {
    const v = localStorage.getItem(KEY);
    return v === "on" || v === "off" ? v : "auto";
  } catch {
    return "auto";
  }
}

interface ImageStore {
  mode: ImageMode;
  /** Mode `auto` : Scryfall ne répond pas, le relais est utilisé. */
  blocked: boolean;
  setMode(mode: ImageMode): void;
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

/** Composants : se redessiner quand le relais s'active ou se coupe. */
export const useRelayActive = (): boolean => useImages(relayActive);

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
