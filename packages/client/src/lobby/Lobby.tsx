import type { AiLevel } from "@mtgx/ai";
import { CARDS, type DeckList, FORMAT_LABELS, validateDeck } from "@mtgx/cards";
import { type Format, isGameRecord } from "@mtgx/engine";
import { useEffect, useState } from "react";
import { SoundControl } from "../audio/SoundControl";
import { ManaCost } from "../board/Card";
import { deckCover, useAllDecks } from "../decks/store";
import { ImageRelayToggle } from "../ImageRelayToggle";
import { useRelayActive } from "../images";
import { useGame } from "../store";
import { useTutorial } from "../tutorial/store";
import { FormatChoice, loadFormat, saveFormat } from "./FormatChoice";

/** Un deck peut lancer une partie s'il est légal dans le format et que toutes ses cartes sont jouables. */
export function deckStatus(d: DeckList, format: Format = "standard"): { ok: boolean; reason?: string; format: string } {
  const v = validateDeck(d, CARDS, format);
  const label = v.welcome ? "Bienvenue" : FORMAT_LABELS[v.format];
  if (!v.legal) return { ok: false, reason: v.errors[0], format: label };
  if (!v.playable) return { ok: false, reason: "Contient des cartes pas encore jouables", format: label };
  return { ok: true, format: label };
}

/** Catégories de decks de l'accueil : préconstruits par famille, puis ceux du joueur. */
const CATEGORIES = [
  { key: "welcome", label: "Débutant (bienvenue)" },
  { key: "fin", label: "Final Fantasy" },
  { key: "meta", label: "Méta Standard" },
  { key: "commander", label: "Commander" },
  { key: "mine", label: "Vos decks" },
] as const;
type Category = (typeof CATEGORIES)[number]["key"];

/** Catégorie d'un deck, d'après son identifiant (préconstruits) ; les decks du joueur vont dans « Vos decks ». */
export function deckCategory(d: DeckList): Category {
  if (!d.builtin) return "mine";
  if (d.id.startsWith("fin-")) return "fin";
  if (d.id.startsWith("meta-")) return "meta";
  if (d.id.startsWith("cmd-")) return "commander";
  return "welcome";
}

