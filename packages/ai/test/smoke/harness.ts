/**
 * Test de fumée des cartes gérées : chaque carte est jouée dans une position préparée (mana de toutes les
 * couleurs, cibles de chaque sorte, cimetières garnis), puis chacune de ses capacités activées est utilisée ;
 * la partie continue un peu. Aucune exception inattendue ni violation d'invariant n'est tolérée.
 *
 * Un fichier par extension (`smoke/<set>.test.ts`) appelle `smokeTest` : vitest les répartit sur tous les cœurs.
 */
import { CARDS, SETS } from "@mtgx/cards";
import {
  type Agent,
  type CardDef,
  type Decision,
  fallbackDecision,
  type GameState,
  legalActions,
  RulesError,
  submit,
} from "@mtgx/engine";
import { describe, expect, it } from "vitest";
import { scenario } from "../../../engine/test/helpers";
import { enumerateDecisions, randomAgent } from "../../src";
import { checkInvariants } from "../../src/selfplay";

const LANDS = ["Plains", "Island", "Swamp", "Mountain", "Forest"].flatMap((l) => [l, l, l]);
const LIBRARY = [
  "Forest",
  "Llanowar Elves",
  "Opt",
  "Island",
  "Giant Growth",
  "Plains",
  "Helpful Hunter",
  "Swamp",
  "Stab",
  "Mountain",
  "Shivan Dragon",
  "Forest",
  "Dragon Fodder",
  "Island",
  "Prideful Parent",
  "Plains",
];

/** Permanents supplémentaires du joueur 1 pour les cartes qui en exigent (« Enchant artifact you control »). */
const EXTRA_P1: Record<string, string[]> = {
  // « En coût additionnel, sacrifiez une créature légendaire » (Commander).
  "Ultimate Nullification": ["Invisible Woman"],
  // Lorwyn Eclipsed : « contemplez un [type] et exilez-le » (un changelin convient).
  "Champion of the Weird": ["Changeling Wayfinder"],
  "Champion of the Path": ["Changeling Wayfinder"],
  "Champion of the Clachan": ["Changeling Wayfinder"],
  "Champions of the Shoal": ["Changeling Wayfinder"],
  "Hardlight Containment": ["Nutrient Block"],
  // {C} : une source de mana incolore.
  "Warping Wail": ["Ancient Tomb"],
  // Deck The Vision : {C}, {C}{C} ou {C}{C}{C} (Ancient Tomb, Sol Ring).
  "Eldritch Immunity": ["Ancient Tomb"],
  "Null Elemental Blast": ["Ancient Tomb"],
  "Glaring Fleshraker": ["Ancient Tomb"],
  "Eldrazi Confluence": ["Ancient Tomb"],
  "Kozilek's Command": ["Ancient Tomb"],
  "Echoes of Eternity": ["Ancient Tomb", "Sol Ring"],
  // {B}{B}{B}{B}{B} : trois Marais ne suffisent pas.
  "Zodiark, Umbral God": ["Swamp", "Swamp"],
  "Pox Plague": ["Swamp", "Swamp"],
  // {B}{B}{B}{B}{B}{B} et {X}{X}{B}{B}{B}{B}.
  "Doomsday Excruciator": ["Swamp", "Swamp", "Swamp"],
  "Meathook Massacre II": ["Swamp", "Swamp"],
  // {U}{U}{U}{U} : trois Îles ne suffisent pas.
  "Secret of Bloodbending": ["Island"],
  // {W}{W}{W}{W}{W} : trois Plaines ne suffisent pas.
  "Anti-Venom, Horrifying Healer": ["Plains", "Plains"],
  // « un Équipement ciblé ».
  "Stolen Uniform": ["Monk's Fist"],
  // « copies d'un jeton ciblé » : Fountainport crée un Poisson.
  "For the Common Good": ["Fountainport"],
};
/** Cartes supplémentaires dans le cimetière du joueur 1 (« carte d'artefact ciblée de votre cimetière »). */
const EXTRA_P1_GRAVEYARD: Record<string, string[]> = {
  "Tune Up": ["Nutrient Block"],
  "Abuelo's Awakening": ["Nutrient Block"],
  // « carte de Méchant ou de Héros ciblée de votre cimetière ».
  "Decoy Ploy": ["Swordsman, Sharp Scoundrel"],
};

