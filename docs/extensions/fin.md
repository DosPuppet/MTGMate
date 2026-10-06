# Final Fantasy (FIN, 307 cartes dont 2 cartes assemblées)

Mécaniques et détail des lots (déplacé de CLAUDE.md).

Demandée par l'utilisateur le 27/09/2026.

| Mécanique | Lot |
|---|---|
| Villes (terrains engagés, Villes à aventure) | A |
| tiered | A |
| « si au moins quatre mana ont été dépensés » | A |
| job select et Équipements | A (simples), B |
| créatures-Sagas « Summon » | B |
| transformation (dont Sagas au verso), assemblage | C |
| légendaires et rares restants | D |

- Lot A ✅ (166/307). Il couvre :
  - job select (lu dans le texte) : à l'arrivée, un jeton Héros 1/1 est créé et l'Équipement s'y attache ; « Nom — Equip {N} » est lu comme Équiper ; aide `jobGear(type, F, E, mots-clés)` ;
  - tiered (aide `tiered(...)`, comme spree mais un seul palier) ; déclencheur `when.castNoncreatureWithMana(n)` (`minManaSpent`) ;
  - Villes à aventure (Lindblum, Midgar…) : seule l'Aventure se lance depuis la main ; la carte « en aventure » se joue comme terrain depuis l'exil ; l'interface propose « Jouer ce terrain » ou « Lancer [Aventure] » ;
  - `fx.counterExile` (Syncopate) et « à moins de payer {X} » (X du sort) ; `setBasePTAll` avec la force seule (PuPu UFO) ;
  - jetons Héros, Chevalier, Mog, Horreur, Grenouille, Robot Guerrier, Chocobo (Oiseau 2/2 avec landfall), Sorcier 0/1 (`fin/common.ts`) ;
  - IA : l'énumération des cibles écarte les combinaisons qui violent « une autre cible » (`otherThan`).
