/**
 * Évaluation d'une position du point de vue d'un joueur, et simulation par clonage de l'état.
 *
 * Les créatures sont estimées d'après leurs caractéristiques **durables** : celles du champ de bataille, sans les
 * effets « jusqu'à la fin du tour ». Une Aura (Pacifisme), un Équipement ou un renfort permanent comptent donc
 * par leur effet sur la créature ; un renfort temporaire ne compte que par ce qu'il change au combat.
 */
import {
  applyMutable,
  type CardDef,
  type Characteristics,
  chars,
  cloneState,
  commanderOf,
  computeBattlefield,
  type Decision,
  fallbackDecision,
  type GameState,
  type ObjectId,
  opponentsOf,
  type PlayerId,
  RulesError,
  submit,
} from "@mtgx/engine";

// ---------------------------------------------------------------------------
// Valeur des créatures
// ---------------------------------------------------------------------------

type Profile = Pick<Characteristics, "power" | "toughness" | "keywords" | "abilities">;

/**
 * Valeur d'une créature : une part offensive (force, évasion) et une part défensive (endurance, blocage).
 * « Ne peut pas attaquer » annule la première, « ne peut pas bloquer » l'essentiel de la seconde (Pacifisme : les deux).
 */
export function profileValue(c: Profile): number {
  const p = Math.max(0, c.power);
  const t = c.toughness;
  if (t <= 0) return 0;
  const k = new Set(c.keywords);
  let offense = p * 0.6;
  if (k.has("flying")) offense += 0.4 + p * 0.3;
  if (k.has("unblockable")) offense += p * 0.4;
  if (k.has("menace")) offense += p * 0.15;
  if (k.has("trample")) offense += p * 0.1;
  if (k.has("doubleStrike")) offense += p * 0.6;
  if (k.has("lifelink")) offense += p * 0.25;
  if (k.has("deathtouch")) offense += 0.5;
  let defense = t * 0.4;
  if (k.has("deathtouch")) defense += 0.5;
  if (k.has("firstStrike")) defense += 0.3 + p * 0.1;
  if (k.has("reach")) defense += 0.2;
  if (k.has("vigilance")) defense += 0.3;
  const cantAttack = (k.has("cantAttack") || k.has("defender")) && !k.has("attacksDespiteDefender");
  if (cantAttack) offense = 0;
  if (k.has("cantBlock")) defense *= 0.2;
  let v = 0.5 + offense + defense;
  if (k.has("hexproof")) v += 0.6;
  if (k.has("indestructible")) v += 1.5;
  if (k.has("doesntUntap")) v *= 0.4;
  for (const a of c.abilities) v += a.kind === "mana" ? 0.6 : 0.4;
  return v;
}

/** Valeur d'une créature d'après sa définition (carte en main, au cimetière…) et ses marqueurs +1/+1. */
export function creatureValue(d: CardDef, counters = 0): number {
  return profileValue({
    power: (d.power ?? 0) + counters,
    toughness: (d.toughness ?? 0) + counters,
    keywords: d.keywords,
    abilities: d.abilities,
  });
}

/**
 * Caractéristiques durables du champ de bataille : sans les effets « jusqu'à la fin du tour ».
 * Sans effet temporaire (cas courant), ce sont les caractéristiques en cache du moteur.
 */
export function durableChars(s: GameState): (id: ObjectId) => Characteristics {
  if (!s.effects.some((e) => e.duration === "endOfTurn")) return (id) => chars(s, id);
  const map = computeBattlefield({ ...s, effects: s.effects.filter((e) => e.duration !== "endOfTurn") });
  return (id) => map.get(id) ?? chars(s, id);
}

/** Valeur de la vie : chaque point compte davantage quand on est bas. */
export function lifeValue(life: number): number {
  return life <= 0 ? -1000 : 8 * Math.log(1 + life);
}

/**
 * Points de vie « effectifs » (Commander, PLAN-E) : les points de vie, réduits en proportion des blessures de combat
 * reçues du commandant le plus menaçant (21 tuent, 704.6c) ; sans blessure de commandant, les points de vie.
 */
export function effectiveLife(s: GameState, p: PlayerId): number {
  const life = s.players[p]?.life ?? 0;
  if (!s.commander) return life;
  let worst = 0;
  for (const c of Object.values(s.commander.cards)) worst = Math.max(worst, c.damage[p] ?? 0);
  return worst > 0 ? (life * Math.max(0, 21 - worst)) / 21 : life;
}

/**
 * Commander (PLAN-E) : un commandant qui attend dans la zone de commandement est une menace toujours disponible ; il
 * vaut un peu moins qu'une fois en jeu, et d'autant moins que sa taxe est élevée.
 */
function commandZoneValue(s: GameState, p: PlayerId): number {
  let v = 0;
  for (const id of s.players[p]?.command ?? []) {
    const o = s.objects[id];
    const c = commanderOf(s, o);
    const d = o ? s.defs[o.defId] : undefined;
    if (c && d) v += (0.6 * creatureValue(d)) / (1 + c.casts / 2);
  }
  return v;
}

