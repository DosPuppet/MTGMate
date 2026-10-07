/**
 * Marvel's Spider-Man — cartes multicolores (lot A). Le vol, l'initiative, la double initiative, le piétinement, le lien
 * de vie, la célérité, la vigilance, la menace, le contact mortel, la garde, Web-slinging et le chaos (Mayhem) sont lus
 * dans le texte ; « ne peut pas être bloquée » est écrit ici (restriction).
 */
import type { AbilityDef, ObjectFilter } from "@mtgx/engine";
import {
  activated,
  amount,
  type CardScript,
  cond,
  entersWith,
  fx,
  HUMAN_CITIZEN,
  playerStatic,
  ref,
  spell,
  staticAbility,
  TREASURE,
  target,
  triggered,
  when,
} from "./common";

const YOUR_CREATURES: ObjectFilter = { types: ["Creature"], controller: "you" };
const MODIFIED_YOURS: ObjectFilter = { ...YOUR_CREATURES, modified: true };
const OTHER_VILLAINS: ObjectFilter = { subtype: "Villain", controller: "you", other: true };

/** Symbiote Spider-Man : « Chaque fois que cette créature inflige des blessures de combat à un joueur, … » (donnée par Find New Host). */
const SYMBIOTE_DAMAGE: AbilityDef = triggered(
  when.combatDamageToPlayer,
  [fx.lookAtTop(amount.eventAmount, { count: 1, exact: true, rest: "graveyard" })],
  { label: "Regardez autant de cartes du dessus : une en main, les autres au cimetière" },
);

