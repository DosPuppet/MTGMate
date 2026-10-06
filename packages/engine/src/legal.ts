/**
 * Énumération exhaustive des actions légales pour le joueur qui a la priorité.
 * L'interface ne met en surbrillance que ces options ; l'IA et l'autopilot s'en servent aussi.
 */

import { availableMana, canPay, costToText, type ManaPurpose, manaAbilitiesOf, manaSources, manaValue, totalCost } from "./mana";
import {
  abilitiesOf,
  abilityManaCost,
  abilityPurpose,
  abilityZone,
  activatedAbility,
  activationPicks,
  additionalOptions,
  altCostFor,
  altCostPayment,
  autoAdditional,
  canCastTiming,
  canPayNonManaCost,
  canPlayLand,
  castableFaces,
  castTerms,
  costDependsOnTarget,
  craftMaterials,
  craftSpec,
  crewCandidates,
  crewPower,
  discardCostOptions,
  evidenceCards,
  FACE_DOWN_SPELL,
  graveyardToExile,
  greatestToughness,
  harmonizeOptions,
  hasConvoke,
  hasImprovise,
  hybridColors,
  instantLoyalty,
  isWebSlinging,
  kickerCostOptions,
  kickerCostPermanent,
  landBackFace,
  landFace,
  modeConditionHolds,
  modesOf,
  sacrificeOptions,
  sneakOptions,
  sneakTiming,
  sorceryTiming,
  spellCost,
  spellHasKeyword,
  spellPicks,
  spellView,
  splitSecondOnStack,
  suggestedCrew,
  symbolCards,
  tapOthersOptions,
  tapXCandidates,
  warpOf,
  waterbendAmount,
  webSlingingOptions,
} from "./stack";
import { payableLife } from "./statics";
import { ALL_CREATURE_TYPES, holderOf, matchesCard, matchesObjectFilter, NON_CREATURE_SUBTYPES } from "./targets";

/** Winter, Cursed Rider : nombre de cartes exilables pour « exilez X cartes … de votre cimetière ». */
function graveyardXOptions(s: GameState, player: PlayerId, source: ObjectId, f: ObjectFilter): number {
  return (s.players[player]?.graveyard ?? []).filter((id) => id !== source && matchesCard(s, player, id, f, source)).length;
}

/** Radiant Lotus : nombre de permanents sacrifiables pour « sacrifiez un ou plusieurs … ». */
function sacrificeXOptions(s: GameState, player: PlayerId, source: ObjectId, f: ObjectFilter): number {
  return s.battlefield.filter((id) => obj(s, id).controller === player && matchesObjectFilter(s, player, id, f, source)).length;
}

/** Secluded Starforge : nombre de permanents dégagés engageables pour « engagez X … ». */
/** « Engagez X [permanents] dégagés » : X maximal, les permanents engagés ne payant pas le mana (`tapXCandidates`). */
function tapXMax(
  s: GameState,
  player: PlayerId,
  source: ObjectId,
  f: ObjectFilter,
  pays: (exclude: Set<ObjectId>, x: number) => boolean,
): number {
  const ids = tapXCandidates(s, player, source, f);
  for (let x = ids.length; x > 0; x--) if (pays(new Set(ids.slice(0, x)), x)) return x;
  return 0;
}

import { chars, snapshot } from "./layers";
import { enterChoiceRequest } from "./ops/permanents";
import { obj } from "./state";
import { legalTargets } from "./targets";
import type {
  ActionOption,
  CardDef,
  Condition,
  GameState,
  ManaCost,
  ObjectFilter,
  ObjectId,
  PlayerId,
  TargetOption,
  TargetSpec,
} from "./types";
import { BASIC_LAND_TYPES } from "./types";

const GIFT_TEXT = { card: "une carte", food: "une Nourriture", fish: "un Poisson engagé", treasure: "un Trésor" } as const;

