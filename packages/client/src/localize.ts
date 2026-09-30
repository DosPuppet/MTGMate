/** Textes du moteur (invites, libellés) avec les noms de cartes dans la langue de l'interface. */
import type { GameView } from "@mtgx/engine";
import { useMemo } from "react";
import { localizeText } from "./i18n";
import { useGame } from "./store";

export function useLocalize(): (text: string) => string {
  const faces = useGame((s) => s.faces);
  const lang = useGame((s) => s.lang);
  return useMemo(() => (text: string) => localizeText(text, faces, lang), [faces, lang]);
}

/** La vue, avec la question en attente localisée (invite et libellés) ; même objet tant que rien ne change. */
export function useLocalizedView(view: GameView): GameView {
  const loc = useLocalize();
  return useMemo(() => {
    const p = view.pending;
    if (p?.kind !== "choice" || !p.request) return view;
    const labels = p.request.labels
      ? Object.fromEntries(Object.entries(p.request.labels).map(([k, v]) => [k, loc(v)]))
      : undefined;
    return { ...view, pending: { ...p, request: { ...p.request, prompt: loc(p.request.prompt), labels } } };
  }, [view, loc]);
}
