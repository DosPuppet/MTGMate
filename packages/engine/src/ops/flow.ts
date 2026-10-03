/** Effets du moteur : contrôle du déroulement (si, peut, réflexif, retardé). Chaque clé est un `op` d'`Effect` (voir `runEffect`, effects.ts). */
import { canForage, forage, payLife } from "../actions";
import type { OpHandlers } from "../effects";
import { evalAmount, evalCondition, nameOf, resolveRef, store } from "../effects";
import { RulesError } from "../errors";
import { canPay, manaValue, payMana } from "../mana";
import { collectEvidence, pickEvidence } from "../stack";
import { bent, isPlayer } from "../state";
import { createDelayed, pushInline } from "../triggers";
import type { ChoiceValue, ObjectFilter } from "../types";

export const HANDLERS: OpHandlers = {
  mayPay(s, r, e, ctx, key) {
    // Maîtrise de l'eau : artefacts et créatures dégagés paient {1} chacun.
    const purpose = e.waterbend ? { waterbend: Number.POSITIVE_INFINITY } : undefined;
    if (!canPay(s, ctx.controller, e.cost, undefined, purpose)) return { skip: e.skip };
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
    if (answer[0] !== 1 || !canPay(s, ctx.controller, e.cost, undefined, purpose)) return { skip: e.skip };
    if (e.life && (s.players[ctx.controller]?.life ?? 0) < e.life) return { skip: e.skip };
    payMana(s, ctx.controller, e.cost, undefined, purpose);
    if (e.waterbend) bent(s, ctx.controller, "water");
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
  collectEvidence(s, r, e, ctx, key) {
    const excluded = new Set(e.exclude ? resolveRef(s, ctx, e.exclude) : []);
    const mv = (id: string) => manaValue(s.defs[s.objects[id]?.defId ?? ""]?.manaCost);
    const pool = (s.players[ctx.controller]?.graveyard ?? []).filter((id) => !excluded.has(id)).sort((a, b) => mv(b) - mv(a));
    const total = pool.reduce((n, id) => n + mv(id), 0);
    let n: number;
    if (e.n === undefined) {
      // Réunir des preuves X : X choisi (0 : rien).
      const answer = r.vars[key("x")];
      if (!answer) {
        if (total <= 0) return { skip: e.skip };
        return {
          ask: {
            player: ctx.controller,
            key: key("x"),
            request: {
              type: "number",
              intent: "payX",
              prompt: `${nameOf(s, ctx.sourceId)} : réunir des preuves X (0 : non) ?`,
              min: 0,
              max: total,
              suggested: [total],
            },
          },
        };
      }
      n = Math.min(total, Math.max(0, Number(answer[0])));
      if (n <= 0) return { skip: e.skip };
    } else {
      n = evalAmount(s, ctx, e.n);
      if (total < n) return { skip: e.skip };
      const answer = r.vars[key("may")];
      if (!answer) {
        return {
          ask: {
            player: ctx.controller,
            key: key("may"),
            request: {
              type: "yesNo",
              intent: "may",
              prompt: `${nameOf(s, ctx.sourceId)} : réunir des preuves ${n} (exiler des cartes de votre cimetière de valeur de mana totale ${n} ou plus) ?`,
              suggested: [1],
            },
          },
        };
      }
      if (answer[0] !== 1) return { skip: e.skip };
    }
    collectEvidence(s, ctx.controller, pickEvidence(s, pool, n) ?? []);
    store(r, e.store, n);
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
  reflexive(s, r, e, ctx) {
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
    // Fire Lord Sozin : « de valeur de mana totale X ou moins » (évaluée maintenant).
    const targets2 = targets.map((t) =>
      t.maxTotalManaValueAmount === undefined
        ? t
        : { ...t, maxTotalManaValue: evalAmount(s, ctx, t.maxTotalManaValueAmount), maxTotalManaValueAmount: undefined },
    );
    // Aucune cible possible (X = 0) : rien ne se passe.
    if (targets2.some((t) => t.count === 0)) return;
    const bound: Record<string, string[]> = {};
    for (const [k, r] of Object.entries(e.bind ?? {})) bound[k] = resolveRef(s, ctx, r);
    const vars = e.keepVars ? Object.fromEntries(e.keepVars.map((k) => [`$${k}`, r.vars[`$${k}`] ?? []])) : undefined;
    pushInline(s, ctx.controller, ctx.sourceId, ctx.sourceDefId, {
      targets: targets2,
      effects: e.effects,
      bound,
      ...(vars ? { vars } : {}),
    });
    return;
  },
  chooseOption(s, r, e, ctx, key) {
    const answer = r.vars[key("option")];
    const options = e.labels.map((_, i) => String(i));
    if (!answer) {
      return {
        ask: {
          player: ctx.controller,
          key: key("option"),
          request: {
            type: "pick",
            intent: "other",
            prompt: `${nameOf(s, ctx.sourceId)} : ${e.prompt}`,
            options,
            labels: Object.fromEntries(e.labels.map((l, i) => [String(i), l])),
            min: 1,
            max: 1,
            suggested: ["0"],
          },
        },
      };
    }
    const i = options.indexOf(String(answer[0]));
    if (i < 0) throw new RulesError("Option inconnue");
    store(r, e.store, i + 1);
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
