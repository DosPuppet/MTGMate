import { useEffect, useRef, useState } from "react";
import { SoundControl } from "../audio/SoundControl";
import { BOARD_THEMES } from "../boardThemes";
import { ImageRelayToggle } from "../ImageRelayToggle";
import { faceImage, faceName, faceText, faceType, KEYWORD_LABEL, type LogLine } from "../i18n";
import { imageUrl, useRelayActive } from "../images";
import { PACES, useGame } from "../store";
import { isTouch, justLongPressed } from "../touch";
import { ManaCost, RulesText } from "./Card";

/** Capacité « Vitesse maximale — » (702.179) dans le texte de la carte. */
const MAX_SPEED = /Max speed —|Vitesse maximale —/;

/** Aperçu d'une carte à « Vitesse maximale » : la capacité est-elle active pour son contrôleur ? */
function MaxSpeedNote({ speed }: { speed: number | undefined }) {
  const on = (speed ?? 0) >= 4;
  return (
    <div className={`preview-speed ${on ? "on" : ""}`}>
      ⚡ Vitesse maximale : {on ? "active" : `inactive (${speed === undefined ? "pas de vitesse" : `vitesse ${speed}/4`})`}
    </div>
  );
}

export function Preview() {
  const hover = useGame((s) => s.hover);
  const players = useGame((s) => s.view?.players);
  useRelayActive(); // nouvelle URL quand le relais des images s'active
  const lang = useGame((s) => s.lang);
  // Carte recto-verso : afficher le verso (touche F ou bouton).
  const [flipped, setFlipped] = useState(false);
  const backImage = hover?.face.otherFaces?.find((f) => f?.image);
  useEffect(() => {
    if (!backImage) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "f" || e.key === "F") setFlipped((x) => !x);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [backImage]);
  if (!hover)
    return (
      <div className="preview empty">
        {isTouch() ? "Appuyez longuement sur une carte pour l'agrandir." : "Survolez une carte pour l'agrandir."}
      </div>
    );
  const { face, obj } = hover;
  const back = flipped && backImage ? imageUrl((lang === "fr" && backImage.fr?.image) || backImage.image) : undefined;
  // Votre carte face cachée : vous seul voyez de quelle carte il s'agit.
  const hidden = obj?.faceDownCard;
  const src = back ?? (hidden ? faceImage(hidden, lang) : undefined) ?? faceImage(face, lang);
  const baseKw = new Set(obj?.keywords ?? []);
  return (
    <div className="preview">
      {src ? (
        <img className="preview-img" src={src} alt={faceName(face, lang)} />
      ) : (
        <div className={`preview-img token frame-${obj?.colors[0] ?? "C"}`}>
          <div className="token-name">{faceName(face, lang)}</div>
          <div className="token-type">{faceType(face, lang)}</div>
          <div className="token-text">{faceText(face, lang)}</div>
          {obj?.power !== undefined && (
            <div className="token-pt">
              {obj.power}/{obj.toughness}
            </div>
          )}
        </div>
      )}
      <div className="preview-info">
        <div className="preview-title">
          <span>{faceName(face, lang)}</span>
          <ManaCost cost={face.manaCost} size={14} />
        </div>
        <div className="preview-type">{faceType(face, lang)}</div>
        {obj && players && MAX_SPEED.test(`${face.text}\n${face.fr?.text ?? ""}`) && (
          <MaxSpeedNote speed={players[obj.controller]?.speed} />
        )}
        {/* Texte Oracle toujours affiché : illustrations sans cadre, éditions étrangères, petits caractères. */}
        {faceText(face, lang) && (
          <div className="preview-text">
            <RulesText text={faceText(face, lang)} />
          </div>
        )}
        {backImage && (
          <button type="button" className="btn small ghost preview-flip" onClick={() => setFlipped((x) => !x)}>
            {flipped ? "Voir le recto" : "Voir le verso"} (F)
          </button>
        )}
        {face.otherFaces?.map(
          (f) =>
            f && (
              // Autre face : verso, aventure, autre moitié d'une carte scindée.
              <div key={f.name} className="preview-prepare">
                <div className="preview-title">
                  <span>{(lang === "fr" && f.fr?.name) || f.name}</span>
                  {f.manaCost && <ManaCost cost={f.manaCost} size={14} />}
                </div>
                <div className="preview-type">{(lang === "fr" && f.fr?.typeLine) || f.typeLine}</div>
                <div className="preview-text">
                  <RulesText text={(lang === "fr" && f.fr?.text) || f.text} />
                </div>
              </div>
            ),
        )}
        {face.prepareFace && (
          // Carte « à préparer » : le sort attaché à la créature.
          <div className="preview-prepare">
            <div className="preview-title">
              <span>
                {(lang === "fr" && face.prepareFace.fr?.name) || face.prepareFace.name}{" "}
                <span className="hint">(sort préparé)</span>
              </span>
              <ManaCost cost={face.prepareFace.manaCost} size={14} />
            </div>
            <div className="preview-type">{(lang === "fr" && face.prepareFace.fr?.typeLine) || face.prepareFace.typeLine}</div>
            <div className="preview-text">
              <RulesText text={(lang === "fr" && face.prepareFace.fr?.text) || face.prepareFace.text} />
            </div>
          </div>
        )}
        {(obj?.classLevel || obj?.solved) && (
          <div className="preview-stats">{obj.solved ? "Affaire résolue" : `Classe de niveau ${obj.classLevel}`}</div>
        )}
        {obj?.power !== undefined && (
          <div className="preview-stats">
            Force/Endurance :{" "}
            <strong>
              {obj.power}/{obj.toughness}
            </strong>
            {obj.damage > 0 && <span className="dmg"> · {obj.damage} blessure(s)</span>}
            {Object.entries(obj.counters)
              .filter(([, n]) => n > 0)
              .map(([k, n]) => (
                <span key={k}>
                  {" "}
                  · {n} marqueur(s) {k}
                </span>
              ))}
          </div>
        )}
        {baseKw.size > 0 && (
          <div className="preview-kw">
            {[...baseKw].map((k) => (
              <span key={k} className="kw">
                {KEYWORD_LABEL[k]}
              </span>
            ))}
          </div>
        )}
        {obj?.sick && obj.types.includes("Creature") && <div className="preview-note">Mal d'invocation</div>}
        {!face.implemented && <div className="preview-warn">Pas encore gérée par le moteur</div>}
      </div>
    </div>
  );
}

/**
 * Texte d'une ligne du journal, les noms de cartes survolables (aperçu dans la barre latérale, gardé après le survol
 * comme pour les cartes du plateau ; au toucher, en surimpression).
 */
function LogText({ line }: { line: LogLine }) {
  const lang = useGame((s) => s.lang);
  const setHover = useGame((s) => s.setHover);
  const setPeek = useGame((s) => s.setPeek);
  const cards = line.cards ?? [];
  if (!cards.length) return <>{line.text}</>;
  const named = cards
    .map((face) => ({ face, label: faceName(face, lang) }))
    .filter((x) => x.label && line.text.includes(x.label))
    .sort((a, b) => b.label.length - a.label.length);
  if (!named.length) return <>{line.text}</>;
  const pattern = new RegExp(`(${named.map((x) => x.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`);
  return (
    <>
      {line.text.split(pattern).map((part, i) => {
        const hit = named.find((x) => x.label === part);
        if (!hit) return part;
        return (
          <button
            type="button"
            key={i}
            className="log-card"
            onMouseEnter={() => setHover({ face: hit.face })}
            onFocus={() => setHover({ face: hit.face })}
            onClick={() => isTouch() && setPeek({ face: hit.face })}
          >
            {part}
          </button>
        );
      })}
    </>
  );
}

function Log() {
  const log = useGame((s) => s.log);
  const ref = useRef<HTMLDivElement>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: défiler à chaque nouvelle ligne
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight });
  }, [log.length]);
  return (
    <div className="log" ref={ref}>
      {log.map((l) => (
        <div key={l.id} className={`log-line ${l.kind}`}>
          <LogText line={l} />
        </div>
      ))}
    </div>
  );
}