- Lot B ✅ (188/307) : 11 Équipements (`fin/gear.ts`) et 11 Summons (`fin/summons.ts`, créatures-Sagas écrites avec `chapter`). Le moteur gagne :
  - `fx.discard` mémorise les cartes défaussées (`ref.stored`, Ninja's Blades) ;
  - Équiper « payez 3 points de vie, une fois par tour » écrit dans le script (Dark Knight's Greatsword) ;
  - `chapter` est exporté par `fdn/common.ts` ;
  - correctif : Territory Forge fait avancer la version d'état en liant la carte, et ne garde que les capacités d'une carte encore exilée ; l'invariant de cache du fuzz nomme la carte et les champs divergents.
  
  Passent au lot D : Summon: Primal Odin (« ce joueur perd la partie »), Summon: Brynhildr, Summon: Fenrir, Summon: Bahamut (valeur de mana totale), Aettir and Priwen, Buster Sword, Genji Glove, The Masamune.
- Lot C ✅ (217/307) : 18 cartes transformables et l'assemblage Vanille + Fang = Ragnarok (`fin/transform.ts`, scripts par nom de face). Le moteur gagne :
  - les Sagas au verso : la face est reconnue comme Saga à l'import (ligne de type), elle arrive transformée avec un marqueur de savoir, et le marqueur de la phase principale et le sacrifice (714.4) lisent la face active (`copiedDefId`) ; une Saga renvoyée sur son recto n'est plus une Saga ;
  - aides `flipOut` / `flipBack` (« exilez-la, puis renvoyez-la [transformée] ») ;
  - la condition « une créature est morte sous le contrôle d'un adversaire ce tour-ci » (`cond.creaturesDied(n, true)`, `turnStats.creaturesLost`) ;
  - 11 cartes des decks de démarrage (`fin/starter.ts`, numéros hors du set principal), avec le montant `creaturesDiedThisTurn` et l'effet `attach` qui attache plusieurs Équipements à la fois (Beatrix).
- Lot D1 ✅ (242/307) : 25 légendaires, Cristaux et cartes uniques (`fin/legends.ts`). Le moteur gagne :
  - le filtre `equipped` (créature équipée, calculé dans la vue) ;
  - la cible « capacité activée ou déclenchée, ou sort non-créature » (`stackItems.abilitiesOnly`, Louisoix's Sacrifice) ;
  - « à moins de payer {1} pour chaque… » (`unlessPays` avec `genericAmount`), « ce joueur perd la partie » (`fx.playerLoses`) ;
  - des blessures infligées par une autre source à chaque créature (`damageAll` avec `source`, Nibelheim Aflame) ;
  - les gains de PV doublés (`doubler({ lifeGain })`), la meule adverse augmentée (`opponentMillExtra`), la première pièce gagnée chaque tour (`winFirstCoinFlips`) ;
  - la restriction `noActivatedAbilities` (capacités activées et de mana).
- Lot D2 ✅ (264/307) : 22 cartes (`fin/legends2.ts`, et Clive, Ultimecia, Sephiroth dans `fin/transform.ts`). Le moteur gagne :
  - le kicker sans mana (`kickerCost` : sacrifier ou renvoyer un permanent, choisi automatiquement, jamais une cible du sort) ;
  - les tours supplémentaires (`GameState.extraTurns`, `fx.extraTurn`) et les étapes de fin supplémentaires (`fx.extraEndStep`, `cond.firstEndStep`) ;
  - le déclencheur « attaque seule » (`when.attacksAlone`), « un joueur sacrifie » (`when.sacrifice(filtre, true)`) ;
  - les montants `totalManaValue`, `eventManaSpent`, `devotion` ; l'effet `eachDealsDamage` ; le sacrifice de la moitié (`half`) ;
  - les statiques de joueur `landsEnterUntapped`, `playTopCard` (avec condition), `extraToken` (Quina) ;
  - les restrictions `minThreeBlockers` et `combatDamageImmune` ; les copies de jeton « sauf que c'est un Démon noir » (`setColors`, `setSubtypes`) ;
  - Cloud, Midgar Mercenary (`doubleTriggersWhenEquipped`) ; les permissions de lancer qui exilent le sort ensuite (`grantPlay` avec `exileAfter`).
- Lot D3 ✅ (288/307) : 24 cartes (`fin/legends3.ts`, et Kuja, Kefka, Serah, Esper Origins, Emet-Selch, Crystal Fragments, Terra dans `fin/transform.ts`). Le moteur gagne :
  - les modifications à l'arrivée d'un sort (`StackItem.arrival`) : prochain sort de créature du tour (`fx.nextCreatureSpell`, Fenrir, Brynhildr), marqueurs ajoutés à un sort sur la pile (`fx.spellArrivalCounters`, Torgal), artefacts lancés du cimetière avec finalité (`artifactsFromGraveyardLife`, Noctis) ;
  - les blessures doublées par une source filtrée (`doubler({ damageFilter })`, Trance Kuja) ou reçues par un joueur jusqu'au prochain tour (`fx.doubleDamageTo`, Lightning) ; la prévention des blessures à vos créatures ce tour-ci (Summon: Alexander) ;
  - **correctif** : les blessures d'une capacité d'un permanent ont ce permanent pour source (lien de vie, contact mortel, doublements) ;
  - le compteur de phases de combat (`cond.firstCombat`), les conditions « un adversaire blessé par une créature légendaire », « un joueur a subi N blessures de combat », « premier sort de créature légendaire du tour », « la créature de plus grande force » ;
  - le sort résolu qui arrive transformé (`fx.resolveToBattlefieldTransformed`, Esper Origins), jouer depuis son cimetière et exiler son propre cimetière (Hades), F/E de base égales aux PV (Aettir and Priwen), capacité de mana sans {T} une fois par tour (Vivi), réduction d'Équiper sur une cible (`equipDiscountWhenTargeted`), filtre `crewedBySource`, montant `cardTypesOf`, `removeCounters` d'un type avec mémorisation.
- Lot D4 ✅ (**307/307**) : les 19 dernières cartes (`fin/legends4.ts`, et Zenos, Play Blitzball dans `fin/transform.ts`). Le moteur gagne :
  - `setController` (state.ts) : tout changement de contrôle passe par là et émet l'événement `controlChange` (déclencheur `when.opponentGainsControl`, Zidane) ;
  - `fx.unattach`, la garde « payez des PV égaux à sa force » (`ward.lifePower`), les capacités retardées « au prochain entretien » (`nextUpkeep`) ;
  - les copies-jetons avec Équiper réduit et sacrifiées au prochain entretien (Firion) ; Triple Triad (`fx.tripleTriad`) ;
  - Ancient Adamantoise (mots-clés `keepsDamage`, `absorbsDamage`), la protection du joueur contre ses adversaires (`protectionFromOpponents`, devenue `protection: "opponents"` au lot E9 de PLAN-E) ;
  - `playTopCard` filtré et les déclencheurs d'arrivée doublés filtrés (Traveling Chocobo), les déclencheurs de mort doublés (The Masamune) ;
  - la permission gratuite depuis la main à usage unique (`ref.handOf`, `grantPlay` avec `oneOf`, Buster Sword) ;
  - l'exil « au lieu de mourir » lié par identité physique (`linkedUids`, The Darkness Crystal) ;
  - les déclencheurs « l'objet lié quitte le champ de bataille » et « un adversaire perd la partie » (Zenos, Shinryu) ; le {C} supplémentaire des terrains (Ultima) ; `lastAttachedTo` (Zack Fair). (légendaires, rares, transformables complexes : Clive, Terra, Sephiroth, Zenos, Kefka, Kuja, Serah, Ultimecia, Emet-Selch, Esper Origins, Crystal Fragments, Play Blitzball…).
