import { useEffect } from "react";
import { Board, useMainAction } from "./board/Board";
import { ReplayBar } from "./board/ReplayBar";
import { DrawerToggle, Sidebar, TouchPreview } from "./board/Sidebar";
import { DeckBuilder } from "./decks/DeckBuilder";
import { Lobby } from "./lobby/Lobby";
import { Online } from "./lobby/Online";

import { Prompts } from "./prompts/Prompts";
import { useGame } from "./store";
import { isTouch } from "./touch";
import { Coach } from "./tutorial/Coach";
import { TutorialMenu } from "./tutorial/TutorialMenu";

function Toast() {
  const toast = useGame((s) => s.toast);
  if (!toast) return null;
  return (
    <div className="toast" key={toast.id}>
      {toast.text}
    </div>
  );
}

/** Message important à valider (partie impossible à reprendre, partie en ligne perdue), par-dessus tous les écrans. */
function Notice() {
  const notice = useGame((s) => s.notice);
  const dismiss = useGame((s) => s.dismissNotice);
  if (!notice) return null;
  return (
    <div className="modal-backdrop">
      <div className="modal notice" role="alertdialog" aria-label={notice.title}>
        <h2>{notice.title}</h2>
        <p>{notice.text}</p>
        <div className="modal-actions">
          <button type="button" className="btn primary" onClick={dismiss}>
            OK
          </button>
        </div>
      </div>
    </div>
  );
}

function useShortcuts() {
  const action = useMainAction();
  const endTurn = useGame((s) => s.endTurn);
  const cancel = useGame((s) => s.cancel);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      if (e.code === "Space") {
        e.preventDefault();
        if (!action.disabled) action.run?.();
      } else if (e.code === "Enter" || e.code === "NumpadEnter") {
        e.preventDefault();
        const v = useGame.getState().view;
        if (v && v.turn.active === v.viewer && v.pending?.player === v.viewer) endTurn(e.shiftKey);
      } else if (e.code === "Escape") {
        const s = useGame.getState();
        if (s.peek) s.setPeek(null);
        else if (s.drawerOpen) s.setDrawerOpen(false);
        else cancel();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [action, endTurn, cancel]);
}

function GameScreen() {
  useShortcuts();
  const drawerOpen = useGame((s) => s.drawerOpen);
  return (
    <div
      className={`game ${drawerOpen ? "drawer-open" : ""}`}
      // Appui long au doigt : pas de menu contextuel du navigateur (l'aperçu de la carte le remplace).
      onContextMenu={(e) => isTouch() && e.preventDefault()}
    >
      <Board />
      <Sidebar />
      <ReplayBar />
      <DrawerToggle />
      <Prompts />
      <TouchPreview />
      <Coach />
      <div className="rotate-hint">
        <div className="rotate-icon">⟳</div>
        Tournez votre appareil en paysage pour jouer.
      </div>
    </div>
  );
}

export function App() {
  const screen = useGame((s) => s.screen);
  return (
    <>
      {screen === "decks" ? (
        <DeckBuilder />
      ) : screen === "lobby" ? (
        <Lobby />
      ) : screen === "online" ? (
        <Online />
      ) : screen === "tutorial" ? (
        <TutorialMenu />
      ) : (
        <GameScreen />
      )}
      <Toast />
      <Notice />
    </>
  );
}
