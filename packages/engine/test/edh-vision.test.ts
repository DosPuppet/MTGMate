/**
 * Commander (pseudo-ensemble EDH) : tests de règles du deck « Weight of the World » (The Vision, incolore), et des cartes de réserve du jeu de proxys. Artefacts qui
 * se dégagent, Équipements, terrains d'Urza, sorts et créatures incolores, trois Ugin et Karn, Living Legacy.
 */
import { describe, expect, it } from "vitest";
import { bump, chars, snapshot } from "../src/layers";
import { legalActions } from "../src/legal";
import { manaAbilitiesOf } from "../src/mana";
import { protectedFrom } from "../src/targets";
import { msg, plainText } from "../src/text";
import type { ActionOption, ChoiceRequest, GameState, ObjectId, PlayerId } from "../src/types";
import {
  act,
  advanceUntil,
  attack,
  canActivate,
  castable,
  idOf,
  idsOf,
  lands,
  nameOf,
  namesIn,
  passAccepting,
  picking,
  scenario,
  settle,
  settleNoBlocks,
  throughCombat,
} from "./helpers";

type S = GameState;
/** Fait d'un objet un commandant (déjà sur le champ de bataille). */
function makeCommander(s: S, id: ObjectId): S {
  const o = s.objects[id];
  if (!o) throw new Error("objet introuvable");
  s.commander ??= { cards: {} };
  s.commander.cards[o.uid] = { owner: o.owner, defId: o.defId, casts: 0, damage: {} };
  bump(s);
  return s;
}
const castIt = (s: S, p: PlayerId, name: string, extra: object = {}) =>
  act(s, p, { type: "cast", card: idOf(s, p, "hand", name), ...extra } as never);
const activations = (s: S, p: PlayerId, source: ObjectId) =>
  legalActions(s, p).filter(
    (a): a is Extract<ActionOption, { type: "activate" }> => a.type === "activate" && a.source === source,
  );
/** Active la capacité de rang `index` (dans la définition) de cette source. */
const activate = (s: S, p: PlayerId, source: ObjectId, index?: number, extra: object = {}) => {
  const o = activations(s, p, source).find((a) => index === undefined || a.ability === index);
  if (!o) throw new Error(`pas de capacité ${index ?? ""} pour ${nameOf(s, source)}`);
  return act(s, p, { type: "activate", source, ability: o.ability, ...extra } as never);
};
/** Engage la source pour du mana (la première capacité de mana proposée, ou celle de rang `ability`). */
const tapMana = (s: S, name: string, ability?: number, color?: string, player: PlayerId = "p1") => {
  const source = idOf(s, player, "battlefield", name);
  const o = legalActions(s, player).find(
    (a) => a.type === "tapForMana" && a.source === source && (ability === undefined || a.ability === ability),
  );
  if (o?.type !== "tapForMana") throw new Error(`pas de mana pour ${name}`);
  return act(s, player, { type: "tapForMana", source, ability: o.ability, ...(color ? { color } : {}) } as never);
};
const pool = (s: S, p: PlayerId = "p1") => s.players[p]?.manaPool;
const handNames = (s: S, p: PlayerId) => namesIn(s, s.players[p]?.hand).sort();
const tokens = (s: S, name: string, p: PlayerId = "p1") =>
  s.battlefield.filter((id) => s.objects[id]?.isToken && s.objects[id]?.controller === p && nameOf(s, id) === name);
const pt = (s: S, id: string) => [chars(s, id).power, chars(s, id).toughness];
/** Choisit le mode dont le libellé est donné (sort modal ou capacité déclenchée modale). */
const modeNamed = (label: string) => (req: ChoiceRequest) =>
  req.type === "pick" && req.intent === "triggerMode"
    ? Object.entries(req.labels ?? {})
        .filter(([, l]) => plainText(l) === label)
        .map(([k]) => k)
    : undefined;
/** Rang du mode d'un sort dont le libellé est donné. */
const spellMode = (s: S, p: PlayerId, card: string, label: string) => {
  const m = legalActions(s, p)
    .flatMap((a) => (a.type === "cast" && a.card === card ? a.modes : []))
    .find((x) => plainText(x.label ?? "") === label);
  if (!m) throw new Error(`pas de mode « ${label} »`);
  return m.index;
};
/** L'option de lancer de la carte (modes, cibles, gratuité). */
const castOption = (s: S, p: PlayerId, card: string) => {
  const o = legalActions(s, p).find((a) => a.type === "cast" && a.card === card);
  return o?.type === "cast" ? o : undefined;
};

/** Active la capacité dont le libellé commence ainsi (capacités de loyauté : « +1 », « −3 »…). */
const activateLabeled = (s: S, p: PlayerId, source: ObjectId, prefix: string, extra: object = {}) => {
  const o = activations(s, p, source).find((a) => plainText(a.label ?? "").startsWith(prefix));
  if (!o) throw new Error(`pas de capacité « ${prefix} » pour ${nameOf(s, source)}`);
  return act(s, p, { type: "activate", source, ability: o.ability, ...extra } as never);
};
/** Active la capacité d'Équiper (la première proposée, ou celle dont le libellé commence ainsi) sur la créature. */
const equip = (s: S, equipment: string, creature: ObjectId, label = "Equip", p: PlayerId = "p1") => {
  const source = idOf(s, p, "battlefield", equipment);
  const o = activations(s, p, source).find(
    (a) => plainText(a.label ?? "").startsWith(label) && a.targets[0]?.legal.includes(creature),
  );
  if (!o) throw new Error(`pas d'Équiper « ${label} » pour ${equipment}`);
  return settle(act(s, p, { type: "activate", source, ability: o.ability, targets: { t: [creature] } } as never));
};
/** Les créatures que la capacité d'Équiper de ce libellé peut viser. */
const equipTargets = (s: S, equipment: string, label: string, p: PlayerId = "p1") =>
  namesIn(
    s,
    activations(s, p, idOf(s, p, "battlefield", equipment)).find((a) => plainText(a.label ?? "").startsWith(label))?.targets[0]
      ?.legal ?? [],
  ).sort();