export const MULTI: Record<string, CardScript> = {
  "Araña, Heart of the Spider": {
    abilities: [
      triggered(when.attackWith(), [fx.addCounters(ref.target(), 1)], {
        targets: [target.creature("t", { attacking: true })],
        label: "Un marqueur +1/+1 sur une créature attaquante",
      }),
      triggered(when.combatDamage(MODIFIED_YOURS, true), [fx.exileTop(ref.you, 1, "a"), fx.grantPlay(ref.stored("a"))], {
        label: "Exilez la carte du dessus : vous pouvez la jouer ce tour-ci",
      }),
    ],
  },
  "Biorganic Carapace": {
    // Équiper {2} : lu dans le texte.
    abilities: [
      triggered(when.entersSelf, [fx.attach(ref.target())], {
        targets: [target.creature("t", { controller: "you" })],
        label: "S'attache à une créature que vous contrôlez",
      }),
      staticAbility(
        "attached",
        {
          power: 2,
          toughness: 2,
          addAbilities: [
            triggered(when.combatDamageToPlayer, [fx.draw(amount.count(MODIFIED_YOURS))], {
              label: "Piochez une carte par créature modifiée que vous contrôlez",
            }),
          ],
        },
        { label: "+2/+2 et pioche à chaque blessure de combat infligée à un joueur" },
      ),
    ],
  },
  "Cosmic Spider-Man": {
    abilities: [
      triggered(
        when.yourCombat,
        [
          fx.pumpAll({ subtype: "Spider", controller: "you", other: true }, 0, 0, [
            "flying",
            "firstStrike",
            "trample",
            "lifelink",
            "haste",
          ]),
        ],
        { label: "Vos autres Araignées gagnent le vol, l'initiative, le piétinement, le lien de vie et la célérité" },
      ),
    ],
  },
  "Doctor Octopus, Master Planner": {
    abilities: [
      staticAbility(OTHER_VILLAINS, { power: 2, toughness: 2 }, { label: "Vos autres Méchants gagnent +2/+2" }),
      playerStatic({ maxHandSize: 8, label: "Taille de main maximale : huit" }),
      triggered(when.yourEndStep, [fx.draw(amount.plus(8, amount.neg(amount.cardsIn("hand"))))], {
        condition: cond.handAtMost(ref.you, 7),
        label: "Piochez jusqu'à avoir huit cartes en main",
      }),
    ],
  },
  "Gallant Citizen": {
    abilities: [triggered(when.entersSelf, [fx.draw(1)], { label: "Piochez une carte" })],
  },
  "Green Goblin, Revenant": {
    abilities: [
      triggered(when.attacksSelf, [fx.discard(1), fx.draw(amount.cardsDiscardedThisTurn)], {
        label: "Défaussez une carte, puis piochez une carte par carte défaussée ce tour-ci",
      }),
    ],
  },
  "Kraven, Proud Predator": {
    // Au sommet de la chaîne alimentaire : la force est la plus grande valeur de mana parmi vos permanents (endurance 4).
    cdaPower: amount.maxManaValue({ controller: "you" }),
  },
  "Mary Jane Watson": {
    abilities: [
      triggered(when.enters({ subtype: "Spider", controller: "you" }), [fx.draw(1)], {
        oncePerTurn: true,
        label: "Une Araignée arrive sous votre contrôle : piochez une carte (une fois par tour)",
      }),
    ],
  },
  "Mob Lookout": {
    abilities: [
      triggered(when.entersSelf, [fx.connive(ref.target())], {
        targets: [target.creature("t", { controller: "you" })],
        label: "Une créature que vous contrôlez a la connivence",
      }),
    ],
  },
  "Morbius the Living Vampire": {
    abilities: [
      activated({
        mana: "{U}{B}",
        fromGraveyard: true,
        exileSelf: true,
        effects: [fx.lookAtTop(3, { count: 1, exact: true })],
        label: "Regardez les trois cartes du dessus : une en main, les autres au-dessous",
      }),
    ],
  },
  "Prowler, Clawed Thief": {
    abilities: [
      triggered(when.enters(OTHER_VILLAINS), [fx.connive(ref.self)], {
        label: "Un autre Méchant arrive : Prowler a la connivence",
      }),
    ],
  },
  "Pumpkin Bombardment": {
    // « Défaussez une carte ou payez {2} » (coût additionnel).
    additionalCost: { discard: 1, discardOr: { mana: { generic: 2, colored: {}, x: 0 } } },
    spell: spell([target.creature()], [fx.damage(3, ref.target())]),
  },
  "Rhino's Rampage": {
    spell: spell(
      [target.creature("a", { controller: "you" }), target.creature("b", { controller: "opponent" })],
      [
        fx.pump(ref.target("a"), 1, 0),
        fx.fight(ref.target("a"), ref.target("b"), "e"),
        ...fx.when(
          cond.v("e"),
          fx.reflexive(
            [
              target.upTo(
                1,
                target.permanent(
                  "c",
                  ["Artifact"],
                  { notTypes: ["Creature"], maxManaValue: 3 },
                  "artefact non-créature de VM 3 ou moins",
                ),
              ),
            ],
            [fx.destroy(ref.target("c"))],
          ),
        ),
      ],
    ),
  },
  "Scarlet Spider, Kaine": {
    // Menace et chaos {B/R} : lus dans le texte.
    abilities: [
      triggered(
        when.entersSelf,
        [fx.discard(1, ref.you, { optional: true, store: "d" }), ...fx.when(cond.v("d"), fx.addCounters(ref.self, 1))],
        { label: "Vous pouvez défausser une carte : un marqueur +1/+1" },
      ),
    ],
  },
  "Shriek, Treblemaker": {
    abilities: [
      triggered(
        when.step("main1"),
        [
          fx.discard(1, ref.you, { optional: true, store: "d" }),
          ...fx.when(
            cond.v("d"),
            fx.reflexive([target.creature("c")], [fx.modify(ref.target("c"), { addKeywords: ["cantBlock"] })]),
          ),
        ],
        { label: "Vous pouvez défausser une carte : une créature ne peut pas bloquer ce tour-ci" },
      ),
      triggered(when.dies({ types: ["Creature"], controller: "opponent" }), [fx.damage(1, ref.controllerOf(ref.eventObject))], {
        label: "Explosion sonique — 1 blessure au joueur dont la créature meurt",
      }),
    ],
  },
  "Silk, Web Weaver": {
    // Web-slinging {1}{G}{W} : lu dans le texte.
    abilities: [
      triggered(when.castSpell("you", { types: ["Creature"] }), [fx.createTokens(HUMAN_CITIZEN)], {
        label: "Un Humain Citoyen 1/1",
      }),
      activated({
        mana: "{3}{G}{W}",
        effects: [fx.pumpAll(YOUR_CREATURES, 2, 2, ["vigilance"])],
        label: "Vos créatures gagnent +2/+2 et la vigilance",
      }),
    ],
  },
  "Skyward Spider": {
    // Garde {2} : lue dans le texte.
    abilities: [
      staticAbility(
        "self",
        { addKeywords: ["flying"] },
        { condition: cond.sourceMatches({ modified: true }), label: "A le vol tant qu'elle est modifiée" },
      ),
    ],
  },
  "SP//dr, Piloted by Peni": {
    abilities: [
      triggered(when.entersSelf, [fx.addCounters(ref.target(), 1)], {
        targets: [target.creature()],
        label: "Un marqueur +1/+1 sur une créature",
      }),
      triggered(when.combatDamage(MODIFIED_YOURS, true), [fx.draw(1)], {
        label: "Une de vos créatures modifiées blesse un joueur : piochez une carte",
      }),
    ],
  },
  "Spider-Girl, Legacy Hero": {
    abilities: [
      staticAbility("self", { addKeywords: ["flying"] }, { condition: cond.yourTurn, label: "A le vol pendant votre tour" }),
      triggered(when.leavesSelf, [fx.createTokens(HUMAN_CITIZEN)], { label: "Un Humain Citoyen 1/1" }),
    ],
  },
  "Spider-Man 2099": {
    // Venu du futur : « vous ne pouvez pas le lancer pendant vos trois premiers tours ».
    castCondition: cond.turnsTakenAtLeast(4),
    abilities: [
      triggered(when.yourEndStep, [fx.damage(amount.powerOf(ref.self), ref.target())], {
        // Un sort lancé ou un terrain joué depuis ailleurs que votre main.
        condition: cond.any(
          ...(["cast", "playLand"] as const).flatMap((event) =>
            (["graveyard", "exile", "library", "command"] as const).map((z) =>
              cond.amountAtLeast(amount.turnEvents({ event, who: "you", fromZone: z }), 1),
            ),
          ),
        ),
        targets: [target.any()],
        label: "Blessures égales à sa force à n'importe quelle cible",
      }),
    ],
  },
  "Spider-Man India": {
    // Web-slinging {1}{G}{W} : lu dans le texte.
    abilities: [
      triggered(
        when.castSpell("you", { types: ["Creature"] }),
        [fx.addCounters(ref.target(), 1), fx.pump(ref.target(), 0, 0, ["flying"])],
        {
          targets: [target.creature("t", { controller: "you" })],
          label: "Sevā de Pavitr — Un marqueur +1/+1 et le vol jusqu'à la fin du tour",
        },
      ),
    ],
  },
  "Spider-Woman, Stunning Savior": {
    abilities: [
      entersWith({
        tapped: true,
        affects: { types: ["Artifact", "Creature"], controller: "opponent" },
        label: "Explosion venimeuse — Les artefacts et créatures de vos adversaires arrivent engagés",
      }),
    ],
  },
  "The Spot, Living Portal": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.exileCard(ref.target("p"), { name: "ep" }),
          fx.exileCard(ref.target("g"), { name: "eg" }),
          // Les cartes exilées sont liées à The Spot (rendues en main quand il meurt).
          fx.link(ref.union(ref.stored("ep"), ref.stored("eg"))),
        ],
        {
          targets: [
            target.upTo(1, target.nonland("p")),
            target.upTo(
              1,
              target.cardInGraveyard(
                "g",
                { permanent: true, notTypes: ["Land"] },
                "any",
                "carte de permanent non-terrain d'un cimetière",
              ),
            ),
          ],
          label: "Exile un permanent non-terrain et une carte de permanent non-terrain d'un cimetière",
        },
      ),
      triggered(
        when.diesSelf,
        [fx.moveTo(ref.selfCard, { to: "libraryBottom" }, { name: "b" }), ...fx.when(cond.v("b"), fx.toHand(ref.linked))],
        { label: "Au-dessous de la bibliothèque ; les cartes exilées reviennent dans la main de leur propriétaire" },
      ),
    ],
  },
  "Sun-Spider, Nimble Webber": {
    abilities: [
      staticAbility("self", { addKeywords: ["flying"] }, { condition: cond.yourTurn, label: "A le vol pendant votre tour" }),
      triggered(when.entersSelf, [fx.search({ anySubtype: ["Aura", "Equipment"] })], {
        label: "Cherchez une carte d'Aura ou d'Équipement",
      }),
    ],
  },
  "Symbiote Spider-Man": {
    abilities: [
      SYMBIOTE_DAMAGE,
      activated({
        mana: "{2}{U/B}",
        fromGraveyard: true,
        exileSelf: true,
        sorcerySpeed: true,
        targets: [target.creature("t", { controller: "you" })],
        effects: [fx.addCounters(ref.target(), 1), fx.modify(ref.target(), { addAbilities: [SYMBIOTE_DAMAGE] }, "permanent")],
        label: "Trouver un nouvel hôte — Un marqueur +1/+1 ; elle gagne la capacité de blessures de combat",
      }),
    ],
  },
  "Ultimate Green Goblin": {
    // Chaos {2}{B/R} : lu dans le texte.
    abilities: [
      triggered(when.yourUpkeep, [fx.discard(1), fx.createTokens(TREASURE)], {
        label: "Défaussez une carte, puis créez un Trésor",
      }),
    ],
  },
  "Vulture, Scheming Scavenger": {
    abilities: [
      triggered(when.attacksSelf, [fx.pumpAll(OTHER_VILLAINS, 0, 0, ["flying"])], {
        label: "Vos autres Méchants gagnent le vol jusqu'à la fin du tour",
      }),
    ],
  },
  "Web-Warriors": {
    abilities: [
      triggered(when.entersSelf, [fx.addCountersAll({ ...YOUR_CREATURES, other: true }, 1)], {
        label: "Un marqueur +1/+1 sur chacune de vos autres créatures",
      }),
    ],
  },
  // Gaz de la peur : « ne peut pas être bloqué » (la double initiative est lue dans le texte).
  "Wraith, Vicious Vigilante": { keywords: ["unblockable"] },
};
