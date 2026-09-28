/**
 * Profil de jeu d'un niveau d'IA : ce qui distingue le débutant, le moyen et l'élevé dans les décisions heuristiques.
 */

export interface Profile {
  /** Hasard à graine (bruit du débutant). */
  rand: () => number;
  /** Probabilité de prendre une option correcte au hasard plutôt que la meilleure (débutant). */
  sloppiness: number;
  /** Probabilité de ne rien lancer alors qu'un sort est possible (débutant). */
  forgetfulness: number;
  /** Répond aux sorts adverses, fait des tours de combat, joue à la fin du tour adverse. */
  responds: boolean;
  /** Attaques : naïves, par règles, ou par simulation des blocages adverses. */
  attack: "naive" | "rules" | "search";
  /** Blocages : naïfs, gloutons par simulation, ou par recherche (blocages à deux, améliorations). */
  block: "naive" | "greedy" | "search";
  /** L'évaluation tient compte de la contre-attaque adverse. */
  exposure: boolean;
  /** Mulligans : larges (garde de 1 à 6 terrains) ou normaux. */
  mulligan: "loose" | "normal";
  /** Budget écoulé (recherches bornées en temps) : on garde la meilleure option trouvée. */
  outOfTime: () => boolean;
}

const never = () => false;

export const MEDIUM_PROFILE: Profile = {
  rand: Math.random,
  sloppiness: 0,
  forgetfulness: 0,
  responds: true,
  attack: "rules",
  block: "greedy",
  exposure: false,
  mulligan: "normal",
  outOfTime: never,
};
