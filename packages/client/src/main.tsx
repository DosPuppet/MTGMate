import { LayoutGroup } from "motion/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { playSound, unlockAudio, useAudio } from "./audio/sfx";
import { detectBlockedScryfall } from "./images";
import { prefetchGameWorker } from "./session";
import { useGame } from "./store";
import { useTutorial } from "./tutorial/store";
import "./styles.css";

// Mode dev : accès aux stores pour les scripts Playwright (bac à sable, voir protocol.ts ; tutoriel).
if (import.meta.env.DEV) {
  const w = window as unknown as { __mtgx: typeof useGame; __tuto: typeof useTutorial };
  w.__mtgx = useGame;
  w.__tuto = useTutorial;
}

// Production : service worker (application en cache, démarrage hors ligne ; public/sw.js).
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  navigator.serviceWorker
    .register("/sw.js")
    .then(() => navigator.serviceWorker.ready)
    // Le worker de partie en cache dès la première visite (partie contre l'IA hors ligne).
    .then(() => setTimeout(prefetchGameWorker, 3000))
    .catch((e) => console.warn("Service worker non enregistré :", e));
}

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <LayoutGroup>
        <App />
      </LayoutGroup>
    </StrictMode>,
  );
}

// Son : déverrouillé au premier geste (politique d'autoplay des navigateurs), clic des boutons, M = muet.
document.addEventListener("pointerdown", unlockAudio, { capture: true });
document.addEventListener(
  "click",
  (e) => {
    const btn = (e.target as HTMLElement | null)?.closest?.("button.btn, .main-button");
    if (btn && !(btn as HTMLButtonElement).disabled) playSound("click");
  },
  { capture: true },
);
document.addEventListener("keydown", (e) => {
  const t = e.target as HTMLElement | null;
  if (e.key.toLowerCase() !== "m" || e.ctrlKey || e.metaKey || e.altKey) return;
  if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
  useAudio.getState().toggleMute();
});

// Images : Scryfall bloqué par le réseau du joueur ? Relais par le serveur (mode auto, voir images.ts).
void detectBlockedScryfall();

// Jeu en ligne : reprise de la partie de cet onglet (rechargement de la page), lien d'invitation ?room=CODE.
useGame.getState().resumeOnline();
if (new URLSearchParams(location.search).has("room") && !useGame.getState().online) useGame.getState().openOnline();