describe("The Vision (EDH)", () => {
  describe("artefacts", () => {
    it("Basalt Monolith : {C}{C}{C}, ne se dégage pas lors de votre étape de dégagement, {3} : dégagez-le", () => {
      let s = scenario({ p1: { battlefield: ["Basalt Monolith", ...lands("Wastes", 3)] } });
      s = tapMana(s, "Basalt Monolith");
      expect(pool(s)?.C).toBe(3);
      const monolith = idOf(s, "p1", "battlefield", "Basalt Monolith");
      // {3} : dégagez-le (payé avec le mana qu'il vient de produire).
      s = settle(activate(s, "p1", monolith, 2));
      expect(s.objects[monolith]?.tapped).toBe(false);
      s = tapMana(s, "Basalt Monolith");
      // Le tour suivant de p1 : il reste engagé.
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.turn.number > 3);
      expect(s.objects[monolith]?.tapped).toBe(true);
    });

    it("Cloud Key : les sorts du type choisi coûtent {1} de moins", () => {
      let s = scenario({ p1: { hand: ["Cloud Key", "Sol Ring", "Shock"], battlefield: lands("Wastes", 3) } });
      s = settle(castIt(s, "p1", "Cloud Key"), (req) =>
        req.type === "pick" && req.options.includes("Artifact") ? ["Artifact"] : undefined,
      );
      expect(s.objects[idOf(s, "p1", "battlefield", "Cloud Key")]?.chosen?.mode).toBe("Artifact");
      // Sol Ring ({1}) ne coûte plus rien : lançable sans terrain dégagé.
      expect(castable(s, "p1", idOf(s, "p1", "hand", "Sol Ring"))).toBe(true);
      s = settle(castIt(s, "p1", "Sol Ring"));
      expect(idsOf(s, "p1", "battlefield", "Sol Ring")).toHaveLength(1);
      // Shock (éphémère, rouge) n'est pas concerné : pas de mana rouge, pas de réduction.
      expect(castable(s, "p1", idOf(s, "p1", "hand", "Shock"))).toBe(false);
    });

    it("Darksteel Forge : vos artefacts ont l'indestructible", () => {
      let s = scenario({
        p1: { battlefield: ["Darksteel Forge", "Sol Ring"] },
        p2: { hand: ["Vindicate"], battlefield: ["Plains", "Swamp", "Swamp"] },
        active: "p2",
      });
      const ring = idOf(s, "p1", "battlefield", "Sol Ring");
      expect(chars(s, ring).keywords).toContain("indestructible");
      s = settle(castIt(s, "p2", "Vindicate", { targets: { t: [ring] } }));
      expect(s.objects[ring]?.zone).toBe("battlefield");
    });

    it("Darksteel Monolith : une fois par tour, un sort incolore de votre main sans payer son coût de mana", () => {
      let s = scenario({ p1: { battlefield: ["Darksteel Monolith"], hand: ["Basalt Monolith", "Mox Opal", "Shock"] } });
      const basalt = idOf(s, "p1", "hand", "Basalt Monolith");
      expect(castOption(s, "p1", basalt)?.freeAvailable).toBe(true);
      expect(castable(s, "p1", idOf(s, "p1", "hand", "Shock"))).toBe(false);
      s = settle(castIt(s, "p1", "Basalt Monolith", { free: true }));
      expect(idsOf(s, "p1", "battlefield", "Basalt Monolith")).toHaveLength(1);
      // Une fois par tour : Mox Opal ({0}) reste lançable normalement, mais plus gratuitement par la permission.
      const mox = idOf(s, "p1", "hand", "Mox Opal");
      expect(castOption(s, "p1", mox)?.freeAvailable).toBeFalsy();
      expect(castable(s, "p1", mox)).toBe(true);
    });

    it("Forsaken Monument : +2/+2 à vos créatures incolores, un {C} de plus par permanent engagé pour {C}, 2 PV par sort incolore", () => {
      let s = scenario({
        p1: { battlefield: ["Forsaken Monument", "Sol Ring", "Shimmer Myr", "Bear Cub", "Command Tower"], hand: ["Mox Opal"] },
      });
      expect(pt(s, idOf(s, "p1", "battlefield", "Shimmer Myr"))).toEqual([4, 4]);
      expect(pt(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toEqual([2, 2]);
      s = tapMana(s, "Sol Ring");
      expect(pool(s)?.C).toBe(3);
      s = settle(castIt(s, "p1", "Mox Opal"));
      expect(s.players.p1?.life).toBe(22);
    });

    it("Gerrard's Hourglass Pendant : les tours supplémentaires sont passés ; les permanents morts ce tour-ci reviennent engagés", () => {
      let s = scenario({
        p1: { battlefield: ["Gerrard's Hourglass Pendant", "Bear Cub", ...lands("Wastes", 4)], graveyard: ["Sol Ring"] },
        p2: { hand: ["Shock"], battlefield: ["Mountain"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      // Bear Cub meurt ce tour-ci ; Sol Ring était déjà au cimetière.
      s = act(s, "p1", { type: "pass" });
      s = settle(castIt(s, "p2", "Shock", { targets: { t: [bear] } }));
      expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Gerrard's Hourglass Pendant")));
      const back = idOf(s, "p1", "battlefield", "Bear Cub");
      expect(s.objects[back]?.tapped).toBe(true);
      expect(idsOf(s, "p1", "graveyard", "Sol Ring")).toHaveLength(1);
      expect(s.exile.some((id) => nameOf(s, id) === "Gerrard's Hourglass Pendant")).toBe(true);
    });

    it("Liquimetal Torque : le permanent non-terrain ciblé devient un artefact jusqu'à la fin du tour", () => {
      let s = scenario({ p1: { battlefield: ["Liquimetal Torque"] }, p2: { battlefield: ["Bear Cub"] } });
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Liquimetal Torque"), 1, { targets: { t: [bear] } }));
      expect(chars(s, bear).types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(chars(s, bear).types).not.toContain("Artifact");
    });

    it("Manifold Key : dégage un autre artefact ; rend une créature imblocable ce tour-ci", () => {
      let s = scenario({
        p1: { battlefield: ["Manifold Key", { name: "Sol Ring", tapped: true }, "Bear Cub", ...lands("Wastes", 4)] },
      });
      const key = idOf(s, "p1", "battlefield", "Manifold Key");
      const ring = idOf(s, "p1", "battlefield", "Sol Ring");
      expect(activations(s, "p1", key).find((a) => a.ability === 0)?.targets[0]?.legal).not.toContain(key);
      s = settle(activate(s, "p1", key, 0, { targets: { t: [ring] } }));
      expect(s.objects[ring]?.tapped).toBe(false);
      let t = scenario({ p1: { battlefield: ["Manifold Key", "Bear Cub", ...lands("Wastes", 3)] } });
      const bear = idOf(t, "p1", "battlefield", "Bear Cub");
      t = settle(activate(t, "p1", idOf(t, "p1", "battlefield", "Manifold Key"), 1, { targets: { t: [bear] } }));
      expect(chars(t, bear).keywords).toContain("unblockable");
    });

    it("Moonsilver Key : cherche un artefact avec une capacité de mana ou un terrain de base", () => {
      let s = scenario({
        p1: {
          battlefield: ["Moonsilver Key", "Wastes"],
          library: ["Darksteel Forge", "Sol Ring", "Wastes", "Urza's Mine", "Abstergo Entertainment"],
        },
      });
      let offered: (string | undefined)[] = [];
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Moonsilver Key")), (req, _p, cur) => {
        if (req.type === "pick" && req.intent === "search") offered = namesIn(cur, req.options);
        return undefined;
      });
      expect(offered.sort()).toEqual(["Sol Ring", "Wastes"]);
    });

    it("Mox Opal : métallurgie, un mana de n'importe quelle couleur avec trois artefacts", () => {
      const s = scenario({ p1: { battlefield: ["Mox Opal", "Sol Ring"] } });
      const mox = idOf(s, "p1", "battlefield", "Mox Opal");
      expect(legalActions(s, "p1").some((a) => a.type === "tapForMana" && a.source === mox)).toBe(false);
      const t = scenario({ p1: { battlefield: ["Mox Opal", "Sol Ring", "Basalt Monolith"] } });
      const u = tapMana(t, "Mox Opal", undefined, "R");
      expect(pool(u)?.R).toBe(1);
    });

    it("Mystic Forge : lance des sorts d'artefact et incolores du dessus ; {T}, 1 PV : exile la carte du dessus", () => {
      let s = scenario({ p1: { battlefield: ["Mystic Forge", "Wastes"], library: ["Sol Ring", "Shock", "Bear Cub"] } });
      const ring = s.players.p1?.library[0] as string;
      expect(castable(s, "p1", ring)).toBe(true);
      s = settle(act(s, "p1", { type: "cast", card: ring } as never));
      expect(idsOf(s, "p1", "battlefield", "Sol Ring")).toHaveLength(1);
      // Shock au-dessus : ni artefact ni incolore.
      expect(castable(s, "p1", s.players.p1?.library[0] as string)).toBe(false);
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Mystic Forge")));
      expect(s.players.p1?.life).toBe(19);
      expect(s.exile.some((id) => nameOf(s, id) === "Shock")).toBe(true);
    });

    it("Nevinyrral's Disk : arrive engagé ; détruit tous les artefacts, créatures et enchantements", () => {
      let s = scenario({
        p1: { hand: ["Nevinyrral's Disk"], battlefield: [...lands("Wastes", 5), "Sol Ring", "Bear Cub"] },
        p2: { battlefield: ["Bear Cub", "Mountain"] },
      });
      s = settle(castIt(s, "p1", "Nevinyrral's Disk"));
      const disk = idOf(s, "p1", "battlefield", "Nevinyrral's Disk");
      expect(s.objects[disk]?.tapped).toBe(true);
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.turn.number > 3);
      s = settle(activate(s, "p1", disk));
      expect(s.battlefield.map((id) => nameOf(s, id)).sort()).toEqual([...lands("Wastes", 5), "Mountain"].sort());
    });

    it("The Mightstone and Weakstone : piochez deux cartes ou −5/−5 ; {C}{C} pour les sorts d'artefact", () => {
      let s = scenario({ p1: { hand: ["The Mightstone and Weakstone"], battlefield: lands("Wastes", 5) } });
      s = settle(castIt(s, "p1", "The Mightstone and Weakstone"), modeNamed("Draw two cards"));
      expect(s.players.p1?.hand).toHaveLength(2);
      let t = scenario({
        p1: { hand: ["The Mightstone and Weakstone"], battlefield: lands("Wastes", 5) },
        p2: { battlefield: ["Bear Cub"] },
      });
      t = settle(castIt(t, "p1", "The Mightstone and Weakstone"), modeNamed("Target creature gets −5/−5"));
      expect(idsOf(t, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
      // Le mana ne sert qu'aux sorts d'artefact.
      const u = scenario({ p1: { battlefield: ["The Mightstone and Weakstone"], hand: ["Shock", "Basalt Monolith"] } });
      expect(castable(u, "p1", idOf(u, "p1", "hand", "Basalt Monolith"))).toBe(false);
      const ab = manaAbilitiesOf(u, idOf(u, "p1", "battlefield", "The Mightstone and Weakstone"))[0];
      expect([ab?.amount, ab?.restriction?.spell?.types]).toEqual([2, ["Artifact"]]);
    });

    it("Unwinding Clock : vos artefacts se dégagent pendant l'étape de dégagement des autres joueurs", () => {
      let s = scenario({
        p1: { battlefield: ["Unwinding Clock", { name: "Sol Ring", tapped: true }, { name: "Bear Cub", tapped: true }] },
      });
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
      expect(s.objects[idOf(s, "p1", "battlefield", "Sol Ring")]?.tapped).toBe(false);
      expect(s.objects[idOf(s, "p1", "battlefield", "Bear Cub")]?.tapped).toBe(true);
    });

    it("Vedalken Orrery : vous pouvez lancer des sorts comme s'ils avaient le flash", () => {
      const s = scenario({
        p1: { battlefield: ["Vedalken Orrery", ...lands("Forest", 2)], hand: ["Bear Cub"] },
        active: "p2",
      });
      const t = act(s, "p2", { type: "pass" });
      expect(castable(t, "p1", idOf(t, "p1", "hand", "Bear Cub"))).toBe(true);
    });

    it("Voltaic Key : dégage l'artefact ciblé", () => {
      let s = scenario({ p1: { battlefield: ["Voltaic Key", { name: "Basalt Monolith", tapped: true }, "Wastes"] } });
      const mono = idOf(s, "p1", "battlefield", "Basalt Monolith");
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Voltaic Key"), 0, { targets: { t: [mono] } }));
      expect(s.objects[mono]?.tapped).toBe(false);
    });

    it("Fractured Powerstone : {C} ; le dé planaire, hors de Planechase, ne fait rien", () => {
      let s = scenario({ p1: { battlefield: ["Fractured Powerstone"] } });
      const stone = idOf(s, "p1", "battlefield", "Fractured Powerstone");
      expect(activations(s, "p1", stone)).toHaveLength(1);
      s = settle(activate(s, "p1", stone));
      expect(s.objects[stone]?.tapped).toBe(true);
    });
  });
  describe("Équipements", () => {
    it("Adaptive Omnitool : +1/+1 par artefact ; en attaquant, un artefact parmi les six cartes du dessus", () => {
      let s = scenario({
        p1: {
          battlefield: ["Adaptive Omnitool", "Sol Ring", "Bear Cub", ...lands("Wastes", 3)],
          library: ["Forest", "Basalt Monolith", "Forest", "Forest", "Forest", "Forest", "Mox Opal"],
        },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = equip(s, "Adaptive Omnitool", bear);
      expect(pt(s, bear)).toEqual([4, 4]);
      s = attack(s, [bear]);
      s = settleNoBlocks(s, (req, _p, cur) =>
        req.type === "pick" && req.intent === "lookAtTop"
          ? req.options.filter((id) => nameOf(cur, id) === "Basalt Monolith")
          : undefined,
      );
      expect(handNames(s, "p1")).toEqual(["Basalt Monolith"]);
      // Mox Opal (septième carte) n'a pas été regardé ; les cinq Forêts vont au-dessous.
      expect(namesIn(s, s.players.p1?.library)[0]).toBe("Mox Opal");
    });

    it("Brotherhood Regalia : garde {2}, Assassin, imblocable ; Équiper une créature légendaire {1} ou Équiper {3}", () => {
      let s = scenario({
        p1: { battlefield: ["Brotherhood Regalia", "Liberator, Urza's Battlethopter", "Bear Cub", "Wastes"] },
      });
      expect(equipTargets(s, "Brotherhood Regalia", "Equip legendary creature")).toEqual(["Liberator, Urza's Battlethopter"]);
      // Avec un seul mana, seul l'Équiper légendaire {1} est possible.
      expect(activations(s, "p1", idOf(s, "p1", "battlefield", "Brotherhood Regalia")).map((a) => a.label)).toEqual([
        msg("Equip legendary creature {cost}", { cost: "{1}" }),
      ]);
      const lib = idOf(s, "p1", "battlefield", "Liberator, Urza's Battlethopter");
      s = equip(s, "Brotherhood Regalia", lib, "Equip legendary creature");
      expect(chars(s, lib).subtypes).toContain("Assassin");
      expect(chars(s, lib).keywords).toContain("unblockable");
      expect(chars(s, lib).abilities.some((a) => a.kind === "triggered" && a.ward)).toBe(true);
    });

    it("Champion's Helm : +2/+2 ; défense talismanique seulement si la créature équipée est légendaire", () => {
      let s = scenario({ p1: { battlefield: ["Champion's Helm", "Bear Cub", "Liberator, Urza's Battlethopter", "Wastes"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = equip(s, "Champion's Helm", bear);
      expect(pt(s, bear)).toEqual([4, 4]);
      expect(chars(s, bear).keywords).not.toContain("hexproof");
      const lib = idOf(s, "p1", "battlefield", "Liberator, Urza's Battlethopter");
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.turn.number > 3);
      s = equip(s, "Champion's Helm", lib);
      expect(chars(s, lib).keywords).toContain("hexproof");
    });

    it("Commander's Plate : +3/+3, protection contre chaque couleur hors de l'identité de votre commandant ; Équiper un commandant {3}", () => {
      // Commandant incolore (The Vision, dans la zone de commandement) : protection contre les cinq couleurs.
      let s = scenario({
        p1: { command: ["The Vision"], battlefield: ["Commander's Plate", "Bear Cub", ...lands("Wastes", 5)] },
        p2: { battlefield: ["Shivan Dragon", "Serra Angel", "Llanowar Elves"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      // Aucun commandant sur le champ de bataille : seul « Équiper {5} ».
      expect(equipTargets(s, "Commander's Plate", "Equip commander")).toEqual([]);
      s = equip(s, "Commander's Plate", bear, "Equip {5}");
      expect(pt(s, bear)).toEqual([5, 5]);
      const from = (x: S, name: string) => protectedFrom(x, bear, snapshot(x, idOf(x, "p2", "battlefield", name)));
      expect([from(s, "Shivan Dragon"), from(s, "Serra Angel"), from(s, "Llanowar Elves")]).toEqual([true, true, true]);
      // Commandant blanc, noir et rouge (Edgar Markov) : protection contre le bleu et le vert seulement.
      let t = scenario({
        p1: { command: ["Edgar Markov"], battlefield: ["Commander's Plate", "Bear Cub", ...lands("Wastes", 5)] },
        p2: { battlefield: ["Shivan Dragon", "Serra Angel", "Llanowar Elves"] },
      });
      t = equip(t, "Commander's Plate", idOf(t, "p1", "battlefield", "Bear Cub"), "Equip {5}");
      expect([from(t, "Shivan Dragon"), from(t, "Serra Angel"), from(t, "Llanowar Elves")]).toEqual([false, false, true]);
    });

    it("Excalibur, Sword of Eden : coûte X de moins (valeur de mana totale de vos permanents historiques) ; Équiper une créature légendaire {2}", () => {
      let s = scenario({
        p1: {
          hand: ["Excalibur, Sword of Eden"],
          battlefield: [
            "Basalt Monolith",
            "Darksteel Forge",
            "Liberator, Urza's Battlethopter",
            "Bear Cub",
            ...lands("Wastes", 2),
          ],
        },
      });
      // 12 − (3 + 9 + 3) : gratuit.
      expect(castable(s, "p1", idOf(s, "p1", "hand", "Excalibur, Sword of Eden"))).toBe(true);
      s = settle(castIt(s, "p1", "Excalibur, Sword of Eden"));
      expect(s.battlefield.every((id) => !s.objects[id]?.tapped)).toBe(true);
      expect(equipTargets(s, "Excalibur, Sword of Eden", "Equip")).toEqual(["Liberator, Urza's Battlethopter"]);
      const lib = idOf(s, "p1", "battlefield", "Liberator, Urza's Battlethopter");
      s = equip(s, "Excalibur, Sword of Eden", lib);
      expect(chars(s, lib).power).toBe(11);
      expect(chars(s, lib).keywords).toContain("vigilance");
    });

    it("Hammer of Nazahn : à l'arrivée d'un de vos Équipements (lui compris), vous pouvez l'attacher à une de vos créatures", () => {
      let s = scenario({
        p1: { hand: ["Hammer of Nazahn", "Champion's Helm"], battlefield: ["Bear Cub", ...lands("Wastes", 7)] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(castIt(s, "p1", "Hammer of Nazahn"));
      const hammer = idOf(s, "p1", "battlefield", "Hammer of Nazahn");
      expect(s.objects[hammer]?.attachedTo).toBe(bear);
      expect(chars(s, bear).power).toBe(4);
      expect(chars(s, bear).keywords).toContain("indestructible");
      s = settle(castIt(s, "p1", "Champion's Helm"));
      expect(s.objects[idOf(s, "p1", "battlefield", "Champion's Helm")]?.attachedTo).toBe(bear);
      expect(pt(s, bear)).toEqual([6, 4]);
    });

    it("Mithril Coat : à son arrivée, attachée à une créature légendaire que vous contrôlez ; indestructible", () => {
      let s = scenario({
        p1: { hand: ["Mithril Coat"], battlefield: ["Bear Cub", "Liberator, Urza's Battlethopter", ...lands("Wastes", 3)] },
      });
      s = settle(castIt(s, "p1", "Mithril Coat"));
      const lib = idOf(s, "p1", "battlefield", "Liberator, Urza's Battlethopter");
      expect(s.objects[idOf(s, "p1", "battlefield", "Mithril Coat")]?.attachedTo).toBe(lib);
      expect(chars(s, lib).keywords).toContain("indestructible");
    });

    it("Nettlecyst : arme vivante ; +1/+1 par artefact et/ou enchantement que vous contrôlez", () => {
      let s = scenario({ p1: { hand: ["Nettlecyst"], battlefield: ["Sol Ring", "Wastes"] } });
      s = settle(castIt(s, "p1", "Nettlecyst"));
      const [germ] = tokens(s, "Phyrexian Germ");
      expect(s.objects[idOf(s, "p1", "battlefield", "Nettlecyst")]?.attachedTo).toBe(germ);
      expect(pt(s, germ ?? "")).toEqual([2, 2]);
      expect(chars(s, germ ?? "").colors).toEqual(["B"]);
    });

    it("Silver Shroud Costume : attaché à l'arrivée, défense totale jusqu'à la fin du tour ; la créature équipée est imblocable", () => {
      let s = scenario({ p1: { hand: ["Silver Shroud Costume"], battlefield: ["Bear Cub", ...lands("Wastes", 2)] } });
      s = settle(castIt(s, "p1", "Silver Shroud Costume"));
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      expect(chars(s, bear).keywords).toEqual(expect.arrayContaining(["shroud", "unblockable"]));
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(chars(s, bear).keywords).not.toContain("shroud");
      expect(chars(s, bear).keywords).toContain("unblockable");
    });

    it("Sword of Feast and Famine : protection contre le noir et le vert ; le joueur blessé défausse, vous dégagez vos terrains", () => {
      let s = scenario({
        p1: { battlefield: ["Sword of Feast and Famine", "Bear Cub", ...lands("Wastes", 2)] },
        p2: { hand: ["Shock", "Forest"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = equip(s, "Sword of Feast and Famine", bear);
      expect(chars(s, bear).protections.map((r) => r.label)).toEqual(["Protection from black", "Protection from green"]);
      expect(idsOf(s, "p1", "battlefield", "Wastes").every((id) => s.objects[id]?.tapped)).toBe(true);
      s = attack(s, [bear]);
      s = throughCombat(s);
      expect(s.players.p2?.life).toBe(16);
      expect(s.players.p2?.hand).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Wastes").every((id) => !s.objects[id]?.tapped)).toBe(true);
    });

    it("Sword of Truth and Justice : un marqueur +1/+1 sur une de vos créatures, puis proliférez", () => {
      let s = scenario({
        p1: {
          battlefield: [
            "Sword of Truth and Justice",
            "Bear Cub",
            { name: "Karn, Living Legacy", counters: { loyalty: 4 } },
            ...lands("Wastes", 2),
          ],
        },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = equip(s, "Sword of Truth and Justice", bear);
      s = attack(s, [bear]);
      s = throughCombat(s);
      // Un marqueur sur Bear Cub, puis prolifération : Bear Cub et Karn.
      expect(s.objects[bear]?.counters["+1/+1"]).toBe(2);
      expect(s.objects[idOf(s, "p1", "battlefield", "Karn, Living Legacy")]?.counters.loyalty).toBe(5);
    });
  });
  describe("planeswalkers", () => {
    it("Karn, Living Legacy : +1 un Powerstone engagé ; −1 payez X, une des X cartes du dessus en main", () => {
      let s = scenario({
        p1: {
          battlefield: ["Karn, Living Legacy", ...lands("Wastes", 3)],
          library: ["Forest", "Sol Ring", "Mox Opal", "Bear Cub", "Shock"],
        },
      });
      const karn = idOf(s, "p1", "battlefield", "Karn, Living Legacy");
      s = settle(activate(s, "p1", karn, 0));
      const [stone] = tokens(s, "Powerstone");
      expect(s.objects[stone ?? ""]?.tapped).toBe(true);
      expect(s.objects[karn]?.counters.loyalty).toBe(5);
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.turn.number > 3);
      // Pioche : Forest. Payez 3 : Sol Ring, Mox Opal, Bear Cub ; Mox Opal en main, le reste au-dessous.
      s = settle(activate(s, "p1", karn, 1), (req, _p, cur) =>
        req.type === "number" && req.intent === "payX"
          ? [3]
          : req.type === "pick" && req.intent === "lookAtTop"
            ? req.options.filter((id) => nameOf(cur, id) === "Mox Opal")
            : undefined,
      );
      expect(handNames(s, "p1")).toEqual(["Forest", "Mox Opal"]);
      expect(namesIn(s, s.players.p1?.library)[0]).toBe("Shock");
      expect(s.players.p1?.library).toHaveLength(3);
    });

    it("Karn, Living Legacy : −7, emblème « engagez un artefact dégagé : 1 blessure à n'importe quelle cible »", () => {
      let s = scenario({
        p1: { battlefield: [{ name: "Karn, Living Legacy", counters: { loyalty: 7 } }, "Sol Ring", "Basalt Monolith"] },
      });
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Karn, Living Legacy"), 2));
      const emblem = s.players.p1?.command[0] as string;
      expect(s.objects[emblem]?.isToken).toBe(true);
      // La capacité de l'emblème s'active depuis la zone de commandement, une fois par artefact dégagé.
      s = settle(activate(s, "p1", emblem, 0, { targets: { t: ["p2"] } }));
      s = settle(activate(s, "p1", emblem, 0, { targets: { t: ["p2"] } }));
      expect(s.players.p2?.life).toBe(18);
      expect(idsOf(s, "p1", "battlefield", "Sol Ring").every((id) => s.objects[id]?.tapped)).toBe(true);
      expect(canActivate(s, "p1", emblem)).toBe(false);
      // Un adversaire ne peut pas l'activer.
      expect(canActivate(s, "p2", emblem)).toBe(false);
    });

    it("Ugin, the Ineffable : sorts incolores à {2} de moins ; +1 exile face cachée et un Esprit 2/2 ; la carte va en main quand il part", () => {
      let s = scenario({
        p1: { battlefield: ["Ugin, the Ineffable", "Wastes"], hand: ["Basalt Monolith"], library: ["Sol Ring", "Forest"] },
        p2: { hand: ["Shock"], battlefield: ["Mountain"] },
      });
      // Basalt Monolith ({3}) pour un seul mana.
      expect(castable(s, "p1", idOf(s, "p1", "hand", "Basalt Monolith"))).toBe(true);
      s = settle(activateLabeled(s, "p1", idOf(s, "p1", "battlefield", "Ugin, the Ineffable"), "+1"));
      const exiledRing = s.exile.find((id) => nameOf(s, id) === "Sol Ring") as string;
      expect(s.objects[exiledRing]?.exiledFaceDown).toEqual(["p1"]);
      const [spirit] = tokens(s, "Spirit");
      expect(pt(s, spirit ?? "")).toEqual([2, 2]);
      expect(chars(s, spirit ?? "").colors).toEqual([]);
      s = act(s, "p1", { type: "pass" });
      s = settle(castIt(s, "p2", "Shock", { targets: { t: [spirit] } }));
      expect(handNames(s, "p1")).toEqual(["Basalt Monolith", "Sol Ring"]);
    });

    it("Ugin, the Ineffable : −3 détruit un permanent d'une ou plusieurs couleurs", () => {
      const s = scenario({
        p1: { battlefield: ["Ugin, the Ineffable"] },
        p2: { battlefield: ["Bear Cub", "Sol Ring", "Forest"] },
      });
      const legal = activations(s, "p1", idOf(s, "p1", "battlefield", "Ugin, the Ineffable")).find((a) =>
        plainText(a.label ?? "").startsWith("−3"),
      )?.targets[0]?.legal;
      expect(namesIn(s, legal)).toEqual(["Bear Cub"]);
    });

    it("Ugin, the Spirit Dragon : −X exile chaque permanent coloré de valeur de mana X ou moins ; −10", () => {
      let s = scenario({
        p1: { battlefield: ["Ugin, the Spirit Dragon", "Savannah Lions"] },
        p2: { battlefield: ["Bear Cub", "Shivan Dragon", "Sol Ring", "Forest"] },
      });
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Ugin, the Spirit Dragon"), 1, { x: 3 }));
      expect(s.battlefield.map((id) => nameOf(s, id)).sort()).toEqual([
        "Forest",
        "Shivan Dragon",
        "Sol Ring",
        "Ugin, the Spirit Dragon",
      ]);
      expect(s.objects[idOf(s, "p1", "battlefield", "Ugin, the Spirit Dragon")]?.counters.loyalty).toBe(4);
      let t = scenario({
        p1: {
          battlefield: [{ name: "Ugin, the Spirit Dragon", counters: { loyalty: 10 } }],
          library: ["Bear Cub", "Sol Ring", "Shock", "Wastes", "Basalt Monolith", "Forest", "Mox Opal", "Forest"],
        },
      });
      t = settle(activate(t, "p1", idOf(t, "p1", "battlefield", "Ugin, the Spirit Dragon"), 2));
      expect(t.players.p1?.life).toBe(27);
      // Toutes les cartes de permanent piochées (six) vont sur le champ de bataille ; Shock reste en main.
      expect(handNames(t, "p1")).toEqual(["Shock"]);
      expect(idsOf(t, "p1", "battlefield", "Basalt Monolith")).toHaveLength(1);
    });
  });

  describe("créatures", () => {
    it("Glaring Fleshraker : un Rejeton par sort incolore ; 1 blessure à chaque adversaire par autre créature incolore qui arrive", () => {
      let s = scenario({
        players: 3,
        p1: { battlefield: ["Glaring Fleshraker"], hand: ["Mox Opal"] },
      });
      s = settle(castIt(s, "p1", "Mox Opal"));
      const [spawn] = tokens(s, "Eldrazi Spawn");
      expect(pt(s, spawn ?? "")).toEqual([0, 1]);
      expect([s.players.p2?.life, s.players.p3?.life]).toEqual([19, 19]);
      // Le Rejeton : « sacrifiez ce jeton : ajoutez {C} ».
      s = act(s, "p1", { type: "tapForMana", source: spawn, ability: 0 } as never);
      expect(pool(s)?.C).toBe(1);
    });

    it("Liberator, Urza's Battlethopter : flash pour les sorts incolores et d'artefact ; un marqueur si le mana dépensé dépasse sa force", () => {
      let s = scenario({
        p1: { battlefield: ["Liberator, Urza's Battlethopter", ...lands("Wastes", 4)], hand: ["Sol Ring", "Basalt Monolith"] },
        active: "p2",
      });
      s = act(s, "p2", { type: "pass" });
      expect(castable(s, "p1", idOf(s, "p1", "hand", "Sol Ring"))).toBe(true);
      const lib = idOf(s, "p1", "battlefield", "Liberator, Urza's Battlethopter");
      s = passAccepting(castIt(s, "p1", "Sol Ring"), (x) => x.stack.length === 0);
      expect(s.objects[lib]?.counters["+1/+1"] ?? 0).toBe(0);
      // Pile vide : la priorité revient au joueur actif (p2), qui passe.
      s = act(s, "p2", { type: "pass" });
      s = passAccepting(castIt(s, "p1", "Basalt Monolith"), (x) => x.stack.length === 0);
      expect(s.objects[lib]?.counters["+1/+1"]).toBe(1);
    });

    it("Scrap Trawler : quand un de vos artefacts va au cimetière, une carte d'artefact de valeur de mana inférieure revient en main", () => {
      let s = scenario({
        p1: { battlefield: ["Scrap Trawler", "Basalt Monolith"], graveyard: ["Sol Ring", "Darksteel Forge", "Basalt Monolith"] },
        p2: { hand: ["Vindicate"], battlefield: ["Plains", "Swamp", "Swamp"] },
        active: "p2",
      });
      const mono = idOf(s, "p1", "battlefield", "Basalt Monolith");
      s = settle(castIt(s, "p2", "Vindicate", { targets: { t: [mono] } }));
      // Valeur de mana inférieure à 3 : seul Sol Ring (ni Darksteel Forge ni l'autre Basalt Monolith).
      expect(handNames(s, "p1")).toEqual(["Sol Ring"]);
      // Sans carte de valeur de mana inférieure, rien ne revient ; Scrap Trawler qui meurt compte aussi (3 : Sol Ring).
      let t = scenario({
        p1: { battlefield: ["Scrap Trawler"], graveyard: ["Darksteel Forge", "Sol Ring"] },
        p2: { hand: ["Vindicate"], battlefield: ["Plains", "Swamp", "Swamp"] },
        active: "p2",
      });
      t = settle(castIt(t, "p2", "Vindicate", { targets: { t: [idOf(t, "p1", "battlefield", "Scrap Trawler")] } }));
      expect(handNames(t, "p1")).toEqual(["Sol Ring"]);
    });

    it("Shimmer Myr : vos sorts d'artefact ont le flash", () => {
      let s = scenario({
        p1: { battlefield: ["Shimmer Myr", ...lands("Forest", 3)], hand: ["Sol Ring", "Bear Cub"] },
        active: "p2",
      });
      s = act(s, "p2", { type: "pass" });
      expect(castable(s, "p1", idOf(s, "p1", "hand", "Sol Ring"))).toBe(true);
      expect(castable(s, "p1", idOf(s, "p1", "hand", "Bear Cub"))).toBe(false);
    });

    it("Skittering Cicada : flash pour les sorts incolores ; piétinement et +X/+X (X : la valeur de mana du sort)", () => {
      let s = scenario({ p1: { battlefield: ["Skittering Cicada", ...lands("Wastes", 3)], hand: ["Basalt Monolith"] } });
      const cicada = idOf(s, "p1", "battlefield", "Skittering Cicada");
      s = settle(castIt(s, "p1", "Basalt Monolith"));
      expect(pt(s, cicada)).toEqual([5, 5]);
      expect(chars(s, cicada).keywords).toContain("trample");
    });

    it("Wandering Archaic : un adversaire lance un éphémère ; il paie {2}, sinon vous pouvez le copier", () => {
      const start = () =>
        scenario({
          p1: { battlefield: ["Wandering Archaic // Explore the Vastlands"] },
          p2: { hand: ["Shock"], battlefield: lands("Mountain", 3) },
          active: "p2",
        });
      // L'adversaire ne paie pas : la copie vise p2.
      let s = start();
      s = settle(castIt(s, "p2", "Shock", { targets: { t: ["p1"] } }), (req, p) =>
        req.intent === "unlessPay" || (req.type === "yesNo" && p === "p2") ? [0] : picking(["p2"])(req),
      );
      expect([s.players.p1?.life, s.players.p2?.life]).toEqual([18, 18]);
      // L'adversaire paie {2} : pas de copie.
      let t = start();
      t = settle(castIt(t, "p2", "Shock", { targets: { t: ["p1"] } }), (req, p) =>
        req.intent === "unlessPay" || (req.type === "yesNo" && p === "p2") ? [1] : undefined,
      );
      expect([t.players.p1?.life, t.players.p2?.life]).toEqual([18, 20]);
    });

    it("Explore the Vastlands : chaque joueur prend un terrain et/ou un éphémère ou rituel parmi ses cinq cartes du dessus, et gagne 3 PV", () => {
      let s = scenario({
        players: 3,
        p1: {
          hand: ["Wandering Archaic // Explore the Vastlands"],
          battlefield: lands("Wastes", 5),
          library: ["Bear Cub", "Forest", "Shock", "Island", "Sol Ring", "Vindicate"],
        },
        p2: { library: ["Bear Cub", "Sol Ring", "Mox Opal", "Shock", "Shock", "Forest"] },
        p3: { library: ["Bear Cub", "Sol Ring", "Mox Opal", "Basalt Monolith", "Shivan Dragon", "Forest"] },
      });
      const card = idOf(s, "p1", "hand", "Wandering Archaic // Explore the Vastlands");
      const back = legalActions(s, "p1").find((a) => a.type === "cast" && a.card === card && a.face === 1);
      expect(back).toBeDefined();
      const asked: PlayerId[] = [];
      s = settle(act(s, "p1", { type: "cast", card, face: 1 } as never), (req, p) => {
        if (req.type === "pick" && req.intent === "lookAtTop") asked.push(p);
        return undefined;
      });
      // Chaque joueur choisit lui-même (p3 n'a ni terrain ni éphémère parmi ses cinq cartes).
      expect(asked).toEqual(["p1", "p1", "p2"]);
      expect(handNames(s, "p1")).toEqual(["Forest", "Shock"]);
      expect(handNames(s, "p2")).toEqual(["Shock"]);
      expect(handNames(s, "p3")).toEqual([]);
      expect([s.players.p1?.life, s.players.p2?.life, s.players.p3?.life]).toEqual([23, 23, 23]);
      // Les autres cartes regardées vont au-dessous : p1 garde Vindicate (sixième) au-dessus.
      expect(namesIn(s, s.players.p1?.library)[0]).toBe("Vindicate");
    });
  });
  describe("sorts", () => {
    it("All Is Dust : chaque joueur sacrifie ses permanents d'une ou plusieurs couleurs", () => {
      let s = scenario({
        players: 3,
        p1: { hand: ["All Is Dust"], battlefield: [...lands("Wastes", 7), "Sol Ring", "Savannah Lions"] },
        p2: { battlefield: ["Bear Cub", "Forest", "Basalt Monolith"] },
        p3: { battlefield: ["Shivan Dragon", "Glaring Fleshraker"] },
      });
      s = settle(castIt(s, "p1", "All Is Dust"));
      expect(s.battlefield.map((id) => nameOf(s, id)).sort()).toEqual(
        ["Basalt Monolith", "Forest", "Glaring Fleshraker", "Sol Ring", ...lands("Wastes", 7)].sort(),
      );
      expect(idsOf(s, "p3", "graveyard", "Shivan Dragon")).toHaveLength(1);
    });

    it("Desecrate Reality : jusqu'à un permanent de valeur de mana paire par adversaire ; adamant, un permanent impair revient", () => {
      let s = scenario({
        players: 3,
        p1: {
          hand: ["Desecrate Reality"],
          battlefield: lands("Wastes", 7),
          graveyard: ["Basalt Monolith", "Sol Ring", "Bear Cub"],
        },
        p2: { battlefield: ["Bear Cub", "Shivan Dragon", "Forest"] },
        p3: { battlefield: ["Mox Opal", "Llanowar Elves"] },
      });
      const card = idOf(s, "p1", "hand", "Desecrate Reality");
      const spec = castOption(s, "p1", card)?.modes[0]?.targets[0];
      // Valeur de mana paire (0 compris) : Bear Cub (2), Shivan Dragon (6), Forest (0), Mox Opal (0) ; pas Llanowar Elves (1).
      expect(namesIn(s, spec?.legal).sort()).toEqual(["Bear Cub", "Forest", "Mox Opal", "Shivan Dragon"]);
      const dragon = idOf(s, "p2", "battlefield", "Shivan Dragon");
      const mox = idOf(s, "p3", "battlefield", "Mox Opal");
      // Deux cibles du même adversaire : refusé.
      expect(() =>
        castIt(s, "p1", "Desecrate Reality", { targets: { t: [dragon, idOf(s, "p2", "battlefield", "Forest")] } }),
      ).toThrow();
      // Sept mana incolore dépensé : adamant ; une carte de permanent de valeur de mana impaire revient (Basalt Monolith ou Sol Ring).
      s = settle(castIt(s, "p1", "Desecrate Reality", { targets: { t: [dragon, mox] } }), (req, _p, cur) =>
        req.type === "pick" && req.options.some((id) => nameOf(cur, id) === "Basalt Monolith")
          ? req.options.filter((id) => nameOf(cur, id) === "Basalt Monolith")
          : undefined,
      );
      expect(s.exile.map((id) => nameOf(s, id)).sort()).toEqual(["Mox Opal", "Shivan Dragon"]);
      expect(idsOf(s, "p1", "battlefield", "Basalt Monolith")).toHaveLength(1);
      // Sans trois mana incolore dépensé : rien ne revient.
      let t = scenario({
        p1: { hand: ["Desecrate Reality"], battlefield: lands("Forest", 7), graveyard: ["Sol Ring"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      t = settle(castIt(t, "p1", "Desecrate Reality", { targets: { t: [idOf(t, "p2", "battlefield", "Bear Cub")] } }));
      expect(idsOf(t, "p1", "graveyard", "Sol Ring")).toHaveLength(1);
    });

    it("Echoes of Eternity : chaque sort incolore est copié ; les capacités déclenchées de vos permanents incolores se déclenchent une fois de plus", () => {
      let s = scenario({
        p1: { battlefield: ["Echoes of Eternity", "Glaring Fleshraker"], hand: ["Mox Opal"] },
      });
      s = settle(castIt(s, "p1", "Mox Opal"));
      // La copie de Mox Opal devient un jeton (707.10) ; la règle des légendes en garde un seul.
      expect(s.battlefield.filter((id) => nameOf(s, id) === "Mox Opal").length).toBeGreaterThanOrEqual(1);
      expect(s.players.p1?.graveyard.length ?? 0).toBeLessThanOrEqual(1);
      // Fleshraker : deux Rejetons (déclenchement doublé), chacun inflige 1 blessure deux fois.
      expect(tokens(s, "Eldrazi Spawn")).toHaveLength(2);
      expect(s.players.p2?.life).toBe(16);
      // Un sort coloré n'est ni copié ni compté.
      let t = scenario({ p1: { battlefield: ["Echoes of Eternity", "Forest", "Forest"], hand: ["Bear Cub"] } });
      t = settle(castIt(t, "p1", "Bear Cub"));
      expect(idsOf(t, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
    });

    it("Eldrazi Confluence : choisissez trois modes, le même plusieurs fois", () => {
      let s = scenario({
        p1: { hand: ["Eldrazi Confluence"], battlefield: lands("Wastes", 4) },
        p2: { battlefield: ["Bear Cub"] },
      });
      const card = idOf(s, "p1", "hand", "Eldrazi Confluence");
      const labels = castOption(s, "p1", card)?.modes.map((m) => plainText(m.label ?? "")) ?? [];
      expect(labels).toHaveLength(10);
      const three = labels.find((l) => l === "A 1/1 Eldrazi Scion + A 1/1 Eldrazi Scion + A 1/1 Eldrazi Scion");
      expect(three).toBeDefined();
      s = settle(castIt(s, "p1", "Eldrazi Confluence", { mode: spellMode(s, "p1", card, three as string) }));
      expect(tokens(s, "Eldrazi Scion")).toHaveLength(3);
      // +3/−3 deux fois sur Bear Cub (elle meurt) et un clignotement d'un permanent.
      let t = scenario({
        p1: { hand: ["Eldrazi Confluence"], battlefield: [...lands("Wastes", 4), "Sol Ring"] },
        p2: { battlefield: ["Bear Cub", "Shivan Dragon"] },
      });
      const c2 = idOf(t, "p1", "hand", "Eldrazi Confluence");
      const label = "A creature gets +3/−3 + Exile a nonland permanent, then return it tapped + A 1/1 Eldrazi Scion";
      const dragon = idOf(t, "p2", "battlefield", "Shivan Dragon");
      t = settle(
        castIt(t, "p1", "Eldrazi Confluence", {
          mode: spellMode(t, "p1", c2, label),
          targets: { p0: [idOf(t, "p2", "battlefield", "Bear Cub")], e0: [dragon] },
        }),
      );
      expect(idsOf(t, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
      const back = idOf(t, "p2", "battlefield", "Shivan Dragon");
      expect([back !== dragon, t.objects[back]?.tapped]).toEqual([true, true]);
    });

    it("Eldritch Immunity : protection contre chaque couleur pour une créature ; surcharge, pour toutes les vôtres", () => {
      let s = scenario({ p1: { hand: ["Eldritch Immunity"], battlefield: ["Wastes", "Bear Cub", "Savannah Lions"] } });
      const card = idOf(s, "p1", "hand", "Eldritch Immunity");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(castIt(s, "p1", "Eldritch Immunity", { mode: spellMode(s, "p1", card, "Normal cost"), targets: { t: [bear] } }));
      expect(chars(s, bear).protections.map((r) => r.label)).toEqual(["Protection from each color"]);
      expect(chars(s, idOf(s, "p1", "battlefield", "Savannah Lions")).protections).toEqual([]);
      let t = scenario({
        p1: { hand: ["Eldritch Immunity"], battlefield: [...lands("Wastes", 5), "Bear Cub", "Savannah Lions"] },
      });
      const c2 = idOf(t, "p1", "hand", "Eldritch Immunity");
      t = settle(castIt(t, "p1", "Eldritch Immunity", { mode: spellMode(t, "p1", c2, "Overload — {4}{C}") }));
      for (const n of ["Bear Cub", "Savannah Lions"])
        expect(chars(t, idOf(t, "p1", "battlefield", n)).protections).toHaveLength(1);
    });

    it("Kozilek's Command : choisissez deux — Rejetons, regard X puis pioche, exil d'une créature de valeur de mana X ou moins, cartes de cimetières", () => {
      let s = scenario({
        p1: { hand: ["Kozilek's Command"], battlefield: lands("Wastes", 4) },
        p2: { battlefield: ["Bear Cub", "Shivan Dragon"], graveyard: ["Sol Ring", "Shock", "Forest"] },
      });
      const card = idOf(s, "p1", "hand", "Kozilek's Command");
      const label = "A player creates X 0/1 Eldrazi Spawn + Exile a creature with mana value X or less";
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      // X = 2 : Shivan Dragon (6) n'est pas une cible légale.
      expect(() =>
        castIt(s, "p1", "Kozilek's Command", {
          x: 2,
          mode: spellMode(s, "p1", card, label),
          targets: { p1: ["p1"], c3: [idOf(s, "p2", "battlefield", "Shivan Dragon")] },
        }),
      ).toThrow();
      s = settle(
        castIt(s, "p1", "Kozilek's Command", {
          x: 2,
          mode: spellMode(s, "p1", card, label),
          targets: { p1: ["p1"], c3: [bear] },
        }),
      );
      expect(tokens(s, "Eldrazi Spawn")).toHaveLength(2);
      expect(s.exile.map((id) => nameOf(s, id))).toEqual(["Bear Cub"]);
      // Regard X puis pioche, et jusqu'à X cartes de cimetières exilées.
      let t = scenario({
        p1: { hand: ["Kozilek's Command"], battlefield: lands("Wastes", 4) },
        p2: { graveyard: ["Sol Ring", "Shock", "Forest"] },
      });
      const c2 = idOf(t, "p1", "hand", "Kozilek's Command");
      const gy = (t.players.p2?.graveyard ?? []).slice(0, 2);
      t = settle(
        castIt(t, "p1", "Kozilek's Command", {
          x: 2,
          mode: spellMode(t, "p1", c2, "A player scries X, then draws a card + Exile up to X cards from graveyards"),
          targets: { p2: ["p1"], g4: gy },
        }),
      );
      expect(t.players.p1?.hand).toHaveLength(1);
      expect(t.players.p2?.graveyard).toHaveLength(1);
    });

    it("Null Elemental Blast : contrecarre un sort multicolore ou détruit un permanent multicolore", () => {
      let s = scenario({
        p1: { hand: ["Null Elemental Blast"], battlefield: ["Wastes"] },
        p2: { battlefield: ["Trygon Predator", "Bear Cub"] },
      });
      const card = idOf(s, "p1", "hand", "Null Elemental Blast");
      const destroy = castOption(s, "p1", card)?.modes.find((m) => m.label === "Destroy a multicolored permanent");
      expect(namesIn(s, destroy?.targets[0]?.legal)).toEqual(["Trygon Predator"]);
      s = settle(
        castIt(s, "p1", "Null Elemental Blast", {
          mode: destroy?.index,
          targets: { p: [idOf(s, "p2", "battlefield", "Trygon Predator")] },
        }),
      );
      expect(idsOf(s, "p2", "graveyard", "Trygon Predator")).toHaveLength(1);
      // Contre un sort multicolore (Vindicate).
      let t = scenario({
        p1: { hand: ["Null Elemental Blast"], battlefield: ["Wastes", "Sol Ring"] },
        p2: { hand: ["Vindicate"], battlefield: ["Plains", "Swamp", "Swamp"] },
        active: "p2",
      });
      t = castIt(t, "p2", "Vindicate", { targets: { t: [idOf(t, "p1", "battlefield", "Sol Ring")] } });
      t = act(t, "p2", { type: "pass" });
      const vindicate = t.stack[0]?.id as string;
      const c2 = idOf(t, "p1", "hand", "Null Elemental Blast");
      t = settle(
        castIt(t, "p1", "Null Elemental Blast", {
          mode: spellMode(t, "p1", c2, "Counter a multicolored spell"),
          targets: { s: [vindicate] },
        }),
      );
      expect(idsOf(t, "p1", "battlefield", "Sol Ring")).toHaveLength(1);
      expect(idsOf(t, "p2", "graveyard", "Vindicate")).toHaveLength(1);
    });
  });
  describe("terrains", () => {
    const playLand = (s: S, name: string, extra: object = {}) =>
      act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", name), ...extra } as never);

    it("Abstergo Entertainment : {1}, {T} un mana de n'importe quelle couleur ; une carte historique revient, puis tous les cimetières sont exilés", () => {
      let s = scenario({
        p1: { battlefield: ["Abstergo Entertainment", ...lands("Wastes", 4)], graveyard: ["Sol Ring", "Bear Cub"] },
        p2: { graveyard: ["Shock", "Liberator, Urza's Battlethopter"] },
      });
      const abstergo = idOf(s, "p1", "battlefield", "Abstergo Entertainment");
      const spec = activations(s, "p1", abstergo).find((a) => a.label?.startsWith("A historic card"))?.targets[0];
      // Seulement de votre cimetière, et historique : Sol Ring (pas Bear Cub, ni la créature légendaire de l'adversaire).
      expect(namesIn(s, spec?.legal)).toEqual(["Sol Ring"]);
      s = settle(
        activateLabeled(s, "p1", abstergo, "A historic card", { targets: { t: [idOf(s, "p1", "graveyard", "Sol Ring")] } }),
      );
      expect(handNames(s, "p1")).toEqual(["Sol Ring"]);
      expect([s.players.p1?.graveyard.length, s.players.p2?.graveyard.length]).toEqual([0, 0]);
      expect(s.exile.map((id) => nameOf(s, id)).sort()).toEqual([
        "Abstergo Entertainment",
        "Bear Cub",
        "Liberator, Urza's Battlethopter",
        "Shock",
      ]);
    });

    it("Buried Ruin : {2}, {T}, sacrifiez-le : une carte d'artefact de votre cimetière revient en main", () => {
      let s = scenario({ p1: { battlefield: ["Buried Ruin", "Wastes", "Wastes"], graveyard: ["Sol Ring", "Bear Cub"] } });
      s = settle(
        activate(s, "p1", idOf(s, "p1", "battlefield", "Buried Ruin"), undefined, {
          targets: { t: [idOf(s, "p1", "graveyard", "Sol Ring")] },
        }),
      );
      expect(handNames(s, "p1")).toEqual(["Sol Ring"]);
      expect(idsOf(s, "p1", "graveyard", "Buried Ruin")).toHaveLength(1);
    });

    it("Emergence Zone : {1}, {T}, sacrifiez-le : vous pouvez lancer des sorts comme s'ils avaient le flash ce tour-ci", () => {
      let s = scenario({
        p1: { battlefield: ["Emergence Zone", "Forest", "Forest", "Forest"], hand: ["Bear Cub"] },
        active: "p2",
      });
      s = act(s, "p2", { type: "pass" });
      expect(castable(s, "p1", idOf(s, "p1", "hand", "Bear Cub"))).toBe(false);
      s = passAccepting(activate(s, "p1", idOf(s, "p1", "battlefield", "Emergence Zone")), (x) => x.stack.length === 0);
      s = act(s, "p2", { type: "pass" });
      expect(castable(s, "p1", idOf(s, "p1", "hand", "Bear Cub"))).toBe(true);
    });

    it("Terrains d'Urza : Mine et Power Plant {C}{C}, Tower {C}{C}{C} avec les deux autres ; Planar Nexus a chaque type de terrain non de base", () => {
      let s = scenario({ p1: { battlefield: ["Urza's Mine", "Urza's Tower"] } });
      s = tapMana(s, "Urza's Mine");
      s = tapMana(s, "Urza's Tower");
      expect(pool(s)?.C).toBe(2);
      let t = scenario({ p1: { battlefield: ["Urza's Mine", "Urza's Power Plant", "Urza's Tower"] } });
      for (const n of ["Urza's Mine", "Urza's Power Plant", "Urza's Tower"]) t = tapMana(t, n);
      expect(pool(t)?.C).toBe(7);
      // Planar Nexus est une Mine et une Centrale : Urza's Tower produit {C}{C}{C}.
      let u = scenario({ p1: { battlefield: ["Planar Nexus", "Urza's Tower"] } });
      expect(chars(u, idOf(u, "p1", "battlefield", "Planar Nexus")).subtypes).toEqual(
        expect.arrayContaining(["Mine", "Power-Plant", "Tower", "Urza's", "Cave", "Sphere", "Desert", "Gate"]),
      );
      expect(chars(u, idOf(u, "p1", "battlefield", "Planar Nexus")).subtypes).not.toContain("Island");
      u = tapMana(u, "Urza's Tower");
      expect(pool(u)?.C).toBe(3);
    });

    it("Urza's Workshop : métallurgie, {C} pour chaque terrain d'Urza", () => {
      const s = scenario({ p1: { battlefield: ["Urza's Workshop", "Urza's Mine", "Planar Nexus", "Sol Ring", "Mox Opal"] } });
      const shop = idOf(s, "p1", "battlefield", "Urza's Workshop");
      expect(legalActions(s, "p1").some((a) => a.type === "tapForMana" && a.source === shop && a.ability === 1)).toBe(false);
      const t = scenario({
        p1: { battlefield: ["Urza's Workshop", "Urza's Mine", "Planar Nexus", "Sol Ring", "Mox Opal", "Basalt Monolith"] },
      });
      expect(pool(tapMana(t, "Urza's Workshop", 1))?.C).toBe(3);
    });

    it("Urza's Cave : {3}, {T}, sacrifiez-le : une carte de terrain mise sur le champ de bataille engagée", () => {
      let s = scenario({ p1: { battlefield: ["Urza's Cave", ...lands("Wastes", 3)], library: ["Bear Cub", "Urza's Tower"] } });
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Urza's Cave")));
      expect(s.objects[idOf(s, "p1", "battlefield", "Urza's Tower")]?.tapped).toBe(true);
    });

    it("Urza's Saga : I gagne {T} : {C} ; II gagne la capacité de Construction ; III cherche un artefact au coût {0} ou {1}, puis il est sacrifié", () => {
      let s = scenario({
        p1: {
          hand: ["Urza's Saga"],
          battlefield: ["Wastes", "Wastes", "Sol Ring"],
          library: ["Forest", "Forest", "Darksteel Citadel", "Basalt Monolith", "Mox Opal", "Forest", "Forest"],
        },
      });
      s = settle(playLand(s, "Urza's Saga"));
      const saga = idOf(s, "p1", "battlefield", "Urza's Saga");
      expect(s.objects[saga]?.counters.lore).toBe(1);
      expect(manaAbilitiesOf(s, saga)).toHaveLength(1);
      s = advanceUntil(
        s,
        (x) =>
          x.turn.number > 3 &&
          x.turn.step === "main1" &&
          x.stack.length === 0 &&
          x.triggers.length === 0 &&
          x.pending?.player === "p1" &&
          (x.objects[saga]?.counters.lore ?? 0) >= 2,
      );
      expect(s.objects[saga]?.counters.lore).toBe(2);
      s = settle(activateLabeled(s, "p1", saga, "A 0/0 Construct artifact creature token"));
      const [construct] = tokens(s, "Construct");
      // Sol Ring, la Construction : deux artefacts.
      expect(pt(s, construct ?? "")).toEqual([2, 2]);
      let offered: (string | undefined)[] = [];
      s = advanceUntil(
        s,
        (x) =>
          x.turn.active === "p1" && x.turn.number > 5 && x.pending?.kind === "choice" && x.pending.request.intent === "search",
      );
      const req = s.pending?.kind === "choice" ? s.pending.request : undefined;
      offered = req?.type === "pick" ? namesIn(s, req.options) : [];
      // Coût de mana {0} ou {1} : Mox Opal ; ni Darksteel Citadel (pas de coût de mana) ni Basalt Monolith.
      expect(offered).toEqual(["Mox Opal"]);
      s = settle(s);
      expect(idsOf(s, "p1", "battlefield", "Mox Opal")).toHaveLength(1);
      expect(idsOf(s, "p1", "graveyard", "Urza's Saga")).toHaveLength(1);
    });

    it("Sanctum of Ugin : un sort incolore de valeur de mana 7 ou plus ; vous pouvez le sacrifier pour chercher une créature incolore", () => {
      let s = scenario({
        p1: {
          battlefield: ["Sanctum of Ugin", ...lands("Wastes", 9)],
          hand: ["Darksteel Forge"],
          library: ["Bear Cub", "Scrap Trawler", "Forest"],
        },
      });
      let offered: (string | undefined)[] = [];
      s = settle(castIt(s, "p1", "Darksteel Forge"), (req, _p, cur) => {
        if (req.type === "pick" && req.intent === "search") offered = namesIn(cur, req.options);
        return undefined;
      });
      expect(offered).toEqual(["Scrap Trawler"]);
      expect(handNames(s, "p1")).toEqual(["Scrap Trawler"]);
      expect(idsOf(s, "p1", "graveyard", "Sanctum of Ugin")).toHaveLength(1);
    });

    it("Scorched Ruins : il faut sacrifier deux terrains dégagés pour qu'il arrive ; sinon il va au cimetière ; {C}{C}{C}{C}", () => {
      let s = scenario({ p1: { hand: ["Scorched Ruins"], battlefield: ["Wastes", "Wastes", { name: "Forest", tapped: true }] } });
      s = playLand(s, "Scorched Ruins");
      expect(idsOf(s, "p1", "battlefield", "Scorched Ruins")).toHaveLength(1);
      expect(idsOf(s, "p1", "graveyard", "Wastes")).toHaveLength(2);
      s = tapMana(s, "Scorched Ruins");
      expect(pool(s)?.C).toBe(4);
      // Un seul terrain dégagé : au cimetière.
      let t = scenario({ p1: { hand: ["Scorched Ruins"], battlefield: ["Wastes", { name: "Forest", tapped: true }] } });
      t = settle(playLand(t, "Scorched Ruins"));
      expect(idsOf(t, "p1", "graveyard", "Scorched Ruins")).toHaveLength(1);
      expect(idsOf(t, "p1", "battlefield", "Wastes")).toHaveLength(1);
    });

    it("Shrine of the Forsaken Gods : {C}{C} pour les sorts incolores, avec sept terrains ou plus", () => {
      const s = scenario({ p1: { battlefield: ["Shrine of the Forsaken Gods", ...lands("Forest", 5)] } });
      const shrine = idOf(s, "p1", "battlefield", "Shrine of the Forsaken Gods");
      expect(legalActions(s, "p1").filter((a) => a.type === "tapForMana" && a.source === shrine)).toHaveLength(1);
      const t = scenario({ p1: { battlefield: ["Shrine of the Forsaken Gods", ...lands("Forest", 6)], hand: ["Shock"] } });
      const u = tapMana(t, "Shrine of the Forsaken Gods", 1);
      // Mana restreint (sorts incolores seulement) : réserve à part.
      expect(u.players.p1?.restrictedMana?.filter((m) => m.type === "C")).toHaveLength(2);
      expect(manaAbilitiesOf(t, idOf(t, "p1", "battlefield", "Shrine of the Forsaken Gods"))[1]?.restriction?.spell).toEqual({
        colorCount: 0,
      });
    });

    it("The Grey Havens : regard 1 en arrivant ; un mana d'une couleur parmi les cartes de créature légendaire de votre cimetière", () => {
      let s = scenario({
        p1: { hand: ["The Grey Havens"], graveyard: ["Edgar Markov", "Bear Cub", "Shivan Dragon"] },
      });
      const asked: string[] = [];
      s = settle(playLand(s, "The Grey Havens"), (req) => {
        if (req.intent?.startsWith("scry")) asked.push("scry");
        return undefined;
      });
      expect(asked).toContain("scry");
      const havens = idOf(s, "p1", "battlefield", "The Grey Havens");
      const colors = [...new Set(manaAbilitiesOf(s, havens).flatMap((m) => m.produce))].sort();
      // Edgar Markov (blanc, noir, rouge) ; ni Bear Cub ni Shivan Dragon (non légendaires).
      expect(colors).toEqual(["B", "C", "R", "W"]);
    });

    it("The Mycosynth Gardens : {X}, {T} : devient une copie d'un artefact non-jeton de valeur de mana X que vous contrôlez", () => {
      let s = scenario({ p1: { battlefield: ["The Mycosynth Gardens", "Sol Ring", "Wastes"] } });
      const gardens = idOf(s, "p1", "battlefield", "The Mycosynth Gardens");
      const ring = idOf(s, "p1", "battlefield", "Sol Ring");
      s = settle(activateLabeled(s, "p1", gardens, "Becomes a copy", { x: 1, targets: { t: [ring] } }));
      expect(nameOf(s, gardens)).toBe("The Mycosynth Gardens");
      expect(chars(s, gardens).name).toBe("Sol Ring");
      expect(chars(s, gardens).types).toEqual(["Artifact"]);
    });

    it("Vesuva : vous pouvez le faire arriver engagé comme une copie d'un terrain", () => {
      let s = scenario({ p1: { hand: ["Vesuva"], battlefield: ["Urza's Tower"] }, p2: { battlefield: ["Urza's Mine"] } });
      const mine = idOf(s, "p2", "battlefield", "Urza's Mine");
      s = settle(playLand(s, "Vesuva", { chosen: mine }));
      const vesuva = idOf(s, "p1", "battlefield", "Vesuva");
      expect(chars(s, vesuva).name).toBe("Urza's Mine");
      expect(s.objects[vesuva]?.tapped).toBe(true);
    });

    it("War Room : {3}, {T}, payez autant de PV que de couleurs dans l'identité de vos commandants : piochez une carte", () => {
      let s = scenario({ p1: { command: ["The Vision"], battlefield: ["War Room", ...lands("Wastes", 3)] } });
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "War Room")));
      expect([s.players.p1?.life, s.players.p1?.hand.length]).toEqual([20, 1]);
      let t = scenario({ p1: { command: ["Edgar Markov"], battlefield: ["War Room", ...lands("Wastes", 3)] } });
      t = settle(activate(t, "p1", idOf(t, "p1", "battlefield", "War Room")));
      expect([t.players.p1?.life, t.players.p1?.hand.length]).toEqual([17, 1]);
      // Pas assez de PV : la capacité n'est pas proposée.
      const u = scenario({ p1: { life: 2, command: ["Edgar Markov"], battlefield: ["War Room", ...lands("Wastes", 3)] } });
      expect(canActivate(u, "p1", idOf(u, "p1", "battlefield", "War Room"))).toBe(false);
    });

    it("Witch's Clinic : {2}, {T} : le commandant ciblé gagne le lien de vie jusqu'à la fin du tour", () => {
      let s = scenario({
        p1: { battlefield: ["Witch's Clinic", "Wastes", "Wastes", "Bear Cub", "The Vision"] },
        p2: { battlefield: ["Shivan Dragon"] },
      });
      const clinic = idOf(s, "p1", "battlefield", "Witch's Clinic");
      // Aucun commandant : aucune cible.
      expect(canActivate(s, "p1", clinic)).toBe(false);
      const vision = idOf(s, "p1", "battlefield", "The Vision");
      const dragon = idOf(s, "p2", "battlefield", "Shivan Dragon");
      s = makeCommander(makeCommander(s, vision), dragon);
      // Un commandant, le sien ou celui d'un adversaire ; pas Bear Cub.
      const legal = activations(s, "p1", clinic)[0]?.targets[0]?.legal;
      expect(namesIn(s, legal).sort()).toEqual(["Shivan Dragon", "The Vision"]);
      s = settle(activate(s, "p1", clinic, undefined, { targets: { t: [vision] } }));
      expect(chars(s, vision).keywords).toContain("lifelink");
    });
  });

  describe("liste « Weight of the World » et réserve du jeu de proxys", () => {
    it("Candelabra of Tawnos : {X}, {T} : dégagez exactement X terrains ciblés", () => {
      let s = scenario({ p1: { battlefield: ["Candelabra of Tawnos", ...lands("Wastes", 4)] } });
      const candelabra = idOf(s, "p1", "battlefield", "Candelabra of Tawnos");
      const [a, b, c, d] = idsOf(s, "p1", "battlefield", "Wastes") as [string, string, string, string];
      for (const id of [a, b, c, d]) s = act(s, "p1", { type: "tapForMana", source: id, ability: 0 } as never);
      expect(pool(s)?.C).toBe(4);
      expect(() => activate(s, "p1", candelabra, 0, { x: 2, targets: { t: [a, b, c] } })).toThrow();
      s = settle(activate(s, "p1", candelabra, 0, { x: 2, targets: { t: [a, b] } }));
      expect([a, b, c].map((id) => s.objects[id]?.tapped)).toEqual([false, false, true]);
      expect(s.objects[candelabra]?.tapped).toBe(true);
    });

    it("Null Brooch : {2}, {T}, défaussez votre main : contrecarrez un sort non-créature (pas un sort de créature)", () => {
      let s = scenario({
        p1: { battlefield: ["Null Brooch", ...lands("Wastes", 2)], hand: ["Bear Cub", "Forest"] },
        p2: { hand: ["Shock", "Bear Cub"], battlefield: lands("Mountain", 2).concat(lands("Forest", 2)) },
        active: "p2",
      });
      const brooch = idOf(s, "p1", "battlefield", "Null Brooch");
      s = castIt(s, "p2", "Bear Cub");
      s = act(s, "p2", { type: "pass" });
      expect(canActivate(s, "p1", brooch)).toBe(false);
      s = settle(s);
      s = castIt(s, "p2", "Shock", { targets: { t: ["p1"] } });
      s = act(s, "p2", { type: "pass" });
      const shock = s.stack[0]?.id as string;
      s = settle(activate(s, "p1", brooch, 0, { targets: { t: [shock] } }));
      expect(s.players.p1?.life).toBe(20);
      expect(s.players.p1?.hand).toEqual([]);
      expect(namesIn(s, s.players.p1?.graveyard).sort()).toEqual(["Bear Cub", "Forest"]);
      expect(idsOf(s, "p2", "graveyard", "Shock")).toHaveLength(1);
    });

    it("Mishra's Workshop : {C}{C}{C} à dépenser seulement pour des sorts d'artefact", () => {
      const s = scenario({
        p1: { battlefield: ["Mishra's Workshop"], hand: ["Palladium Myr", "Glaring Fleshraker"] },
      });
      expect(castable(s, "p1", idOf(s, "p1", "hand", "Palladium Myr"))).toBe(true);
      expect(castable(s, "p1", idOf(s, "p1", "hand", "Glaring Fleshraker"))).toBe(false);
      const t = tapMana(s, "Mishra's Workshop");
      expect(t.players.p1?.restrictedMana).toHaveLength(3);
    });

    it("Palladium Myr : {T} : {C}{C} ; Foundry Inspector : vos sorts d'artefact coûtent {1} de moins", () => {
      let s = scenario({ p1: { battlefield: ["Palladium Myr", "Foundry Inspector"], hand: ["Sol Ring", "Bear Cub"] } });
      // Sol Ring ({1}) ne coûte rien ; Bear Cub, qui n'est pas un artefact, coûte toujours {1}{G}.
      expect(castable(s, "p1", idOf(s, "p1", "hand", "Sol Ring"))).toBe(true);
      s = tapMana(s, "Palladium Myr");
      expect(pool(s)?.C).toBe(2);
      expect(castable(s, "p1", idOf(s, "p1", "hand", "Bear Cub"))).toBe(false);
    });

    it("Eldrazi Conscription : +10/+10, piétinement et annihilateur 2", () => {
      let s = scenario({
        p1: { battlefield: ["Bear Cub", ...lands("Wastes", 8)], hand: ["Eldrazi Conscription"] },
        p2: { battlefield: ["Forest", "Sol Ring", "Savannah Lions"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(castIt(s, "p1", "Eldrazi Conscription", { targets: { enchant: [bear] } }));
      expect(pt(s, bear)).toEqual([12, 12]);
      expect(chars(s, bear).keywords).toContain("trample");
      s = throughCombat(attack(s, [bear]));
      // Le joueur défenseur sacrifie deux de ses trois permanents, puis prend 12 blessures (aucun bloqueur).
      expect(s.battlefield.filter((id) => s.objects[id]?.controller === "p2")).toHaveLength(1);
      expect(s.players.p2?.life).toBe(8);
    });

    it("Portal to Phyrexia : chaque adversaire sacrifie trois créatures ; à votre entretien, une créature d'un cimetière vous revient, Phyrexian en plus", () => {
      let s = scenario({
        players: 3,
        p1: { battlefield: lands("Wastes", 9), hand: ["Portal to Phyrexia"] },
        p2: { battlefield: ["Bear Cub", "Savannah Lions", "Shivan Dragon", "Llanowar Elves"] },
        p3: { battlefield: ["Bear Cub"] },
      });
      s = settle(castIt(s, "p1", "Portal to Phyrexia"));
      expect(s.battlefield.filter((id) => s.objects[id]?.controller === "p2")).toHaveLength(1);
      expect(idsOf(s, "p3", "battlefield", "Bear Cub")).toHaveLength(0);
      const dragon = idsOf(s, "p2", "graveyard", "Shivan Dragon")[0];
      expect(dragon).toBeDefined();
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.turn.number > 3, 2000);
      const mine = s.battlefield.filter((id) => s.objects[id]?.controller === "p1" && chars(s, id).types.includes("Creature"));
      expect(mine).toHaveLength(1);
      expect(chars(s, mine[0] as string).subtypes).toContain("Phyrexian");
    });

    it("508.1f-h : une créature qui attaque est engagée avant la taxe d'attaque ; sacrifiée pour la payer, elle quitte le combat", () => {
      let s = scenario({
        p1: { battlefield: ["Glaring Fleshraker", "Wastes"], hand: ["Mox Opal"] },
        p2: { battlefield: ["Ghostly Prison"] },
      });
      s = settle(castIt(s, "p1", "Mox Opal"));
      const [spawn] = tokens(s, "Eldrazi Spawn") as [string];
      s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers" && x.turn.active === "p1" && x.turn.number > 3);
      // {2} de taxe pour le Rejeton : le Terrain vague et le Rejeton lui-même (« sacrifiez ce jeton : ajoutez {C} »).
      s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: spawn, defender: "p2" }] });
      expect(s.objects[spawn]).toBeUndefined();
      expect(s.combat?.attackers ?? []).toEqual([]);
      expect(s.objects[idOf(s, "p1", "battlefield", "Wastes")]?.tapped).toBe(true);
      // Une créature sans vigilance qui attaque est engagée avant le paiement : elle ne peut pas payer sa propre taxe.
      let t = scenario({
        p1: { battlefield: ["Llanowar Elves", "Forest"] },
        p2: { battlefield: ["Ghostly Prison"] },
      });
      t = advanceUntil(t, (x) => x.pending?.kind === "declareAttackers");
      const elves = idOf(t, "p1", "battlefield", "Llanowar Elves");
      expect(() => act(t, "p1", { type: "declareAttackers", attackers: [{ id: elves, defender: "p2" }] })).toThrow(
        msg("You must pay {cost} to attack", { cost: "{2}" }),
      );
    });

    it("Super State : base 9/9, vol, initiative, piétinement, célérité ; ses blessures de combat à un adversaire touchent aussi les autres", () => {
      let s = scenario({
        players: 3,
        p1: { battlefield: ["Bear Cub", ...lands("Wastes", 7)], hand: ["Super State"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(castIt(s, "p1", "Super State", { targets: { enchant: [bear] } }));
      expect(pt(s, bear)).toEqual([9, 9]);
      expect(chars(s, bear).keywords).toEqual(expect.arrayContaining(["flying", "firstStrike", "trample", "haste"]));
      s = throughCombat(attack(s, [bear]));
      expect(s.players.p2?.life).toBe(11);
      expect(s.players.p3?.life).toBe(11);
      expect(s.players.p1?.life).toBe(20);
    });
  });
});
