/**
 * Deckbuilder : collection filtrable (Foundations), deck et réserve, statistiques,
 * validation des règles de construction et de la légalité en Standard, import et export de decklists.
 */
import {
  CARDS,
  DEFAULT_FORMAT,
  type DeckEntries,
  type DeckList,
  FORMAT_LABELS,
  legalityIssue,
  normalizeName,
  SETS,
  validateDeck,
} from "@mtgx/cards";
import { type CardDef, cardFace, manaValue } from "@mtgx/engine";
import { useMemo, useState } from "react";
import { Card, ManaCost } from "../board/Card";
import { Preview } from "../board/Sidebar";
import { faceName } from "../i18n";
import { useGame } from "../store";
import { ExportModal, ImportModal } from "./ImportExport";
import { useAllDecks, useDecks } from "./store";

const COLORS = ["W", "U", "B", "R", "G"] as const;
const TYPES: [string, string][] = [
  ["", "Tous les types"],
  ["Creature", "Créatures"],
  ["Instant", "Éphémères"],
  ["Sorcery", "Rituels"],
  ["Enchantment", "Enchantements"],
  ["Artifact", "Artefacts"],
  ["Planeswalker", "Planeswalkers"],
  ["Land", "Terrains"],
];
const RARITIES: [string, string][] = [
  ["", "Toutes raretés"],
  ["common", "Commune"],
  ["uncommon", "Peu commune"],
  ["rare", "Rare"],
  ["mythic", "Mythique"],
];

const POOL: CardDef[] = Object.values(CARDS)
  .filter((c) => !c.isToken)
  .sort((a, b) => colorRank(a) - colorRank(b) || manaValue(a.manaCost) - manaValue(b.manaCost) || a.name.localeCompare(b.name));

function colorRank(c: CardDef): number {
  if (c.types.includes("Land")) return 7;
  if (c.colors.length === 0) return 6;
  if (c.colors.length > 1) return 5;
  return COLORS.indexOf(c.colors[0] as (typeof COLORS)[number]);
}

const isBasic = (c: CardDef | undefined) => !!c?.supertypes.includes("Basic");
const FORMAT = FORMAT_LABELS[DEFAULT_FORMAT];

/** Étiquette courte d'une carte illégale dans le format (« bannie », « hors Standard »). */
function legalityTag(c: CardDef): string | undefined {
  if (!legalityIssue(c)) return undefined;
  return c.legalities?.[DEFAULT_FORMAT] === "banned" ? "bannie" : `hors ${FORMAT}`;
}
const count = (entries: DeckEntries) => entries.reduce((a, [n]) => a + n, 0);

function withCount(entries: DeckEntries, name: string, delta: number): DeckEntries {
  const out = entries.map((e) => [...e] as [number, string]);
  const e = out.find((x) => x[1] === name);
  if (e) e[0] += delta;
  else if (delta > 0) out.push([delta, name]);
  return out.filter(([n]) => n > 0);
}

// ---------------------------------------------------------------------------
// Collection
// ---------------------------------------------------------------------------

interface Filters {
  colors: string[];
  type: string;
  mv: string;
  rarity: string;
  query: string;
  playableOnly: boolean;
  /** Cartes légales dans le format seulement (Standard). */
  legalOnly: boolean;
  /** Extension (code de set), ou "" pour toutes. */
  set: string;
}

function matches(c: CardDef, f: Filters): boolean {
  if (f.playableOnly && !c.implemented) return false;
  if (f.legalOnly && legalityIssue(c)) return false;
  if (f.set && c.set !== f.set) return false;
  if (f.colors.length) {
    const want = new Set(f.colors);
    const colorless = c.colors.length === 0;
    const ok = (want.has("C") && colorless) || (want.has("M") && c.colors.length > 1) || c.colors.some((x) => want.has(x));
    if (!ok) return false;
  }
  if (f.type && !c.types.includes(f.type as CardDef["types"][number])) return false;
  if (f.mv) {
    const mv = manaValue(c.manaCost);
    if (f.mv === "6" ? mv < 6 : mv !== Number(f.mv)) return false;
  }
  if (f.rarity && c.rarity !== f.rarity) return false;
  if (f.query) {
    const q = normalizeName(f.query);
    const hay = normalizeName(
      [c.name, c.fr?.name, c.typeLine, c.fr?.typeLine, c.text, c.fr?.text, c.prepareFace?.name, c.prepareFace?.text].join(" "),
    );
    if (!hay.includes(q)) return false;
  }
  return true;
}

