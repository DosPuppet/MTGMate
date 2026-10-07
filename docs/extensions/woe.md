# Wilds of Eldraine (WOE, « Les friches d'Eldraine », 269 cartes)

Mécaniques et détail des lots.

Extension demandée par l'utilisateur le 01/10/2026, avec Secrets of Strixhaven et Murders at Karlov Manor. 11 cartes étaient déjà gérées depuis la phase méta (lots M1 à M6, `docs/extensions/meta.md`) : Aventures, Marchandage, Song of Totentanz, The End, Restless Cottage… L'extension suit les règles d'intégration de CLAUDE.md (dette, R1, R7). Découpage : un sous-lot et un commit par couleur pour le lot A, par mécanique pour le lot B, par famille de cartes uniques ensuite.

| Mécanique | Lot |
|---|---|
| Socle : Rôles (jetons-Auras, 704.5y), Célébration, jetons | 0 |
| Cartes faisables avec le moteur, par couleur | A1 à A6 |
| Mécaniques phares restantes | B |
| Légendaires et cartes uniques | C et suivants |

Les scripts sont dans `packages/cards/src/woe/` : `cards` (cartes du méta), `white`, `blue`, `black`, `red`, `green`, `multi`, `artifacts` (incolores et terrains) et `legends`. Les aides sont dans `woe/common.ts`.

## Sous-lot 0 : socle ✅ (11 / 269)

- **Rôles (303.7) :** jetons d'enchantement Aura, sous-type Role, « Enchant creature » (`TokenSpec.enchant`, nouveau) : Cursed (la créature est 1/1), Monster (+1/+1, piétinement), Royal (+1/+1, garde {1}), Sorcerer (+1/+1, regard 1 en attaquant), Virtuous (+1/+1 par enchantement que vous contrôlez), Wicked (+1/+1 ; au cimetière, chaque adversaire perd 1 PV), Young Hero (en attaquant avec une endurance de 3 ou moins, un marqueur +1/+1). `createRole(rôle, créature)` crée le jeton attaché, et rien si la créature n'est plus là (303.7b).
- **[règles] 704.5y :** plusieurs Rôles d'un même joueur attachés au même permanent : seul le plus récent reste (`turn.ts`). `RULES_VERSION` = 26.
- **Célébration :** `CELEBRATION`, « deux permanents non-terrain ou plus sont arrivés sous votre contrôle ce tour-ci » (journal du tour, jetons compris).
- **Jetons :** Chevalier 2/2 avec la vigilance, Humain 1/1 ; Rat « ne peut pas bloquer », Nourriture et Trésor viennent des communs.
- **Tests :** 5 tests dans `engine/test/woe.test.ts` (Monster et Cursed, deux joueurs, Wicked, Young Hero, Célébration) ; test de fumée `ai/test/smoke/woe.test.ts`.

## Sous-lot A1 : cartes blanches ✅ (53 / 269)

- **Cartes :** 42 (sur 45), dont 7 Aventures (deux entrées chacune), les Rôles (Betroth the Beast, Charmed Clothier, Cursed Courtier, Unassuming Sage, Spellbook Vendor, Protective Parents, Return Triumphant), la Célébration (Armory Mice, Gallant Pie-Wielder, Tuinvale Guide, Pests of Honor, Lady of Laughter), le Marchandage (Archon's Glory, Kellan's Lightblades), les Sagas The Princess Takes Flight et Three Blind Mice.
- **Restent :** Archon of the Wild Rose et A Tale for the Ages (filtre « créature enchantée »), Solitary Sanctuary (qui engage une créature).
- **Tests :** 38 tests de règles dans `engine/test/woe.test.ts` (« lot A — blanc »).

## Sous-lot A2 : cartes bleues ✅ (88 / 269)

- **Cartes :** 35 (sur 41), dont 11 Aventures (Aquatic Alchemist, Beluna's Gatekeeper, Galvanic Giant, Horned Loch-Whale, Obyra's Attendants, Picklock Prankster, Vantress Transmuter, Virtue of Knowledge, Frolicking Familiar, Threadbind Clique, Twining Twins), Archive Dragon, Chancellor of Tales, Faerie Slumber Party, Gadwick's First Duel, Into the Fae Court, Storyteller Pixie ; jeton Faerie « ne peut bloquer que les créatures volantes » (local à `blue.ts`).
- **Restent :** Ice Out et Johann's Stopgap (réduction « si marchandé »), Asinine Antics (un Rôle par créature adverse), Ingenious Prodigy (furtivité), Elusive Otter (X marqueurs répartis), Extraordinary Journey (« lancée depuis l'exil »).
- **Tests :** 34 tests de règles (« lot A — bleu »).

