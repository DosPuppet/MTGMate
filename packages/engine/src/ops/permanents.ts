/** Effets du moteur : modifications de permanents, contrôle, copies et jetons. Chaque clé est un `op` d'`Effect` (voir `runEffect`, effects.ts). */

import { createTokenCopy, createTokens, phaseOut, tokenCopyCount, tokenCopyReplacement } from "../actions";
import { addControlEffect } from "../control";
import type { OpHandlers } from "../effects";
import {
  addEffect,
  addPump,
  attach,
  attackingDefender,
  evalAmount,
  exiledUid,
  nameOf,
  nextTurnOf,
  resolveRef,
  store,
} from "../effects";
import { copiableExceptions, copiedDefId, mergeMods } from "../layers";
import { manaValue } from "../mana";
import {
  bump,
  chars,
  createObject,
  hasKeyword,
  isPlayer,
  newId,
  nextTimestamp,
  onBattlefield,
  opponentsOf,
  random,
  rulesEvent,
  snapshot,
} from "../state";
import { matchesCard, matchesObjectFilter } from "../targets";
import { createDelayed, onceKey } from "../triggers";
import { attackableDefenders } from "../turn";
import type { AbilityDef, CardDef, ChoiceRequest, Color, GameState, PlayerId } from "../types";
import { BASIC_LAND_TYPES } from "../types";

/** Types de créature toujours proposés quand un type est à choisir (tribus de Lorwyn et types les plus courants). */
/** Sous-types des jetons de créature que décrivent ces capacités (`token: { types, subtypes }` dans leurs effets). */
function tokenCreatureTypes(v: unknown, out: string[] = []): string[] {
  if (Array.isArray(v)) for (const x of v) tokenCreatureTypes(x, out);
  else if (v && typeof v === "object") {
    const o = v as { token?: { types?: string[]; subtypes?: string[] } };
    if (o.token?.types?.includes("Creature")) out.push(...(o.token.subtypes ?? []));
    for (const x of Object.values(v)) if (x && typeof x === "object") tokenCreatureTypes(x, out);
  }
  return out;
}

const COMMON_CREATURE_TYPES = [
  "Angel",
  "Beast",
  "Cat",
  "Dragon",
  "Elemental",
  "Elf",
  "Faerie",
  "Giant",
  "Goblin",
  "Human",
  "Kithkin",
  "Knight",
  "Merfolk",
  "Soldier",
  "Treefolk",
  "Vampire",
  "Warrior",
  "Wizard",
  "Zombie",
];

/**
 * 614.12 : la question « en arrivant, choisissez… » d'un permanent (type de créature, couleur, nom, nombre, mode…), avec
 * sa suggestion : pendant la résolution d'un sort de permanent, en jouant un terrain, ou quand un effet le met en jeu.
 * `preset` : les options imposées par l'effet.
 */
