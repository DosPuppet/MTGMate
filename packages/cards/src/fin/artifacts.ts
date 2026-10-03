/** Final Fantasy — artefacts incolores. */
import type { CardScript } from "@mtgx/engine";
import {
  activated,
  amount,
  fx,
  jobGear,
  manaAbility,
  ref,
  staticAbility,
  TOWN,
  TREASURE,
  target,
  triggered,
  when,
} from "./common";

export const ARTIFACTS: Record<string, CardScript> = {
  "Adventurer's Airship": { abilities: [triggered(when.attacksSelf, fx.loot(1), { label: "Piochez, défaussez" })] },
  "Instant Ramen": {
    abilities: [
      triggered(when.entersSelf, [fx.draw(1)], { label: "Piochez" }),
      activated({ mana: "{2}", tap: true, sacrifice: true, effects: [fx.gainLife(3)], label: "+3 PV" }),
    ],
  },
  "Lion Heart": {
    abilities: [
      triggered(when.entersSelf, [fx.damage(2, ref.target())], { targets: [target.any("t")], label: "2 blessures" }),
      staticAbility("attached", { power: 2, toughness: 1 }, { label: "+2/+1" }),
    ],
  },
  "Lunatic Pandora": {
    abilities: [
      activated({ mana: "{2}", tap: true, effects: [fx.surveil(1)], label: "Surveillance 1" }),
      activated({
        mana: "{6}",
        tap: true,
        sacrifice: true,
        targets: [target.nonland("t")],
        effects: [fx.destroy(ref.target())],
        label: "Détruisez un permanent non-terrain",
      }),
    ],
  },
  "Magic Pot": {
    abilities: [
      triggered(when.diesSelf, [fx.createTokens(TREASURE)], { label: "Trésor" }),
      activated({
        mana: "{2}",
        tap: true,
        targets: [target.cardInGraveyard("t", {}, "any", "carte")],
        effects: [fx.exileCard(ref.target())],
        label: "Exilez une carte d'un cimetière",
      }),
    ],
  },
  "Monk's Fist": { abilities: jobGear("Monk", 1, 0) },
  "PuPu UFO": {
    abilities: [
      activated({
        tap: true,
        effects: [
          fx.pickFromZone("hand", { types: ["Land"] }, { to: "battlefield" }, { min: 0, prompt: "Mettez un terrain en jeu" }),
        ],
        label: "Un terrain de votre main",
      }),
      activated({
        mana: "{3}",
        effects: [fx.setBasePTAll({ self: true }, amount.count({ ...TOWN, controller: "you" }), true)],
        label: "Force de base = nombre de Villes",
      }),
    ],
  },
  "The Regalia": {
    abilities: [
      triggered(when.attacksSelf, [fx.revealUntil({ types: ["Land"] }, { to: "battlefield", tapped: true })], {
        label: "Révélez jusqu'à un terrain",
      }),
    ],
  },
  "Ring of the Lucii": {
    abilities: [
      manaAbility("C", 2),
      activated({
        mana: "{2}",
        tap: true,
        payLife: 1,
        targets: [target.nonland("t")],
        effects: [fx.tap(ref.target())],
        label: "Engagez un permanent non-terrain",
      }),
    ],
  },
  "World Map": {
    abilities: [
      activated({
        mana: "{1}",
        tap: true,
        sacrifice: true,
        effects: [fx.search({ types: ["Land"], basic: true })],
        label: "Cherchez un terrain de base",
      }),
      activated({
        mana: "{3}",
        tap: true,
        sacrifice: true,
        effects: [fx.search({ types: ["Land"] })],
        label: "Cherchez un terrain",
      }),
    ],
  },
};