## Sous-lot A3 : cartes noires ✅ (132 / 269)

- **Cartes :** 44 (sur 48), dont 8 Aventures, Rankle's Prank (« un ou plusieurs » par des modes à {0}), Lich-Knights' Conquest et Malevolent Witchkite (« sacrifiez un nombre quelconque »), Specter of Mortality (capacité réflexive), Beseech the Mirror (lancement gratuit pendant la résolution).
- **Restent :** Ashiok, Wicked Manipulator (payer des PV remplacé par un exil ; valeur de mana totale en exil), Lord Skitter's Blessing (créature enchantée), Tangled Colony (blessures subies, dernières informations), Twisted Sewer-Witch (un Rôle par Rat).
- **Tests :** 45 tests de règles (« lot A — noir »).

## Sous-lot A4 : cartes rouges ✅ (172 / 269)

- **Cartes :** 40 (sur 43), dont des Aventures, la Célébration (Goddric, Redcap Thief…), les Rôles, les Rats, Expensive Taste (cartes adverses exilées et jouables), Become Brutes.
- **Restent :** Imodane, the Pyrohammer (blessures d'un sort à cible unique sur sa cible), Skewer Slinger (l'attaquant bloqué comme objet de l'événement), Kellan, the Fae-Blooded (compter les Auras et Équipements attachés à la source).
- **Tests :** 41 tests de règles (« lot A — rouge »). En route, l'audit des cartes face cachée (`ai/test/hidden-info.test.ts`) comptait comme une fuite une main adverse regardée légitimement (Solve for Disappointment, tiré dans un deck aléatoire) : seul le permanent face cachée y est maintenant audité.

## Sous-lot A5 : cartes vertes ✅ (213 / 269)

- **Cartes :** 41 (sur 44), dont des Aventures (Beanstalk Wurm, Ferocious Werefox, Hollow Scavenger, Stormkeld Vanguard, Virtue of Strength, Gingerbread Hunter, Questing Druid, Tempest Hart, Intrepid Trufflesnout), Blossoming Tortoise (`abilityCost`), Territorial Witchstalker, Curse of the Werefox (Rôle puis capacité réflexive), The Huntsman's Redemption.
- **Dette :** `extraLandThisTurn` sert maintenant à deux cartes (Plant Beans) : son entrée quitte `debt-baseline.json`.
- **Restent :** Graceful Takedown (créature enchantée), Hamlet Glutton (réduction « si marchandé »), Sentinel of Lost Lore (cartes exilées d'un autre propriétaire ; « un ou plusieurs » en capacité déclenchée).
- **Écart relevé :** un remplacement de mana « le double » (`modify.times`) n'est pas appliqué, seul « autant plus N » l'est (lot B).
- **Tests :** 41 tests de règles (« lot A — vert »).

## Sous-lot A6 : multicolores, incolores et terrains ✅ (236 / 269)

- **Cartes :** 23 (sur 37) :
  - multicolores : Ash, Party Crasher ; The Goose Mother ; Greta, Sweettooth Scourge ; Neva, Stalked by Nightmares ; Obyra, Dreaming Duelist ; Totentanz, Swarm Piper ; Troyan, Gutsy Explorer ; Will, Scion of Peace ;
  - incolores : Collector's Vault, Eriette's Tempting Apple, Gingerbrute, Hylda's Crown of Winter, The Irencrag, Prophetic Prism, Scarecrow Guide, Syr Ginger, Three Bowls of Porridge ;
  - terrains : Crystal Grotto, Edgewall Inn, les quatre terrains « Restless ».
- **Restent (lot B et suivants) :** Agatha of the Vile Cauldron, The Apprentice's Folly, Yenna, Eriette of the Charmed Apple, Syr Armont, Faunsbane Troll, Hylda of the Icy Crown, Sharae of Numbing Depths, Johann, Likeness Looter, Rowan, Scion of War, Talion, Beluna Grandsquall, Agatha's Soul Cauldron.
- **Tests :** 28 tests de règles (« lot A — multicolores »).

### Reste à faire après le lot A (33 cartes) : formes du moteur (toutes faites aux lots B et C)

| Ce qui manque | Cartes |
|---|---|
| Filtre « créature enchantée (par vous) » | Archon of the Wild Rose, A Tale for the Ages, Lord Skitter's Blessing, Graceful Takedown, Eriette of the Charmed Apple, Syr Armont |
| Qui engage une créature (« vous engagez une créature adverse ») | Solitary Sanctuary, Hylda of the Icy Crown, Sharae of Numbing Depths (et Icewrought Sentry, approximée) |
| Un effet par objet (un Rôle pour chaque créature) | Asinine Antics, Twisted Sewer-Witch |
| Réduction de coût « si marchandé » | Ice Out, Johann's Stopgap, Hamlet Glutton |
| Attaché à la source (Auras et Équipements sur elle) | Kellan, the Fae-Blooded, Faunsbane Troll |
| Autres | Ingenious Prodigy, Elusive Otter, Extraordinary Journey, Ashiok, Tangled Colony, Imodane, Skewer Slinger, Sentinel of Lost Lore, Agatha of the Vile Cauldron, The Apprentice's Folly, Yenna, Johann, Likeness Looter, Rowan, Talion, Beluna Grandsquall, Agatha's Soul Cauldron |

## Sous-lot B1 : créatures enchantées ✅ (242 / 269)

- **Cartes :** Archon of the Wild Rose, A Tale for the Ages, Lord Skitter's Blessing, Graceful Takedown, Eriette of the Charmed Apple, Syr Armont, the Redeemer.
- **Le moteur gagne :**
  - le filtre `enchanted` (`true` : enchantée par au moins une Aura ; `"byYou"` : par une Aura que vous contrôlez ; `false`), lu sur `LkiSnapshot.enchantedBy` (contrôleurs des Auras attachées, calculé comme `equipped`) ;
  - la règle d'attaque `BlockRule.cantAttackPlayer` (« ne peut pas vous attaquer, ni vos planeswalkers ») ; un script écrit `cantAttackSourceController`, fixé sur le contrôleur de la source quand la statique s'applique.
- **Tests :** 5 tests de règles (« lot B1 ») : Archon (avec un Rôle Monstre de vous ou de l'adversaire), A Tale for the Ages et Syr Armont, Lord Skitter's Blessing à la pioche, Graceful Takedown, Eriette (attaque refusée, drain).

## Sous-lot B2 : « vous engagez une créature adverse » ✅ (245 / 269)

- **Cartes :** Solitary Sanctuary, Hylda of the Icy Crown, Sharae of Numbing Depths ; Icewrought Sentry n'est plus approximée.
- **Le moteur gagne :** l'événement d'engagement dit qui engage (`by` : le contrôleur de ce qui se résout, sinon, pour un coût ou du mana, le contrôleur du permanent) ; le déclencheur `taps` prend `byYou` (« chaque fois que vous engagez… »).
- **Tests :** 4 tests de règles (« lot B2 »).

## Sous-lot B3 : un Rôle pour chaque créature ✅ (247 / 269)

- **Cartes :** Asinine Antics (flash pour {2} de plus, `flashExtraCost`), Twisted Sewer-Witch.
- **Le moteur gagne :** `createTokens(…, attachTo)` crée les jetons Aura ou Équipement attachés à chaque objet désigné encore sur le champ de bataille ; `createRole` s'en sert (plus de condition ni de variable mémorisée).
- **Tests :** 2 tests de règles (« lot B3 »).

## Sous-lot B4 : « coûte moins s'il est marchandé » ✅ (250 / 269)

- **Cartes :** Ice Out, Johann's Stopgap, Hamlet Glutton (`costReduction` sous `cond.kicked`).
- **Le moteur gagne :** une réduction de coût sous `cond.kicked` voit le choix du lanceur (`spellReduction` reçoit `kicked`).
- **Correctif :** un sort payable seulement avec son kicker (Hamlet Glutton marchandé, avec cinq terrains) n'était jamais proposé. `legalActions` le propose, l'IA le lance avec le kicker, et l'interface pose d'office le marchandage au lieu de demander.
- **Tests :** 1 test de règles (« lot B4 »).

## Sous-lot C1 : furtivité, marqueurs répartis, Auras attachées, PV perdus ✅ (255 / 269)

- **Cartes :** Ingenious Prodigy, Elusive Otter // Grove's Bounty, Kellan, the Fae-Blooded // Birthright Boon, Faunsbane Troll, Rowan, Scion of War.
- **Le moteur gagne :**
  - les filtres `powerAboveSource` (furtivité : « ne peut pas être bloquée par des créatures de force supérieure ») et `attachedToSelf` (« attaché à cette créature » : statiques « pour chaque », coûts de sacrifice) ;
  - `countersDivided` accepte un montant (« répartissez X marqueurs ») ;
  - `amount.lifeLostThisTurn`.
- **Tests :** 5 tests de règles (« lot C1 »).

## Sous-lot C2 : blessures d'un sort ciblé, blocages, blessures subies ✅ (258 / 269)

- **Cartes :** Imodane, the Pyrohammer, Skewer Slinger, Tangled Colony.
- **Le moteur gagne :**
  - un sort qui inflige des blessures est identifié par son élément de pile (`DamageSource.stackId`, événement `damage`) ; le déclencheur `dealsDamage` prend `spellToSoleTarget` (« un sort qui ne cible qu'une créature lui inflige des blessures ») ;
  - le déclencheur `blocks` peut désigner l'attaquant bloqué comme objet de l'événement (`eventObject: "attacker"`) ;
  - les dernières informations connues gardent les blessures marquées (`LkiSnapshot.damage`), lues par `amount.lkiDamage`.
- **Tests :** 3 tests de règles (« lot C2 »).

## Sous-lot C3 : copies ✅ (261 / 269)

- **Cartes :** The Apprentice's Folly, Yenna, Redtooth Regent, Likeness Looter.
- **Le moteur gagne :**
  - `removeSupertypes` (couche 4) et l'option `nonlegendary` de `copyToken` (« sauf qu'elle n'est pas légendaire »), avec `store` ;
  - le filtre `notSameNameAs` (« qui n'a pas le même nom qu'un jeton / un autre permanent que vous contrôlez ») ;
  - `becomeCopy` copie aussi une carte hors du champ de bataille (cimetière), avec des mots-clés ajoutés, des capacités de la source gardées (`keepAbilities`, par rang : pas de structure circulaire) et une valeur de mana exigée (`ifManaValue`).
- **Tests :** 3 tests de règles (« lot C3 »).

## Sous-lot C4 : dessus de la bibliothèque, coûts des capacités, Aventures, exil ✅ (266 / 269)

- **Cartes :** Johann, Apprentice Sorcerer, Agatha of the Vile Cauldron, Agatha's Soul Cauldron, Beluna Grandsquall // Seek Thrills, Extraordinary Journey.
- **Le moteur gagne :**
  - `PlayFromZone.oncePerTurn` (« une fois par tour, vous pouvez lancer… depuis le dessus de votre bibliothèque ») : la permission utilisée est notée dans `turn.onceFired` ;
  - `AbilityCostMod.reduce` en quantité (réduction variable, évaluée pour la source de la statique : la force d'Agatha), `minOneMana` (« ne peut pas réduire le mana de ce coût à moins d'un mana ») et `anyMana` (« dépenser le mana comme s'il était de n'importe quelle couleur » pour ces capacités ; {C} reste dû en incolore) ;
  - le déclencheur d'arrivée `fromZone: "graveyard" | "exile"` (remplace `fromGraveyard`) : arrivé de cette zone ou lancé depuis elle (`GameObject.castFromExile`) ;
  - le filtre `adventure` s'applique aussi aux sorts (`spellView` : « les sorts de permanent qui ont une Aventure »).
- **Tests :** 8 tests de règles (« lot C4 »).

## Sous-lot C5 : payer des PV, nombre choisi, cartes à Aventure en exil ✅ (269 / 269)

- **Cartes :** Ashiok, Wicked Manipulator, Talion, the Kindly Lord, Sentinel of Lost Lore.
- **Le moteur gagne :**
  - `payLife` (`actions.ts`) : tous les paiements de PV (coûts de capacités et de sorts, distorsion, terrains choc, « à moins que », Terror of the Peaks…) y passent ; le remplacement `eventReplacement({ event: "payLife", instead: { exileFromLibrary: true } })` (R1) exile autant de cartes du dessus de la bibliothèque si elle en a assez. Les vérifications « assez de PV » sont inchangées (rulings) ;
  - le choix en arrivant `asEnters: [fx.chooseForSelf("number")]` (1 à 10, badge sur la carte) et le filtre `numberChosen` (valeur de mana, force ou endurance égale) ;
  - `amount.totalManaValue(filtre, "exile")` : les cartes que vous possédez en exil (face cachée : 0) ;
  - la cible de carte exilée `own: false` (« que vous ne possédez pas »).
- **Tests :** 7 tests de règles (« lot C5 ») et 2 décisions officielles d'Ashiok (`rulings.test.ts`).
- **Écarts :** Sentinel of Lost Lore (« un ou plusieurs » en cibles facultatives), approximation documentée ; levée au PLAN-H (H2) : capacité déclenchée modale (`oneOrMore`).
