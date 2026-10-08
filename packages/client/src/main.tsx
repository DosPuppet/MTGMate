// En premier : les clés « mtgmate.* » renommées avant que les stores ne les lisent.
import "./storageRename";
import { LayoutGroup, MotionConfig } from "motion/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { playSound, unlockAudio, useAudio } from "./audio/sfx";
import { detectBlockedScryfall, loadCustomArt } from "./images";
import { prefetchGameWorker } from "./session";
import { flushSave, useGame } from "./store";
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
      {/* Mouvements réduits si le système le demande (accessibilité). */}
      <MotionConfig reducedMotion="user">
        <LayoutGroup>
          <App />
        </LayoutGroup>
      </MotionConfig>
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
// Illustrations personnelles du serveur (/art/, voir tools/custom-art.ts).
void loadCustomArt();

// Page rouverte : reprise de la partie en ligne, sinon de la partie contre l'IA sauvegardée (sauf lien d'invitation
// ?room=CODE, qui ouvre le jeu en ligne ; la partie sauvegardée reprendra à la prochaine ouverture).
const invited = new URLSearchParams(location.search).has("room");
if (invited && !localStorage.getItem("planecircle.online")) useGame.getState().openOnline();
else useGame.getState().resumeAtStartup();
// Fermeture de la page : la sauvegarde de la partie locale est écrite tout de suite.
window.addEventListener("pagehide", flushSave);
