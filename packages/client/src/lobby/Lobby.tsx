import type { AiLevel } from "@mtgx/ai";
import { CARDS, type DeckList, FORMAT_LABELS, validateDeck } from "@mtgx/cards";
import { useState } from "react";
import { SoundControl } from "../audio/SoundControl";
import { ManaCost } from "../board/Card";
import { deckCover, useAllDecks } from "../decks/store";
import { ImageRelayToggle } from "../ImageRelayToggle";
import { useRelayActive } from "../images";
import { useGame } from "../store";
import { useTutorial } from "../tutorial/store";

/** Un deck peut lancer une partie s'il est légal dans le format et que toutes ses cartes sont jouables. */
export function deckStatus(d: DeckList): { ok: boolean; reason?: string; format: string } {
  const v = validateDeck(d, CARDS);
  const format = v.welcome ? "Bienvenue" : FORMAT_LABELS[v.format];
  if (!v.legal) return { ok: false, reason: v.errors[0], format };
  if (!v.playable) return { ok: false, reason: "Contient des cartes pas encore jouables", format };
  return { ok: true, format };
}

export function DeckChoice({ label, value, onChange }: { label: string; value: string; onChange: (id: string) => void }) {
  const decks = useAllDecks();
  useRelayActive(); // illustrations des decks relayées si Scryfall est bloqué
  const openDeckBuilder = useGame((s) => s.openDeckBuilder);
  return (
    <div className="deck-choice">
      <div className="deck-choice-label">{label}</div>
      <div className="deck-list">
        {decks.map((d) => {
          const status = deckStatus(d);
          const cover = deckCover(d);
          return (
            <div
              key={d.id}
              className={`deck-tile ${value === d.id ? "on" : ""} ${status.ok ? "" : "invalid"}`}
              title={status.reason}
            >
              <button type="button" className="deck-tile-main" disabled={!status.ok} onClick={() => onChange(d.id)}>
                <div className="deck-art" style={{ backgroundImage: cover ? `url(${cover})` : undefined }} />
                <div className="deck-body">
                  <div className="deck-name">
                    {d.name} <ManaCost cost={d.colors.map((c) => `{${c}}`).join("")} size={14} />
                  </div>
                  <div className="deck-desc">{d.description ?? (d.builtin ? "" : "Mon deck")}</div>
                  <div className="deck-count">
                    {d.main.reduce((n, [k]) => n + k, 0)} cartes
                    {status.ok ? ` · ${status.format}` : ""}
                    {d.builtin ? " · préconstruit" : ""}
                    {!status.ok && <span className="deck-invalid"> · {status.reason}</span>}
                  </div>
                </div>
              </button>
              <button
                type="button"
                className="btn small ghost deck-edit"
                onClick={(e) => {
                  e.stopPropagation();
                  openDeckBuilder(d.id);
                }}
              >
                {d.builtin ? "Voir" : "Éditer"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const LEVEL_KEY = "mtgmate.aiLevel";

const LEVELS: { level: AiLevel; label: string; hint: string }[] = [
  { level: "beginner", label: "Débutant", hint: "Pour apprendre : l'IA fait des erreurs et ne vous tend pas de pièges." },
  { level: "medium", label: "Moyen", hint: "L'IA joue correctement et bloque avec prudence." },
  {
    level: "expert",
    label: "Élevé",
    hint: "L'IA simule les combats et les tours suivants avant de jouer (en duel ; en multijoueur, elle simule les combats).",
  },
];

function loadLevel(): AiLevel {
  try {
    const v = localStorage.getItem(LEVEL_KEY);
    return LEVELS.some((l) => l.level === v) ? (v as AiLevel) : "medium";
  } catch {
    return "medium";
  }
}

function saveLevel(level: AiLevel): void {
  try {
    localStorage.setItem(LEVEL_KEY, level);
  } catch {
    // réglage non conservé
  }
}

export function Lobby() {
  const startGame = useGame((s) => s.startGame);
  const openDeckBuilder = useGame((s) => s.openDeckBuilder);
  const openOnline = useGame((s) => s.openOnline);
  const openTutorial = useGame((s) => s.openTutorial);
  // Nouveau joueur (aucune leçon commencée) : le tutoriel est mis en avant.
  const newcomer = useTutorial((t) => t.progress.done.length === 0 && !t.progress.current);
  const decks = useAllDecks();
  const [mine, setMine] = useState(decks[0]?.id ?? "");
  const [ai, setAi] = useState(decks[1]?.id ?? "");
  const byId = (id: string) => decks.find((d) => d.id === id);
  const me = byId(mine);
  const them = byId(ai);
  const canStart = !!me && !!them && deckStatus(me).ok && deckStatus(them).ok;
  const [aiCount, setAiCount] = useState(1);
  const [level, setLevel] = useState<AiLevel>(loadLevel);
  const chooseLevel = (l: AiLevel) => {
    setLevel(l);
    saveLevel(l);
  };
  return (
    <div className="lobby">
      <header className="lobby-head">
        <div className="lobby-sound">
          <SoundControl />
          <ImageRelayToggle />
        </div>
        <h1>
          MTG Mate <span className="build-tag">(alpha build)</span>
        </h1>
      </header>
      <div className="lobby-body">
        <DeckChoice label="Votre deck" value={mine} onChange={setMine} />
        <DeckChoice label="Deck de l'IA" value={ai} onChange={setAi} />
        <div className="ai-count">
          <span>Adversaires IA</span>
          <div className="seg">
            {[1, 2, 3].map((n) => (
              <button key={n} type="button" className={aiCount === n ? "on" : ""} onClick={() => setAiCount(n)}>
                {n}
              </button>
            ))}
          </div>
          <span className="hint">{aiCount > 1 ? "Multijoueur chacun pour soi" : "Duel"}</span>
        </div>
        <div className="ai-level">
          <div className="ai-count">
            <span>Niveau de l'IA</span>
            <div className="seg">
              {LEVELS.map((l) => (
                <button
                  key={l.level}
                  type="button"
                  className={level === l.level ? "on" : ""}
                  onClick={() => chooseLevel(l.level)}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </div>
          <div className="hint ai-level-hint">{LEVELS.find((l) => l.level === level)?.hint}</div>
        </div>
        <div className="lobby-actions">
          <button
            type="button"
            className="btn primary big"
            disabled={!canStart}
            onClick={() =>
              me &&
              them &&
              startGame(
                me.main,
                Array.from({ length: aiCount }, () => them.main),
                undefined,
                level,
              )
            }
          >
            Jouer contre l'IA
          </button>
          <button type="button" className="btn big" onClick={() => openDeckBuilder(null)}>
            Mes decks
          </button>
          <button type="button" className="btn big" onClick={openOnline}>
            Contre un joueur
          </button>
          <button type="button" className={`btn big ${newcomer ? "learn" : ""}`} onClick={openTutorial}>
            Apprendre à jouer
          </button>
        </div>
        <div className="lobby-help">
          <strong>Raccourcis :</strong> Espace = bouton principal · Entrée = passer le tour · Échap = annuler · M = couper le son.
          Glissez une carte vers le champ de bataille (ou sur sa cible) pour la jouer. Les petits points sous la barre des phases
          règlent vos arrêts.
        </div>
      </div>
      <footer className="lobby-foot">
        Projet de fan gratuit et non commercial. Magic: The Gathering est une marque de Wizards of the Coast ; ce projet n'est ni
        approuvé ni soutenu par Wizards. Images et données de cartes : Scryfall.
      </footer>
    </div>
  );
}
