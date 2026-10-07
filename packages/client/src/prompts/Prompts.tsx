/** Fenêtres de choix : réservées aux vraies décisions (mulligan, modes, X, kicker, défausse…). */

import { type CostPick, costToText, type GameView, type ObjectView } from "@mtgx/engine";
import { useState } from "react";
import { Card, ManaCost } from "../board/Card";
import { faceName, type Lang } from "../i18n";
import { myActions, type PlayableOption, useGame } from "../store";
import { useTutorial } from "../tutorial/store";
import { ChoicePrompt } from "./ChoicePrompt";
import { SideboardEditor } from "./SideboardEditor";
import { ZoneTabbed } from "./ZoneTabs";

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
            {p.mulligans > 0 &&
              (p.bottom > 0
                ? `Si vous gardez, vous placerez ${p.bottom} carte(s) au-dessous de votre bibliothèque. `
                : "Premier mulligan gratuit (partie à plusieurs) : vous gardez les sept cartes. ")}
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

function XPicker({ max, min = 0 }: { max: number; min?: number }) {
  const chooseX = useGame((s) => s.chooseX);
  const cancel = useGame((s) => s.cancel);
  const [x, setX] = useState(max);
  return (
    <Modal title="Choisissez la valeur de X">
      <div className="x-picker">
        <input type="range" min={min} max={max} value={x} onChange={(e) => setX(Number(e.target.value))} />
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
  orSacrifice,
  minPower,
  powers,
  suggested,
  min,
  title,
}: {
  kind: "discard" | "sacrifice" | "tap" | "materials" | "bounce";
  count: number;
  options: string[];
  /** Équipage, monture : autant de créatures qu'on veut, de force totale au moins `minPower`. */
  minPower?: number;
  powers?: Record<string, number>;
  suggested?: string[];
  /** « … ou payez {3}{B} » (ou « 3 points de vie ») : on peut payer cela à la place. */
  orPay?: string;
  /** « Défaussez une carte ou sacrifiez un permanent » : les options comprennent des permanents. */
  orSacrifice?: boolean;
  /** Fabrication « un ou plusieurs » : au moins `min`, au plus `count`. */
  min?: number;
  /** Titre de la fenêtre, à la place du titre déduit de `kind`. */
  title?: string;
}) {
  const view = useGame((s) => s.view);
  const choose = useGame((s) => s.chooseAdditional);
  const cancel = useGame((s) => s.cancel);
  const [picked, setPicked] = useState<string[]>([]);
  if (!view) return null;
  const all = [...view.hand, ...view.battlefield, ...(view.players[view.viewer]?.graveyard ?? [])];
  const byPower = minPower !== undefined;
  const power = picked.reduce((n, id) => n + (powers?.[id] ?? 0), 0);
  const ready = byPower ? power >= minPower : picked.length >= (min ?? count) && picked.length <= count;
  const toggle = (id: string) =>
    setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : byPower || cur.length < count ? [...cur, id] : cur));
  return (
    <Modal
      title={
        title ??
        (kind === "discard" && orSacrifice
          ? "Coût additionnel : défaussez une carte ou sacrifiez un permanent"
          : kind === "discard"
            ? `Coût additionnel : défaussez ${count} carte(s)`
            : kind === "materials"
              ? `Fabrication : exilez ${min !== undefined && min !== count ? `de ${min} à ${count}` : count} matériau(x)`
              : kind === "tap" && byPower
                ? `Engagez des créatures de force totale ${minPower} ou plus`
                : kind === "tap"
                  ? `Coût : engagez ${count} créature(s)`
                  : `Coût additionnel : sacrifiez ${count} permanent(s)`)
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
        {suggested && (
          <button type="button" className="btn" onClick={() => setPicked(suggested)}>
            Suggestion
          </button>
        )}
        <button type="button" className="btn primary" disabled={!ready} onClick={() => choose(kind, picked)}>
          {byPower ? `Valider (force ${power}/${minPower})` : `Valider (${picked.length}/${count})`}
        </button>
      </div>
    </Modal>
  );
}

