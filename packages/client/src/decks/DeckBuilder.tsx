/**
 * Deckbuilder : collection filtrable (Foundations), deck et réserve, statistiques,
 * validation des règles de construction et de la légalité dans le format du deck (Standard, Commander : commandant,
 * 100 cartes, identité), import et export de decklists.
 */
import {
  CARDS,
  canBeCommander,
  DEFAULT_FORMAT,
  type DeckEntries,
  type DeckEntry,
  type DeckList,
  FORMAT_LABELS,
  FORMATS,
  legalityIssue,
  SET_BY_CODE,
  SETS,
  validateDeck,
} from "@mtgx/cards";
import type { PrintingOption } from "@mtgx/cards/printings";
import {
  type CardDef,
  type Color,
  CUSTOM_PRINTING,
  cardFace,
  colorIdentity,
  type Format,
  keyedPrinting,
  manaValue,
  withinIdentity,
} from "@mtgx/engine";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Card, ManaCost } from "../board/Card";
import { Preview } from "../board/Sidebar";
import { faceName } from "../i18n";
import { hasCustomArt, useImages } from "../images";
import { useGame } from "../store";
import { ExportModal, ImportModal } from "./ImportExport";
import { type PrintingTable, usePrintings } from "./printings";
import { searchFilter } from "./search";
import { printedFace, useAllDecks, useDecks } from "./store";

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
  .filter((c) => !c.isToken && !c.meldResult)
  .sort((a, b) => colorRank(a) - colorRank(b) || manaValue(a.manaCost) - manaValue(b.manaCost) || a.name.localeCompare(b.name));

/** « Standard 836/5174 jouables » ou, pour une extension, « Foundations 517/517 jouables ». */
function coverageHint(set: string): string {
  const inSet = set ? POOL.filter((c) => c.set === set) : POOL;
  const label = set ? (SETS.find((s) => s.code === set)?.nameFr ?? set) : "Standard";
  return `${label} ${inSet.filter((c) => c.implemented).length}/${inSet.length} jouables`;
}

function colorRank(c: CardDef): number {
  if (c.types.includes("Land")) return 7;
  if (c.colors.length === 0) return 6;
  if (c.colors.length > 1) return 5;
  return COLORS.indexOf(c.colors[0] as (typeof COLORS)[number]);
}

const isBasic = (c: CardDef | undefined) => !!c?.supertypes.includes("Basic");

/** Étiquette courte d'une carte illégale dans le format (« bannie », « hors Standard »). */
function legalityTag(c: CardDef, format: Format): string | undefined {
  const issue = legalityIssue(c, format);
  if (!issue) return undefined;
  return /bannie/.test(issue) ? "bannie" : `hors ${FORMAT_LABELS[format]}`;
}
const count = (entries: DeckEntries) => entries.reduce((a, [n]) => a + n, 0);

function withCount(entries: DeckEntries, name: string, delta: number): DeckEntries {
  const out = entries.map((e) => [...e] as DeckEntry);
  const e = out.find((x) => x[1] === name);
  if (e) e[0] += delta;
  else if (delta > 0) out.push([delta, name]);
  return out.filter(([n]) => n > 0);
}

/** Impression choisie pour `name` (absente : l'illustration de la carte), dans une liste. */
function withPrinting(entries: DeckEntries, name: string, key: string | undefined): DeckEntries {
  return entries.map(([n, x, p]): DeckEntry => (x !== name ? (p ? [n, x, p] : [n, x]) : key ? [n, x, key] : [n, x]));
}

/** Langue d'une carte imprimée dans une seule langue (Archives mystiques japonaises…). */
const PRINT_LANGS: Record<string, string> = {
  ja: "japonais",
  zhs: "chinois simplifié",
  zht: "chinois traditionnel",
  ko: "coréen",
  ru: "russe",
  de: "allemand",
  fr: "français",
  it: "italien",
  es: "espagnol",
  pt: "portugais",
  ph: "phyrexian",
};

