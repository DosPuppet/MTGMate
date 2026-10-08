# Duskmourn: House of Horror (DSK, « Mornebrune : la Maison de l'horreur », 268 cartes)

Mécaniques et détail des lots.

Demandée par l'utilisateur le 27/09/2026. Les Salles (709.5) et la manifestation effroyable (701.62) existaient déjà dans le socle (lots 0.6 et 0.8).

| Mécanique | Lot |
|---|---|
| Sinistre (Eerie), Survie, Délire, jetons Lueur, terrains | A |
| Imminence (Overlords), Enduring, coûts additionnels, Équipements qui manifestent, portes | B |
| Légendaires et cartes uniques | C |
| Les 18 dernières cartes (Aura de joueur, Valgavoth, Kaito, Leylines…) | D |

Les scripts sont dans `packages/cards/src/dsk/` : `white`, `blue`, `black`, `red`, `green` et `multi` (lot A), `special` (lot B), `legends` (lot C), `legends2` (lot D). Les aides sont dans `dsk/common.ts` : `survival`, `eerie`, `fastLand`, et les jetons Lueur, Esprit, Jouet, Horreur, Démon, Diablotin, Araignée et Everywhere.

- Lot A ✅ (164/268). Il couvre :
  - Sinistre : déclencheur `when.eerie` (un enchantement que vous contrôlez arrive, ou vous déverrouillez entièrement une Salle) ; aide `eerie(...)` ;
  - Survie : aide `survival(...)`, soit `when.secondMain` (étape `main2`) avec la condition « la source est engagée » ;
  - Délire : `cond.delirium` et le montant `amount.cardTypesInGraveyard` (votre cimetière seul ; `cardTypesInGraveyards` compte tous les cimetières) ;
  - `fx.manifestDreadBy({ who, times, store })` : « son contrôleur manifeste l'effroi », « X fois », puis « attachez-y cet Équipement » ou « mettez-y un marqueur » ;
  - le montant `unlockedDoors` (Rampaging Soulrager, Misty Salon) ;
  - les terrains « engagé sauf si un joueur a 13 PV ou moins » (`fastLand`) et les Verges ;
  - **correctif** : « arrive engagé » (remplacement d'arrivée) fait avancer la version d'état ; le fuzz l'avait trouvé avec The Wandering Rescuer.
- Lot B ✅ (188/268). Il couvre :
  - Imminence (702.176) :
    - « Impending N—[coût] » est lu dans le texte : coût alternatif (`altCost`, libellé « Imminence 4 — {2}{W}{W} » affiché par le client) et `CardDef.impending` ;
    - le permanent arrive avec N marqueurs de temps (`GameObject.impending`) et n'est pas une créature tant qu'il en a (types et sous-types de créature retirés dans `base`) ;
    - un marqueur est retiré au début de votre étape de fin (déclencheur généré) ;
  - Enduring : « revient ; c'est un enchantement » (`MoveSpec.setTypes`, `setSubtypes`) ;
  - coûts additionnels choisis automatiquement (`autoAdditional` dans stack.ts) : exiler une créature (liée au permanent, Fear of Abduction), exiler six cartes du cimetière, renvoyer un permanent, engager deux créatures ou terrains. Ces permanents ne servent pas à payer le mana ;
  - portes : `fx.door(ref, "unlock" | "toggle")`, qui déverrouille une porte verrouillée ou verrouille ou déverrouille une porte au choix (Ghostly Dancers, Ghostly Keybearer, Keys to the House, Marina Vendrell).
- Lot C ✅ (250/268). Le moteur gagne :
  - des statiques de joueur : `convokeCreatureSpells` (Dazzling Theater), `untapCreaturesOnOthersUntap` (Prop Room ; devenu `untapOnOthersUntap` avec un filtre, deck The Vision), `unlockReduction` (Inquisitive Glimmer), `damageToOpponentsMills` (The Mindskinner), `ignoreOpponentsHexproofWard` (Nowhere to Run), `opponentGraveyardToExile` (Leyline of the Void), `noLoseForLife` (Grimoire), `doubleTriggers` (Fractured Realm), `seeFaceDown` (Found Footage, dans `projectView`) ;
  - le filtre `faceDown` (vue incluse), le filtre `attached: "notHost"`, et `when.permanentTurnedFaceUp(filtre)` ;
  - `when.manifestDread` : l'objet de l'événement est la carte mise au cimetière ;
  - des modes conditionnels (`ModeDef.condition`, Let's Play a Game sous délire) ;
  - la défausse en coût d'activation (`discard`, choix du joueur dans le client), `MoveSpec.shuffle` (« mélangez-le dans la bibliothèque ») et `destroy` avec mémorisation (Come Back Wrong) ;
  - `fx.tapChosen`, `fx.lkiCountersTo`, `fx.cantGainLife`, `fx.millWhileShared` (The Tale of Tamiyo), `fx.revealFaceDown`, `fx.eachOfDealsDamage` ;
  - `ref.costDiscarded` (Grab the Prize) ;
  - les restrictions `cantAttackOrBlockAlone` (Toby) et `cantBeBlockedByGlimmers` (Cynical Loner) ;
  - les conditions `prime` (Zimone), `faceDownOrUp` et `sacrificedThisTurn`, ainsi que `punisher` avec des blessures (Osseous Sticktwister) ;
  - `per` qui multiplie aussi les F/E de base (Porcelain Gallery).
- Lot D ✅ (**268/268**). Le moteur gagne :
  - l'Aura de joueur (`enchant.player`, Grievous Wound), avec le déclencheur `when.attachedPlayerDamaged` ;
  - `when.becomesBlocked` (Norin) ;
  - les cibles en nombre variable d'une capacité réflexive (`TargetSpec.countAmount` : Miasma Demon, The Rollercrusher Ride) ;
  - le doublement des blessures non de combat sous condition (`doubler({ noncombatDamage, condition })`) ;
  - Valgavoth : l'exil lié des cartes adverses (`exileOpponentsCardsLinked`, dans `moveObject`) et le droit de les jouer pendant votre tour contre des PV (`playFrom: { zone: "linked", payLifeManaValue }`, PLAN-H H7b) ; la garde « sacrifiez trois permanents non-terrains » ;
  - le ninjutsu (`returnUnblockedAttacker`, Kaito) ;
  - un coût alternatif pour tous vos sorts (`altCostAll`, Leyline of Mutation, via `altCostFor`) ;
  - Warped Space (`freeFromExileOncePerTurn`) et Winter (`opponentMaxHandSize`) ;
  - les capacités de mana qui coûtent des PV ou posent un marqueur (Haunted Screen, Twitching Doll) ;
  - Marvin (`gainActivatedFrom`) ;
  - `fx.chooseAmong` (« ce joueur choisit l'une d'elles », Trial of Agony) ;
  - un emblème mémorisé, auquel on lie la cible, pour « quand elle meurt ce tour-ci » (Turn Inside Out) ; remplacé par la capacité retardée liée à un objet (`fx.whenThisTurn`, PLAN-A A4b) ;
  - `ref.filtered` (Ghost Vacuum), et les conditions `step`, `creatureDiedMatching` et `castFromGraveyard` (Undead Sprinter).

Tests : `engine/test/dsk.test.ts` (18 tests) et le test de fumée `ai/test/smoke/dsk.test.ts`.