/**
 * Objets payés en coût (`CostPick`) : flétrir, retirer des marqueurs, exiler des cartes du cimetière, réunir des preuves,
 * sacrifier X permanents… La suggestion est le choix du moteur ; un objet peut revenir pour les marqueurs (`repeat`).
 */
function CostPickPicker({ pick }: { pick: CostPick }) {
  const view = useGame((s) => s.view);
  const choose = useGame((s) => s.choosePick);
  const cancel = useGame((s) => s.cancel);
  const [picked, setPicked] = useState<string[]>([]);
  if (!view) return null;
  const all = [...view.hand, ...view.battlefield, ...Object.values(view.players).flatMap((p) => p.graveyard), ...view.exile];
  const total = pick.minTotal ? picked.reduce((n, id) => n + (pick.minTotal?.values[id] ?? 0), 0) : 0;
  const ready =
    pick.atMost || (pick.optional && picked.length === 0)
      ? true
      : pick.minTotal
        ? total >= pick.minTotal.n
        : picked.length === pick.count;
  const times = (id: string) => picked.filter((x) => x === id).length;
  const toggle = (id: string) =>
    setPicked((cur) => {
      const max = pick.repeat?.[id] ?? 1;
      // Marqueurs : chaque clic en retire un de plus, jusqu'à épuisement, puis on recommence.
      if (pick.repeat && times(id) < max && cur.length < pick.count) return [...cur, id];
      if (cur.includes(id)) return cur.filter((x) => x !== id);
      return pick.minTotal || cur.length < pick.count ? [...cur, id] : cur;
    });
  return (
    <Modal title={`Coût : ${pick.label}`} wide>
      <div className="hand-picker">
        {pick.options.map((id) => {
          // Options qui ne sont pas des objets (sortes de marqueurs) : un bouton par option.
          const label = pick.labels?.[id];
          if (label)
            return (
              <div key={id} className="pick-slot">
                <button type="button" className={`btn choice${picked.includes(id) ? " primary" : ""}`} onClick={() => toggle(id)}>
                  {label}
                </button>
                {pick.repeat && times(id) > 0 && <span className="pick-count">×{times(id)}</span>}
              </div>
            );
          const o = all.find((x) => x.id === id);
          return o ? (
            <div key={id} className="pick-slot">
              <Card
                face={o}
                obj={o}
                width="var(--pick-w)"
                glow={picked.includes(id) ? "selected" : null}
                onClick={() => toggle(id)}
              />
              {pick.repeat && times(id) > 0 && <span className="pick-count">×{times(id)}</span>}
            </div>
          ) : null;
        })}
      </div>
      <div className="modal-actions">
        <button type="button" className="btn ghost" onClick={cancel}>
          Annuler
        </button>
        <button type="button" className="btn" onClick={() => setPicked(pick.suggested)}>
          Suggestion
        </button>
        <button
          type="button"
          className="btn primary"
          disabled={!ready}
          // Aucun objet choisi pour la convocation (et autres) : le paiement automatique décide.
          onClick={() => (pick.atMost && picked.length === 0 ? choose(pick.slot, undefined) : choose(pick.slot, picked))}
        >
          {pick.atMost
            ? picked.length
              ? `Valider (${picked.length})`
              : "Paiement automatique"
            : pick.minTotal
              ? `Valider (valeur ${total}/${pick.minTotal.n})`
              : pick.optional && picked.length === 0
                ? "Ne rien choisir"
                : `Valider (${picked.length}/${pick.count})`}
        </button>
      </div>
    </Modal>
  );
}

