/** Fenêtres de choix : réservées aux vraies décisions (mulligan, modes, X, kicker, défausse…). */
import { costToText, type GameView } from "@mtgx/engine";
import { useState } from "react";
import { Card } from "../board/Card";
import { faceName } from "../i18n";
import { myActions, type PlayableOption, useGame } from "../store";
import { ChoicePrompt } from "./ChoicePrompt";

function Modal({ title, children, wide }: { title: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="modal-backdrop">
      <div className={`modal ${wide ? "wide" : ""}`} role="dialog" aria-label={title}>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

function HandPicker({ view, selectable }: { view: GameView; selectable: boolean }) {
  const selection = useGame((s) => s.selection);
  const toggle = useGame((s) => s.toggleSelection);
  return (
    <div className="hand-picker">
      {view.hand.map((c) => (
        <Card
          key={c.uid}
          face={c}
          obj={c}
          width="var(--pick-w)"
          glow={selection.includes(c.id) ? "selected" : null}
          onClick={selectable ? () => toggle(c.id) : undefined}
        />
      ))}
    </div>
  );
}

function PendingPrompt({ view }: { view: GameView }) {
  const decide = useGame((s) => s.decide);
  const selection = useGame((s) => s.selection);
  const p = view.pending;
  if (!p || p.player !== view.viewer) return null;
  if (p.kind === "choice") return <ChoicePrompt view={view} />;
  switch (p.kind) {
    case "mulligan":
      return (
        <Modal title={p.mulligans === 0 ? "Votre main de départ" : `Mulligan ${p.mulligans} — nouvelle main`} wide>
          <HandPicker view={view} selectable={false} />
          <p className="hint">
            {p.mulligans > 0 && `Si vous gardez, vous placerez ${p.mulligans} carte(s) au-dessous de votre bibliothèque. `}
            Vous commencez {view.turn.active === view.viewer ? "la partie" : "en second"}.
          </p>
          <div className="modal-actions">
            <button type="button" className="btn" onClick={() => decide({ type: "mulligan" })}>
              Mulligan
            </button>
            <button type="button" className="btn primary" onClick={() => decide({ type: "keep" })}>
              Garder
            </button>
          </div>
        </Modal>
      );
    case "bottomCards":
    case "discard": {
      const title =
        p.kind === "discard"
          ? `Défaussez ${p.count} carte(s) (taille de main maximale : 7)`
          : `Choisissez ${p.count} carte(s) à placer au-dessous de votre bibliothèque`;
      return (
        <Modal title={title} wide>
          <HandPicker view={view} selectable />
          <div className="modal-actions">
            <button
              type="button"
              className="btn primary"
              disabled={selection.length !== p.count}
              onClick={() =>
                decide(p.kind === "discard" ? { type: "discard", cards: selection } : { type: "bottom", cards: selection })
              }
            >
              Valider ({selection.length}/{p.count})
            </button>
          </div>
        </Modal>
      );
    }
    default:
      return null;
  }
}

function XPicker({ max }: { max: number }) {
  const chooseX = useGame((s) => s.chooseX);
  const cancel = useGame((s) => s.cancel);
  const [x, setX] = useState(max);
  return (
    <Modal title="Choisissez la valeur de X">
      <div className="x-picker">
        <input type="range" min={0} max={max} value={x} onChange={(e) => setX(Number(e.target.value))} />
        <span className="x-value">X = {x}</span>
      </div>
      <div className="modal-actions">
        <button type="button" className="btn ghost" onClick={cancel}>
          Annuler
        </button>
        <button type="button" className="btn primary" onClick={() => chooseX(x)}>
          Valider
        </button>
      </div>
    </Modal>
  );
}

function AdditionalCostPicker({
  kind,
  count,
  options,
  orPay,
}: {
  kind: "discard" | "sacrifice";
  count: number;
  options: string[];
  /** « … ou payez {3}{B} » : on peut payer ce mana à la place. */
  orPay?: string;
}) {
  const view = useGame((s) => s.view);
  const choose = useGame((s) => s.chooseAdditional);
  const cancel = useGame((s) => s.cancel);
  const [picked, setPicked] = useState<string[]>([]);
  if (!view) return null;
  const all = [...view.hand, ...view.battlefield];
  const toggle = (id: string) =>
    setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.length < count ? [...cur, id] : cur));
  return (
    <Modal
      title={
        kind === "discard"
          ? `Coût additionnel : défaussez ${count} carte(s)`
          : `Coût additionnel : sacrifiez ${count} permanent(s)`
      }
      wide
    >
      <div className="hand-picker">
        {options.map((id) => {
          const o = all.find((x) => x.id === id);
          return o ? (
            <Card
              key={id}
              face={o}
              obj={o}
              width="var(--pick-w)"
              glow={picked.includes(id) ? "selected" : null}
              onClick={() => toggle(id)}
            />
          ) : null;
        })}
      </div>
      <div className="modal-actions">
        <button type="button" className="btn ghost" onClick={cancel}>
          Annuler
        </button>
        {orPay && (
          <button type="button" className="btn" onClick={() => choose(kind, [])}>
            Payer {orPay} à la place
          </button>
        )}
        <button type="button" className="btn primary" disabled={picked.length !== count} onClick={() => choose(kind, picked)}>
          Valider ({picked.length}/{count})
        </button>
      </div>
    </Modal>
  );
}