/**
 * Valeur d'une carte en main : un potentiel. Un permanent vaut moins en main qu'une fois en jeu (où il agit) ;
 * un éphémère ou un rituel garde sa souplesse jusqu'au bon moment.
 */
function handCardValue(d: CardDef): number {
  if (d.types.includes("Land")) return 0.3;
  if (d.types.includes("Instant") || d.types.includes("Sorcery")) return 1.5;
  return 0.7;
}

/**
 * Adversaire visé en priorité : le plus bas en points de vie (à égalité, le plus menaçant sur le plateau).
 * En duel, c'est simplement l'adversaire.
 */
export function targetOpponent(s: GameState, me: PlayerId): PlayerId {
  const opps = opponentsOf(s, me);
  const power = (p: PlayerId) =>
    s.battlefield.reduce((n, id) => {
      const o = s.objects[id];
      return o?.controller === p ? n + (s.defs[o.defId]?.power ?? 0) : n;
    }, 0);
  return [...opps].sort((a, b) => effectiveLife(s, a) - effectiveLife(s, b) || power(b) - power(a))[0] ?? me;
}

// ---------------------------------------------------------------------------
// Menace adverse au prochain tour (niveau élevé)
// ---------------------------------------------------------------------------

/**
 * Blessures que les adversaires peuvent infliger à `me` à leur prochaine attaque, d'après les bloqueurs dont
 * `me` disposera (ses créatures dégagées : celles qui ont attaqué restent engagées jusqu'à son prochain tour).
 * Estimation simple : les créatures volantes passent si `me` n'a ni vol ni portée ; chaque bloqueur arrête
 * un des plus gros attaquants restants.
 */
export function incomingDamage(s: GameState, me: PlayerId, dc = durableChars(s)): number {
  const creatures = (p: PlayerId) =>
    s.battlefield.filter((id) => s.objects[id]?.controller === p && dc(id).types.includes("Creature"));
  const blockers = creatures(me).filter((id) => !s.objects[id]?.tapped && !dc(id).keywords.includes("cantBlock"));
  const airBlockers = blockers.filter((id) => dc(id).keywords.some((k) => k === "flying" || k === "reach")).length;
  const ground: number[] = [];
  let air = 0;
  for (const p of opponentsOf(s, me)) {
    for (const id of creatures(p)) {
      const k = dc(id).keywords;
      if ((k.includes("cantAttack") || k.includes("defender")) && !k.includes("attacksDespiteDefender")) continue;
      if (k.includes("doesntUntap") && s.objects[id]?.tapped) continue;
      const dmg = Math.max(0, dc(id).power) * (k.includes("doubleStrike") ? 2 : 1);
      if (dmg === 0) continue;
      if (k.includes("unblockable") || (k.includes("flying") && airBlockers === 0)) air += dmg;
      else ground.push(dmg);
    }
  }
  ground.sort((a, b) => b - a);
  return air + ground.slice(blockers.length).reduce((a, b) => a + b, 0);
}

// ---------------------------------------------------------------------------
// Évaluation
// ---------------------------------------------------------------------------

export interface EvalOptions {
  /** Tenir compte de la contre-attaque adverse (pendant son propre tour). */
  exposure?: boolean;
}

/**
 * Évaluation du point de vue de `me`. En multijoueur, chaque adversaire pèse 1/n :
 * affaiblir un seul adversaire compte moins que gagner soi-même. En duel, rien ne change.
 */
