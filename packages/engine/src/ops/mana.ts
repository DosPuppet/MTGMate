import type { OpHandlers } from "../effects";
import { evalAmount, resolveRef } from "../effects";
import { bump, linkedColors } from "../layers";
import { chars } from "../state";
import { matchesObjectFilter } from "../targets";
import type { ManaType } from "../types";

export const HANDLERS: OpHandlers = {
  addMana(s, _r, e, ctx) {
    const who = e.who ? resolveRef(s, ctx, e.who)[0] : ctx.controller;
    const pool = who ? s.players[who]?.manaPool : undefined;
    const times = e.times === undefined ? 1 : evalAmount(s, ctx, e.times);
    const pl = who ? s.players[who] : undefined;
    // Mana porteur d'un effet (Arena of Glory) : réserve marquée avec sa source, pour que l'effet s'applique à la dépense.
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
    // « En n'importe quelle combinaison » : le joueur répartit les N mana entre les couleurs.
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
            prompt: `Répartissez les ${n} mana entre les couleurs`,
            among: options,
            total: n,
            labels: { W: "Blanc", U: "Bleu", B: "Noir", R: "Rouge", G: "Vert" },
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
    // Type de chaque mana : la répartition, sinon la couleur choisie pour tous.
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
        // « Jusqu'à la fin du tour, vous ne perdez pas ce mana entre les étapes et phases » (Branch of Vitu-Ghazi).
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
    // Sunbird Effigy : les couleurs parmi les cartes liées à la source (exilées pour la fabriquer).
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