function Collection({ deck, onChange }: { deck: DeckList; onChange: (name: string, delta: number) => void }) {
  const [f, setF] = useState<Filters>({
    colors: [],
    type: "",
    mv: "",
    rarity: "",
    query: "",
    playableOnly: true,
    legalOnly: true,
    set: "",
  });
  const cards = useMemo(() => POOL.filter((c) => matches(c, f)), [f]);
  const inDeck = (name: string) =>
    (deck.main.find((e) => e[1] === name)?.[0] ?? 0) + (deck.sideboard?.find((e) => e[1] === name)?.[0] ?? 0);
  const toggleColor = (c: string) =>
    setF((x) => ({ ...x, colors: x.colors.includes(c) ? x.colors.filter((y) => y !== c) : [...x.colors, c] }));
  return (
    <section className="collection">
      <div className="filters">
        <input
          className="search"
          placeholder="Rechercher (nom, type, texte — FR ou EN)"
          value={f.query}
          onChange={(e) => setF({ ...f, query: e.target.value })}
        />
        <div className="color-filter">
          {[...COLORS, "C", "M"].map((c) => (
            <button
              key={c}
              type="button"
              className={`color-toggle ${f.colors.includes(c) ? "on" : ""}`}
              title={c === "C" ? "Incolore" : c === "M" ? "Multicolore" : undefined}
              onClick={() => toggleColor(c)}
            >
              {c === "M" ? <span className="multi-dot" /> : <ManaCost cost={`{${c}}`} size={18} />}
            </button>
          ))}
        </div>
        <select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
          {TYPES.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <select value={f.mv} onChange={(e) => setF({ ...f, mv: e.target.value })}>
          <option value="">Tout coût</option>
          {["0", "1", "2", "3", "4", "5", "6"].map((v) => (
            <option key={v} value={v}>
              {v === "6" ? "6+" : v}
            </option>
          ))}
        </select>
        <select value={f.rarity} onChange={(e) => setF({ ...f, rarity: e.target.value })}>
          {RARITIES.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <label className="toggle">
          <input type="checkbox" checked={f.playableOnly} onChange={(e) => setF({ ...f, playableOnly: e.target.checked })} />
          Jouables seulement
        </label>
        <label className="toggle" title="Masquer les cartes bannies ou hors format">
          <input type="checkbox" checked={f.legalOnly} onChange={(e) => setF({ ...f, legalOnly: e.target.checked })} />
          Légales en {FORMAT}
        </label>
        <select value={f.set} onChange={(e) => setF({ ...f, set: e.target.value })} aria-label="Extension">
          <option value="">Toutes les extensions</option>
          {SETS.map((s) => (
            <option key={s.code} value={s.code}>
              {s.nameFr}
            </option>
          ))}
        </select>
        <span className="hint">
          {cards.length} cartes ·{" "}
          {SETS.map((s) => {
            const inSet = POOL.filter((c) => c.set === s.code);
            return `${s.nameFr} ${inSet.filter((c) => c.implemented).length}/${inSet.length}`;
          }).join(" · ")}{" "}
          jouables
        </span>
      </div>
      <div className="collection-grid">
        {cards.map((c) => {
          const n = inDeck(c.name);
          const illegal = legalityTag(c);
          return (
            <div
              key={c.id}
              className={`collection-card ${c.implemented ? "" : "soon"}`}
              onContextMenu={(e) => {
                e.preventDefault();
                if (n > 0) onChange(c.name, -1);
              }}
            >
              <Card face={cardFace(c)} width="var(--collection-w)" onClick={() => onChange(c.name, 1)} dim={!c.implemented} />
              {n > 0 && <span className="copies">{n}</span>}
              {illegal ? (
                <span className="soon-tag illegal-tag">{illegal}</span>
              ) : (
                !c.implemented && <span className="soon-tag">bientôt</span>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Deck
// ---------------------------------------------------------------------------

const GROUPS: [string, (c: CardDef) => boolean][] = [
  ["Créatures", (c) => c.types.includes("Creature")],
  ["Éphémères et rituels", (c) => c.types.includes("Instant") || c.types.includes("Sorcery")],
  [
    "Autres",
    (c) =>
      !c.types.includes("Creature") && !c.types.includes("Land") && !c.types.includes("Instant") && !c.types.includes("Sorcery"),
  ],
  ["Terrains", (c) => c.types.includes("Land")],
];

function DeckLines({
  entries,
  onChange,
  readOnly,
}: {
  entries: DeckEntries;
  onChange: (name: string, d: number) => void;
  readOnly: boolean;
}) {
  const lang = useGame((s) => s.lang);
  const setHover = useGame((s) => s.setHover);
  return (
    <>
      {GROUPS.map(([label, test]) => {
        const lines = entries
          .filter(([, name]) => CARDS[name] && test(CARDS[name] as CardDef))
          .sort((a, b) => manaValue(CARDS[a[1]]?.manaCost) - manaValue(CARDS[b[1]]?.manaCost) || a[1].localeCompare(b[1]));
        if (!lines.length) return null;
        return (
          <div key={label} className="deck-group">
            <div className="deck-group-title">
              {label} <span>{count(lines)}</span>
            </div>
            {lines.map(([n, name]) => {
              const c = CARDS[name] as CardDef;
              const face = cardFace(c);
              const illegal = legalityIssue(c);
              return (
                <div
                  key={name}
                  className={`deck-line ${c.implemented ? "" : "soon"} ${illegal ? "illegal" : ""}`}
                  title={illegal}
                  onMouseEnter={() => setHover({ face })}
                >
                  <span className="deck-line-n">{n}</span>
                  <span className="deck-line-name">{faceName(face, lang)}</span>
                  <ManaCost cost={face.manaCost} size={13} />
                  {!readOnly && (
                    <span className="deck-line-btns">
                      <button type="button" className="btn small" onClick={() => onChange(name, -1)} aria-label="Retirer">
                        −
                      </button>
                      <button type="button" className="btn small" onClick={() => onChange(name, 1)} aria-label="Ajouter">
                        +
                      </button>
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </>
  );
}

function Stats({ deck }: { deck: DeckList }) {
  const curve = [0, 0, 0, 0, 0, 0, 0];
  const pips: Record<string, number> = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  for (const [n, name] of deck.main) {
    const c = CARDS[name];
    if (!c || c.types.includes("Land")) continue;
    const mv = Math.min(6, manaValue(c.manaCost));
    curve[mv] = (curve[mv] ?? 0) + n;
    for (const col of Object.keys(pips)) pips[col] = (pips[col] ?? 0) + n * (c.manaCost?.colored[col as "W"] ?? 0);
  }
  const max = Math.max(1, ...curve);
  return (
    <div className="deck-stats">
      <div className="curve" title="Courbe de mana (hors terrains)">
        {curve.map((v, i) => (
          <div key={i} className="curve-col">
            <div className="curve-bar" style={{ height: `${(v / max) * 100}%` }}>
              {v > 0 && <span>{v}</span>}
            </div>
            <div className="curve-label">{i === 6 ? "6+" : i}</div>
          </div>
        ))}
      </div>
      <div className="pips" title="Symboles de mana colorés">
        {Object.entries(pips)
          .filter(([, v]) => v > 0)
          .map(([c, v]) => (
            <span key={c}>
              <ManaCost cost={`{${c}}`} size={14} /> {v}
            </span>
          ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Écran
// ---------------------------------------------------------------------------

export function DeckBuilder() {
  const editing = useGame((s) => s.editingDeck);
  const backToLobby = useGame((s) => s.backToLobby);
  const startGame = useGame((s) => s.startGame);
  const notify = useGame((s) => s.notify);
  const lang = useGame((s) => s.lang);
  const setLang = useGame((s) => s.setLang);
  const decks = useAllDecks();
  const { save, remove, duplicate, create } = useDecks();
  const [tab, setTab] = useState<"main" | "side">("main");
  const [modal, setModal] = useState<"import" | "export" | null>(null);
  const select = (id: string | null) => useGame.setState({ editingDeck: id });

  const deck = decks.find((d) => d.id === editing) ?? decks.find((d) => !d.builtin) ?? decks[0];
  if (!deck) return null;
  const readOnly = !!deck.builtin;
  const v = validateDeck(deck, CARDS);

  const change = (name: string, delta: number) => {
    if (readOnly) {
      notify("Deck préconstruit : dupliquez-le pour le modifier.");
      return;
    }
    const c = CARDS[name];
    const total = (deck.main.find((e) => e[1] === name)?.[0] ?? 0) + (deck.sideboard?.find((e) => e[1] === name)?.[0] ?? 0);
    if (delta > 0 && !isBasic(c) && total >= 4) {
      notify(`${name} : 4 exemplaires maximum.`);
      return;
    }
    if (tab === "main") save({ ...deck, main: withCount(deck.main, name, delta) });
    else save({ ...deck, sideboard: withCount(deck.sideboard ?? [], name, delta) });
  };
  const opponent = decks.find((d) => d.id !== deck.id && validateDeck(d, CARDS).playable);

  return (
    <div className="builder">
      <header className="builder-head">
        <button type="button" className="btn ghost" onClick={backToLobby}>
          ← Accueil
        </button>
        <select className="deck-select" value={deck.id} onChange={(e) => select(e.target.value)}>
          <optgroup label="Préconstruits">
            {decks
              .filter((d) => d.builtin)
              .map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
          </optgroup>
          <optgroup label="Mes decks">
            {decks
              .filter((d) => !d.builtin)
              .map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
          </optgroup>
        </select>
        {readOnly ? (
          <span className="hint">Deck préconstruit (lecture seule)</span>
        ) : (
          <input
            className="deck-name-input"
            value={deck.name}
            onChange={(e) => save({ ...deck, name: e.target.value })}
            aria-label="Nom du deck"
          />
        )}
        <div className="builder-actions">
          <button type="button" className="btn small" onClick={() => select(create())}>
            Nouveau
          </button>
          <button type="button" className="btn small" onClick={() => select(duplicate(deck))}>
            Dupliquer
          </button>
          {!readOnly && (
            <button
              type="button"
              className="btn small ghost"
              onClick={() => {
                if (window.confirm(`Supprimer « ${deck.name} » ?`)) {
                  remove(deck.id);
                  select(null);
                }
              }}
            >
              Supprimer
            </button>
          )}
          <button type="button" className="btn small" onClick={() => setModal("import")}>
            Importer
          </button>
          <button type="button" className="btn small" onClick={() => setModal("export")}>
            Exporter
          </button>
          <button
            type="button"
            className="btn small primary"
            disabled={!v.playable || !opponent}
            title={!v.playable ? (v.errors[0] ?? "Contient des cartes pas encore jouables") : undefined}
            onClick={() => opponent && startGame(deck.main, [opponent.main])}
          >
            Tester contre l'IA
          </button>
          <div className="seg">
            <button type="button" className={lang === "fr" ? "on" : ""} onClick={() => setLang("fr")}>
              FR
            </button>
            <button type="button" className={lang === "en" ? "on" : ""} onClick={() => setLang("en")}>
              EN
            </button>
          </div>
        </div>
      </header>
      <div className="builder-body">
        <Collection deck={deck} onChange={change} />
        <section className="deck-panel">
          <div className="deck-tabs">
            <button type="button" className={tab === "main" ? "on" : ""} onClick={() => setTab("main")}>
              Deck <strong className={v.mainCount >= 60 ? "ok" : "short"}>{v.mainCount}</strong>/60
            </button>
            <button type="button" className={tab === "side" ? "on" : ""} onClick={() => setTab("side")}>
              Réserve <strong>{v.sideCount}</strong>/15
            </button>
            <span className={`format-badge ${v.legal ? "ok" : "ko"}`} title={v.legal ? `Deck légal en ${FORMAT}` : v.errors[0]}>
              {FORMAT} {v.legal ? "✓" : "✗"}
            </span>
          </div>
          <Stats deck={deck} />
          <div className="deck-lines">
            <DeckLines entries={tab === "main" ? deck.main : (deck.sideboard ?? [])} onChange={change} readOnly={readOnly} />
            {(tab === "main" ? deck.main : (deck.sideboard ?? [])).length === 0 && (
              <p className="hint">
                Cliquez sur une carte de la collection pour l'ajouter{tab === "side" ? " à la réserve" : ""}.
              </p>
            )}
          </div>
          <div className="deck-validation">
            {v.errors.map((e) => (
              <div key={e} className="v-error">
                {e}
              </div>
            ))}
            {v.warnings.slice(0, 5).map((w) => (
              <div key={w} className="v-warn">
                {w}
              </div>
            ))}
            {v.warnings.length > 5 && (
              <div className="v-warn">… et {v.warnings.length - 5} autres cartes pas encore jouables</div>
            )}
            {v.playable && <div className="v-ok">Deck légal en {FORMAT} et jouable</div>}
          </div>
        </section>
        <aside className="builder-preview">
          <Preview />
        </aside>
      </div>
      {modal === "import" && (
        <ImportModal
          current={readOnly ? null : deck}
          onClose={() => setModal(null)}
          onCreate={(d) => {
            const id = duplicate(d, d.name);
            select(id);
            setModal(null);
          }}
          onReplace={(d) => {
            save({ ...deck, main: d.main, sideboard: d.sideboard });
            setModal(null);
          }}
        />
      )}
      {modal === "export" && <ExportModal deck={deck} onClose={() => setModal(null)} />}
    </div>
  );
}
