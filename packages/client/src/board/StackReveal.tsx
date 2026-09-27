/**
 * Sort ou capacité adverse sur la pile, quand le joueur n'a aucune réponse possible : on le lui montre
 * (carte, lanceur, cibles) au moins quelques secondes avant de passer. OK passe tout de suite.
 * Si le joueur peut répondre, rien de tout ça : le jeu l'attend déjà (bandeau « répondre ? »).
 */
import type { GameView } from "@mtgx/engine";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { faceName } from "../i18n";
import { myActions, useGame } from "../store";
import { Card } from "./Card";

/** Durée d'affichage avant de passer automatiquement. */
export const REVEAL_MS = 5000;

/** Le sort ou la capacité adverse à montrer, s'il y en a un et que le joueur ne peut rien y faire. */
function revealed(view: GameView | null, fullControl: boolean) {
  const p = view?.pending;
  if (!view || fullControl || p?.kind !== "priority" || p.player !== view.viewer) return null;
  const top = view.stack[view.stack.length - 1];
  if (!top || top.controller === view.viewer) return null;
  // Une réponse possible : le joueur décide lui-même (pas de minuterie).
  if (myActions(view).some((a) => a.type !== "pass" && a.type !== "tapForMana")) return null;
  return top;
}

export function StackReveal() {
  const view = useGame((s) => s.view);
  const fullControl = useGame((s) => s.settings.fullControl);
  const decide = useGame((s) => s.decide);
  const lang = useGame((s) => s.lang);
  const top = revealed(view, fullControl);
  const topId = top?.id;
  const [started, setStarted] = useState(0);

  // Minuterie : on passe seul au bout de REVEAL_MS (relancée pour chaque nouvel élément de pile).
  useEffect(() => {
    if (!topId) return;
    setStarted(Date.now());
    const t = setTimeout(() => decide({ type: "pass" }), REVEAL_MS);
    return () => clearTimeout(t);
  }, [topId, decide]);

  const nameOf = (id: string) => {
    if (!view) return id;
    const player = view.players[id];
    if (player) return id === view.viewer ? "vous" : player.name;
    const o = view.battlefield.find((x) => x.id === id) ?? view.stack.find((x) => x.id === id);
    return o ? faceName(o, lang) : "une carte";
  };

  return (
    <AnimatePresence>
      {top && view && (
        <motion.div
          key={top.id}
          className="stack-reveal"
          initial={{ opacity: 0, x: 40, scale: 0.9 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, x: 40, scale: 0.92, transition: { duration: 0.15 } }}
          transition={{ duration: 0.25 }}
        >
          <div className="stack-reveal-label">
            {view.players[top.controller]?.name ?? "L'adversaire"} {top.kind === "ability" ? "active" : "lance"}{" "}
            <strong>{faceName(top, lang)}</strong>
          </div>
          <Card face={top} width="var(--spotlight-w)" hoverable />
          {top.targets.length > 0 && (
            <div className="stack-reveal-targets">
              {top.targets.length > 1 ? "Cibles" : "Cible"} : {top.targets.map(nameOf).join(", ")}
            </div>
          )}
          <button type="button" className="btn primary stack-reveal-ok" onClick={() => decide({ type: "pass" })}>
            OK
          </button>
          <div className="stack-reveal-timer">
            <div key={started} className="stack-reveal-bar" style={{ animationDuration: `${REVEAL_MS}ms` }} />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Un sort adverse est montré par le panneau : l'encart éphémère (spotlight) ferait doublon. */
export function useRevealActive(): boolean {
  const view = useGame((s) => s.view);
  const fullControl = useGame((s) => s.settings.fullControl);
  return revealed(view, fullControl) !== null;
}
