# The Hobbit (HOB, « Le Hobbit », 188 cartes)

Mécaniques et détail des lots.

Extension demandée par l'utilisateur le 02/10/2026, après Marvel's Spider-Man et Teenage Mutant Ninja Turtles. 20 cartes étaient déjà gérées depuis la phase méta (lots M1 à M6, `docs/extensions/meta.md`) : Storied (lu dans le texte, récit durable), amasser des Gobelins, Landfall, Équipements… L'extension suit les règles d'intégration de CLAUDE.md (dette, R1, R7). Découpage : un sous-lot et un commit par couleur pour le lot A, par mécanique pour le lot B, par famille de cartes uniques ensuite.

| Mécanique | Lot |
|---|---|
| Socle : jetons | 0 |
| Cartes faisables avec le moteur, par couleur | A1 à A6 |
| Mécaniques phares restantes | B |
| Légendaires et cartes uniques | C et suivants |

Les scripts sont dans `packages/cards/src/hob/` : `cards` (cartes du méta), `white`, `blue`, `black`, `red`, `green`, `multi` et `artifacts` (incolores et terrains). Les aides sont dans `hob/common.ts`.

## Sous-lot 0 : socle ✅ (20 / 188)

- **Jetons :** Humain Soldat 1/1 blanc, Elfe 1/1 vert, Ours 2/2 vert, Oiseau Soldat 4/4 blanc avec le vol, Dragon 6/6 rouge avec le vol, Stone Boulder (Mur 3/1 incolore avec le défenseur), Axe (Équipement « +1/+0 », équiper {2}) ; Nain et Loup existaient ; Trésor et Nourriture viennent des communs.
- **Moteur :** rien de nouveau.
- **Tests :** test de fumée `ai/test/smoke/hob.test.ts`.

## Sous-lot A1 : cartes blanches ✅ (44 / 188)

- **Cartes (24) :** Celebrate the Mountain-king, Dáin, Lord of the Iron Hills, Dwarven Provisioner, Dwarven Shortsword, Eagle of the Great Shelf, The Eagles Are Coming!, Esgaroth Garrison, Fíli the Pathfinder, Gleaming Splendor, Iron Hills Blacksmith, Lake-town Lookout, Lake-town Toymaker, Magnificent End, Moment of Glory, The Mountain-king's Return, Ori, Keeper of Songs, The Queen of Dale, Roads Go Ever, Ever On, Settle the Wreckage, Stone by Sunlight, Thorin's Last Stand, An Unexpected Party, At the Door, Velvetwing Butterflies, Gaze in Wonder, Vow to Erebor.
- **Correctif du moteur :** le choix d'un type de créature propose aussi les types des jetons que créent les cartes de la partie (An Unexpected Party nomme les Nains que créent ses jetons, sans Nain non-jeton).
- **Test de fumée :** chaque extension a désormais son fichier ; `smoke/others.test.ts` reste pour une extension ajoutée sans le sien (il n'échoue plus quand il n'a rien à tester).
- **Tests :** 31 tests de règles (« lot A, blanc »).

## Sous-lot A2 : cartes bleues ✅ (69 / 188)

