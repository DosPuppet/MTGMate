/**
 * Table des effets sonores : clé stable → fichiers (variantes tirées au hasard) dans public/sounds/.
 * Échantillons Kenney (CC0), voir public/sounds/LICENSE-kenney.txt. Changer un son = changer une ligne ici.
 */

export interface SoundDef {
  files: string[];
  /** Volume relatif (0 à 1), avant le volume général. */
  volume: number;
  /** Autre son (clé de SOUNDS) joué en même temps, ex. scintillement d'un sort. */
  layer?: string;
  /** Pas de variation de hauteur (jingles). */
  steady?: boolean;
}

const range = (prefix: string, ids: (string | number)[]) => ids.map((i) => `${prefix}${i}.ogg`);

export const SOUNDS = {
  shuffle: { files: ["card-shuffle.ogg"], volume: 0.6 },
  draw: { files: range("card-slide-", [1, 2, 3, 5]), volume: 0.55 },
  land: { files: range("card-place-", [1, 2, 3, 4]), volume: 0.7 },
  cast: { files: range("card-shove-", [1, 2, 3, 4]), volume: 0.6, layer: "castShimmer" },
  castShimmer: { files: range("phaserUp", [1, 3]), volume: 0.12 },
  resolve: { files: range("card-place-", [1, 2, 3, 4]), volume: 0.55 },
  ability: { files: range("pluck_00", [1, 2]), volume: 0.5 },
  counter: { files: range("phaserDown", [1, 2]), volume: 0.35 },
  attack: { files: range("drawKnife", [1, 2, 3]), volume: 0.6 },
  block: { files: range("impactPlate_medium_00", [0, 1, 2]), volume: 0.45 },
  hit: { files: range("impactPunch_medium_00", [0, 1, 2]), volume: 0.6 },
  hitHeavy: { files: range("impactPunch_heavy_00", [0, 1, 2]), volume: 0.75 },
  heal: { files: range("confirmation_00", [2, 4]), volume: 0.45 },
  dies: { files: range("impactSoft_heavy_00", [0, 1, 2]), volume: 0.7 },
  token: { files: range("chip-lay-", [1, 2, 3]), volume: 0.7 },
  attach: { files: ["metalClick.ogg"], volume: 0.5 },
  poison: { files: range("drop_00", [2, 4]), volume: 0.6 },
  turn: { files: ["bong_001.ogg"], volume: 0.5 },
  tap: { files: range("card-shove-", [1, 2, 3, 4]), volume: 0.25 },
  click: { files: ["click_001.ogg"], volume: 0.35 },
  error: { files: range("error_00", [6, 8]), volume: 0.45 },
  win: { files: ["win.ogg"], volume: 0.7, steady: true },
  lose: { files: ["lose.ogg"], volume: 0.7, steady: true },
} satisfies Record<string, SoundDef>;

export type SoundKey = keyof typeof SOUNDS;

export const SOUND_FILES: string[] = [...new Set(Object.values(SOUNDS).flatMap((s) => s.files))];