/** Libellé d'une impression dans le menu « Illustration » : « STA 42 · Strixhaven Mystical Archive · 2021 · japonais ». */
function printingLabel(p: PrintingOption): string {
  if (p.key === CUSTOM_PRINTING) return "Illustration personnelle";
  const info = SET_BY_CODE[p.set];
  const setName = info ? (info.nameFr ?? info.name) : p.setName;
  return [`${p.set} ${p.number}`, setName, p.year, p.lang && (PRINT_LANGS[p.lang] ?? p.lang)].filter(Boolean).join(" · ");
}

/**
 * Impressions proposées pour une carte : toutes celles de la table une fois chargée ; avant, la carte et ses rééditions
 * (et l'impression déjà choisie).
 */
function printingChoices(
  c: CardDef,
  key: string | undefined,
  table: PrintingTable | undefined,
  custom: boolean,
): PrintingOption[] {
  const out: PrintingOption[] = table?.printingOptions(c) ?? [
    { set: c.set ?? "", number: c.number ?? "" },
    ...(c.printings ?? []).map((p) => ({ key: p.key, set: p.set, number: p.number })),
  ];
  // Illustration personnelle (dossier local du serveur, images.ts) : proposée si le serveur en a une, ou déjà choisie.
  if (custom || key === CUSTOM_PRINTING) out.push({ key: CUSTOM_PRINTING, set: "", number: "" });
  const chosen = key && !out.some((p) => p.key === key) ? keyedPrinting(key) : undefined;
  return chosen ? [...out, { key, set: chosen.set, number: chosen.number }] : out;
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
  /** Cartes légales dans le format du deck seulement. */
  legalOnly: boolean;
  /** Commander : cartes dans l'identité de couleur du commandant seulement. */
  identityOnly: boolean;
  /** Extension (code de set), ou "" pour toutes. */
  set: string;
}

function matches(c: CardDef, f: Filters, format: Format, identity: Color[] | null): boolean {
  if (f.playableOnly && !c.implemented) return false;
  if (f.legalOnly && legalityIssue(c, format)) return false;
  if (identity && f.identityOnly && !withinIdentity(colorIdentity(c), identity)) return false;
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
  // Recherche : mots libres, ou syntaxe à la Scryfall (t:, o:, c:, mv<=2…).
  if (f.query && !searchFilter(f.query)(c)) return false;
  return true;
}

