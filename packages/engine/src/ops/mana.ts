import type { OpHandlers } from "../effects";
import { evalAmount } from "../effects";
import { linkedColors } from "../layers";
import { chars } from "../state";
import { matchesObjectFilter } from "../targets";
import type { ManaType } from "../types";

export const HANDLERS: OpHandlers = {
  addMana(s, _r, e, ctx) {
    const pool = s.players[ctx.controller]?.manaPool;
    const times = e.times === undefined ? 1 : evalAmount(s, ctx, e.times);
    if (pool) for (const m of e.mana) pool[m] += times;
    return;
  },
  addManaChoice(s, r, e, ctx, key) {
    const answer = r.vars[key("color")];
    const options = e.colors ?? ["W", "U", "B", "R", "G"];
    if (!answer) {
      return {
        ask: {
          player: ctx.controller,
          key: key("color"),
          request: {
            type: "pick",
            intent: "manaColor",
            prompt: "Choisissez la couleur du mana",
            options,
            labels: { W: "Blanc", U: "Bleu", B: "Noir", R: "Rouge", G: "Vert" },
            min: 1,
            max: 1,
            suggested: [options.includes("G") ? "G" : (options[0] as string)],
          },
        },
      };
    }
    const pl = s.players[ctx.controller];
    const type = String(answer[0]) as ManaType;
    const n = evalAmount(s, ctx, e.n);
    const restriction = e.restriction;
    if (pl && restriction) {
      pl.restrictedMana = [
        ...(pl.restrictedMana ?? []),
        ...Array.from({ length: Math.max(0, n) }, () => ({ type, restriction })),
      ];
    } else if (pl) {
      pl.manaPool[type] += n;
      // « Jusqu'à la fin du tour, vous ne perdez pas ce mana entre les étapes et phases » (Branch of Vitu-Ghazi).
      if (e.keep) {
        pl.manaKeep ??= {};
        pl.manaKeep[type] = (pl.manaKeep[type] ?? 0) + n;
      }
    }
    return;
  },
  addManaColorsAmong(s, _r, e, ctx) {
    const pool = s.players[ctx.controller]?.manaPool;
    if (!pool) return;
    // Sunbird Effigy : les couleurs parmi les cartes liées à la source (exilées pour la fabriquer).
    const colors = new Set(
      e.linked
        ? linkedColors(s, s.objects[ctx.sourceId]?.linked)
        : s.battlefield
            .filter((id) => matchesObjectFilter(s, ctx.controller, id, e.filter, ctx.sourceId))
            .flatMap((id) => chars(s, id).colors),
    );
    for (const c of colors) pool[c] += 1;
    return;
  },
  addManaUntilEndOfTurn(s, _r, e, ctx) {
    const pl = s.players[ctx.controller];
    if (!pl) return;
    if (e.untilEndOfCombat) pl.manaKeepCombat ??= {};
    else pl.manaKeep ??= {};
    const keep = (e.untilEndOfCombat ? pl.manaKeepCombat : pl.manaKeep) as Partial<Record<ManaType, number>>;
    const times = e.times === undefined ? 1 : Math.max(0, evalAmount(s, ctx, e.times));
    for (let i = 0; i < times; i++) {
      for (const m of e.mana) {
        pl.manaPool[m] += 1;
        keep[m] = (keep[m] ?? 0) + 1;
      }
    }
    return;
  },
};
