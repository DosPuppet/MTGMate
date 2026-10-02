/**
 * Textures du plateau (tapis de jeu), au choix du joueur et retenues dans `localStorage`. Le rendu est entièrement en CSS
 * (`styles.css`, `.board[data-board=…]`) : dégradés et bruit SVG, sans image à télécharger.
 */

export type BoardTheme = "nuit" | "feutre" | "bois" | "ardoise" | "cuir" | "arcane" | "ocean";
/** Choix du joueur : une texture, ou une texture au hasard à chaque partie. */
export type BoardThemeChoice = BoardTheme | "hasard";

export const BOARD_THEMES: { id: BoardTheme; label: string }[] = [
  { id: "nuit", label: "Nuit" },
  { id: "feutre", label: "Feutre" },
  { id: "bois", label: "Bois" },
  { id: "ardoise", label: "Ardoise" },
  { id: "cuir", label: "Cuir" },
  { id: "arcane", label: "Arcane" },
  { id: "ocean", label: "Océan" },
];

const KEY = "mtgmate.board";

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
    // stockage indisponible : réglage non retenu
  }
}

/** La texture affichée : celle choisie, ou, pour « au hasard », une texture tirée d'après `roll` (un nombre de [0, 1)). */
export function resolveBoardTheme(choice: BoardThemeChoice, roll: number): BoardTheme {
  if (choice !== "hasard") return choice;
  const i = Math.min(BOARD_THEMES.length - 1, Math.floor(roll * BOARD_THEMES.length));
  return (BOARD_THEMES[i] as { id: BoardTheme }).id;
}