function Collection({ deck, onChange }: { deck: DeckList; onChange: (name: string, delta: number) => void }) {
  const format = deck.format ?? DEFAULT_FORMAT;
  // Commander : identité du commandant (null tant qu'il n'y en a pas).
  const commanderNames = (deck.commander ?? []).map(([, n]) => n).join("|");
  const identity = useMemo(() => {
    if (format !== "commander" || !commanderNames) return null;
    const set = new Set(commanderNames.split("|").flatMap((n) => (CARDS[n] ? colorIdentity(CARDS[n]) : [])));
    return (["W", "U", "B", "R", "G"] as Color[]).filter((x) => set.has(x));
  }, [format, commanderNames]);
  const [f, setF] = useState<Filters>({
    colors: [],
    type: "",
    mv: "",
    rarity: "",
    query: "",
    playableOnly: true,
    legalOnly: true,
    identityOnly: true,
    set: "",
  });
  // Filtres différés : la saisie reste fluide pendant que la grille se recalcule.
  const deferred = useDeferredValue(f);
  const cards = useMemo(() => POOL.filter((c) => matches(c, deferred, format, identity)), [deferred, format, identity]);
  // Rendu progressif (plus de 5 000 cartes) : une page, puis la suivante à l'approche du bas de la grille.
  // Le nombre de cartes affichées est lié à la liste filtrée : un nouveau filtre repart d'une page.
  const [more, setMore] = useState<{ of: CardDef[]; n: number }>({ of: cards, n: PAGE });
  const shown = more.of === cards ? more.n : PAGE;
  const current = useRef(cards);
  current.current = cards;
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        setMore((m) => ({ of: current.current, n: (m.of === current.current ? m.n : PAGE) + PAGE }));
      },
      { rootMargin: "600px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const inDeck = (name: string) =>
    (deck.main.find((e) => e[1] === name)?.[0] ?? 0) +
    (deck.sideboard?.find((e) => e[1] === name)?.[0] ?? 0) +
    (deck.commander?.find((e) => e[1] === name)?.[0] ?? 0);
  const toggleColor = (c: string) =>
    setF((x) => ({ ...x, colors: x.colors.includes(c) ? x.colors.filter((y) => y !== c) : [...x.colors, c] }));
  return (
    <section className="collection">
      <div className="filters">
        <input
          className="search"
          placeholder="Rechercher : nom, type, texte ; t:créature o:pioche c:wu mv<=2 -r:rare"
          title="Mots libres (FR ou EN), ou t: type, o: texte, c: couleurs (c:c incolore, c:m multicolore), mv, pow, tou avec : = < > <= >=, r: rareté, s: extension ; guillemets pour plusieurs mots, - pour exclure"
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
          Légales en {FORMAT_LABELS[format]}
        </label>
        {identity && (
          <label className="toggle" title="Seulement les cartes dans l'identité de couleur du commandant">
            <input type="checkbox" checked={f.identityOnly} onChange={(e) => setF({ ...f, identityOnly: e.target.checked })} />
            Identité du commandant
          </label>
        )}
        <select value={f.set} onChange={(e) => setF({ ...f, set: e.target.value })} aria-label="Extension">
          <option value="">Toutes les extensions</option>
          <optgroup label="Standard">
            {SETS.filter((s) => !s.reprint && !s.byName).map((s) => (
              <option key={s.code} value={s.code}>
                {s.nameFr}
              </option>
            ))}
          </optgroup>
          {/* Rééditions (PLAN-G) : hors Standard, jouables en « Sans limite ». */}
          <optgroup label="Rééditions (Sans limite)">
            {SETS.filter((s) => s.reprint).map((s) => (
              <option key={s.code} value={s.code}>
                {s.nameFr}
              </option>
            ))}
          </optgroup>
          {/* Cartes des decks Commander (PLAN-E), importées par nom. */}
          <optgroup label="Commander">
            {SETS.filter((s) => s.byName).map((s) => (
              <option key={s.code} value={s.code}>
                {s.nameFr}
              </option>
            ))}
          </optgroup>
        </select>
        <span className="hint">
          {cards.length} cartes · {coverageHint(f.set)}
        </span>
      </div>
      <div className="collection-grid">
        {cards.slice(0, shown).map((c) => {
          const n = inDeck(c.name);
          const illegal = legalityTag(c, format);
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
        <div ref={sentinel} className="collection-sentinel" />
      </div>
    </section>
  );
}

/** Cartes affichées par page dans la collection (rendu progressif). */
const PAGE = 120;

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
  onPrinting,
  readOnly,
  format = DEFAULT_FORMAT,
  onCommander,
}: {
  entries: DeckEntries;
  onChange: (name: string, d: number) => void;
  onPrinting: (name: string, key: string | undefined) => void;
  readOnly: boolean;
  format?: Format;
  /** Commander : « définir comme commandant » (créatures légendaires du deck). */
  onCommander?: (name: string) => void;
}) {
  const lang = useGame((s) => s.lang);
  const setHover = useGame((s) => s.setHover);
  const table = usePrintings();
  const custom = useImages((s) => s.custom);
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
            {lines.map(([n, name, key]) => {
              const c = CARDS[name] as CardDef;
              const face = printedFace(cardFace(c), c, key);
              const illegal = legalityIssue(c, format);
              const choices = printingChoices(c, key, table, hasCustomArt(custom, name));
              const current = choices.find((p) => p.key === key);
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
                  {choices.length > 1 && (
                    <select
                      className={`deck-line-art ${key ? "on" : ""}`}
                      value={key ?? ""}
                      disabled={readOnly}
                      title={`Illustration : ${current ? printingLabel(current) : "?"}`}
                      aria-label={`Illustration de ${faceName(face, lang)}`}
                      onChange={(e) => {
                        const next = e.target.value || undefined;
                        onPrinting(name, next);
                        setHover({ face: printedFace(cardFace(c), c, next) });
                      }}
                    >
                      {choices.map((p) => (
                        <option key={p.key ?? ""} value={p.key ?? ""}>
                          {printingLabel(p)}
                        </option>
                      ))}
                    </select>
                  )}
                  {!readOnly && (
                    <span className="deck-line-btns">
                      {onCommander && canBeCommander(c) && (
                        <button
                          type="button"
                          className="btn small"
                          onClick={() => onCommander(name)}
                          title="Définir comme commandant"
                          aria-label={`Définir ${faceName(face, lang)} comme commandant`}
                        >
                          ♛
                        </button>
                      )}
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
  const [tab, setTab] = useState<"main" | "side" | "commander">("main");
  const [modal, setModal] = useState<"import" | "export" | null>(null);
  const select = (id: string | null) => useGame.setState({ editingDeck: id });

  const deck = decks.find((d) => d.id === editing) ?? decks.find((d) => !d.builtin) ?? decks[0];
  if (!deck) return null;
  const readOnly = !!deck.builtin;
  // Un deck se valide dans son format (Standard par défaut ; Commander : PLAN-E).
  const format = deck.format ?? DEFAULT_FORMAT;
  const v = validateDeck(deck, CARDS, format);
  const formatLabel = FORMAT_LABELS[v.format];
  const isCommander = format === "commander";
  // Onglet de la réserve en Commander : celui du commandant (et inversement).
  const shownTab = isCommander && tab === "side" ? "commander" : !isCommander && tab === "commander" ? "side" : tab;

  const change = (name: string, delta: number) => {
    if (readOnly) {
      notify("Deck préconstruit : dupliquez-le pour le modifier.");
      return;
    }
    const c = CARDS[name];
    const total =
      (deck.main.find((e) => e[1] === name)?.[0] ?? 0) +
      (deck.sideboard?.find((e) => e[1] === name)?.[0] ?? 0) +
      (deck.commander?.find((e) => e[1] === name)?.[0] ?? 0);
    // Commander : un seul exemplaire de chaque carte (sauf les terrains de base).
    const max = isCommander ? 1 : 4;
    if (delta > 0 && !isBasic(c) && total >= max) {
      notify(isCommander ? `${name} : un seul exemplaire en Commander.` : `${name} : 4 exemplaires maximum.`);
      return;
    }
    if (shownTab === "commander") {
      // Retirer le commandant le remet dans le deck.
      if (delta < 0) save({ ...deck, commander: withCount(deck.commander ?? [], name, -1), main: withCount(deck.main, name, 1) });
      return;
    }
    if (shownTab === "main") save({ ...deck, main: withCount(deck.main, name, delta) });
    else save({ ...deck, sideboard: withCount(deck.sideboard ?? [], name, delta) });
  };
  /** Commander : la carte devient le commandant ; l'ancien commandant revient dans le deck. */
  const setCommander = (name: string) => {
    if (readOnly) return;
    let main = withCount(deck.main, name, -1);
    for (const [n, old] of deck.commander ?? []) main = withCount(main, old, n);
    save({ ...deck, commander: [[1, name]], main });
  };
  /** Format du deck (un deck préconstruit garde le sien). */
  const setFormat = (f: Format) => {
    if (readOnly) return;
    save({ ...deck, format: f === DEFAULT_FORMAT ? undefined : f });
  };
  /** L'illustration d'une carte vaut pour le deck et la réserve. */
  const choosePrinting = (name: string, key: string | undefined) => {
    if (readOnly) return;
    save({ ...deck, main: withPrinting(deck.main, name, key), sideboard: withPrinting(deck.sideboard ?? [], name, key) });
  };
  const opponent = decks.find(
    (d) =>
      d.id !== deck.id &&
      validateDeck(d, CARDS, d.format ?? DEFAULT_FORMAT).playable &&
      (d.format ?? DEFAULT_FORMAT) === (deck.format ?? DEFAULT_FORMAT),
  );

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
          <>
            <input
              className="deck-name-input"
              value={deck.name}
              onChange={(e) => save({ ...deck, name: e.target.value })}
              aria-label="Nom du deck"
            />
            <select value={format} onChange={(e) => setFormat(e.target.value as Format)} aria-label="Format du deck">
              {FORMATS.map((f) => (
                <option key={f} value={f}>
                  {FORMAT_LABELS[f]}
                </option>
              ))}
            </select>
          </>
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
            onClick={() =>
              opponent &&
              startGame(
                deck.main,
                [opponent.main],
                undefined,
                undefined,
                undefined,
                isCommander ? { player: deck.commander ?? [], ai: [opponent.commander ?? []] } : undefined,
              )
            }
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
            <button type="button" className={shownTab === "main" ? "on" : ""} onClick={() => setTab("main")}>
              Deck{" "}
              <strong
                className={isCommander ? (v.mainCount === v.minMain ? "ok" : "short") : v.mainCount >= v.minMain ? "ok" : "short"}
              >
                {v.mainCount}
              </strong>
              /{v.minMain}
            </button>
            {isCommander ? (
              <button
                type="button"
                className={shownTab === "commander" ? "on" : ""}
                onClick={() => setTab("commander")}
                title="Le commandant compte dans les 100 cartes"
              >
                Commandant <strong>{v.commanders?.length ? "♛" : "—"}</strong>
              </button>
            ) : (
              <button type="button" className={shownTab === "side" ? "on" : ""} onClick={() => setTab("side")}>
                Réserve <strong>{v.sideCount}</strong>/15
              </button>
            )}
            <span
              className={`format-badge ${v.legal ? "ok" : "ko"}`}
              title={
                v.welcome
                  ? "Deck de bienvenue : 40 cartes, joué tel quel"
                  : v.legal
                    ? `Deck légal en ${formatLabel}`
                    : v.errors[0]
              }
            >
              {v.welcome ? "Bienvenue" : formatLabel} {v.legal ? "✓" : "✗"}
            </span>
          </div>
          {isCommander && (
            <div className="commander-summary" data-testid="commander-summary">
              {v.gameChangers && (
                <span
                  className="format-badge"
                  title={v.gameChangers.length ? `Game Changers : ${v.gameChangers.join(", ")}` : "Aucun Game Changer"}
                >
                  Game Changers : {v.gameChangers.length} · bracket estimé {v.bracket}
                  {deck.bracket ? ` · déclaré ${deck.bracket}` : ""}
                </span>
              )}
            </div>
          )}
          <Stats deck={deck} />
          <div className="deck-lines">
            <DeckLines
              entries={
                shownTab === "main" ? deck.main : shownTab === "commander" ? (deck.commander ?? []) : (deck.sideboard ?? [])
              }
              onChange={change}
              onPrinting={choosePrinting}
              readOnly={readOnly}
              format={format}
              onCommander={isCommander && shownTab === "main" ? setCommander : undefined}
            />
            {shownTab === "commander" && !deck.commander?.length && (
              <p className="hint">Choisissez une créature légendaire du deck avec le bouton ♛.</p>
            )}
            {(shownTab === "main" ? deck.main : shownTab === "side" ? (deck.sideboard ?? []) : [1]).length === 0 && (
              <p className="hint">
                Cliquez sur une carte de la collection pour l'ajouter{shownTab === "side" ? " à la réserve" : ""}.
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
            {v.playable && <div className="v-ok">Deck légal en {formatLabel} et jouable</div>}
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
            save({
              ...deck,
              main: d.main,
              sideboard: d.sideboard,
              ...(d.commander ? { commander: d.commander, format: "commander" as const } : {}),
            });
            setModal(null);
          }}
        />
      )}
      {modal === "export" && <ExportModal deck={deck} onClose={() => setModal(null)} />}
    </div>
  );
}
