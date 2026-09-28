/** Duskmourn — cartes vertes. */
import {
  activated,
  BASIC_LAND,
  type CardScript,
  cond,
  fx,
  manaAbility,
  modal,
  mode,
  ref,
  spell,
  staticAbility,
  survival,
  target,
  triggered,
  when,
} from "./common";

export const GREEN: Record<string, CardScript> = {
  "Altanak, the Thrice-Called": {
    abilities: [
      triggered({ on: "becomesTarget", who: "self", byOpponent: true }, [fx.draw(1)], { label: "Piochez une carte" }),
      activated({
        mana: "{1}{G}",
        fromHand: true,
        discardSelf: true,
        targets: [target.cardInGraveyard("t", { types: ["Land"] }, "you", "carte de terrain de votre cimetière")],
        effects: [fx.toBattlefield(ref.target(), { tapped: true })],
        label: "Défaussez-la : un terrain de votre cimetière revient engagé",
      }),
    ],
  },
  "Balustrade Wurm": {
    cantBeCountered: true,
    abilities: [
      activated({
        mana: "{2}{G}{G}",
        fromGraveyard: true,
        sorcerySpeed: true,
        activationCondition: cond.delirium,
        effects: [fx.toBattlefield(ref.self, { counters: { kind: "finality", n: 1 } })],
        label: "Délire — Revient avec un marqueur de finalité",
      }),
    ],
  },
  "Bashful Beastie": {
    abilities: [triggered(when.diesSelf, [fx.manifestDread], { label: "Manifestation effroyable" })],
  },
  "Break Down the Door": {
    spell: modal(
      mode("Exilez un artefact", [target.permanent("a", ["Artifact"], {}, "artefact")], [fx.exile(ref.target("a"))]),
      mode("Exilez un enchantement", [target.permanent("e", ["Enchantment"], {}, "enchantement")], [fx.exile(ref.target("e"))]),
      mode("Manifestation effroyable", [], [fx.manifestDread]),
    ),
  },
  "Cautious Survivor": { abilities: [survival([fx.gainLife(2)], { label: "+2 PV" })] },
  "Defiant Survivor": { abilities: [survival([fx.manifestDread], { label: "Manifestation effroyable" })] },
  "Flesh Burrower": {
    abilities: [
      triggered(when.attacksSelf, [fx.pump(ref.target(), 0, 0, ["deathtouch"])], {
        targets: [target.creature("t", { controller: "you", other: true })],
        label: "Contact mortel",
      }),
    ],
  },
  "Frantic Strength": {
    enchant: { filter: { types: ["Creature"] }, label: "créature" },
    abilities: [
      staticAbility("attached", { power: 2, toughness: 2, addKeywords: ["trample"] }, { label: "+2/+2 et le piétinement" }),
    ],
  },
  "Grasping Longneck": {
    abilities: [triggered(when.diesSelf, [fx.gainLife(2)], { label: "+2 PV" })],
  },
  Greenhouse: {
    abilities: [
      staticAbility(
        { types: ["Land"], controller: "you" },
        { addAbilities: [manaAbility(["W", "U", "B", "R", "G"])] },
        { label: "Vos terrains : « {T} : un mana de n'importe quelle couleur »" },
      ),
    ],
  },
  "Rickety Gazebo": {
    abilities: [
      triggered(
        when.unlockThisDoor,
        [
          fx.mill(4, ref.you, { name: "m" }),
          fx.pickFromZone("graveyard", { permanent: true }, { to: "hand" }, { count: 2, min: 0, pool: ref.stored("m") }),
        ],
        { label: "Meulez 4, jusqu'à deux cartes de permanent en main" },
      ),
    ],
  },
  "Horrid Vigor": {
    spell: spell([target.creature()], [fx.pump(ref.target(), 0, 0, ["deathtouch", "indestructible"])]),
  },
  "House Cartographer": {
    abilities: [survival([fx.revealUntil({ types: ["Land"] })], { label: "Révélez jusqu'à un terrain" })],
  },
  "Kona, Rescue Beastie": {
    abilities: [
      survival(
        [fx.pickFromZone("hand", { permanent: true }, { to: "battlefield" }, { min: 0, prompt: "Un permanent de votre main" })],
        {
          label: "Mettez un permanent de votre main en jeu",
        },
      ),
    ],
  },
  "Manifest Dread": { spell: spell([], [fx.manifestDread]) },
  "Patchwork Beastie": {
    abilities: [
      staticAbility(
        "self",
        { addKeywords: ["cantAttack", "cantBlock"] },
        {
          condition: cond.not(cond.delirium),
          label: "Délire — ne peut ni attaquer ni bloquer sans délire",
        },
      ),
      triggered(when.yourUpkeep, [...fx.may("Meuler une carte ?", fx.mill(1))], { label: "Meulez une carte" }),
    ],
  },
  "Spineseeker Centipede": {
    abilities: [
      triggered(when.entersSelf, [fx.search(BASIC_LAND)], { label: "Cherchez un terrain de base" }),
      staticAbility(
        "self",
        { power: 1, toughness: 2, addKeywords: ["vigilance"] },
        {
          condition: cond.delirium,
          label: "Délire — +1/+2 et la vigilance",
        },
      ),
    ],
  },
  "Under the Skin": {
    spell: spell(
      [],
      [
        fx.manifestDread,
        fx.pickFromZone("graveyard", { permanent: true }, { to: "hand" }, { min: 0, prompt: "Une carte de permanent" }),
      ],
    ),
  },
  "Wary Watchdog": {
    abilities: [
      triggered(when.entersSelf, [fx.surveil(1)], { label: "Surveillance 1" }),
      triggered(when.diesSelf, [fx.surveil(1)], { label: "Surveillance 1" }),
    ],
  },
  "Wickerfolk Thresher": {
    abilities: [
      triggered(when.attacksSelf, [fx.lookAtTop(1, { filter: { types: ["Land"] }, to: { to: "battlefield" }, rest: "hand" })], {
        condition: cond.delirium,
        label: "Délire — un terrain du dessus en jeu, sinon en main",
      }),
    ],
  },
};