export function evaluate(s: GameState, me: PlayerId, opts: EvalOptions = {}): number {
  const mine = s.players[me];
  if (!mine) return 0;
  if (s.over) return s.winner === me ? 1e6 : -1e6 + mine.life * 100;
  if (mine.lost) return -1e6 + mine.life * 100;
  const opps = opponentsOf(s, me);
  const w = 1 / Math.max(1, opps.length);
  let score = lifeValue(effectiveLife(s, me));
  for (const p of opps) score -= w * lifeValue(effectiveLife(s, p));
  if (s.commander) {
    score += commandZoneValue(s, me);
    for (const p of opps) score -= w * commandZoneValue(s, p);
  }

  const dc = durableChars(s);
  const lands: Record<PlayerId, number> = {};
  for (const id of s.battlefield) {
    const o = s.objects[id];
    if (!o) continue;
    const c = dc(id);
    const sign = c.controller === me ? 1 : -w;
    let v: number;
    if (c.types.includes("Creature")) v = profileValue(c);
    // Planeswalker : vaut d'autant plus qu'il a de loyauté (source d'avantage à chaque tour).
    else if (c.types.includes("Planeswalker")) v = 3 + (o.counters.loyalty ?? 0) * 0.9;
    else if (c.types.includes("Land")) {
      // Au-delà de 7 terrains, un terrain de plus apporte peu.
      lands[c.controller] = (lands[c.controller] ?? 0) + 1;
      v = (lands[c.controller] ?? 0) > 7 ? 0.4 : 1;
    }
    // Équipement : une valeur propre, attaché ou non (il peut changer de porteur) ; son effet se lit sur la créature
    // équipée. Aura attachée : sa valeur se lit sur son hôte (elle part avec lui).
    else if (c.subtypes.includes("Equipment")) v = 1.1;
    else if (o.attachedTo) v = 0.3;
    else v = 1 + Math.min(1, c.abilities.length * 0.3);
    score += sign * v;
  }
  // Emblèmes : avantage permanent (jetons de la zone de commandement ; un commandant qui attend n'en est pas un).
  const emblems = (p: string) => (s.players[p]?.command ?? []).filter((id) => s.objects[id]?.isToken).length;
  score += emblems(mine.id) * 8;
  for (const p of opps) score -= w * emblems(p) * 8;
  for (const id of mine.hand) {
    const d = s.defs[s.objects[id]?.defId ?? ""];
    if (d) score += handCardValue(d);
  }
  for (const p of opps) score -= w * (s.players[p]?.hand.length ?? 0) * 1.1;
  if (mine.library.length === 0) score -= 5;

  if (opts.exposure && s.turn.active === me) {
    // Ce que la contre-attaque coûterait : la moitié de la perte de vie (l'adversaire peut ne pas attaquer),
    // mais une contre-attaque létale est très lourdement pénalisée.
    const dmg = incomingDamage(s, me, dc);
    if (dmg > 0) score -= dmg >= mine.life ? 40 : 0.5 * (lifeValue(mine.life) - lifeValue(mine.life - dmg));
  }
  return score;
}

// ---------------------------------------------------------------------------
// Simulation
// ---------------------------------------------------------------------------

/**
 * Seules les décisions illégales (RulesError) sont attendues dans une simulation : toute autre erreur est un bug du
 * moteur et remonte (le fuzz la voit ; en partie, GameHost se replie sur la décision par défaut).
 */
export function onlyRulesErrors(e: unknown): void {
  if (!(e instanceof RulesError)) throw e;
}

export function trySubmit(s: GameState, player: PlayerId, d: Decision): GameState | null {
  try {
    return submit(s, player, d).state;
  } catch (e) {
    onlyRulesErrors(e);
    return null;
  }
}

/**
 * Tout le monde passe jusqu'à ce que `until` soit vrai, ou qu'une décision autre que la priorité apparaisse. `owned` :
 * `s` est déjà une copie de travail que l'appelant ne relit pas (résultat de `trySubmit`), modifiée sur place.
 */
export function rollout(s: GameState, until: (s: GameState) => boolean, max = 60, owned = false): GameState {
  if (s.over || s.pending?.kind !== "priority" || until(s)) return s;
  // Une seule copie, puis on mute la copie de travail : passer est toujours légal.
  const cur = owned ? s : cloneState(s);
  for (let i = 0; i < max && !cur.over && cur.pending?.kind === "priority" && !until(cur); i++) {
    applyMutable(cur, cur.pending.player, { type: "pass" });
  }
  return cur;
}

/**
 * Applique une décision dans une simulation. Passer (toujours légal, et de loin le plus fréquent) modifie la copie
 * de travail sur place ; toute autre décision passe par `submit`, qui travaille sur une copie : si elle est illégale,
 * l'exception laisse `cur` intact (`applyMutable` n'est pas transactionnel).
 * `owned` : `cur` est déjà une copie de travail qu'on peut modifier.
 */
export function step(cur: GameState, player: PlayerId, d: Decision, owned: boolean): GameState {
  if (d.type === "pass" && owned) {
    applyMutable(cur, player, d);
    return cur;
  }
  return submit(cur, player, d).state;
}

/**
 * Comme `rollout`, mais chaque décision reçoit la réponse par défaut (passer, choix suggéré, blocages obligatoires…) :
 * la simulation traverse les choix de résolution et de combat (répartition des blessures, cibles de déclencheurs).
 */
export function simulate(s: GameState, until: (s: GameState) => boolean, max = 120): GameState {
  if (s.over || !s.pending || until(s)) return s;
  let cur = cloneState(s);
  for (let i = 0; i < max && !cur.over && cur.pending && !until(cur); i++) {
    try {
      cur = step(cur, cur.pending.player, fallbackDecision(cur, cur.pending), true);
    } catch (e) {
      onlyRulesErrors(e);
      break;
    }
  }
  return cur;
}

export const stackEmpty = (s: GameState) => s.stack.length === 0;

export function afterCombat(turn: number) {
  return (s: GameState) =>
    s.stack.length === 0 && (s.turn.number !== turn || ["endCombat", "main2", "end", "cleanup"].includes(s.turn.step));
}