/** Cartes supplémentaires dans la main du joueur 2 (contresorts qui visent un sort de VM 4 ou plus). */
const EXTRA_P2_HAND: Record<string, string[]> = {
  "Disdainful Stroke": ["Serra Angel"],
  "Hindering Light": ["Shock"],
};
/** Permanents supplémentaires du joueur 2 (de quoi lancer ces sorts). */
const EXTRA_P2: Record<string, string[]> = { "Hindering Light": ["Mountain"] };
/**
 * Contresorts exigeants (« VM 4 ou plus ») : la partie commence au tour du joueur 2, qui lance ce sort ; le joueur 1 a
 * la priorité pour y répondre.
 */
const P2_CASTS_FIRST: Record<string, string> = {
  "Disdainful Stroke": "Serra Angel",
  // « un sort qui cible un permanent que vous contrôlez » : Shock vise une créature du joueur 1.
  "Hindering Light": "Shock",
};

function setup(c: CardDef): GameState {
  const first = P2_CASTS_FIRST[c.name];
  const s = scenario({
    turn: 3,
    active: first ? "p2" : "p1",
    p1: {
      battlefield: [
        ...LANDS,
        "Llanowar Elves",
        "Prideful Parent",
        "Sanguine Syphoner",
        "Diregraf Ghoul",
        ...(EXTRA_P1[c.name] ?? []),
      ],
      hand: [c, "Forest"],
      graveyard: [
        "Opt",
        "Stab",
        "Helpful Hunter",
        "Llanowar Elves",
        "Forest",
        "Bake into a Pie",
        "Giant Growth",
        "Zombify",
        ...(EXTRA_P1_GRAVEYARD[c.name] ?? []),
      ],
      library: LIBRARY,
    },
    p2: {
      battlefield: [
        ...LANDS.slice(0, 6),
        "Shivan Dragon",
        "Llanowar Elves",
        "Gleaming Barrier",
        "Anthem of Champions",
        ...(EXTRA_P2[c.name] ?? []),
      ],
      hand: [
        "Giant Growth",
        "Opt",
        "Forest",
        "Llanowar Elves",
        "Helpful Hunter",
        "Goblin Firebomb",
        ...(EXTRA_P2_HAND[c.name] ?? []),
      ],
      graveyard: ["Pelakka Wurm", "Think Twice"],
      library: LIBRARY,
    },
  });
  if (!first) return s;
  const spell = s.players.p2?.hand.find((id) => s.defs[s.objects[id]?.defId ?? ""]?.name === first) as string;
  // Ses cibles, de préférence chez le joueur 1.
  const opt = legalActions(s, "p2").find((a) => a.type === "cast" && a.card === spell);
  const targets =
    opt?.type === "cast"
      ? Object.fromEntries(
          (opt.modes[0]?.targets ?? []).map((t) => [
            t.id,
            [...t.legal.filter((id) => s.objects[id]?.controller === "p1"), ...t.legal].slice(0, 1),
          ]),
        )
      : undefined;
  const cast = submit(s, "p2", { type: "cast", card: spell, targets }).state;
  return submit(cast, "p2", { type: "pass" }).state;
}

/** Joueur 1 : essaie chaque sort et chaque capacité (une fois par carte et par zone), le reste au hasard. */
function explorer(seed: number): Agent {
  const rand = randomAgent(seed, 0.2);
  const tried = new Set<string>();
  return (s, me) => {
    if (s.pending?.kind !== "priority") return rand(s, me);
    for (const a of legalActions(s, me)) {
      if (a.type === "pass" || a.type === "tapForMana") continue;
      const id = a.type === "activate" ? a.source : a.card;
      const o = s.objects[id];
      const key = `${a.type}:${o?.defId}:${o?.zone}:${a.type === "activate" ? a.ability : ""}`;
      if (tried.has(key)) continue;
      tried.add(key);
      const ds = enumerateDecisions(a, 4);
      // Une décision du milieu, sinon la première que le moteur accepte (contraintes de cibles qu'il ne voit pas :
      // « deux cartes qui partagent un type de créature », Unbury).
      const mid = Math.floor(ds.length / 2);
      const d = [...ds.slice(mid), ...ds.slice(0, mid)].find((x) => {
        try {
          submit(s, me, x);
          return true;
        } catch (e) {
          if (e instanceof RulesError) return false;
          throw e;
        }
      });
      if (d) return d;
    }
    return { type: "pass" };
  };
}

