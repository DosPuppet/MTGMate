import { DECKS } from "@mtgx/cards/decks";
import { useState } from "react";
import { ManaCost } from "../board/Card";
import { useGame } from "../store";

function DeckChoice({ label, value, onChange }: { label: string; value: string; onChange: (id: string) => void }) {
  return (
    <div className="deck-choice">
      <div className="deck-choice-label">{label}</div>
      <div className="deck-list">
        {DECKS.map((d) => (
          <button key={d.id} type="button" className={`deck-tile ${value === d.id ? "on" : ""}`} onClick={() => onChange(d.id)}>
            <div className="deck-art" style={{ backgroundImage: d.cover ? `url(${d.cover})` : undefined }} />
            <div className="deck-body">
              <div className="deck-name">
                {d.name} <ManaCost cost={d.colors.map((c) => `{${c}}`).join("")} size={14} />
              </div>
              <div className="deck-desc">{d.description}</div>
              <div className="deck-count">{d.cards.reduce((n, [k]) => n + k, 0)} cartes</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

export function Lobby() {
  const startGame = useGame((s) => s.startGame);
  const [mine, setMine] = useState(DECKS[0]?.id ?? "");
  const [ai, setAi] = useState(DECKS[1]?.id ?? "");
  return (
    <div className="lobby">
      <header className="lobby-head">
        <h1>MTGX</h1>
        <p>Magic: The Gathering, fluide comme Arena — moteur de règles maison, cartes de Foundations.</p>
      </header>
      <div className="lobby-body">
        <DeckChoice label="Votre deck" value={mine} onChange={setMine} />
        <DeckChoice label="Deck de l'IA" value={ai} onChange={setAi} />
        <div className="lobby-actions">
          <button type="button" className="btn primary big" onClick={() => startGame(mine, ai)}>
            Jouer contre l'IA
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