/** Rythme des effets : combien de temps chaque sort ou capacité qui se résout est montré avant de s'appliquer. */
/** « Abandonner » en deux temps : un clic par erreur ne fait pas perdre la partie. */
function ConcedeButton({ onConcede }: { onConcede: () => void }) {
  const [asking, setAsking] = useState(false);
  if (!asking)
    return (
      <button type="button" className="btn small ghost" onClick={() => setAsking(true)}>
        Abandonner
      </button>
    );
  return (
    <span className="concede-confirm">
      Abandonner la partie ?
      <button type="button" className="btn small danger" onClick={onConcede}>
        Confirmer
      </button>
      <button type="button" className="btn small ghost" onClick={() => setAsking(false)}>
        Non
      </button>
    </span>
  );
}

function PaceControl() {
  const pace = useGame((s) => s.pace);
  const setPace = useGame((s) => s.setPace);
  return (
    <div className="pace-control" title="Durée pendant laquelle chaque effet est montré avant de s'appliquer">
      <span>Effets</span>
      <div className="seg">
        {PACES.map((p) => (
          <button
            key={p.pace}
            type="button"
            className={pace === p.pace ? "on" : ""}
            title={p.hint}
            onClick={() => setPace(p.pace)}
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Texture du plateau : une pastille par texture, et « au hasard » (une texture tirée à chaque partie). */
function BoardThemeControl() {
  const choice = useGame((s) => s.boardTheme);
  const setChoice = useGame((s) => s.setBoardTheme);
  return (
    <div className="board-theme-control" title="Texture du plateau">
      <span>Plateau</span>
      <div className="swatches">
        {BOARD_THEMES.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`swatch ${choice === t.id ? "on" : ""}`}
            data-board={t.id}
            title={t.label}
            aria-label={`Plateau : ${t.label}`}
            aria-pressed={choice === t.id}
            onClick={() => setChoice(t.id)}
          />
        ))}
        <button
          type="button"
          className={`swatch random ${choice === "hasard" ? "on" : ""}`}
          title="Au hasard (une texture à chaque partie)"
          aria-label="Plateau : au hasard à chaque partie"
          aria-pressed={choice === "hasard"}
          onClick={() => setChoice("hasard")}
        >
          ?
        </button>
      </div>
    </div>
  );
}

function Settings() {
  const lang = useGame((s) => s.lang);
  const setLang = useGame((s) => s.setLang);
  const settings = useGame((s) => s.settings);
  const setFullControl = useGame((s) => s.setFullControl);
  const setHoldPriority = useGame((s) => s.setHoldPriority);
  const decide = useGame((s) => s.decide);
  const backToLobby = useGame((s) => s.backToLobby);
  const over = useGame((s) => s.view?.over);
  const online = useGame((s) => !!s.online);
  const tutorial = useGame((s) => s.tutorialGame);
  const replay = useGame((s) => !!s.replay);
  const exportGame = useGame((s) => s.exportGame);
  return (
    <div className="settings">
      <div className="seg">
        <button type="button" className={lang === "fr" ? "on" : ""} onClick={() => setLang("fr")}>
          FR
        </button>
        <button type="button" className={lang === "en" ? "on" : ""} onClick={() => setLang("en")}>
          EN
        </button>
      </div>
      <SoundControl />
      <label className="toggle" title="Recevoir la priorité à chaque étape, sans automatisme">
        <input type="checkbox" checked={settings.fullControl} onChange={(e) => setFullControl(e.target.checked)} />
        Contrôle total
      </label>
      <label className="toggle" title="Recevoir la priorité après avoir lancé un sort, pour y répondre vous-même">
        <input type="checkbox" checked={!!settings.holdPriority} onChange={(e) => setHoldPriority(e.target.checked)} />
        Garder la priorité
      </label>
      <PaceControl />
      <BoardThemeControl />
      <ImageRelayToggle />
      {!over && !replay && <ConcedeButton onConcede={() => decide({ type: "concede" })} />}
      {/* Enregistrement de la partie (replay, signalement d'un bug) ; en ligne, seulement une fois terminée. */}
      {!tutorial && !replay && (!online || over) && (
        <button
          type="button"
          className="btn small ghost"
          title="Télécharger la partie (fichier à revoir, ou à joindre au signalement d'un bug)"
          onClick={exportGame}
        >
          Exporter la partie
        </button>
      )}
      <button
        type="button"
        className="btn small ghost"
        onClick={() => {
          // En ligne, quitter une partie en cours vaut abandon.
          if (online && !over && !window.confirm("Quitter la partie en ligne ? Elle sera comptée comme un abandon.")) return;
          backToLobby();
        }}
      >
        Menu
      </button>
    </div>
  );
}

export function Sidebar() {
  const setDrawerOpen = useGame((s) => s.setDrawerOpen);
  return (
    <aside className="sidebar">
      <button type="button" className="drawer-close" onClick={() => setDrawerOpen(false)} aria-label="Fermer le panneau">
        ×
      </button>
      <Settings />
      <Preview />
      <div className="log-title">Journal</div>
      <Log />
    </aside>
  );
}

/** Écran tactile : carte agrandie par un appui long, en surimpression ; un tap n'importe où la ferme. */
export function TouchPreview() {
  const peek = useGame((s) => s.peek);
  const setPeek = useGame((s) => s.setPeek);
  if (!peek) return null;
  return (
    // Ni le clic qui termine l'appui long (il tombe sur la surimpression), ni les boutons de l'aperçu (autre face)
    // ne la ferment.
    <div
      className="touch-preview"
      onClick={(e) => !justLongPressed() && !(e.target as HTMLElement).closest("button") && setPeek(null)}
      onKeyDown={(e) => e.key === "Escape" && setPeek(null)}
    >
      <Preview />
    </div>
  );
}

/**
 * Écran étroit à la souris (sous 1 100 px, barre latérale en tiroir) : l'aperçu de la carte survolée suit le pointeur,
 * du côté où il y a la place. Il ne capte pas la souris.
 */
export function HoverPreview() {
  const hover = useGame((s) => s.hover);
  const drawerOpen = useGame((s) => s.drawerOpen);
  const lang = useGame((s) => s.lang);
  useRelayActive();
  const [narrow, setNarrow] = useState(() => window.matchMedia("(max-width: 1100px)").matches);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1100px)");
    const onChange = () => setNarrow(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  const active = narrow && !drawerOpen && !!hover && !isTouch();
  useEffect(() => {
    if (!active) return;
    const onMove = (e: MouseEvent) => setPos({ x: e.clientX, y: e.clientY });
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, [active]);
  if (!active || !hover || !pos) return null;
  const src = faceImage(hover.obj?.faceDownCard ?? hover.face, lang);
  if (!src) return null;
  const w = 240;
  const h = Math.round((w * 680) / 488);
  const left = pos.x + 24 + w < window.innerWidth ? pos.x + 24 : Math.max(8, pos.x - 24 - w);
  const top = Math.min(Math.max(8, pos.y - h / 2), window.innerHeight - h - 8);
  return <img className="hover-preview" src={src} alt={faceName(hover.face, lang)} style={{ left, top, width: w, height: h }} />;
}

/** Écran étroit : bouton qui ouvre la barre latérale (réglages, journal) en tiroir. */
export function DrawerToggle() {
  const open = useGame((s) => s.drawerOpen);
  const setDrawerOpen = useGame((s) => s.setDrawerOpen);
  return (
    <>
      <button type="button" className="drawer-toggle" onClick={() => setDrawerOpen(!open)} aria-label="Journal et réglages">
        ☰
      </button>
      {open && (
        <div
          className="drawer-scrim"
          onClick={() => setDrawerOpen(false)}
          onKeyDown={(e) => e.key === "Escape" && setDrawerOpen(false)}
        />
      )}
    </>
  );
}
