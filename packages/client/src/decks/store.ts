/**
 * The user's decks, kept in the browser (localStorage), plus the precon decks.
 */
import { CARDS, DECKS, type DeckList, deckColors } from "@mtgx/cards";
import { type CardDef, type CardFace, CUSTOM_PRINTING, colorIdentity, keyedPrinting } from "@mtgx/engine";
import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import { customImage, imageUrl } from "../images";
import { type Lang, t, textLang } from "../translate";

/** Tolerant storage: private browsing or blocked storage must not break anything. */
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
      /* storage unavailable: the decks stay in memory for the session */
    }
  },
  removeItem: (k) => {
    try {
      localStorage.removeItem(k);
    } catch {
      /* same */
    }
  },
};

interface DeckStore {
  decks: DeckList[];
  save(deck: DeckList): void;
  remove(id: string): void;
  /** Creates an editable copy (of a precon deck or not); returns its id. */
  duplicate(deck: DeckList, name?: string): string;
  create(name?: string): string;
}

const newId = () => `deck-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;

export const useDecks = create<DeckStore>()(
  persist(
    (set, get) => ({
      decks: [],
      save(deck) {
        // Commander deck (PLAN-E): its colors are its commander's identity.
        const commander = deck.format === "commander" && deck.commander?.length;
        const identity = new Set((deck.commander ?? []).flatMap(([, n]) => (CARDS[n] ? colorIdentity(CARDS[n]) : [])));
        const colors = commander
          ? ["W", "U", "B", "R", "G"].filter((c) => identity.has(c as never))
          : deckColors(deck.main, CARDS);
        const d = { ...deck, builtin: false, colors };
        const others = get().decks.filter((x) => x.id !== d.id);
        set({ decks: [...others, d].sort((a, b) => a.name.localeCompare(b.name)) });
      },
      remove(id) {
        set({ decks: get().decks.filter((d) => d.id !== id) });
      },
      duplicate(deck, name) {
        const id = newId();
        get().save({
          ...deck,
          id,
          name: name ?? t("{name} (copy)", { name: deckName(deck, textLang()) }),
          builtin: false,
          cover: undefined,
        });
        return id;
      },
      create(name = t("New deck")) {
        const id = newId();
        get().save({ id, name, colors: [], main: [], sideboard: [] });
        return id;
      },
    }),
    { name: "planecircle.decks", version: 1, storage: createJSONStorage(() => safeStorage) },
  ),
);

/** A deck's name in a language: precons carry their French name in `fr` (PLAN-I); user decks have one name. */
export function deckName(deck: DeckList, lang: Lang): string {
  return (lang === "fr" && deck.fr?.name) || deck.name;
}

/** A deck's description in a language (see `deckName`). */
export function deckDescription(deck: DeckList, lang: Lang): string | undefined {
  return (lang === "fr" && deck.fr?.description) || deck.description;
}

/** Precon decks, then the user's decks. */
export function useAllDecks(): DeckList[] {
  const mine = useDecks((s) => s.decks);
  return [...DECKS, ...mine];
}

/**
 * A deck's art: its commander's custom art if it takes the custom printing (images.ts); otherwise its cover, otherwise
 * the most frequent nonland card (in the chosen printing).
 */
export function deckCover(deck: DeckList): string | undefined {
  const cmd = deck.commander?.[0];
  const custom = cmd?.[2] === CUSTOM_PRINTING ? customImage(cmd[1]) : undefined;
  if (custom) return custom;
  if (deck.cover) return imageUrl(deck.cover);
  // Commander deck: its commander's art.
  if (cmd && CARDS[cmd[1]]) return imageUrl(CARDS[cmd[1]]?.artCrop);
  const best = [...deck.main].filter(([, name]) => !CARDS[name]?.types.includes("Land")).sort((a, b) => b[0] - a[0])[0];
  const c = best ? CARDS[best[1]] : undefined;
  const key = best?.[2];
  return imageUrl((key && (c?.printings?.find((p) => p.key === key) ?? keyedPrinting(key))?.artCrop) || c?.artCrop);
}

/** A card's face in the printing chosen by the deck (reprint, PLAN-G, or printing of the table). */
export function printedFace(face: CardFace, c: CardDef, key: string | undefined): CardFace {
  if (key === CUSTOM_PRINTING) return { ...face, customArt: true };
  const p = key ? (c.printings?.find((x) => x.key === key) ?? keyedPrinting(key)) : undefined;
  if (!p?.image) return face;
  return { ...face, image: p.image, ...(face.fr ? { fr: { ...face.fr, image: p.frImage ?? p.image } } : {}) };
}
