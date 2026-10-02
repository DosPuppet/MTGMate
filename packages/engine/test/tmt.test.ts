/**
 * Teenage Mutant Ninja Turtles (extension partielle : cartes des decks du méta) : chaque carte gérée est confrontée à
 * son texte Oracle (plan R, lot R7). Faufilement, jetons Mutagène, Classe à trois niveaux, Équipement…
 */
import { describe, expect, it } from "vitest";
import { destroy } from "../src/actions";
import { legalActions } from "../src/legal";
import { chars } from "../src/state";
import type { ChoiceRequest, ChoiceValue, GameState } from "../src/types";
import { act, advanceUntil, idOf, idsOf, passAccepting, scenario } from "./helpers";

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

    it("une de vos créatures avec des marqueurs +1/+1 qui part : un Mutagène par marqueur (dernières informations)", () => {
      let s = scenario({ p1: { battlefield: ["The Ooze", { name: "Bear Cub", counters: { "+1/+1": 2 } }, "Llanowar Elves"] } });
      destroy(s, idOf(s, "p1", "battlefield", "Bear Cub"));
      destroy(s, idOf(s, "p1", "battlefield", "Llanowar Elves"));
      s = passAccepting(s, (x) => x.triggers.length === 0 && x.stack.length === 0);
      expect(idsOf(s, "p1", "battlefield", "Mutagen")).toHaveLength(2);
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

describe("lot A, blanc", () => {
  type S = GameState;
  /** Réponse à un choix (`undefined` : la suggestion), selon la position courante. */
  type Answer = (req: ChoiceRequest, cur: S) => ChoiceValue[] | undefined;
  const lands = (name: string, n: number) => Array(n).fill(name) as string[];
  const nameOf = (s: S, id: string) => s.defs[s.objects[id]?.defId ?? ""]?.name;
  const namesIn = (s: S, ids: string[] | undefined) => (ids ?? []).map((id) => nameOf(s, id));
  const pt = (s: S, id: string) => [chars(s, id).power, chars(s, id).toughness];
  const counters = (s: S, id: string) => s.objects[id]?.counters["+1/+1"] ?? 0;

  /**
   * Joue (passes, choix, aucune attaque ni blocage, défausse de l'excédent) jusqu'à `until`, en répondant aux choix
   * (suggestion par défaut).
   */
  const drive = (s: S, until: (x: S) => boolean, answer: Answer = () => undefined): S => {
    let cur = s;
    for (let i = 0; i < 600 && !until(cur); i++) {
      const p = cur.pending;
      if (p?.kind === "priority") cur = act(cur, p.player, { type: "pass" });
      else if (p?.kind === "choice")
        cur = act(cur, p.player, { type: "choose", values: answer(p.request, cur) ?? p.request.suggested });
      else if (p?.kind === "declareAttackers") cur = act(cur, p.player, { type: "declareAttackers", attackers: [] });
      else if (p?.kind === "declareBlockers") cur = act(cur, p.player, { type: "declareBlockers", blocks: [] });
      else if (p?.kind === "discard") {
        const hand = cur.players[p.player]?.hand ?? [];
        cur = act(cur, p.player, { type: "discard", cards: hand.slice(0, Math.max(0, hand.length - 7)) });
      } else break;
    }
    return cur;
  };
  /** Résout tout : pile vide, aucun déclenchement en attente (au moins une passe). */
  const settle = (s: S, answer: Answer = () => undefined): S => {
    let first = true;
    return drive(
      s,
      (x) => {
        const done = !first && x.pending?.kind === "priority" && x.stack.length === 0 && x.triggers.length === 0;
        first = false;
        return done;
      },
      answer,
    );
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
  const canCast = (s: S, player: string, card: string) =>
    legalActions(s, player).some((x) => x.type === "cast" && x.card === card);
  /** Va à la déclaration des attaquants de p1 et attaque p2 avec `attackers`. */
  const attack = (s: S, attackers: string[]) => {
    const cur = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    return act(cur, "p1", { type: "declareAttackers", attackers: attackers.map((id) => ({ id, defender: "p2" })) });
  };
  /** Attaque, puis va jusqu'à la priorité de p1 à l'étape de déclaration des bloqueurs (sans bloqueur). */
  const unblocked = (s: S, attackers: string[], answer: Answer = () => undefined) =>
    drive(
      attack(s, attackers),
      (x) => x.turn.step === "declareBlockers" && x.pending?.kind === "priority" && x.pending.player === "p1",
      answer,
    );
  /** Sélectionne dans les options d'un choix les objets nommés `name` (au plus `n`). */
  const pickNamed = (s: S, req: ChoiceRequest, name: string, n = 1) =>
    req.type === "pick" ? req.options.filter((id) => nameOf(s, String(id)) === name).slice(0, n) : undefined;

  describe("Teenage Mutant Ninja Turtles, lot A — blanc", () => {
    it("Action News Crew : canalisation {6} depuis la main, un marqueur +1/+1 sur chacune de vos créatures, piochez", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Plains", 6), "Bear Cub", "Llanowar Elves"], hand: ["Action News Crew"], library: ["Opt"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const crew = idOf(s, "p1", "hand", "Action News Crew");
      s = settle(activate(s, "p1", crew, "Canalisation"));
      expect(idsOf(s, "p1", "graveyard", "Action News Crew")).toHaveLength(1);
      expect(counters(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toBe(1);
      expect(counters(s, idOf(s, "p1", "battlefield", "Llanowar Elves"))).toBe(1);
      expect(counters(s, idOf(s, "p2", "battlefield", "Serra Angel"))).toBe(0);
      expect(namesIn(s, s.players.p1?.hand)).toEqual(["Opt"]);
    });

    it("Agent Bishop : au début de votre combat, un marqueur +1/+1 sur chacune de jusqu'à deux créatures ciblées", () => {
      let s = scenario({ p1: { battlefield: ["Agent Bishop, Man in Black", "Bear Cub", "Llanowar Elves", "Serra Angel"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const elves = idOf(s, "p1", "battlefield", "Llanowar Elves");
      const angel = idOf(s, "p1", "battlefield", "Serra Angel");
      let max = 0;
      s = drive(
        s,
        (x) => x.turn.step === "beginCombat" && x.stack.length === 0 && x.triggers.length === 0 && counters(x, bear) > 0,
        (req) => {
          if (req.type !== "pick" || !req.options.includes(bear)) return undefined;
          max = req.max ?? 0;
          return [bear, elves];
        },
      );
      expect(max).toBe(2);
      expect([counters(s, bear), counters(s, elves), counters(s, angel)]).toEqual([1, 1, 0]);
    });

    describe("April O'Neil, Kunoichi Trainee", () => {
      it("en arrivant, regard 2", () => {
        let s = scenario({
          p1: { battlefield: lands("Plains", 2), hand: ["April O'Neil, Kunoichi Trainee"], library: ["Opt", "Island", "Swamp"] },
        });
        let seen: (string | undefined)[] = [];
        s = settle(cast(s, "p1", "April O'Neil, Kunoichi Trainee"), (req, cur) => {
          if (req.intent !== "scryBottom" || req.type !== "pick") return undefined;
          seen = namesIn(cur, req.options as string[]);
          return pickNamed(cur, req, "Opt");
        });
        expect(seen).toEqual(["Opt", "Island"]);
        expect(namesIn(s, s.players.p1?.library)).toEqual(["Island", "Swamp", "Opt"]);
      });

      it("ne peut pas être bloquée par les créatures de force 3 ou plus", () => {
        let s = scenario({
          p1: { battlefield: ["April O'Neil, Kunoichi Trainee"] },
          p2: { battlefield: ["Serra Angel", "Bear Cub"] },
        });
        const april = idOf(s, "p1", "battlefield", "April O'Neil, Kunoichi Trainee");
        s = advanceUntil(attack(s, [april]), (x) => x.pending?.kind === "declareBlockers");
        const angel = idOf(s, "p2", "battlefield", "Serra Angel");
        const bear = idOf(s, "p2", "battlefield", "Bear Cub");
        expect(() => act(s, "p2", { type: "declareBlockers", blocks: [{ blocker: angel, attacker: april }] })).toThrow();
        s = act(s, "p2", { type: "declareBlockers", blocks: [{ blocker: bear, attacker: april }] });
        expect(s.combat?.attackers.find((a) => a.id === april)?.blocked).toBe(true);
      });
    });

    it("Dimensional Exile : enchante un terrain de base à vous ; exile une créature adverse jusqu'à son départ", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Plains", 2), "Mountain"], hand: ["Dimensional Exile"] },
        p2: { battlefield: ["Serra Angel", "Plains"] },
      });
      const plains = idOf(s, "p1", "battlefield", "Plains");
      const foreign = idOf(s, "p2", "battlefield", "Plains");
      // Un terrain de base adverse n'est pas un hôte valide.
      expect(() => cast(s, "p1", "Dimensional Exile", { targets: { enchant: [foreign] } })).toThrow();
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(cast(s, "p1", "Dimensional Exile", { targets: { enchant: [plains] } }), (req) =>
        req.type === "pick" && req.options.includes(angel) ? [angel] : undefined,
      );
      const aura = idOf(s, "p1", "battlefield", "Dimensional Exile");
      expect(s.objects[aura]?.attachedTo).toBe(plains);
      expect(idsOf(s, "p2", "battlefield", "Serra Angel")).toHaveLength(0);
      expect(s.exile.map((id) => nameOf(s, id))).toContain("Serra Angel");
      destroy(s, aura);
      s = settle(s);
      expect(idsOf(s, "p2", "battlefield", "Serra Angel")).toHaveLength(1);
    });

    it("East Wind Avatar : Alliance, +1/+0 jusqu'à la fin du tour pour chaque autre créature qui arrive", () => {
      let s = scenario({
        p1: { battlefield: ["East Wind Avatar", ...lands("Forest", 3)], hand: ["Llanowar Elves", "Bear Cub"] },
      });
      const avatar = idOf(s, "p1", "battlefield", "East Wind Avatar");
      expect(chars(s, avatar).keywords).toEqual(expect.arrayContaining(["flying", "vigilance"]));
      s = settle(cast(s, "p1", "Llanowar Elves"));
      s = settle(cast(s, "p1", "Bear Cub"));
      expect(pt(s, avatar)).toEqual([4, 4]);
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(pt(s, avatar)).toEqual([2, 4]);
    });

    it("Featherbrained Filcher : quand il quitte le champ de bataille (même renvoyé en main), une Nourriture", () => {
      let s = scenario({ p1: { battlefield: ["Featherbrained Filcher", "Prehistoric Pet", "Plains", "Plains"] } });
      const pet = idOf(s, "p1", "battlefield", "Prehistoric Pet");
      const filcher = idOf(s, "p1", "battlefield", "Featherbrained Filcher");
      s = settle(activate(s, "p1", pet, undefined, { targets: { t: [filcher] } }));
      expect(idsOf(s, "p1", "hand", "Featherbrained Filcher")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Food")).toHaveLength(1);
    });

    it("Grounded for Life : coûte {3} de moins s'il cible une créature engagée", () => {
      let s = scenario({
        p1: { battlefield: lands("Plains", 2), hand: ["Grounded for Life"] },
        p2: { battlefield: [{ name: "Serra Angel", tapped: true }, "Shivan Dragon"] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      const dragon = idOf(s, "p2", "battlefield", "Shivan Dragon");
      // Deux terrains : pas assez pour une créature dégagée ({4}{W}).
      expect(() => cast(s, "p1", "Grounded for Life", { targets: { t: [dragon] } })).toThrow();
      s = settle(cast(s, "p1", "Grounded for Life", { targets: { t: [angel] } }));
      expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
      expect(idsOf(s, "p2", "battlefield", "Shivan Dragon")).toHaveLength(1);
    });

    it("Hamato Guardian Stance : +1/+3 et le vol jusqu'à la fin du tour, puis regard 1", () => {
      let s = scenario({
        p1: { battlefield: ["Plains", "Bear Cub"], hand: ["Hamato Guardian Stance"], library: ["Opt", "Island"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      let scried = false;
      s = settle(cast(s, "p1", "Hamato Guardian Stance", { targets: { t: [bear] } }), (req, cur) => {
        if (req.intent !== "scryBottom") return undefined;
        scried = true;
        return pickNamed(cur, req, "Opt");
      });
      expect(scried).toBe(true);
      expect(pt(s, bear)).toEqual([3, 5]);
      expect(chars(s, bear).keywords).toContain("flying");
      expect(namesIn(s, s.players.p1?.library)).toEqual(["Island", "Opt"]);
    });

    it("High-Flying Ace : {3}{W}, une créature sans le vol gagne le vol ; en rituel seulement", () => {
      let s = scenario({ p1: { battlefield: ["High-Flying Ace", "Bear Cub", "Serra Angel", ...lands("Plains", 4)] } });
      const ace = idOf(s, "p1", "battlefield", "High-Flying Ace");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const angel = idOf(s, "p1", "battlefield", "Serra Angel");
      expect(() => activate(s, "p1", ace, undefined, { targets: { t: [angel] } })).toThrow();
      const combat = advanceUntil(s, (x) => x.turn.step === "beginCombat" && x.pending?.kind === "priority");
      expect(canActivate(combat, "p1", ace)).toBe(false);
      s = settle(activate(s, "p1", ace, undefined, { targets: { t: [bear] } }));
      expect(chars(s, bear).keywords).toContain("flying");
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(chars(s, bear).keywords).not.toContain("flying");
    });

    describe("Jennika, Bad Apple Big Sister", () => {
      it("en arrivant, un jeton Mutant 2/2 rouge", () => {
        let s = scenario({ p1: { battlefield: lands("Plains", 5), hand: ["Jennika, Bad Apple Big Sister"] } });
        s = settle(cast(s, "p1", "Jennika, Bad Apple Big Sister"));
        const [mutant] = idsOf(s, "p1", "battlefield", "Mutant");
        expect(mutant).toBeDefined();
        expect(pt(s, mutant as string)).toEqual([2, 2]);
        expect(chars(s, mutant as string).colors).toEqual(["R"]);
      });

      it("cycle de Plaine {2} : une carte de Plaine de la bibliothèque dans la main", () => {
        let s = scenario({
          p1: {
            battlefield: lands("Mountain", 2),
            hand: ["Jennika, Bad Apple Big Sister"],
            library: ["Island", "Plains", "Opt"],
          },
        });
        const jennika = idOf(s, "p1", "hand", "Jennika, Bad Apple Big Sister");
        s = settle(activate(s, "p1", jennika), (req, cur) => pickNamed(cur, req, "Plains"));
        expect(namesIn(s, s.players.p1?.hand)).toEqual(["Plains"]);
        expect(idsOf(s, "p1", "graveyard", "Jennika, Bad Apple Big Sister")).toHaveLength(1);
      });
    });

    describe("Koya, Death from Above", () => {
      const setup = () =>
        scenario({
          p1: { battlefield: [...lands("Plains", 3), ...lands("Swamp", 4)], hand: ["Koya, Death from Above"] },
          p2: { battlefield: ["Serra Angel"] },
        });
      const cut = (s: S, pay: boolean) => {
        const angel = idOf(s, "p2", "battlefield", "Serra Angel");
        let asked = false;
        let t = settle(cast(s, "p1", "Koya, Death from Above"), (req) =>
          req.type === "pick" && req.options.includes(angel) ? [angel] : undefined,
        );
        expect(idsOf(t, "p2", "battlefield", "Serra Angel")).toHaveLength(0);
        t = drive(
          t,
          (x) => x.turn.active === "p2",
          (req) => {
            if (req.type !== "yesNo" || !req.prompt.includes("{3}{B}")) return undefined;
            asked = true;
            return [pay ? 1 : 0];
          },
        );
        expect(asked).toBe(true);
        return t;
      };

      it("exile une autre créature ; sans payer {3}{B} à l'étape de fin, elle revient sous le contrôle de son propriétaire", () => {
        const s = cut(setup(), false);
        expect(idsOf(s, "p2", "battlefield", "Serra Angel")).toHaveLength(1);
      });

      it("en payant {3}{B}, elle reste en exil", () => {
        const s = cut(setup(), true);
        expect(idsOf(s, "p2", "battlefield", "Serra Angel")).toHaveLength(0);
        expect(s.exile.map((id) => nameOf(s, id))).toContain("Serra Angel");
      });
    });

    describe("Leader's Talent", () => {
      it("niveau 1 : quand vous attaquez, un marqueur +1/+1 sur une créature attaquante", () => {
        let s = scenario({ p1: { battlefield: ["Leader's Talent", "Bear Cub", "Llanowar Elves", "Serra Angel"] } });
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        const elves = idOf(s, "p1", "battlefield", "Llanowar Elves");
        const angel = idOf(s, "p1", "battlefield", "Serra Angel");
        let options: string[] = [];
        s = settle(attack(s, [bear, elves]), (req) => {
          if (req.type !== "pick") return undefined;
          options = req.options as string[];
          return [bear];
        });
        // Seules les créatures attaquantes sont des cibles.
        expect(options).toEqual(expect.arrayContaining([bear, elves]));
        expect(options).not.toContain(angel);
        expect([counters(s, bear), counters(s, elves)]).toEqual([1, 0]);
      });

      it("niveau 2 : une de vos créatures qui avait un marqueur quitte le champ de bataille, gagnez 2 PV", () => {
        let s = scenario({
          p1: {
            battlefield: [
              "Leader's Talent",
              ...lands("Plains", 3),
              { name: "Bear Cub", counters: { "+1/+1": 1 } },
              "Llanowar Elves",
            ],
          },
        });
        const talent = idOf(s, "p1", "battlefield", "Leader's Talent");
        s = settle(activate(s, "p1", talent));
        expect(s.objects[talent]?.classLevel).toBe(2);
        destroy(s, idOf(s, "p1", "battlefield", "Llanowar Elves"));
        s = settle(s);
        expect(s.players.p1?.life).toBe(20);
        destroy(s, idOf(s, "p1", "battlefield", "Bear Cub"));
        s = settle(s);
        expect(s.players.p1?.life).toBe(22);
      });

      it("niveau 3 : chaque fois que vous lancez un sort, un marqueur +1/+1 sur chacune de vos créatures", () => {
        let s = scenario({
          p1: { battlefield: ["Leader's Talent", ...lands("Plains", 7), "Bear Cub", "Island"], hand: ["Opt"] },
        });
        const talent = idOf(s, "p1", "battlefield", "Leader's Talent");
        s = settle(activate(s, "p1", talent));
        s = settle(activate(s, "p1", talent));
        expect(s.objects[talent]?.classLevel).toBe(3);
        s = settle(cast(s, "p1", "Opt"));
        expect(counters(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toBe(1);
      });
    });

    it("Leonardo, Big Brother : +1/+0 pour chaque autre créature que vous contrôlez", () => {
      const s = scenario({
        p1: { battlefield: ["Leonardo, Big Brother", "Bear Cub", "Llanowar Elves"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      expect(pt(s, idOf(s, "p1", "battlefield", "Leonardo, Big Brother"))).toEqual([3, 3]);
    });

    it("Leonardo, Cutting Edge : lien de vie ; chaque fois que vous gagnez des PV, un marqueur +1/+1", () => {
      let s = scenario({ p1: { battlefield: ["Leonardo, Cutting Edge"] } });
      const leo = idOf(s, "p1", "battlefield", "Leonardo, Cutting Edge");
      expect(chars(s, leo).keywords).toContain("lifelink");
      s = settle(attack(s, [leo]));
      s = drive(s, (x) => x.turn.step === "main2" && x.triggers.length === 0 && x.stack.length === 0);
      expect(s.players.p1?.life).toBe(21);
      expect(counters(s, leo)).toBe(1);
    });

    describe("Leonardo, Leader in Blue", () => {
      // Le faufilement n'est pas encore lançable : `canCastTiming` (stack.ts) ignore la fenêtre de faufilement (un sort de
      // créature ou de rituel est refusé à l'étape de déclaration des bloqueurs), et rien ne fait arriver le permanent
      // engagé et attaquant. À réactiver quand le moteur le fera.
      it.skip("faufilé : il arrive engagé et attaquant, et vos créatures gagnent +2/+0", () => {
        let s = scenario({
          p1: { battlefield: ["Bear Cub", "Llanowar Elves", ...lands("Plains", 5)], hand: ["Leonardo, Leader in Blue"] },
        });
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        s = unblocked(s, [bear, idOf(s, "p1", "battlefield", "Llanowar Elves")]);
        s = settle(cast(s, "p1", "Leonardo, Leader in Blue", { alternative: true }));
        // L'attaquant non bloqué le plus faible (les Elfes) est retourné en main.
        expect(idsOf(s, "p1", "hand", "Llanowar Elves")).toHaveLength(1);
        const leo = idOf(s, "p1", "battlefield", "Leonardo, Leader in Blue");
        expect(s.objects[leo]?.tapped).toBe(true);
        expect(s.combat?.attackers.some((a) => a.id === leo)).toBe(true);
        expect(pt(s, bear)).toEqual([4, 2]);
        expect(pt(s, leo)).toEqual([4, 1]);
        s = drive(s, (x) => x.turn.step === "main2");
        expect(s.players.p2?.life).toBe(12);
      });

      it("lancé normalement : pas de bonus ; {1}{W} : initiative jusqu'à la fin du tour", () => {
        let s = scenario({ p1: { battlefield: ["Bear Cub", ...lands("Plains", 3)], hand: ["Leonardo, Leader in Blue"] } });
        s = settle(cast(s, "p1", "Leonardo, Leader in Blue"));
        const leo = idOf(s, "p1", "battlefield", "Leonardo, Leader in Blue");
        expect(pt(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toEqual([2, 2]);
        expect(s.objects[leo]?.tapped).toBe(false);
        s = settle(activate(s, "p1", leo));
        expect(chars(s, leo).keywords).toContain("firstStrike");
      });
    });

    describe("Leonardo, Sewer Samurai", () => {
      it("pendant votre tour, les sorts de créature de force ou d'endurance 1 ou moins se lancent depuis le cimetière, avec un marqueur de finalité", () => {
        let s = scenario({
          p1: {
            battlefield: ["Leonardo, Sewer Samurai", ...lands("Forest", 3)],
            graveyard: ["Llanowar Elves", "Bear Cub"],
          },
        });
        expect(chars(s, idOf(s, "p1", "battlefield", "Leonardo, Sewer Samurai")).keywords).toContain("doubleStrike");
        const elves = idOf(s, "p1", "graveyard", "Llanowar Elves");
        const bear = idOf(s, "p1", "graveyard", "Bear Cub");
        expect(canCast(s, "p1", bear)).toBe(false);
        expect(canCast(s, "p1", elves)).toBe(true);
        s = settle(act(s, "p1", { type: "cast", card: elves }));
        const back = idOf(s, "p1", "battlefield", "Llanowar Elves");
        expect(s.objects[back]?.counters.finality).toBe(1);
        // Avec un marqueur de finalité, elle est exilée au lieu de mourir.
        destroy(s, back);
        expect(s.exile.map((id) => nameOf(s, id))).toContain("Llanowar Elves");
      });

      it("pas pendant le tour d'un adversaire", () => {
        const s = scenario({
          active: "p2",
          p1: { battlefield: ["Leonardo, Sewer Samurai", ...lands("Forest", 3)], graveyard: ["Llanowar Elves"] },
        });
        const p1 = advanceUntil(s, (x) => x.pending?.kind === "priority" && x.pending.player === "p1");
        expect(canCast(p1, "p1", idOf(p1, "p1", "graveyard", "Llanowar Elves"))).toBe(false);
      });
    });

    it("Leonardo's Technique : une ou deux cartes de créature de VM 3 ou moins de votre cimetière reviennent", () => {
      let s = scenario({
        p1: {
          battlefield: lands("Plains", 4),
          hand: ["Leonardo's Technique"],
          graveyard: ["Bear Cub", "Llanowar Elves", "Serra Angel"],
        },
      });
      const bear = idOf(s, "p1", "graveyard", "Bear Cub");
      const elves = idOf(s, "p1", "graveyard", "Llanowar Elves");
      const angel = idOf(s, "p1", "graveyard", "Serra Angel");
      expect(() => cast(s, "p1", "Leonardo's Technique", { targets: { t: [angel] } })).toThrow();
      s = settle(cast(s, "p1", "Leonardo's Technique", { targets: { t: [bear, elves] } }));
      expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Llanowar Elves")).toHaveLength(1);
      expect(idsOf(s, "p1", "graveyard", "Serra Angel")).toHaveLength(1);
    });

    it("Lita : Alliance, un mode qui n'a pas encore été choisi ce tour-ci", () => {
      let s = scenario({
        p1: {
          battlefield: ["Lita, Little Orphan Amphibian", ...lands("Forest", 4)],
          hand: ["Llanowar Elves", "Llanowar Elves", "Llanowar Elves", "Llanowar Elves"],
          library: lands("Island", 5),
        },
      });
      const lita = idOf(s, "p1", "battlefield", "Lita, Little Orphan Amphibian");
      const offered: number[] = [];
      let scries = 0;
      const chooseFirst: Answer = (req) => {
        if (req.intent === "scryBottom") scries++;
        if (req.intent !== "triggerMode" || req.type !== "pick") return undefined;
        offered.push(req.options.length);
        return [req.options[0] as ChoiceValue];
      };
      for (let i = 0; i < 4; i++) s = settle(cast(s, "p1", "Llanowar Elves"), chooseFirst);
      // Trois modes proposés, puis deux ; le dernier (regard 1) est pris d'office ; le quatrième déclenchement n'a plus de mode.
      expect(offered).toEqual([3, 2]);
      expect(scries).toBe(1);
      expect(counters(s, lita)).toBe(1);
      expect(idsOf(s, "p1", "battlefield", "Food")).toHaveLength(1);
    });

    it("Mighty Mutanimals : un Mutant en arrivant, qui déclenche l'Alliance (un marqueur +1/+1 sur une de vos créatures)", () => {
      let s = scenario({ p1: { battlefield: lands("Plains", 4), hand: ["Mighty Mutanimals"] } });
      let mutant = "";
      s = settle(cast(s, "p1", "Mighty Mutanimals"), (req, cur) => {
        if (req.type !== "pick") return undefined;
        mutant = (pickNamed(cur, req, "Mutant")?.[0] as string) ?? "";
        return mutant ? [mutant] : undefined;
      });
      expect(mutant).not.toBe("");
      expect(pt(s, mutant)).toEqual([3, 3]);
    });

    describe("Prehistoric Pet", () => {
      it("ne peut pas être bloquée par des créatures de force supérieure", () => {
        let s = scenario({ p1: { battlefield: ["Prehistoric Pet"] }, p2: { battlefield: ["Bear Cub", "Llanowar Elves"] } });
        const pet = idOf(s, "p1", "battlefield", "Prehistoric Pet");
        s = advanceUntil(attack(s, [pet]), (x) => x.pending?.kind === "declareBlockers");
        const bear = idOf(s, "p2", "battlefield", "Bear Cub");
        const elves = idOf(s, "p2", "battlefield", "Llanowar Elves");
        expect(() => act(s, "p2", { type: "declareBlockers", blocks: [{ blocker: bear, attacker: pet }] })).toThrow();
        s = act(s, "p2", { type: "declareBlockers", blocks: [{ blocker: elves, attacker: pet }] });
        expect(s.combat?.attackers.find((a) => a.id === pet)?.blocked).toBe(true);
      });

      it("{1}{W}, {T} : renvoie une autre de vos créatures en main, pendant votre tour seulement", () => {
        let s = scenario({ p1: { battlefield: ["Prehistoric Pet", "Bear Cub", ...lands("Plains", 2)] } });
        const pet = idOf(s, "p1", "battlefield", "Prehistoric Pet");
        expect(() => activate(s, "p1", pet, undefined, { targets: { t: [pet] } })).toThrow();
        s = settle(activate(s, "p1", pet, undefined, { targets: { t: [idOf(s, "p1", "battlefield", "Bear Cub")] } }));
        expect(idsOf(s, "p1", "hand", "Bear Cub")).toHaveLength(1);
        const opp = scenario({ active: "p2", p1: { battlefield: ["Prehistoric Pet", "Bear Cub", ...lands("Plains", 2)] } });
        const p1 = advanceUntil(opp, (x) => x.pending?.kind === "priority" && x.pending.player === "p1");
        expect(canActivate(p1, "p1", idOf(p1, "p1", "battlefield", "Prehistoric Pet"))).toBe(false);
      });
    });

    describe("Quintessential Katana", () => {
      it("un Ninja arrive : vous pouvez lui attacher l'Équipement", () => {
        let s = scenario({
          p1: { battlefield: ["Quintessential Katana", ...lands("Plains", 2)], hand: ["April O'Neil, Kunoichi Trainee"] },
        });
        let asked = false;
        s = settle(cast(s, "p1", "April O'Neil, Kunoichi Trainee"), (req) => {
          if (req.intent !== "may") return undefined;
          asked = true;
          return [1];
        });
        expect(asked).toBe(true);
        const april = idOf(s, "p1", "battlefield", "April O'Neil, Kunoichi Trainee");
        expect(s.objects[idOf(s, "p1", "battlefield", "Quintessential Katana")]?.attachedTo).toBe(april);
        expect(pt(s, april)).toEqual([3, 3]);
      });

      it("la créature équipée qui inflige des blessures de combat se dégage, et vous gagnez 2 PV", () => {
        let s = scenario({ p1: { battlefield: ["Quintessential Katana", "Bear Cub", ...lands("Plains", 2)] } });
        const katana = idOf(s, "p1", "battlefield", "Quintessential Katana");
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        s = settle(activate(s, "p1", katana, undefined, { targets: { t: [bear] } }));
        expect(s.objects[katana]?.attachedTo).toBe(bear);
        s = settle(attack(s, [bear]));
        expect(s.objects[bear]?.tapped).toBe(true);
        s = drive(s, (x) => x.turn.step === "main2" && x.triggers.length === 0 && x.stack.length === 0);
        expect(s.players.p2?.life).toBe(17);
        expect(s.players.p1?.life).toBe(22);
        expect(s.objects[bear]?.tapped).toBe(false);
      });
    });

    describe("Sally Pride, Lioness Leader", () => {
      it("crée X Mutants, X étant le nombre de créatures non-jetons que vous contrôlez", () => {
        let s = scenario({
          p1: { battlefield: [...lands("Plains", 5), "Bear Cub", "Llanowar Elves"], hand: ["Sally Pride, Lioness Leader"] },
        });
        s = settle(cast(s, "p1", "Sally Pride, Lioness Leader"));
        // Sally Pride, Bear Cub et Llanowar Elves.
        expect(idsOf(s, "p1", "battlefield", "Mutant")).toHaveLength(3);
      });

      it("quand elle attaque, un marqueur +1/+1 sur chacune de vos créatures", () => {
        let s = scenario({
          p1: { battlefield: ["Sally Pride, Lioness Leader", "Bear Cub"] },
          p2: { battlefield: ["Serra Angel"] },
        });
        const sally = idOf(s, "p1", "battlefield", "Sally Pride, Lioness Leader");
        s = settle(attack(s, [sally]));
        expect(counters(s, sally)).toBe(1);
        expect(counters(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toBe(1);
        expect(counters(s, idOf(s, "p2", "battlefield", "Serra Angel"))).toBe(0);
      });
    });

    it("Triceraton Commander : X Dinosaures Soldats ; quand il attaque, vos autres Dinosaures gagnent +1/+1 et le vol", () => {
      let s = scenario({ p1: { battlefield: [...lands("Plains", 6), "Bear Cub"], hand: ["Triceraton Commander"] } });
      s = settle(cast(s, "p1", "Triceraton Commander", { x: 2 }));
      const commander = idOf(s, "p1", "battlefield", "Triceraton Commander");
      const dinos = idsOf(s, "p1", "battlefield", "Dinosaur Soldier");
      expect(dinos).toHaveLength(2);
      expect(chars(s, dinos[0] as string).colors).toEqual(["W"]);
      expect(pt(s, dinos[0] as string)).toEqual([2, 2]);
      // Au tour suivant de p1, le Commandant attaque.
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1");
      s = settle(attack(s, [commander]));
      for (const d of dinos) {
        expect(pt(s, d)).toEqual([3, 3]);
        expect(chars(s, d).keywords).toContain("flying");
      }
      expect(pt(s, commander)).toEqual([2, 2]);
      expect(pt(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toEqual([2, 2]);
    });

    describe("Turncoat Kunoichi", () => {
      it("lancé normalement : la créature adverse est exilée jusqu'à son départ", () => {
        let s = scenario({
          p1: { battlefield: lands("Plains", 3), hand: ["Turncoat Kunoichi"] },
          p2: { battlefield: ["Serra Angel"] },
        });
        const angel = idOf(s, "p2", "battlefield", "Serra Angel");
        s = settle(cast(s, "p1", "Turncoat Kunoichi"), (req) =>
          req.type === "pick" && req.options.includes(angel) ? [angel] : undefined,
        );
        expect(idsOf(s, "p2", "battlefield", "Serra Angel")).toHaveLength(0);
        destroy(s, idOf(s, "p1", "battlefield", "Turncoat Kunoichi"));
        s = settle(s);
        expect(idsOf(s, "p2", "battlefield", "Serra Angel")).toHaveLength(1);
      });

      // Le faufilement n'est pas encore lançable : `canCastTiming` (stack.ts) ignore la fenêtre de faufilement (un sort de
      // créature ou de rituel est refusé à l'étape de déclaration des bloqueurs), et rien ne fait arriver le permanent
      // engagé et attaquant. À réactiver quand le moteur le fera.
      it.skip("faufilé : la créature est exilée pour de bon", () => {
        let s = scenario({
          p1: { battlefield: ["Bear Cub", ...lands("Plains", 2), ...lands("Swamp", 2)], hand: ["Turncoat Kunoichi"] },
          p2: { battlefield: ["Serra Angel"] },
        });
        const angel = idOf(s, "p2", "battlefield", "Serra Angel");
        s = unblocked(s, [idOf(s, "p1", "battlefield", "Bear Cub")]);
        s = settle(cast(s, "p1", "Turncoat Kunoichi", { alternative: true }), (req) =>
          req.type === "pick" && req.options.includes(angel) ? [angel] : undefined,
        );
        expect(idsOf(s, "p2", "battlefield", "Serra Angel")).toHaveLength(0);
        destroy(s, idOf(s, "p1", "battlefield", "Turncoat Kunoichi"));
        s = settle(s);
        expect(idsOf(s, "p2", "battlefield", "Serra Angel")).toHaveLength(0);
        expect(s.exile.map((id) => nameOf(s, id))).toContain("Serra Angel");
      });
    });

    it("Turtles Forever : quatre créatures légendaires de noms différents, un adversaire en choisit deux pour votre main", () => {
      let s = scenario({
        p1: {
          battlefield: lands("Plains", 4),
          hand: ["Turtles Forever"],
          library: [
            "Leonardo, Big Brother",
            "Leonardo, Big Brother",
            "Leonardo, Cutting Edge",
            "Koya, Death from Above",
            "Sally Pride, Lioness Leader",
            "Bear Cub",
          ],
        },
      });
      let chooser = "";
      s = settle(cast(s, "p1", "Turtles Forever"), (req, cur) => {
        if (req.type !== "pick") return undefined;
        if (req.intent === "search") {
          const names = new Set<string>();
          return req.options.filter((id) => {
            const n = nameOf(cur, String(id)) ?? "";
            if (names.has(n)) return false;
            names.add(n);
            return true;
          });
        }
        if (cur.pending?.kind === "choice") chooser = cur.pending.player;
        const koya = pickNamed(cur, req, "Koya, Death from Above") ?? [];
        return koya.length ? koya : pickNamed(cur, req, "Sally Pride, Lioness Leader");
      });
      expect(chooser).toBe("p2");
      expect(s.players.p1?.hand).toHaveLength(2);
      expect(namesIn(s, s.players.p1?.hand)).toContain("Koya, Death from Above");
      expect(s.players.p1?.library).toHaveLength(4);
    });

    it("Uneasy Alliance : la créature enchantée ne peut ni attaquer ni bloquer ; {5}, sacrifice : exilée, et un Ninja 1/1 pour vous", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Plains", 7)], hand: ["Uneasy Alliance"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(cast(s, "p1", "Uneasy Alliance", { targets: { enchant: [angel] } }));
      expect(chars(s, angel).keywords).toEqual(expect.arrayContaining(["cantAttack", "cantBlock"]));
      const aura = idOf(s, "p1", "battlefield", "Uneasy Alliance");
      const combat = advanceUntil(s, (x) => x.turn.step === "beginCombat" && x.pending?.kind === "priority");
      expect(canActivate(combat, "p1", aura)).toBe(false);
      s = settle(activate(s, "p1", aura));
      expect(idsOf(s, "p2", "battlefield", "Serra Angel")).toHaveLength(0);
      expect(s.exile.map((id) => nameOf(s, id))).toContain("Serra Angel");
      const [ninja] = idsOf(s, "p1", "battlefield", "Ninja");
      expect(ninja).toBeDefined();
      expect(chars(s, ninja as string).colors).toEqual(["B"]);
      expect(idsOf(s, "p1", "graveyard", "Uneasy Alliance")).toHaveLength(1);
    });
  });
});
