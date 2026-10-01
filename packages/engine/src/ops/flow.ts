/** Effets du moteur : contrôle du déroulement (si, peut, réflexif, retardé). Chaque clé est un `op` d'`Effect` (voir `runEffect`, effects.ts). */
import { canForage, forage, payLife } from "../actions";
import type { OpHandlers } from "../effects";
import { evalAmount, evalCondition, nameOf, resolveRef, store } from "../effects";
import { canPay, payMana } from "../mana";
import { isPlayer } from "../state";
import { createDelayed, pushInline } from "../triggers";
import type { ChoiceValue, ObjectFilter } from "../types";

export const HANDLERS: OpHandlers = {
  mayPay(s, r, e, ctx, key) {
    if (!canPay(s, ctx.controller, e.cost)) return { skip: e.skip };
    const answer = r.vars[key("pay")];
    if (!answer) {
      return {
        ask: {
          player: ctx.controller,
          key: key("pay"),
          request: { type: "yesNo", intent: "may", prompt: `${nameOf(s, ctx.sourceId)} : ${e.prompt}`, suggested: [1] },
        },
      };
    }
    if (answer[0] !== 1 || !canPay(s, ctx.controller, e.cost)) return { skip: e.skip };
    if (e.life && (s.players[ctx.controller]?.life ?? 0) < e.life) return { skip: e.skip };
    payMana(s, ctx.controller, e.cost);
    if (e.life) payLife(s, ctx.controller, e.life);
    return;
  },
  forage(s, r, e, ctx, key) {
    // « Vous pouvez fourrager. Si vous le faites, … » (701.61).
    if (!canForage(s, ctx.controller)) return { skip: e.skip };
    const answer = r.vars[key("forage")];
    if (!answer) {
      return {
        ask: {
          player: ctx.controller,
          key: key("forage"),
          request: {
            type: "yesNo",
            intent: "may",
            prompt: `${nameOf(s, ctx.sourceId)} : fourrager (exiler trois cartes de votre cimetière ou sacrifier une Nourriture) ?`,
            suggested: [1],
          },
        },
      };
    }
    if (answer[0] !== 1 || !forage(s, ctx.controller)) return { skip: e.skip };
    return;
  },
  if(s, _r, e, ctx) {
    return evalCondition(s, ctx, e.cond) ? undefined : { skip: e.skip };
  },
  delayed(s, _r, e, ctx) {
    const bound: Record<string, string[]> = {};
    for (const [k, ref] of Object.entries(e.bind ?? {})) bound[k] = resolveRef(s, ctx, ref);
    // Valeurs figées maintenant (« avec un marqueur de moins »), lues ensuite avec amount.v(nom).
    const vars: Record<string, ChoiceValue[]> = {};
    for (const [k, a] of Object.entries(e.vars ?? {})) vars[`$${k}`] = [evalAmount(s, ctx, a)];
    createDelayed(s, ctx.controller, ctx.sourceId, ctx.sourceDefId, { targets: [], effects: e.effects, bound, vars }, e.at);
    return;
  },
  reflexive(s, _r, e, ctx) {
    // « jusqu'à X cibles » : le nombre de cibles est évalué maintenant (Miasma Demon, The Rollercrusher Ride).
    const targets = e.targets
      .map((t) =>
        t.countAmount === undefined ? t : { ...t, count: Math.max(0, evalAmount(s, ctx, t.countAmount)), countAmount: undefined },
      )
      // Wishing Well : « de valeur de mana égale au nombre de marqueurs de pièce » (évaluée maintenant).
      .map((t) => {
        if (t.manaValueAmount === undefined) return t;
        const mv = evalAmount(s, ctx, t.manaValueAmount);
        const f = t.filter;
        const withMv = (o?: ObjectFilter) => (o ? { ...o, manaValue: mv } : o);
        return {
          ...t,
          manaValueAmount: undefined,
          filter: {
            ...f,
            objects: withMv(f.objects),
            cards: f.cards ? { ...f.cards, filter: { ...f.cards.filter, manaValue: mv } } : undefined,
          },
        };
      });
    // Aucune cible possible (X = 0) : rien ne se passe.
    if (targets.some((t) => t.count === 0)) return;
    const bound: Record<string, string[]> = {};
    for (const [k, r] of Object.entries(e.bind ?? {})) bound[k] = resolveRef(s, ctx, r);
    pushInline(s, ctx.controller, ctx.sourceId, ctx.sourceDefId, { targets, effects: e.effects, bound });
    return;
  },
  may(s, r, e, ctx, key) {
    // « [Ce joueur] peut… » : la question est posée au joueur désigné (un adversaire, Terrapact Intimidator).
    const asked = e.who ? (resolveRef(s, ctx, e.who).find((x) => isPlayer(s, x)) ?? ctx.controller) : ctx.controller;
    const answer = r.vars[key("may")];
    if (!answer) {
      return {
        ask: {
          player: asked,
          key: key("may"),
          request: { type: "yesNo", intent: "may", prompt: `${nameOf(s, ctx.sourceId)} : ${e.prompt}`, suggested: [1] },
        },
      };
    }
    if (e.store) store(r, e.store, answer[0] === 1 ? 1 : 0);
    return answer[0] === 1 ? undefined : { skip: e.skip };
  },
};
