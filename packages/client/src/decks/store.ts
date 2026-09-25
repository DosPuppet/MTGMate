/**
 * Decks de l'utilisateur, conservés dans le navigateur (localStorage), plus les decks préconstruits.
 */
import { CARDS, DECKS, type DeckList, deckColors } from "@mtgx/cards";
import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";

/** Stockage tolérant : navigation privée ou stockage bloqué ne doivent rien casser. */
const safeStorage: StateStorage = {
  getItem: (k) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  setItem: (k, v) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* stockage indisponible : les decks restent en mémoire pour la session */
    }
  },
  removeItem: (k) => {
    try {
      localStorage.removeItem(k);
    } catch {
      /* idem */
    }
  },
};

interface DeckStore {
  decks: DeckList[];
  save(deck: DeckList): void;
  remove(id: string): void;
  /** Crée une copie modifiable (d'un deck préconstruit ou non) ; renvoie son identifiant. */
  duplicate(deck: DeckList, name?: string): string;
  create(name?: string): string;
}

const newId = () => `deck-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;

export const useDecks = create<DeckStore>()(
  persist(
    (set, get) => ({
      decks: [],
      save(deck) {
        const d = { ...deck, builtin: false, colors: deckColors(deck.main, CARDS) };
        const others = get().decks.filter((x) => x.id !== d.id);
        set({ decks: [...others, d].sort((a, b) => a.name.localeCompare(b.name)) });
      },
      remove(id) {
        set({ decks: get().decks.filter((d) => d.id !== id) });
      },
      duplicate(deck, name) {
        const id = newId();
        get().save({ ...deck, id, name: name ?? `${deck.name} (copie)`, builtin: false, cover: undefined });
        return id;
      },
      create(name = "Nouveau deck") {
        const id = newId();
        get().save({ id, name, colors: [], main: [], sideboard: [] });
        return id;
      },
    }),
    { name: "mtgmate.decks", version: 1, storage: createJSONStorage(() => safeStorage) },
  ),
);

/** Decks préconstruits puis decks de l'utilisateur. */
export function useAllDecks(): DeckList[] {
  const mine = useDecks((s) => s.decks);
  return [...DECKS, ...mine];
}

/** Illustration d'un deck : sa couverture, sinon la carte non-terrain la plus présente. */
export function deckCover(deck: DeckList): string | undefined {
  if (deck.cover) return deck.cover;
  const best = [...deck.main].filter(([, name]) => !CARDS[name]?.types.includes("Land")).sort((a, b) => b[0] - a[0])[0];
  return best ? CARDS[best[1]]?.artCrop : undefined;
}
