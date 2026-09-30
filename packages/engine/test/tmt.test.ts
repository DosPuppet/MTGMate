/**
 * Teenage Mutant Ninja Turtles (extension partielle : cartes des decks du méta) : chaque carte gérée est confrontée à
 * son texte Oracle (plan R, lot R7). Faufilement, jetons Mutagène, Classe à trois niveaux, Équipement…
 * Le premier déclenchement de The Ooze n'est pas testé ici : une créature avec des marqueurs +1/+1 qui quitte le champ
 * de bataille ne donne aucun Mutagène (`ref.eventObject` ne retrouve plus l'objet parti).
 */
import { describe, expect, it } from "vitest";
import { legalActions } from "../src/legal";
import { chars } from "../src/state";
import type { ChoiceRequest, ChoiceValue, GameState } from "../src/types";
import { act, advanceUntil, idOf, idsOf, scenario } from "./helpers";

type S = GameState;
/** Réponse à un choix (`undefined` : la suggestion), selon la position courante. */
type Answer = (req: ChoiceRequest, cur: S) => ChoiceValue[] | undefined;
const lands = (name: string, n: number) => Array(n).fill(name) as string[];
const nameOf = (s: S, id: string) => s.defs[s.objects[id]?.defId ?? ""]?.name;
const namesIn = (s: S, ids: string[] | undefined) => (ids ?? []).map((id) => nameOf(s, id));

/**
 * Passe et répond aux choix (réponse suggérée par défaut) jusqu'à une pile vide, sans déclenchement en attente. Les
 * défenseurs ne bloquent pas.
 */
const settle = (s: S, answer: Answer = () => undefined): S => {
  let cur = s;
  for (let i = 0; i < 300; i++) {
    const p = cur.pending;
    if (p?.kind === "priority" && cur.stack.length === 0 && cur.triggers.length === 0 && i > 0) break;
    if (p?.kind === "priority") cur = act(cur, p.player, { type: "pass" });
    else if (p?.kind === "choice")
      cur = act(cur, p.player, { type: "choose", values: answer(p.request, cur) ?? p.request.suggested });
    else if (p?.kind === "declareBlockers") cur = act(cur, p.player, { type: "declareBlockers", blocks: [] });
    else break;
  }
  return cur;
};
/** Joue (sans attaquer ni bloquer) jusqu'à la seconde phase principale, en répondant aux choix. */
const throughCombat = (s: S, answer: Answer = () => undefined): S => {
  let cur = s;
  for (let i = 0; i < 300 && cur.turn.step !== "main2"; i++) {
    const p = cur.pending;
    if (p?.kind === "priority") cur = act(cur, p.player, { type: "pass" });
    else if (p?.kind === "choice")
      cur = act(cur, p.player, { type: "choose", values: answer(p.request, cur) ?? p.request.suggested });
    else if (p?.kind === "declareBlockers") cur = act(cur, p.player, { type: "declareBlockers", blocks: [] });
    else break;
  }
  return cur;
};
const cast = (s: S, player: string, name: string, extra: object = {}) =>
  act(s, player, { type: "cast", card: idOf(s, player, "hand", name), ...extra });
/** Active la capacité de `source` dont le libellé contient `label` (la première sinon). */
const activate = (s: S, player: string, source: string, label?: string, extra: object = {}) => {
  const a = legalActions(s, player).find(
    (x) => x.type === "activate" && x.source === source && (!label || x.label?.includes(label)),
  );
  if (a?.type !== "activate") throw new Error(`capacité introuvable : ${label ?? source}`);
  return act(s, player, { type: "activate", source, ability: a.ability, ...extra });
};
const canActivate = (s: S, player: string, source: string) =>
  legalActions(s, player).some((x) => x.type === "activate" && x.source === source);
/** Va à la déclaration des attaquants de p1 et attaque p2 avec `attackers`. */
const attack = (s: S, attackers: string[]) => {
  const cur = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
  return act(cur, "p1", { type: "declareAttackers", attackers: attackers.map((id) => ({ id, defender: "p2" })) });
};
/** Sélectionne dans les options d'un choix l'objet nommé `name`. */
const pickNamed = (s: S, req: ChoiceRequest, name: string) =>
  req.type === "pick" ? req.options.filter((id) => nameOf(s, id) === name).slice(0, 1) : undefined;

