/**
 * Commander (pseudo-ensemble EDH) : tests de règles du deck « I Am Ninja, Sneaking in the Shadows » (Dark Leo &
 * Shredder, blanc et noir). Ninjutsu et Ninjas, attaquants imblocables, peur, copies (Helm of the Host, Legion Loyalty,
 * Strionic Resonator), perte de points de vie, terrains.
 */
import { describe, expect, it } from "vitest";
import { bump, chars } from "../src/layers";
import { legalActions } from "../src/legal";
import { matchesObjectFilter } from "../src/targets";
import { canBlock } from "../src/turn";
import type { ActionOption, GameState, ObjectId, PlayerId } from "../src/types";
import {
  act,
  advanceUntil,
  attack,
  attackPlayer,
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
/** Active la capacité dont le libellé commence ainsi. */
const activateLabeled = (s: S, p: PlayerId, source: ObjectId, prefix: string, extra: object = {}) => {
  const o = activations(s, p, source).find((a) => a.label?.startsWith(prefix));
  if (!o) throw new Error(`pas de capacité « ${prefix} » pour ${nameOf(s, source)}`);
  return act(s, p, { type: "activate", source, ability: o.ability, ...extra } as never);
};
const tapMana = (s: S, name: string, color?: string, player: PlayerId = "p1") => {
  const source = idOf(s, player, "battlefield", name);
  const o = legalActions(s, player).find((a) => a.type === "tapForMana" && a.source === source);
  if (o?.type !== "tapForMana") throw new Error(`pas de mana pour ${name}`);
  return act(s, player, { type: "tapForMana", source, ability: o.ability, ...(color ? { color } : {}) } as never);
};
const tokens = (s: S, name: string, p: PlayerId = "p1") =>
  s.battlefield.filter((id) => s.objects[id]?.isToken && s.objects[id]?.controller === p && nameOf(s, id) === name);
const pt = (s: S, id: string) => [chars(s, id).power, chars(s, id).toughness];
const handNames = (s: S, p: PlayerId) => namesIn(s, s.players[p]?.hand).sort();
const defenderOf = (s: S, id: string) => s.combat?.attackers.find((a) => a.id === id)?.defender;

/** Déclare les attaquants, personne ne bloque, puis priorité du joueur actif dans l'étape des bloqueurs. */
function attackNoBlocks(s: S, attacks: { id: string; defender: string }[]): S {
  let cur = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
  cur = act(cur, "p1", { type: "declareAttackers", attackers: attacks });
  for (
    let i = 0;
    i < 40 && !(cur.turn.step === "declareBlockers" && cur.pending?.kind === "priority" && !cur.stack.length);
    i++
  ) {
    const p = cur.pending;
    if (p?.kind === "priority") cur = act(cur, p.player, { type: "pass" });
    else if (p?.kind === "declareBlockers") cur = act(cur, p.player, { type: "declareBlockers", blocks: [] });
    else if (p?.kind === "choice") cur = act(cur, p.player, { type: "choose", values: p.request.suggested });
    else break;
  }
  return cur;
}
/** Ninjutsu de la carte nommée (main de p1) en renvoyant `returned` ; la pile se résout. */
function ninjutsu(s: S, ninja: string, returned: string): S {
  const card = idOf(s, "p1", "hand", ninja);
  const o = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === card);
  if (o?.type !== "activate") throw new Error(`pas de ninjutsu pour ${ninja}`);
  const cur = act(s, "p1", {
    type: "activate",
    source: card,
    ability: o.ability,
    targets: {},
    picks: { returnAttacker: [returned] },
  });
  return passAccepting(cur, (x) => x.stack.length === 0 && x.triggers.length === 0 && x.pending?.kind === "priority");
}
/** Va jusqu'à la seconde phase principale (blessures de combat) en répondant aux choix. */
const finishCombat = (s: S, answer?: Parameters<typeof throughCombat>[1]) => throughCombat(s, answer);