export function DeckChoice({
  label,
  value,
  onChange,
  format = "standard",
}: {
  label: string;
  value: string;
  onChange: (id: string) => void;
  /** Format de la partie : un deck illégal dans ce format ne peut pas être choisi. */
  format?: Format;
}) {
  const decks = useAllDecks();
  useRelayActive(); // illustrations des decks relayées si Scryfall est bloqué
  const openDeckBuilder = useGame((s) => s.openDeckBuilder);
  // Une catégorie à la fois ; au départ, celle du deck choisi.
  const chosen = decks.find((d) => d.id === value);
  const [category, setCategory] = useState<Category>(chosen ? deckCategory(chosen) : "welcome");
  const shown = decks.filter((d) => deckCategory(d) === category);
  return (
    <div className="deck-choice">
      <div className="deck-choice-label">{label}</div>
      <div className="seg deck-categories" role="tablist" aria-label={`${label} : catégories`}>
        {CATEGORIES.map((c) => {
          const n = decks.filter((d) => deckCategory(d) === c.key).length;
          return (
            <button
              key={c.key}
              type="button"
              role="tab"
              aria-selected={category === c.key}
              className={category === c.key ? "on" : ""}
              onClick={() => setCategory(c.key)}
            >
              {c.label} <span className="deck-category-count">{n}</span>
            </button>
          );
        })}
      </div>
      {shown.length === 0 && (
        <div className="deck-empty">Aucun deck pour l'instant. Créez-en un, ou importez une liste, depuis « Mes decks ».</div>
      )}
      <div className="deck-list">
        {shown.map((d) => {
          const status = deckStatus(d, format);
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

const LEVEL_KEY = "planecircle.aiLevel";

export const LEVELS: { level: AiLevel; label: string; hint: string }[] = [
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
  // Un deck par IA (au plus trois) ; au départ, des decks différents pour varier les adversaires.
  const [ai, setAi] = useState(() => [1, 2, 3].map((i) => decks[i]?.id ?? decks[1]?.id ?? ""));
  const [aiCount, setAiCount] = useState(1);
  // IA dont on choisit le deck (multijoueur).
  const [editing, setEditing] = useState(0);
  const slot = Math.min(editing, aiCount - 1);
  const byId = (id: string) => decks.find((d) => d.id === id);
  const me = byId(mine);
  const them = ai.slice(0, aiCount).map(byId);
  // Format de la partie (Standard, ou sans limite), retenu d'une partie à l'autre.
  const [format, setFormat] = useState<Format>(loadFormat);
  const chooseFormat = (f: Format) => {
    setFormat(f);
    saveFormat(f);
    // Un deck qui ne convient pas au nouveau format (Commander : un deck à commandant) est remplacé par le premier qui
    // convient, pour le joueur et pour chaque IA.
    const fits = (id: string) => {
      const d = byId(id);
      return !!d && deckStatus(d, f).ok;
    };
    const firstFit = decks.filter((d) => deckStatus(d, f).ok).map((d) => d.id);
    if (!fits(mine) && firstFit[0]) setMine(firstFit[0]);
    setAi((prev) => prev.map((id, i) => (fits(id) ? id : (firstFit[(i + 1) % firstFit.length] ?? id))));
  };
  const commander = format === "commander";
  const canStart = !!me && deckStatus(me, format).ok && them.every((d) => !!d && deckStatus(d, format).ok);
  // Match au meilleur des trois manches (duel), retenu d'une partie à l'autre.
  const [bo3, setBo3] = useState(() => localStorageFlag("planecircle.bo3"));
  useEffect(() => saveFlag("planecircle.bo3", bo3), [bo3]);
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
          Planecircle <span className="build-tag">(alpha build)</span>
        </h1>
      </header>
      <div className="lobby-body">
        <FormatChoice value={format} onChange={chooseFormat} />
        <DeckChoice label="Votre deck" value={mine} onChange={setMine} format={format} />
        <div className="ai-count">
          <span>Adversaires IA</span>
          <div className="seg">
            {[1, 2, 3].map((n) => (
              <button key={n} type="button" className={aiCount === n ? "on" : ""} onClick={() => setAiCount(n)}>
                {n}
              </button>
            ))}
          </div>
          <span className="hint">
            {aiCount > 1 ? "Multijoueur chacun pour soi" : "Duel"}
            {commander ? " · 40 points de vie" : ""}
          </span>
          {aiCount === 1 && !commander && (
            <label className="toggle" title="Au meilleur des trois manches, avec votre réserve entre les manches">
              <input type="checkbox" checked={bo3} onChange={(e) => setBo3(e.target.checked)} />
              Match en 3 manches (BO3)
            </label>
          )}
        </div>
        {aiCount > 1 && (
          <div className="seg ai-decks" role="tablist" aria-label="Deck de chaque IA">
            {them.map((d, i) => (
              <button
                key={i}
                type="button"
                role="tab"
                aria-selected={slot === i}
                className={slot === i ? "on" : ""}
                onClick={() => setEditing(i)}
              >
                IA {i + 1} <span className="ai-deck-name">{d?.name ?? "—"}</span>
              </button>
            ))}
          </div>
        )}
        <DeckChoice
          key={slot}
          label={aiCount > 1 ? `Deck de l'IA ${slot + 1}` : "Deck de l'IA"}
          value={ai[slot] ?? ""}
          format={format}
          onChange={(id) => setAi((prev) => prev.map((v, i) => (i === slot ? id : v)))}
        />
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
              canStart &&
              startGame(
                me.main,
                them.map((d) => (d as DeckList).main),
                undefined,
                level,
                bo3 && aiCount === 1 && !commander ? { bestOf: 3, sideboard: me.sideboard ?? [], format } : undefined,
                commander ? { player: me.commander ?? [], ai: them.map((d) => (d as DeckList).commander ?? []) } : undefined,
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
          <ReplayOpener />
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

/** « Revoir une partie » : ouvre un fichier exporté (« Exporter la partie ») dans le visionneur de replays. */
function ReplayOpener() {
  const openReplay = useGame((s) => s.openReplay);
  const notify = useGame((s) => s.notify);
  return (
    <label className="btn big replay-open">
      Revoir une partie
      <input
        type="file"
        accept="application/json,.json"
        hidden
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          try {
            const record = JSON.parse(await file.text()) as unknown;
            if (!isGameRecord(record)) return notify("Ce fichier n'est pas une partie Planecircle.");
            openReplay(record);
          } catch {
            notify("Fichier illisible.");
          }
        }}
      />
    </label>
  );
}

/** Réglage booléen mémorisé (le stockage peut être indisponible : navigation privée, aperçu). */
function localStorageFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function saveFlag(key: string, on: boolean): void {
  try {
    localStorage.setItem(key, on ? "1" : "0");
  } catch {
    // stockage indisponible : réglage non mémorisé
  }
}