/** Cibles hors du champ de bataille (cartes dans un cimetière) : choisies dans une fenêtre. */
function TargetCardPicker() {
  const view = useGame((s) => s.view);
  const casting = useGame((s) => s.casting);
  const pickTarget = useGame((s) => s.pickTarget);
  const confirmTargets = useGame((s) => s.confirmTargets);
  const chooseNoTarget = useGame((s) => s.chooseNoTarget);
  const cancel = useGame((s) => s.cancel);
  if (!view || !casting?.spec) return null;
  const spec = casting.spec;
  const cards = Object.values(view.players).flatMap((p) => p.graveyard);
  const options = cards.filter((o) => spec.legal.includes(o.id));
  const max = spec.count ?? 1;
  const picked = casting.picked ?? [];
  return (
    <Modal title={`Choisissez ${max > 1 ? `jusqu'à ${max} cibles` : "une cible"} : ${spec.label ?? "carte"}`} wide>
      <div className="hand-picker">
        {options.map((o) => (
          <Card
            key={o.id}
            face={o}
            obj={o}
            width="var(--pick-w)"
            glow={picked.includes(o.id) ? "selected" : "target"}
            onClick={() => pickTarget(o.id)}
          />
        ))}
      </div>
      <div className="modal-actions">
        <button type="button" className="btn ghost" onClick={cancel}>
          Annuler
        </button>
        {spec.optional && max === 1 && (
          <button type="button" className="btn" onClick={chooseNoTarget}>
            Aucune cible
          </button>
        )}
        {max > 1 && (
          <button type="button" className="btn primary" disabled={picked.length === 0 && !spec.optional} onClick={confirmTargets}>
            Valider ({picked.length}/{max})
          </button>
        )}
      </div>
    </Modal>
  );
}

function CastingPrompt() {
  const casting = useGame((s) => s.casting);
  const view = useGame((s) => s.view);
  const chooseMode = useGame((s) => s.chooseMode);
  const chooseKicker = useGame((s) => s.chooseKicker);
  const choosePayMode = useGame((s) => s.choosePayMode);
  const cancel = useGame((s) => s.cancel);
  if (!casting) return null;
  const opt = casting.option;
  if (casting.stage === "mode" && opt.type === "cast") {
    return (
      <Modal title="Choisissez un mode">
        <div className="choice-list">
          {opt.modes.map((m) => (
            <button key={m.index} type="button" className="btn choice" onClick={() => chooseMode(m.index)}>
              {m.label ?? `Mode ${m.index + 1}`}
            </button>
          ))}
        </div>
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={cancel}>
            Annuler
          </button>
        </div>
      </Modal>
    );
  }
  if (casting.stage === "x" && opt.xMax !== null) return <XPicker max={opt.xMax} />;
  if (casting.stage === "target" && casting.spec && view) {
    const onBoard = new Set([...view.battlefield.map((o) => o.id), ...Object.keys(view.players), ...view.stack.map((x) => x.id)]);
    if (casting.spec.legal.some((id) => !onBoard.has(id))) return <TargetCardPicker />;
  }
  if (casting.stage === "sacrifice" && opt.type === "activate" && opt.additional?.sacrifice) {
    const spec = opt.additional.sacrifice;
    return <AdditionalCostPicker kind="sacrifice" count={spec.count} options={spec.options} />;
  }
  if ((casting.stage === "discard" || casting.stage === "sacrifice") && opt.type === "cast") {
    const spec = opt.additional?.[casting.stage];
    const sac = opt.additional?.sacrifice;
    const orPay = casting.stage === "sacrifice" && sac?.orPayAffordable && sac.orPay;
    if (spec) {
      return (
        <AdditionalCostPicker
          kind={casting.stage}
          count={spec.count}
          options={spec.options}
          orPay={orPay ? costToText(orPay) : undefined}
        />
      );
    }
  }
  if (casting.stage === "pay" && opt.type === "cast") {
    return (
      <Modal title="Comment payer ce sort ?">
        <div className="choice-list">
          {opt.normalAvailable && (
            <button type="button" className="btn choice" onClick={() => choosePayMode("normal")}>
              Payer son coût de mana
            </button>
          )}
          {(opt.freeAvailable || opt.free) && (
            <button type="button" className="btn choice primary" onClick={() => choosePayMode("free")}>
              Sans payer son coût de mana{opt.xMax !== null ? " (X = 0)" : ""}
            </button>
          )}
          {opt.altAvailable && (
            <button type="button" className="btn choice" onClick={() => choosePayMode("alt")}>
              Coût alternatif
            </button>
          )}
        </div>
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={cancel}>
            Annuler
          </button>
        </div>
      </Modal>
    );
  }
  if (casting.stage === "kicker") {
    return (
      <Modal title="Payer le kicker ?">
        <div className="choice-list">
          <button type="button" className="btn choice" onClick={() => chooseKicker(false)}>
            Sans kicker
          </button>
          <button type="button" className="btn choice primary" onClick={() => chooseKicker(true)}>
            Avec kicker
          </button>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={cancel}>
            Annuler
          </button>
        </div>
      </Modal>
    );
  }
  return null;
}

function AbilityMenu() {
  const menu = useGame((s) => s.abilityMenu);
  const view = useGame((s) => s.view);
  const beginCasting = useGame((s) => s.beginCasting);
  const decide = useGame((s) => s.decide);
  const cancel = useGame((s) => s.cancel);
  const lang = useGame((s) => s.lang);
  if (!menu || !view) return null;
  const source = [...view.battlefield, ...view.hand].find((o) => o.id === menu.sourceId);
  return (
    <Modal title={faceName(source, lang)}>
      <div className="choice-list">
        {menu.options.map((o, i) => {
          if (o.type === "cast") {
            return (
              <button key={i} type="button" className="btn choice" onClick={() => beginCasting(o, menu.sourceId)}>
                Lancer {faceName(source, lang)}
              </button>
            );
          }
          if (o.type === "activate") {
            return (
              <button key={i} type="button" className="btn choice" onClick={() => beginCasting(o, menu.sourceId)}>
                {o.label ?? "Activer la capacité"}
              </button>
            );
          }
          if (o.type === "tapForMana") {
            return o.colors.map((c) => (
              <button
                key={`${i}-${c}`}
                type="button"
                className="btn choice"
                onClick={() => decide({ type: "tapForMana", source: o.source, ability: o.ability, color: c })}
              >
                Ajouter {`{${c}}`}
              </button>
            ));
          }
          return null;
        })}
      </div>
      <div className="modal-actions">
        <button type="button" className="btn ghost" onClick={cancel}>
          Annuler
        </button>
      </div>
    </Modal>
  );
}

function GraveyardViewer() {
  const open = useGame((s) => s.graveyardOpen);
  const view = useGame((s) => s.view);
  const close = useGame((s) => s.openGraveyard);
  const beginCasting = useGame((s) => s.beginCasting);
  // Flashback : sorts lançables depuis le cimetière.
  // et capacités activées depuis le cimetière.
  const graveIds = new Set((view && open ? view.players[open]?.graveyard : [])?.map((c) => c.id));
  const castable = myActions(view).filter(
    (a): a is PlayableOption => (a.type === "cast" && !!a.fromGraveyard) || (a.type === "activate" && graveIds.has(a.source)),
  );
  const idOf = (a: PlayableOption) => (a.type === "cast" ? a.card : a.source);
  const flashback = new Set(castable.map(idOf));
  const castFromGraveyard = (id: string) => {
    const opt = castable.find((a) => idOf(a) === id);
    if (!opt) return;
    close(null);
    beginCasting(opt, id);
  };
  if (!open || !view) return null;
  const player = view.players[open];
  if (!player) return null;
  return (
    <div className="modal-backdrop" onClick={() => close(null)}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <h2>
          Cimetière — {open === view.viewer ? "vous" : player.name} ({player.graveyard.length})
        </h2>
        <div className="hand-picker">
          {player.graveyard.length === 0 && <p className="hint">Vide.</p>}
          {[...player.graveyard].reverse().map((c) => (
            <Card
              key={c.uid}
              face={c}
              obj={c}
              width="var(--pick-w)"
              glow={flashback.has(c.id) ? "playable" : null}
              onClick={flashback.has(c.id) ? () => castFromGraveyard(c.id) : undefined}
            />
          ))}
        </div>
        <div className="modal-actions">
          <button type="button" className="btn" onClick={() => close(null)}>
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}

function GameOver({ view }: { view: GameView }) {
  const backToLobby = useGame((s) => s.backToLobby);
  const online = useGame((s) => s.online);
  const rematch = useGame((s) => s.rematch);
  if (!view.over) return null;
  const me = online?.players.find((p) => p.seat === online.seat);
  const opp = online?.players.find((p) => p.seat !== online.seat);
  const won = view.winner === view.viewer;
  return (
    <div className="modal-backdrop soft">
      <div className={`modal gameover ${won ? "won" : "lost"}`}>
        <h2>{won ? "Victoire !" : view.winner ? "Défaite" : "Match nul"}</h2>
        <p className="hint">
          Tour {view.turn.number} · Vous {view.players[view.viewer]?.life} PV
          {view.opponents.map((o) => ` · ${view.players[o]?.name} ${view.players[o]?.life} PV`).join("")}
        </p>
        {online && opp?.rematch && !me?.rematch && <p className="hint">{opp.name} propose une revanche.</p>}
        <div className="modal-actions">
          {online && (
            <button
              type="button"
              className="btn primary"
              disabled={!!me?.rematch || !opp?.connected}
              onClick={rematch}
              title={!opp?.connected ? "Votre adversaire a quitté la partie" : undefined}
            >
              {me?.rematch ? `En attente de ${opp?.name ?? "l'adversaire"}…` : "Revanche"}
            </button>
          )}
          <button type="button" className={`btn ${online ? "" : "primary"}`} onClick={backToLobby}>
            {online ? "Quitter" : "Retour au menu"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function Prompts() {
  const view = useGame((s) => s.view);
  if (!view) return null;
  return (
    <>
      <PendingPrompt view={view} />
      <CastingPrompt />
      <AbilityMenu />
      <GraveyardViewer />
      <GameOver view={view} />
    </>
  );
}
