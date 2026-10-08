/**
 * Board textures (playmats), chosen by the player and kept in `localStorage`. The rendering is entirely in CSS
 * (`styles.css`, `.board[data-board=…]`): gradients and SVG noise, no image to download. The ids are stored values and
 * CSS selectors (French words, kept); the labels are translated at display (`textIn`).
 */
import { msg } from "@mtgx/engine";

export type BoardTheme = "nuit" | "feutre" | "bois" | "ardoise" | "cuir" | "arcane" | "ocean";
/** The player's choice: a texture, or a random texture for each game. */
export type BoardThemeChoice = BoardTheme | "hasard";

export const BOARD_THEMES: { id: BoardTheme; label: string }[] = [
  { id: "nuit", label: msg("Night") },
  { id: "feutre", label: msg("Felt") },
  { id: "bois", label: msg("Wood") },
  { id: "ardoise", label: msg("Slate") },
  { id: "cuir", label: msg("Leather") },
  { id: "arcane", label: msg("Arcane") },
  { id: "ocean", label: msg("Ocean") },
];

const KEY = "planecircle.board";

export function loadBoardTheme(): BoardThemeChoice {
  try {
    const v = localStorage.getItem(KEY);
    return v === "hasard" || BOARD_THEMES.some((t) => t.id === v) ? (v as BoardThemeChoice) : "nuit";
  } catch {
    return "nuit";
  }
}

export function saveBoardTheme(choice: BoardThemeChoice): void {
  try {
    localStorage.setItem(KEY, choice);
  } catch {
    // storage unavailable: setting not kept
  }
}

/** The texture displayed: the chosen one, or, for "random", a texture drawn from `roll` (a number in [0, 1)). */
export function resolveBoardTheme(choice: BoardThemeChoice, roll: number): BoardTheme {
  if (choice !== "hasard") return choice;
  const i = Math.min(BOARD_THEMES.length - 1, Math.floor(roll * BOARD_THEMES.length));
  return (BOARD_THEMES[i] as { id: BoardTheme }).id;
}