function play(c: CardDef, seed: number): { state: GameState; illegal: number; played: boolean } {
  let state = setup(c);
  const sizes: Record<string, number> = {};
  for (const o of Object.values(state.objects)) if (!o.isToken) sizes[o.owner] = (sizes[o.owner] ?? 0) + 1;
  const agents: Record<string, Agent> = { p1: explorer(seed), p2: randomAgent(seed + 1, 0.6) };
  let illegal = 0;
  let played = false;
  let playedAt = -1;
  for (let i = 0; i < 700 && state.pending && !state.over && state.turn.number <= 8; i++) {
    if (playedAt >= 0 && i - playedAt > AFTER_PLAYED) break;
    const p = state.pending;
    let d: Decision = (agents[p.player] as Agent)(state, p.player);
    try {
      state = submit(state, p.player, d).state;
    } catch (e) {
      if (!(e instanceof RulesError)) throw new Error(`${c.name} : ${(e as Error).stack}`);
      illegal++;
      d = fallbackDecision(state, p);
      state = submit(state, p.player, d).state;
    }
    if ((d.type === "cast" || d.type === "playLand") && state.objects[d.card] === undefined) {
      played ||= Object.values(state.objects).some((o) => o.defId === c.id && o.zone !== "hand" && o.zone !== "library");
      if (played && playedAt < 0) playedAt = i;
    }
    const errors = checkInvariants(state, sizes);
    if (errors.length) throw new Error(`${c.name} (décision ${i}) :\n${errors.join("\n")}`);
  }
  return { state, illegal, played };
}

/** Décisions jouées après que la carte a été jouée, avant d'arrêter la partie (ses effets ont eu le temps d'agir). */
const AFTER_PLAYED = 80;

// Toutes les cartes gérées, sauf les terrains de base.
const cards = Object.values(CARDS).filter((c) => !c.isToken && c.implemented && !c.meldResult && !c.supertypes.includes("Basic"));

/**
 * Déclare le test de fumée des cartes d'une ou plusieurs extensions. `shard` : [i, n] ne garde qu'une carte sur n
 * (pour découper une grosse extension en plusieurs fichiers, donc plusieurs workers).
 */
export function smokeTest(codes: string[], shard: [number, number] = [0, 1]): void {
  const names = new Map(SETS.map((s) => [s.code, s.name]));
  for (const code of codes) {
    const list = cards.filter((c) => c.set === code).filter((_, k) => k % shard[1] === shard[0]);
    if (list.length === 0) continue;
    describe(`test de fumée des cartes : ${names.get(code) ?? code}`, () => {
      it.each(list.map((c) => [c.name, c] as const))("%s", (_, c) => {
        let playedOnce = false;
        // Graines suivantes seulement tant que la carte n'a pas pu être jouée.
        for (const seed of [1, 2, 3]) {
          const { state, played } = play(c, seed);
          expect(state.pending || state.over).toBeTruthy();
          playedOnce ||= played;
          if (playedOnce) break;
        }
        // La carte a bien été jouée (lancée ou posée) au moins une fois.
        expect(playedOnce, `${c.name} n'a pas pu être jouée`).toBe(true);
      });
    });
  }
}

/** Extensions qui ont leur propre fichier de test de fumée ; les autres sont dans `others.test.ts`. */
export const OWN_FILES = [
  "FDN",
  "FRA",
  "EOE",
  "DFT",
  "OTJ",
  "BIG",
  "FIN",
  "DSK",
  "BLB",
  "LCI",
  "TDM",
  "ECL",
  "WOE",
  "SOS",
  "MKM",
  "TLA",
  "MSH",
  "SPM",
  "TMT",
  "HOB",
  "SPG",
  "SOA",
  "FCA",
  "OTP",
  "EOS",
  "PZA",
  "WOT",
  "REX",
  "EDH",
];
export const OTHER_SETS = (): string[] => SETS.map((s) => s.code).filter((c) => !OWN_FILES.includes(c));
