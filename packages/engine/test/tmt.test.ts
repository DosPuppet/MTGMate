/**
 * Teenage Mutant Ninja Turtles (extension partielle : cartes des decks du méta) : chaque carte gérée est confrontée à
 * son texte Oracle (plan R, lot R7). Faufilement, jetons Mutagène, Classe à trois niveaux, Équipement…
 */

import { card } from "@mtgx/cards";
import { describe, expect, it } from "vitest";
import { destroy } from "../src/actions";
import { legalActions } from "../src/legal";
import { chars } from "../src/state";
import type { ActionOption, ChoiceRequest, ChoiceValue, GameState, ManaType, PlayerId } from "../src/types";
import {
  type Answer,
  act,
  advanceUntil,
  attack,
  canActivate,
  cast,
  castNowOf,
  counterFrom,
  customCard,
  idOf,
  idsOf,
  lands,
  nameOf,
  namesIn,
  passAccepting,
  pickNamed,
  scenario,
  settleNoBlocks as settle,
  throughCombat,
  untilCastNow,
} from "./helpers";

type S = GameState;
/** Active la capacité de `source` dont le libellé contient `label` (la première sinon). */
const activate = (s: S, player: string, source: string, label?: string, extra: object = {}) => {
  const a = legalActions(s, player).find(
    (x) => x.type === "activate" && x.source === source && (!label || x.label?.includes(label)),
  );
  if (a?.type !== "activate") throw new Error(`capacité introuvable : ${label ?? source}`);
  return act(s, player, { type: "activate", source, ability: a.ability, ...extra });
};
describe("Teenage Mutant Ninja Turtles", () => {
  describe("Escape Tunnel", () => {
    it("{T}, sacrifice : un terrain de base de la bibliothèque arrive engagé", () => {
      let s = scenario({ p1: { battlefield: ["Escape Tunnel"], library: ["Opt", "Island", "Opt"] } });
      const tunnel = idOf(s, "p1", "battlefield", "Escape Tunnel");
      s = settle(activate(s, "p1", tunnel, "terrain de base"), (req, _player, cur) => pickNamed(cur, req, "Island"));
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
    s = settle(cast(s, "p1", "Dream Beavers"), (req, _player, cur) => {
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
      s = settle(activate(s, "p1", cls), (req, _player, cur) => {
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
    s = settle(cast(s, "p1", "Michelangelo's Technique"), (req, _player, cur) => {
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
        cur = act(cur, p.player, { type: "choose", values: answer(p.request, p.player, cur) ?? p.request.suggested });
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
  /** Active la capacité de `source` dont le libellé contient `label` (la première sinon). */
  const activate = (s: S, player: string, source: string, label?: string, extra: object = {}) => {
    const a = legalActions(s, player).find(
      (x) => x.type === "activate" && x.source === source && (!label || x.label?.includes(label)),
    );
    if (a?.type !== "activate") throw new Error(`capacité introuvable : ${label ?? source}`);
    return act(s, player, { type: "activate", source, ability: a.ability, ...extra });
  };
  const canCast = (s: S, player: string, card: string) =>
    legalActions(s, player).some((x) => x.type === "cast" && x.card === card);
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
        s = settle(cast(s, "p1", "April O'Neil, Kunoichi Trainee"), (req, _player, cur) => {
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
      s = settle(cast(s, "p1", "Hamato Guardian Stance", { targets: { t: [bear] } }), (req, _player, cur) => {
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
        s = settle(activate(s, "p1", jennika), (req, _player, cur) => pickNamed(cur, req, "Plains"));
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
      it("faufilé : il arrive engagé et attaquant, et vos créatures gagnent +2/+0", () => {
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
      s = settle(cast(s, "p1", "Mighty Mutanimals"), (req, _player, cur) => {
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

      it("faufilé : la créature est exilée pour de bon", () => {
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
      s = settle(cast(s, "p1", "Turtles Forever"), (req, _player, cur) => {
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

describe("lot A, bleu", () => {
  type S = GameState;
  const pt = (s: S, id: string) => [chars(s, id).power, chars(s, id).toughness];

  /** Active la capacité de `source` dont le libellé contient `label` (la première sinon). */
  const activate = (s: S, player: string, source: string, label?: string, extra: object = {}) => {
    const a = legalActions(s, player).find(
      (x) => x.type === "activate" && x.source === source && (!label || x.label?.includes(label)),
    );
    if (a?.type !== "activate") throw new Error(`capacité introuvable : ${label ?? source}`);
    return act(s, player, { type: "activate", source, ability: a.ability, ...extra });
  };
  /** Choix : les options données si elles sont proposées. */
  const pickIds = (req: ChoiceRequest, ids: string[]) =>
    req.type === "pick" && ids.every((id) => req.options.includes(id)) ? ids : undefined;

  describe("Teenage Mutant Ninja Turtles, lot A — bleu", () => {
    it("April, Reporter of the Weird : blessures de combat à un joueur, piochez-en autant, puis défaussez une carte", () => {
      let s = scenario({ p1: { battlefield: ["April, Reporter of the Weird"], hand: ["Opt"], library: lands("Island", 5) } });
      const april = idOf(s, "p1", "battlefield", "April, Reporter of the Weird");
      const opt = idOf(s, "p1", "hand", "Opt");
      let discarded = false;
      s = throughCombat(attack(s, [april]), (req) => {
        if (req.type === "pick" && req.options.includes(opt)) {
          discarded = true;
          return [opt];
        }
        return undefined;
      });
      expect(discarded).toBe(true);
      expect(s.players.p2?.life).toBe(18);
      expect(namesIn(s, s.players.p1?.hand)).toEqual(["Island", "Island"]);
      expect(namesIn(s, s.players.p1?.graveyard)).toEqual(["Opt"]);
    });

    it("Bespoke Bō : renvoie jusqu'à un autre permanent non-terrain ; l'équipée a +2/+1 et la vigilance ; Équiper {3}", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Island", 6), "Bear Cub"], hand: ["Bespoke Bō"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(cast(s, "p1", "Bespoke Bō"), (req) => pickIds(req, [angel]));
      expect(namesIn(s, s.players.p2?.hand)).toEqual(["Serra Angel"]);
      const bo = idOf(s, "p1", "battlefield", "Bespoke Bō");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(activate(s, "p1", bo, undefined, { targets: { t: [bear] } }));
      expect(s.objects[bo]?.attachedTo).toBe(bear);
      expect(pt(s, bear)).toEqual([4, 3]);
      expect(chars(s, bear).keywords).toContain("vigilance");
    });

    it("Buzz Bots : vol et vigilance ; quand elle meurt, piochez une carte", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Mountain", 2), "Buzz Bots"], hand: ["Lightning Strike"], library: lands("Island", 3) },
      });
      const bots = idOf(s, "p1", "battlefield", "Buzz Bots");
      expect(chars(s, bots).keywords).toEqual(expect.arrayContaining(["flying", "vigilance"]));
      s = settle(cast(s, "p1", "Lightning Strike", { targets: { t: [bots] } }));
      expect(idsOf(s, "p1", "graveyard", "Buzz Bots")).toHaveLength(1);
      expect(namesIn(s, s.players.p1?.hand)).toEqual(["Island"]);
    });

    it("Crustacean Commando : crée un jeton Mutagène en arrivant", () => {
      let s = scenario({ p1: { battlefield: lands("Island", 2), hand: ["Crustacean Commando"] } });
      s = settle(cast(s, "p1", "Crustacean Commando"));
      expect(idsOf(s, "p1", "battlefield", "Mutagen")).toHaveLength(1);
      expect(pt(s, idOf(s, "p1", "battlefield", "Crustacean Commando"))).toEqual([0, 3]);
    });

    describe("Does Machines", () => {
      it("niveau 1 : en arrivant, meulez deux cartes, piochez-en deux, puis défaussez-en deux", () => {
        let s = scenario({
          p1: { battlefield: lands("Island", 2), hand: ["Does Machines"], library: ["Opt", "Opt", "Island", "Swamp", "Forest"] },
        });
        s = settle(cast(s, "p1", "Does Machines"));
        expect(s.players.p1?.hand).toHaveLength(0);
        expect(namesIn(s, s.players.p1?.graveyard).sort()).toEqual(["Island", "Opt", "Opt", "Swamp"]);
        expect(namesIn(s, s.players.p1?.library)).toEqual(["Forest"]);
      });

      it("niveau 2 : renvoie jusqu'à deux cartes d'artefact ciblées de votre cimetière en main", () => {
        let s = scenario({
          p1: { battlefield: ["Does Machines", ...lands("Island", 2)], graveyard: ["Buzz Bots", "Expedition Map", "Opt"] },
        });
        const cls = idOf(s, "p1", "battlefield", "Does Machines");
        const bots = idOf(s, "p1", "graveyard", "Buzz Bots");
        const map = idOf(s, "p1", "graveyard", "Expedition Map");
        let options: string[] = [];
        s = settle(activate(s, "p1", cls), (req) => {
          if (req.type === "pick" && req.options.includes(bots)) options = req.options;
          return pickIds(req, [bots, map]);
        });
        expect(s.objects[cls]?.classLevel).toBe(2);
        // Opt n'est pas un artefact : il n'est pas proposé.
        expect(options).not.toContain(idOf(s, "p1", "graveyard", "Opt"));
        expect(namesIn(s, s.players.p1?.hand).sort()).toEqual(["Buzz Bots", "Expedition Map"]);
      });

      it("niveau 3 : au début de votre combat, trois marqueurs +1/+1 ; un artefact non-créature devient un Robot 0/0", () => {
        let s = scenario({ p1: { battlefield: ["Does Machines", ...lands("Island", 7), "Expedition Map"] } });
        const cls = idOf(s, "p1", "battlefield", "Does Machines");
        s = settle(activate(s, "p1", cls));
        s = settle(activate(s, "p1", cls));
        expect(s.objects[cls]?.classLevel).toBe(3);
        const map = idOf(s, "p1", "battlefield", "Expedition Map");
        s = advanceUntil(s, (x) => x.turn.step === "beginCombat");
        s = settle(s, (req) => pickIds(req, [map]));
        expect(s.objects[map]?.counters["+1/+1"]).toBe(3);
        const c = chars(s, map);
        expect(c.types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
        expect(c.subtypes).toContain("Robot");
        expect(pt(s, map)).toEqual([3, 3]);
      });
    });

    it("Donatello, Gadget Master : blessures de combat à un joueur, un jeton copie d'un artefact que vous contrôlez", () => {
      let s = scenario({ p1: { battlefield: ["Donatello, Gadget Master", "Expedition Map"] } });
      const don = idOf(s, "p1", "battlefield", "Donatello, Gadget Master");
      const map = idOf(s, "p1", "battlefield", "Expedition Map");
      s = throughCombat(attack(s, [don]), (req) => pickIds(req, [map]));
      expect(s.players.p2?.life).toBe(17);
      const maps = idsOf(s, "p1", "battlefield", "Expedition Map");
      expect(maps).toHaveLength(2);
      expect(maps.filter((id) => s.objects[id]?.isToken)).toHaveLength(1);
    });

    describe("Donatello, Mutant Mechanic", () => {
      it("{T} : trois marqueurs +1/+1 sur un artefact ; s'il n'est pas une créature, il devient un Robot 0/0", () => {
        let s = scenario({ p1: { battlefield: ["Donatello, Mutant Mechanic", "Expedition Map", "Buzz Bots"] } });
        const don = idOf(s, "p1", "battlefield", "Donatello, Mutant Mechanic");
        const map = idOf(s, "p1", "battlefield", "Expedition Map");
        s = settle(activate(s, "p1", don, undefined, { targets: { t: [map] } }));
        expect(s.objects[don]?.tapped).toBe(true);
        expect(chars(s, map).types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
        expect(chars(s, map).subtypes).toContain("Robot");
        expect(pt(s, map)).toEqual([3, 3]);
        // Une créature-artefact garde ses F/E de base (1/1 plus trois marqueurs).
        let t = scenario({ p1: { battlefield: ["Donatello, Mutant Mechanic", "Buzz Bots"] } });
        const bots = idOf(t, "p1", "battlefield", "Buzz Bots");
        t = settle(
          activate(t, "p1", idOf(t, "p1", "battlefield", "Donatello, Mutant Mechanic"), undefined, { targets: { t: [bots] } }),
        );
        expect(pt(t, bots)).toEqual([4, 4]);
      });

      it("ne s'active qu'en rituel", () => {
        const s = scenario({ p1: { battlefield: ["Donatello, Mutant Mechanic", "Expedition Map"] }, step: "beginCombat" });
        const don = idOf(s, "p1", "battlefield", "Donatello, Mutant Mechanic");
        expect(legalActions(s, "p1").some((a) => a.type === "activate" && a.source === don)).toBe(false);
      });

      it("un de vos artefacts à marqueurs va au cimetière : ses marqueurs vont sur un de vos artefacts ou créatures", () => {
        let s = scenario({
          p1: {
            battlefield: [
              "Donatello, Mutant Mechanic",
              { name: "Buzz Bots", counters: { "+1/+1": 2 } },
              "Bear Cub",
              ...lands("Mountain", 2),
            ],
            hand: ["Lightning Strike"],
          },
        });
        const bots = idOf(s, "p1", "battlefield", "Buzz Bots");
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        s = settle(cast(s, "p1", "Lightning Strike", { targets: { t: [bots] } }), (req) => pickIds(req, [bear]));
        expect(idsOf(s, "p1", "graveyard", "Buzz Bots")).toHaveLength(1);
        expect(s.objects[bear]?.counters["+1/+1"]).toBe(2);
        expect(pt(s, bear)).toEqual([4, 4]);
      });

      it("un artefact sans marqueur ne déclenche rien", () => {
        let s = scenario({
          p1: {
            battlefield: ["Donatello, Mutant Mechanic", "Buzz Bots", "Bear Cub", ...lands("Mountain", 2)],
            hand: ["Lightning Strike"],
          },
        });
        const bots = idOf(s, "p1", "battlefield", "Buzz Bots");
        s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Lightning Strike"), targets: { t: [bots] } });
        s = settle(s);
        expect(s.objects[idOf(s, "p1", "battlefield", "Bear Cub")]?.counters["+1/+1"] ?? 0).toBe(0);
      });
    });

    it("Donatello, Turtle Techie : en arrivant, piochez une carte si vous contrôlez un artefact", () => {
      const run = (withArtifact: boolean) => {
        const battlefield = [...lands("Island", 4), ...(withArtifact ? ["Expedition Map"] : [])];
        const s = scenario({ p1: { battlefield, hand: ["Donatello, Turtle Techie"], library: lands("Island", 3) } });
        return settle(cast(s, "p1", "Donatello, Turtle Techie")).players.p1?.hand.length;
      };
      expect(run(true)).toBe(1);
      expect(run(false)).toBe(0);
    });

    it("Donatello, Way with Machines : un marqueur +1/+1 chaque fois qu'un artefact arrive sous votre contrôle", () => {
      let s = scenario({
        p1: { battlefield: ["Donatello, Way with Machines", ...lands("Island", 3)], hand: ["Buzz Bots", "Expedition Map"] },
        p2: { battlefield: [...lands("Island", 2)], hand: ["Buzz Bots"] },
      });
      const don = idOf(s, "p1", "battlefield", "Donatello, Way with Machines");
      s = settle(cast(s, "p1", "Buzz Bots"));
      s = settle(cast(s, "p1", "Expedition Map"));
      expect(s.objects[don]?.counters["+1/+1"]).toBe(2);
      expect(chars(s, don).keywords).toContain("flying");
      // Un artefact adverse ne compte pas.
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1" && x.pending?.kind === "priority");
      s = settle(cast(s, "p2", "Buzz Bots"));
      expect(s.objects[don]?.counters["+1/+1"]).toBe(2);
    });

    it("Donatello's Technique : piochez deux cartes", () => {
      let s = scenario({ p1: { battlefield: lands("Island", 3), hand: ["Donatello's Technique"], library: lands("Swamp", 3) } });
      s = settle(cast(s, "p1", "Donatello's Technique"));
      expect(namesIn(s, s.players.p1?.hand)).toEqual(["Swamp", "Swamp"]);
    });

    it("Kitsune, Dragon's Daughter : en arrivant, vous pouvez échanger le contrôle de deux autres créatures de joueurs différents", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Island", 6), "Bear Cub"], hand: ["Kitsune, Dragon's Daughter"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(cast(s, "p1", "Kitsune, Dragon's Daughter"), (req) =>
        req.intent === "may" ? [1] : pickIds(req, [bear, angel]),
      );
      expect(s.objects[bear]?.controller).toBe("p2");
      expect(s.objects[angel]?.controller).toBe("p1");
      expect(chars(s, idOf(s, "p1", "battlefield", "Kitsune, Dragon's Daughter")).keywords).toContain("vigilance");
    });

    it("Kitsune, Dragon's Daughter : on peut refuser l'échange", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Island", 6), "Bear Cub"], hand: ["Kitsune, Dragon's Daughter"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(cast(s, "p1", "Kitsune, Dragon's Daughter"), (req) =>
        req.intent === "may" ? [0] : pickIds(req, [bear, angel]),
      );
      expect(s.objects[bear]?.controller).toBe("p1");
      expect(s.objects[angel]?.controller).toBe("p2");
    });

    it("Kitsune, Dragon's Daughter : l'échange se déclenche aussi quand elle inflige des blessures de combat à un joueur", () => {
      let s = scenario({
        p1: { battlefield: ["Kitsune, Dragon's Daughter", { name: "Bear Cub", tapped: true }] },
        p2: { battlefield: [{ name: "Serra Angel", tapped: true }] },
      });
      const kitsune = idOf(s, "p1", "battlefield", "Kitsune, Dragon's Daughter");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = throughCombat(attack(s, [kitsune]), (req) => (req.intent === "may" ? [1] : pickIds(req, [bear, angel])));
      expect(s.players.p2?.life).toBe(14);
      expect(s.objects[bear]?.controller).toBe("p2");
      expect(s.objects[angel]?.controller).toBe("p1");
    });

    it("Kitsune's Technique : l'adversaire ciblé meule la moitié de sa bibliothèque, arrondie au supérieur", () => {
      const run = (size: number) => {
        const s = scenario({
          p1: { battlefield: lands("Island", 6), hand: ["Kitsune's Technique"] },
          p2: { library: lands("Forest", size) },
        });
        const t = settle(cast(s, "p1", "Kitsune's Technique", { targets: { t: ["p2"] } }));
        return [t.players.p2?.graveyard.length, t.players.p2?.library.length];
      };
      expect(run(7)).toEqual([4, 3]);
      expect(run(6)).toEqual([3, 3]);
      expect(run(1)).toEqual([1, 0]);
    });

    it("Krang, Master Mind : affinité pour les artefacts ; pioche jusqu'à quatre cartes ; +1/+0 par autre artefact", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Island", 6), "Expedition Map", "Buzz Bots"], hand: ["Krang, Master Mind", "Opt"] },
      });
      s = settle(cast(s, "p1", "Krang, Master Mind"));
      const krang = idOf(s, "p1", "battlefield", "Krang, Master Mind");
      // Huit mana moins deux artefacts : les six Îles suffisent.
      expect(s.battlefield.filter((id) => nameOf(s, id) === "Island" && !s.objects[id]?.tapped)).toHaveLength(0);
      // Une carte en main (Opt) : il en pioche trois.
      expect(s.players.p1?.hand).toHaveLength(4);
      expect(pt(s, krang)).toEqual([3, 4]);
    });

    it("Krang, Master Mind : avec quatre cartes en main ou plus, rien n'est pioché", () => {
      let s = scenario({
        p1: { battlefield: lands("Island", 8), hand: ["Krang, Master Mind", "Opt", "Opt", "Opt", "Opt"] },
      });
      s = settle(cast(s, "p1", "Krang, Master Mind"));
      expect(s.players.p1?.hand).toHaveLength(4);
    });

    it("Metalhead : renvoie jusqu'à un autre artefact ou créature ; {R}, sacrifiez un autre artefact : marqueur, menace, célérité", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Island", 5), "Mountain", "Expedition Map"], hand: ["Metalhead"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(cast(s, "p1", "Metalhead"), (req) => pickIds(req, [angel]));
      expect(namesIn(s, s.players.p2?.hand)).toEqual(["Serra Angel"]);
      const metal = idOf(s, "p1", "battlefield", "Metalhead");
      s = settle(activate(s, "p1", metal));
      expect(idsOf(s, "p1", "graveyard", "Expedition Map")).toHaveLength(1);
      expect(s.objects[metal]?.counters["+1/+1"]).toBe(1);
      expect(chars(s, metal).keywords).toEqual(expect.arrayContaining(["menace", "haste"]));
      // Arrivé ce tour-ci, il peut attaquer grâce à la célérité.
      s = throughCombat(attack(s, [metal]));
      expect(s.players.p2?.life).toBe(15);
    });

    it("Mind Transfer Protocol : un artefact devient une créature-artefact 4/5 jusqu'à la fin du tour ; piochez une carte", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Island", 3), "Expedition Map"],
          hand: ["Mind Transfer Protocol"],
          library: lands("Swamp", 3),
        },
      });
      const map = idOf(s, "p1", "battlefield", "Expedition Map");
      s = settle(cast(s, "p1", "Mind Transfer Protocol", { targets: { t: [map] } }));
      expect(chars(s, map).types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
      expect(pt(s, map)).toEqual([4, 5]);
      expect(namesIn(s, s.players.p1?.hand)).toEqual(["Swamp"]);
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
      expect(chars(s, map).types).not.toContain("Creature");
    });

    it("Ooze Spill : contrecarre le sort ciblé et crée un Mutagène", () => {
      let s = scenario({
        p1: { battlefield: lands("Mountain", 2), hand: ["Lightning Strike"] },
        p2: { battlefield: lands("Island", 3), hand: ["Ooze Spill"] },
      });
      s = cast(s, "p1", "Lightning Strike", { targets: { t: ["p2"] } });
      s = act(s, "p1", { type: "pass" });
      const strike = s.stack[0]?.id as string;
      s = settle(cast(s, "p2", "Ooze Spill", { targets: { t: [strike] } }));
      expect(s.players.p2?.life).toBe(20);
      expect(idsOf(s, "p1", "graveyard", "Lightning Strike")).toHaveLength(1);
      expect(idsOf(s, "p2", "battlefield", "Mutagen")).toHaveLength(1);
    });

    it("Ray Fillet, Man Ray : un Mutagène en arrivant ; {2}, retirez un marqueur +1/+1 d'une de vos créatures : piochez", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Island", 6), { name: "Bear Cub", counters: { "+1/+1": 1 } }],
          hand: ["Ray Fillet, Man Ray"],
          library: lands("Swamp", 3),
        },
      });
      s = settle(cast(s, "p1", "Ray Fillet, Man Ray"));
      expect(idsOf(s, "p1", "battlefield", "Mutagen")).toHaveLength(1);
      const ray = idOf(s, "p1", "battlefield", "Ray Fillet, Man Ray");
      expect(chars(s, ray).keywords).toContain("flying");
      s = settle(activate(s, "p1", ray));
      expect(s.objects[idOf(s, "p1", "battlefield", "Bear Cub")]?.counters["+1/+1"] ?? 0).toBe(0);
      expect(namesIn(s, s.players.p1?.hand)).toEqual(["Swamp"]);
      // Plus aucun marqueur : la capacité ne peut plus être activée.
      expect(legalActions(s, "p1").some((a) => a.type === "activate" && a.source === ray)).toBe(false);
    });

    it("Renet, Temporal Apprentice : renvoie chaque autre permanent non-terrain arrivé ce tour-ci", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Island", 5), { name: "Bear Cub", sick: true }, "Serra Angel", { name: "Forest", sick: true }],
          hand: ["Renet, Temporal Apprentice"],
        },
        p2: { battlefield: [{ name: "Fire Elemental", sick: true }, "Llanowar Elves"] },
      });
      s = settle(cast(s, "p1", "Renet, Temporal Apprentice"));
      expect(namesIn(s, s.players.p1?.hand)).toEqual(["Bear Cub"]);
      expect(namesIn(s, s.players.p2?.hand)).toEqual(["Fire Elemental"]);
      expect(idsOf(s, "p1", "battlefield", "Renet, Temporal Apprentice")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Serra Angel")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Forest")).toHaveLength(1);
      expect(idsOf(s, "p2", "battlefield", "Llanowar Elves")).toHaveLength(1);
    });

    it("Retro-Mutation : la créature enchantée est une Tortue 0/1 de base, sans capacité, qui ne peut pas attaquer", () => {
      let s = scenario({ p1: { battlefield: [...lands("Island", 3), "Serra Angel"], hand: ["Retro-Mutation"] } });
      const angel = idOf(s, "p1", "battlefield", "Serra Angel");
      s = settle(cast(s, "p1", "Retro-Mutation", { targets: { enchant: [angel] } }));
      const c = chars(s, angel);
      expect([c.power, c.toughness]).toEqual([0, 1]);
      expect(c.subtypes).toEqual(["Turtle"]);
      expect(c.keywords).not.toContain("flying");
      expect(c.keywords).not.toContain("vigilance");
      s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
      expect(() => act(s, "p1", { type: "declareAttackers", attackers: [{ id: angel, defender: "p2" }] })).toThrow();
    });

    it("Return to the Sewers : le propriétaire met la créature au-dessus ou au-dessous ; vous créez un Mutagène", () => {
      let s = scenario({
        p1: { battlefield: lands("Island", 4), hand: ["Return to the Sewers"] },
        p2: { battlefield: ["Serra Angel"], library: lands("Forest", 3) },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      let chooser = "";
      s = cast(s, "p1", "Return to the Sewers", { targets: { t: [angel] } });
      s = settle(s, (req, _player, cur) => {
        if (req.intent === "topOrBottom" && cur.pending?.kind === "choice") {
          chooser = cur.pending.player;
          return ["top"];
        }
        return undefined;
      });
      expect(chooser).toBe("p2");
      expect(nameOf(s, s.players.p2?.library[0] ?? "")).toBe("Serra Angel");
      expect(idsOf(s, "p1", "battlefield", "Mutagen")).toHaveLength(1);
    });

    it("Sewer-veillance Cam : en arrivant et en partant, engagez ou dégagez une créature ; {3}{U}, sacrifice : piochez deux", () => {
      let s = scenario({
        p1: { battlefield: lands("Island", 5), hand: ["Sewer-veillance Cam"], library: lands("Swamp", 3) },
        p2: { battlefield: ["Serra Angel"] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      // Pas de mode : la cible au déclenchement, puis « engager ? » (ou « dégager ? ») pendant la résolution (608.2d).
      const asked: string[] = [];
      const answer = (req: ChoiceRequest) => {
        asked.push(req.type === "yesNo" ? req.prompt : req.intent);
        return req.type === "yesNo" ? [1] : pickIds(req, [angel]);
      };
      s = settle(cast(s, "p1", "Sewer-veillance Cam"), answer);
      expect(s.objects[angel]?.tapped).toBe(true);
      expect(asked).not.toContain("triggerMode");
      expect(asked.some((p) => p.includes("Engager la créature ciblée ?"))).toBe(true);
      const cam = idOf(s, "p1", "battlefield", "Sewer-veillance Cam");
      s = settle(activate(s, "p1", cam), answer);
      expect(asked.some((p) => p.includes("Dégager la créature ciblée ?"))).toBe(true);
      expect(idsOf(s, "p1", "graveyard", "Sewer-veillance Cam")).toHaveLength(1);
      expect(namesIn(s, s.players.p1?.hand)).toEqual(["Swamp", "Swamp"]);
      expect(s.objects[angel]?.tapped).toBe(false);
    });

    it("Stockman, Mad Fly-entist : en arrivant, piochez une carte, puis défaussez une carte", () => {
      let s = scenario({
        p1: { battlefield: lands("Island", 5), hand: ["Stockman, Mad Fly-entist", "Opt"], library: lands("Swamp", 3) },
      });
      let discardOptions: (string | undefined)[] = [];
      s = settle(cast(s, "p1", "Stockman, Mad Fly-entist"), (req, _player, cur) => {
        if (req.type !== "pick") return undefined;
        discardOptions = namesIn(cur, req.options);
        return pickNamed(cur, req, "Opt");
      });
      expect(discardOptions.sort()).toEqual(["Opt", "Swamp"]);
      expect(namesIn(s, s.players.p1?.hand)).toEqual(["Swamp"]);
      expect(namesIn(s, s.players.p1?.graveyard)).toEqual(["Opt"]);
    });

    it("Turtles in Time : toutes les créatures en main ; ceux qui le veulent mélangent main et cimetière et piochent sept cartes", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Island", 7), "Bear Cub"], hand: ["Turtles in Time", "Opt"], graveyard: ["Opt"] },
        p2: { battlefield: ["Serra Angel"], hand: ["Opt"], graveyard: ["Lightning Strike"] },
      });
      s = settle(cast(s, "p1", "Turtles in Time"), (req, _player, cur) =>
        req.intent === "may" && cur.pending?.kind === "choice" ? [cur.pending.player === "p1" ? 1 : 0] : undefined,
      );
      // p1 : Ourson, Opt et le cimetière mélangés, puis sept cartes piochées.
      expect(s.players.p1?.hand).toHaveLength(7);
      expect(s.players.p1?.graveyard).toHaveLength(0);
      expect(s.players.p1?.library).toHaveLength(10 + 3 - 7);
      // p2 refuse : l'Ange est dans sa main, son cimetière reste.
      expect(namesIn(s, s.players.p2?.hand).sort()).toEqual(["Opt", "Serra Angel"]);
      expect(namesIn(s, s.players.p2?.graveyard)).toEqual(["Lightning Strike"]);
      expect(s.battlefield.filter((id) => chars(s, id).types.includes("Creature"))).toHaveLength(0);
      // Turtles in Time est exilée.
      expect(s.exile.map((id) => nameOf(s, id))).toEqual(["Turtles in Time"]);
    });

    it("Utrom Scientists : engage jusqu'à une créature et y met un marqueur d'étourdissement", () => {
      let s = scenario({
        p1: { battlefield: lands("Island", 3), hand: ["Utrom Scientists"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(cast(s, "p1", "Utrom Scientists"), (req) => pickIds(req, [angel]));
      expect(s.objects[angel]?.tapped).toBe(true);
      expect(s.objects[angel]?.counters.stun).toBe(1);
      // Le marqueur est retiré au lieu de dégager l'Ange.
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
      expect(s.objects[angel]?.tapped).toBe(true);
      expect(s.objects[angel]?.counters.stun ?? 0).toBe(0);
    });
  });
});

describe("lot A, noir", () => {
  type S = GameState;
  /** Passe et répond aux choix jusqu'à `until` (les défenseurs ne bloquent pas, personne n'attaque). */
  const playUntil = (s: S, until: (x: S) => boolean, answer: Answer = () => undefined): S => {
    let cur = s;
    for (let i = 0; i < 400 && !until(cur); i++) {
      const p = cur.pending;
      if (p?.kind === "priority") cur = act(cur, p.player, { type: "pass" });
      else if (p?.kind === "choice")
        cur = act(cur, p.player, { type: "choose", values: answer(p.request, p.player, cur) ?? p.request.suggested });
      else if (p?.kind === "declareBlockers") cur = act(cur, p.player, { type: "declareBlockers", blocks: [] });
      else if (p?.kind === "declareAttackers") cur = act(cur, p.player, { type: "declareAttackers", attackers: [] });
      else break;
    }
    return cur;
  };
  /** Résout la pile et les déclenchements en attente, en répondant aux choix. */
  const settle = (s: S, answer: Answer = () => undefined): S =>
    playUntil(s, (x) => x.pending?.kind === "priority" && x.stack.length === 0 && x.triggers.length === 0, answer);
  const throughCombat = (s: S, answer: Answer = () => undefined): S => playUntil(s, (x) => x.turn.step === "main2", answer);
  /** Active la capacité de `source` dont le libellé contient `label` (la première sinon). */
  const activate = (s: S, player: string, source: string, label?: string, extra: object = {}) => {
    const a = legalActions(s, player).find(
      (x) => x.type === "activate" && x.source === source && (!label || x.label?.includes(label)),
    );
    if (a?.type !== "activate") throw new Error(`capacité introuvable : ${label ?? source}`);
    return act(s, player, { type: "activate", source, ability: a.ability, ...extra });
  };
  /** Sélectionne dans les options d'un choix les objets nommés `name` (au plus `n`). */
  const pickNamed = (s: S, req: ChoiceRequest, name: string, n = 1) =>
    req.type === "pick" ? req.options.filter((id) => nameOf(s, id) === name).slice(0, n) : undefined;
  const answerNamed =
    (name: string, n = 1): Answer =>
    (req, _player, cur) => {
      const picked = pickNamed(cur, req, name, n);
      return picked?.length ? picked : undefined;
    };
  const pt = (s: S, id: string) => [chars(s, id).power, chars(s, id).toughness];
  /** Quelque chose a quitté le champ de bataille sous le contrôle de p1 (Disparition). */
  const disappear = (s: S, name = "Llanowar Elves") => {
    destroy(s, idOf(s, "p1", "battlefield", name));
    return settle(s);
  };
  /** Va à l'étape de fin de p1, tous ses déclenchements résolus. */
  const toEndStep = (s: S, answer: Answer = () => undefined) =>
    playUntil(
      s,
      (x) =>
        x.turn.step === "end" &&
        x.pending?.kind === "priority" &&
        x.pending.player === "p1" &&
        x.stack.length === 0 &&
        x.triggers.length === 0,
      answer,
    );

  describe("Teenage Mutant Ninja Turtles, lot A — noir", () => {
    it("Anchovy & Banana Pizza : détruit une créature en arrivant ; Nourriture : {2}, {T}, sacrifiez-la : 3 PV", () => {
      let s = scenario({
        p1: { battlefield: lands("Swamp", 6), hand: ["Anchovy & Banana Pizza"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      s = settle(cast(s, "p1", "Anchovy & Banana Pizza"), answerNamed("Serra Angel"));
      expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
      const pizza = idOf(s, "p1", "battlefield", "Anchovy & Banana Pizza");
      expect(chars(s, pizza).subtypes).toContain("Food");
      s = settle(activate(s, "p1", pizza));
      expect(s.players.p1?.life).toBe(23);
      expect(idsOf(s, "p1", "graveyard", "Anchovy & Banana Pizza")).toHaveLength(1);
    });

    it("Armaggon, Future Shark : détruit jusqu'à trois créatures ciblées", () => {
      let s = scenario({
        p1: { battlefield: lands("Swamp", 8), hand: ["Armaggon, Future Shark"] },
        p2: { battlefield: ["Bear Cub", "Bear Cub", "Bear Cub", "Serra Angel"] },
      });
      s = settle(cast(s, "p1", "Armaggon, Future Shark"), answerNamed("Bear Cub", 3));
      expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(3);
      expect(idsOf(s, "p2", "battlefield", "Serra Angel")).toHaveLength(1);
      expect(pt(s, idOf(s, "p1", "battlefield", "Armaggon, Future Shark"))).toEqual([9, 6]);
    });

    it("Bebop, Warthog Warrior : menace ; vos Rhinocéros ont la menace (pas les autres créatures)", () => {
      const rhino = customCard({ name: "Test Rhino", typeLine: "Creature — Rhino", subtypes: ["Rhino"], power: 3, toughness: 3 });
      const s = scenario({ p1: { battlefield: ["Bebop, Warthog Warrior", rhino, "Bear Cub"] }, p2: { battlefield: [rhino] } });
      expect(chars(s, idOf(s, "p1", "battlefield", "Bebop, Warthog Warrior")).keywords).toContain("menace");
      expect(chars(s, idOf(s, "p1", "battlefield", "Test Rhino")).keywords).toContain("menace");
      expect(chars(s, idOf(s, "p1", "battlefield", "Bear Cub")).keywords).not.toContain("menace");
      expect(chars(s, idOf(s, "p2", "battlefield", "Test Rhino")).keywords).not.toContain("menace");
    });

    it("The Cloning of Shredder : I exile une carte de créature et en crée une copie Mutant non légendaire ; II en recrée une", () => {
      let s = scenario({
        p1: { battlefield: lands("Swamp", 6), hand: ["The Cloning of Shredder"], graveyard: ["Splinter, Hamato Yoshi"] },
      });
      s = settle(cast(s, "p1", "The Cloning of Shredder"), answerNamed("Splinter, Hamato Yoshi"));
      expect(s.players.p1?.graveyard).toHaveLength(0);
      expect(namesIn(s, s.exile)).toEqual(["Splinter, Hamato Yoshi"]);
      const first = idOf(s, "p1", "battlefield", "Splinter, Hamato Yoshi");
      expect(s.objects[first]?.isToken).toBe(true);
      expect(chars(s, first).supertypes).not.toContain("Legendary");
      expect(chars(s, first).subtypes).toEqual(expect.arrayContaining(["Mutant", "Ninja", "Rat"]));
      expect(pt(s, first)).toEqual([1, 3]);
      // Chapitre II, après la pioche du tour suivant de p1 : une seconde copie ; pas de règle des légendes.
      s = playUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.turn.number > 3 && x.stack.length === 0);
      s = settle(s);
      const copies = idsOf(s, "p1", "battlefield", "Splinter, Hamato Yoshi");
      expect(copies).toHaveLength(2);
      // Chaque copie donne +1/+1 à l'autre Ninja.
      for (const id of copies) expect(pt(s, id)).toEqual([2, 4]);
    });

    it("Death in the Family : exile une créature de valeur de mana 3 ou moins", () => {
      let s = scenario({
        p1: { battlefield: lands("Swamp", 2), hand: ["Death in the Family"] },
        p2: { battlefield: ["Bear Cub", "Serra Angel"] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      expect(() => cast(s, "p1", "Death in the Family", { targets: { t: [angel] } })).toThrow();
      s = settle(cast(s, "p1", "Death in the Family", { targets: { t: [idOf(s, "p2", "battlefield", "Bear Cub")] } }));
      expect(namesIn(s, s.exile)).toEqual(["Bear Cub"]);
      expect(s.players.p2?.graveyard).toHaveLength(0);
    });

    it("Foot Mystic : lien de vie ; Disparition — un Ninja 1/1 noir seulement si un permanent vous a quitté ce tour-ci", () => {
      const setup = () =>
        scenario({
          p1: { battlefield: [...lands("Swamp", 4), "Llanowar Elves"], hand: ["Foot Mystic"] },
          p2: { battlefield: ["Bear Cub"] },
        });
      let s = settle(cast(setup(), "p1", "Foot Mystic"));
      expect(idsOf(s, "p1", "battlefield", "Ninja")).toHaveLength(0);
      expect(chars(s, idOf(s, "p1", "battlefield", "Foot Mystic")).keywords).toContain("lifelink");
      // Une créature adverse qui meurt ne compte pas.
      let t = setup();
      destroy(t, idOf(t, "p2", "battlefield", "Bear Cub"));
      t = settle(cast(settle(t), "p1", "Foot Mystic"));
      expect(idsOf(t, "p1", "battlefield", "Ninja")).toHaveLength(0);
      s = settle(cast(disappear(setup()), "p1", "Foot Mystic"));
      const ninja = idOf(s, "p1", "battlefield", "Ninja");
      expect(pt(s, ninja)).toEqual([1, 1]);
      expect(chars(s, ninja).colors).toEqual(["B"]);
    });

    it("Insectoid Exterminator : Disparition — regard 1 à votre étape de fin", () => {
      const setup = () =>
        scenario({ p1: { battlefield: ["Insectoid Exterminator", "Llanowar Elves"], library: ["Opt", "Island", "Swamp"] } });
      let asked = false;
      const bottom: Answer = (req) => {
        if (req.intent !== "scryBottom" || req.type !== "pick") return undefined;
        asked = true;
        return req.options;
      };
      let s = toEndStep(setup(), bottom);
      expect(asked).toBe(false);
      s = toEndStep(disappear(setup()), bottom);
      expect(asked).toBe(true);
      expect(namesIn(s, s.players.p1?.library)).toEqual(["Island", "Swamp", "Opt"]);
      expect(chars(s, idOf(s, "p1", "battlefield", "Insectoid Exterminator")).keywords).toContain("flying");
    });

    it("Lord Dregg : Disparition — un Insecte Guerrier 1/1 volant à l'étape de fin ; {3}{G}, sacrifiez un jeton : piochez", () => {
      let s = scenario({ p1: { battlefield: ["Lord Dregg, Insect Invader", "Llanowar Elves", ...lands("Forest", 4)] } });
      s = toEndStep(disappear(s));
      const insect = idOf(s, "p1", "battlefield", "Insect Warrior");
      expect(pt(s, insect)).toEqual([1, 1]);
      expect(chars(s, insect).colors).toEqual(["B"]);
      expect(chars(s, insect).keywords).toContain("flying");
      const dregg = idOf(s, "p1", "battlefield", "Lord Dregg, Insect Invader");
      const hand = s.players.p1?.hand.length ?? 0;
      // Lord Dregg n'est pas un jeton : il ne peut pas payer ce coût.
      expect(() => activate(s, "p1", dregg, "jeton", { sacrifice: [dregg] })).toThrow();
      s = settle(activate(s, "p1", dregg, "jeton", { sacrifice: [insect] }));
      expect(idsOf(s, "p1", "battlefield", "Insect Warrior")).toHaveLength(0);
      expect(s.players.p1?.hand).toHaveLength(hand + 1);
      // Sans jeton, plus d'activation possible.
      expect(canActivate(s, "p1", dregg)).toBe(false);
    });

    describe("Madame Null, Power Broker", () => {
      const setup = (life = 20) =>
        scenario({ p1: { life, battlefield: ["Madame Null, Power Broker", ...lands("Forest", 2)], hand: ["Bear Cub"] } });

      it("une autre créature arrive : payez des PV égaux à sa force pour autant de marqueurs +1/+1", () => {
        let asked = false;
        const s = settle(cast(setup(), "p1", "Bear Cub"), (req) => {
          if (req.intent !== "may") return undefined;
          asked = true;
          return [1];
        });
        expect(asked).toBe(true);
        expect(s.players.p1?.life).toBe(18);
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        expect(s.objects[bear]?.counters["+1/+1"]).toBe(2);
        expect(pt(s, bear)).toEqual([4, 4]);
      });

      it("refuser : ni PV payés ni marqueurs ; pas de proposition si vos PV ne suffisent pas", () => {
        let s = settle(cast(setup(), "p1", "Bear Cub"), (req) => (req.intent === "may" ? [0] : undefined));
        expect(s.players.p1?.life).toBe(20);
        expect(s.objects[idOf(s, "p1", "battlefield", "Bear Cub")]?.counters["+1/+1"] ?? 0).toBe(0);
        let asked = false;
        s = settle(cast(setup(1), "p1", "Bear Cub"), (req) => {
          if (req.intent === "may") asked = true;
          return undefined;
        });
        expect(asked).toBe(false);
        expect(s.players.p1?.life).toBe(1);
      });
    });

    it("Oroku Saki, Shredder Rising : blessures de combat à un joueur — vous piochez une carte et perdez 1 PV", () => {
      let s = scenario({ p1: { battlefield: ["Oroku Saki, Shredder Rising"] } });
      s = throughCombat(attack(s, [idOf(s, "p1", "battlefield", "Oroku Saki, Shredder Rising")]));
      expect(s.players.p2?.life).toBe(17);
      expect(s.players.p1?.life).toBe(19);
      expect(s.players.p1?.hand).toHaveLength(1);
    });

    it("Pain 101 : contact mortel ; quand elle meurt, elle revient engagée sous le contrôle de son propriétaire", () => {
      let s = scenario({ p1: { battlefield: lands("Swamp", 2), hand: ["Pain 101"] }, p2: { battlefield: ["Bear Cub"] } });
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Pain 101", { targets: { t: [bear] } }));
      expect(chars(s, bear).keywords).toContain("deathtouch");
      destroy(s, bear);
      s = settle(s);
      const back = idOf(s, "p2", "battlefield", "Bear Cub");
      expect(s.objects[back]?.tapped).toBe(true);
      expect(s.objects[back]?.controller).toBe("p2");
      // Nouvel objet : l'effet ne s'applique plus.
      expect(chars(s, back).keywords).not.toContain("deathtouch");
      destroy(s, back);
      s = settle(s);
      expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
    });

    describe("Paramecia Coloniex", () => {
      it("en arrivant, meulez trois cartes", () => {
        let s = scenario({
          p1: { battlefield: lands("Swamp", 2), hand: ["Paramecia Coloniex"], library: ["Opt", "Island", "Swamp", "Forest"] },
        });
        s = settle(cast(s, "p1", "Paramecia Coloniex"));
        expect(namesIn(s, s.players.p1?.graveyard).sort()).toEqual(["Island", "Opt", "Swamp"]);
        expect(namesIn(s, s.players.p1?.library)).toEqual(["Forest"]);
      });

      it("quand elle meurt, exilez-la : une carte de créature de votre cimetière au-dessus de la bibliothèque", () => {
        let s = scenario({
          p1: { battlefield: ["Paramecia Coloniex"], graveyard: ["Serra Angel", "Bear Cub", "Opt"], library: ["Island"] },
        });
        destroy(s, idOf(s, "p1", "battlefield", "Paramecia Coloniex"));
        let options: (string | undefined)[] = [];
        s = settle(s, (req, _player, cur) => {
          if (req.intent === "may") return [1];
          if (req.type === "pick") {
            options = namesIn(cur, req.options);
            return pickNamed(cur, req, "Serra Angel");
          }
          return undefined;
        });
        // Seules les cartes de créature restées au cimetière sont proposées.
        expect(options.sort()).toEqual(["Bear Cub", "Serra Angel"]);
        expect(namesIn(s, s.exile)).toEqual(["Paramecia Coloniex"]);
        expect(namesIn(s, s.players.p1?.library)).toEqual(["Serra Angel", "Island"]);
      });

      it("si vous ne l'exilez pas, rien ne bouge", () => {
        let s = scenario({ p1: { battlefield: ["Paramecia Coloniex"], graveyard: ["Serra Angel"], library: ["Island"] } });
        destroy(s, idOf(s, "p1", "battlefield", "Paramecia Coloniex"));
        s = settle(s, (req) => (req.intent === "may" ? [0] : undefined));
        expect(namesIn(s, s.players.p1?.graveyard).sort()).toEqual(["Paramecia Coloniex", "Serra Angel"]);
        expect(namesIn(s, s.players.p1?.library)).toEqual(["Island"]);
      });
    });

    it("Savanti Romero : au début du combat, un marqueur +1/+1, puis piochez X et perdez X PV (X : ses marqueurs)", () => {
      let s = scenario({ p1: { battlefield: [{ name: "Savanti Romero, Time's Exile", counters: { "+1/+1": 2 } }] } });
      s = throughCombat(s);
      const savanti = idOf(s, "p1", "battlefield", "Savanti Romero, Time's Exile");
      expect(s.objects[savanti]?.counters["+1/+1"]).toBe(3);
      expect(s.players.p1?.hand).toHaveLength(3);
      expect(s.players.p1?.life).toBe(17);
      expect(chars(s, savanti).keywords).toContain("trample");
    });

    it("Shark Shredder : blessures de combat — une carte de créature de son cimetière arrive sous votre contrôle, engagée et attaquante", () => {
      let s = scenario({ p1: { battlefield: ["Shark Shredder, Killer Clone"] }, p2: { graveyard: ["Serra Angel", "Opt"] } });
      const shark = idOf(s, "p1", "battlefield", "Shark Shredder, Killer Clone");
      expect(chars(s, shark).keywords).toContain("firstStrike");
      let options: (string | undefined)[] = [];
      s = playUntil(
        attack(s, [shark]),
        (x) => idsOf(x, "p1", "battlefield", "Serra Angel").length > 0 && x.stack.length === 0,
        (req, _player, cur) => {
          if (req.type !== "pick") return undefined;
          options = namesIn(cur, req.options);
          return pickNamed(cur, req, "Serra Angel");
        },
      );
      expect(options).toContain("Serra Angel");
      expect(options).not.toContain("Opt");
      const angel = idOf(s, "p1", "battlefield", "Serra Angel");
      expect(s.objects[angel]?.controller).toBe("p1");
      expect(s.objects[angel]?.owner).toBe("p2");
      expect(s.objects[angel]?.tapped).toBe(true);
      expect(s.combat?.attackers.some((a) => a.id === angel && a.defender === "p2")).toBe(true);
      expect(s.players.p2?.life).toBe(16);
      // Arrivé après les blessures de l'initiative, l'Ange non bloqué blesse à l'étape de blessures normale (510.4).
      s = throughCombat(s);
      expect(s.players.p2?.life).toBe(12);
    });

    it("Shredder, Unrelenting : en arrivant ou en attaquant, une autre de vos créatures gagne le contact mortel", () => {
      let s = scenario({ p1: { battlefield: [...lands("Swamp", 5), "Bear Cub"], hand: ["Shredder, Unrelenting"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      let options: string[] = [];
      s = settle(cast(s, "p1", "Shredder, Unrelenting"), (req) => {
        if (req.type !== "pick") return undefined;
        options = req.options as string[];
        return [bear];
      });
      const shredder = idOf(s, "p1", "battlefield", "Shredder, Unrelenting");
      expect(options).not.toContain(shredder);
      expect(chars(s, bear).keywords).toContain("deathtouch");
      expect(chars(s, shredder).keywords).toContain("deathtouch");
      // En attaquant (un tour plus tard) : l'Ourson regagne le contact mortel.
      let t = scenario({ p1: { battlefield: ["Shredder, Unrelenting", "Bear Cub"] } });
      const bear2 = idOf(t, "p1", "battlefield", "Bear Cub");
      expect(chars(t, bear2).keywords).not.toContain("deathtouch");
      t = settle(attack(t, [idOf(t, "p1", "battlefield", "Shredder, Unrelenting")]), (req) =>
        req.type === "pick" && req.options.includes(bear2) ? [bear2] : undefined,
      );
      expect(chars(t, bear2).keywords).toContain("deathtouch");
    });

    describe("Shredder's Armor", () => {
      it("en arrivant, s'attache à une de vos créatures : +2/+1", () => {
        let s = scenario({ p1: { battlefield: [...lands("Swamp", 2), "Bear Cub"], hand: ["Shredder's Armor"] } });
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        s = settle(cast(s, "p1", "Shredder's Armor"), (req) =>
          req.type === "pick" && req.options.includes(bear) ? [bear] : undefined,
        );
        expect(s.objects[idOf(s, "p1", "battlefield", "Shredder's Armor")]?.attachedTo).toBe(bear);
        expect(pt(s, bear)).toEqual([4, 3]);
      });

      it("Équiper — sacrifiez un autre permanent non-terrain, une seule fois par tour", () => {
        let s = scenario({
          p1: { battlefield: ["Shredder's Armor", "Bear Cub", "Llanowar Elves", "Llanowar Elves", "Swamp"] },
        });
        const armor = idOf(s, "p1", "battlefield", "Shredder's Armor");
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        const [elf1, elf2] = idsOf(s, "p1", "battlefield", "Llanowar Elves") as [string, string];
        // Un terrain ne paie pas ce coût.
        expect(() =>
          activate(s, "p1", armor, "Équiper", { targets: { t: [bear] }, sacrifice: [idOf(s, "p1", "battlefield", "Swamp")] }),
        ).toThrow();
        s = settle(activate(s, "p1", armor, "Équiper", { targets: { t: [bear] }, sacrifice: [elf1] }));
        expect(s.objects[armor]?.attachedTo).toBe(bear);
        expect(idsOf(s, "p1", "graveyard", "Llanowar Elves")).toHaveLength(1);
        expect(pt(s, bear)).toEqual([4, 3]);
        // Une seule fois par tour, même avec un autre Elfe à sacrifier.
        expect(() => activate(s, "p1", armor, "Équiper", { targets: { t: [elf2] }, sacrifice: [elf2] })).toThrow();
      });
    });

    describe("Shredder's Revenge", () => {
      it("mode 1 : le joueur ciblé défausse deux cartes", () => {
        let s = scenario({
          p1: { battlefield: lands("Swamp", 3), hand: ["Shredder's Revenge"] },
          p2: { hand: ["Opt", "Opt", "Island"] },
        });
        s = settle(cast(s, "p1", "Shredder's Revenge", { mode: 0, targets: { t: ["p2"] } }));
        expect(s.players.p2?.hand).toHaveLength(1);
        expect(s.players.p2?.graveyard).toHaveLength(2);
      });

      it("mode 2 : le joueur ciblé pioche deux cartes et perd 2 PV", () => {
        let s = scenario({ p1: { battlefield: lands("Swamp", 3), hand: ["Shredder's Revenge"] } });
        s = settle(cast(s, "p1", "Shredder's Revenge", { mode: 1, targets: { t: ["p1"] } }));
        expect(s.players.p1?.hand).toHaveLength(2);
        expect(s.players.p1?.life).toBe(18);
        expect(s.players.p2?.life).toBe(20);
      });
    });

    it("Shredder's Technique : détruit une créature ou un enchantement ; un enchantement détruit vous coûte 2 PV", () => {
      const setup = () =>
        scenario({
          p1: { battlefield: lands("Swamp", 3), hand: ["Shredder's Technique"] },
          p2: { battlefield: ["Bear Cub", "Warleader's Call"] },
        });
      let s = setup();
      s = settle(cast(s, "p1", "Shredder's Technique", { targets: { t: [idOf(s, "p2", "battlefield", "Warleader's Call")] } }));
      expect(idsOf(s, "p2", "graveyard", "Warleader's Call")).toHaveLength(1);
      expect(s.players.p1?.life).toBe(18);
      let t = setup();
      t = settle(cast(t, "p1", "Shredder's Technique", { targets: { t: [idOf(t, "p2", "battlefield", "Bear Cub")] } }));
      expect(idsOf(t, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(t.players.p1?.life).toBe(20);
    });

    it("South Wind Avatar : une autre de vos créatures meurt — PV égaux à son endurance ; chaque gain fait perdre 1 PV à chaque adversaire", () => {
      let s = scenario({
        players: 3,
        p1: { battlefield: ["South Wind Avatar", "Serra Angel"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      destroy(s, idOf(s, "p1", "battlefield", "Serra Angel"));
      s = settle(s);
      expect([s.players.p1?.life, s.players.p2?.life, s.players.p3?.life]).toEqual([24, 19, 19]);
      // Une créature adverse qui meurt ne rapporte rien.
      destroy(s, idOf(s, "p2", "battlefield", "Bear Cub"));
      s = settle(s);
      expect([s.players.p1?.life, s.players.p2?.life]).toEqual([24, 19]);
    });

    it("Splinter, Hamato Yoshi : menace ; vos autres Ninjas ont +1/+1", () => {
      const s = scenario({
        p1: { battlefield: ["Splinter, Hamato Yoshi", "Foot Mystic", "Bear Cub"] },
        p2: { battlefield: ["Foot Mystic"] },
      });
      const splinter = idOf(s, "p1", "battlefield", "Splinter, Hamato Yoshi");
      expect(pt(s, splinter)).toEqual([1, 3]);
      expect(chars(s, splinter).keywords).toContain("menace");
      expect(pt(s, idOf(s, "p1", "battlefield", "Foot Mystic"))).toEqual([3, 5]);
      expect(pt(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toEqual([2, 2]);
      expect(pt(s, idOf(s, "p2", "battlefield", "Foot Mystic"))).toEqual([2, 4]);
    });

    it("Splinter's Technique : cherchez une carte, mettez-la dans votre main", () => {
      let s = scenario({
        p1: { battlefield: lands("Swamp", 4), hand: ["Splinter's Technique"], library: ["Island", "Serra Angel", "Opt"] },
      });
      s = settle(cast(s, "p1", "Splinter's Technique"), answerNamed("Serra Angel"));
      expect(namesIn(s, s.players.p1?.hand)).toEqual(["Serra Angel"]);
      expect(s.players.p1?.library).toHaveLength(2);
    });

    it("Stomped by the Foot : -2/-2 ; kické en sacrifiant un artefact ou une créature, -5/-5", () => {
      let s = scenario({
        p1: { battlefield: lands("Swamp", 2), hand: ["Stomped by the Foot"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(cast(s, "p1", "Stomped by the Foot", { targets: { t: [angel] } }));
      expect(pt(s, angel)).toEqual([2, 2]);
      let t = scenario({
        p1: { battlefield: [...lands("Swamp", 2), "Bear Cub"], hand: ["Stomped by the Foot"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const angel2 = idOf(t, "p2", "battlefield", "Serra Angel");
      t = act(t, "p1", {
        type: "cast",
        card: idOf(t, "p1", "hand", "Stomped by the Foot"),
        kicked: true,
        targets: { t: [angel2] },
      });
      expect(idsOf(t, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
      t = settle(t);
      expect(idsOf(t, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
    });

    it("Super Shredder : chaque fois qu'un autre permanent quitte le champ de bataille, un marqueur +1/+1", () => {
      let s = scenario({
        p1: { battlefield: ["Super Shredder", "Bear Cub"] },
        p2: { battlefield: ["Llanowar Elves", "Warleader's Call"] },
      });
      destroy(s, idOf(s, "p1", "battlefield", "Bear Cub"));
      destroy(s, idOf(s, "p2", "battlefield", "Llanowar Elves"));
      destroy(s, idOf(s, "p2", "battlefield", "Warleader's Call"));
      s = settle(s);
      const shredder = idOf(s, "p1", "battlefield", "Super Shredder");
      expect(s.objects[shredder]?.counters["+1/+1"]).toBe(3);
      expect(pt(s, shredder)).toEqual([4, 4]);
    });

    it("Tunnel Rats : {4}{B} depuis le cimetière, elle revient engagée", () => {
      let s = scenario({ p1: { battlefield: lands("Swamp", 5), graveyard: ["Tunnel Rats"] } });
      const rats = idOf(s, "p1", "graveyard", "Tunnel Rats");
      s = settle(activate(s, "p1", rats));
      const back = idOf(s, "p1", "battlefield", "Tunnel Rats");
      expect(s.objects[back]?.tapped).toBe(true);
      expect(s.players.p1?.graveyard).toHaveLength(0);
      // Depuis le champ de bataille, la capacité n'est pas proposée.
      expect(canActivate(s, "p1", back)).toBe(false);
    });
  });
});

describe("lot A, rouge", () => {
  type S = GameState;
  /** Active la capacité de `source` dont le libellé contient `label` (la première sinon). */
  const activate = (s: S, player: string, source: string, label?: string, extra: object = {}) => {
    const a = legalActions(s, player).find(
      (x) => x.type === "activate" && x.source === source && (!label || x.label?.includes(label)),
    );
    if (a?.type !== "activate") throw new Error(`capacité introuvable : ${label ?? source}`);
    return act(s, player, { type: "activate", source, ability: a.ability, ...extra });
  };
  const canCast = (s: S, player: string, card: string) =>
    legalActions(s, player).some((x) => x.type === "cast" && x.card === card);
  /** Choisit `id` dans un choix qui le propose. */
  const pickId =
    (...ids: string[]): Answer =>
    (req) => {
      if (req.type !== "pick") return undefined;
      const hit = ids.find((id) => req.options.includes(id));
      return hit ? [hit] : undefined;
    };
  const triggerMode =
    (index: number): Answer =>
    (req) =>
      req.type === "pick" && req.intent === "triggerMode" ? [String(index)] : undefined;
  const pt = (s: S, id: string) => [chars(s, id).power, chars(s, id).toughness];

  describe("Teenage Mutant Ninja Turtles, lot A — rouge", () => {
    it("Bot Bashing Time : 6 blessures à une créature, exilée si elle devait mourir ce tour-ci", () => {
      let s = scenario({
        p1: { battlefield: lands("Mountain", 4), hand: ["Bot Bashing Time"] },
        p2: { battlefield: ["Shivan Dragon"] },
      });
      const dragon = idOf(s, "p2", "battlefield", "Shivan Dragon");
      s = settle(cast(s, "p1", "Bot Bashing Time", { targets: { t: [dragon] } }));
      expect(s.exile.map((id) => nameOf(s, id))).toEqual(["Shivan Dragon"]);
      expect(s.players.p2?.graveyard).toHaveLength(0);
    });

    it("Broadcast Takeover : vous contrôlez les artefacts adverses jusqu'à la fin du tour, dégagés et avec la célérité", () => {
      let s = scenario({
        p1: { battlefield: lands("Mountain", 5), hand: ["Broadcast Takeover"] },
        p2: { battlefield: [{ name: "Ravenous Robots", tapped: true }, "Fishing Pole", "Bear Cub"] },
      });
      const robots = idOf(s, "p2", "battlefield", "Ravenous Robots");
      const pole = idOf(s, "p2", "battlefield", "Fishing Pole");
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Broadcast Takeover"));
      expect(s.objects[robots]?.controller).toBe("p1");
      expect(s.objects[pole]?.controller).toBe("p1");
      // Seulement les artefacts.
      expect(s.objects[bear]?.controller).toBe("p2");
      expect(s.objects[robots]?.tapped).toBe(false);
      expect(chars(s, robots).keywords).toContain("haste");
      // Arrivé sous votre contrôle ce tour-ci, il attaque grâce à la célérité.
      s = settle(attack(s, [robots]));
      s = advanceUntil(s, (x) => x.turn.step === "end");
      expect(s.players.p2?.life).toBe(18);
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
      expect(s.objects[robots]?.controller).toBe("p2");
      expect(s.objects[pole]?.controller).toBe("p2");
    });

    it("Casey Jones, Jury-Rig Justiciar : célérité ; une carte d'artefact parmi les quatre du dessus, le reste dessous", () => {
      let s = scenario({
        p1: {
          battlefield: lands("Mountain", 2),
          hand: ["Casey Jones, Jury-Rig Justiciar"],
          library: ["Opt", "Fishing Pole", "Island", "Bear Cub", "Swamp", "Forest"],
        },
      });
      let offered: (string | undefined)[] = [];
      s = settle(cast(s, "p1", "Casey Jones, Jury-Rig Justiciar"), (req, _player, cur) => {
        if (req.type !== "pick") return undefined;
        offered = namesIn(cur, req.options);
        return req.options.filter((id) => nameOf(cur, id) === "Fishing Pole");
      });
      // Seules les cartes d'artefact sont proposées.
      expect(offered).toEqual(["Fishing Pole"]);
      expect(namesIn(s, s.players.p1?.hand)).toEqual(["Fishing Pole"]);
      const library = namesIn(s, s.players.p1?.library);
      expect(library.slice(0, 2)).toEqual(["Swamp", "Forest"]);
      expect([...library.slice(2)].sort()).toEqual(["Bear Cub", "Island", "Opt"]);
      expect(chars(s, idOf(s, "p1", "battlefield", "Casey Jones, Jury-Rig Justiciar")).keywords).toContain("haste");
    });

    describe("General Traag, Heart of Stone", () => {
      it("en arrivant, sacrifier un autre artefact inflige 4 blessures à une créature ciblée", () => {
        let s = scenario({
          p1: { battlefield: [...lands("Mountain", 5), "Fishing Pole"], hand: ["General Traag, Heart of Stone"] },
          p2: { battlefield: ["Serra Angel"] },
        });
        const pole = idOf(s, "p1", "battlefield", "Fishing Pole");
        const angel = idOf(s, "p2", "battlefield", "Serra Angel");
        let sacOptions: string[] = [];
        s = settle(cast(s, "p1", "General Traag, Heart of Stone"), (req, _player, cur) => {
          if (req.type === "pick" && req.options.includes(pole)) sacOptions = req.options;
          return pickId(pole, angel)(req, "p1", cur);
        });
        // Traag lui-même n'est pas proposé : « un autre artefact ».
        expect(sacOptions).toEqual([pole]);
        expect(idsOf(s, "p1", "graveyard", "Fishing Pole")).toHaveLength(1);
        expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
        expect(chars(s, idOf(s, "p1", "battlefield", "General Traag, Heart of Stone")).keywords).toContain("trample");
      });

      it("sans sacrifice, aucune blessure", () => {
        let s = scenario({
          p1: { battlefield: [...lands("Mountain", 5), "Fishing Pole"], hand: ["General Traag, Heart of Stone"] },
          p2: { battlefield: ["Serra Angel"] },
        });
        s = settle(cast(s, "p1", "General Traag, Heart of Stone"), (req) => (req.type === "pick" ? [] : undefined));
        expect(idsOf(s, "p1", "battlefield", "Fishing Pole")).toHaveLength(1);
        expect(s.objects[idOf(s, "p2", "battlefield", "Serra Angel")]?.damage ?? 0).toBe(0);
      });
    });

    it("Hard-Won Jitte : la créature équipée a la double initiative (Équiper {2})", () => {
      let s = scenario({ p1: { battlefield: ["Hard-Won Jitte", "Bear Cub", ...lands("Mountain", 2)] } });
      const jitte = idOf(s, "p1", "battlefield", "Hard-Won Jitte");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      expect(chars(s, bear).keywords).not.toContain("doubleStrike");
      s = settle(activate(s, "p1", jitte, "Équiper", { targets: { t: [bear] } }));
      expect(s.objects[jitte]?.attachedTo).toBe(bear);
      expect(chars(s, bear).keywords).toContain("doubleStrike");
      s = settle(attack(s, [bear]));
      s = advanceUntil(s, (x) => x.turn.step === "end");
      expect(s.players.p2?.life).toBe(16);
    });

    it("Improvised Arsenal : +1/+0 par artefact que vous contrôlez ; {4}{R} : un jeton copie de l'Équipement", () => {
      let s = scenario({ p1: { battlefield: ["Improvised Arsenal", "Fishing Pole", "Bear Cub", ...lands("Mountain", 6)] } });
      const arsenal = idOf(s, "p1", "battlefield", "Improvised Arsenal");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(activate(s, "p1", arsenal, "Équiper", { targets: { t: [bear] } }));
      expect(s.objects[arsenal]?.attachedTo).toBe(bear);
      // Deux artefacts : l'Arsenal et la Canne à pêche.
      expect(pt(s, bear)).toEqual([4, 2]);
      s = settle(activate(s, "p1", arsenal, "copie"));
      const copies = idsOf(s, "p1", "battlefield", "Improvised Arsenal");
      expect(copies).toHaveLength(2);
      expect(copies.filter((id) => s.objects[id]?.isToken)).toHaveLength(1);
      // Le jeton est un artefact de plus.
      expect(pt(s, bear)).toEqual([5, 2]);
    });

    it("Jennika's Technique : 2 blessures à chaque créature", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Mountain", 3), "Llanowar Elves"], hand: ["Jennika's Technique"] },
        p2: { battlefield: ["Bear Cub", "Serra Angel"] },
      });
      s = settle(cast(s, "p1", "Jennika's Technique"));
      expect(idsOf(s, "p1", "graveyard", "Llanowar Elves")).toHaveLength(1);
      expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(s.objects[idOf(s, "p2", "battlefield", "Serra Angel")]?.damage).toBe(2);
    });

    describe("Manhole Missile", () => {
      it("3 blessures ; une carte de la main au-dessous de la bibliothèque, puis piochez", () => {
        let s = scenario({
          p1: { battlefield: lands("Mountain", 2), hand: ["Manhole Missile", "Opt"], library: ["Island", "Swamp"] },
          p2: { battlefield: ["Fire Elemental"] },
        });
        const elemental = idOf(s, "p2", "battlefield", "Fire Elemental");
        const opt = idOf(s, "p1", "hand", "Opt");
        s = settle(cast(s, "p1", "Manhole Missile", { targets: { t: [elemental] } }), pickId(opt));
        expect(s.objects[elemental]?.damage).toBe(3);
        expect(namesIn(s, s.players.p1?.hand)).toEqual(["Island"]);
        expect(namesIn(s, s.players.p1?.library)).toEqual(["Swamp", "Opt"]);
      });

      it("sans carte mise dessous, pas de pioche", () => {
        let s = scenario({
          p1: { battlefield: lands("Mountain", 2), hand: ["Manhole Missile", "Opt"], library: ["Island", "Swamp"] },
          p2: { battlefield: ["Bear Cub"] },
        });
        const bear = idOf(s, "p2", "battlefield", "Bear Cub");
        s = settle(cast(s, "p1", "Manhole Missile", { targets: { t: [bear] } }), (req) => (req.type === "pick" ? [] : undefined));
        expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
        expect(namesIn(s, s.players.p1?.hand)).toEqual(["Opt"]);
        expect(s.players.p1?.library).toHaveLength(2);
      });
    });

    it("Mouser Attack! : un Robot 1/1 incolore, ou +3/+0 et l'initiative", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Mountain", 4), "Bear Cub"], hand: ["Mouser Attack!", "Mouser Attack!"] },
      });
      s = settle(cast(s, "p1", "Mouser Attack!", { mode: 0 }));
      const robot = idOf(s, "p1", "battlefield", "Robot");
      expect(pt(s, robot)).toEqual([1, 1]);
      expect(chars(s, robot).types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
      expect(chars(s, robot).colors).toEqual([]);
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Mouser Attack!", { mode: 1, targets: { t: [bear] } }));
      expect(pt(s, bear)).toEqual([5, 2]);
      expect(chars(s, bear).keywords).toContain("firstStrike");
    });

    it("Mouser Foundry : un Robot en arrivant et un en partant ; {4}{R}, sacrifice : 3 blessures à une créature", () => {
      let s = scenario({
        p1: { battlefield: lands("Mountain", 7), hand: ["Mouser Foundry"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      s = settle(cast(s, "p1", "Mouser Foundry"));
      expect(idsOf(s, "p1", "battlefield", "Robot")).toHaveLength(1);
      const foundry = idOf(s, "p1", "battlefield", "Mouser Foundry");
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(activate(s, "p1", foundry, undefined, { targets: { t: [angel] } }));
      expect(idsOf(s, "p1", "graveyard", "Mouser Foundry")).toHaveLength(1);
      expect(s.objects[angel]?.damage).toBe(3);
      expect(idsOf(s, "p1", "battlefield", "Robot")).toHaveLength(2);
    });

    it("Mutant Town Musicians : Alliance — +1/+0 jusqu'à la fin du tour", () => {
      let s = scenario({ p1: { battlefield: ["Mutant Town Musicians", "Forest"], hand: ["Llanowar Elves"] } });
      const musicians = idOf(s, "p1", "battlefield", "Mutant Town Musicians");
      s = settle(cast(s, "p1", "Llanowar Elves"));
      expect(pt(s, musicians)).toEqual([3, 4]);
      expect(chars(s, musicians).keywords).toContain("trample");
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
      expect(pt(s, musicians)).toEqual([2, 4]);
    });

    describe("Null Group Biological Assets", () => {
      it("l'initiative pendant votre tour seulement", () => {
        const mine = scenario({ p1: { battlefield: ["Null Group Biological Assets"] } });
        expect(chars(mine, idOf(mine, "p1", "battlefield", "Null Group Biological Assets")).keywords).toContain("firstStrike");
        const theirs = scenario({ active: "p2", p1: { battlefield: ["Null Group Biological Assets"] } });
        expect(chars(theirs, idOf(theirs, "p1", "battlefield", "Null Group Biological Assets")).keywords).not.toContain(
          "firstStrike",
        );
      });

      it("quand elle attaque, vous pouvez défausser une carte pour en piocher une", () => {
        let s = scenario({ p1: { battlefield: ["Null Group Biological Assets"], hand: ["Opt"], library: lands("Island", 3) } });
        const opt = idOf(s, "p1", "hand", "Opt");
        s = settle(attack(s, [idOf(s, "p1", "battlefield", "Null Group Biological Assets")]), pickId(opt));
        expect(namesIn(s, s.players.p1?.hand)).toEqual(["Island"]);
        expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(1);
      });
    });

    it("Old Hob, Alleycat Blues : un Mutant 2/2 avec la célérité au combat, détruit à l'étape de fin ; {1}{W} : indestructible", () => {
      let s = scenario({ p1: { battlefield: ["Old Hob, Alleycat Blues", "Bear Cub", "Plains", "Mountain"] } });
      s = advanceUntil(
        s,
        (x) =>
          x.turn.step === "beginCombat" &&
          x.stack.length === 0 &&
          x.triggers.length === 0 &&
          idsOf(x, "p1", "battlefield", "Mutant").length > 0,
      );
      const mutant = idOf(s, "p1", "battlefield", "Mutant");
      expect(pt(s, mutant)).toEqual([2, 2]);
      expect(chars(s, mutant).colors).toEqual(["R"]);
      expect(chars(s, mutant).keywords).toContain("haste");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = act(s, "p1", { type: "pass" });
      s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
      s = act(s, "p1", {
        type: "declareAttackers",
        attackers: [
          { id: mutant, defender: "p2" },
          { id: bear, defender: "p2" },
        ],
      });
      const hob = idOf(s, "p1", "battlefield", "Old Hob, Alleycat Blues");
      // Seul un jeton attaquant peut être ciblé.
      expect(() => activate(s, "p1", hob, undefined, { targets: { t: [bear] } })).toThrow();
      s = settle(activate(s, "p1", hob, undefined, { targets: { t: [mutant] } }));
      expect(chars(s, mutant).keywords).toContain("indestructible");
      s = advanceUntil(s, (x) => x.turn.step === "main2");
      expect(s.players.p2?.life).toBe(16);
      // Indestructible jusqu'à la fin du tour : la destruction de l'étape de fin est sans effet.
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
      expect(idsOf(s, "p1", "battlefield", "Mutant")).toHaveLength(1);
    });

    it("Old Hob : sans protection, le Mutant est détruit au début de l'étape de fin", () => {
      let s = scenario({ p1: { battlefield: ["Old Hob, Alleycat Blues"] } });
      s = advanceUntil(s, (x) => x.turn.step === "main2");
      expect(idsOf(s, "p1", "battlefield", "Mutant")).toHaveLength(1);
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
      expect(idsOf(s, "p1", "battlefield", "Mutant")).toHaveLength(0);
      // Pendant le tour de l'adversaire, pas de jeton.
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main2");
      expect(idsOf(s, "p1", "battlefield", "Mutant")).toHaveLength(0);
    });

    it("Purple Dragon Punks : {R} seulement pour un sort d'artefact ou une capacité", () => {
      const s = scenario({ p1: { battlefield: ["Purple Dragon Punks"], hand: ["Fishing Pole", "Shock"] } });
      expect(canCast(s, "p1", idOf(s, "p1", "hand", "Fishing Pole"))).toBe(true);
      expect(canCast(s, "p1", idOf(s, "p1", "hand", "Shock"))).toBe(false);
      // Une capacité activée : équiper la Canne à pêche ({2}).
      const t = scenario({ p1: { battlefield: ["Purple Dragon Punks", "Purple Dragon Punks", "Fishing Pole", "Bear Cub"] } });
      const pole = idOf(t, "p1", "battlefield", "Fishing Pole");
      const after = settle(activate(t, "p1", pole, "Équiper", { targets: { t: [idOf(t, "p1", "battlefield", "Bear Cub")] } }));
      expect(after.objects[pole]?.attachedTo).toBe(idOf(t, "p1", "battlefield", "Bear Cub"));
    });

    it("Raphael, Most Attitude : Alliance — exile la carte du dessus ; en attaquant, vous pouvez la jouer ce tour-ci", () => {
      let s = scenario({
        p1: {
          battlefield: ["Raphael, Most Attitude", "Forest", "Mountain"],
          hand: ["Llanowar Elves"],
          library: ["Shock", "Island"],
        },
      });
      s = settle(cast(s, "p1", "Llanowar Elves"), (req) => (req.intent === "may" ? [1] : undefined));
      expect(s.exile.map((id) => nameOf(s, id))).toEqual(["Shock"]);
      const shock = s.exile[0] as string;
      const raph = idOf(s, "p1", "battlefield", "Raphael, Most Attitude");
      expect(s.objects[raph]?.linked).toContain(shock);
      expect(chars(s, raph).keywords).toContain("menace");
      expect(canCast(s, "p1", shock)).toBe(false);
      s = settle(attack(s, [raph]));
      expect(canCast(s, "p1", shock)).toBe(true);
      s = settle(act(s, "p1", { type: "cast", card: shock, targets: { t: ["p2"] } }));
      expect(s.players.p2?.life).toBe(18);
    });

    it("Raphael, Most Attitude : une seule des cartes exilées avec lui peut être jouée", () => {
      let s = scenario({
        p1: {
          battlefield: ["Raphael, Most Attitude", ...lands("Forest", 2), ...lands("Mountain", 2)],
          hand: ["Llanowar Elves", "Llanowar Elves"],
          library: ["Shock", "Shock", "Island"],
        },
      });
      const yes: Answer = (req) => (req.intent === "may" ? [1] : undefined);
      s = settle(cast(s, "p1", "Llanowar Elves"), yes);
      s = settle(cast(s, "p1", "Llanowar Elves"), yes);
      expect(s.exile.map((id) => nameOf(s, id))).toEqual(["Shock", "Shock"]);
      const [first, second] = s.exile as [string, string];
      s = settle(attack(s, [idOf(s, "p1", "battlefield", "Raphael, Most Attitude")]));
      expect(canCast(s, "p1", first) && canCast(s, "p1", second)).toBe(true);
      s = settle(act(s, "p1", { type: "cast", card: first, targets: { t: ["p2"] } }));
      expect(s.players.p2?.life).toBe(18);
      expect(canCast(s, "p1", second)).toBe(false);
    });

    it("Raphael, Most Attitude : l'exil est facultatif", () => {
      let s = scenario({
        p1: { battlefield: ["Raphael, Most Attitude", "Forest"], hand: ["Llanowar Elves"], library: ["Shock", "Island"] },
      });
      s = settle(cast(s, "p1", "Llanowar Elves"), (req) => (req.intent === "may" ? [0] : undefined));
      expect(s.exile).toHaveLength(0);
      expect(s.players.p1?.library).toHaveLength(2);
    });

    it("Raphael, Ninja Destroyer : doit être bloqué ; Rage — autant de {R}, gardé jusqu'à la fin du tour", () => {
      let s = scenario({ p1: { battlefield: ["Raphael, Ninja Destroyer", "Mountain"], hand: ["Shock"] } });
      const raph = idOf(s, "p1", "battlefield", "Raphael, Ninja Destroyer");
      expect(chars(s, raph).keywords).toContain("mustBeBlocked");
      s = settle(cast(s, "p1", "Shock", { targets: { t: [raph] } }));
      expect(s.players.p1?.manaPool.R).toBe(2);
      // Le mana reste d'une étape à l'autre…
      s = advanceUntil(s, (x) => x.turn.step === "main2");
      expect(s.players.p1?.manaPool.R).toBe(2);
      // … mais pas au-delà du tour.
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
      expect(s.players.p1?.manaPool.R).toBe(0);
    });

    it("Raphael, the Nightwatcher : vos créatures attaquantes ont la double initiative", () => {
      let s = scenario({
        p1: { battlefield: ["Raphael, the Nightwatcher", "Bear Cub"] },
        p2: { battlefield: ["Llanowar Elves"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const raph = idOf(s, "p1", "battlefield", "Raphael, the Nightwatcher");
      expect(chars(s, bear).keywords).not.toContain("doubleStrike");
      s = settle(attack(s, [bear]));
      expect(chars(s, bear).keywords).toContain("doubleStrike");
      // Raphael n'attaque pas : il ne l'a pas.
      expect(chars(s, raph).keywords).not.toContain("doubleStrike");
      // Les créatures adverses non plus.
      expect(chars(s, idOf(s, "p2", "battlefield", "Llanowar Elves")).keywords).not.toContain("doubleStrike");
      s = advanceUntil(s, (x) => x.turn.step === "end");
      expect(s.players.p2?.life).toBe(16);
    });

    it("Raphael, Tough Turtle : Alliance — 1 blessure à un adversaire ciblé", () => {
      let s = scenario({ p1: { battlefield: ["Raphael, Tough Turtle", "Forest"], hand: ["Llanowar Elves"] } });
      s = settle(cast(s, "p1", "Llanowar Elves"));
      expect(s.players.p2?.life).toBe(19);
      expect(s.players.p1?.life).toBe(20);
    });

    it("Raphael's Technique : chaque joueur peut défausser sa main et piocher sept cartes", () => {
      let s = scenario({
        p1: { battlefield: lands("Mountain", 6), hand: ["Raphael's Technique", "Opt"], library: lands("Island", 10) },
        p2: { hand: ["Opt", "Opt"], library: lands("Swamp", 10) },
      });
      s = settle(cast(s, "p1", "Raphael's Technique"), (req, _player, cur) =>
        req.intent === "may" ? [cur.pending?.kind === "choice" && cur.pending.player === "p1" ? 1 : 0] : undefined,
      );
      expect(namesIn(s, s.players.p1?.hand)).toEqual(lands("Island", 7));
      expect(namesIn(s, s.players.p1?.graveyard).sort()).toEqual(["Opt", "Raphael's Technique"]);
      // p2 a refusé.
      expect(namesIn(s, s.players.p2?.hand)).toEqual(["Opt", "Opt"]);
    });

    describe("Ravenous Robots", () => {
      it("chaque sort d'artefact que vous lancez crée un Robot 1/1 ; pas les autres sorts", () => {
        let s = scenario({ p1: { battlefield: ["Ravenous Robots", ...lands("Mountain", 2)], hand: ["Fishing Pole", "Shock"] } });
        s = settle(cast(s, "p1", "Fishing Pole"));
        expect(idsOf(s, "p1", "battlefield", "Robot")).toHaveLength(1);
        s = settle(cast(s, "p1", "Shock", { targets: { t: ["p2"] } }));
        expect(idsOf(s, "p1", "battlefield", "Robot")).toHaveLength(1);
      });

      it("{R}, {T} : vos jetons de créature gagnent la célérité", () => {
        let s = scenario({ p1: { battlefield: ["Ravenous Robots", ...lands("Mountain", 2)], hand: ["Fishing Pole"] } });
        s = settle(cast(s, "p1", "Fishing Pole"));
        const robots = idOf(s, "p1", "battlefield", "Ravenous Robots");
        const token = idOf(s, "p1", "battlefield", "Robot");
        expect(chars(s, token).keywords).not.toContain("haste");
        s = settle(activate(s, "p1", robots));
        expect(s.objects[robots]?.tapped).toBe(true);
        expect(chars(s, token).keywords).toContain("haste");
        expect(chars(s, robots).keywords).not.toContain("haste");
      });
    });

    it("Rock Soldiers : en arrivant, détruit jusqu'à un artefact non-créature ciblé", () => {
      let s = scenario({
        p1: { battlefield: lands("Mountain", 4), hand: ["Rock Soldiers"] },
        p2: { battlefield: ["Fishing Pole", "Ravenous Robots"] },
      });
      const pole = idOf(s, "p2", "battlefield", "Fishing Pole");
      const robots = idOf(s, "p2", "battlefield", "Ravenous Robots");
      let options: string[] = [];
      s = settle(cast(s, "p1", "Rock Soldiers"), (req) => {
        if (req.type !== "pick" || !req.options.includes(pole)) return undefined;
        options = req.options;
        return [pole];
      });
      expect(options).not.toContain(robots);
      expect(idsOf(s, "p2", "graveyard", "Fishing Pole")).toHaveLength(1);
      expect(idsOf(s, "p2", "battlefield", "Ravenous Robots")).toHaveLength(1);
    });

    it("Slash, Reptile Rampager : Alliance — 2 blessures à chaque adversaire ; en attaquant, un Mutant 2/2", () => {
      let s = scenario({ players: 3, p1: { battlefield: ["Slash, Reptile Rampager", "Forest"], hand: ["Llanowar Elves"] } });
      s = settle(cast(s, "p1", "Llanowar Elves"));
      expect([s.players.p1?.life, s.players.p2?.life, s.players.p3?.life]).toEqual([20, 18, 18]);
      s = settle(attack(s, [idOf(s, "p1", "battlefield", "Slash, Reptile Rampager")]));
      const mutant = idOf(s, "p1", "battlefield", "Mutant");
      expect(pt(s, mutant)).toEqual([2, 2]);
      // Le jeton n'attaque pas.
      expect(s.combat?.attackers.map((a) => a.id)).not.toContain(mutant);
    });

    it("Spicy Oatmeal Pizza : 4 blessures à n'importe quelle cible et 3 à vous ; {2}, {T}, sacrifice : 3 PV", () => {
      let s = scenario({ p1: { battlefield: lands("Mountain", 5), hand: ["Spicy Oatmeal Pizza"] } });
      s = settle(cast(s, "p1", "Spicy Oatmeal Pizza"), pickId("p2"));
      expect(s.players.p2?.life).toBe(16);
      expect(s.players.p1?.life).toBe(17);
      const pizza = idOf(s, "p1", "battlefield", "Spicy Oatmeal Pizza");
      expect(chars(s, pizza).subtypes).toContain("Food");
      s = settle(activate(s, "p1", pizza));
      expect(s.players.p1?.life).toBe(20);
      expect(idsOf(s, "p1", "graveyard", "Spicy Oatmeal Pizza")).toHaveLength(1);
    });

    it("Wingnut, Bat on the Belfry : Alliance — le vol, la menace ou la célérité au choix ; les autres attaquants gagnent +1/+0", () => {
      let s = scenario({ p1: { battlefield: ["Wingnut, Bat on the Belfry", "Bear Cub", "Forest"], hand: ["Llanowar Elves"] } });
      const wingnut = idOf(s, "p1", "battlefield", "Wingnut, Bat on the Belfry");
      s = settle(cast(s, "p1", "Llanowar Elves"), triggerMode(0));
      expect(chars(s, wingnut).keywords).toContain("flying");
      expect(chars(s, wingnut).keywords).not.toContain("menace");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(attack(s, [wingnut, bear]));
      expect(pt(s, bear)).toEqual([3, 2]);
      expect(pt(s, wingnut)).toEqual([1, 2]);
      // Les Elfes, arrivés ce tour-ci, n'attaquent pas : pas de bonus.
      expect(pt(s, idOf(s, "p1", "battlefield", "Llanowar Elves"))).toEqual([1, 1]);
    });

    it("Wingnut : l'autre mode choisi (la célérité)", () => {
      let s = scenario({ p1: { battlefield: ["Wingnut, Bat on the Belfry", "Forest"], hand: ["Llanowar Elves"] } });
      const wingnut = idOf(s, "p1", "battlefield", "Wingnut, Bat on the Belfry");
      s = settle(cast(s, "p1", "Llanowar Elves"), triggerMode(2));
      expect(chars(s, wingnut).keywords).toContain("haste");
      expect(chars(s, wingnut).keywords).not.toContain("flying");
    });

    describe("Zog, Triceraton Castaway", () => {
      it("portée, piétinement ; en arrivant, une créature ciblée ne peut pas bloquer ce tour-ci", () => {
        let s = scenario({
          p1: { battlefield: lands("Mountain", 5), hand: ["Zog, Triceraton Castaway"] },
          p2: { battlefield: ["Serra Angel"] },
        });
        const angel = idOf(s, "p2", "battlefield", "Serra Angel");
        s = settle(cast(s, "p1", "Zog, Triceraton Castaway"), pickId(angel));
        expect(chars(s, angel).keywords).toContain("cantBlock");
        const zog = idOf(s, "p1", "battlefield", "Zog, Triceraton Castaway");
        expect(chars(s, zog).keywords).toEqual(expect.arrayContaining(["reach", "trample"]));
        s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
        expect(chars(s, angel).keywords).not.toContain("cantBlock");
      });

      it("cycle de Montagne {2} : une carte de Montagne de la bibliothèque en main", () => {
        let s = scenario({
          p1: {
            battlefield: lands("Mountain", 2),
            hand: ["Zog, Triceraton Castaway"],
            library: ["Island", "Mountain", "Forest"],
          },
        });
        const zog = idOf(s, "p1", "hand", "Zog, Triceraton Castaway");
        s = settle(activate(s, "p1", zog), (req, _player, cur) =>
          req.type === "pick" ? req.options.filter((id) => nameOf(cur, id) === "Mountain").slice(0, 1) : undefined,
        );
        expect(namesIn(s, s.players.p1?.hand)).toEqual(["Mountain"]);
        expect(idsOf(s, "p1", "graveyard", "Zog, Triceraton Castaway")).toHaveLength(1);
      });
    });
  });
});

describe("lot A, vert", () => {
  type S = GameState;
  /** Choisit, parmi les options d'un choix, les objets voulus ; répond « oui » aux questions. */
  const picking =
    (want: string[]): Answer =>
    (req) => {
      if (req.type === "yesNo") return [1];
      if (req.type !== "pick") return undefined;
      const picked = want.filter((w) => req.options.includes(w));
      return picked.length > 0 ? picked : undefined;
    };
  /** Répond « oui » à toutes les questions. */
  const yes: Answer = (req) => (req.type === "yesNo" ? [1] : undefined);
  /** Répond « non » à toutes les questions et ne choisit rien de facultatif. */
  const no: Answer = (req) => (req.type === "yesNo" ? [0] : req.type === "pick" && req.min === 0 ? [] : undefined);
  /** Active la capacité de `source` dont le libellé contient `label` (la première sinon). */
  const activate = (s: S, player: string, source: string, label?: string, extra: object = {}) => {
    const a = legalActions(s, player).find(
      (x) => x.type === "activate" && x.source === source && (!label || x.label?.includes(label)),
    );
    if (a?.type !== "activate") throw new Error(`capacité introuvable : ${label ?? source}`);
    return act(s, player, { type: "activate", source, ability: a.ability, ...extra });
  };
  const tapFor = (s: S, player: string, source: string, color: ManaType) => {
    const a = legalActions(s, player).find((x) => x.type === "tapForMana" && x.source === source && x.colors.includes(color));
    if (a?.type !== "tapForMana") throw new Error(`${nameOf(s, source)} ne produit pas ${color}`);
    return act(s, player, { type: "tapForMana", source, ability: a.ability, color });
  };
  /** Va jusqu'à la déclaration des bloqueurs de p2. */
  const toBlockers = (s: S) => advanceUntil(s, (x) => x.pending?.kind === "declareBlockers");
  /** Joue jusqu'au tour suivant (étape de fin comprise). */
  const toNextTurn = (s: S) => advanceUntil(s, (x) => x.turn.number > s.turn.number);
  const pt = (s: S, id: string) => [chars(s, id).power, chars(s, id).toughness];
  const plusOnes = (s: S, id: string) => s.objects[id]?.counters["+1/+1"] ?? 0;

  describe("Teenage Mutant Ninja Turtles, lot A — vert", () => {
    describe("Courier of Comestibles", () => {
      it("en arrivant : cherche une carte de Nourriture et la met en main, sans créer de jeton", () => {
        let s = scenario({
          p1: { battlefield: lands("Forest", 2), hand: ["Courier of Comestibles"], library: ["Opt", "Guac & Marshmallow Pizza"] },
        });
        let offered: (string | undefined)[] = [];
        s = settle(cast(s, "p1", "Courier of Comestibles"), (req, _player, cur) => {
          if (req.type === "yesNo") return [1];
          if (req.type === "pick") offered = namesIn(cur, req.options);
          return undefined;
        });
        expect(offered).toEqual(["Guac & Marshmallow Pizza"]);
        expect(idsOf(s, "p1", "hand", "Guac & Marshmallow Pizza")).toHaveLength(1);
        expect(idsOf(s, "p1", "battlefield", "Food")).toHaveLength(0);
      });

      it("sans carte mise en main (refus ou aucune Nourriture) : crée un jeton Nourriture", () => {
        for (const [library, answer] of [
          [["Opt", "Guac & Marshmallow Pizza"], no],
          [["Opt", "Island"], yes],
        ] as const) {
          let s = scenario({ p1: { battlefield: lands("Forest", 2), hand: ["Courier of Comestibles"], library: [...library] } });
          s = settle(cast(s, "p1", "Courier of Comestibles"), answer);
          expect(idsOf(s, "p1", "battlefield", "Food")).toHaveLength(1);
          expect(idsOf(s, "p1", "hand", "Guac & Marshmallow Pizza")).toHaveLength(0);
        }
      });
    });

    it("Cowabunga! : un Mutant, Ninja, Tortue ou terrain parmi les quatre du dessus ; le reste au-dessous", () => {
      let s = scenario({
        p1: {
          battlefield: ["Forest"],
          hand: ["Cowabunga!"],
          library: ["Opt", "Michelangelo, Game Master", "Bear Cub", "Island", "Swamp", "Plains"],
        },
      });
      let offered: (string | undefined)[] = [];
      s = settle(cast(s, "p1", "Cowabunga!"), (req, _player, cur) => {
        if (req.type !== "pick") return undefined;
        offered = namesIn(cur, req.options);
        return req.options.filter((id) => nameOf(cur, id) === "Michelangelo, Game Master");
      });
      expect(offered.sort()).toEqual(["Island", "Michelangelo, Game Master"]);
      expect(idsOf(s, "p1", "hand", "Michelangelo, Game Master")).toHaveLength(1);
      const library = namesIn(s, s.players.p1?.library);
      expect(library.slice(0, 2)).toEqual(["Swamp", "Plains"]);
      expect(library.slice(2).sort()).toEqual(["Bear Cub", "Island", "Opt"]);
    });

    it("Frog Butler : contact mortel ; {T} : un mana de n'importe quelle couleur ; {2} : portée", () => {
      let s = scenario({ p1: { battlefield: ["Frog Butler", ...lands("Forest", 2)] } });
      const frog = idOf(s, "p1", "battlefield", "Frog Butler");
      expect(chars(s, frog).keywords).toContain("deathtouch");
      expect(chars(s, frog).keywords).not.toContain("reach");
      s = settle(activate(s, "p1", frog, "portée"));
      expect(chars(s, frog).keywords).toContain("reach");
      s = tapFor(s, "p1", frog, "U");
      expect(s.players.p1?.manaPool.U).toBe(1);
    });

    it("Groundchuck & Dirtbag : chaque terrain engagé pour du mana ajoute {G} de plus, pas une créature", () => {
      let s = scenario({ p1: { battlefield: ["Groundchuck & Dirtbag", "Island", "Llanowar Elves"] } });
      expect(chars(s, idOf(s, "p1", "battlefield", "Groundchuck & Dirtbag")).keywords).toContain("trample");
      s = tapFor(s, "p1", idOf(s, "p1", "battlefield", "Island"), "U");
      expect([s.players.p1?.manaPool.U, s.players.p1?.manaPool.G]).toEqual([1, 1]);
      s = tapFor(s, "p1", idOf(s, "p1", "battlefield", "Llanowar Elves"), "G");
      expect(s.players.p1?.manaPool.G).toBe(2);
    });

    it("Guac & Marshmallow Pizza : +2/+2 et dégage la créature ciblée ; {2}, {T}, sacrifice : 3 PV", () => {
      let s = scenario({
        p1: { battlefield: [{ name: "Bear Cub", tapped: true }, ...lands("Forest", 3)], hand: ["Guac & Marshmallow Pizza"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Guac & Marshmallow Pizza"), picking([bear]));
      expect(pt(s, bear)).toEqual([4, 4]);
      expect(s.objects[bear]?.tapped).toBe(false);
      const pizza = idOf(s, "p1", "battlefield", "Guac & Marshmallow Pizza");
      expect(chars(s, pizza).subtypes).toContain("Food");
      // Il ne reste que deux Forêts : la capacité de Nourriture.
      s = settle(activate(s, "p1", pizza, "PV"));
      expect(s.players.p1?.life).toBe(23);
      expect(idsOf(s, "p1", "graveyard", "Guac & Marshmallow Pizza")).toHaveLength(1);
    });

    describe("Michelangelo, Game Master", () => {
      it("Disparition : un permanent a quitté le champ de bataille ce tour-ci, un marqueur +1/+1 à votre étape de fin", () => {
        let s = scenario({
          p1: { battlefield: ["Michelangelo, Game Master", "Guac & Marshmallow Pizza", ...lands("Forest", 2)] },
        });
        const mikey = idOf(s, "p1", "battlefield", "Michelangelo, Game Master");
        s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Guac & Marshmallow Pizza"), "PV"));
        s = toNextTurn(s);
        expect(plusOnes(s, mikey)).toBe(1);
        expect(pt(s, mikey)).toEqual([4, 4]);
      });

      it("sans permanent parti, aucun marqueur", () => {
        let s = scenario({ p1: { battlefield: ["Michelangelo, Game Master"] } });
        const mikey = idOf(s, "p1", "battlefield", "Michelangelo, Game Master");
        s = toNextTurn(s);
        expect(plusOnes(s, mikey)).toBe(0);
      });
    });

    it("Michelangelo, Improviser : blessures de combat à un joueur, une créature et un terrain de la main en jeu", () => {
      let s = scenario({
        p1: { battlefield: ["Michelangelo, Improviser"], hand: ["Bear Cub", "Forest", "Island", "Opt"] },
      });
      const mikey = idOf(s, "p1", "battlefield", "Michelangelo, Improviser");
      const bear = idOf(s, "p1", "hand", "Bear Cub");
      const island = idOf(s, "p1", "hand", "Island");
      let offered: (string | undefined)[][] = [];
      s = throughCombat(attack(s, [mikey]), (req, _player, cur) => {
        if (req.type !== "pick") return undefined;
        offered = [...offered, namesIn(cur, req.options).sort()];
        return req.options.filter((id) => id === bear || id === island);
      });
      expect(s.players.p2?.life).toBe(16);
      expect(offered).toEqual([["Bear Cub"], ["Forest", "Island"]]);
      expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Island")).toHaveLength(1);
      expect(namesIn(s, s.players.p1?.hand).sort()).toEqual(["Forest", "Opt"]);
    });

    describe("Michelangelo, Mutant BFF", () => {
      it("crée un Mutagène en arrivant et en attaquant", () => {
        let s = scenario({ p1: { battlefield: lands("Forest", 4), hand: ["Michelangelo, Mutant BFF"] } });
        s = settle(cast(s, "p1", "Michelangelo, Mutant BFF"));
        expect(idsOf(s, "p1", "battlefield", "Mutagen")).toHaveLength(1);
        let t = scenario({ p1: { battlefield: ["Michelangelo, Mutant BFF"] } });
        t = throughCombat(attack(t, [idOf(t, "p1", "battlefield", "Michelangelo, Mutant BFF")]));
        expect(idsOf(t, "p1", "battlefield", "Mutagen")).toHaveLength(1);
      });

      it("vos créatures avec un marqueur ne peuvent pas être bloquées par plus d'une créature", () => {
        let s = scenario({
          p1: { battlefield: ["Michelangelo, Mutant BFF", { name: "Bear Cub", counters: { "+1/+1": 1 } }, "Llanowar Elves"] },
          p2: { battlefield: ["Serra Angel", "Shivan Dragon"] },
        });
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        const elves = idOf(s, "p1", "battlefield", "Llanowar Elves");
        const angel = idOf(s, "p2", "battlefield", "Serra Angel");
        const dragon = idOf(s, "p2", "battlefield", "Shivan Dragon");
        s = toBlockers(attack(s, [bear, elves]));
        const double = (target: string) => ({
          type: "declareBlockers" as const,
          blocks: [
            { blocker: angel, attacker: target },
            { blocker: dragon, attacker: target },
          ],
        });
        expect(() => act(s, "p2", double(bear))).toThrow();
        // Les Elfes, sans marqueur, peuvent être bloqués par deux créatures.
        expect(() => act(s, "p2", double(elves))).not.toThrow();
      });
    });

    it("Michelangelo, Weirdness to 11 : un Mutagène ; les marqueurs +1/+1 sur vos créatures sont augmentés d'un", () => {
      let s = scenario({
        p1: { battlefield: lands("Forest", 3), hand: ["Michelangelo, Weirdness to 11"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      s = settle(cast(s, "p1", "Michelangelo, Weirdness to 11"));
      const mikey = idOf(s, "p1", "battlefield", "Michelangelo, Weirdness to 11");
      const mutagen = idOf(s, "p1", "battlefield", "Mutagen");
      s = settle(activate(s, "p1", mutagen, undefined, { targets: { t: [mikey] } }));
      expect(plusOnes(s, mikey)).toBe(2);
      expect(pt(s, mikey)).toEqual([3, 3]);
      // Un Mutagène sur une créature adverse : un seul marqueur.
      let t = scenario({
        p1: { battlefield: ["Michelangelo, Weirdness to 11", ...lands("Forest", 4)], hand: ["Mutant Chain Reaction"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      t = settle(cast(t, "p1", "Mutant Chain Reaction", { targets: { t: [] } }));
      const bear = idOf(t, "p2", "battlefield", "Bear Cub");
      t = settle(activate(t, "p1", idOf(t, "p1", "battlefield", "Mutagen"), undefined, { targets: { t: [bear] } }));
      expect(plusOnes(t, bear)).toBe(1);
    });

    it("Mona Lisa, Science Geek : portée ; {T} : X mana d'une même couleur, X étant sa force", () => {
      let s = scenario({ p1: { battlefield: [{ name: "Mona Lisa, Science Geek", counters: { "+1/+1": 2 } }] } });
      const mona = idOf(s, "p1", "battlefield", "Mona Lisa, Science Geek");
      expect(chars(s, mona).keywords).toContain("reach");
      s = tapFor(s, "p1", mona, "R");
      expect(s.players.p1?.manaPool.R).toBe(3);
    });

    describe("Mutant Chain Reaction", () => {
      it("détruit une créature avec le vol et crée un Mutagène ; une créature sans vol n'est pas une cible", () => {
        let s = scenario({
          p1: { battlefield: lands("Forest", 3), hand: ["Mutant Chain Reaction"] },
          p2: { battlefield: ["Serra Angel", "Bear Cub"] },
        });
        const bear = idOf(s, "p2", "battlefield", "Bear Cub");
        expect(() => cast(s, "p1", "Mutant Chain Reaction", { targets: { t: [bear] } })).toThrow();
        s = settle(cast(s, "p1", "Mutant Chain Reaction", { targets: { t: [idOf(s, "p2", "battlefield", "Serra Angel")] } }));
        expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
        expect(idsOf(s, "p1", "battlefield", "Mutagen")).toHaveLength(1);
      });

      it("détruit un artefact ; sans cible, crée quand même un Mutagène", () => {
        let s = scenario({
          p1: { battlefield: lands("Forest", 3), hand: ["Mutant Chain Reaction"] },
          p2: { battlefield: ["Fishing Pole"] },
        });
        s = settle(cast(s, "p1", "Mutant Chain Reaction", { targets: { t: [idOf(s, "p2", "battlefield", "Fishing Pole")] } }));
        expect(idsOf(s, "p2", "graveyard", "Fishing Pole")).toHaveLength(1);
        let t = scenario({ p1: { battlefield: lands("Forest", 3), hand: ["Mutant Chain Reaction"] } });
        t = settle(cast(t, "p1", "Mutant Chain Reaction", { targets: { t: [] } }));
        expect(idsOf(t, "p1", "battlefield", "Mutagen")).toHaveLength(1);
      });
    });

    it("New Generation's Technique : jusqu'à deux cartes de terrain de base arrivent engagées", () => {
      let s = scenario({
        p1: {
          battlefield: lands("Forest", 4),
          hand: ["New Generation's Technique"],
          library: ["Bear Cub", "Island", "Plains", "Opt"],
        },
      });
      let offered: (string | undefined)[] = [];
      s = settle(cast(s, "p1", "New Generation's Technique"), (req, _player, cur) => {
        if (req.type === "pick") offered = namesIn(cur, req.options).sort();
        return undefined;
      });
      expect(offered).toEqual(["Island", "Plains"]);
      const found = [idOf(s, "p1", "battlefield", "Island"), idOf(s, "p1", "battlefield", "Plains")];
      expect(found.every((id) => s.objects[id]?.tapped)).toBe(true);
      expect(namesIn(s, s.players.p1?.library).sort()).toEqual(["Bear Cub", "Opt"]);
    });

    it("Novel Nunchaku : s'attache à votre créature, qui se bat contre une créature adverse ; +1/+1 et piétinement", () => {
      let s = scenario({
        p1: { battlefield: ["Bear Cub", ...lands("Forest", 3)], hand: ["Novel Nunchaku"] },
        p2: { battlefield: ["Serra Angel", "Llanowar Elves"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const elves = idOf(s, "p2", "battlefield", "Llanowar Elves");
      s = settle(cast(s, "p1", "Novel Nunchaku"), picking([bear, elves]));
      const nunchaku = idOf(s, "p1", "battlefield", "Novel Nunchaku");
      expect(s.objects[nunchaku]?.attachedTo).toBe(bear);
      expect(pt(s, bear)).toEqual([3, 3]);
      expect(chars(s, bear).keywords).toContain("trample");
      expect(idsOf(s, "p2", "graveyard", "Llanowar Elves")).toHaveLength(1);
      expect(s.objects[bear]?.damage).toBe(1);
    });

    describe("Party Dude", () => {
      it("niveau 1 : chaque joueur crée une Nourriture ; niveau 2 : un artefact adverse au cimetière, piochez", () => {
        let s = scenario({
          p1: { battlefield: lands("Forest", 6), hand: ["Party Dude", "Mutant Chain Reaction"] },
        });
        s = settle(cast(s, "p1", "Party Dude"));
        expect(idsOf(s, "p1", "battlefield", "Food")).toHaveLength(1);
        expect(idsOf(s, "p2", "battlefield", "Food")).toHaveLength(1);
        const dude = idOf(s, "p1", "battlefield", "Party Dude");
        expect(s.objects[dude]).toBeDefined();
        // Niveau 1 seulement : détruire la Nourriture adverse ne fait pas piocher.
        const hand = s.players.p1?.hand.length ?? 0;
        s = settle(cast(s, "p1", "Mutant Chain Reaction", { targets: { t: [idOf(s, "p2", "battlefield", "Food")] } }));
        expect(idsOf(s, "p2", "battlefield", "Food")).toHaveLength(0);
        expect(s.players.p1?.hand.length).toBe(hand - 1);
      });

      it("niveau 2 : un artefact adverse détruit fait piocher, pas le vôtre", () => {
        let s = scenario({
          p1: { battlefield: ["Party Dude", ...lands("Forest", 8)], hand: ["Mutant Chain Reaction", "Mutant Chain Reaction"] },
          p2: { battlefield: ["Fishing Pole"] },
        });
        const dude = idOf(s, "p1", "battlefield", "Party Dude");
        s = settle(activate(s, "p1", dude));
        const hand = s.players.p1?.hand.length ?? 0;
        s = settle(cast(s, "p1", "Mutant Chain Reaction", { targets: { t: [idOf(s, "p2", "battlefield", "Fishing Pole")] } }));
        expect(s.players.p1?.hand.length).toBe(hand); // le sort quitte la main, une carte piochée
        // Votre propre artefact (le Mutagène) détruit : rien.
        s = settle(cast(s, "p1", "Mutant Chain Reaction", { targets: { t: [idOf(s, "p1", "battlefield", "Mutagen")] } }));
        expect(s.players.p1?.hand.length).toBe(hand - 1);
      });

      it("niveau 3 : en attaquant, une créature attaquante gagne +X/+X (cartes en main)", () => {
        let s = scenario({
          p1: { battlefield: ["Party Dude", "Bear Cub", ...lands("Forest", 7)], hand: ["Opt", "Opt", "Island"] },
        });
        const dude = idOf(s, "p1", "battlefield", "Party Dude");
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        s = settle(activate(s, "p1", dude));
        s = settle(activate(s, "p1", dude));
        s = throughCombat(attack(s, [bear]), picking([bear]));
        expect(s.players.p2?.life).toBe(15);
        expect(pt(s, bear)).toEqual([5, 5]);
      });
    });

    it("Primordial Pachyderm : portée, piétinement ; en arrivant, vous gagnez 2 PV", () => {
      let s = scenario({ p1: { battlefield: lands("Forest", 4), hand: ["Primordial Pachyderm"] } });
      s = settle(cast(s, "p1", "Primordial Pachyderm"));
      const pach = idOf(s, "p1", "battlefield", "Primordial Pachyderm");
      expect(chars(s, pach).keywords).toEqual(expect.arrayContaining(["reach", "trample"]));
      expect(s.players.p1?.life).toBe(22);
    });

    it("Ragamuffin Raptor : renvoie une carte de créature ou de Nourriture de votre cimetière en main", () => {
      let s = scenario({
        p1: { battlefield: lands("Forest", 5), hand: ["Ragamuffin Raptor"], graveyard: ["Opt", "Guac & Marshmallow Pizza"] },
      });
      let offered: (string | undefined)[] = [];
      s = settle(cast(s, "p1", "Ragamuffin Raptor"), (req, _player, cur) => {
        if (req.type !== "pick") return undefined;
        offered = namesIn(cur, req.options);
        return req.options.filter((id) => nameOf(cur, id) === "Guac & Marshmallow Pizza");
      });
      expect(offered).toEqual(["Guac & Marshmallow Pizza"]);
      expect(idsOf(s, "p1", "hand", "Guac & Marshmallow Pizza")).toHaveLength(1);
      expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(1);
    });

    it("Rocksteady, Crash Courser : lui et vos Sangliers ne peuvent pas être bloqués par plus d'une créature", () => {
      let s = scenario({
        p1: { battlefield: ["Rocksteady, Crash Courser", "Zoo Escapees", "Bear Cub"] },
        p2: { battlefield: ["Serra Angel", "Shivan Dragon"] },
      });
      const rock = idOf(s, "p1", "battlefield", "Rocksteady, Crash Courser");
      const zoo = idOf(s, "p1", "battlefield", "Zoo Escapees");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const blockers = [idOf(s, "p2", "battlefield", "Serra Angel"), idOf(s, "p2", "battlefield", "Shivan Dragon")];
      s = toBlockers(attack(s, [rock, zoo, bear]));
      const double = (target: string) => ({
        type: "declareBlockers" as const,
        blocks: blockers.map((blocker) => ({ blocker, attacker: target })),
      });
      expect(() => act(s, "p2", double(rock))).toThrow();
      expect(() => act(s, "p2", double(zoo))).toThrow();
      expect(() => act(s, "p2", double(bear))).not.toThrow();
    });

    describe("Saved by the Shell", () => {
      it("coûte {1} de moins avec une Tortue ; un marqueur +1/+1, piétinement, défense talismanique, indestructible", () => {
        let s = scenario({ p1: { battlefield: ["Michelangelo, Game Master", "Forest"], hand: ["Saved by the Shell"] } });
        const mikey = idOf(s, "p1", "battlefield", "Michelangelo, Game Master");
        s = settle(cast(s, "p1", "Saved by the Shell", { targets: { t: [mikey] } }));
        expect(plusOnes(s, mikey)).toBe(1);
        expect(chars(s, mikey).keywords).toEqual(expect.arrayContaining(["trample", "hexproof", "indestructible"]));
      });

      it("sans Tortue, une seule Forêt ne suffit pas", () => {
        const s = scenario({ p1: { battlefield: ["Bear Cub", "Forest"], hand: ["Saved by the Shell"] } });
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        expect(() => cast(s, "p1", "Saved by the Shell", { targets: { t: [bear] } })).toThrow();
      });
    });

    it("Tenderize : votre créature inflige autant de blessures que sa force à une créature adverse", () => {
      let s = scenario({
        p1: { battlefield: ["Serra Angel", ...lands("Forest", 2)], hand: ["Tenderize"] },
        p2: { battlefield: ["Shivan Dragon"] },
      });
      const angel = idOf(s, "p1", "battlefield", "Serra Angel");
      const dragon = idOf(s, "p2", "battlefield", "Shivan Dragon");
      s = settle(cast(s, "p1", "Tenderize", { targets: { a: [angel], b: [dragon] } }));
      expect(s.objects[dragon]?.damage).toBe(4);
      expect(s.objects[angel]?.damage ?? 0).toBe(0);
    });

    it("Transdimensional Bovine : vol ; {T} : deux mana d'une même couleur", () => {
      let s = scenario({ p1: { battlefield: ["Transdimensional Bovine"] } });
      const ox = idOf(s, "p1", "battlefield", "Transdimensional Bovine");
      expect(chars(s, ox).keywords).toContain("flying");
      s = tapFor(s, "p1", ox, "B");
      expect(s.players.p1?.manaPool.B).toBe(2);
    });

    it("Turtle Power! : vos Tortues gagnent +2/+2, pas les autres créatures", () => {
      let s = scenario({
        p1: { battlefield: ["Michelangelo, Game Master", "Bear Cub", ...lands("Forest", 3)], hand: ["Turtle Power!"] },
        p2: { battlefield: ["Michelangelo, Mutant BFF"] },
      });
      s = settle(cast(s, "p1", "Turtle Power!"));
      expect(pt(s, idOf(s, "p1", "battlefield", "Michelangelo, Game Master"))).toEqual([5, 5]);
      expect(pt(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toEqual([2, 2]);
      expect(pt(s, idOf(s, "p2", "battlefield", "Michelangelo, Mutant BFF"))).toEqual([4, 4]);
    });

    describe("Venus, Torn Between Worlds", () => {
      it("chaque fois qu'elle subit des blessures, autant de marqueurs +1/+1", () => {
        let s = scenario({
          p1: { battlefield: ["Venus, Torn Between Worlds"] },
          p2: { battlefield: ["Serra Angel"] },
        });
        const venus = idOf(s, "p1", "battlefield", "Venus, Torn Between Worlds");
        // Bloquée par l'Ange (4/4) : 4 blessures, 4 marqueurs, et Venus survit.
        s = toBlockers(attack(s, [venus]));
        s = act(s, "p2", {
          type: "declareBlockers",
          blocks: [{ blocker: idOf(s, "p2", "battlefield", "Serra Angel"), attacker: venus }],
        });
        s = throughCombat(s);
        expect(plusOnes(s, venus)).toBe(4);
        expect(pt(s, venus)).toEqual([9, 9]);
        expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
      });

      it("une de vos créatures avec un marqueur blesse un joueur : vous pouvez payer {U} pour piocher", () => {
        const setup = () =>
          scenario({
            p1: {
              battlefield: [
                "Venus, Torn Between Worlds",
                { name: "Bear Cub", counters: { "+1/+1": 1 } },
                "Llanowar Elves",
                "Island",
              ],
              library: ["Opt", "Opt", "Opt"],
            },
          });
        let s = setup();
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        const elves = idOf(s, "p1", "battlefield", "Llanowar Elves");
        let asked = 0;
        s = throughCombat(attack(s, [bear, elves]), (req) => {
          if (req.type !== "yesNo") return undefined;
          asked += 1;
          return [1];
        });
        // Seul l'Ourson (avec un marqueur) déclenche ; {U} payé, une carte piochée.
        expect(asked).toBe(1);
        expect(s.players.p1?.hand).toHaveLength(1);
        expect(s.objects[idOf(s, "p1", "battlefield", "Island")]?.tapped).toBe(true);
        let t = setup();
        t = throughCombat(attack(t, [idOf(t, "p1", "battlefield", "Bear Cub")]), no);
        expect(t.players.p1?.hand).toHaveLength(0);
      });
    });

    describe("West Wind Avatar", () => {
      it("en arrivant, sacrifier un terrain : 3 PV ; Disparition : piochez à votre étape de fin", () => {
        let s = scenario({ p1: { battlefield: lands("Forest", 7), hand: ["West Wind Avatar"], library: ["Opt", "Opt"] } });
        const forest = idOf(s, "p1", "battlefield", "Forest");
        s = settle(cast(s, "p1", "West Wind Avatar"), picking([forest]));
        expect(chars(s, idOf(s, "p1", "battlefield", "West Wind Avatar")).keywords).toContain("trample");
        expect(s.players.p1?.life).toBe(23);
        expect(idsOf(s, "p1", "graveyard", "Forest")).toHaveLength(1);
        s = advanceUntil(s, (x) => x.turn.step === "cleanup" || x.turn.number > 3);
        expect(namesIn(s, s.players.p1?.hand)).toEqual(["Opt"]);
      });

      it("en attaquant, sans sacrifice : ni PV ni pioche à l'étape de fin", () => {
        let s = scenario({ p1: { battlefield: ["West Wind Avatar", "Forest"] } });
        const avatar = idOf(s, "p1", "battlefield", "West Wind Avatar");
        s = throughCombat(attack(s, [avatar]), no);
        expect(s.players.p1?.life).toBe(20);
        expect(s.players.p2?.life).toBe(13);
        s = advanceUntil(s, (x) => x.turn.number > 3);
        expect(s.players.p1?.hand).toHaveLength(0);
      });
    });

    it("Zoo Escapees : quand elle quitte le champ de bataille, un Mutagène", () => {
      let s = scenario({
        p1: { battlefield: ["Zoo Escapees", "Serra Angel", ...lands("Forest", 2)], hand: ["Tenderize"] },
        p2: { battlefield: ["Zoo Escapees"] },
      });
      const zoo = idOf(s, "p2", "battlefield", "Zoo Escapees");
      s = settle(cast(s, "p1", "Tenderize", { targets: { a: [idOf(s, "p1", "battlefield", "Serra Angel")], b: [zoo] } }));
      expect(idsOf(s, "p2", "graveyard", "Zoo Escapees")).toHaveLength(1);
      expect(idsOf(s, "p2", "battlefield", "Mutagen")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Mutagen")).toHaveLength(0);
    });
  });
});

describe("lot A, multicolores", () => {
  type S = GameState;
  const exiled = (s: S) => s.exile.map((id) => nameOf(s, id));

  /** Joue jusqu'à `until` en passant, sans attaquer ni bloquer, en répondant aux choix (suggestion par défaut). */
  const run = (s: S, until: (x: S) => boolean, answer: Answer = () => undefined): S => {
    let cur = s;
    for (let i = 0; i < 600 && !until(cur); i++) {
      const p = cur.pending;
      if (p?.kind === "priority") cur = act(cur, p.player, { type: "pass" });
      else if (p?.kind === "choice")
        cur = act(cur, p.player, { type: "choose", values: answer(p.request, p.player, cur) ?? p.request.suggested });
      else if (p?.kind === "declareAttackers") cur = act(cur, p.player, { type: "declareAttackers", attackers: [] });
      else if (p?.kind === "declareBlockers") cur = act(cur, p.player, { type: "declareBlockers", blocks: [] });
      else break;
    }
    return cur;
  };
  const quiet = (x: S) => x.pending?.kind === "priority" && x.stack.length === 0 && x.triggers.length === 0;
  /** Résout la pile et les déclenchements en attente (au moins une passe). */
  const settle = (s: S, answer?: Answer): S => {
    let first = true;
    return run(
      s,
      (x) => {
        const done = !first && quiet(x);
        first = false;
        return done;
      },
      answer,
    );
  };
  /** Jusqu'à la seconde phase principale (sans attaquer ni bloquer). */
  const toMain2 = (s: S, answer?: Answer) => run(s, (x) => x.turn.step === "main2" && quiet(x), answer);
  /** Jusqu'à l'étape de fin de ce tour, déclenchements résolus. */
  const toEndStep = (s: S, answer?: Answer) => run(s, (x) => x.turn.step === "end" && quiet(x), answer);
  /** Jusqu'à la première phase principale du prochain tour de p1, déclenchements résolus. */
  const toNextTurn = (s: S, answer?: Answer) => {
    const from = s.turn.number;
    return run(s, (x) => x.turn.active === "p1" && x.turn.number > from && x.turn.step === "main1" && quiet(x), answer);
  };
  /** Active la capacité de `source` dont le libellé contient `label` (la première sinon). */
  const activate = (s: S, player: string, source: string, label?: string, extra: object = {}) => {
    const a = legalActions(s, player).find(
      (x) => x.type === "activate" && x.source === source && (!label || x.label?.includes(label)),
    );
    if (a?.type !== "activate") throw new Error(`capacité introuvable : ${label ?? source}`);
    return act(s, player, { type: "activate", source, ability: a.ability, ...extra });
  };
  /** Sélectionne dans les options d'un choix l'objet nommé `name`. */
  const pickNamed = (s: S, req: ChoiceRequest, name: string) =>
    req.type === "pick" ? req.options.filter((id) => nameOf(s, String(id)) === name).slice(0, 1) : undefined;
  /** Choisit `id` s'il est proposé. */
  const pickId = (req: ChoiceRequest, id: string) => (req.type === "pick" && req.options.includes(id) ? [id] : undefined);
  /** p1 inflige 3 blessures à sa propre créature avec Lightning Strike (Disparition). */
  const strikeOwn = (s: S, name: string) =>
    settle(cast(s, "p1", "Lightning Strike", { targets: { t: [idOf(s, "p1", "battlefield", name)] } }));

  describe("Teenage Mutant Ninja Turtles, lot A — multicolores", () => {
    it("Baxter Stockman : un Robot 1/1 en arrivant ; au début du combat, +3/+0, l'initiative et la vigilance à une créature-artefact", () => {
      let s = scenario({ p1: { battlefield: [...lands("Island", 4), "Mountain"], hand: ["Baxter Stockman"] } });
      s = settle(cast(s, "p1", "Baxter Stockman"));
      const robot = idOf(s, "p1", "battlefield", "Robot");
      expect(chars(s, robot).types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
      s = run(s, (x) => x.turn.step === "beginCombat" && quiet(x));
      // Baxter n'est pas un artefact : il ne reçoit rien.
      const baxter = idOf(s, "p1", "battlefield", "Baxter Stockman");
      expect([chars(s, baxter).power, chars(s, baxter).keywords]).toEqual([3, []]);
      const c = chars(s, robot);
      expect([c.power, c.toughness]).toEqual([4, 1]);
      expect(c.keywords).toEqual(expect.arrayContaining(["firstStrike", "vigilance"]));
    });

    describe("Bebop & Rocksteady", () => {
      it("en attaquant : défausser une carte évite le sacrifice", () => {
        let s = scenario({ p1: { battlefield: ["Bebop & Rocksteady", "Bear Cub"], hand: ["Opt"] } });
        const opt = idOf(s, "p1", "hand", "Opt");
        s = settle(attack(s, [idOf(s, "p1", "battlefield", "Bebop & Rocksteady")]), (req) => pickId(req, opt));
        expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(1);
        expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
        expect(idsOf(s, "p1", "battlefield", "Bebop & Rocksteady")).toHaveLength(1);
      });

      it("en attaquant, sans défausse : un permanent est sacrifié", () => {
        let s = scenario({ p1: { battlefield: ["Bebop & Rocksteady", "Bear Cub"], hand: ["Opt"] } });
        s = settle(attack(s, [idOf(s, "p1", "battlefield", "Bebop & Rocksteady")]), (req, _player, cur) =>
          req.type === "pick" && req.options.some((id) => nameOf(cur, String(id)) === "Opt")
            ? []
            : pickNamed(cur, req, "Bear Cub"),
        );
        expect(namesIn(s, s.players.p1?.hand)).toEqual(["Opt"]);
        expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
      });

      it("en bloquant, main vide : un permanent est sacrifié", () => {
        let s = scenario({
          active: "p2",
          p1: { battlefield: ["Bebop & Rocksteady", "Forest"] },
          p2: { battlefield: ["Bear Cub"] },
        });
        const bebop = idOf(s, "p1", "battlefield", "Bebop & Rocksteady");
        const bear = idOf(s, "p2", "battlefield", "Bear Cub");
        s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
        s = act(s, "p2", { type: "declareAttackers", attackers: [{ id: bear, defender: "p1" }] });
        s = advanceUntil(s, (x) => x.pending?.kind === "declareBlockers");
        s = act(s, "p1", { type: "declareBlockers", blocks: [{ blocker: bebop, attacker: bear }] });
        s = settle(s, (req, _player, cur) => pickNamed(cur, req, "Forest"));
        expect(idsOf(s, "p1", "graveyard", "Forest")).toHaveLength(1);
        expect(idsOf(s, "p1", "battlefield", "Bebop & Rocksteady")).toHaveLength(1);
      });
    });

    describe("Brilliance Unleashed", () => {
      it("les deux modes : 5 blessures, et un artefact non-créature revient en Robot 3/3 volant", () => {
        let s = scenario({
          p1: {
            battlefield: [...lands("Island", 4), ...lands("Mountain", 2)],
            hand: ["Brilliance Unleashed"],
            graveyard: ["Fishing Pole"],
          },
          p2: { battlefield: ["Serra Angel"] },
        });
        const angel = idOf(s, "p2", "battlefield", "Serra Angel");
        const pole = idOf(s, "p1", "graveyard", "Fishing Pole");
        s = settle(cast(s, "p1", "Brilliance Unleashed", { mode: 2, targets: { d: [angel], a: [pole] } }));
        expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
        const back = idOf(s, "p1", "battlefield", "Fishing Pole");
        const c = chars(s, back);
        expect(c.types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
        expect(c.subtypes).toEqual(["Robot"]);
        expect([c.power, c.toughness]).toEqual([3, 3]);
        expect(c.keywords).toContain("flying");
      });

      it("une carte de créature-artefact revient telle quelle", () => {
        let s = scenario({
          p1: {
            battlefield: [...lands("Island", 4), ...lands("Mountain", 2)],
            hand: ["Brilliance Unleashed"],
            graveyard: ["Mechanized Ninja Cavalry"],
          },
        });
        const cavalry = idOf(s, "p1", "graveyard", "Mechanized Ninja Cavalry");
        s = settle(cast(s, "p1", "Brilliance Unleashed", { mode: 1, targets: { a: [cavalry] } }));
        const back = idOf(s, "p1", "battlefield", "Mechanized Ninja Cavalry");
        expect([chars(s, back).power, chars(s, back).toughness]).toEqual([1, 1]);
        expect(chars(s, back).keywords).not.toContain("flying");
        // Sa capacité d'arrivée : un Robot 1/1.
        expect(idsOf(s, "p1", "battlefield", "Robot")).toHaveLength(1);
      });
    });

    describe("Dark Leo & Shredder", () => {
      const setup = (elites: number) => {
        let s = scenario({ p1: { battlefield: ["Dark Leo & Shredder", ...Array(elites).fill("Foot Elite")] } });
        const leo = idOf(s, "p1", "battlefield", "Dark Leo & Shredder");
        s = attack(s, [leo]);
        // Vos Ninjas attaquants ont le contact mortel, pas les autres.
        expect(chars(s, leo).keywords).toContain("deathtouch");
        expect(chars(s, idOf(s, "p1", "battlefield", "Foot Elite")).keywords).not.toContain("deathtouch");
        return toMain2(s);
      };

      it("blessures de combat à un joueur : un Ninja 1/1 ; avec cinq Ninjas, il perd la moitié de ses PV (arrondie au supérieur)", () => {
        const s = setup(3);
        expect(idsOf(s, "p1", "battlefield", "Ninja")).toHaveLength(1);
        // 20 − 1 = 19, puis la moitié arrondie au supérieur (10).
        expect(s.players.p2?.life).toBe(9);
      });

      it("avec quatre Ninjas seulement, pas de perte supplémentaire", () => {
        const s = setup(2);
        expect(idsOf(s, "p1", "battlefield", "Ninja")).toHaveLength(1);
        expect(s.players.p2?.life).toBe(19);
      });
    });

    it("Don & Leo, Problem Solvers : à votre étape de fin, un artefact et une créature sont exilés puis reviennent", () => {
      let s = scenario({
        p1: { battlefield: ["Don & Leo, Problem Solvers", "Fishing Pole", { name: "Bear Cub", counters: { "+1/+1": 2 } }] },
      });
      const pole = idOf(s, "p1", "battlefield", "Fishing Pole");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = toEndStep(s, (req) => pickId(req, pole) ?? pickId(req, bear));
      const newPole = idOf(s, "p1", "battlefield", "Fishing Pole");
      const newBear = idOf(s, "p1", "battlefield", "Bear Cub");
      expect(newPole).not.toBe(pole);
      expect(newBear).not.toBe(bear);
      expect(s.objects[newBear]?.counters["+1/+1"] ?? 0).toBe(0);
      expect(chars(s, idOf(s, "p1", "battlefield", "Don & Leo, Problem Solvers")).keywords).toContain("vigilance");
    });

    it("EPF Point Squad : Alliance — un marqueur +1/+1 quand une autre créature arrive sous votre contrôle", () => {
      let s = scenario({ p1: { battlefield: ["EPF Point Squad", "Forest"], hand: ["Llanowar Elves"] } });
      s = settle(cast(s, "p1", "Llanowar Elves"));
      const squad = idOf(s, "p1", "battlefield", "EPF Point Squad");
      expect(s.objects[squad]?.counters["+1/+1"]).toBe(1);
      expect([chars(s, squad).power, chars(s, squad).toughness]).toEqual([3, 2]);
    });

    it("Foot Elite : en attaquant, une autre de vos créatures gagne +1/+0 et l'indestructible", () => {
      let s = scenario({ p1: { battlefield: ["Foot Elite", "Bear Cub"] } });
      const elite = idOf(s, "p1", "battlefield", "Foot Elite");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      let options: ChoiceValue[] = [];
      s = settle(attack(s, [elite]), (req) => {
        if (req.type === "pick") options = req.options;
        return pickId(req, bear);
      });
      expect(options).not.toContain(elite);
      expect(chars(s, bear).power).toBe(3);
      expect(chars(s, bear).keywords).toContain("indestructible");
      expect(chars(s, elite).keywords).not.toContain("indestructible");
    });

    describe("Splinter, Radical Rat", () => {
      it("Foot Ninjas : 3 PV en arrivant ; avec Splinter, la capacité d'un Ninja se déclenche deux fois", () => {
        const play = (withSplinter: boolean) => {
          const s = scenario({
            p1: {
              battlefield: [...lands("Plains", 6), ...(withSplinter ? ["Splinter, Radical Rat"] : [])],
              hand: ["Foot Ninjas"],
            },
          });
          return settle(cast(s, "p1", "Foot Ninjas"));
        };
        expect(play(false).players.p1?.life).toBe(23);
        expect(play(true).players.p1?.life).toBe(26);
      });

      it("{1}{U} : un Ninja ciblé ne peut pas être bloqué ce tour-ci (pas une créature non-Ninja)", () => {
        let s = scenario({ p1: { battlefield: ["Splinter, Radical Rat", "Foot Elite", "Bear Cub", ...lands("Island", 2)] } });
        const splinter = idOf(s, "p1", "battlefield", "Splinter, Radical Rat");
        const elite = idOf(s, "p1", "battlefield", "Foot Elite");
        expect(() =>
          activate(s, "p1", splinter, "Ninja", { targets: { t: [idOf(s, "p1", "battlefield", "Bear Cub")] } }),
        ).toThrow();
        s = settle(activate(s, "p1", splinter, "Ninja", { targets: { t: [elite] } }));
        expect(chars(s, elite).keywords).toContain("unblockable");
      });
    });

    it("Genghis Frog : un Mutagène quand il arrive ou quand un autre Mutant arrive sous votre contrôle", () => {
      let s = scenario({
        p1: { battlefield: ["Island", ...lands("Forest", 7)], hand: ["Genghis Frog", "Putrid Pals", "Bear Cub"] },
      });
      s = settle(cast(s, "p1", "Genghis Frog"));
      expect(idsOf(s, "p1", "battlefield", "Mutagen")).toHaveLength(1);
      s = settle(cast(s, "p1", "Putrid Pals"));
      expect(idsOf(s, "p1", "battlefield", "Mutagen")).toHaveLength(2);
      // Un Ours n'est pas un Mutant.
      s = settle(cast(s, "p1", "Bear Cub"));
      expect(idsOf(s, "p1", "battlefield", "Mutagen")).toHaveLength(2);
      expect(chars(s, idOf(s, "p1", "battlefield", "Genghis Frog")).keywords).toContain("trample");
    });

    it("Go Ninja Go, les deux modes : une créature exilée revient, puis blessures égales à votre plus grande force", () => {
      let s = scenario({
        p1: {
          battlefield: ["Mountain", "Plains", "Shivan Dragon", { name: "Bear Cub", counters: { "+1/+1": 2 } }],
          hand: ["Go Ninja Go"],
        },
        p2: { battlefield: ["Serra Angel"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      expect(() => cast(s, "p1", "Go Ninja Go", { mode: 1, targets: { d: [bear] } })).toThrow();
      s = settle(cast(s, "p1", "Go Ninja Go", { mode: 2, targets: { f: [bear], d: [angel] } }));
      const newBear = idOf(s, "p1", "battlefield", "Bear Cub");
      expect(newBear).not.toBe(bear);
      expect(s.objects[newBear]?.counters["+1/+1"] ?? 0).toBe(0);
      // 5 blessures (Shivan Dragon) : l'Ange 4/4 meurt.
      expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
    });

    describe("Ice Cream Kitty", () => {
      it("{2}, sacrifiez une autre créature : piochez (pas en sacrifiant le Chat lui-même)", () => {
        let s = scenario({
          p1: { battlefield: ["Ice Cream Kitty", "Bear Cub", ...lands("Forest", 2)], library: ["Opt", "Island"] },
        });
        const kitty = idOf(s, "p1", "battlefield", "Ice Cream Kitty");
        expect(() => activate(s, "p1", kitty, "piochez", { sacrifice: [kitty] })).toThrow();
        s = settle(activate(s, "p1", kitty, "piochez", { sacrifice: [idOf(s, "p1", "battlefield", "Bear Cub")] }));
        expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
        expect(namesIn(s, s.players.p1?.hand)).toEqual(["Opt"]);
      });

      it("{2}, {T}, sacrifiez-le : vous gagnez 3 PV", () => {
        let s = scenario({ p1: { battlefield: ["Ice Cream Kitty", ...lands("Forest", 2)] } });
        s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Ice Cream Kitty"), "3 PV"));
        expect(s.players.p1?.life).toBe(23);
        expect(idsOf(s, "p1", "graveyard", "Ice Cream Kitty")).toHaveLength(1);
      });
    });

    describe("Karai, Future of the Foot", () => {
      it("blessures de combat à un joueur : une carte de créature de votre cimetière revient en main", () => {
        let s = scenario({ p1: { battlefield: ["Karai, Future of the Foot"], graveyard: ["Bear Cub"] } });
        s = toMain2(attack(s, [idOf(s, "p1", "battlefield", "Karai, Future of the Foot")]), (req, _player, cur) =>
          pickNamed(cur, req, "Bear Cub"),
        );
        expect(s.players.p2?.life).toBe(17);
        expect(namesIn(s, s.players.p1?.hand)).toEqual(["Bear Cub"]);
      });

      /** Karai faufilée ce tour-ci (vrai lancer à l'étape des bloqueurs), ou lors d'un tour précédent (simulé). */
      const sneaked = (thisTurn: boolean) => {
        if (!thisTurn) {
          let s = scenario({ p1: { battlefield: ["Karai, Future of the Foot"], graveyard: ["Serra Angel"] } });
          const karai = idOf(s, "p1", "battlefield", "Karai, Future of the Foot");
          s = attack(s, [karai]);
          (s.objects[karai] as { castVia?: string }).castVia = "sneak";
          s.version += 1;
          return toMain2(s, (req, _player, cur) => pickNamed(cur, req, "Serra Angel"));
        }
        let s = scenario({
          p1: {
            battlefield: ["Bear Cub", "Plains", "Swamp", "Swamp", "Swamp"],
            hand: ["Karai, Future of the Foot"],
            graveyard: ["Serra Angel"],
          },
        });
        s = attack(s, [idOf(s, "p1", "battlefield", "Bear Cub")]);
        s = advanceUntil(
          s,
          (x) => x.turn.step === "declareBlockers" && x.pending?.kind === "priority" && x.pending.player === "p1",
        );
        s = cast(s, "p1", "Karai, Future of the Foot", { alternative: true });
        const out = toMain2(s, (req, _player, cur) => pickNamed(cur, req, "Serra Angel"));
        // L'Ourson est revenu en main ; Karai est arrivée engagée et attaquante.
        expect(idsOf(out, "p1", "hand", "Bear Cub")).toHaveLength(1);
        return out;
      };

      it("faufilée ce tour-ci : la carte revient sur le champ de bataille à la place", () => {
        const s = sneaked(true);
        expect(s.players.p2?.life).toBe(17);
        expect(idsOf(s, "p1", "battlefield", "Serra Angel")).toHaveLength(1);
        // Seul l'attaquant renvoyé pour le faufilement est en main.
        expect(namesIn(s, s.players.p1?.hand)).toEqual(["Bear Cub"]);
      });

      it("faufilée lors d'un tour précédent : la carte revient en main", () => {
        const s = sneaked(false);
        expect(idsOf(s, "p1", "battlefield", "Serra Angel")).toHaveLength(0);
        expect(namesIn(s, s.players.p1?.hand)).toEqual(["Serra Angel"]);
      });
    });

    it("Karai's Technique, les deux modes : +3/+3 sur une créature, -3/-3 sur une autre", () => {
      let s = scenario({
        p1: { battlefield: ["Plains", ...lands("Swamp", 2), "Bear Cub"], hand: ["Karai's Technique"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(cast(s, "p1", "Karai's Technique", { mode: 2, targets: { p: [bear], m: [angel] } }));
      expect([chars(s, bear).power, chars(s, bear).toughness]).toEqual([5, 5]);
      expect([chars(s, angel).power, chars(s, angel).toughness]).toEqual([1, 1]);
    });

    describe("Krang & Shredder", () => {
      const setup = () =>
        scenario({
          p1: {
            battlefield: [
              ...lands("Island", 3),
              ...lands("Swamp", 3),
              ...lands("Mountain", 2),
              "Bear Cub",
              "Tokka & Rahzar, Terrible Twos",
            ],
            hand: ["Krang & Shredder", "Lightning Strike"],
            library: lands("Island", 5),
          },
          p2: { library: ["Island", "Island", "Opt", ...lands("Forest", 5)] },
        });

      it("en arrivant, chaque adversaire exile jusqu'à une carte non-terrain ; Disparition : vous la lancez sans payer (Tokka : 3 blessures)", () => {
        let s = settle(cast(setup(), "p1", "Krang & Shredder"));
        expect(exiled(s)).toEqual(["Island", "Island", "Opt"]);
        expect(namesIn(s, s.players.p2?.library.slice(0, 1))).toEqual(["Forest"]);
        // Krang et Lightning Strike payés en entier : Tokka & Rahzar ne blesse personne.
        s = strikeOwn(s, "Bear Cub");
        expect(s.players.p1?.life).toBe(20);
        s = untilCastNow(run(s, (x) => x.turn.step === "main2" && quiet(x)));
        const offered = castNowOf(s)?.cards ?? [];
        expect(namesIn(s, offered)).toEqual(["Opt"]);
        s = settle(act(s, "p1", { type: "cast", card: offered[0] as string, free: true }));
        // Opt : regard 1 puis piochez ; il va au cimetière de son propriétaire.
        expect(s.players.p1?.hand).toHaveLength(1);
        expect(namesIn(s, s.players.p2?.graveyard)).toEqual(["Opt"]);
        // Aucun mana dépensé pour un sort de valeur de mana 1 : Tokka & Rahzar inflige 3 blessures à p1.
        expect(s.players.p1?.life).toBe(17);
      });

      it("sans permanent parti ce tour-ci, rien n'est lancé à l'étape de fin", () => {
        let s = settle(cast(setup(), "p1", "Krang & Shredder"));
        s = toEndStep(s);
        expect(castNowOf(s)).toBeUndefined();
        expect(exiled(s)).toContain("Opt");
      });
    });

    it("Tokka & Rahzar, Terrible Twos : ne peut pas être contrecarré ; menace", () => {
      expect(card("Tokka & Rahzar, Terrible Twos").cantBeCountered).toBe(true);
      const s = scenario({ p1: { battlefield: ["Tokka & Rahzar, Terrible Twos"] } });
      expect(chars(s, idOf(s, "p1", "battlefield", "Tokka & Rahzar, Terrible Twos")).keywords).toContain("menace");
    });

    describe("The Last Ronin", () => {
      it("chapitre I : détruisez toutes les créatures", () => {
        let s = scenario({
          p1: { battlefield: [...lands("Swamp", 5), "Forest", "Bear Cub"], hand: ["The Last Ronin"] },
          p2: { battlefield: ["Serra Angel"] },
        });
        s = settle(cast(s, "p1", "The Last Ronin"));
        expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
        expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
        expect(s.objects[idOf(s, "p1", "battlefield", "The Last Ronin")]?.counters.lore).toBe(1);
      });

      it("chapitre II : meulez quatre cartes, puis une carte de créature de votre cimetière revient en main", () => {
        let s = scenario({
          p1: {
            battlefield: [{ name: "The Last Ronin", counters: { lore: 1 } }],
            library: ["Island", "Shivan Dragon", "Opt", "Island", "Forest", ...lands("Forest", 5)],
          },
        });
        s = toNextTurn(s, (req, _player, cur) => pickNamed(cur, req, "Shivan Dragon"));
        expect(namesIn(s, s.players.p1?.hand).sort()).toEqual(["Island", "Shivan Dragon"]);
        expect(namesIn(s, s.players.p1?.graveyard).sort()).toEqual(["Forest", "Island", "Opt"]);
      });

      it("chapitre III : ce tour-ci, une créature qui attaque seule reçoit trois marqueurs +1/+1, le piétinement, le lien de vie et l'indestructible", () => {
        let s = scenario({ p1: { battlefield: [{ name: "The Last Ronin", counters: { lore: 2 } }, "Bear Cub"] } });
        s = toNextTurn(s);
        // Sacrifiée après le chapitre III.
        expect(idsOf(s, "p1", "graveyard", "The Last Ronin")).toHaveLength(1);
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        s = settle(attack(s, [bear]));
        expect(s.objects[bear]?.counters["+1/+1"]).toBe(3);
        expect(chars(s, bear).keywords).toEqual(expect.arrayContaining(["trample", "lifelink", "indestructible"]));
        s = toMain2(s);
        expect(s.players.p2?.life).toBe(15);
        expect(s.players.p1?.life).toBe(25);
      });
    });

    it("Lessons from Life : piochez trois cartes, puis vous pouvez mettre un terrain de votre main sur le champ de bataille engagé", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Forest", 2), ...lands("Island", 2)],
          hand: ["Lessons from Life"],
          library: ["Forest", "Opt", "Island", "Swamp"],
        },
      });
      s = settle(cast(s, "p1", "Lessons from Life"), (req, _player, cur) => pickNamed(cur, req, "Island"));
      expect(namesIn(s, s.players.p1?.hand).sort()).toEqual(["Forest", "Opt"]);
      const islands = idsOf(s, "p1", "battlefield", "Island");
      expect(islands).toHaveLength(3);
      expect(islands.every((id) => s.objects[id]?.tapped)).toBe(true);
    });

    it("Mechanized Ninja Cavalry et Slithering Cryptid : un Robot 1/1 et un Mutagène en arrivant", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Mountain", 2), ...lands("Forest", 3)],
          hand: ["Mechanized Ninja Cavalry", "Slithering Cryptid"],
        },
      });
      s = settle(cast(s, "p1", "Mechanized Ninja Cavalry"));
      const robot = idOf(s, "p1", "battlefield", "Robot");
      expect([chars(s, robot).power, chars(s, robot).toughness, chars(s, robot).colors]).toEqual([1, 1, []]);
      s = settle(cast(s, "p1", "Slithering Cryptid"));
      expect(idsOf(s, "p1", "battlefield", "Mutagen")).toHaveLength(1);
    });

    it("Mikey & Leo, Chaos & Order : un marqueur mis sur une de vos créatures fait piocher, une seule fois par tour", () => {
      let s = scenario({
        p1: {
          battlefield: ["Mikey & Leo, Chaos & Order", "EPF Point Squad", ...lands("Forest", 2)],
          hand: ["Llanowar Elves", "Llanowar Elves"],
          library: lands("Island", 5),
        },
      });
      s = settle(cast(s, "p1", "Llanowar Elves"));
      expect(namesIn(s, s.players.p1?.hand).sort()).toEqual(["Island", "Llanowar Elves"]);
      s = settle(cast(s, "p1", "Llanowar Elves"));
      expect(s.objects[idOf(s, "p1", "battlefield", "EPF Point Squad")]?.counters["+1/+1"]).toBe(2);
      expect(namesIn(s, s.players.p1?.hand)).toEqual(["Island"]);
    });

    it("Mouser Mark III : n'attaque que si vous contrôlez un autre artefact", () => {
      const s = scenario({ p1: { battlefield: ["Mouser Mark III"] } });
      expect(() => attack(s, [idOf(s, "p1", "battlefield", "Mouser Mark III")])).toThrow();
      let t = scenario({ p1: { battlefield: ["Mouser Mark III", "Fishing Pole"] } });
      t = toMain2(attack(t, [idOf(t, "p1", "battlefield", "Mouser Mark III")]));
      expect(t.players.p2?.life).toBe(18);
    });

    describe("The Neutrinos", () => {
      it("Alliance : +1/+0 jusqu'à la fin du tour quand une autre créature arrive", () => {
        let s = scenario({ p1: { battlefield: ["The Neutrinos", "Forest"], hand: ["Llanowar Elves"] } });
        s = settle(cast(s, "p1", "Llanowar Elves"));
        const n = idOf(s, "p1", "battlefield", "The Neutrinos");
        expect([chars(s, n).power, chars(s, n).toughness]).toEqual([3, 4]);
        expect(chars(s, n).keywords).toContain("flying");
      });

      it("en attaquant : une de vos créatures est exilée, puis revient engagée et attaquante", () => {
        let s = scenario({ p1: { battlefield: ["The Neutrinos", "Bear Cub"] } });
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        s = settle(attack(s, [idOf(s, "p1", "battlefield", "The Neutrinos")]), (req) => pickId(req, bear));
        const back = idOf(s, "p1", "battlefield", "Bear Cub");
        expect(back).not.toBe(bear);
        expect(s.objects[back]?.tapped).toBe(true);
        expect(s.combat?.attackers.map((a) => a.id)).toContain(back);
        s = toMain2(s);
        // 2 de l'Ours, 3 des Neutrinos : l'Ours revenu a déclenché l'Alliance.
        expect(s.players.p2?.life).toBe(15);
      });
    });

    it("Nobody : renvoie un autre de vos artefacts en main, puis regard 1", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Island", 3), "Fishing Pole"], hand: ["Nobody"], library: ["Opt", "Island", "Forest"] },
      });
      const pole = idOf(s, "p1", "battlefield", "Fishing Pole");
      s = settle(cast(s, "p1", "Nobody"), (req, _player, cur) => {
        if (req.intent === "scryBottom" && req.type === "pick") return pickNamed(cur, req, "Opt");
        return pickId(req, pole);
      });
      expect(namesIn(s, s.players.p1?.hand)).toEqual(["Fishing Pole"]);
      expect(namesIn(s, s.players.p1?.library)).toEqual(["Island", "Forest", "Opt"]);
    });

    describe("Pizza Face, Gastromancer", () => {
      it("une Nourriture en arrivant ; Disparition : trois marqueurs +1/+1, et un artefact devient un Mutant 0/0", () => {
        let s = scenario({
          p1: {
            battlefield: [...lands("Swamp", 4), "Forest", ...lands("Mountain", 2), "Fishing Pole", "Bear Cub"],
            hand: ["Pizza Face, Gastromancer", "Lightning Strike"],
          },
        });
        s = settle(cast(s, "p1", "Pizza Face, Gastromancer"));
        expect(idsOf(s, "p1", "battlefield", "Food")).toHaveLength(1);
        s = strikeOwn(s, "Bear Cub");
        const pole = idOf(s, "p1", "battlefield", "Fishing Pole");
        s = toEndStep(s, (req) => pickId(req, pole));
        expect(s.objects[pole]?.counters["+1/+1"]).toBe(3);
        const c = chars(s, pole);
        expect(c.types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
        expect(c.subtypes).toEqual(expect.arrayContaining(["Equipment", "Mutant"]));
        expect([c.power, c.toughness]).toEqual([3, 3]);
      });

      it("sans permanent parti ce tour-ci, pas de marqueurs", () => {
        let s = scenario({ p1: { battlefield: ["Pizza Face, Gastromancer", "Bear Cub"] } });
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        s = toEndStep(s, (req) => pickId(req, bear));
        expect(s.objects[bear]?.counters["+1/+1"] ?? 0).toBe(0);
      });

      it("{10}, {T}, sacrifiez-la : vous gagnez 15 PV", () => {
        let s = scenario({ p1: { battlefield: ["Pizza Face, Gastromancer", ...lands("Swamp", 10)] } });
        s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Pizza Face, Gastromancer"), "15 PV"));
        expect(s.players.p1?.life).toBe(35);
      });
    });

    it("Putrid Pals : Disparition — arrive avec deux marqueurs +1/+1 si un de vos permanents est parti ce tour-ci", () => {
      const base = {
        battlefield: [...lands("Swamp", 4), ...lands("Mountain", 2), "Bear Cub"],
        hand: ["Putrid Pals", "Lightning Strike"],
      };
      let s = settle(cast(scenario({ p1: base }), "p1", "Putrid Pals"));
      expect(chars(s, idOf(s, "p1", "battlefield", "Putrid Pals")).power).toBe(3);
      s = strikeOwn(scenario({ p1: base }), "Bear Cub");
      s = settle(cast(s, "p1", "Putrid Pals"));
      const pals = idOf(s, "p1", "battlefield", "Putrid Pals");
      expect(s.objects[pals]?.counters["+1/+1"]).toBe(2);
      expect(chars(s, pals).keywords).toContain("deathtouch");
    });

    it("Raph & Leo, Sibling Rivals : au premier combat, dégage une ou deux créatures attaquantes, puis un combat supplémentaire", () => {
      let s = scenario({ p1: { battlefield: ["Raph & Leo, Sibling Rivals", "Bear Cub"] } });
      const raph = idOf(s, "p1", "battlefield", "Raph & Leo, Sibling Rivals");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(attack(s, [raph, bear]), (req) => (req.type === "pick" ? [raph, bear] : undefined));
      expect([s.objects[raph]?.tapped, s.objects[bear]?.tapped]).toEqual([false, false]);
      // Après la phase de combat, une autre phase de combat (sans phase principale entre les deux).
      s = run(s, (x) => x.pending?.kind === "declareAttackers" || x.turn.step === "main2");
      expect(s.turn.step).toBe("declareAttackers");
      expect(s.players.p2?.life).toBe(16);
      s = act(s, "p1", {
        type: "declareAttackers",
        attackers: [raph, bear].map((id) => ({ id, defender: "p2" })),
      });
      // Ce n'est plus le premier combat : pas de nouveau déclenchement.
      expect(s.triggers).toHaveLength(0);
      s = toMain2(s);
      expect(s.players.p2?.life).toBe(12);
      expect(s.objects[raph]?.tapped).toBe(true);
    });

    it("Raph & Mikey, Troublemakers : en attaquant, la première carte de créature révélée arrive engagée et attaquante", () => {
      let s = scenario({
        p1: { battlefield: ["Raph & Mikey, Troublemakers"], library: ["Island", "Forest", "Serra Angel", "Opt"] },
      });
      s = settle(attack(s, [idOf(s, "p1", "battlefield", "Raph & Mikey, Troublemakers")]));
      const angel = idOf(s, "p1", "battlefield", "Serra Angel");
      expect(s.objects[angel]?.tapped).toBe(true);
      // Les cartes révélées vont au-dessous de la bibliothèque.
      expect(namesIn(s, s.players.p1?.library.slice(0, 1))).toEqual(["Opt"]);
      expect(namesIn(s, s.players.p1?.library.slice(1)).sort()).toEqual(["Forest", "Island"]);
      s = toMain2(s);
      expect(s.players.p2?.life).toBe(9);
    });

    it("Tainted Treats : détruit un artefact ou une créature ; une Nourriture si sa valeur de mana était 4 ou moins", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Swamp", 4), ...lands("Forest", 2)], hand: ["Tainted Treats", "Tainted Treats"] },
        p2: { battlefield: ["Bear Cub", "Shivan Dragon"] },
      });
      s = settle(cast(s, "p1", "Tainted Treats", { targets: { t: [idOf(s, "p2", "battlefield", "Shivan Dragon")] } }));
      expect(idsOf(s, "p2", "graveyard", "Shivan Dragon")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Food")).toHaveLength(0);
      s = settle(cast(s, "p1", "Tainted Treats", { targets: { t: [idOf(s, "p2", "battlefield", "Bear Cub")] } }));
      expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Food")).toHaveLength(1);
    });
  });
});

describe("lot A, incolores et terrains", () => {
  type S = GameState;
  const inExile = (s: S, name: string) => Object.values(s.objects).filter((o) => o.zone === "exile" && nameOf(s, o.id) === name);

  const playLand = (s: S, player: string, name: string) =>
    act(s, player, { type: "playLand", card: idOf(s, player, "hand", name) });
  /** Active la capacité de `source` dont le libellé contient `label` (la première sinon). */
  const activate = (s: S, player: string, source: string, label?: string, extra: object = {}) => {
    const a = legalActions(s, player).find(
      (x) => x.type === "activate" && x.source === source && (!label || x.label?.includes(label)),
    );
    if (a?.type !== "activate") throw new Error(`capacité introuvable : ${label ?? source}`);
    return act(s, player, { type: "activate", source, ability: a.ability, ...extra });
  };
  const canActivate = (s: S, player: string, source: string, label?: string) =>
    legalActions(s, player).some((x) => x.type === "activate" && x.source === source && (!label || x.label?.includes(label)));
  const manaColors = (s: S, source: string) =>
    [...new Set(legalActions(s, "p1").flatMap((a) => (a.type === "tapForMana" && a.source === source ? a.colors : [])))].sort();

  /** Tortue 2/2 de test, coût {G}. */
  const TURTLE = customCard({
    name: "Test Turtle",
    subtypes: ["Turtle"],
    power: 2,
    toughness: 2,
    manaCost: { generic: 0, colored: { G: 1 }, x: 0 },
    manaCostText: "{G}",
    colors: ["G"],
  });

  describe("Teenage Mutant Ninja Turtles, lot A — incolores et terrains", () => {
    describe("Chrome Dome", () => {
      it("vos autres créatures-artefacts ont +1/+0 (pas lui, ni une créature non-artefact, ni celles de l'adversaire)", () => {
        const s = scenario({
          p1: { battlefield: ["Chrome Dome", "Henchbots", "Bear Cub"] },
          p2: { battlefield: ["Henchbots"] },
        });
        expect(chars(s, idOf(s, "p1", "battlefield", "Chrome Dome")).power).toBe(1);
        expect(chars(s, idOf(s, "p1", "battlefield", "Henchbots")).power).toBe(3);
        expect(chars(s, idOf(s, "p1", "battlefield", "Bear Cub")).power).toBe(2);
        expect(chars(s, idOf(s, "p2", "battlefield", "Henchbots")).power).toBe(2);
      });

      it("{5} : un jeton copie d'un autre de vos artefacts, avec la célérité, sacrifié à la prochaine étape de fin", () => {
        let s = scenario({ p1: { battlefield: ["Chrome Dome", "Turtle Blimp", ...lands("Island", 5)] } });
        const dome = idOf(s, "p1", "battlefield", "Chrome Dome");
        const blimp = idOf(s, "p1", "battlefield", "Turtle Blimp");
        // « Un autre artefact » : pas lui-même.
        expect(() => activate(s, "p1", dome, "jeton copie", { targets: { t: [dome] } })).toThrow();
        s = settle(activate(s, "p1", dome, "jeton copie", { targets: { t: [blimp] } }));
        const copies = idsOf(s, "p1", "battlefield", "Turtle Blimp");
        expect(copies).toHaveLength(2);
        const token = copies.find((id) => id !== blimp) as string;
        expect(s.objects[token]?.isToken).toBe(true);
        expect(chars(s, token).keywords).toContain("haste");
        expect(chars(s, token).keywords).toContain("flying");
        // La copie arrive : sa capacité d'arrivée crée un Mutant.
        expect(idsOf(s, "p1", "battlefield", "Mutant")).toHaveLength(1);
        s = advanceUntil(s, (x) => x.turn.step === "cleanup" || x.turn.active === "p2");
        expect(idsOf(s, "p1", "battlefield", "Turtle Blimp")).toEqual([blimp]);
      });
    });

    describe("Everything Pizza", () => {
      it("en arrivant : une carte de terrain de base de la bibliothèque en main", () => {
        let s = scenario({
          p1: { battlefield: lands("Island", 2), hand: ["Everything Pizza"], library: ["Opt", "Swamp", "Opt"] },
        });
        s = settle(cast(s, "p1", "Everything Pizza"), (req, _player, cur) => pickNamed(cur, req, "Swamp"));
        expect(idsOf(s, "p1", "hand", "Swamp")).toHaveLength(1);
        expect(s.players.p1?.library).toHaveLength(2);
      });

      it("{2}{W}{U}{B}{R}{G}, {T}, sacrifice : 3 PV et une carte, défausse adverse, 3 blessures, trois marqueurs +1/+1", () => {
        let s = scenario({
          p1: {
            battlefield: ["Everything Pizza", "Plains", "Island", "Swamp", "Mountain", "Forest", "Forest", "Forest", "Bear Cub"],
            library: ["Opt", "Opt"],
          },
          p2: { hand: ["Opt"] },
        });
        const pizza = idOf(s, "p1", "battlefield", "Everything Pizza");
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        s = settle(activate(s, "p1", pizza, "défausse", { targets: { p: ["p1"], d: ["p2"], c: [bear] } }));
        expect(s.players.p1?.life).toBe(23);
        expect(s.players.p1?.hand).toHaveLength(1);
        expect(s.players.p2?.hand).toHaveLength(0);
        expect(idsOf(s, "p2", "graveyard", "Opt")).toHaveLength(1);
        expect(s.players.p2?.life).toBe(17);
        expect(s.objects[bear]?.counters["+1/+1"]).toBe(3);
        expect(idsOf(s, "p1", "graveyard", "Everything Pizza")).toHaveLength(1);
      });
    });

    describe("Henchbots", () => {
      it("exile une créature adverse engagée jusqu'à ce que les Henchbots quittent le champ de bataille", () => {
        let s = scenario({
          p1: { battlefield: lands("Swamp", 4), hand: ["Henchbots"] },
          p2: { battlefield: [{ name: "Bear Cub", tapped: true }, "Serra Angel"] },
        });
        s = settle(cast(s, "p1", "Henchbots"));
        expect(inExile(s, "Bear Cub")).toHaveLength(1);
        // L'Ange, dégagé, n'était pas une cible légale.
        expect(idsOf(s, "p2", "battlefield", "Serra Angel")).toHaveLength(1);
        destroy(s, idOf(s, "p1", "battlefield", "Henchbots"));
        expect(inExile(s, "Bear Cub")).toHaveLength(0);
        expect(idsOf(s, "p2", "battlefield", "Bear Cub")).toHaveLength(1);
      });

      it("sans créature adverse engagée, rien n'est exilé", () => {
        let s = scenario({
          p1: { battlefield: lands("Swamp", 4), hand: ["Henchbots"] },
          p2: { battlefield: ["Bear Cub"] },
        });
        s = settle(cast(s, "p1", "Henchbots"));
        expect(idsOf(s, "p2", "battlefield", "Bear Cub")).toHaveLength(1);
        expect(idsOf(s, "p1", "battlefield", "Henchbots")).toHaveLength(1);
      });
    });

    it("Krang, Utrom Warlord : vol, piétinement, indestructible, célérité, aussi pour vos autres créatures-artefacts", () => {
      const s = scenario({
        p1: { battlefield: ["Krang, Utrom Warlord", "Henchbots", "Bear Cub"] },
        p2: { battlefield: ["Henchbots"] },
      });
      const all = ["flying", "trample", "indestructible", "haste"];
      expect(chars(s, idOf(s, "p1", "battlefield", "Krang, Utrom Warlord")).keywords).toEqual(expect.arrayContaining(all));
      expect(chars(s, idOf(s, "p1", "battlefield", "Henchbots")).keywords).toEqual(expect.arrayContaining(all));
      expect(chars(s, idOf(s, "p1", "battlefield", "Bear Cub")).keywords).not.toContain("flying");
      expect(chars(s, idOf(s, "p2", "battlefield", "Henchbots")).keywords).not.toContain("flying");
    });

    describe("Omni-Cheese Pizza", () => {
      it("en arrivant, piochez une carte ; {2}, {T}, sacrifice : 3 PV", () => {
        let s = scenario({ p1: { battlefield: lands("Island", 4), hand: ["Omni-Cheese Pizza"], library: ["Opt", "Opt"] } });
        s = settle(cast(s, "p1", "Omni-Cheese Pizza"));
        expect(s.players.p1?.hand).toHaveLength(1);
        const pizza = idOf(s, "p1", "battlefield", "Omni-Cheese Pizza");
        s = settle(activate(s, "p1", pizza, "3 PV"));
        expect(s.players.p1?.life).toBe(23);
        expect(idsOf(s, "p1", "graveyard", "Omni-Cheese Pizza")).toHaveLength(1);
      });

      it("{1}, {T}, sacrifice : un mana de n'importe quelle couleur, sans passer par la pile", () => {
        let s = scenario({ p1: { battlefield: ["Omni-Cheese Pizza", "Island"] } });
        const pizza = idOf(s, "p1", "battlefield", "Omni-Cheese Pizza");
        s = activate(s, "p1", pizza, "n'importe quelle couleur");
        expect(s.stack).toHaveLength(0);
        if (s.pending?.kind === "choice") s = act(s, "p1", { type: "choose", values: ["R"] });
        expect(s.players.p1?.manaPool.R).toBe(1);
        expect(idsOf(s, "p1", "graveyard", "Omni-Cheese Pizza")).toHaveLength(1);
      });
    });

    describe("Technodrome", () => {
      it("ni attaque ni blocage tant que sa force est inférieure à 6", () => {
        const s = scenario({
          p1: { battlefield: ["Technodrome", { name: "Technodrome", counters: { "+1/+1": 3 } }] },
        });
        const [weak, strong] = idsOf(s, "p1", "battlefield", "Technodrome") as [string, string];
        expect(chars(s, weak).keywords).toEqual(expect.arrayContaining(["cantAttack", "cantBlock", "reach", "trample"]));
        expect(chars(s, strong).power).toBe(6);
        expect(chars(s, strong).keywords).not.toContain("cantAttack");
        const cur = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
        expect(() => act(cur, "p1", { type: "declareAttackers", attackers: [{ id: weak, defender: "p2" }] })).toThrow();
        const after = act(cur, "p1", { type: "declareAttackers", attackers: [{ id: strong, defender: "p2" }] });
        expect(after.combat?.attackers.map((a) => a.id)).toContain(strong);
      });

      it("{T}, sacrifiez un autre artefact : piochez une carte et un marqueur +1/+1", () => {
        let s = scenario({ p1: { battlefield: ["Technodrome", "Omni-Cheese Pizza"], library: ["Opt", "Opt"] } });
        const drome = idOf(s, "p1", "battlefield", "Technodrome");
        s = settle(activate(s, "p1", drome, "Piochez", { sacrifice: [idOf(s, "p1", "battlefield", "Omni-Cheese Pizza")] }));
        expect(s.players.p1?.hand).toHaveLength(1);
        expect(s.objects[drome]?.counters["+1/+1"]).toBe(1);
        expect(idsOf(s, "p1", "graveyard", "Omni-Cheese Pizza")).toHaveLength(1);
        // Sans autre artefact : la capacité ne s'active pas (il ne peut pas se sacrifier lui-même).
        const t = scenario({ p1: { battlefield: ["Technodrome"] } });
        expect(canActivate(t, "p1", idOf(t, "p1", "battlefield", "Technodrome"), "Piochez")).toBe(false);
      });
    });

    it("Turtle Blimp : vol ; en arrivant, un Mutant rouge 2/2", () => {
      let s = scenario({ p1: { battlefield: lands("Island", 5), hand: ["Turtle Blimp"] } });
      s = settle(cast(s, "p1", "Turtle Blimp"));
      const blimp = idOf(s, "p1", "battlefield", "Turtle Blimp");
      expect(chars(s, blimp).keywords).toContain("flying");
      expect(chars(s, blimp).types).not.toContain("Creature");
      const mutant = idOf(s, "p1", "battlefield", "Mutant");
      expect([chars(s, mutant).power, chars(s, mutant).toughness]).toEqual([2, 2]);
      expect(chars(s, mutant).colors).toEqual(["R"]);
    });

    describe("Turtle Van", () => {
      const crewAndAttack = (s: S, crew: string) => {
        const van = idOf(s, "p1", "battlefield", "Turtle Van");
        let cur = settle(activate(s, "p1", van, "Équipage", { tap: [crew] }));
        expect(chars(cur, van).types).toContain("Creature");
        cur = attack(cur, [van]);
        return settle(cur);
      };

      it("en attaquant : un marqueur +1/+1 sur la créature qui l'a piloté (non doublé si ce n'est ni Mutant, ni Ninja, ni Tortue)", () => {
        const s = scenario({ p1: { battlefield: ["Turtle Van", { name: "Bear Cub", counters: { "+1/+1": 1 } }] } });
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        const after = crewAndAttack(s, bear);
        expect(after.objects[bear]?.counters["+1/+1"]).toBe(2);
      });

      it("une Tortue qui l'a piloté : un marqueur, puis ses marqueurs +1/+1 sont doublés", () => {
        const s = scenario({ p1: { battlefield: ["Turtle Van", { name: TURTLE, counters: { "+1/+1": 1 } }] } });
        const turtle = idOf(s, "p1", "battlefield", "Test Turtle");
        const after = crewAndAttack(s, turtle);
        expect(after.objects[turtle]?.counters["+1/+1"]).toBe(4);
      });
    });

    describe("Weather Maker", () => {
      it("champ de bataille : un marqueur charge par terrain qui arrive sous votre contrôle ; {T} : un mana de n'importe quelle couleur", () => {
        let s = scenario({ p1: { battlefield: ["Weather Maker"], hand: ["Forest"] } });
        const maker = idOf(s, "p1", "battlefield", "Weather Maker");
        expect(manaColors(s, maker)).toEqual(["B", "G", "R", "U", "W"]);
        s = settle(playLand(s, "p1", "Forest"));
        expect(s.objects[maker]?.counters.charge).toBe(1);
      });

      it("{T}, retirez deux marqueurs charge : {C}{C} ; pas sans les marqueurs", () => {
        let s = scenario({ p1: { battlefield: [{ name: "Weather Maker", counters: { charge: 2 } }] } });
        const maker = idOf(s, "p1", "battlefield", "Weather Maker");
        expect(canActivate(s, "p1", maker, "3 blessures")).toBe(false);
        s = activate(s, "p1", maker, "{C}{C}");
        expect(s.stack).toHaveLength(0);
        expect(s.players.p1?.manaPool.C).toBe(2);
        expect(s.objects[maker]?.counters.charge ?? 0).toBe(0);
      });

      it("{T}, retirez trois marqueurs charge : 3 blessures sur n'importe quelle cible", () => {
        let s = scenario({ p1: { battlefield: [{ name: "Weather Maker", counters: { charge: 3 } }] } });
        const maker = idOf(s, "p1", "battlefield", "Weather Maker");
        s = settle(activate(s, "p1", maker, "3 blessures", { targets: { t: ["p2"] } }));
        expect(s.players.p2?.life).toBe(17);
        expect(s.objects[maker]?.counters.charge ?? 0).toBe(0);
      });
    });

    it("Dimension X (et les autres terrains bicolores) : arrive engagé, vous gagnez 1 PV, {R} ou {W}", () => {
      let s = scenario({ p1: { hand: ["Dimension X"] } });
      s = settle(playLand(s, "p1", "Dimension X"));
      const land = idOf(s, "p1", "battlefield", "Dimension X");
      expect(s.objects[land]?.tapped).toBe(true);
      expect(s.players.p1?.life).toBe(21);
      const colorsOf = (name: string) => {
        const t = scenario({ p1: { battlefield: [name] } });
        return manaColors(t, idOf(t, "p1", "battlefield", name));
      };
      expect(colorsOf("Dimension X")).toEqual(["R", "W"]);
      expect(colorsOf("Foot Headquarters")).toEqual(["B", "W"]);
      expect(colorsOf("Illegitimate Business")).toEqual(["B", "G"]);
      expect(colorsOf("Mutant Town")).toEqual(["G", "U"]);
      expect(colorsOf("TCRI Building")).toEqual(["R", "U"]);
    });

    describe("Northampton Farm", () => {
      it("{1}, {T} : exile une créature que vous possédez (pas celle d'un adversaire) ; {T} : {C}", () => {
        const s = scenario({
          p1: { battlefield: ["Northampton Farm", "Wastes", "Bear Cub"] },
          p2: { battlefield: ["Serra Angel"] },
        });
        const farm = idOf(s, "p1", "battlefield", "Northampton Farm");
        expect(manaColors(s, farm)).toEqual(["C"]);
        const angel = idOf(s, "p2", "battlefield", "Serra Angel");
        expect(() => activate(s, "p1", farm, "Exilez", { targets: { t: [angel] } })).toThrow();
        const after = settle(activate(s, "p1", farm, "Exilez", { targets: { t: [idOf(s, "p1", "battlefield", "Bear Cub")] } }));
        expect(inExile(after, "Bear Cub")).toHaveLength(1);
      });

      it("{2}, {T}, sacrifice : une créature exilée revient sous votre contrôle, les autres cartes en main", () => {
        let s = scenario({ p1: { battlefield: ["Northampton Farm", ...lands("Wastes", 4), "Bear Cub", "Llanowar Elves"] } });
        const farm = idOf(s, "p1", "battlefield", "Northampton Farm");
        s = settle(activate(s, "p1", farm, "Exilez", { targets: { t: [idOf(s, "p1", "battlefield", "Bear Cub")] } }));
        // Le terrain se dégage au tour suivant de p1.
        s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.turn.number > 3);
        s = settle(activate(s, "p1", farm, "Exilez", { targets: { t: [idOf(s, "p1", "battlefield", "Llanowar Elves")] } }));
        expect(inExile(s, "Bear Cub")).toHaveLength(1);
        expect(inExile(s, "Llanowar Elves")).toHaveLength(1);
        s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.turn.number > 5);
        s = settle(activate(s, "p1", farm, "revient"), (req, _player, cur) => pickNamed(cur, req, "Llanowar Elves"));
        expect(idsOf(s, "p1", "battlefield", "Llanowar Elves")).toHaveLength(1);
        expect(idsOf(s, "p1", "hand", "Bear Cub")).toHaveLength(1);
        expect(inExile(s, "Bear Cub")).toHaveLength(0);
        expect(idsOf(s, "p1", "graveyard", "Northampton Farm")).toHaveLength(1);
      });
    });

    describe("Turtle Lair", () => {
      it("{T} : {C} ; ou un mana de n'importe quelle couleur, seulement pour un sort de Ninja ou de Tortue", () => {
        const s = scenario({ p1: { battlefield: ["Turtle Lair"], hand: ["Llanowar Elves", TURTLE] } });
        expect(() => cast(s, "p1", "Llanowar Elves")).toThrow();
        const after = settle(cast(s, "p1", "Test Turtle"));
        expect(idsOf(after, "p1", "battlefield", "Test Turtle")).toHaveLength(1);
      });

      it("{3}, {T} : un Ninja ou une Tortue ne peut pas être bloqué ce tour-ci", () => {
        let s = scenario({ p1: { battlefield: ["Turtle Lair", ...lands("Wastes", 3), TURTLE, "Bear Cub"] } });
        const lair = idOf(s, "p1", "battlefield", "Turtle Lair");
        const turtle = idOf(s, "p1", "battlefield", "Test Turtle");
        expect(() => activate(s, "p1", lair, "bloqué", { targets: { t: [idOf(s, "p1", "battlefield", "Bear Cub")] } })).toThrow();
        s = settle(activate(s, "p1", lair, "bloqué", { targets: { t: [turtle] } }));
        expect(chars(s, turtle).keywords).toContain("unblockable");
      });
    });
  });
});

describe("lot B1, faufilement", () => {
  const toBlockers = (s: S, attackers: string[]) => {
    let cur = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    cur = act(cur, "p1", { type: "declareAttackers", attackers: attackers.map((id) => ({ id, defender: "p2" })) });
    return advanceUntil(
      cur,
      (x) => x.turn.step === "declareBlockers" && x.pending?.kind === "priority" && x.pending.player === "p1",
    );
  };
  const castOpt = (s: S, card: string) =>
    legalActions(s, "p1").find((a): a is Extract<ActionOption, { type: "cast" }> => a.type === "cast" && a.card === card);

  it("702.190a : à l'étape des bloqueurs, une créature ne se lance que pour son faufilement ; l'attaquant renvoyé est au choix", () => {
    let s = scenario({
      p1: { battlefield: ["Bear Cub", "Serra Angel", ...Array(5).fill("Plains")], hand: ["Leonardo, Leader in Blue"] },
    });
    const card = idOf(s, "p1", "hand", "Leonardo, Leader in Blue");
    // En phase principale, pas de faufilement.
    expect(() => act(s, "p1", { type: "cast", card, alternative: true })).toThrow();
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    const angel = idOf(s, "p1", "battlefield", "Serra Angel");
    s = toBlockers(s, [bear, angel]);
    const opt = castOpt(s, card);
    expect(opt?.altAvailable).toBe(true);
    expect(opt?.normalAvailable).toBeUndefined();
    expect(opt?.altBounce).toEqual([bear, angel]);
    s = act(s, "p1", { type: "cast", card, alternative: true, bounce: [angel] });
    expect(idsOf(s, "p1", "hand", "Serra Angel")).toHaveLength(1);
    s = passAccepting(s, (x) => x.stack.length === 0 && x.triggers.length === 0);
    const leo = idOf(s, "p1", "battlefield", "Leonardo, Leader in Blue");
    expect(s.objects[leo]?.tapped).toBe(true);
    expect(s.combat?.attackers.find((a) => a.id === leo)?.defender).toBe("p2");
  });

  it("un rituel faufilé se lance à l'étape des bloqueurs (Leonardo's Technique)", () => {
    let s = scenario({
      p1: { battlefield: ["Bear Cub", "Plains", "Plains"], hand: ["Leonardo's Technique"], graveyard: ["Llanowar Elves"] },
    });
    s = toBlockers(s, [idOf(s, "p1", "battlefield", "Bear Cub")]);
    const elves = idOf(s, "p1", "graveyard", "Llanowar Elves");
    s = act(s, "p1", {
      type: "cast",
      card: idOf(s, "p1", "hand", "Leonardo's Technique"),
      alternative: true,
      targets: { t: [elves] },
    });
    s = passAccepting(s, (x) => x.stack.length === 0 && x.triggers.length === 0);
    expect(idsOf(s, "p1", "battlefield", "Llanowar Elves")).toHaveLength(1);
    expect(idsOf(s, "p1", "hand", "Bear Cub")).toHaveLength(1);
  });
});

describe("lot C1, cartes uniques", () => {
  const settleAll = (s: S, answer: (req: ChoiceRequest) => ChoiceValue[] | undefined = () => undefined): S => {
    let cur = s;
    for (let i = 0; i < 300; i++) {
      const p = cur.pending;
      if (p?.kind === "priority" && cur.stack.length === 0 && cur.triggers.length === 0 && i > 0) break;
      if (p?.kind === "priority") cur = act(cur, p.player, { type: "pass" });
      else if (p?.kind === "choice")
        cur = act(cur, p.player, { type: "choose", values: answer(p.request) ?? p.request.suggested });
      else break;
    }
    return cur;
  };
  const castCard = (s: S, name: string, extra: object = {}) =>
    act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", name), ...extra });
  const activateFirst = (s: S, source: string, extra: object = {}) => {
    const a = legalActions(s, "p1").find(
      (x): x is Extract<ActionOption, { type: "activate" }> => x.type === "activate" && x.source === source,
    );
    return act(s, "p1", { type: "activate", source, ability: a?.ability ?? -1, ...extra });
  };
  const toBlockers = (s: S, attackers: string[]) => {
    let cur = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    cur = act(cur, "p1", { type: "declareAttackers", attackers: attackers.map((id) => ({ id, defender: "p2" })) });
    return advanceUntil(
      cur,
      (x) => x.turn.step === "declareBlockers" && x.pending?.kind === "priority" && x.pending.player === "p1",
    );
  };

  it("April O'Neil, Hacktivist : une carte par type de carte parmi vos sorts lancés ce tour-ci", () => {
    let s = scenario({
      p1: {
        battlefield: ["April O'Neil, Hacktivist", "Mountain", "Mountain", "Forest"],
        hand: ["Lightning Strike", "Llanowar Elves"],
        library: Array(6).fill("Island"),
      },
    });
    s = settleAll(castCard(s, "Lightning Strike", { targets: { t: ["p2"] } }));
    s = settleAll(castCard(s, "Llanowar Elves"));
    const hand = s.players.p1?.hand.length ?? 0;
    s = advanceUntil(s, (x) => x.turn.step === "end" && x.stack.length > 0);
    s = settleAll(s);
    expect(s.players.p1?.hand.length).toBe(hand + 2);
  });

  it("Fugitive Droid : ne contrecarre qu'un sort qui cible un de vos artefacts ou créatures", () => {
    let s = scenario({
      p1: { battlefield: ["Fugitive Droid", "Island", "Bear Cub"] },
      p2: { battlefield: ["Mountain", "Mountain", "Mountain", "Mountain"], hand: ["Lightning Strike", "Lightning Strike"] },
    });
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1" && x.pending?.player === "p2");
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    const [toPlayer, toBearCard] = idsOf(s, "p2", "hand", "Lightning Strike") as [string, string];
    s = act(s, "p2", { type: "cast", card: toPlayer, targets: { t: ["p1"] } });
    s = act(s, "p2", { type: "cast", card: toBearCard, targets: { t: [bear] } });
    const droid = idOf(s, "p1", "battlefield", "Fugitive Droid");
    s = act(s, "p2", { type: "pass" });
    const opt = legalActions(s, "p1").find(
      (a): a is Extract<ActionOption, { type: "activate" }> => a.type === "activate" && a.source === droid,
    );
    const onBear = s.stack.find((x) => x.targets.t?.includes(bear))?.id as string;
    expect(opt?.targets[0]?.legal).toEqual([onBear]);
    s = settleAll(act(s, "p1", { type: "activate", source: droid, ability: opt?.ability ?? -1, targets: { t: [onBear] } }));
    expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
    expect(s.players.p1?.life).toBe(17);
  });

  it("Mondo Gecko : de la couleur choisie et défense talismanique contre elle jusqu'à la fin du tour", () => {
    let s = scenario({
      p1: { battlefield: ["Mondo Gecko", "Island"], hand: ["Opt"] },
      p2: { battlefield: ["Mountain", "Mountain"], hand: ["Lightning Strike"] },
    });
    const gecko = idOf(s, "p1", "battlefield", "Mondo Gecko");
    s = settleAll(activateFirst(s, gecko, { discard: [idOf(s, "p1", "hand", "Opt")] }), (req) =>
      req.type === "pick" && req.options.includes("R") ? ["R"] : undefined,
    );
    expect(chars(s, gecko).colors).toEqual(["R"]);
    // Le sort rouge de l'adversaire ne peut pas le cibler.
    s = act(s, "p1", { type: "pass" });
    const strike = legalActions(s, "p2").find((a): a is Extract<ActionOption, { type: "cast" }> => a.type === "cast");
    expect(strike?.modes[0]?.targets[0]?.legal ?? []).not.toContain(gecko);
  });

  describe("Ninja Teen", () => {
    it("niveau 3 : une carte de créature du cimetière se lance par son faufilement {3}{B} à l'étape des bloqueurs", () => {
      let s = scenario({
        p1: { battlefield: ["Ninja Teen", "Bear Cub", ...Array(4).fill("Swamp")], graveyard: ["Serra Angel"] },
      });
      const teen = idOf(s, "p1", "battlefield", "Ninja Teen");
      (s.objects[teen] as { classLevel?: number }).classLevel = 3;
      s.version += 1;
      const angel = idOf(s, "p1", "graveyard", "Serra Angel");
      expect(legalActions(s, "p1").some((a) => a.type === "cast" && a.card === angel)).toBe(false);
      s = toBlockers(s, [idOf(s, "p1", "battlefield", "Bear Cub")]);
      s = act(s, "p1", { type: "cast", card: angel });
      s = passAccepting(s, (x) => x.stack.length === 0 && x.triggers.length === 0);
      const a = idOf(s, "p1", "battlefield", "Serra Angel");
      expect(s.objects[a]?.tapped).toBe(true);
      expect(s.combat?.attackers.some((x) => x.id === a)).toBe(true);
      expect(idsOf(s, "p1", "hand", "Bear Cub")).toHaveLength(1);
      // Une de vos créatures est partie (l'Ourson renvoyé) : l'adversaire a perdu 1 PV.
      expect(s.players.p2?.life).toBe(19);
    });
  });

  it("Rat King, Verminister : sacrifiez trois Rats (lui compris) ; la carte ciblée et ses homonymes reviennent engagés", () => {
    const rat = customCard({ name: "Test Rat", subtypes: ["Rat"], power: 1, toughness: 1 });
    let s = scenario({
      p1: { battlefield: ["Rat King, Verminister", rat, rat], graveyard: ["Bear Cub", "Bear Cub", "Serra Angel"] },
    });
    const king = idOf(s, "p1", "battlefield", "Rat King, Verminister");
    const [bear] = idsOf(s, "p1", "graveyard", "Bear Cub") as [string];
    const rats = idsOf(s, "p1", "battlefield", "Test Rat");
    s = settleAll(activateFirst(s, king, { sacrifice: [king, ...rats], targets: { t: [bear] } }));
    const bears = idsOf(s, "p1", "battlefield", "Bear Cub");
    expect(bears).toHaveLength(2);
    expect(bears.every((id) => s.objects[id]?.tapped)).toBe(true);
    expect(idsOf(s, "p1", "graveyard", "Serra Angel")).toHaveLength(1);
    expect(idsOf(s, "p1", "graveyard", "Rat King, Verminister")).toHaveLength(1);
  });

  it("Don & Raph, Hard Science : en attaquant, le prochain sort non-créature a l'affinité pour les artefacts", () => {
    let s = scenario({
      p1: { battlefield: ["Don & Raph, Hard Science", "Buzz Bots", "Buzz Bots", "Mountain"], hand: ["Lightning Strike"] },
    });
    s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    s = act(s, "p1", {
      type: "declareAttackers",
      attackers: [{ id: idOf(s, "p1", "battlefield", "Don & Raph, Hard Science"), defender: "p2" }],
    });
    s = advanceUntil(s, (x) => x.turn.step === "main2");
    // Lightning Strike ({1}{R}) coûte {R} de moins deux : une seule Montagne suffit.
    const life = s.players.p2?.life ?? 20;
    s = settleAll(castCard(s, "Lightning Strike", { targets: { t: ["p2"] } }));
    expect(s.players.p2?.life).toBe(life - 3);
  });

  it("Mikey & Don : un sort de Tortue lancé du dessus de la bibliothèque arrive avec un marqueur +1/+1 de plus", () => {
    let s = scenario({
      p1: {
        battlefield: ["Mikey & Don, Party Planners", "Plains", "Plains"],
        library: ["Lita, Little Orphan Amphibian", "Forest"],
      },
    });
    const lita = s.players.p1?.library[0] as string;
    s = settleAll(act(s, "p1", { type: "cast", card: lita }));
    const on = idOf(s, "p1", "battlefield", "Lita, Little Orphan Amphibian");
    expect(s.objects[on]?.counters["+1/+1"]).toBe(1);
    const forest = s.players.p1?.library[0] as string;
    s = act(s, "p1", { type: "playLand", card: forest });
    expect(idsOf(s, "p1", "battlefield", "Forest")).toHaveLength(1);
  });

  it("Kitsune's Technique : la moitié de la bibliothèque, arrondie au supérieur, en une seule meule", () => {
    let s = scenario({
      p1: { battlefield: Array(6).fill("Island"), hand: ["Kitsune's Technique"] },
      p2: { library: Array(5).fill("Island") },
    });
    s = settleAll(castCard(s, "Kitsune's Technique", { targets: { t: ["p2"] } }));
    expect(s.players.p2?.graveyard).toHaveLength(3);
  });
});

describe("« Vous mettez des marqueurs » (lot K2)", () => {
  it("Mikey & Leo : seuls les marqueurs que vous mettez sur vos créatures le déclenchent", () => {
    const setup = (active: PlayerId) =>
      scenario({
        active,
        p1: { battlefield: ["Plains", "Bear Cub", "Mikey & Leo, Chaos & Order"], hand: ["Fleeting Flight"] },
        p2: { battlefield: ["Plains", "Bear Cub"], hand: ["Fleeting Flight"] },
      });
    const a = setup("p2");
    expect(counterFrom(a, "p2", idOf(a, "p1", "battlefield", "Bear Cub")).triggered).toEqual([]);
    const b = setup("p1");
    expect(counterFrom(b, "p1", idOf(b, "p1", "battlefield", "Bear Cub")).triggered).toEqual(["Mikey & Leo, Chaos & Order"]);
    expect(counterFrom(b, "p1", idOf(b, "p2", "battlefield", "Bear Cub")).triggered).toEqual([]);
  });
});
