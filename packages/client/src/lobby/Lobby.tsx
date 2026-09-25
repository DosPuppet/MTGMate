import { CARDS, type DeckList, validateDeck } from "@mtgx/cards";
import { useState } from "react";
import { ManaCost } from "../board/Card";
import { deckCover, useAllDecks } from "../decks/store";
import { useGame } from "../store";

/** Un deck peut lancer une partie s'il respecte les règles et que toutes ses cartes sont jouables. */
function deckStatus(d: DeckList): { ok: boolean; reason?: string } {
  const v = validateDeck(d, CARDS);
  if (!v.legal) return { ok: false, reason: v.errors[0] };
  if (!v.playable) return { ok: false, reason: "Contient des cartes pas encore jouables" };
  return { ok: true };
}

function DeckChoice({ label, value, onChange }: { label: string; value: string; onChange: (id: string) => void }) {
  const decks = useAllDecks();
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

export function Lobby() {
  const startGame = useGame((s) => s.startGame);
  const openDeckBuilder = useGame((s) => s.openDeckBuilder);
  const decks = useAllDecks();
  const [mine, setMine] = useState(decks[0]?.id ?? "");
  const [ai, setAi] = useState(decks[1]?.id ?? "");
  const byId = (id: string) => decks.find((d) => d.id === id);
  const me = byId(mine);
  const them = byId(ai);
  const canStart = !!me && !!them && deckStatus(me).ok && deckStatus(them).ok;
  const [aiCount, setAiCount] = useState(1);
  return (
    <div className="lobby">
      <header className="lobby-head">
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
              )
            }
          >
            Jouer contre l'IA
          </button>
          <button type="button" className="btn big" onClick={() => openDeckBuilder(null)}>
            Mes decks
          </button>
          <button type="button" className="btn big" disabled title="Arrive à l'étape 6 de la feuille de route">
            Contre un joueur — bientôt
          </button>
        </div>
        <div className="lobby-help">
          <strong>Raccourcis :</strong> Espace = bouton principal · Entrée = passer le tour · Échap = annuler. Glissez une carte
          vers le champ de bataille (ou sur sa cible) pour la jouer. Les petits points sous la barre des phases règlent vos
          arrêts.
        </div>
      </div>
      <footer className="lobby-foot">
        Projet de fan gratuit et non commercial. Magic: The Gathering est une marque de Wizards of the Coast ; ce projet n'est ni
        approuvé ni soutenu par Wizards. Images et données de cartes : Scryfall.
      </footer>
    </div>
  );
}
