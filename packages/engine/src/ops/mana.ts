import type { OpHandlers } from "../effects";
import { evalAmount, resolveRef } from "../effects";
import { bump, linkedColors } from "../layers";
import { chars } from "../state";
import { matchesObjectFilter } from "../targets";
import { msg } from "../text";
import type { ManaType } from "../types";

export const HANDLERS: OpHandlers = {
  addMana(s, _r, e, ctx) {
    const who = e.who ? resolveRef(s, ctx, e.who)[0] : ctx.controller;
    const pool = who ? s.players[who]?.manaPool : undefined;
    const times = e.times === undefined ? 1 : evalAmount(s, ctx, e.times);
    const pl = who ? s.players[who] : undefined;
    // Mana carrying an effect (Arena of Glory): pool entries marked with their source, so the effect applies when spent.
    if (e.rider && pl) {
      const units = e.mana.flatMap((type) =>
        Array.from({ length: times }, () => ({ type, rider: e.rider, source: ctx.sourceId })),
      );
      pl.restrictedMana = [...(pl.restrictedMana ?? []), ...units];
    } else if (pool) for (const m of e.mana) pool[m] += times;
    bump(s);
    return;
  },
  addManaChoice(s, r, e, ctx, key) {
    const answer = r.vars[key("color")];
    const options = e.colors ?? ["W", "U", "B", "R", "G"];
    const n = evalAmount(s, ctx, e.n);
    // "In any combination": the player divides the N mana among the colors.
    const split = !!e.combination && n > 1 && options.length > 1;
    const suggestedColor = options.includes("G") ? "G" : (options[0] as string);
    if (!answer && split) {
      return {
        ask: {
          player: ctx.controller,
          key: key("color"),
          request: {
            type: "divide",
            intent: "manaColor",
            prompt: msg("Divide the {n} mana among the colors", { n }),
            among: options,
            total: n,
            labels: { W: msg("White"), U: msg("Blue"), B: msg("Black"), R: msg("Red"), G: msg("Green") },
            suggested: options.map((o) => (o === suggestedColor ? n : 0)),
          },
        },
      };
    }
    if (!answer) {
      return {
        ask: {
          player: ctx.controller,
          key: key("color"),
          request: {
            type: "pick",
            intent: "manaColor",
            prompt: msg("Choose the color of the mana"),
            options,
            labels: { W: msg("White"), U: msg("Blue"), B: msg("Black"), R: msg("Red"), G: msg("Green") },
            min: 1,
            max: 1,
            suggested: [options.includes("G") ? "G" : (options[0] as string)],
          },
        },
      };
    }
    const pl = s.players[ctx.controller];
    // Type of each mana: the division, otherwise the chosen color for all of it.
    const units: ManaType[] = split
      ? options.flatMap((o, i) => Array.from({ length: Math.max(0, Number(answer[i] ?? 0)) }, () => o))
      : Array.from({ length: Math.max(0, n) }, () => String(answer[0]) as ManaType);
    const restriction = e.restriction;
    if (pl && restriction) {
      const keep = e.keep ? { keep: true } : {};
      pl.restrictedMana = [...(pl.restrictedMana ?? []), ...units.map((type) => ({ type, restriction, ...keep }))];
    } else if (pl) {
      for (const type of units) {
        pl.manaPool[type] += 1;
        // "Until end of turn, you don't lose this mana as steps and phases end" (Branch of Vitu-Ghazi).
        if (e.keep) {
          pl.manaKeep ??= {};
          pl.manaKeep[type] = (pl.manaKeep[type] ?? 0) + 1;
        }
      }
    }
    bump(s);
    return;
  },
  addManaColorsAmong(s, _r, e, ctx) {
    const pool = s.players[ctx.controller]?.manaPool;
    if (!pool) return;
    // Sunbird Effigy: the colors among the cards linked to the source (exiled to craft it).
    const colors = new Set(
      e.linked
        ? linkedColors(s, s.objects[ctx.sourceId]?.linked)
        : s.battlefield
            .filter((id) => matchesObjectFilter(s, ctx.controller, id, e.filter, ctx.sourceId))
            .flatMap((id) => chars(s, id).colors),
    );
    for (const c of colors) pool[c] += 1;
    bump(s);
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
    bump(s);
    return;
  },
};
