/**
 * Choice of cards in several graveyards (and exile): one tab per zone instead of a mix. Without cards in at least two
 * zones, no tabs: all the options are shown.
 */
import type { GameView, ObjectView } from "@mtgx/engine";
import { useEffect, useState } from "react";
import { type Lang, textLang, tr } from "../translate";

export interface ZoneGroup {
  key: string;
  label: string;
  ids: string[];
}

/** Another player's graveyard: two French messages, the second with elision before a vowel ("d'Alice"). */
const graveyardOf = (name: string, lang: Lang) =>
  /^[aeiouy\u00e0\u00e2\u00e9\u00e8\u00ea\u00eb\u00ee\u00ef\u00f4\u00f6\u00fb\u00fch]/i.test(name)
    ? tr(lang, "ctx:elision|{name}'s graveyard", { name })
    : tr(lang, "{name}'s graveyard", { name });

/** Groups the options by graveyard (yours first, then the other players'), then exile and the rest. */
export function zoneGroups(view: GameView, objects: ObjectView[], ids: string[], lang: Lang = textLang()): ZoneGroup[] {
  const players = [view.viewer, ...Object.keys(view.players).filter((p) => p !== view.viewer)];
  const byId = new Map(objects.map((o) => [o.id, o]));
  const groups: ZoneGroup[] = players.map((p) => ({
    key: `gy:${p}`,
    label: p === view.viewer ? tr(lang, "Your graveyard") : graveyardOf(view.players[p]?.name ?? p, lang),
    ids: [],
  }));
  const exile: ZoneGroup = { key: "exile", label: tr(lang, "ctx:zone|Exile"), ids: [] };
  const other: ZoneGroup = { key: "other", label: tr(lang, "Others"), ids: [] };
  for (const id of ids) {
    const o = byId.get(id);
    if (o?.zone === "graveyard") groups.find((g) => g.key === `gy:${o.owner}`)?.ids.push(id) ?? other.ids.push(id);
    else if (o?.zone === "exile") exile.ids.push(id);
    else other.ids.push(id);
  }
  return [...groups, exile, other].filter((g) => g.ids.length > 0);
}

/**
 * Zone tabs for a list of options: returns the options of the shown tab and the tabs (null if there is only one zone).
 * The starting tab is the one of the first option already chosen, otherwise your graveyard, otherwise the first one.
 */
export function useZoneTabs(
  view: GameView,
  objects: ObjectView[],
  ids: string[],
  selected: string[],
  lang: Lang,
): { shown: string[]; tabs: React.ReactNode } {
  const groups = zoneGroups(view, objects, ids, lang);
  const initial = () => (groups.find((g) => g.ids.some((id) => selected.includes(id))) ?? groups[0])?.key ?? "";
  const [tab, setTab] = useState(initial);
  const signature = ids.join(",");
  // New question: back to the default tab.
  // biome-ignore lint/correctness/useExhaustiveDependencies: only the options count (not the current selection)
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
            {g.label} ({g.ids.length})
            {chosen > 0 ? ` · ${chosen > 1 ? tr(lang, "{n} cards chosen", { n: chosen }) : tr(lang, "1 card chosen")}` : ""}
          </button>
        );
      })}
    </div>
  );
  return { shown: current?.ids ?? ids, tabs };
}

/** Card options sorted by zone (tabs if they are in several graveyards or in exile). */
export function ZoneTabbed({
  view,
  objects,
  ids,
  selected,
  lang,
  children,
}: {
  view: GameView;
  objects: ObjectView[];
  ids: string[];
  selected: string[];
  /** Interface language (passed by the caller: this module stays free of the store, for its tests). */
  lang: Lang;
  children: (shown: string[]) => React.ReactNode;
}) {
  const { shown, tabs } = useZoneTabs(view, objects, ids, selected, lang);
  return (
    <>
      {tabs}
      {children(shown)}
    </>
  );
}