describe("Dark Leo & Shredder (EDH)", () => {
  describe("Ninjas", () => {
    it("Nezumi Prowler : ninjutsu {1}{B} ; en arrivant, une créature que vous contrôlez gagne contact mortel et lien de vie", () => {
      let s = scenario({ p1: { battlefield: ["Bear Cub", "Swamp", "Swamp"], hand: ["Nezumi Prowler"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = attackNoBlocks(s, [{ id: bear, defender: "p2" }]);
      s = ninjutsu(s, "Nezumi Prowler", bear);
      const prowler = idOf(s, "p1", "battlefield", "Nezumi Prowler");
      // Bear Cub est revenu en main ; le Ninja attaque p2, engagé.
      expect(handNames(s, "p1")).toEqual(["Bear Cub"]);
      expect(s.objects[prowler]?.tapped).toBe(true);
      expect(defenderOf(s, prowler)).toBe("p2");
      expect(chars(s, prowler).keywords).toEqual(expect.arrayContaining(["deathtouch", "lifelink"]));
      s = finishCombat(s);
      expect(s.players.p2?.life).toBe(17);
      expect(s.players.p1?.life).toBe(23);
    });

    it("Okiba-Gang Shinobi : blessures de combat à un joueur, il défausse deux cartes", () => {
      let s = scenario({
        p1: { battlefield: ["Bear Cub", ...lands("Swamp", 4)], hand: ["Okiba-Gang Shinobi"] },
        p2: { hand: ["Shock", "Bear Cub", "Savannah Lions"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = attackNoBlocks(s, [{ id: bear, defender: "p2" }]);
      s = ninjutsu(s, "Okiba-Gang Shinobi", bear);
      s = finishCombat(s);
      expect(s.players.p2?.life).toBe(17);
      expect(s.players.p2?.hand).toHaveLength(1);
      expect(s.players.p2?.graveyard).toHaveLength(2);
    });

    it("Throat Slitter : détruit une créature non noire du joueur blessé (une noire ne peut pas être ciblée)", () => {
      let s = scenario({
        p1: { battlefield: ["Bear Cub", ...lands("Swamp", 3)], hand: ["Throat Slitter"] },
        p2: { battlefield: ["Highborn Vampire", "Savannah Lions"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = attackNoBlocks(s, [{ id: bear, defender: "p2" }]);
      s = ninjutsu(s, "Throat Slitter", bear);
      // Seule cible légale : Savannah Lions (Highborn Vampire est noir).
      s = finishCombat(s);
      expect(idsOf(s, "p2", "graveyard", "Savannah Lions")).toHaveLength(1);
      expect(idsOf(s, "p2", "battlefield", "Highborn Vampire")).toHaveLength(1);
    });

    it("Ink-Eyes : une carte de créature du cimetière du joueur blessé arrive sous votre contrôle ; {1}{B} : régénérez", () => {
      let s = scenario({
        p1: { battlefield: ["Bear Cub", ...lands("Swamp", 7)], hand: ["Ink-Eyes, Servant of Oni"] },
        p2: { graveyard: ["Savannah Lions", "Shock"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = attackNoBlocks(s, [{ id: bear, defender: "p2" }]);
      s = ninjutsu(s, "Ink-Eyes, Servant of Oni", bear);
      s = finishCombat(s, (req) => (req.intent === "may" ? [1] : undefined));
      expect(s.players.p2?.life).toBe(15);
      const lions = idOf(s, "p1", "battlefield", "Savannah Lions");
      expect(s.objects[lions]?.owner).toBe("p2");
      // Régénération : un bouclier qui empêche la prochaine destruction.
      const inkEyes = idOf(s, "p1", "battlefield", "Ink-Eyes, Servant of Oni");
      s = settle(activateLabeled(s, "p1", inkEyes, "Regenerate"));
      expect(s.objects[inkEyes]?.regenShields).toBe(1);
    });

    it("Nashi : exile la carte du dessus de chaque bibliothèque ; un seul sort jouable, payé en PV", () => {
      let s = scenario({
        p1: { battlefield: ["Bear Cub", ...lands("Swamp", 4)], hand: ["Nashi, Moon Sage's Scion"], library: ["Savannah Lions"] },
        p2: { library: ["Shock"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = attackNoBlocks(s, [{ id: bear, defender: "p2" }]);
      s = ninjutsu(s, "Nashi, Moon Sage's Scion", bear);
      s = finishCombat(s);
      const shock = s.exile.find((id) => nameOf(s, id) === "Shock") as string;
      const lions = s.exile.find((id) => nameOf(s, id) === "Savannah Lions") as string;
      expect(shock && lions).toBeTruthy();
      // Aucun mana rouge ni blanc : les sorts se lancent en payant des PV égaux à leur valeur de mana.
      expect(castable(s, "p1", shock)).toBe(true);
      expect(castable(s, "p1", lions)).toBe(true);
      const life = s.players.p1?.life ?? 0;
      s = settle(act(s, "p1", { type: "cast", card: shock, targets: { t: ["p2"] } } as never));
      expect(s.players.p1?.life).toBe(life - 1);
      expect(s.players.p2?.life).toBe(15);
      // « L'une de ces cartes » : l'autre n'est plus jouable.
      expect(castable(s, "p1", lions)).toBe(false);
    });

    it("Orochi Soul-Reaver : vos créatures blessent un joueur : un Trésor, et la carte du dessus de sa bibliothèque manifestée", () => {
      let s = scenario({
        p1: { battlefield: ["Orochi Soul-Reaver", "Bear Cub"] },
        p2: { library: ["Highborn Vampire", "Forest"] },
      });
      s = attack(s, [idOf(s, "p1", "battlefield", "Orochi Soul-Reaver"), idOf(s, "p1", "battlefield", "Bear Cub")]);
      s = finishCombat(s);
      expect(s.players.p2?.life).toBe(13);
      // Une seule fois pour les deux créatures (« une ou plusieurs »).
      expect(tokens(s, "Treasure")).toHaveLength(1);
      const faceDown = s.battlefield.filter((id) => s.objects[id]?.faceDown);
      expect(faceDown).toHaveLength(1);
      const fd = faceDown[0] as string;
      expect(s.objects[fd]?.controller).toBe("p1");
      expect(s.objects[fd]?.owner).toBe("p2");
      expect(pt(s, fd)).toEqual([2, 2]);
    });

    it("Throatseeker : vos Ninjas attaquants non bloqués ont le lien de vie (pas avant les bloqueurs, pas s'ils sont bloqués)", () => {
      let s = scenario({
        p1: { battlefield: ["Throatseeker", "Nezumi Prowler", "Okiba-Gang Shinobi"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      const seeker = idOf(s, "p1", "battlefield", "Throatseeker");
      const prowler = idOf(s, "p1", "battlefield", "Nezumi Prowler");
      const okiba = idOf(s, "p1", "battlefield", "Okiba-Gang Shinobi");
      s = attack(s, [prowler, okiba]);
      // Bloqueurs pas encore déclarés : aucun n'est « non bloqué ».
      expect(chars(s, prowler).keywords).not.toContain("lifelink");
      s = advanceUntil(s, (x) => x.pending?.kind === "declareBlockers");
      s = act(s, "p2", {
        type: "declareBlockers",
        blocks: [{ blocker: idOf(s, "p2", "battlefield", "Bear Cub"), attacker: okiba }],
      });
      expect(chars(s, prowler).keywords).toContain("lifelink");
      expect(chars(s, okiba).keywords).not.toContain("lifelink");
      expect(chars(s, seeker).keywords).not.toContain("lifelink");
      s = finishCombat(s);
      expect(s.players.p1?.life).toBe(23);
      // Hors combat, plus de lien de vie.
      expect(chars(s, prowler).keywords).not.toContain("lifelink");
    });
  });

  describe("autres créatures", () => {
    it("Archetype of Courage : vos créatures ont l'initiative ; les adverses la perdent et ne peuvent pas l'acquérir", () => {
      let s = scenario({
        p1: { battlefield: ["Archetype of Courage", "Bear Cub"] },
        p2: { battlefield: ["Brazen Collector", "Savannah Lions", "Plains"], hand: ["Interjection"] },
      });
      expect(chars(s, idOf(s, "p1", "battlefield", "Bear Cub")).keywords).toContain("firstStrike");
      const collector = idOf(s, "p2", "battlefield", "Brazen Collector");
      expect(chars(s, collector).keywords).not.toContain("firstStrike");
      // Interjection (plus récente) : +2/+2, mais pas l'initiative.
      const lions = idOf(s, "p2", "battlefield", "Savannah Lions");
      s = act(s, "p1", { type: "pass" });
      s = settle(castIt(s, "p2", "Interjection", { targets: { t: [lions] } }));
      expect(pt(s, lions)).toEqual([4, 3]);
      expect(chars(s, lions).keywords).not.toContain("firstStrike");
    });

    it("Astarion : Nourrir, un adversaire perd autant qu'il a perdu ce tour-ci ; Faux amis, vous gagnez autant que gagné", () => {
      const feedFirst = (label: string) => (req: { type: string; intent?: string; labels?: Record<string, string> }) =>
        req.type === "pick" && req.intent === "triggerMode"
          ? Object.entries(req.labels ?? {})
              .filter(([, l]) => l.startsWith(label))
              .map(([k]) => k)
          : undefined;
      let s = scenario({ p1: { battlefield: ["Astarion, the Decadent"] } });
      s = attack(s, [idOf(s, "p1", "battlefield", "Astarion, the Decadent")]);
      s = finishCombat(s);
      expect(s.players.p2?.life).toBe(16);
      expect(s.players.p1?.life).toBe(24);
      s = advanceUntil(s, (x) => x.turn.step === "end" && x.pending?.kind === "choice", 100);
      s = settle(s, feedFirst("Feed") as never);
      expect(s.players.p2?.life).toBe(12);

      let t = scenario({ p1: { battlefield: ["Astarion, the Decadent"] } });
      t = attack(t, [idOf(t, "p1", "battlefield", "Astarion, the Decadent")]);
      t = finishCombat(t);
      t = advanceUntil(t, (x) => x.turn.step === "end" && x.pending?.kind === "choice", 100);
      t = settle(t, feedFirst("Friends") as never);
      expect(t.players.p1?.life).toBe(28);
    });

    it("Bloodline Pretender : changelin ; un marqueur +1/+1 quand une autre créature du type choisi arrive", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Swamp", 5), "Plains"], hand: ["Bloodline Pretender", "Nezumi Prowler", "Savannah Lions"] },
      });
      s = settle(castIt(s, "p1", "Bloodline Pretender"), picking(["Ninja"]));
      const pretender = idOf(s, "p1", "battlefield", "Bloodline Pretender");
      expect(s.objects[pretender]?.chosen?.creatureType).toBe("Ninja");
      expect(matchesObjectFilter(s, "p1", pretender, { subtype: "Turtle" })).toBe(true);
      s = settle(castIt(s, "p1", "Nezumi Prowler"));
      expect(s.objects[pretender]?.counters["+1/+1"]).toBe(1);
      // Savannah Lions (un Chat) : rien.
      s = settle(castIt(s, "p1", "Savannah Lions"));
      expect(s.objects[pretender]?.counters["+1/+1"]).toBe(1);
    });

    it("Changeling Outcast : ne peut pas bloquer ni être bloquée ; tous les types de créature", () => {
      let s = scenario({
        p1: { battlefield: ["Changeling Outcast"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      const outcast = idOf(s, "p1", "battlefield", "Changeling Outcast");
      expect(["Ninja", "Rat", "Turtle"].every((t) => matchesObjectFilter(s, "p1", outcast, { subtype: t }))).toBe(true);
      s = attack(s, [outcast]);
      expect(canBlock(s, idOf(s, "p2", "battlefield", "Bear Cub"), outcast)).toBe(false);
      expect(chars(s, outcast).keywords).toEqual(expect.arrayContaining(["cantBlock", "unblockable"]));
    });

    it("Leonardo, Worldly Warrior : coûte {1} de moins par créature que vous contrôlez ; double initiative", () => {
      const s = scenario({
        p1: {
          battlefield: ["Bear Cub", "Savannah Lions", "Llanowar Elves", ...lands("Plains", 5)],
          hand: ["Leonardo, Worldly Warrior"],
        },
      });
      const leo = idOf(s, "p1", "hand", "Leonardo, Worldly Warrior");
      // {7}{W} − 3 = {4}{W} : cinq Plaines (Llanowar Elves compte comme créature, pas besoin de son mana).
      expect(castable(s, "p1", leo)).toBe(true);
      const t = scenario({ p1: { battlefield: ["Bear Cub", ...lands("Plains", 5)], hand: ["Leonardo, Worldly Warrior"] } });
      expect(castable(t, "p1", idOf(t, "p1", "hand", "Leonardo, Worldly Warrior"))).toBe(false);
      const u = settle(castIt(s, "p1", "Leonardo, Worldly Warrior"));
      expect(chars(u, idOf(u, "p1", "battlefield", "Leonardo, Worldly Warrior")).keywords).toContain("doubleStrike");
    });

    it("Mirror Entity : {X} : vos créatures ont une force et une endurance de base X/X et tous les types de créature", () => {
      let s = scenario({ p1: { battlefield: ["Mirror Entity", "Bear Cub", ...lands("Plains", 4)] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(activateLabeled(s, "p1", idOf(s, "p1", "battlefield", "Mirror Entity"), "Creatures you control", { x: 4 }));
      expect(pt(s, bear)).toEqual([4, 4]);
      expect(["Bear", "Ninja", "Turtle"].every((t) => matchesObjectFilter(s, "p1", bear, { subtype: t }))).toBe(true);
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(pt(s, bear)).toEqual([2, 2]);
    });

    it("Splinter, Aging Champion : détruit jusqu'à une créature engagée ; en partant, vous et un autre joueur piochez", () => {
      let s = scenario({
        p1: { battlefield: lands("Plains", 3), hand: ["Splinter, Aging Champion"] },
        p2: { battlefield: [{ name: "Bear Cub", tapped: true }, "Savannah Lions"], hand: ["Murder"] },
      });
      const offered: string[][] = [];
      s = settle(castIt(s, "p1", "Splinter, Aging Champion"), (req, _p, cur) => {
        if (req.type === "pick" && req.intent === "triggerTarget") offered.push(namesIn(cur, req.options) as string[]);
        return undefined;
      });
      expect(offered[0]).toEqual(["Bear Cub"]);
      expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
      const p1Hand = s.players.p1?.hand.length ?? 0;
      const p2Hand = s.players.p2?.hand.length ?? 0;
      // Il meurt : p1 et p2 piochent.
      const splinter = s.objects[idOf(s, "p1", "battlefield", "Splinter, Aging Champion")];
      if (splinter) splinter.damage = 5;
      bump(s);
      s = settle(act(s, "p1", { type: "pass" }));
      expect(s.players.p1?.hand.length).toBe(p1Hand + 1);
      expect(s.players.p2?.hand.length).toBe(p2Hand + 1);
    });
  });

  describe("enchantements", () => {
    it("Cover of Darkness : les créatures du type choisi ont la peur (bloquées seulement par des créatures noires ou artefacts)", () => {
      let s = scenario({
        p1: { battlefield: ["Nezumi Prowler", "Bear Cub", "Swamp", "Swamp"], hand: ["Cover of Darkness"] },
        p2: { battlefield: ["Savannah Lions", "Highborn Vampire"] },
      });
      s = settle(castIt(s, "p1", "Cover of Darkness"), picking(["Ninja"]));
      const prowler = idOf(s, "p1", "battlefield", "Nezumi Prowler");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = attack(s, [prowler, bear]);
      const lions = idOf(s, "p2", "battlefield", "Savannah Lions");
      const vampire = idOf(s, "p2", "battlefield", "Highborn Vampire");
      expect(canBlock(s, lions, prowler)).toBe(false);
      expect(canBlock(s, vampire, prowler)).toBe(true);
      expect(canBlock(s, lions, bear)).toBe(true);
    });

    it("Legion Loyalty : vos créatures ont la myriade (une copie attaque chacun des autres adversaires)", () => {
      let s = scenario({ players: 3, p1: { battlefield: ["Legion Loyalty", "Bear Cub"] } });
      s = attackPlayer(s, [idOf(s, "p1", "battlefield", "Bear Cub")], "p2");
      s = settleNoBlocks(s, (req) => (req.type === "pick" ? req.options : undefined));
      const copies = tokens(s, "Bear Cub");
      expect(copies).toHaveLength(1);
      expect(defenderOf(s, copies[0] as string)).toBe("p3");
      s = finishCombat(s);
      expect(s.players.p2?.life).toBe(18);
      expect(s.players.p3?.life).toBe(18);
      // Exilée à la fin du combat.
      expect(tokens(s, "Bear Cub")).toHaveLength(0);
    });

    it("No Mercy : une créature qui vous inflige des blessures est détruite", () => {
      let s = scenario({ p1: { battlefield: ["No Mercy"] }, p2: { battlefield: ["Bear Cub", "Savannah Lions"] }, active: "p2" });
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
      s = act(s, "p2", { type: "declareAttackers", attackers: [{ id: bear, defender: "p1" }] });
      s = finishCombat(s);
      expect(s.players.p1?.life).toBe(18);
      expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(idsOf(s, "p2", "battlefield", "Savannah Lions")).toHaveLength(1);
    });

    it("Wound Reflection : à chaque étape de fin, chaque adversaire perd autant qu'il a perdu ce tour-ci", () => {
      let s = scenario({ players: 3, p1: { battlefield: ["Wound Reflection", "Bear Cub"] } });
      s = attackPlayer(s, [idOf(s, "p1", "battlefield", "Bear Cub")], "p2");
      s = finishCombat(s);
      s = advanceUntil(s, (x) => x.turn.step === "cleanup" || x.turn.active === "p2", 100);
      expect(s.players.p2?.life).toBe(16);
      expect(s.players.p3?.life).toBe(20);
    });
  });

  describe("éphémère et artefacts", () => {
    it("Akroma's Will : un mode ; les deux si vous contrôlez un commandant", () => {
      const modesOf = (s: S) =>
        legalActions(s, "p1")
          .flatMap((a) => (a.type === "cast" && nameOf(s, a.card) === "Akroma's Will" ? a.modes : []))
          .map((m) => m.label);
      let s = scenario({ p1: { battlefield: ["Bear Cub", ...lands("Plains", 4)], hand: ["Akroma's Will"] } });
      expect(modesOf(s)).toHaveLength(2);
      s = makeCommander(s, idOf(s, "p1", "battlefield", "Bear Cub"));
      const labels = modesOf(s);
      expect(labels).toHaveLength(3);
      const both = legalActions(s, "p1")
        .flatMap((a) => (a.type === "cast" && nameOf(s, a.card) === "Akroma's Will" ? a.modes : []))
        .find((m) => m.label?.startsWith("Both"));
      s = settle(castIt(s, "p1", "Akroma's Will", { mode: both?.index }));
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      expect(chars(s, bear).keywords).toEqual(
        expect.arrayContaining(["flying", "vigilance", "doubleStrike", "lifelink", "indestructible"]),
      );
      expect(chars(s, bear).protections.map((p) => p.label)).toContain("Protection from each color");
    });

    it("Helm of the Host : au début de votre combat, un jeton copie non légendaire de la créature équipée, avec la célérité", () => {
      let s = scenario({ p1: { battlefield: ["Helm of the Host", "Splinter, Aging Champion", ...lands("Plains", 5)] } });
      const splinter = idOf(s, "p1", "battlefield", "Splinter, Aging Champion");
      const helm = idOf(s, "p1", "battlefield", "Helm of the Host");
      s = settle(activateLabeled(s, "p1", helm, "Equip", { targets: { t: [splinter] } }));
      expect(s.objects[helm]?.attachedTo).toBe(splinter);
      s = advanceUntil(s, (x) => x.turn.step === "beginCombat" && x.pending?.kind === "priority" && x.stack.length > 0);
      s = settle(s);
      const copies = tokens(s, "Splinter, Aging Champion");
      expect(copies).toHaveLength(1);
      const copy = copies[0] as string;
      expect(chars(s, copy).supertypes).not.toContain("Legendary");
      expect(chars(s, copy).keywords).toContain("haste");
      // L'original reste (pas de règle de légende).
      expect(s.objects[splinter]?.zone).toBe("battlefield");
    });

    it("Sonic Screwdriver : mana de n'importe quelle couleur ; dégage un autre artefact ; regard 1 ; une créature imblocable", () => {
      let s = scenario({
        p1: { battlefield: ["Sonic Screwdriver", { name: "Sol Ring", tapped: true }, "Bear Cub", ...lands("Plains", 3)] },
        p2: { battlefield: ["Savannah Lions"] },
      });
      const screwdriver = idOf(s, "p1", "battlefield", "Sonic Screwdriver");
      const ring = idOf(s, "p1", "battlefield", "Sol Ring");
      s = tapMana(s, "Sonic Screwdriver", "B");
      expect(s.players.p1?.manaPool.B).toBe(1);
      s = scenario({
        p1: { battlefield: ["Sonic Screwdriver", { name: "Sol Ring", tapped: true }, "Bear Cub", ...lands("Plains", 3)] },
        p2: { battlefield: ["Savannah Lions"] },
      });
      const sd = idOf(s, "p1", "battlefield", "Sonic Screwdriver");
      const ring2 = idOf(s, "p1", "battlefield", "Sol Ring");
      // « Un autre artefact » : il ne peut pas se cibler lui-même.
      const untap = activations(s, "p1", sd).find((a) => a.label?.startsWith("Untap"));
      expect(untap?.targets[0]?.legal).toEqual([ring2]);
      s = settle(activateLabeled(s, "p1", sd, "Untap", { targets: { t: [ring2] } }));
      expect(s.objects[ring2]?.tapped).toBe(false);
      expect(ring && screwdriver).toBeTruthy();
      // {3} : imblocable ce tour-ci (Sol Ring paie {2}).
      let t = scenario({
        p1: { battlefield: ["Sonic Screwdriver", "Bear Cub", ...lands("Plains", 3)] },
        p2: { battlefield: ["Savannah Lions"] },
      });
      const bear = idOf(t, "p1", "battlefield", "Bear Cub");
      t = settle(
        activateLabeled(t, "p1", idOf(t, "p1", "battlefield", "Sonic Screwdriver"), "A creature", { targets: { t: [bear] } }),
      );
      t = attack(t, [bear]);
      expect(canBlock(t, idOf(t, "p2", "battlefield", "Savannah Lions"), bear)).toBe(false);
    });

    it("Strionic Resonator : copie une capacité déclenchée que vous contrôlez", () => {
      let s = scenario({ p1: { battlefield: ["Strionic Resonator", ...lands("Plains", 5)], hand: ["Inspiring Overseer"] } });
      s = castIt(s, "p1", "Inspiring Overseer");
      s = passAccepting(s, (x) => x.stack.some((i) => i.kind === "ability"));
      const trigger = s.stack.find((i) => i.kind === "ability")?.id as string;
      expect(trigger).toBeTruthy();
      const hand = s.players.p1?.hand.length ?? 0;
      s = settle(
        activateLabeled(s, "p1", idOf(s, "p1", "battlefield", "Strionic Resonator"), "Copy", { targets: { t: [trigger] } }),
      );
      expect(s.players.p1?.life).toBe(22);
      expect(s.players.p1?.hand.length).toBe(hand + 2);
    });

    it("Whispersilk Cloak : la créature équipée est imblocable et a la défense totale", () => {
      let s = scenario({
        p1: { battlefield: ["Whispersilk Cloak", "Bear Cub", ...lands("Plains", 2)] },
        p2: { battlefield: ["Savannah Lions", "Mountain"], hand: ["Shock"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(
        activateLabeled(s, "p1", idOf(s, "p1", "battlefield", "Whispersilk Cloak"), "Equip", { targets: { t: [bear] } }),
      );
      expect(chars(s, bear).keywords).toEqual(expect.arrayContaining(["unblockable", "shroud"]));
      s = act(s, "p1", { type: "pass" });
      const shock = legalActions(s, "p2").find((a) => a.type === "cast" && nameOf(s, a.card) === "Shock");
      expect(shock?.type === "cast" && shock.modes[0]?.targets[0]?.legal.includes(bear)).toBe(false);
      expect(shock?.type === "cast" && shock.modes[0]?.targets[0]?.legal.includes("p1")).toBe(true);
    });
  });

  describe("terrains", () => {
    it("Access Tunnel : une créature de force 3 ou moins ne peut pas être bloquée ce tour-ci", () => {
      let s = scenario({
        p1: { battlefield: ["Access Tunnel", "Bear Cub", "Highborn Vampire", ...lands("Plains", 3)] },
        p2: { battlefield: ["Savannah Lions"] },
      });
      const tunnel = idOf(s, "p1", "battlefield", "Access Tunnel");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const ability = activations(s, "p1", tunnel).find((a) => a.label?.startsWith("A creature"));
      expect(namesIn(s, ability?.targets[0]?.legal)).toEqual(["Bear Cub", "Savannah Lions"]);
      s = settle(activateLabeled(s, "p1", tunnel, "A creature", { targets: { t: [bear] } }));
      s = attack(s, [bear]);
      expect(canBlock(s, idOf(s, "p2", "battlefield", "Savannah Lions"), bear)).toBe(false);
    });

    it("Shizo : une créature légendaire gagne la peur jusqu'à la fin du tour", () => {
      let s = scenario({
        p1: { battlefield: ["Shizo, Death's Storehouse", "Swamp", "Splinter, Aging Champion", "Bear Cub"] },
        p2: { battlefield: ["Savannah Lions", "Highborn Vampire"] },
      });
      const shizo = idOf(s, "p1", "battlefield", "Shizo, Death's Storehouse");
      const splinter = idOf(s, "p1", "battlefield", "Splinter, Aging Champion");
      const ability = activations(s, "p1", shizo).find((a) => a.label?.startsWith("A legendary creature"));
      expect(namesIn(s, ability?.targets[0]?.legal)).toEqual(["Splinter, Aging Champion"]);
      s = settle(activateLabeled(s, "p1", shizo, "A legendary creature", { targets: { t: [splinter] } }));
      s = attack(s, [splinter]);
      expect(canBlock(s, idOf(s, "p2", "battlefield", "Savannah Lions"), splinter)).toBe(false);
      expect(canBlock(s, idOf(s, "p2", "battlefield", "Highborn Vampire"), splinter)).toBe(true);
    });

    it("The Black Gate : 3 PV ou engagée ; imblocable par les créatures du joueur qui a le plus de PV", () => {
      // Arrivée : payer 3 PV (dégagée) ou non (engagée).
      const s = scenario({ p1: { hand: ["The Black Gate"] } });
      const gate = idOf(s, "p1", "hand", "The Black Gate");
      const plays = legalActions(s, "p1").filter((a) => a.type === "playLand" && a.card === gate);
      expect(plays.map((a) => a.type === "playLand" && !!a.payLife)).toEqual([true, false]);
      const paid = act(s, "p1", { type: "playLand", card: gate, payLife: true } as never);
      expect(paid.players.p1?.life).toBe(17);
      expect(paid.objects[idOf(paid, "p1", "battlefield", "The Black Gate")]?.tapped).toBe(false);
      const unpaid = act(s, "p1", { type: "playLand", card: gate } as never);
      expect(unpaid.players.p1?.life).toBe(20);
      expect(unpaid.objects[idOf(unpaid, "p1", "battlefield", "The Black Gate")]?.tapped).toBe(true);

      // À trois : p2 a le plus de PV ; la créature ne peut pas être bloquée par ses créatures, mais par celles de p3.
      let t = scenario({
        players: 3,
        p1: { battlefield: ["The Black Gate", "Swamp", "Swamp", "Bear Cub"] },
        p2: { life: 30, battlefield: ["Savannah Lions"] },
        p3: { battlefield: ["Llanowar Elves"] },
      });
      const bear = idOf(t, "p1", "battlefield", "Bear Cub");
      t = settle(
        activateLabeled(t, "p1", idOf(t, "p1", "battlefield", "The Black Gate"), "A creature", { targets: { t: [bear] } }),
      );
      const rule = chars(t, bear).blockRules.find((r) => r.cantBeBlockedByPlayer);
      expect(rule?.cantBeBlockedByPlayer).toBe("p2");
      t = attackPlayer(t, [bear], "p2");
      expect(canBlock(t, idOf(t, "p2", "battlefield", "Savannah Lions"), bear)).toBe(false);
      // Vous avez le plus de PV : vous vous choisissez, l'effet ne fait rien.
      let u = scenario({
        p1: { life: 30, battlefield: ["The Black Gate", "Swamp", "Swamp", "Bear Cub"] },
        p2: { battlefield: ["Savannah Lions"] },
      });
      const bear2 = idOf(u, "p1", "battlefield", "Bear Cub");
      u = settle(
        activateLabeled(u, "p1", idOf(u, "p1", "battlefield", "The Black Gate"), "A creature", { targets: { t: [bear2] } }),
      );
      u = attack(u, [bear2]);
      expect(canBlock(u, idOf(u, "p2", "battlefield", "Savannah Lions"), bear2)).toBe(true);
    });

    it("Tainted Field : {C} ; {W} ou {B} seulement si vous contrôlez un Marais", () => {
      const s = scenario({ p1: { battlefield: ["Tainted Field"] } });
      const field = idOf(s, "p1", "battlefield", "Tainted Field");
      const colors = (x: S) => legalActions(x, "p1").filter((a) => a.type === "tapForMana" && a.source === field).length;
      expect(colors(s)).toBe(1);
      const t = scenario({ p1: { battlefield: ["Tainted Field", "Swamp"] } });
      expect(
        legalActions(t, "p1").filter((a) => a.type === "tapForMana" && a.source === idOf(t, "p1", "battlefield", "Tainted Field"))
          .length,
      ).toBe(2);
    });
  });
});
