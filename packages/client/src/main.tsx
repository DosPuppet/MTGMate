import { LayoutGroup } from "motion/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { useGame } from "./store";
import "./styles.css";

// Mode dev : accès au store pour les scripts Playwright (bac à sable, voir protocol.ts).
if (import.meta.env.DEV) (window as unknown as { __mtgx: typeof useGame }).__mtgx = useGame;

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