/** Libellés de la question du kicker : Progéniture (702.175), Cadeau (702.174), Marchandage (702.166). */
function kickerPrompt(d: CardDef): { title: string; without: string; with: string } | undefined {
  if (d.kickerKind === "offspring" && d.kicker) {
    const c = costToText(d.kicker);
    return { title: `Payer la progéniture ${c} ?`, without: "Sans progéniture", with: `Progéniture ${c}` };
  }
  if (d.kickerKind === "life" && d.kickerCost?.life) {
    const pay = d.kickerOrPay ? costToText(d.kickerOrPay) : "";
    return {
      title: `Payer ${d.kickerCost.life} points de vie plutôt que ${pay} ?`,
      without: `Payer ${pay}`,
      with: `Payer ${d.kickerCost.life} PV`,
    };
  }
  if (d.kickerKind === "waterbend" && d.kicker) {
    const c = costToText(d.kicker);
    return {
      title: `Maîtriser l'eau ${c} (vos artefacts et créatures dégagés peuvent payer {1} chacun) ?`,
      without: "Sans maîtriser l'eau",
      with: `Maîtriser l'eau ${c}`,
    };
  }
  if (d.kickerKind === "blight" && d.kickerCost?.blight) {
    const n = d.kickerCost.blight;
    return {
      title: `Flétrir ${n} : mettre ${n} marqueur(s) -1/-1 sur une de vos créatures ?`,
      without: "Sans flétrir",
      with: `Flétrir ${n}`,
    };
  }
  if (d.kickerKind === "teamwork" && d.kickerCost?.tapPower) {
    const n = d.kickerCost.tapPower;
    return {
      title: `Travail d'équipe ${n} : engager des créatures de force totale ${n} ou plus ?`,
      without: "Sans travail d'équipe",
      with: `Travail d'équipe ${n}`,
    };
  }
  if (d.kickerKind === "exileGraveyard" && d.kickerCost?.exileGraveyard) {
    const n = d.kickerCost.exileGraveyard;
    const pay = d.kickerOrPay ? costToText(d.kickerOrPay) : "";
    return {
      title: `Exiler ${n} carte(s) de votre cimetière plutôt que payer ${pay} ?`,
      without: `Payer ${pay}`,
      with: `Exiler ${n} carte(s)`,
    };
  }
  if (d.kickerKind === "evidence" && d.kickerCost?.collectEvidence) {
    const n = d.kickerCost.collectEvidence;
    return {
      title: `Réunir des preuves ${n} : exiler des cartes de votre cimetière de valeur de mana totale ${n} ou plus ?`,
      without: "Sans preuves",
      with: `Réunir des preuves ${n}`,
    };
  }
  if (d.kickerKind === "bargain") {
    return {
      title: "Marchander : sacrifier un artefact, un enchantement ou un jeton ?",
      without: "Sans marchander",
      with: "Marchander",
    };
  }
  if (d.kickerKind === "gift" && d.gift) {
    return {
      title: "Promettre un cadeau à un adversaire ?",
      without: "Sans cadeau",
      with: `Offrir ${GIFT_TEXT[d.gift]}`,
    };
  }
  return undefined;
}

/** Types de créature de chaque objet, pour « qui partagent un type de créature » (`"*"` : tous les types). */
function creatureTypesOf(s: GameState, ids: ObjectId[]): Record<string, string[]> {
  return Object.fromEntries(
    ids.map((id) => {
      const v = snapshot(s, id);
      const all = v.keywords.includes("changeling") || v.subtypes.includes(ALL_CREATURE_TYPES);
      return [id, all ? ["*"] : v.subtypes.filter((t) => !NON_CREATURE_SUBTYPES.has(t))];
    }),
  );
}

/**
 * Terror of the Peaks : « les sorts de vos adversaires qui ciblent cette créature coûtent 3 PV de plus » ; un sort ne
 * propose pas une cible dont la taxe dépasse les PV que le joueur peut payer (le moteur refuserait le lancer).
 */
function withoutUnpayableLifeTax(s: GameState, player: PlayerId, opts: TargetOption[]): TargetOption[] {
  const life = payableLife(s, player);
  const tax = (id: string) => {
    const t = s.objects[id];
    if (t?.zone !== "battlefield" || t.controller === player) return 0;
    return chars(s, id).abilities.reduce((m, ab) => m + (ab.kind === "playerStatic" ? (ab.targetLifeTax ?? 0) : 0), 0);
  };
  return opts.map((o) => (o.legal.some((id) => tax(id) > life) ? { ...o, legal: o.legal.filter((id) => tax(id) <= life) } : o));
}

function targetOptions(s: GameState, player: PlayerId, specs: TargetSpec[], sourceId?: ObjectId): TargetOption[] {
  return specs.map((t) => {
    const all = legalTargets(s, player, t, sourceId);
    // « Valeur de mana totale N ou moins » : une cible qui dépasse N à elle seule n'est jamais choisissable.
    const cap = t.maxTotalManaValue;
    const legal = cap === undefined ? all : all.filter((id) => (snapshot(s, id).manaValue ?? 0) <= cap);
    const opt: TargetOption = {
      id: t.id,
      label: t.label,
      optional: !!t.optional,
      legal,
      count: t.count && t.count > 1 ? t.count : undefined,
      min: t.minCount,
      ...(t.countX ? { countX: t.countX } : {}),
      kickedCount: t.kickedCount,
      kickedLegal: t.kickedFilter ? legalTargets(s, player, { ...t, filter: t.kickedFilter }, sourceId) : undefined,
      otherThan: t.otherThan,
      attachedToTarget: t.attachedToTarget,
      ...(t.shareCreatureType ? { shareCreatureType: creatureTypesOf(s, legal) } : {}),
      ...(cap !== undefined
        ? { maxTotalManaValue: { max: cap, values: Object.fromEntries(legal.map((id) => [id, snapshot(s, id).manaValue ?? 0])) } }
        : {}),
    };
    if (t.of?.kind === "target")
      opt.ofTarget = { id: t.of.id, holders: Object.fromEntries(legal.map((id) => [id, holderOf(s, id)])) };
    if (t.samePlayer || t.differentPlayers) {
      const holders: Record<string, string> = {};
      for (const id of legal) {
        const o = s.objects[id];
        holders[id] = o ? (o.zone === "battlefield" ? o.controller : o.owner) : id;
      }
      opt.group = { kind: t.samePlayer ? "same" : "different", holders };
    }
    // Noms différents : même contrainte « différents », le nom tenant lieu de joueur.
    if (t.differentNames) {
      const holders: Record<string, string> = {};
      for (const id of legal) holders[id] = (s.objects[id] ? snapshot(s, id).name : undefined) ?? id;
      opt.group = { kind: "different", holders };
    }
    // Valeurs de mana différentes : la valeur de mana tient lieu de joueur.
    if (t.differentManaValues) {
      const holders: Record<string, string> = {};
      for (const id of legal) holders[id] = String((s.objects[id] ? snapshot(s, id).manaValue : undefined) ?? id);
      opt.group = { kind: "different", holders };
    }
    return opt;
  });
}

