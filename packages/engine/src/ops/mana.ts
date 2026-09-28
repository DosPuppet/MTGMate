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
  extraMountainMana(s, _r, _e, ctx) {
    const pl = s.players[ctx.controller];
    if (pl)
      pl.extraMountainMana = {
        turn: s.turn.number,
        n: (pl.extraMountainMana?.turn === s.turn.number ? pl.extraMountainMana.n : 0) + 1,
      };
    return;
  },
  addManaChoice(s, r, e, ctx, key) {
    const answer = r.vars[key("color")];
    if (!answer) {
      return {
        ask: {
          player: ctx.controller,
          key: key("color"),
          request: {
            type: "pick",
            intent: "manaColor",
            prompt: "Choisissez la couleur du mana",
            options: ["W", "U", "B", "R", "G"],
            labels: { W: "Blanc", U: "Bleu", B: "Noir", R: "Rouge", G: "Vert" },
            min: 1,
            max: 1,
            suggested: ["G"],
          },
        },
      };
    }
    const pool = s.players[ctx.controller]?.manaPool;
    if (pool) pool[String(answer[0]) as ManaType] += evalAmount(s, ctx, e.n);
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
    pl.manaKeep ??= {};
    for (const m of e.mana) {
      pl.manaPool[m] += 1;
      pl.manaKeep[m] = (pl.manaKeep[m] ?? 0) + 1;
    }
    return;
  },
};