describe("Teenage Mutant Ninja Turtles", () => {
  describe("Escape Tunnel", () => {
    it("{T}, sacrifice : un terrain de base de la bibliothèque arrive engagé", () => {
      let s = scenario({ p1: { battlefield: ["Escape Tunnel"], library: ["Opt", "Island", "Opt"] } });
      const tunnel = idOf(s, "p1", "battlefield", "Escape Tunnel");
      s = settle(activate(s, "p1", tunnel, "terrain de base"), (req, cur) => pickNamed(cur, req, "Island"));
      const island = idOf(s, "p1", "battlefield", "Island");
      expect(s.objects[island]?.tapped).toBe(true);
      expect(idsOf(s, "p1", "graveyard", "Escape Tunnel")).toHaveLength(1);
      expect(s.players.p1?.library).toHaveLength(2);
    });

    it("{T}, sacrifice : une créature de force 2 ou moins ne peut pas être bloquée ce tour-ci", () => {
      let s = scenario({
        p1: { battlefield: ["Escape Tunnel", "Bear Cub", "Fire Elemental"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const tunnel = idOf(s, "p1", "battlefield", "Escape Tunnel");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const fire = idOf(s, "p1", "battlefield", "Fire Elemental");
      // Fire Elemental a une force de 5 : cible illégale.
      expect(() => activate(s, "p1", tunnel, "force 2", { targets: { t: [fire] } })).toThrow();
      s = settle(activate(s, "p1", tunnel, "force 2", { targets: { t: [bear] } }));
      expect(idsOf(s, "p1", "graveyard", "Escape Tunnel")).toHaveLength(1);
      expect(chars(s, bear).keywords).toContain("unblockable");
      // L'Ange ne peut pas bloquer : l'étape des bloqueurs n'attend aucune décision de p2.
      s = attack(s, [bear]);
      s = advanceUntil(s, (x) => x.pending?.kind === "declareBlockers" || x.turn.step === "end");
      expect(s.turn.step).toBe("end");
      expect(s.players.p2?.life).toBe(18);
      // Témoin : sans le Tunnel, p2 peut bloquer l'Ourson.
      let t = scenario({ p1: { battlefield: ["Bear Cub"] }, p2: { battlefield: ["Serra Angel"] } });
      t = attack(t, [idOf(t, "p1", "battlefield", "Bear Cub")]);
      t = advanceUntil(t, (x) => x.pending?.kind === "declareBlockers" || x.turn.step === "end");
      expect(t.pending?.kind).toBe("declareBlockers");
    });
  });

  describe("Leatherhead, Swamp Stalker", () => {
    it("blessures de combat à un joueur : retirer un marqueur détruit un de ses artefacts ou enchantements", () => {
      let s = scenario({
        p1: { battlefield: ["Leatherhead, Swamp Stalker", "Fishing Pole"] },
        p2: { battlefield: ["Warleader's Call", "Fishing Pole"] },
      });
      const lh = idOf(s, "p1", "battlefield", "Leatherhead, Swamp Stalker");
      (s.objects[lh] as { counters: Record<string, number> }).counters.hexproof = 1;
      s.version += 1;
      const call = idOf(s, "p2", "battlefield", "Warleader's Call");
      const pole = idOf(s, "p1", "battlefield", "Fishing Pole");
      let options: string[] = [];
      s = throughCombat(attack(s, [lh]), (req) => {
        if (req.intent === "may") return [1];
        if (req.type === "pick" && req.options.includes(call)) {
          options = req.options;
          return [call];
        }
        return undefined;
      });
      expect(s.players.p2?.life).toBe(15);
      // Les artefacts et enchantements de p2 sont proposés, pas l'artefact de p1.
      expect(options).toEqual(expect.arrayContaining([call, idOf(s, "p2", "battlefield", "Fishing Pole")]));
      expect(options).not.toContain(pole);
      expect(idsOf(s, "p2", "graveyard", "Warleader's Call")).toHaveLength(1);
      expect(s.objects[lh]?.counters.hexproof ?? 0).toBe(0);
      expect(chars(s, lh).keywords).not.toContain("hexproof");
      expect(chars(s, lh).keywords).toContain("trample");
    });

    it("sans marqueur à retirer, rien n'est détruit", () => {
      let s = scenario({ p1: { battlefield: ["Leatherhead, Swamp Stalker"] }, p2: { battlefield: ["Warleader's Call"] } });
      const lh = idOf(s, "p1", "battlefield", "Leatherhead, Swamp Stalker");
      let asked = false;
      s = throughCombat(attack(s, [lh]), (req) => {
        if (req.intent === "may") asked = true;
        return req.intent === "may" ? [1] : undefined;
      });
      expect(asked).toBe(true);
      expect(s.players.p2?.life).toBe(15);
      expect(idsOf(s, "p2", "battlefield", "Warleader's Call")).toHaveLength(1);
    });
  });

  it("Dream Beavers : vol ; en arrivant, chaque adversaire perd 1 PV, vous en gagnez 1, puis regard 1", () => {
    let s = scenario({
      players: 3,
      p1: { battlefield: ["Swamp"], hand: ["Dream Beavers"], library: ["Opt", "Forest", "Island"] },
    });
    let scried = false;
    s = settle(cast(s, "p1", "Dream Beavers"), (req, cur) => {
      if (req.intent !== "scryBottom" || req.type !== "pick") return undefined;
      scried = true;
      expect(namesIn(cur, req.options)).toEqual(["Opt"]);
      return req.options;
    });
    expect(scried).toBe(true);
    expect([s.players.p1?.life, s.players.p2?.life, s.players.p3?.life]).toEqual([21, 19, 19]);
    expect(namesIn(s, s.players.p1?.library)).toEqual(["Forest", "Island", "Opt"]);
    expect(chars(s, idOf(s, "p1", "battlefield", "Dream Beavers")).keywords).toContain("flying");
  });

  describe("Mutagen Man, Living Ooze", () => {
    it("crée X Mutagènes ; piétinement ; les capacités de vos jetons d'artefact coûtent {1} de moins", () => {
      let s = scenario({ p1: { battlefield: lands("Forest", 5), hand: ["Mutagen Man, Living Ooze"] } });
      s = settle(cast(s, "p1", "Mutagen Man, Living Ooze", { x: 3 }));
      const man = idOf(s, "p1", "battlefield", "Mutagen Man, Living Ooze");
      const mutagens = idsOf(s, "p1", "battlefield", "Mutagen");
      expect(mutagens).toHaveLength(3);
      expect(chars(s, man).keywords).toContain("trample");
      expect(s.battlefield.filter((id) => nameOf(s, id) === "Forest" && !s.objects[id]?.tapped)).toHaveLength(0);
      // Plus aucun mana : la capacité {1} du Mutagène ne coûte rien.
      s = settle(activate(s, "p1", mutagens[0] as string, undefined, { targets: { t: [man] } }));
      expect(s.objects[man]?.counters["+1/+1"]).toBe(1);
      expect(idsOf(s, "p1", "battlefield", "Mutagen")).toHaveLength(2);
    });

    it("le Mutagène ne s'active qu'en rituel ; sans Mutagen Man, il coûte bien {1}", () => {
      let s = scenario({ p1: { battlefield: lands("Forest", 3), hand: ["Mutagen Man, Living Ooze"] } });
      s = settle(cast(s, "p1", "Mutagen Man, Living Ooze", { x: 1 }));
      const mutagen = idOf(s, "p1", "battlefield", "Mutagen");
      expect(canActivate(s, "p1", mutagen)).toBe(true);
      s = advanceUntil(s, (x) => x.turn.step === "beginCombat" && x.pending?.kind === "priority" && x.pending.player === "p1");
      expect(s.turn.step).toBe("beginCombat");
      expect(canActivate(s, "p1", mutagen)).toBe(false);
      // Un Mutagène créé par The Ooze, sans Mutagen Man : {1} à payer.
      const setup = (battlefield: string[]) => {
        const t = scenario({ p1: { battlefield: ["The Ooze", "Bear Cub", ...battlefield] }, p2: { graveyard: ["Opt"] } });
        const ooze = idOf(t, "p1", "battlefield", "The Ooze");
        const u = settle(activate(t, "p1", ooze, undefined, { targets: { t: [idOf(t, "p2", "graveyard", "Opt")] } }));
        return canActivate(u, "p1", idOf(u, "p1", "battlefield", "Mutagen"));
      };
      expect(setup([])).toBe(false);
      expect(setup(["Mountain"])).toBe(true);
    });
  });

  describe("The Ooze", () => {
    it("{T} : exile une carte d'un cimetière et crée un Mutagène", () => {
      let s = scenario({ p1: { battlefield: ["The Ooze"] }, p2: { graveyard: ["Serra Angel"] } });
      const ooze = idOf(s, "p1", "battlefield", "The Ooze");
      const angel = idOf(s, "p2", "graveyard", "Serra Angel");
      s = settle(activate(s, "p1", ooze, undefined, { targets: { t: [angel] } }));
      expect(s.objects[ooze]?.tapped).toBe(true);
      expect(s.players.p2?.graveyard).not.toContain(angel);
      expect(s.exile.map((id) => nameOf(s, id))).toEqual(["Serra Angel"]);
      expect(idsOf(s, "p1", "battlefield", "Mutagen")).toHaveLength(1);
    });
  });

  it("Skateboard : engage un permanent en arrivant ; la créature équipée a +1/+0 et la célérité ; Équiper {1}", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Mountain", 2), { name: "Bear Cub", sick: true }], hand: ["Skateboard"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    s = settle(cast(s, "p1", "Skateboard"), (req) => (req.type === "pick" && req.options.includes(angel) ? [angel] : undefined));
    expect(s.objects[angel]?.tapped).toBe(true);
    const board = idOf(s, "p1", "battlefield", "Skateboard");
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = settle(activate(s, "p1", board, undefined, { targets: { t: [bear] } }));
    expect(s.objects[board]?.attachedTo).toBe(bear);
    expect(s.battlefield.filter((id) => nameOf(s, id) === "Mountain" && s.objects[id]?.tapped)).toHaveLength(2);
    expect([chars(s, bear).power, chars(s, bear).toughness]).toEqual([3, 2]);
    expect(chars(s, bear).keywords).toContain("haste");
    // Arrivée ce tour-ci, elle attaque grâce à la célérité.
    s = settle(attack(s, [bear]));
    s = advanceUntil(s, (x) => x.turn.step === "end");
    expect(s.players.p2?.life).toBe(17);
  });

  it("The Last Ronin's Technique lancée normalement : trois Esprits Tortue Ninja 1/1 blancs, dégagés et hors combat", () => {
    let s = scenario({ p1: { battlefield: lands("Plains", 4), hand: ["The Last Ronin's Technique"] } });
    s = settle(cast(s, "p1", "The Last Ronin's Technique"));
    const spirits = idsOf(s, "p1", "battlefield", "Ninja Turtle Spirit");
    expect(spirits).toHaveLength(3);
    for (const id of spirits) {
      const c = chars(s, id);
      expect([c.power, c.toughness]).toEqual([1, 1]);
      expect(c.colors).toEqual(["W"]);
      expect(c.subtypes).toEqual(expect.arrayContaining(["Ninja", "Turtle", "Spirit"]));
      expect(s.objects[id]?.tapped).toBe(false);
    }
    expect(s.combat?.attackers ?? []).toHaveLength(0);
    expect(idsOf(s, "p1", "graveyard", "The Last Ronin's Technique")).toHaveLength(1);
  });

  describe("Cool but Rude", () => {
    it("niveau 1 : quand vous attaquez, vous pouvez défausser une carte pour en piocher une", () => {
      let s = scenario({ p1: { battlefield: ["Cool but Rude", "Bear Cub"], hand: ["Opt"], library: lands("Island", 3) } });
      const opt = idOf(s, "p1", "hand", "Opt");
      s = settle(attack(s, [idOf(s, "p1", "battlefield", "Bear Cub")]), (req) =>
        req.type === "pick" && req.options.includes(opt) ? [opt] : undefined,
      );
      expect(namesIn(s, s.players.p1?.hand)).toEqual(["Island"]);
      expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(1);
      // Niveau 1 seulement : la défausse n'inflige rien.
      expect(s.players.p2?.life).toBe(20);
    });

    it("niveau 1 : on peut refuser de défausser, et alors on ne pioche pas", () => {
      let s = scenario({ p1: { battlefield: ["Cool but Rude", "Bear Cub"], hand: ["Opt"], library: lands("Island", 3) } });
      s = settle(attack(s, [idOf(s, "p1", "battlefield", "Bear Cub")]), (req) => (req.type === "pick" ? [] : undefined));
      expect(namesIn(s, s.players.p1?.hand)).toEqual(["Opt"]);
      expect(s.players.p1?.graveyard).toHaveLength(0);
    });

    it("niveau 2 ({1}{R}) : chaque carte défaussée inflige 2 blessures à chaque adversaire", () => {
      let s = scenario({
        players: 3,
        p1: { battlefield: ["Cool but Rude", "Bear Cub", ...lands("Mountain", 2)], hand: ["Opt"], library: lands("Island", 3) },
      });
      const cls = idOf(s, "p1", "battlefield", "Cool but Rude");
      s = settle(activate(s, "p1", cls));
      expect(s.objects[cls]?.classLevel).toBe(2);
      const opt = idOf(s, "p1", "hand", "Opt");
      s = settle(attack(s, [idOf(s, "p1", "battlefield", "Bear Cub")]), (req) =>
        req.type === "pick" && req.options.includes(opt) ? [opt] : undefined,
      );
      // Encore à l'étape de déclaration des attaquants : les 2 blessures viennent de la défausse.
      expect(s.turn.step).toBe("declareAttackers");
      expect([s.players.p1?.life, s.players.p2?.life, s.players.p3?.life]).toEqual([20, 18, 18]);
    });

    it("niveau 3 : cherchez une carte, puis défaussez une carte au hasard (qui déclenche le niveau 2)", () => {
      let s = scenario({
        p1: { battlefield: ["Cool but Rude", ...lands("Mountain", 4)], library: ["Island", "Opt", "Island"] },
      });
      const cls = idOf(s, "p1", "battlefield", "Cool but Rude");
      s = settle(activate(s, "p1", cls));
      let searched = false;
      s = settle(activate(s, "p1", cls), (req, cur) => {
        const opt = pickNamed(cur, req, "Opt");
        if (req.intent === "search" && opt?.length) searched = true;
        return opt?.length ? opt : undefined;
      });
      expect(searched).toBe(true);
      expect(s.objects[cls]?.classLevel).toBe(3);
      // La main ne contenait que la carte cherchée : c'est elle qui est défaussée.
      expect(s.players.p1?.hand).toHaveLength(0);
      expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(1);
      expect(s.players.p1?.library).toHaveLength(2);
      expect(s.players.p2?.life).toBe(18);
    });
  });

  it("Casey Jones, Vigilante : piochez trois cartes, puis trois défaussées au hasard à votre prochain entretien", () => {
    let s = scenario({
      p1: { battlefield: lands("Mountain", 3), hand: ["Casey Jones, Vigilante"], library: lands("Island", 10) },
    });
    s = settle(cast(s, "p1", "Casey Jones, Vigilante"));
    expect(s.players.p1?.hand).toHaveLength(3);
    // Pas pendant l'entretien de l'adversaire.
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    expect(s.players.p1?.hand).toHaveLength(3);
    s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1");
    // Les trois cartes défaussées à l'entretien, puis la pioche du tour.
    expect(idsOf(s, "p1", "graveyard", "Island")).toHaveLength(3);
    expect(s.players.p1?.hand).toHaveLength(1);
  });

  it("Michelangelo's Technique : les cartes non choisies parmi les huit vont au-dessous de la bibliothèque", () => {
    let s = scenario({
      p1: {
        battlefield: lands("Forest", 5),
        hand: ["Michelangelo's Technique"],
        library: ["Bear Cub", "Opt", ...lands("Forest", 6), "Island", "Swamp"],
      },
    });
    let seen: (string | undefined)[] = [];
    s = settle(cast(s, "p1", "Michelangelo's Technique"), (req, cur) => {
      if (req.type !== "pick") return undefined;
      seen = namesIn(cur, req.options);
      return pickNamed(cur, req, "Bear Cub");
    });
    // Seules les cartes de créature sont proposées.
    expect(seen).toEqual(["Bear Cub"]);
    expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
    const library = namesIn(s, s.players.p1?.library);
    expect(library.slice(0, 2)).toEqual(["Island", "Swamp"]);
    expect(library).toHaveLength(9);
  });
});