function targetsAvailable(opts: TargetOption[]): boolean {
  const need = (t: TargetOption) => (t.optional || t.countX ? 0 : (t.min ?? t.count ?? 1));
  // « Une autre cible » : assez de cibles distinctes pour tous les mots « cible » liés (Betrayal at the Vault).
  for (const t of opts) {
    if (!t.otherThan?.length) continue;
    const group = [t, ...opts.filter((o) => t.otherThan?.includes(o.id))];
    if (new Set(group.flatMap((o) => o.legal)).size < group.reduce((n, o) => n + need(o), 0)) return false;
  }
  return opts.every((t) => {
    // « X cibles » : X peut valoir 0.
    if (t.optional || t.countX) return true;
    const need = t.min ?? t.count ?? 1;
    if (t.group?.kind === "different") return new Set(Object.values(t.group.holders)).size >= need;
    // « Ciblant le même joueur » : assez de cibles chez un même joueur.
    if (t.group?.kind === "same") {
      const per = new Map<string, number>();
      for (const h of Object.values(t.group.holders)) per.set(h, (per.get(h) ?? 0) + 1);
      return [...per.values()].some((n) => n >= need);
    }
    if (t.legal.length < need) return false;
    // « Qui partagent un type de créature » : assez de cibles qui en partagent un.
    const share = t.shareCreatureType;
    if (share && need > 1) {
      const wild = t.legal.filter((id) => share[id]?.includes("*")).length;
      const count = new Map<string, number>();
      for (const id of t.legal)
        if (!share[id]?.includes("*")) for (const ty of share[id] ?? []) count.set(ty, (count.get(ty) ?? 0) + 1);
      return wild >= need || [...count.values()].some((n) => n + wild >= need);
    }
    return true;
  });
}

/** Plus grande valeur de X payable pour un coût qui dépend de X. */
function maxXFor(
  s: GameState,
  player: PlayerId,
  costAt: (x: number) => ManaCost,
  /** À quoi sert le mana pour cette valeur de X (maîtrise de l'eau {X}). */
  purposeAt?: (x: number) => ManaPurpose,
): number {
  const upper = availableMana(s, player, undefined, purposeAt?.(Number.MAX_SAFE_INTEGER)) - manaValue(costAt(0));
  for (let x = upper; x > 0; x--) if (canPay(s, player, costAt(x), undefined, purposeAt?.(x))) return x;
  return 0;
}

/** Plus grande valeur de X payable (null si le coût n'a pas de X). */
function maxX(
  s: GameState,
  player: PlayerId,
  cost: ManaCost | null | undefined,
  exclude?: ReadonlySet<ObjectId>,
  /** À quoi sert le mana (capacité activée : sa source, maîtrise de l'eau). */
  purpose?: ManaPurpose,
): number | null {
  if (!cost?.x) return null;
  const upper = Math.floor((availableMana(s, player, exclude, purpose) - manaValue(cost)) / cost.x);
  for (let x = upper; x > 0; x--) if (canPay(s, player, totalCost(cost, x), exclude, purpose)) return x;
  return 0;
}

/** Choix des créatures d'équipage ou de monture : force totale requise, forces, choix par défaut. */
function crewSpec(s: GameState, player: PlayerId, source: ObjectId, n: number) {
  const options = crewCandidates(s, player, source);
  const suggested = suggestedCrew(s, player, source, n);
  return {
    count: suggested.length,
    options,
    minPower: n,
    powers: Object.fromEntries(options.map((id) => [id, Math.max(0, crewPower(s, id))])),
    suggested,
  };
}

