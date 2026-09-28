/**
 * Mode rapide des tests d'interface (`?fast` dans l'URL, mode dev seulement) : l'IA joue sans pause
 * et un sort adverse n'est montré qu'un instant. Sans effet dans le build de production.
 */
export const fastMode = (): boolean =>
  import.meta.env.DEV && typeof location !== "undefined" && new URLSearchParams(location.search).has("fast");
