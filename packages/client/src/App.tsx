import { useEffect } from "react";
import { Board, useMainAction } from "./board/Board";
import { Sidebar } from "./board/Sidebar";
import { DeckBuilder } from "./decks/DeckBuilder";
import { Lobby } from "./lobby/Lobby";
import { Online } from "./lobby/Online";

import { Prompts } from "./prompts/Prompts";
import { useGame } from "./store";

function Toast() {
  const toast = useGame((s) => s.toast);
  if (!toast) return null;
  return (
    <div className="toast" key={toast.id}>
      {toast.text}
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
        if (v && v.turn.active === v.viewer && v.pending?.player === v.viewer) endTurn();
      } else if (e.code === "Escape") cancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [action, endTurn, cancel]);
}

function GameScreen() {
  useShortcuts();
  return (
    <div className="game">
      <Board />
      <Sidebar />
      <Prompts />
    </div>
  );
}

export function App() {
  const screen = useGame((s) => s.screen);
  return (
    <>
      {screen === "decks" ? <DeckBuilder /> : screen === "lobby" ? <Lobby /> : screen === "online" ? <Online /> : <GameScreen />}
      <Toast />
    </>
  );
}