export function legalActions(s: GameState, player: PlayerId): ActionOption[] {
  const p = s.pending;
  if (p?.kind !== "priority" || p.player !== player) return [];
  const out: ActionOption[] = [{ type: "pass" }];
  const hand = s.players[player]?.hand ?? [];

  // Cartes jouables : main, cimetière (flashback, Muldrotha, Zul Ashur…) et exil (impulsion, Etali, Tinybones).
  const graveyard = (s.players[player]?.graveyard ?? []).filter((id) => castTerms(s, player, id) || canPlayLand(s, player, id));
  const exiled = s.exile.filter((id) => castTerms(s, player, id) || canPlayLand(s, player, id));
  // Dessus de la bibliothèque (Vizier of the Menagerie).
  const top = s.players[player]?.library[0];
  if (top && castTerms(s, player, top)) exiled.push(top);
  // Zone de commandement : son commandant (903.8).
  const command = (s.players[player]?.command ?? []).filter((id) => castTerms(s, player, id));
  for (const card of [...hand, ...graveyard, ...exiled, ...command]) {
    const d = s.defs[obj(s, card).defId];
    if (!d) continue;
    // La face terrain : la carte, ou le verso terrain d'une carte modale (dont le recto reste lançable).
    const land = landFace(d);
    if (land) {
      if (canPlayLand(s, player, card)) {
        // Pathways : le recto et le verso sont des terrains ; une option par face.
        const back = landBackFace(d);
        for (const [face, side] of back
          ? ([
              [land, {}],
              [back, { back: true, faceName: back.name }],
            ] as const)
          : ([[land, {}]] as const)) {
          // Terrain choc : payer les points de vie (dégagé) ou non (engagé).
          // Multiversal Passage : une option par type de terrain de base choisi.
          const types = face.chooseOnEnter === "landType" ? BASIC_LAND_TYPES : [undefined];
          // « En arrivant, choisissez… » (Cavern of Souls) : la question posée en jouant le terrain.
          const kind = face.chooseOnEnter;
          const choose = kind && kind !== "landType" ? { choose: enterChoiceRequest(s, player, face.id, kind) } : {};
          for (const landType of types) {
            const extra = landType ? { landType, ...choose, ...side } : { ...choose, ...side };
            if (face.shockLand && payableLife(s, player) >= face.shockLand)
              out.push({ type: "playLand", card, payLife: true, ...extra });
            out.push({ type: "playLand", card, ...extra });
          }
        }
      }
      // Ville à aventure : l'Aventure reste lançable ; un terrain déguisé, face cachée (Branch of Vitu-Ghazi).
      if (land === d && d.layout !== "adventure" && !d.disguise) continue;
    }
    const terms = castTerms(s, player, card);
    if (!terms || !d.implemented) continue;
    // Chaque face lançable (la carte, son aventure) donne une option distincte ; le déguisement, face cachée.
    if (!terms.warpOnly)
      for (const [face, faceDef] of castableFaces(s, card, d))
        if (!terms.adventureOnly || (face === 1 && faceDef.subtypes.includes("Adventure")))
          for (const v of modesOf(faceDef).some((m) => m.cost) ? [undefined, "modeCost" as const] : [undefined])
            castOption(card, face, faceDef, terms, v);
    if (d.disguise) castOption(card, undefined, FACE_DOWN_SPELL, terms, "faceDown");
    // Distorsion (702.185) : depuis la main, ou le cimetière si la carte le permet.
    const warp = warpOf(s, player, card, d);
    const life = payableLife(s, player);
    if (warp && (terms.source === "hand" || terms.warpOnly) && life >= (warp.life ?? 0)) {
      castOption(card, undefined, { ...d, manaCost: warp.cost }, terms, "warp");
    }
  }

  function castOption(
    card: ObjectId,
    face: number | undefined,
    d: CardDef,
    terms: NonNullable<ReturnType<typeof castTerms>>,
    variant?: "faceDown" | "warp" | "modeCost",
  ) {
    // Timing : normal, ignoré (Etali), ou flash moyennant un surcoût (Harbinger of the Tides).
    const onTime = terms.anyTime || (terms.sorceryTiming ? sorceryTiming(s, player) : canCastTiming(s, player, d));
    // Faufilement : hors de son moment habituel, le sort ne se lance que pour son coût de faufilement.
    const sneakOnly = !onTime && !terms.free && sneakTiming(s, player, d);
    // Une permission « au moment d'un rituel » (carte complotée) l'emporte sur le flash payant (Mystical Tether).
    if (!onTime && (!d.flashExtraCost || terms.sorceryTiming) && !sneakOnly) return;
    const timingExtra = onTime || sneakOnly ? undefined : d.flashExtraCost;
    const flashback = terms.source === "flashback";
    // Condition d'un mode lue avec et sans le coût additionnel (« s'il a été payé, choisissez les deux à la place »).
    const kickerNeeds = (c: Condition | undefined): { ok: boolean; requiresKicker?: true; forbidsKicker?: true } => {
      if (!c) return { ok: true };
      const withKicker = modeConditionHolds(s, player, card, c, true);
      const without = modeConditionHolds(s, player, card, c, false);
      return {
        ok: withKicker || without,
        requiresKicker: (withKicker && !without) || undefined,
        forbidsKicker: (without && !withKicker) || undefined,
      };
    };
    const modes = modesOf(d)
      .map((m, index) => ({
        index,
        label: m.label,
        targets: withoutUnpayableLifeTax(s, player, targetOptions(s, player, m.targets, card)),
        extra: m.extraCost,
        ...kickerNeeds(m.condition),
      }))
      .filter((m) => m.ok)
      // Cadeau promis : les cibles propres au cadeau suffisent (Into the Flood Maw sans créature adverse).
      .filter(
        (m) =>
          targetsAvailable(m.targets) ||
          (!!d.kicker && targetsAvailable(m.targets.map((t) => (t.kickedLegal ? { ...t, legal: t.kickedLegal } : t)))),
      )
      // Spree : le coût supplémentaire du mode doit être payable.
      .filter(
        (m) =>
          !m.extra ||
          canPay(
            s,
            player,
            totalCost(
              totalCost(spellCost(s, player, d, { free: terms.free }), 0, m.extra),
              0,
              terms.extraCost ? { generic: terms.extraCost, colored: {}, x: 0 } : undefined,
            ),
          ),
      )
      .map(({ extra: _, ok: __, ...m }) => m);
    if (modes.length === 0) return;
    const additional = additionalOptions(s, player, card, d, terms.source === "flashback");
    if (!additional) return;
    // Coûts additionnels choisis automatiquement : ces permanents ne peuvent pas servir à payer le mana.
    const auto = autoAdditional(s, player, card, d, terms.source === "flashback");
    if (!auto) return;
    const spent = [...auto.tap, ...auto.exile, ...auto.bounce];
    const exclude = spent.length ? new Set(spent) : undefined;
    // Les permanents exilés ou renvoyés par le coût (avant le mana) n'appliquent plus leurs remplacements de mana.
    const gone = auto.exile.length || auto.bounce.length ? new Set([...auto.exile, ...auto.bounce]) : undefined;
    const purpose0: ManaPurpose = {
      ...(gone ? { gone } : {}),
      spell: spellView(d, player),
      convoke: hasConvoke(s, player, d),
      improvise: hasImprovise(s, player, d) || undefined,
      delve: spellHasKeyword(s, player, d, "delve"),
      sacrificeToPay: d.additionalCost?.sacrificeToPay,
      fromHand: terms.source === "hand",
    };
    // Maîtrise de l'eau en coût additionnel : sa part du coût, selon le kicker et X.
    const purposeFor = (kicked: boolean, x: number): ManaPurpose => {
      const w = waterbendAmount(d, kicked, x) + (terms.waterbendOverride ? (terms.costOverride?.generic ?? 0) : 0);
      return w ? { ...purpose0, waterbend: w } : purpose0;
    };
    const purpose = purposeFor(false, 0);
    const base = {
      flashback,
      anyMana: terms.anyMana,
      mayhem: terms.mayhem,
      costOverride: terms.costOverride,
      fromZone: terms.source,
      card,
    };
    // « Sacrifiez une créature ou payez {3}{B} » : sans créature à sacrifier, le mana s'ajoute au coût.
    const sac = additional.sacrifice;
    const mustPayInstead = !!sac?.orPay && sac.options.length < sac.count;
    // Titania : sans carte à défausser, le mana s'ajoute au coût.
    const dis = additional.discard;
    const mustPayDiscard = !!dis?.orPay && dis.options.length < dis.count;
    // Surcoût de la permission (Lightstall Inquisitor : « coûte {1} de plus » ; taxe de commandant), comme dans
    // `castSpell`, et surcoût de timing.
    const withSurcharges = (c: ManaCost) => {
      const a = terms.extraCost ? totalCost(c, 0, { generic: terms.extraCost, colored: {}, x: 0 }) : c;
      return timingExtra ? totalCost(a, 0, timingExtra) : a;
    };
    const withExtra = (c: ManaCost) => {
      const a0 = mustPayInstead && sac?.orPay ? totalCost(c, 0, sac.orPay) : c;
      const a1 = mustPayDiscard && dis?.orPay ? totalCost(a0, 0, dis.orPay) : a0;
      return withSurcharges(a1);
    };
    // Harmonie : payable aussi en engageant une créature (qui ne sert alors pas à payer le mana).
    const harmony =
      flashback && (d.harmonize || terms.harmonize)
        ? harmonizeOptions(s, player, card, withExtra(spellCost(s, player, d, base)).generic)
        : undefined;
    const payableWith = (c: ManaCost) =>
      canPay(s, player, c, exclude, purpose) ||
      !!harmony?.options.some((id) =>
        canPay(s, player, totalCost(c, 0, undefined, harmony.powers[id] ?? 0), new Set([...(exclude ?? []), id]), purpose),
      );
    const normal = !sneakOnly && !terms.free && payableWith(withExtra(spellCost(s, player, d, base)));
    // Sans payer son coût de mana : les taxes (Thalia, the Survivor) et coûts supplémentaires restent à payer.
    const freePayable = () => payableWith(withExtra(spellCost(s, player, d, { ...base, free: true })));
    if (terms.free && !freePayable()) return;
    const freeAvailable = !sneakOnly && !!terms.freeOptional && freePayable();
    const alt = terms.free ? undefined : altCostFor(s, player, d);
    // Les permanents renvoyés ou sacrifiés par le coût alternatif (Daze, émerger) ne produisent plus de mana.
    const altPaid = alt?.pay ? altCostPayment(s, player, card, alt.pay) : undefined;
    // Web-slinging : la créature engagée renvoyée par défaut (Nyxbloom Ancient ne triple plus le mana).
    const webBounce = alt && isWebSlinging(s, player, d) ? webSlingingOptions(s, player)[0] : undefined;
    const altGone = [altPaid?.bounce, altPaid?.sacrifice, webBounce].filter((x): x is string => !!x);
    const altAvailable =
      !!alt &&
      (!alt.collectEvidence || !!evidenceCards(s, player, card, alt.collectEvidence)) &&
      (!alt.pay || !!altPaid) &&
      canPay(
        s,
        player,
        withExtra(spellCost(s, player, d, { ...base, alternative: true })),
        altGone.length ? new Set([...(exclude ?? []), ...altGone]) : exclude,
        altGone.length ? { ...purpose, gone: new Set([...(gone ?? []), ...altGone]) } : purpose,
      );
    // Kicker payable (« coûte {2} de moins s'il est marchandé » : Hamlet Glutton peut n'être payable que marchandé).
    // Travail d'équipe : les créatures engagées pour le kicker ne paient pas le mana.
    const kickerCrew = d.kickerCost?.tapPower !== undefined ? suggestedCrew(s, player, card, d.kickerCost.tapPower) : [];
    // Réplique (702.56) : le coût se paie X fois (X choisi comme pour un sort à X), pas comme un kicker.
    const replicate = d.kickerKind === "replicate";
    const kickerAffordable =
      !sneakOnly &&
      !!d.kicker &&
      !replicate &&
      !flashback &&
      (!d.kickerCost ||
        (d.kickerCost.tapPower !== undefined
          ? kickerCrew.length > 0
          : d.kickerCost.collectEvidence !== undefined
            ? !!evidenceCards(s, player, card, d.kickerCost.collectEvidence)
            : d.kickerCost.life !== undefined
              ? payableLife(s, player) >= d.kickerCost.life
              : d.kickerCost.exileGraveyard !== undefined
                ? !!graveyardToExile(s, player, card, d.kickerCost.exileGraveyard)
                : !!kickerCostPermanent(s, player, card, d))) &&
      canPay(
        s,
        player,
        withExtra(spellCost(s, player, d, { ...base, kicked: true, free: terms.free })),
        kickerCrew.length ? new Set([...(exclude ?? []), ...kickerCrew]) : undefined,
        purposeFor(true, 0),
      );
    // Surcharge, fendre : les modes à leur propre coût forment une option à part (`variant` « modeCost »), payable,
    // sans gratuité ni autre coût alternatif (118.9a) ; l'option ordinaire n'a que les autres modes.
    const allModes = modesOf(d);
    const modeCost = variant === "modeCost";
    for (let i = modes.length - 1; i >= 0; i--) {
      const own = allModes[(modes[i] as (typeof modes)[number]).index]?.cost;
      const ok = modeCost
        ? !!own && !terms.free && payableWith(withExtra(spellCost(s, player, { ...d, manaCost: own }, base)))
        : !own;
      if (!ok) modes.splice(i, 1);
    }
    if (modes.length === 0) return;
    if (!modeCost && !terms.free && !normal && !freeAvailable && !altAvailable && !kickerAffordable) return;
    // Un mode qui exige le coût additionnel demande un kicker payable ; un mode qui l'exclut, une autre façon de payer.
    const unkickedPayable = modeCost || !!terms.free || normal || freeAvailable || altAvailable;
    for (let i = modes.length - 1; i >= 0; i--) {
      const m = modes[i] as (typeof modes)[number];
      if ((m.requiresKicker && !kickerAffordable) || (m.forbidsKicker && !unkickedPayable)) modes.splice(i, 1);
    }
    if (modes.length === 0) return;
    // Un mode qui n'a de cibles qu'avec le kicker ou le cadeau (Too Evil to Stay Dead) demande un kicker payable.
    if (!kickerAffordable)
      for (let i = modes.length - 1; i >= 0; i--)
        if (!targetsAvailable((modes[i] as (typeof modes)[number]).targets)) modes.splice(i, 1);
    if (modes.length === 0) return;
    // « Ce sort coûte {W}{U} de plus pour chaque cible au-delà de la première » (Officious Interrogation) : pas plus de
    // cibles que le mana disponible n'en permet.
    if (d.costPerExtraTarget && normal && !freeAvailable && !altAvailable)
      for (const m of modes)
        for (const t of m.targets) {
          let n = t.count ?? 1;
          const dummy = (k: number) => ({ [t.id]: Array.from({ length: k }, (_, i) => `#${i}`) });
          while (n > 1 && !payableWith(withExtra(spellCost(s, player, d, { ...base, targets: dummy(n) })))) n--;
          t.count = n > 1 ? n : undefined;
        }
    // « Ce sort coûte {N} de moins s'il cible… » (Luminous Rebuke) : payable seulement grâce à la réduction, le sort ne
    // propose que les cibles qui la donnent (sinon le joueur choisirait une cible et le paiement échouerait).
    const reduction = d.costReduction?.condition;
    if (normal && !freeAvailable && !altAvailable && reduction?.kind === "targetMatches") {
      const full = payableWith(withExtra(spellCost(s, player, d, { ...base, targets: { [reduction.spec]: [] } })));
      if (!full)
        for (const m of modes)
          for (const t of m.targets) {
            if (t.id !== reduction.spec) continue;
            const giving = t.legal.filter((id) =>
              payableWith(withExtra(spellCost(s, player, d, { ...base, targets: { [t.id]: [id] } }))),
            );
            // Plusieurs cibles (« jusqu'à deux », This Town Ain't Big Enough) : au moins une qui donne la réduction.
            if ((t.count ?? 1) > 1) Object.assign(t, { requiredAmong: giving, optional: false, min: 1 });
            else Object.assign(t, { legal: giving, optional: false });
          }
    }
    // Le mana à payer à la place du sacrifice est-il disponible ?
    if (dis?.orPay) {
      dis.orPayAffordable = canPay(
        s,
        player,
        totalCost(withSurcharges(spellCost(s, player, d, base)), 0, dis.orPay),
        undefined,
        purpose,
      );
    }
    if (sac?.orPay) {
      sac.orPayAffordable = canPay(
        s,
        player,
        totalCost(withSurcharges(spellCost(s, player, d, base)), 0, sac.orPay),
        undefined,
        purpose,
      );
    }
    const hasX =
      (!terms.free && !!(flashback ? (d.flashback ?? d.manaCost)?.x : d.manaCost?.x)) || d.xCost === "waterbend" || replicate;
    // Vicious Rivalry : X se paie en points de vie.
    // Soul Immolation : X flétri, au plus la plus grande endurance parmi vos créatures.
    const lifeX = !normal
      ? null
      : d.xCost === "life"
        ? payableLife(s, player)
        : d.xCost === "blight"
          ? greatestToughness(s, player)
          : null;
    out.push({
      type: "cast",
      card,
      ...(face !== undefined ? { face, faceName: d.name } : {}),
      ...(variant === "faceDown" ? { faceDown: true, faceName: "Face cachée" } : {}),
      ...(variant === "warp" ? { warp: true } : {}),
      modes,
      xMax:
        lifeX ??
        (hasX && (normal || terms.free)
          ? maxXFor(
              s,
              player,
              (x) => withExtra(spellCost(s, player, d, { ...base, x, free: terms.free })),
              (x) => purposeFor(false, x),
            )
          : null),
      kickerAffordable: !modeCost && kickerAffordable,
      kickerPrompt: d.kicker ? kickerPrompt(d) : undefined,
      ...(hybridColors(d).length ? { hybridColors: hybridColors(d) } : {}),
      fromGraveyard: terms.source === "graveyard" || terms.source === "flashback" ? true : undefined,
      fromExile: terms.source === "exile" ? true : undefined,
      free: (!modeCost && terms.free) || undefined,
      freeAvailable: (!modeCost && freeAvailable) || undefined,
      altAvailable: (!modeCost && altAvailable) || undefined,
      altLabel: !modeCost && altAvailable ? alt?.label : undefined,
      // Un mode à son propre coût (surcharge) se paie comme le coût normal.
      normalAvailable: normal || modeCost || undefined,
      additional:
        additional.discard || additional.sacrifice || harmony?.options.length
          ? { ...additional, ...(harmony?.options.length ? { tap: { count: 1, ...harmony, optional: true as const } } : {}) }
          : undefined,
      altBounce: !altAvailable
        ? undefined
        : isWebSlinging(s, player, d)
          ? webSlingingOptions(s, player)
          : d.sneak
            ? sneakOptions(s, player)
            : undefined,
      kickerPermanents:
        d.kickerCost && !d.kickerCost.tapPower && !d.kickerCost.collectEvidence && !d.kickerCost.exileGraveyard
          ? kickerCostOptions(s, player, card, d)
          : undefined,
      kickerTap: d.kickerCost?.tapPower ? crewSpec(s, player, card, d.kickerCost.tapPower) : undefined,
      // Objets payés en coût (preuves, exil du cimetière, flétrir X), quand le joueur a un choix à faire.
      ...(() => {
        const picks = spellPicks(s, player, card, d, undefined, flashback, terms.removeCounters).filter(
          (p) =>
            (p.when !== "kicked" || kickerAffordable) &&
            (p.when !== "alternative" || altAvailable) &&
            (p.atMost || p.minTotal || p.optional || p.options.length > p.count || (p.repeat && p.options.length > 1)),
        );
        return picks.length ? { picks } : {};
      })(),
    });
  }

  const offField = (zone: "graveyard" | "hand", flag: "fromGraveyard" | "fromHand") =>
    (s.players[player]?.[zone] ?? []).filter((id) =>
      s.defs[obj(s, id).defId]?.abilities.some((ab) => ab.kind === "activated" && ab[flag]),
    );
  for (const id of [...s.battlefield, ...offField("graveyard", "fromGraveyard"), ...offField("hand", "fromHand")]) {
    const o = obj(s, id);
    if (o.zone === "battlefield" ? o.controller !== player : o.owner !== player) continue;
    abilitiesOf(s, id).forEach((_, index) => {
      const ab = activatedAbility(s, id, index);
      if (!ab || abilityZone(ab) !== o.zone || !canPayNonManaCost(s, id, ab, index)) return;
      if (ab.sorcerySpeed && !instantLoyalty(s, player, id, ab) && !sorceryTiming(s, player)) return;
      // Fabrication : la source et les matériaux exilés ne paient pas le mana.
      const exclude = ab.cost.craft
        ? new Set([id, ...(craftMaterials(s, player, id, ab) ?? [])])
        : ab.cost.tap
          ? new Set([id])
          : undefined;
      // Warrior's Blades, Dragonfire Blade : au mieux, la cible la plus favorable.
      if (ab.cost.exileGraveyardSymbols && !symbolCards(s, player, ab.cost.exileGraveyardSymbols)) return;
      const abCost = abilityManaCost(s, player, id, ab, "best");
      // Les permanents sacrifiés par défaut peuvent payer par une capacité qui ne les sacrifie pas (Trésor : non).
      const sacrificed = ab.cost.sacrifice ? sacrificeOptions(s, player, id, ab).slice(0, ab.cost.sacrifice.count) : [];
      const purpose = sacrificed.length
        ? { ...abilityPurpose(id, ab), sacrificedForCost: new Set(sacrificed) }
        : abilityPurpose(id, ab);
      if (ab.cost.mana && !canPay(s, player, abCost, exclude, purpose)) return;
      const targets = targetOptions(s, player, ab.targets, id);
      // Coût qui dépend de la cible : seules les cibles qui rendent la capacité payable sont proposées.
      if (ab.cost.mana && costDependsOnTarget(ab))
        for (const t of targets)
          if (t.id === "t")
            t.legal = t.legal.filter((c) =>
              canPay(s, player, abilityManaCost(s, player, id, ab, c), exclude, abilityPurpose(id, ab)),
            );
      if (!targetsAvailable(targets)) return;
      const xMax0 = ab.cost.loyaltyX
        ? (o.counters.loyalty ?? 0)
        : ab.cost.removeCountersX
          ? (o.counters[ab.cost.removeCountersX] ?? 0)
          : ab.cost.tapX
            ? tapXMax(
                s,
                player,
                id,
                ab.cost.tapX,
                (tapped, x) =>
                  !ab.cost.mana ||
                  canPay(
                    s,
                    player,
                    abilityManaCost(s, player, id, ab, "best", x),
                    new Set([...(exclude ?? []), ...tapped]),
                    purpose,
                  ),
              )
            : ab.cost.discardX
              ? (s.players[player]?.hand ?? []).filter((c) => c !== id).length
              : ab.cost.exileFromGraveyardX
                ? graveyardXOptions(s, player, id, ab.cost.exileFromGraveyardX)
                : ab.cost.sacrificeX
                  ? sacrificeXOptions(s, player, id, ab.cost.sacrificeX)
                  : maxX(s, player, ab.cost.mana, exclude, abilityPurpose(id, ab));
      // Krumar Initiate : « payez X points de vie » — X ne dépasse pas les points de vie.
      const xMax = ab.cost.payLifeX && xMax0 !== null ? Math.min(xMax0, Math.max(0, payableLife(s, player))) : xMax0;
      // « X ne peut pas être 0 » (et « sacrifiez X permanents », Radiant Lotus) : proposée seulement si X peut atteindre son
      // minimum.
      // Seul coût {X} (Helix Pinnacle) : à X = 0, l'activation est gratuite et sans effet ; elle n'est pas proposée (le
      // moteur l'accepte toujours), ce qui évite qu'une IA l'active sans fin.
      const onlyX =
        !!ab.cost.mana?.x &&
        !ab.cost.mana.generic &&
        !Object.values(ab.cost.mana.colored).some(Boolean) &&
        Object.keys(ab.cost).every((k) => k === "mana" || (ab.cost as Record<string, unknown>)[k] === undefined);
      const minX = ab.cost.minX ?? (ab.cost.sacrificeX || onlyX ? 1 : undefined);
      if (minX !== undefined && (xMax ?? 0) < minX) return;
      out.push({
        type: "activate",
        source: id,
        ability: index,
        label: ab.label,
        targets,
        xMax,
        ...(minX !== undefined ? { xMin: minX } : {}),
        // Objets payés en coût, quand le joueur a un choix à faire.
        ...(() => {
          const picks = activationPicks(s, player, id, ab).filter(
            (p) => p.atMost || p.countIsX || p.minTotal || p.options.length > p.count || (p.repeat && p.options.length > 1),
          );
          return picks.length ? { picks } : {};
        })(),
        additional:
          ab.cost.sacrifice || ab.cost.tapOthers || ab.cost.discard || ab.cost.crew !== undefined || ab.cost.craft
            ? {
                ...(ab.cost.sacrifice
                  ? { sacrifice: { count: ab.cost.sacrifice.count, options: sacrificeOptions(s, player, id, ab) } }
                  : {}),
                ...(ab.cost.discard
                  ? { discard: { count: ab.cost.discard, options: discardCostOptions(s, player, id, ab.cost.discardFilter) } }
                  : {}),
                // Station : le joueur choisit la créature à engager.
                ...(ab.cost.tapOthers
                  ? { tap: { count: ab.cost.tapOthers.count, options: tapOthersOptions(s, player, id, ab) } }
                  : {}),
                // Équipage, monture : le joueur choisit les créatures (force totale suffisante).
                ...(ab.cost.crew !== undefined ? { tap: crewSpec(s, player, id, ab.cost.crew) } : {}),
                // Fabrication : le joueur choisit ses matériaux.
                ...(ab.cost.craft ? { materials: craftSpec(s, player, id, ab) ?? undefined } : {}),
              }
            : undefined,
      });
    });
  }

  // Les sources restreintes aussi (Cavern of Souls) : engagées à la main, leur mana va dans la réserve marquée.
  for (const src of manaSources(s, player, undefined, { manual: true })) {
    if (src.ability < 0) continue;
    const ab = manaAbilitiesOf(s, src.id)[src.ability];
    if (ab) out.push({ type: "tapForMana", source: src.id, ability: src.ability, colors: ab.produce });
  }
  // 702.61 : second partagé — ni sorts ni capacités (hors mana) tant que le sort est sur la pile ; les actions spéciales
  // restent possibles (702.61b).
  if (splitSecondOnStack(s))
    return out.filter(
      (a) =>
        a.type === "pass" ||
        a.type === "tapForMana" ||
        (a.type === "activate" && !!activatedAbility(s, a.source, a.ability)?.specialAction),
    );
  // 608.2g : pendant une résolution, seulement les cartes proposées (ou passer pour refuser).
  const now = p.castNow;
  if (now)
    return out.filter((a) => a.type === "pass" || a.type === "tapForMana" || (a.type === "cast" && now.cards.includes(a.card)));
  return out;
}

/** Actions « significatives » : tout sauf passer et produire du mana. */
export function meaningfulActions(s: GameState, player: PlayerId): ActionOption[] {
  return legalActions(s, player).filter((a) => a.type !== "pass" && a.type !== "tapForMana");
}
