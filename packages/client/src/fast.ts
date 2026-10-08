/**
 * Fast mode of the interface tests (`?fast` in the URL, dev mode only): the AI plays without pauses
 * and an opponent's spell is shown only for an instant. No effect in the production build.
 */
export const fastMode = (): boolean =>
  import.meta.env.DEV && typeof location !== "undefined" && new URLSearchParams(location.search).has("fast");