export function enterChoiceRequest(
  s: GameState,
  controller: PlayerId,
  sourceDefId: string,
  kind: NonNullable<CardDef["chooseOnEnter"]>,
  preset?: string[],
): ChoiceRequest {
  const ctx = { controller, sourceDefId };
  {
    let options: string[];
    if (preset) options = preset;
    else if (kind === "landType") options = [...BASIC_LAND_TYPES];
    // « Choisissez une couleur autre que le vert » (Thriving Grove) : les couleurs permises dans `enterModes`.
    else if (kind === "color") options = s.defs[ctx.sourceDefId]?.enterModes ?? ["W", "U", "B", "R", "G"];
    else if (kind === "parity") options = ["odd", "even"];
    // Talion, the Kindly Lord : un nombre de 1 à 10.
    else if (kind === "number") options = Array.from({ length: 10 }, (_, i) => String(i + 1));
    else if (kind === "mode") options = s.defs[ctx.sourceDefId]?.enterModes ?? [];
    else if (kind === "landName") {
      // Petrified Hamlet : un nom de carte de terrain, ceux des terrains adverses en tête (non de base d'abord).
      const opp = s.battlefield.filter((id) => s.objects[id]?.controller !== ctx.controller);
      const oppLands = opp.map((id) => s.defs[s.objects[id]?.defId ?? ""]).filter((d) => d?.types.includes("Land"));
      const lands = Object.values(s.defs).filter((d) => d.types.includes("Land") && !d.isToken);
      options = [
        ...new Set([
          ...oppLands.filter((d) => !d?.supertypes.includes("Basic")).map((d) => d?.name ?? ""),
          ...oppLands.map((d) => d?.name ?? ""),
          ...lands.map((d) => d.name).sort(),
        ]),
      ].filter(Boolean);
    } else if (kind === "cardName") {
      // Sorcerous Spyglass : on regarde la main d'un adversaire (ses cartes d'abord), puis on nomme une carte.
      const opp = opponentsOf(s, ctx.controller)[0];
      const inHand = (opp ? (s.players[opp]?.hand ?? []) : []).map((id) => s.defs[s.objects[id]?.defId ?? ""]?.name ?? "");
      const all = Object.values(s.defs)
        .filter((d) => !d.isToken)
        .map((d) => d.name);
      options = [...new Set([...inHand.filter(Boolean), ...s.battlefield.map((id) => chars(s, id).name), ...all.sort()])];
    } else {
      // Types des créatures connues de la partie (cartes, et jetons qu'elles créent : An Unexpected Party nomme les
      // Nains que créent ses jetons), et toujours les plus courants (un deck sans créature en a besoin).
      const set = new Set<string>(COMMON_CREATURE_TYPES);
      for (const d of Object.values(s.defs)) {
        if (d.types.includes("Creature")) for (const t of d.subtypes) set.add(t);
        for (const t of tokenCreatureTypes(d.abilities)) set.add(t);
      }
      options = [...set].sort();
    }
    // Suggestion : le type ou la couleur les plus présents chez le contrôleur.
    const tally = new Map<string, number>();
    const pl = s.players[ctx.controller];
    for (const id of [
      ...s.battlefield.filter((x) => s.objects[x]?.controller === ctx.controller),
      ...(pl?.hand ?? []),
      ...(pl?.library ?? []),
    ]) {
      const d = s.defs[s.objects[id]?.defId ?? ""];
      const keys = kind === "color" ? (d?.colors ?? []) : d?.types.includes("Creature") ? d.subtypes : [];
      for (const k of keys) tally.set(k, (tally.get(k) ?? 0) + 1);
    }
    // Type de terrain de base : le plus présent parmi les terrains du joueur (comme `defaultChoice`).
    const landCount = (t: string) =>
      s.battlefield.filter((id) => s.objects[id]?.controller === ctx.controller && chars(s, id).subtypes.includes(t)).length;
    const best =
      kind === "landType"
        ? [...options].sort((a, b) => landCount(b) - landCount(a))[0]
        : kind === "number"
          ? suggestedNumber(s, ctx.controller)
          : kind === "cardName" || kind === "landName" || kind === "parity" || kind === "mode"
            ? options[0]
            : ([...tally.entries()].sort((a, b) => b[1] - a[1]).find(([k]) => options.includes(k))?.[0] ?? options[0]);
    const COLOR: Record<string, string> = { W: "Blanc", U: "Bleu", B: "Noir", R: "Rouge", G: "Vert" };
    return {
      type: "pick",
      intent: "chooseOnEnter",
      prompt:
        kind === "color"
          ? "Choisissez une couleur"
          : kind === "cardName"
            ? "Choisissez un nom de carte (les cartes de la main adverse sont en tête)"
            : kind === "landName"
              ? "Choisissez un nom de carte de terrain (ceux de vos adversaires sont en tête)"
              : kind === "parity"
                ? "Choisissez : valeur de mana impaire ou paire"
                : kind === "mode"
                  ? `Choisissez : ${options.join(" ou ")}`
                  : kind === "number"
                    ? "Choisissez un nombre entre 1 et 10"
                    : kind === "landType"
                      ? "Choisissez un type de terrain de base"
                      : "Choisissez un type de créature",
      options,
      labels:
        kind === "color"
          ? COLOR
          : kind === "parity"
            ? { odd: "Impaire", even: "Paire" }
            : kind === "landType"
              ? { Plains: "Plaine", Island: "Île", Swamp: "Marais", Mountain: "Montagne", Forest: "Forêt" }
              : Object.fromEntries(options.map((o) => [o, o])),
      min: 1,
      max: 1,
      suggested: [best as string],
    };
  }
}