- **Cartes (25) :** Bilbo, Luckwearer, Burglar's Plot, Bilbo, Thief in the Night, Bilbo Baggins, Burglar, Take a Glance, Confusticate and Bebother, Elven Raft-Steerer, Elvenking's Harper, Enchanted River's Grasp, Fateful Discovery, Gandalf, Wandering Wizard, Great Gilded Boat, Lakeshore Apothecary, Lake-town Mariners, Gone Fishing, Long Lake Nuisance, The Lord of the Eagles, Mirkwood Meditator, Most Decrepit Old Bird, Speak Secrets, Old Fat Spider Can't See Me, Plunder the Trollshaws, Ravenhill Flock, Riddles in the Dark, Roll-Roll-Roll-Roll, Sound the Trumpets, Uncover the Moon-Letters, Uneasy Partings, Wizard's Staff.
- **Moteur :** rien de nouveau.
- **Reste pour plus tard :** Elrond, Moon-Reader (activer une capacité d'une créature), Master's Councillors (nombre de cimetières de N cartes ou plus), Thranduil's Decree (la carte exilée par le contresort, lançable ensuite).
- **Tests :** 33 tests de règles (« lot A, bleu »).

## Sous-lot A3 : cartes noires ✅ (87 / 188)

- **Cartes (18) :** Along the Crooked Way, Bilbo's Deadly Slice, Crude Bent Blade, Down, Down to Goblin-town, Dreaded Bat-Cloud, Front Porch Sentries, Gathering of Darkness, Gnashing of Teeth, Gollum, Silent Slinker, Meager Meal, Gollum the Abandoned, Great Fierce Bee, Great Ugly-Looking Goblin, Clap! Snap!, Rage into the Valley, Ravening Warg, Reverent Howl, Rhovanion Rampager, Stir Up Trouble, Stony-Voiced Goblins.
- **Moteur :** rien de nouveau.
- **Reste pour plus tard :** Inside Information (permission de jouer en payant des PV égaux à la valeur de mana), The Master of Lake-town (nombre de cimetières de sept cartes ou plus), Supper for Spiders (« mises dans un cimetière depuis le champ de bataille ce tour-ci »).
- **Tests :** 29 tests de règles (« lot A, noir »).

## Sous-lot A4 : cartes rouges ✅ (112 / 188)

- **Cartes (25) :** Balin, Loremaster, Bombur, Gentle Dreamer, Bothersome Noisemaker, Burn, Burn, Tree and Fern, Dáin Ironfoot, Desert Were-Worm, Desolation of Smaug, Dori, Bearer of Friends, Gandalf, Goblins' Bane, Flameshape, Gandalf, Spark Starter, Glóin the Mighty, Easy Pickings, Goblin-town Flunkies, Gundabad Opportunist, Iron Hills Stalwart, Last Light of Durin's Day, The Misty Mountains Cold, Misty Mountains Raider, Óin the Brave, Pinecone Strike, Ragged Short Spear, Smaug, the Great Calamity, Spew Flame, Smaug's Fury, Snowslope Hunter, Stone-Giant of High Pass, Tidings of War.
- **Moteur :** rien de nouveau.
- **Reste pour plus tard :** Getaway Barrel (une carte de créature au hasard parmi les cartes révélées).
- **Tests :** 35 tests de règles (« lot A, rouge »).

## Sous-lot A5 : cartes vertes ✅ (139 / 188)

- **Cartes (27) :** Attercop, Bejeweled Warg, Beorn, Reluctant Host, Till and Tend, Beorn the Fierce, Beorn's Hospitality, Boughside Wanderers, Cantankerous Keepers, Dancing from Dark to Dawn, Down in the Valley, Galion, Elvenking's Butler, Gigantic Big Bear, Guardian of the Halls, Little Bear, Mirkwood Pathmaker, Nasty Little Rabbit, The Notary Hobbits, Old Fat Spider, Part in Friendship, Quarrel, Radagast of Rhosgobel, Through the Forest Gate, Troll Negotiations, Warg Tactics, Wargling, Wilderland Scrounger, Wood Elves, Woodland Weavemaster.
- **Correctif du moteur :** une capacité de mana restreinte (« ne dépensez ce mana que pour… ») engagée à la main versait son mana dans la réserve libre ; il va désormais dans la réserve restreinte, comme pendant un paiement automatique (Woodland Weavemaster, Castle Doom… ; test dans `rulings.test.ts`). La réserve affichée montre ce mana réservé, souligné en pointillé (`PlayerView.restrictedMana`, vérifié dans le navigateur). `RULES_VERSION` = 57, parties dorées régénérées.
- **Tests :** 36 tests de règles (« lot A, vert ») et un dans `rulings.test.ts`.

## Sous-lot A6 : cartes multicolores, incolores et terrains ✅ (177 / 188)

- **Cartes multicolores (19) :** Bard, King of Dale, Bard the Bowman, Bard's Company, Bifur, Melodic Rider, Bolg of the North, Bolg's Company, The Chief Warg, Duskwatch Hunter, Eagle's Rescue, Fearsome Goblin Pair, Goblin Plate Mail, The Great Goblin, Mirkwood Nurturer, Nori, Teller of Tales, Patient Instructor, Silvan Reveler, Thranduil, Sindarin Liege, Silvan Rally, Thranduil's Company, Tom, Bert, and William.
- **Cartes incolores et terrains (21) :** Long-Bodied Grey Dog, Old Thrush, Troop of Ponies, The Arkenstone, Seek the Heart, The Black Arrow, Dwarven Mattock, Giant's Boulder, Glamdring, Foe-hammer, Gleam of Death, My Precious, Allure of Power, Orcrist, Goblin-cleaver, Sting, Bilbo's Sword, Thrór's Map, Well-Worn Spatula, Elvenking's Halls, Goblin-town, Iron Hills, Lake-town, Mirkwood, Hobbit Hole.
- **Moteur :** rien de nouveau. Le recrutement (« piochez, défaussez ; une carte non-terrain défaussée donne un Humain Soldat 1/1 »), écrit trois fois en lot A, est réuni dans `hob/common.ts` (`recruit()`).
- **Reste pour plus tard :** Dwalin, Weaponmaster (marqueurs d'affûtage sur les Équipements), Smaug, Wicked Worm (« si du mana d'un Trésor a été dépensé pour le lancer »), Thranduil, the Elvenking (capacités activées des cartes d'Elfe du cimetière), Key to the Side-Door (« une carte légendaire du même nom qu'un permanent légendaire que vous contrôlez »).
- **Tests :** 57 tests de règles (« lot A, multicolores » et « lot A, incolores et terrains »).

## Sous-lot C1 : cartes uniques ✅ (188 / 188)

- **Cartes (11) :** Elrond, Moon-Reader, Master's Councillors, Thranduil's Decree, Inside Information, The Master of Lake-town, Supper for Spiders, Getaway Barrel, Dwalin, Weaponmaster, Smaug, Wicked Worm, Thranduil, the Elvenking, Key to the Side-Door.
- **Moteur :**
  - marqueurs d'affûtage (122.1) : chaque marqueur sur un Équipement donne +1/+0 à la créature équipée, en couche 7c (Dwalin ; Sting n'a plus besoin de sa propre statique, approximation levée) ;
  - `amount.graveyardsWithAtLeast(n)` (aussi dans les F/E calculées par les couches) ;
  - déclencheur « chaque fois que vous activez une capacité d'[une créature] » (`activateAbility.source`) ; « si du mana d'un [Trésor] a été dépensé pour le lancer » (`castSpell.usingManaFrom`, dernières informations du Trésor sacrifié) ;
  - contresort qui exile un sort de permanent et mémorise la carte (`counter.exilePermanents`, `storeMoved`) ; permission de jouer en payant des PV égaux à la valeur de mana (`grantPlay.payLifeManaValue`) ;
  - `lookAtTop.random` (une carte au hasard parmi celles qui correspondent) ;
  - capacités activées des cartes correspondantes du cimetière (`gainActivatedFromGraveyard`) ;
  - filtres `sameNameAs` (« du même nom qu'un permanent [filtre] ») et `fromBattlefieldThisTurn` (`GameObject.arrivedFrom`, posé par `moveObject`) ;
  - `RULES_VERSION` = 58, parties dorées régénérées.
- **Tests :** 11 tests de règles (« lot C1 »).
