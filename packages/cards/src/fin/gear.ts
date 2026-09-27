/** Final Fantasy — Équipements de job et autres Équipements (lot B). */
import type { CardScript } from "@mtgx/engine";
import { activated, amount, cond, fx, jobGear, ref, staticAbility, target, triggered, wardAbility, when } from "./common";

/** Équipement : « la créature équipée a “[capacité]” ». */
const grants = (label: string, ...abilities: Parameters<typeof staticAbility>[1]["addAbilities"] & object) =>
  staticAbility("attached", { addAbilities: abilities }, { label });

export const GEAR: Record<string, CardScript> = {
  "Astrologian's Planisphere": {
    abilities: [
      staticAbility("attached", { addSubtypes: ["Wizard"] }, { label: "Sorcier" }),
      grants(
        "Marqueur +1/+1 (sort non-créature, troisième carte piochée)",
        triggered(when.castSpell("you", { notTypes: ["Creature"] }), [fx.addCounters(ref.self, 1)], { label: "Marqueur +1/+1" }),
        triggered(when.draw(3), [fx.addCounters(ref.self, 1)], { label: "Troisième carte : marqueur +1/+1" }),
      ),
    ],
  },
  "Dark Knight's Greatsword": {
    abilities: [
      ...(jobGear("Knight", 3, 0) ?? []),
      activated({
        payLife: 3,
        oncePerTurn: true,
        sorcerySpeed: true,
        targets: [target.creature("t", { controller: "you" })],
        effects: [fx.attach(ref.target())],
        label: "Équiper — payez 3 points de vie",
      }),
    ],
  },
  "Dragoon's Lance": {
    abilities: [
      ...(jobGear("Knight", 1, 0) ?? []),
      staticAbility("attached", { addKeywords: ["flying"] }, { condition: cond.yourTurn, label: "Vol pendant votre tour" }),
    ],
  },
  "Machinist's Arsenal": {
    abilities: [
      staticAbility("attached", { addSubtypes: ["Artificer"] }, { label: "Artificier" }),
      staticAbility(
        "attached",
        { power: 2, toughness: 2 },
        { per: { types: ["Artifact"], controller: "you" }, label: "+2/+2 par artefact" },
      ),
    ],
  },
  "Ninja's Blades": {
    abilities: [
      ...(jobGear("Ninja", 1, 1) ?? []),
      grants(
        "Blessures de combat : piochez, défaussez, perte de PV",
        triggered(
          when.combatDamageToPlayer,
          [fx.draw(1), fx.discard(1, ref.you, { store: "d" }), fx.loseLife(amount.manaValueOf(ref.stored("d")), ref.eventPlayer)],
          { label: "Piochez, défaussez, il perd la VM en PV" },
        ),
      ),
    ],
  },
  "Paladin's Arms": {
    abilities: [
      ...(jobGear("Knight", 2, 1) ?? []),
      staticAbility(
        "attached",
        { addAbilities: [wardAbility({ mana: { generic: 1, colored: {}, x: 0 } })] },
        { label: "Garde {1}" },
      ),
    ],
  },
  "Sage's Nouliths": {
    abilities: [
      ...(jobGear("Cleric", 1, 0) ?? []),
      grants(
        "Attaque : dégagez une créature attaquante",
        triggered(when.attacksSelf, [fx.untap(ref.target())], {
          targets: [target.creature("t", { attacking: true })],
          label: "Dégagez une créature attaquante",
        }),
      ),
    ],
  },
  "Thief's Knife": {
    abilities: [
      ...(jobGear("Rogue", 1, 1) ?? []),
      grants("Blessures de combat : piochez", triggered(when.combatDamageToPlayer, [fx.draw(1)], { label: "Piochez" })),
    ],
  },
  "White Mage's Staff": {
    abilities: [
      ...(jobGear("Cleric", 1, 1) ?? []),
      grants("Attaque : +1 PV", triggered(when.attacksSelf, [fx.gainLife(1)], { label: "+1 PV" })),
    ],
  },
  "Summoner's Grimoire": {
    abilities: [
      staticAbility("attached", { addSubtypes: ["Shaman"] }, { label: "Chaman" }),
      grants(
        "Attaque : une créature de votre main",
        triggered(
          when.attacksSelf,
          [
            fx.pickFromZone(
              "hand",
              { types: ["Creature"], notTypes: ["Enchantment"] },
              { to: "battlefield" },
              { min: 0, store: "c" },
            ),
            fx.when(
              cond.not(cond.v("c")),
              fx.pickFromZone(
                "hand",
                { types: ["Creature", "Enchantment"] },
                { to: "battlefield", tapped: true, attacking: true },
                { min: 0 },
              ),
            ),
          ],
          { label: "Mettez une créature de votre main en jeu" },
        ),
      ),
    ],
  },
  "Excalibur II": {
    abilities: [
      triggered(when.gainLife, [fx.counters(ref.self, "charge", 1)], { label: "Marqueur de charge" }),
      staticAbility("attached", { power: 1, toughness: 1 }, { perCounter: "charge", label: "+1/+1 par marqueur de charge" }),
    ],
  },
};
