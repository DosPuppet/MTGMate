/** Special Guests (SPG) : scripts des cartes (PLAN-G). */
import type { Effect, ObjectFilter } from "@mtgx/engine";
import { activated, amount, type CardScript, cond, fx, manaAbility, ref, spell, target, triggered, when } from "../tdm/common";

/**
 * Champion (702.72) : « quand cette créature arrive, sacrifiez-la à moins d'exiler un autre [filtre] que vous contrôlez ;
 * quand elle quitte le champ de bataille, la carte revient ». `then` : ce qui suit quand un objet a été championné.
 */
function champion(filter: ObjectFilter, label: string, then: Effect[] = []) {
  const championed = cond.amountAtLeast(amount.refCount(ref.stored("champ")), 1);
  return triggered(
    when.entersSelf,
    [
      fx.chooseAmong(ref.permanentsOf(ref.you, { ...filter, other: true }), ref.you, "champ", {
        optional: true,
        prompt: `Champion : exilez ${label} que vous contrôlez (sinon, sacrifiez cette créature)`,
      }),
      fx.exileUntilLeaves(ref.stored("champ")),
      ...fx.when(cond.not(championed), fx.sacrificeIt(ref.self)),
      ...(then.length ? fx.when(championed, then) : []),
    ],
    { label: `Champion : ${label}` },
  );
}

export const CARDS: Record<string, CardScript> = {
  "Chrome Mox": {
    abilities: [
      triggered(when.entersSelf, [fx.exileFromHandLinked(ref.you, { notTypes: ["Artifact", "Land"] }, false, undefined, true)], {
        label: "Empreinte : vous pouvez exiler une carte non-artefact non-terrain de votre main",
      }),
      manaAbility(["W", "U", "B", "R", "G"], 1, { linkedColors: true }),
    ],
  },
  // Affinité pour les artefacts : lue dans le texte.
  Frogmite: {},
  "Galvanic Blast": {
    // Métallurgie : 4 blessures au lieu de 2 si vous contrôlez au moins trois artefacts (à la résolution).
    spell: spell(
      [target.any()],
      [
        ...fx.when(cond.controls({ types: ["Artifact"], controller: "you" }, 3), fx.damage(4, ref.target())),
        ...fx.when(cond.not(cond.controls({ types: ["Artifact"], controller: "you" }, 3)), fx.damage(2, ref.target())),
      ],
    ),
  },
  "Helix Pinnacle": {
    // Défense totale : lue dans le texte.
    abilities: [
      activated({ mana: "{X}", effects: [fx.counters(ref.self, "tower", amount.x)], label: "X marqueurs de tour" }),
      triggered(when.yourUpkeep, [fx.winGame], {
        condition: cond.amountAtLeast(amount.countersOn(ref.self, "tower"), 100),
        label: "100 marqueurs de tour ou plus : vous gagnez la partie",
      }),
    ],
  },
  "Mistbind Clique": {
    abilities: [
      champion({ types: ["Creature"], subtype: "Faerie" }, "une Fée", [
        fx.reflexive([target.player("p")], [fx.tap(ref.permanentsOf(ref.target("p"), { types: ["Land"] }))]),
      ]),
    ],
  },
  // Affinité pour les artefacts : lue dans le texte.
  Thoughtcast: { spell: spell([], [fx.draw(2)]) },
  "Wanderwine Prophets": {
    abilities: [
      champion({ types: ["Creature"], subtype: "Merfolk" }, "un Ondin"),
      triggered(
        when.combatDamageToPlayer,
        [fx.sacrifice(ref.you, { subtype: "Merfolk" }, 1, { optional: true, store: "m" }), ...fx.when(cond.v("m"), fx.extraTurn)],
        { label: "Vous pouvez sacrifier un Ondin : un tour supplémentaire" },
      ),
    ],
  },
};