export const HANDLERS: OpHandlers = {
  phaseOut(s, _r, e, ctx) {
    for (const id of resolveRef(s, ctx, e.what)) phaseOut(s, id);
    return;
  },
  regenerate(s, _r, e, ctx) {
    for (const id of resolveRef(s, ctx, e.what)) {
      const o = s.objects[id];
      if (o?.zone === "battlefield") o.regenShields = (o.regenShields ?? 0) + 1;
    }
    return;
  },
  pump(s, _r, e, ctx) {
    const ids = resolveRef(s, ctx, e.what).filter((id) => onBattlefield(s, id));
    if (e.double) {
      // Les valeurs sont lues avant d'appliquer les bonus (tous doublés en même temps) ; une force négative double
      // aussi (701.10e : -X/-0).
      const pt = ids.map((id) => [id, chars(s, id).power, chars(s, id).toughness] as const);
      for (const [id, p, t] of pt) addPump(s, [id], p, t, e.keywords);
      return;
    }
    addPump(s, ids, evalAmount(s, ctx, e.power), evalAmount(s, ctx, e.toughness), e.keywords);
    return;
  },
  suspect(s, _r, e, ctx) {
    // 701.60 : seulement un permanent sur le champ de bataille.
    for (const id of resolveRef(s, ctx, e.what)) {
      const o = s.objects[id];
      if (o?.zone !== "battlefield" || !!o.suspected === e.value) continue;
      // Airtight Alibi : « ne peut pas devenir suspecte ».
      if (e.value && hasKeyword(s, id, "cantBeSuspected")) continue;
      o.suspected = e.value || undefined;
      bump(s);
    }
    return;
  },
  modify(s, r, e, ctx) {
    // Un sort sur la pile qui gagne un mot-clé (Spinerock Tyrant : « ces sorts gagnent la flétrissure ») : ses blessures
    // sont infligées avec les mots-clés de son instantané de source.
    for (const id of resolveRef(s, ctx, e.what)) {
      const item = s.stack.find((x) => x.id === id && x.kind === "spell");
      if (item && e.mods.addKeywords?.length) {
        const kw = [...new Set([...item.sourceSnapshot.keywords, ...e.mods.addKeywords])];
        item.sourceSnapshot = { ...item.sourceSnapshot, keywords: kw };
      }
    }
    const ids = resolveRef(s, ctx, e.what).filter(
      (id) => onBattlefield(s, id) && (!e.whileHasCounter || (s.objects[id]?.counters[e.whileHasCounter] ?? 0) > 0),
    );
    if (ids.length === 0) return;
    // 611.2b : un effet « tant que [la source] reste… » ne fait rien si elle est déjà partie.
    if (e.whileSource && !onBattlefield(s, ctx.sourceId)) return;
    // « Devient de la couleur choisie et gagne la défense talismanique contre elle » (Mondo Gecko) : la couleur choisie
    // par cet effet est figée dans l'effet (une autre activation en choisit une autre).
    const chosen = r.vars.$chosen?.[0] === "color" ? (String(r.vars.$chosen[1]) as Color) : undefined;
    let mods = e.mods;
    if (chosen && (mods.setColorsChosen || mods.addProtections?.some((p) => p.from.colorChosen)))
      mods = {
        ...mods,
        setColorsChosen: undefined,
        setColors: mods.setColorsChosen ? [chosen] : mods.setColors,
        addProtections: mods.addProtections?.map((p) =>
          p.from.colorChosen ? { ...p, from: { ...p.from, colorChosen: undefined, colors: [chosen] } } : p,
        ),
      };
    bump(s);
    s.effects.push({
      id: newId(s, "e"),
      timestamp: nextTimestamp(s),
      affected: ids,
      duration: e.duration,
      ...(e.duration === "untilYourNextTurn" ? { until: ctx.controller } : {}),
      ...(e.untilLeavesExile ? { untilExiledUid: exiledUid(s, ctx, e.untilLeavesExile) } : {}),
      ...(e.whileSource || e.whileYouControlSource ? { whileSource: ctx.sourceId } : {}),
      ...(e.whileYouControlSource ? { whileControlledBy: ctx.controller } : {}),
      ...(e.whileSourceTapped ? { whileSourceTapped: ctx.sourceId } : {}),
      ...(e.whileTapped ? { whileAffectedTapped: true } : {}),
      ...(e.whileHasCounter ? { whileAffectedHasCounter: e.whileHasCounter } : {}),
      ...mods,
      // Tolsimir : « bloque ce Loup si possible » (l'attaquant de l'événement).
      ...(e.mods.addBlockRules?.some((r) => r.mustBlockEventObject)
        ? {
            addBlockRules: e.mods.addBlockRules.map((r) =>
              r.mustBlockEventObject ? { ...r, mustBlockEventObject: undefined, mustBlockAttacker: ctx.event?.objectId } : r,
            ),
          }
        : {}),
      ...(e.basePT !== undefined ? { setPower: evalAmount(s, ctx, e.basePT), setToughness: evalAmount(s, ctx, e.basePT) } : {}),
    });
    return;
  },
  harness(s, _r, _e, ctx) {
    const o = s.objects[ctx.sourceId];
    if (o?.zone !== "battlefield" || o.harnessed) return;
    o.harnessed = true;
    bump(s);
    return;
  },
  attach(s, r, e, ctx) {
    // Plusieurs Équipements vers une même créature (Beatrix, Loyal General).
    const all = resolveRef(s, ctx, e.to);
    const to = e.random ? all[Math.floor(random(s) * all.length)] : all[0];
    let n = 0;
    if (to) for (const what of resolveRef(s, ctx, e.what)) if (attach(s, what, to)) n++;
    store(r, e.store, n);
    return;
  },
  emblem(s, r, e, ctx) {
    const defId = `emblem:${e.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
    s.defs[defId] ??= {
      id: defId,
      name: e.name,
      typeLine: "Emblème",
      manaCost: null,
      manaCostText: "",
      colors: [],
      supertypes: [],
      types: [],
      subtypes: [],
      keywords: [],
      abilities: e.abilities,
      text: e.text,
      implemented: true,
      isToken: true,
    };
    const emblem = createObject(s, defId, ctx.controller, "command", { isToken: true });
    if (e.duration === "untilYourNextTurn") emblem.expiresAtTurnOf = ctx.controller;
    if (e.duration === "endOfTurn") emblem.expiresEndOfTurn = s.turn.number;
    if (e.duration === "endOfYourNextTurn") emblem.expiresEndOfTurn = nextTurnOf(s, ctx.controller);
    // Oko, Shadowmoor Scion : « choisissez un type de créature ; vous obtenez un emblème avec "les créatures du type
    // choisi…" » : l'emblème garde le choix fait par l'effet.
    const chosen = r.vars.$chosen;
    if (chosen?.[0] === "creatureType") emblem.chosen = { creatureType: String(chosen[1]) };
    else if (chosen?.[0] === "color") emblem.chosen = { color: String(chosen[1]) as Color };
    // The Clone Saga : « choisissez un nom de carte ; chaque fois qu'une créature du nom choisi… ce tour-ci ».
    else if (chosen?.[0] === "cardName") emblem.chosen = { cardName: String(chosen[1]) };
    if (e.store) r.vars[`$ids:${e.store}`] = [emblem.id];
    bump(s);
    return;
  },
  createTokens(s, r, e, ctx, key) {
    const n = evalAmount(s, ctx, e.count);
    const created: string[] = [];
    const pt = e.pt !== undefined ? evalAmount(s, ctx, e.pt) : undefined;
    const token = pt === undefined ? e.token : { ...e.token, power: pt, toughness: pt };
    // 508.4 : des jetons « engagés et attaquants » attaquent sans avoir été déclarés ; leur contrôleur choisit ce qu'ils
    // attaquent (par défaut, ce qu'attaque la source, sinon son premier adversaire).
    let attacking: string | undefined;
    if (typeof e.attacking === "object") {
      // « … engagé et attaquant ce joueur » : le joueur désigné, s'il peut être attaqué (sinon, aucun jeton).
      const defender = resolveRef(s, ctx, e.attacking).find((p) => isPlayer(s, p));
      if (!defender || !s.combat || !attackableDefenders(s, ctx.controller).includes(defender)) return;
      attacking = defender;
    } else if (e.attacking && s.combat) {
      const suggested = s.combat.attackers.find((a) => a.id === ctx.sourceId)?.defender ?? attackingDefender(s, ctx.controller);
      const options = attackableDefenders(s, ctx.controller);
      const answer = r.vars[key("defender")];
      if (options.length > 1 && !answer) {
        return {
          ask: {
            player: ctx.controller,
            key: key("defender"),
            request: {
              type: "pick",
              intent: "other",
              prompt: "Que doivent attaquer les jetons ?",
              options,
              min: 1,
              max: 1,
              suggested: [options.includes(suggested) ? suggested : (options[0] as string)],
              autoOk: true,
            },
          },
        };
      }
      attacking = answer ? String(answer[0]) : suggested;
    }
    const enters = { tapped: !!(e.tapped || e.attacking), attacking };
    const creators = e.attachTo || !e.for ? [ctx.controller] : resolveRef(s, ctx, e.for).filter((x) => isPlayer(s, x));
    // Moonlit Meditation, Mirrormind Crown : « vous pouvez à la place créer des copies » — demandé avant toute création.
    const declined = new Set<string>();
    for (const p of creators) {
      const rep = n > 0 ? tokenCopyReplacement(s, p, token) : undefined;
      if (!rep?.may) continue;
      const answer = r.vars[key(`copies:${p}`)];
      if (!answer) {
        return {
          ask: {
            player: rep.controller,
            key: key(`copies:${p}`),
            request: {
              type: "yesNo",
              intent: "may",
              prompt: `${nameOf(s, rep.sourceId)} : créer à la place ${n > 1 ? "des copies" : "une copie"} de ${nameOf(s, rep.host)} ?`,
              suggested: [1],
            },
          },
        };
      }
      if (answer[0] !== 1) declined.add(p);
    }
    if (e.attachTo) {
      for (const host of resolveRef(s, ctx, e.attachTo).filter((x) => onBattlefield(s, x))) {
        const made = createTokens(s, ctx.controller, token, n, true, enters, declined.has(ctx.controller));
        for (const id of made) attach(s, id, host);
        created.push(...made);
      }
      if (e.store) r.vars[`$ids:${e.store}`] = created;
      return;
    }
    for (const p of creators) created.push(...createTokens(s, p, token, n, true, enters, declined.has(p)));
    if (e.store) r.vars[`$ids:${e.store}`] = created;
    return;
  },
  chooseCardName(s, r, _e, ctx, key) {
    if (r.vars.$name) return;
    const answer = r.vars[key("name")];
    if (!answer) {
      // Pas d'information cachée : les noms sont triés, la suggestion vient des cimetières (publics).
      const names = [
        ...new Set(
          Object.values(s.defs)
            .filter((d) => !d.isToken && !d.meldResult)
            .map((d) => d.name),
        ),
      ].sort();
      const opp = opponentsOf(s, ctx.controller)[0];
      const seen = (opp ? (s.players[opp]?.graveyard ?? []) : []).map((x) => s.defs[s.objects[x]?.defId ?? ""]?.name ?? "");
      const suggested = seen.find((n) => names.includes(n)) ?? names[0] ?? "";
      return {
        ask: {
          player: ctx.controller,
          key: key("name"),
          request: {
            type: "pick",
            intent: "chooseOnEnter",
            prompt: "Choisissez un nom de carte",
            options: names,
            labels: Object.fromEntries(names.map((n) => [n, n])),
            min: 1,
            max: 1,
            suggested: [suggested],
          },
        },
      };
    }
    r.vars.$name = [String(answer[0])];
    return;
  },
  copyToken(s, r, e, ctx) {
    const made: string[] = [];
    // Myriade : une copie par joueur désigné (un adversaire autre que le joueur défenseur), qui l'attaque.
    const attackEach = e.attackEach
      ? resolveRef(s, ctx, e.attackEach).filter((p) => isPlayer(s, p) && p !== ctx.controller)
      : undefined;
    // Doubling Season s'applique aussi aux jetons copies.
    const base = attackEach ? attackEach.length : e.count === undefined ? 1 : evalAmount(s, ctx, e.count);
    // Fractured Identity : « chaque joueur autre que son contrôleur crée un jeton qui est une copie ».
    const creators = e.for ? resolveRef(s, ctx, e.for).filter((x) => isPlayer(s, x)) : [ctx.controller];
    for (const who of creators)
      for (const id of resolveRef(s, ctx, e.of)) {
        const model = s.objects[id] ?? undefined;
        // La copie d'une copie copie ce que copie le modèle (707.3), et la face active d'une carte transformée.
        const defId = model?.zone === "battlefield" ? copiedDefId(s, id) : (model?.defId ?? s.lki[id]?.defId);
        if (!defId) continue;
        const view = model?.zone === "battlefield" ? snapshot(s, id) : s.lki[id];
        const types = [...new Set([...(view?.types ?? s.defs[defId]?.types ?? []), ...(e.addTypes ?? [])])];
        const n = view ? tokenCopyCount(s, who, { ...view, types, isToken: true }, base) : base;
        for (let i = 0; i < n; i++) {
          // Engagé, types, capacités et F/E en place avant l'événement d'arrivée (pas de « devient engagé »).
          // 707.9b : les exceptions du modèle, puis celles de cet effet (« sauf que c'est un 1/1 »), sont copiables.
          const token = createTokenCopy(s, who, defId, {
            tapped: !!e.tapped,
            mods: mergeMods(model?.zone === "battlefield" ? copiableExceptions(s, id) : undefined, {
              addTypes: e.addTypes?.length ? e.addTypes : undefined,
              addKeywords: e.addKeywords?.length ? e.addKeywords : undefined,
              addSubtypes: e.addSubtypes?.length ? e.addSubtypes : undefined,
              addSupertypes: e.legendary ? ["Legendary"] : undefined,
              removeSupertypes: e.nonlegendary ? ["Legendary"] : undefined,
              addAbilities: e.addAbilities?.length ? e.addAbilities : undefined,
              addColors: e.addColors?.length ? e.addColors : undefined,
              // Ardyn, the Usurper : « sauf que c'est un Démon noir ».
              setColors: e.setColors,
              setSubtypes: e.setSubtypes,
              ...(e.pt !== undefined ? { setPower: e.pt, setToughness: e.pt } : {}),
            }),
            modsCopiable: true,
          });
          made.push(token);
          // Firion : des capacités d'Équiper moins chères (ajoutées ; la moins chère sera utilisée).
          if (e.equipDiscount) {
            const equips = (s.defs[defId]?.abilities ?? []).flatMap((ab) =>
              ab.kind === "activated" && ab.label?.startsWith("Équiper") && ab.cost.mana
                ? [
                    {
                      ...ab,
                      cost: {
                        ...ab.cost,
                        mana: { ...ab.cost.mana, generic: Math.max(0, ab.cost.mana.generic - (e.equipDiscount ?? 0)) },
                      },
                      label: `${ab.label} (réduit)`,
                    },
                  ]
                : [],
            );
            if (equips.length) addEffect(s, [token], { addAbilities: equips }, "permanent");
          }
          if (e.sacrificeAtNextUpkeep) {
            createDelayed(
              s,
              ctx.controller,
              token,
              s.objects[token]?.defId ?? defId,
              { targets: [], effects: [{ op: "sacrificeIt", what: { kind: "target", id: "c" } }], bound: { c: [token] } },
              "nextUpkeep",
            );
          }
          if ((e.attacking || attackEach) && s.combat) {
            // Calamity : « engagé et attaquant » (il attaque ce qu'attaque une de vos créatures) ; myriade : le joueur de
            // sa copie (les copies en plus d'un doubleur se répartissent entre eux).
            const tok = s.objects[token];
            if (tok) tok.tapped = true;
            const defender =
              attackEach?.[Math.floor((i * attackEach.length) / n)] ??
              s.combat.attackers.find((a) => s.objects[a.id]?.controller === ctx.controller)?.defender ??
              opponentsOf(s, ctx.controller)[0] ??
              "";
            s.combat.attackers.push({ id: token, defender, blockers: [], blocked: false });
            bump(s);
          }
          if (e.atEndOfCombat) {
            const exile = e.atEndOfCombat === "exile";
            createDelayed(
              s,
              ctx.controller,
              ctx.sourceId,
              ctx.sourceDefId,
              {
                targets: [],
                effects: [
                  exile
                    ? { op: "exile", what: { kind: "target", id: "copy" } }
                    : { op: "sacrificeIt", what: { kind: "target", id: "copy" } },
                ],
                bound: { copy: [token] },
                label: exile ? "exiler la copie" : "sacrifier la copie",
              },
              "endOfCombat",
            );
          }
          if (e.sacrificeAtEndStep || e.exileAtEndStep) {
            createDelayed(s, ctx.controller, ctx.sourceId, ctx.sourceDefId, {
              targets: [],
              effects: [
                e.exileAtEndStep
                  ? { op: "exile", what: { kind: "target", id: "copy" } }
                  : { op: "sacrificeIt", what: { kind: "target", id: "copy" } },
              ],
              bound: { copy: [token] },
              label: e.exileAtEndStep ? "exiler la copie" : "sacrifier la copie",
            });
          }
        }
      }
    if (e.store) r.vars[`$ids:${e.store}`] = made;
    return;
  },
  chooseCopy(s, r, e, ctx, key) {
    if (r.vars.$copyOf) return;
    // Superior Spider-Man : une carte de créature de n'importe quel cimetière.
    const options = e.fromGraveyards
      ? s.playerOrder.flatMap((p) =>
          (s.players[p]?.graveyard ?? []).filter((id) => matchesCard(s, ctx.controller, id, e.filter, ctx.sourceId)),
        )
      : s.battlefield.filter(
          (id) =>
            (e.anyController || s.objects[id]?.controller === ctx.controller) &&
            id !== ctx.sourceId &&
            matchesObjectFilter(s, ctx.controller, id, e.filter, ctx.sourceId),
        );
    const answer = options.length ? r.vars[key("copy")] : [];
    if (!answer) {
      return {
        ask: {
          player: ctx.controller,
          key: key("copy"),
          request: {
            type: "pick",
            intent: "pickCards",
            prompt: e.fromGraveyards
              ? `${nameOf(s, ctx.sourceId)} : vous pouvez le faire arriver comme copie d'une carte de créature d'un cimetière`
              : `${nameOf(s, ctx.sourceId)} : vous pouvez la faire arriver comme copie d'un permanent`,
            options,
            min: 0,
            max: 1,
            suggested: options.slice(0, 1),
          },
        },
      };
    }
    const picked = answer.map(String).find((id) => options.includes(id));
    // Le modèle (sur le champ de bataille) suit la définition : ses exceptions de copie sont reprises (707.9b).
    r.vars.$copyOf = picked ? (e.fromGraveyards ? [s.objects[picked]?.defId ?? ""] : [copiedDefId(s, picked), picked]) : [];
    // La carte copiée depuis un cimetière est exilée une fois le permanent arrivé.
    if (picked && e.fromGraveyards) r.vars.$copyCard = [picked];
    return;
  },
  becomeCopyKeepAbilities(s, _r, e, ctx) {
    const card = resolveRef(s, ctx, e.what)[0];
    const self = s.objects[ctx.sourceId];
    const d = s.defs[s.objects[card ?? ""]?.defId ?? ""];
    if (!card || !d || self?.zone !== "battlefield") return;
    // « … sauf qu'elle est 0/0 et a cette capacité » : ses capacités activées imprimées sont conservées.
    const own = (s.defs[self.defId]?.abilities ?? []).filter((a) => a.kind === "activated");
    addEffect(s, [self.id], { copyOf: d.id, setPower: 0, setToughness: 0, addAbilities: own }, "permanent");
    return;
  },
  chooseOnEnter(s, r, e, ctx, key) {
    if (r.vars.$chosen) return;
    const answer = r.vars[key("chosen")];
    const kind = e.kind;
    if (!answer) {
      let preset: string[] | undefined;
      if (e.options) preset = [...e.options];
      else if (e.optionsFrom) {
        // Koh, the Face Stealer : le nom d'une des cartes désignées (s'il n'y en a aucune, rien n'est choisi).
        const names = resolveRef(s, ctx, e.optionsFrom).map((id) => s.defs[s.objects[id]?.defId ?? ""]?.name);
        preset = [...new Set(names.filter((n): n is string => !!n))];
        if (preset.length === 0) return;
      }
      return {
        ask: {
          player: ctx.controller,
          key: key("chosen"),
          request: enterChoiceRequest(s, ctx.controller, ctx.sourceDefId, kind, preset),
        },
      };
    }
    r.vars.$chosen = [kind, String(answer[0])];
    // Capacité déclenchée d'un permanent déjà en jeu (Petrified Hamlet : « quand ce terrain arrive, choisissez… ») ou
    // sort qui se résout (Harmonized Crescendo : « choisissez un type de créature ; piochez pour chaque… »).
    const src = s.objects[ctx.sourceId];
    if (src?.zone === "battlefield" || src?.zone === "stack") {
      const value = String(answer[0]);
      src.chosen = {
        ...src.chosen,
        ...(e.secret ? { secret: true } : {}),
        ...(kind === "color"
          ? { color: value as Color }
          : kind === "creatureType"
            ? { creatureType: value }
            : kind === "parity"
              ? { parity: value === "odd" ? ("odd" as const) : ("even" as const) }
              : kind === "mode"
                ? { mode: value }
                : kind === "number"
                  ? { number: Number(value) }
                  : { cardName: value }),
      };
      bump(s);
    }
    return;
  },
  exchangeControl(s, _r, e, ctx) {
    const a = resolveRef(s, ctx, e.a)[0];
    const b = resolveRef(s, ctx, e.b)[0];
    const oa = a ? s.objects[a] : undefined;
    const ob = b ? s.objects[b] : undefined;
    // 701.10 : l'échange n'a lieu que si les deux permanents sont encore là.
    if (oa?.zone !== "battlefield" || ob?.zone !== "battlefield" || oa.controller === ob.controller) return;
    const [ca, cb] = [oa.controller, ob.controller];
    addControlEffect(s, [oa.id], cb, "permanent");
    addControlEffect(s, [ob.id], ca, "permanent");
    return;
  },
  setBasePTAll(s, _r, e, ctx) {
    const n = evalAmount(s, ctx, e.amount);
    const ids = s.battlefield.filter((x) => matchesObjectFilter(s, ctx.controller, x, e.filter, ctx.sourceId));
    addEffect(s, ids, e.powerOnly ? { setPower: n } : { setPower: n, setToughness: n }, "endOfTurn");
    return;
  },
  gainControl(s, _r, e, ctx) {
    const toOwner = e.to === "owner";
    const to0 = e.to === "owner" ? undefined : e.to ? resolveRef(s, ctx, e.to).find((x) => isPlayer(s, x)) : ctx.controller;
    if (!to0 && !toOwner) return;
    // 611.2b : « tant que vous contrôlez [la source] » ne fait rien si elle est déjà partie.
    if (e.duration === "whileYouControlSource" && !onBattlefield(s, ctx.sourceId)) return;
    for (const id of resolveRef(s, ctx, e.what)) {
      const o = s.objects[id];
      const to = toOwner ? (o?.owner ?? "") : (to0 ?? "");
      if (!to) continue;
      // Commandeer : « gagnez le contrôle du sort ciblé » (un permanent qui en résulte arrive sous votre contrôle).
      const item = s.stack.find((x) => x.id === id && x.kind === "spell");
      if (item && o && item.controller !== to) {
        item.controller = to;
        o.controller = to;
        bump(s);
        continue;
      }
      if (o?.zone !== "battlefield" || o.controller === to) continue;
      // Vol « jusqu'à la fin du tour » (Involuntary Employment) : l'effet prend fin au nettoyage (couche 2) ; Evil's
      // Thrall : au nettoyage de votre prochain tour.
      if (e.duration === "endOfYourNextTurn")
        addControlEffect(s, [id], to, "endOfYourNextTurn", { until: ctx.controller, sinceTurn: s.turn.number });
      else if (e.duration === "whileYouControlSource") {
        addControlEffect(s, [id], to, "permanent", { whileSource: ctx.sourceId, whileControlledBy: ctx.controller });
        bump(s);
      } else addControlEffect(s, [id], to, e.duration === "permanent" ? "permanent" : "endOfTurn");
    }
    return;
  },
  unattach(s, _r, e, ctx) {
    const hosts = e.ifAttachedTo ? resolveRef(s, ctx, e.ifAttachedTo) : undefined;
    for (const id of resolveRef(s, ctx, e.what)) {
      const o = s.objects[id];
      if (o?.zone !== "battlefield" || !o.attachedTo) continue;
      if (hosts && !hosts.includes(o.attachedTo)) continue;
      o.attachedTo = undefined;
      bump(s);
    }
    return;
  },
  link(s, _r, e, ctx) {
    const o = s.objects[(e.to ? resolveRef(s, ctx, e.to)[0] : ctx.sourceId) ?? ""];
    if (o) o.linked = [...(o.linked ?? []), ...resolveRef(s, ctx, e.what)];
    // Territory Forge : les capacités de la source dépendent des cartes liées.
    bump(s);
    return;
  },
  becomeCopy(s, _r, e, ctx) {
    const model = resolveRef(s, ctx, e.of).find((id) => !!s.objects[id]);
    const ids = resolveRef(s, ctx, e.what).filter((id) => onBattlefield(s, id));
    if (!model || ids.length === 0) return;
    const onField = onBattlefield(s, model);
    const defId = onField ? copiedDefId(s, model) : (s.objects[model]?.defId as string);
    if (e.ifManaValue !== undefined && manaValue(s.defs[defId]?.manaCost) !== evalAmount(s, ctx, e.ifManaValue)) return;
    const own = s.defs[ctx.sourceDefId]?.abilities ?? [];
    const kept = (e.keepAbilities ?? []).map((i) => own[i]).filter((a): a is AbilityDef => !!a);
    bump(s);
    s.effects.push({
      id: newId(s, "e"),
      timestamp: nextTimestamp(s),
      affected: ids,
      duration: e.duration,
      ...(e.duration === "untilYourNextTurn" ? { until: ctx.controller } : {}),
      copyOf: defId,
      ...(onField ? copiableExceptions(s, model) : {}),
      ...(e.addKeywords?.length || kept.length || e.except
        ? mergeMods(onField ? copiableExceptions(s, model) : undefined, {
            ...(e.except ?? {}),
            addKeywords: [...(e.except?.addKeywords ?? []), ...(e.addKeywords ?? [])].length
              ? [...(e.except?.addKeywords ?? []), ...(e.addKeywords ?? [])]
              : undefined,
            addAbilities: kept.length ? kept : undefined,
          })
        : {}),
      copiable: true,
    });
    return;
  },
  saddle(s, _r, e, ctx) {
    for (const id of e.what ? resolveRef(s, ctx, e.what) : [ctx.sourceId]) {
      const o = s.objects[id];
      if (o?.zone !== "battlefield") continue;
      o.saddledTurn = s.turn.number;
      bump(s);
      rulesEvent(s, { e: "saddled", objectId: o.id });
    }
    return;
  },
  chooseRiot(s, r, _e, ctx, key) {
    const answer = r.vars[key("riot")];
    if (!answer) {
      const early = ["untap", "upkeep", "draw", "main1", "beginCombat"].includes(s.turn.step);
      return {
        ask: {
          player: ctx.controller,
          key: key("riot"),
          request: {
            type: "pick",
            intent: "other",
            prompt: "Émeute : un marqueur +1/+1 ou la célérité ?",
            options: ["counter", "haste"],
            labels: { counter: "Un marqueur +1/+1", haste: "La célérité" },
            min: 1,
            max: 1,
            suggested: [s.turn.active === ctx.controller && early ? "haste" : "counter"],
          },
        },
      };
    }
    r.vars.$riot = [String(answer[0])];
    return;
  },
  doneOncePerTurn(s, r) {
    const key = onceKey(r.item.sourceDefId, r.item.sourceId, r.item.abilityIndex);
    if (!s.turn.onceFired.includes(key)) s.turn.onceFired.push(key);
    return;
  },
};

/**
 * Talion, the Kindly Lord : la valeur de mana la plus fréquente parmi les cartes adverses vues (champ de bataille,
 * cimetières, exil), terrains exceptés ; 2 sans information.
 */
function suggestedNumber(s: GameState, controller: string): string {
  const tally = new Map<number, number>();
  for (const o of Object.values(s.objects)) {
    if (o.owner === controller || !["battlefield", "graveyard", "exile"].includes(o.zone)) continue;
    const d = s.defs[o.defId];
    if (!d || d.types.includes("Land") || d.isToken) continue;
    const mv = manaValue(d.manaCost);
    if (mv >= 1 && mv <= 10) tally.set(mv, (tally.get(mv) ?? 0) + 1);
  }
  const best = [...tally.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0];
  return String(best?.[0] ?? 2);
}