/** Cibles hors du champ de bataille (cartes dans un cimetière ou en exil) : choisies dans une fenêtre. */
function TargetCardPicker() {
  const view = useGame((s) => s.view);
  const casting = useGame((s) => s.casting);
  const pickTarget = useGame((s) => s.pickTarget);
  const confirmTargets = useGame((s) => s.confirmTargets);
  const chooseNoTarget = useGame((s) => s.chooseNoTarget);
  const cancel = useGame((s) => s.cancel);
  if (!view || !casting?.spec) return null;
  const spec = casting.spec;
  // Cartes d'un cimetière, ou exilées (Blade of the Swarm : « carte exilée avec la distorsion »).
  // Un onglet par cimetière (et l'exil) quand les cibles possibles sont dans plusieurs zones.
  const cards = [...Object.values(view.players).flatMap((p) => p.graveyard), ...view.exile];
  const options = cards.filter((o) => spec.legal.includes(o.id));
  const max = spec.count ?? 1;
  const picked = casting.picked ?? [];
  return (
    <Modal title={`Choisissez ${max > 1 ? `jusqu'à ${max} cibles` : "une cible"} : ${spec.label ?? "carte"}`} wide>
      <ZoneTabbed view={view} objects={options} ids={options.map((o) => o.id)} selected={picked}>
        {(shown) => (
          <div className="hand-picker">
            {options
              .filter((o) => shown.includes(o.id))
              .map((o) => (
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
        )}
      </ZoneTabbed>
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
  const chooseHybrid = useGame((s) => s.chooseHybrid);
  const choosePayMode = useGame((s) => s.choosePayMode);
  const cancel = useGame((s) => s.cancel);
  if (!casting) return null;
  const opt = casting.option;
  if (casting.stage === "mode" && opt.type === "cast") {
    // La carte lancée, à côté de ses modes (survolable : texte complet dans l'aperçu).
    const card = view && [...view.hand, ...view.playableElsewhere, ...view.battlefield].find((o) => o.id === opt.card);
    return (
      <Modal title="Choisissez un mode">
        <div className="mode-pick">
          {card && <Card face={card} obj={card} width="var(--mode-card-w)" hoverable />}
          <div className="choice-list">
            {opt.modes.map((m) => (
              <button key={m.index} type="button" className="btn choice" onClick={() => chooseMode(m.index)}>
                {m.label ?? `Mode ${m.index + 1}`}
              </button>
            ))}
          </div>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={cancel}>
            Annuler
          </button>
        </div>
      </Modal>
    );
  }
  if (casting.stage === "pick" && casting.pick) return <CostPickPicker key={casting.pick.slot} pick={casting.pick} />;
  if (casting.stage === "x" && opt.xMax !== null)
    return <XPicker max={opt.xMax} min={opt.type === "activate" ? (opt.xMin ?? 0) : 0} />;
  if (casting.stage === "target" && casting.spec && view) {
    const onBoard = new Set([...view.battlefield.map((o) => o.id), ...Object.keys(view.players), ...view.stack.map((x) => x.id)]);
    if (casting.spec.legal.some((id) => !onBoard.has(id))) return <TargetCardPicker />;
  }
  // Travail d'équipe : des créatures de force totale suffisante.
  if (casting.stage === "tap" && opt.type === "cast" && casting.kicked && opt.kickerTap) {
    const spec = opt.kickerTap;
    return (
      <AdditionalCostPicker
        kind="tap"
        count={spec.count}
        options={spec.options}
        minPower={spec.minPower}
        powers={spec.powers}
        suggested={spec.suggested}
        title={`Travail d'équipe : engagez des créatures de force totale ${spec.minPower} ou plus`}
      />
    );
  }
  // Harmonie : une créature facultative à engager, qui réduit le coût de sa force.
  if (casting.stage === "tap" && opt.type === "cast" && opt.additional?.tap) {
    const spec = opt.additional.tap;
    return (
      <AdditionalCostPicker
        kind="tap"
        count={spec.count}
        min={0}
        options={spec.options}
        powers={spec.powers}
        suggested={spec.suggested}
        title="Harmonie : engagez une créature pour réduire le coût de sa force (facultatif)"
      />
    );
  }
  if (casting.stage === "tap" && opt.type === "activate" && opt.additional?.tap) {
    const spec = opt.additional.tap;
    return (
      <AdditionalCostPicker
        kind="tap"
        count={spec.count}
        options={spec.options}
        minPower={spec.minPower}
        powers={spec.powers}
        suggested={spec.suggested}
      />
    );
  }
  if (casting.stage === "materials" && opt.type === "activate" && opt.additional?.materials) {
    const spec = opt.additional.materials;
    return (
      <AdditionalCostPicker kind="materials" count={spec.max} min={spec.min} options={spec.options} suggested={spec.suggested} />
    );
  }
  if (casting.stage === "sacrifice" && opt.type === "activate" && opt.additional?.sacrifice) {
    const spec = opt.additional.sacrifice;
    return <AdditionalCostPicker kind="sacrifice" count={spec.count} options={spec.options} />;
  }
  // Web-slinging (une créature engagée) ou faufilement (un attaquant non bloqué) : la créature à renvoyer en main.
  if (casting.stage === "bounce" && opt.type === "cast" && opt.altBounce) {
    const sneak = opt.altLabel?.startsWith("Faufilement");
    return (
      <AdditionalCostPicker
        kind="bounce"
        count={1}
        options={opt.altBounce}
        suggested={opt.altBounce.slice(0, 1)}
        title={
          sneak
            ? "Faufilement : choisissez l'attaquant non bloqué à renvoyer dans la main de son propriétaire"
            : "Web-slinging : choisissez la créature engagée à renvoyer dans la main de son propriétaire"
        }
      />
    );
  }
  // Marchandage (kicker sans mana) : le permanent à sacrifier.
  if (casting.stage === "sacrifice" && opt.type === "cast" && !opt.additional?.sacrifice && opt.kickerPermanents) {
    return (
      <AdditionalCostPicker
        kind="sacrifice"
        count={1}
        options={opt.kickerPermanents}
        suggested={opt.kickerPermanents.slice(0, 1)}
        title={opt.kickerPrompt ? `${opt.kickerPrompt.with} : choisissez le permanent` : "Kicker : choisissez le permanent"}
      />
    );
  }
  if ((casting.stage === "discard" || casting.stage === "sacrifice") && opt.type === "cast") {
    const spec = opt.additional?.[casting.stage];
    const sac = opt.additional?.sacrifice;
    const dis = opt.additional?.discard;
    const orPay =
      casting.stage === "sacrifice"
        ? sac?.orPayAffordable && sac.orPay
        : casting.stage === "discard" && dis?.orPayAffordable && dis.orPay;
    // Bitter Triumph : « défaussez une carte ou payez 3 points de vie ».
    const orLife = casting.stage === "discard" ? opt.additional?.discard?.orLife : undefined;
    if (spec) {
      return (
        <AdditionalCostPicker
          kind={casting.stage}
          count={spec.count}
          options={spec.options}
          orPay={orPay ? costToText(orPay) : orLife !== undefined ? `${orLife} points de vie` : undefined}
          orSacrifice={casting.stage === "discard" && !!opt.additional?.discard?.orSacrifice}
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
              {opt.altLabel ?? "Coût alternatif"}
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
  if (casting.stage === "hybrid" && casting.option.type === "cast") {
    const names: Record<string, string> = { W: "blanc", U: "bleu", B: "noir", R: "rouge", G: "vert" };
    return (
      <Modal title="Payer le mana hybride en…">
        <p className="hint">Le résultat du sort dépend du mana dépensé.</p>
        <div className="choice-list">
          {(casting.option.hybridColors ?? []).map((c) => (
            <button key={c} type="button" className="btn choice" onClick={() => chooseHybrid(c)}>
              <ManaCost cost={`{${c}}`} /> Tout en {names[c] ?? c}
            </button>
          ))}
          <button type="button" className="btn choice ghost" onClick={() => chooseHybrid("auto")}>
            Automatique
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
  if (casting.stage === "kicker") {
    // Progéniture et Cadeau (Bloomburrow) : même mécanisme, autres libellés.
    const labels = (casting.option.type === "cast" && casting.option.kickerPrompt) || {
      title: "Payer le kicker ?",
      without: "Sans kicker",
      with: "Avec kicker",
    };
    return (
      <Modal title={labels.title}>
        <div className="choice-list">
          <button type="button" className="btn choice" onClick={() => chooseKicker(false)}>
            {labels.without}
          </button>
          <button type="button" className="btn choice primary" onClick={() => chooseKicker(true)}>
            {labels.with}
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

/** Nom de la face lancée : l'aventure (ou autre face), sinon le recto de la carte (« A // B » → « A »). */
function faceLabel(source: ObjectView | undefined, face: string | undefined, lang: Lang): string {
  if (!source) return "";
  if (!face) return lang === "fr" && source.fr?.name ? source.fr.name : (source.name.split(" // ")[0] ?? source.name);
  // Fusion (702.102) : les deux moitiés, sous le nom complet de la carte.
  if (face === source.name) return (lang === "fr" && source.fr?.name) || face;
  const f = source.otherFaces?.find((x) => x?.name === face);
  return (lang === "fr" && f?.fr?.name) || face;
}

/** Types de terrain de base, pour le choix de Multiversal Passage. */
const LAND_TYPE_FR: Record<string, string> = {
  Plains: "Plaine",
  Island: "Île",
  Swamp: "Marais",
  Mountain: "Montagne",
  Forest: "Forêt",
};

function AbilityMenu() {
  const menu = useGame((s) => s.abilityMenu);
  const view = useGame((s) => s.view);
  const beginCasting = useGame((s) => s.beginCasting);
  const playLand = useGame((s) => s.playLand);
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
                Lancer {faceLabel(source, o.faceName, lang)}
                {o.warp ? " (distorsion)" : ""}
                {o.faceName && o.faceName === source?.name ? " — fusion, les deux moitiés" : ""}
                {/* Surcharge, fendre : le mode (et son coût) distingue les deux façons de lancer. */}
                {o.modes.length === 1 && o.modes[0]?.label ? ` — ${o.modes[0].label}` : ""}
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
          if (o.type === "playLand") {
            return (
              <button key={i} type="button" className="btn choice" onClick={() => playLand(o)}>
                {/* Pathways : chaque face terrain a son option. */}
                {menu.options.some((x) => x.type === "playLand" && x.back)
                  ? `Jouer ${faceLabel(source, o.faceName, lang)}`
                  : o.payLife
                    ? "Jouer ce terrain en payant 2 points de vie (dégagé)"
                    : menu.options.some((x) => x.type === "playLand" && x.payLife)
                      ? "Jouer ce terrain engagé"
                      : "Jouer ce terrain"}
                {o.landType ? ` — ${LAND_TYPE_FR[o.landType] ?? o.landType}` : ""}
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
        {menu.unavailable?.map((a, i) => (
          <button key={`off-${i}`} type="button" className="btn choice" disabled title="Mana, cible ou moment : pas maintenant">
            {a.label} — {a.cost ? `${a.cost} : ` : ""}impossible maintenant
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

/** Exil d'un joueur (ses cartes exilées), consultable par tous ; « exilée par … » quand un permanent la retient. */
function ExileViewer() {
  const open = useGame((s) => s.exileOpen);
  const view = useGame((s) => s.view);
  const close = useGame((s) => s.openExile);
  const lang = useGame((s) => s.lang);
  if (!open || !view) return null;
  const player = view.players[open];
  if (!player) return null;
  const cards = view.exile.filter((c) => c.owner === open);
  const playable = new Set(view.playableElsewhere.map((c) => c.id));
  const holder = new Map<string, string>();
  for (const [source, ids] of Object.entries(view.exiledWith ?? {})) {
    const src = view.battlefield.find((o) => o.id === source);
    if (src) for (const id of ids) holder.set(id, faceName(src, lang));
  }
  return (
    <div className="modal-backdrop" onClick={() => close(null)} onKeyDown={(e) => e.key === "Escape" && close(null)}>
      <div className="modal wide" role="dialog" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
        <h2>
          Exil — {open === view.viewer ? "vous" : player.name} ({cards.length})
        </h2>
        <div className="hand-picker">
          {cards.length === 0 && <p className="hint">Vide.</p>}
          {[...cards].reverse().map((c) => (
            <div key={c.uid} className="exile-entry">
              <Card face={c} obj={c} width="var(--pick-w)" glow={playable.has(c.id) ? "playable" : null} />
              {holder.has(c.id) && <span className="exile-holder">Exilée par {holder.get(c.id)}</span>}
            </div>
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
    <div className="modal-backdrop" onClick={() => close(null)} onKeyDown={(e) => e.key === "Escape" && close(null)}>
      <div className="modal wide" role="dialog" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
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

/** Score d'un match BO3, du point de vue du joueur (« 1 – 0 »), et son issue. */
function matchSummary(view: GameView): {
  bestOf: number;
  game: number;
  mine: number;
  theirs: number;
  decided: boolean;
  wonMatch: boolean;
} | null {
  const s = useGame.getState();
  const opp = view.opponents[0] ?? "";
  if (s.online?.match && s.online.match.bestOf > 1) {
    const m = s.online.match;
    const me = (s.online.seat ?? "p1") as "p1" | "p2";
    const them = me === "p1" ? "p2" : "p1";
    return {
      bestOf: m.bestOf,
      game: m.game,
      mine: m.wins[me] ?? 0,
      theirs: m.wins[them] ?? 0,
      decided: !!m.winner || s.online.status === "over",
      wonMatch: m.winner === me,
    };
  }
  const m = s.localMatch;
  if (!m) return null;
  return {
    bestOf: m.bestOf,
    game: m.game,
    mine: m.wins[view.viewer] ?? 0,
    theirs: m.wins[opp] ?? 0,
    decided: !!m.winner,
    wonMatch: m.winner === view.viewer,
  };
}

/**
 * Multijoueur : le joueur est éliminé mais la partie continue sans lui (800.4a) ; il peut regarder la fin ou quitter.
 */
function Eliminated({ view }: { view: GameView }) {
  const backToLobby = useGame((s) => s.backToLobby);
  const replay = useGame((s) => !!s.replay);
  if (view.over || replay || !view.players[view.viewer]?.lost) return null;
  return (
    <div className="eliminated-banner" role="status" data-testid="eliminated">
      <span>Vous avez été éliminé. La partie continue sans vous.</span>
      <button type="button" className="btn" onClick={backToLobby}>
        Quitter
      </button>
    </div>
  );
}

function GameOver({ view }: { view: GameView }) {
  const backToLobby = useGame((s) => s.backToLobby);
  const online = useGame((s) => s.online);
  const rematch = useGame((s) => s.rematch);
  const localMatch = useGame((s) => s.localMatch);
  const replay = useGame((s) => !!s.replay);
  const nextGame = useGame((s) => s.nextGame);
  // Tutoriel : le guide annonce lui-même la fin de la partie et propose la suite.
  const coached = useTutorial((t) => !!t.lessonId);
  if (!view.over || coached || replay) return null;
  const me = online?.players.find((p) => p.seat === online.seat);
  const opp = online?.players.find((p) => p.seat !== online.seat);
  // À plusieurs : la revanche attend que tous les autres joueurs, encore connectés, l'acceptent.
  const others = online?.players.filter((p) => p.seat !== online.seat) ?? [];
  const multi = others.length > 1;
  const othersConnected = others.every((p) => p.connected);
  const won = view.winner === view.viewer;
  const match = matchSummary(view);
  // BO3 en cours : réserve puis manche suivante (en ligne, statut « sideboard » envoyé par le serveur).
  const between = !!match && !match.decided && (online ? online.status === "sideboard" : true);
  const deckNow = online ? online.deck : localMatch?.deck;
  const original = online ? online.deck : localMatch?.original;
  return (
    <div className="modal-backdrop soft">
      <div className={`modal gameover ${won ? "won" : "lost"} ${between ? "wide" : ""}`}>
        <h2>
          {match?.decided
            ? match.wonMatch
              ? "Match gagné !"
              : match.mine === match.theirs
                ? "Match nul"
                : "Match perdu"
            : won
              ? "Victoire !"
              : view.winner
                ? "Défaite"
                : "Match nul"}
        </h2>
        {!won && view.winner && view.opponents.length > 1 && (
          <p className="match-score">{view.players[view.winner]?.name} gagne la partie.</p>
        )}
        {match && (
          <p className="match-score">
            Manche {match.game} · Score {match.mine} – {match.theirs} (au meilleur des {match.bestOf})
          </p>
        )}
        <p className="hint">
          Tour {view.turn.number} · Vous {view.players[view.viewer]?.life} PV
          {view.opponents.map((o) => ` · ${view.players[o]?.name} ${view.players[o]?.life} PV`).join("")}
        </p>
        {between && deckNow && original && (
          <SideboardEditor
            key={`${match?.game}`}
            start={deckNow}
            original={original}
            waiting={online && me?.ready ? `En attente de ${opp?.name ?? "l'adversaire"}…` : undefined}
            onSubmit={nextGame}
          />
        )}
        {online && !multi && opp?.rematch && !me?.rematch && <p className="hint">{opp.name} propose une revanche.</p>}
        {online && multi && others.some((p) => p.rematch) && !me?.rematch && (
          <p className="hint">
            {others
              .filter((p) => p.rematch)
              .map((p) => p.name)
              .join(", ")}{" "}
            {others.filter((p) => p.rematch).length > 1 ? "proposent" : "propose"} une revanche.
          </p>
        )}
        <div className="modal-actions">
          {online && !between && (
            <button
              type="button"
              className="btn primary"
              disabled={!!me?.rematch || !othersConnected}
              onClick={rematch}
              title={
                !othersConnected ? (multi ? "Un joueur a quitté la partie" : "Votre adversaire a quitté la partie") : undefined
              }
            >
              {me?.rematch ? `En attente ${multi ? "des autres joueurs" : `de ${opp?.name ?? "l'adversaire"}`}…` : "Revanche"}
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

/** Terrain joué avec une question « en arrivant, choisissez… » (Cavern of Souls : un type de créature). */
function LandChoice() {
  const option = useGame((s) => s.landChoice);
  const answer = useGame((s) => s.answerLandChoice);
  const [filter, setFilter] = useState("");
  const request = option?.choose;
  if (request?.type !== "pick") return null;
  const suggested = String(request.suggested[0] ?? "");
  const label = (v: string) => request.labels?.[v] ?? v;
  const shown = request.options
    .map(String)
    .filter((v) => !filter || label(v).toLowerCase().includes(filter.toLowerCase()))
    .sort((a, b) => (a === suggested ? -1 : b === suggested ? 1 : 0));
  return (
    <Modal title={request.prompt}>
      {request.options.length > 12 && (
        <input className="choice-filter" placeholder="Filtrer…" value={filter} onChange={(e) => setFilter(e.target.value)} />
      )}
      <div className="choice-list scroll">
        {shown.slice(0, 60).map((v) => (
          <button key={v} type="button" className={`btn choice ${v === suggested ? "suggested" : ""}`} onClick={() => answer(v)}>
            {label(v)}
            {v === suggested ? " (suggestion)" : ""}
          </button>
        ))}
      </div>
      <div className="modal-actions">
        <button type="button" className="btn ghost" onClick={() => answer(null)}>
          Annuler
        </button>
      </div>
    </Modal>
  );
}

/** Règle des légendaires : confirmation avant de lancer un légendaire dont vous contrôlez déjà un exemplaire. */
function LegendConfirm() {
  const pending = useGame((s) => s.legendConfirm);
  const confirm = useGame((s) => s.confirmLegend);
  const cancel = useGame((s) => s.cancelLegend);
  const view = useGame((s) => s.view);
  const lang = useGame((s) => s.lang);
  if (!pending || !view) return null;
  const existing = view.battlefield.find((o) => o.controller === view.viewer && o.name === pending.name);
  const shown = existing ? faceName(existing, lang) : pending.name;
  return (
    <Modal title="Règle des légendaires">
      <p className="legend-warning">
        Vous contrôlez déjà <strong>{shown}</strong>. Si vous lancez ce sort, vous devrez choisir lequel garder : l'autre ira au
        cimetière.
      </p>
      <div className="modal-actions">
        <button type="button" className="btn" onClick={cancel}>
          Annuler
        </button>
        <button type="button" className="btn primary" onClick={confirm}>
          Lancer quand même
        </button>
      </div>
    </Modal>
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
      <LegendConfirm />
      <LandChoice />
      <GraveyardViewer />
      <ExileViewer />
      <GameOver view={view} />
      <Eliminated view={view} />
    </>
  );
}
