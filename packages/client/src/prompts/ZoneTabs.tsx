/**
 * Choix de cartes dans plusieurs cimetières (et l'exil) : un onglet par zone au lieu d'un mélange. Sans cartes dans au
 * moins deux zones, pas d'onglets : toutes les options sont affichées.
 */
import type { GameView, ObjectView } from "@mtgx/engine";
import { useEffect, useState } from "react";

export interface ZoneGroup {
  key: string;
  label: string;
  ids: string[];
}

/** « de Bob », « d'Alice » (élision devant une voyelle). */
const ofName = (name: string) => (/^[aeiouyàâéèêëîïôöûüh]/i.test(name) ? `d'${name}` : `de ${name}`);

/** Regroupe les options par cimetière (le vôtre d'abord, puis les autres joueurs), puis l'exil et le reste. */
export function zoneGroups(view: GameView, objects: ObjectView[], ids: string[]): ZoneGroup[] {
  const players = [view.viewer, ...Object.keys(view.players).filter((p) => p !== view.viewer)];
  const byId = new Map(objects.map((o) => [o.id, o]));
  const groups: ZoneGroup[] = players.map((p) => ({
    key: `gy:${p}`,
    label: p === view.viewer ? "Votre cimetière" : `Cimetière ${ofName(view.players[p]?.name ?? p)}`,
    ids: [],
  }));
  const exile: ZoneGroup = { key: "exile", label: "Exil", ids: [] };
  const other: ZoneGroup = { key: "other", label: "Autres", ids: [] };
  for (const id of ids) {
    const o = byId.get(id);
    if (o?.zone === "graveyard") groups.find((g) => g.key === `gy:${o.owner}`)?.ids.push(id) ?? other.ids.push(id);
    else if (o?.zone === "exile") exile.ids.push(id);
    else other.ids.push(id);
  }
  return [...groups, exile, other].filter((g) => g.ids.length > 0);
}

/**
 * Onglets de zones pour une liste d'options : renvoie les options de l'onglet affiché et les onglets (null s'il n'y a
 * qu'une zone). L'onglet de départ est celui de la première option déjà choisie, sinon votre cimetière, sinon le premier.
 */
export function useZoneTabs(
  view: GameView,
  objects: ObjectView[],
  ids: string[],
  selected: string[],
): { shown: string[]; tabs: React.ReactNode } {
  const groups = zoneGroups(view, objects, ids);
  const initial = () => (groups.find((g) => g.ids.some((id) => selected.includes(id))) ?? groups[0])?.key ?? "";
  const [tab, setTab] = useState(initial);
  const signature = ids.join(",");
  // Nouvelle question : on repart de l'onglet par défaut.
  // biome-ignore lint/correctness/useExhaustiveDependencies: seules les options comptent (pas la sélection en cours)
  useEffect(() => setTab(initial()), [signature]);
  if (groups.length < 2) return { shown: ids, tabs: null };
  const current = groups.find((g) => g.key === tab) ?? groups[0];
  const tabs = (
    <div className="seg zone-tabs" role="tablist">
      {groups.map((g) => {
        const chosen = g.ids.filter((id) => selected.includes(id)).length;
        return (
          <button
            key={g.key}
            type="button"
            role="tab"
            aria-selected={g.key === current?.key}
            className={g.key === current?.key ? "on" : ""}
            onClick={() => setTab(g.key)}
          >
            {g.label} ({g.ids.length}){chosen > 0 ? ` · ${chosen} choisie${chosen > 1 ? "s" : ""}` : ""}
          </button>
        );
      })}
    </div>
  );
  return { shown: current?.ids ?? ids, tabs };
}

/** Options de cartes rangées par zone (onglets si elles sont dans plusieurs cimetières ou en exil). */
export function ZoneTabbed({
  view,
  objects,
  ids,
  selected,
  children,
}: {
  view: GameView;
  objects: ObjectView[];
  ids: string[];
  selected: string[];
  children: (shown: string[]) => React.ReactNode;
}) {
  const { shown, tabs } = useZoneTabs(view, objects, ids, selected);
  return (
    <>
      {tabs}
      {children(shown)}
    </>
  );
}
