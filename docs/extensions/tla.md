# Avatar: The Last Airbender (TLA, 280 cartes)

Mécaniques et détail des lots.

Extension demandée par l'utilisateur le 02/10/2026, avant Marvel Super Heroes. 28 cartes étaient déjà gérées depuis la phase méta (lots M1 à M6, `docs/extensions/meta.md`) : maîtrise de la terre (`fx.earthbend`), de l'air (`fx.airbend`) et du feu (lue dans le texte), Leçons, Alliés… L'extension suit les règles d'intégration de CLAUDE.md (dette, R1, R7). Découpage : un sous-lot et un commit par couleur pour le lot A, par mécanique pour le lot B, par famille de cartes uniques ensuite.

| Mécanique | Lot |
|---|---|
| Socle : maîtrise de l'eau (coûts de capacités), maîtrise du feu jusqu'à la fin du combat, jetons | 0 |
| Cartes faisables avec le moteur, par couleur | A1 à A6 |
| Mécaniques phares restantes (maîtrise de l'eau en coût de sort, « chaque fois que vous maîtrisez »…) | B |
| Légendaires et cartes uniques | C et suivants |

Les scripts sont dans `packages/cards/src/tla/` : `cards` (cartes du méta), `white`, `blue`, `black`, `red`, `green`, `multi`, `artifacts` (incolores et terrains) et `legends`. Les aides sont dans `tla/common.ts`.

## Sous-lot 0 : socle ✅ (28 / 280)

- **Maîtrise de l'eau (waterbend) :** `activated({ mana: "{3}", waterbend: true, … })` (« Waterbend {3} : … ») ; en payant, chaque artefact ou créature dégagé que vous contrôlez peut être engagé pour payer {1} (source `WATERBEND` du solveur de mana, après les terrains, plafonnée par `ManaPurpose.waterbend`), X compris (« Waterbend {X} »).
- **Maîtrise du feu N :** `firebending(n)` (DSL ; N peut être un montant) ; le mana reste jusqu'à la fin du combat (`fx.addManaUntilEndOfCombat`, réserve `manaKeepCombat`), et non plus jusqu'à la fin du tour (approximation levée). Lue dans le texte aussi parmi d'autres mots-clés (« Flying, firebending 2 », « Trample, firebending 4, haste »).
- **Jetons :** Soldat 2/2 rouge avec la maîtrise du feu 1, Moine 1/1 rouge avec la prouesse, Ours 4/4 vert ; Allié, Esprit et Dragon 4/4 (maîtrise du feu 4) existaient ; Indice et Nourriture viennent des communs.
- **Version des règles :** 38.
- **Tests :** 5 tests dans `engine/test/tla.test.ts` (« socle ») ; test de fumée `ai/test/smoke/tla.test.ts`.

## Sous-lot A1 : cartes blanches ✅ (63 / 280)

- **Cartes (35) :** Aang, the Last Airbender, Aang's Iceberg, Airbender's Reversal, Airbending Lesson, Appa, Loyal Sky Bison, Avatar Enthusiasts, Compassionate Healer, Curious Farm Animals, Earth Kingdom Jailer, Earth Kingdom Protectors, Enter the Avatar State, Fancy Footwork, Gather the White Lotus, Glider Kids, Glider Staff, Hakoda, Selfless Commander, Invasion Reinforcements, Jeong Jeong's Deserters, Kyoshi Warriors, The Legend of Yangchen // Avatar Yangchen, Master Piandao, Momo, Playful Pet, Path to Redemption, Rabaroo Troop, Razor Rings, Sandbenders' Storm, South Pole Voyager, Southern Air Temple, Suki, Courageous Rescuer, Team Avatar, United Front, Vengeful Villagers, Water Tribe Captain, Water Tribe Rallier, Yip Yip!
- **Moteur :** rien de nouveau (formes existantes : `playFrom` du dessus de la bibliothèque filtré, `countResolution`, `damageStoringExcess`, maîtrise de l'eau du socle).
- **Reste pour plus tard :** Destined Confrontation (chaque joueur garde des créatures de force totale 4 ou moins et sacrifie les autres).
- **Tests :** 35 tests de règles (« lot A, blanc »).

## Sous-lot A2 : cartes bleues ✅ (93 / 280)

- **Cartes (30) :** Boomerang Basics, Ember Island Production, First-Time Flyer, Flexible Waterbender, Forecasting Fortune Teller, Geyser Leaper, Giant Koi, Gran-Gran, Honest Work, Invasion Submersible, Katara, Bending Prodigy, Knowledge Seeker, The Legend of Kuruk // Avatar Kuruk, Lost Days, Master Pakku, The Mechanist, Aerial Artisan, North Pole Patrol, Octopus Form, Otter-Penguin, Rowdy Snowballers, Serpent of the Pass, Sokka's Haiku, The Spirit Oasis, Teo, Spirited Glider, Tiger-Seal, Ty Lee, Chi Blocker, Waterbender Ascension, Waterbending Scroll, Watery Grasp, Yue, the Moon Spirit.
- **Moteur :** rien de nouveau ; la maîtrise de l'eau du socle sert à dix capacités. Le tour supplémentaire (Avatar Kuruk) sert désormais à deux cartes : son entrée de dette est retirée.
- **Reste pour plus tard :** Benevolent River Spirit, Crashing Wave, Spirit Water Revival, Secret of Bloodbending (maîtrise de l'eau en coût de sort ; contrôle de l'adversaire pendant sa prochaine phase de combat), The Unagi of Kyoshi Island (garde « maîtrise de l'eau {4} »), Waterbending Lesson (« à moins de maîtriser l'eau {2} »).
- **Tests :** 38 tests de règles (« lot A, bleu »).

## Sous-lot A3 : cartes noires ✅ (122 / 280)

- **Cartes (29) :** Azula Always Lies, Azula, On the Hunt, Beetle-Headed Merchants, Boiling Rock Rioter, Buzzard-Wasp Colony, Canyon Crawler, Cat-Gator, Corrupt Court Official, Dai Li Indoctrination, Epic Downfall, Fatal Fissure, The Fire Nation Drill, Fire Nation Engineer, Fire Navy Trebuchet, Foggy Swamp Hunters, Hog-Monkey, Joo Dee, One of Many, June, Bounty Hunter, Mai, Scornful Striker, Merchant of Many Hats, Northern Air Temple, Ozai's Cruelty, Phoenix Fleet Airship, Pirate Peddlers, Sold Out, Swampsnare Trap, Tundra Tank, Wolfbat, Zuko's Conviction.
- **Moteur :** rien de nouveau (emblème lié à la source pour Fatal Fissure, cartes liées lancées depuis l'exil pour Boiling Rock Rioter, réduction de coût selon l'Aura ciblée pour Swampsnare Trap).
- **Reste pour plus tard :** Foggy Swamp Visions et Ruinous Waterbending (maîtrise de l'eau en coût de sort), Koh, the Face Stealer (capacités de la dernière carte choisie), Lo and Li, Twin Tutors (mots-clés donnés aux sorts), The Rise of Sozin // Fire Lord Sozin (valeur de mana totale X des cibles).
- **Tests :** 34 tests de règles (« lot A, noir »).

## Sous-lot A4 : cartes rouges ✅ (151 / 280)

- **Cartes (29) :** Boar-q-pine, Bumi Bash, The Cave of Two Lovers, Combustion Man, Crescent Island Temple, Cunning Maneuver, Deserter's Disciple, Fire Nation Attacks, Fire Nation Cadets, Fire Nation Raider, Fire Sages, Firebending Student, How to Start a Riot, Jeong Jeong, the Deserter, Jet's Brainwashing, Mai, Jaded Edge, Mongoose Lizard, Ran and Shaw, Rough Rhino Cavalry, Solstice Revelations, Tiger-Dillo, Treetop Freedom Fighters, Twin Blades, Ty Lee, Artful Acrobat, War Balloon, Wartime Protestors, Yuyan Archers, Zhao, the Moon Slayer, Zuko, Exiled Prince.
- **Moteur :** rien de nouveau ; la maîtrise du feu du socle sert aussi en montant (Firebending Student : « maîtrise du feu X, X étant sa force ») et donnée sous condition (Fire Nation Cadets).
- **Reste pour plus tard :** Fated Firepower (blessures augmentées du nombre de marqueurs de feu), Firebender Ascension (copier une capacité déclenchée par une attaque), The Last Agni Kai (blessures en excès d'un combat ; garder le mana rouge), Redirect Lightning (coût additionnel « 5 PV ou {2} »), Sozin's Comet (présage).
- **Tests :** 37 tests de règles (« lot A, rouge »).

## Sous-lot A5 : cartes vertes ✅ (182 / 280)

- **Cartes (31) :** Allies at Last, Badgermole, Badgermole Cub, The Boulder, Ready to Rumble, Cycle of Renewal, The Earth King, Earth Kingdom General, Earth Rumble, Earthbending Lesson, Elemental Teachings, Flopsie, Bumi's Buddy, Foggy Swamp Vinebender, Great Divide Guide, Haru, Hidden Talent, Invasion Tactics, Kyoshi Island Plaza, Leaves from the Vine, The Legend of Kyoshi // Avatar Kyoshi, Origin of Metalbending, Ostrich-Horse, Pillar Launch, Raucous Audience, Rebellious Captives, Rockalanche, Rocky Rebuke, Seismic Sense, Sparring Dummy, True Ancestry, Turtle-Duck, Unlucky Cabbage Merchant, Walltop Sentries.
- **Correctif du moteur (608.2h) :** la force et l'endurance de la créature d'un événement qui a quitté le champ de bataille (« quand elle meurt, X étant sa force ») sont ses dernières informations connues, et non celles de la carte qu'elle est devenue. Le défaut touchait aussi des cartes déjà gérées (Rakdos Joins Up, cartes d'ECL, de MKM, de FIN et de LCI). Test tiré des règles dans `rulings.test.ts`.
- **Badgermole Cub :** sa capacité de mana déclenchée est un remplacement de mana (R1, famille I), comme Lavaleaper (entrée de l'audit justifiée).
- **Reste pour plus tard :** Avatar Destiny, Toph, the Blind Bandit (F/E définies par le nombre de marqueurs), Earthen Ally (+1/+0 par couleur parmi vos Alliés), Diligent Zookeeper (+1/+1 par type de créature de chacune), Bumi, King of Three Trials (« jusqu'à X modes » pour une capacité déclenchée).
- **Version des règles :** 39.
- **Tests :** 33 tests de règles (« lot A, vert ») et 1 test tiré des règles.

## Sous-lot A6 : multicolores, incolores et terrains ✅ (252 / 280)

- **Multicolores (44) :** Air Nomad Legacy, Azula, Cunning Usurper, Beifong's Bounty Hunters, Bitter Work, Bumi, Unleashed, Cat-Owl, Cruel Administrator, Dai Li Agents, Dragonfly Swarm, Earth Kingdom Soldier, Earth King's Lieutenant, Earth Rumble Wrestlers, Earth Village Ruffians, Fire Lord Azula, Fire Lord Zuko, Foggy Swamp Spirit Keeper, Guru Pathik, Hei Bai, Spirit of Balance, Hermitic Herbalist, Iroh, Tea Master, Jet, Freedom Fighter, Katara, the Fearless, Katara, Water Tribe's Hope, The Lion-Turtle, Long Feng, Grand Secretariat, Messenger Hawk, Platypus-Bear, Pretending Poxbearers, Professor Zei, Anthropologist, Sandbender Scavengers, Sokka, Bold Boomeranger, Sokka, Lateral Strategist, Sokka, Tenacious Tactician, Suki, Kyoshi Warrior, Sun Warriors, Tolls of War, Toph, Hardheaded Teacher, Toph, the First Metalbender, Uncle Iroh, Vindictive Warden, Wandering Musicians, White Lotus Reinforcements, Zhao, Ruthless Admiral, Zuko, Conflicted.
- **Incolores et terrains (26) :** Aang's Journey, Energybending, Zuko's Exile, Barrels of Blasting Jelly, Bender's Waterskin, Fire Nation Warship, Kyoshi Battle Fan, Meteor Sword, Trusty Boomerang, The Walls of Ba Sing Se, Agna Qel'a, Airship Engine Room, Boiling Rock Prison, Fire Nation Palace, Foggy Bottom Swamp, Jasmine Dragon Tea Shop, Kyoshi Village, Meditation Pools, Misty Palms Oasis, North Pole Gates, Omashu City, Rumble Arena, Secret Tunnel, Serpent's Pass, Sun-Blessed Peak, White Lotus Hideout.
- **Moteur :** « X ne peut pas être 0 » (`activated({ minX: 1 })`) : la capacité n'est proposée que si X peut atteindre son minimum, une activation avec un X plus petit est refusée, l'IA et l'interface (curseur de X) le respectent. Sans lui, l'IA aléatoire activait Katara, Water Tribe's Hope pour X = 0 sans fin (parties inachevées du fuzz). Gogo, Master of Mimicry (FIN) en profite. Version des règles : 40. Fire Lord Zuko (« un permanent arrive depuis l'exil », sans les sorts lancés depuis l'exil, déjà comptés par sa première moitié) passe par un changement de zone exil → champ de bataille ; Fire Nation Warship meurt aussi quand il n'est pas une créature (700.4, `putIntoGraveyardSelf`).
- **Reste pour plus tard :** Avatar Aang (« chaque fois que vous maîtrisez… »), Hama, the Bloodbender (maîtrise de l'eau en coût alternatif), Iroh, Grand Lotus (flashback donné aux cartes du cimetière), Ozai, the Phoenix King (mana non dépensé qui devient rouge), Planetarium of Wan Shi Tong (lancer la carte du dessus de la bibliothèque), White Lotus Tile (plus grand nombre de créatures partageant un type).
- **Tests :** 43 tests de règles (« lot A, multicolores ») et 19 (« lot A, incolores et terrains »).

## Sous-lot B1 : maîtrise de l'eau en coût de sort ✅ (261 / 280)

- **Cartes (9) :** Benevolent River Spirit, Crashing Wave, Spirit Water Revival, Secret of Bloodbending, The Unagi of Kyoshi Island, Waterbending Lesson, Foggy Swamp Visions, Ruinous Waterbending, Hama, the Bloodbender.
- **Le moteur gagne :**
  - la maîtrise de l'eau en coût additionnel de sort, lue dans le texte : obligatoire (« waterbend {5} », `CardDef.waterbend`), en X (« waterbend {X} », `xCost: "waterbend"`) ou facultative (« you may waterbend {N} », un kicker `kickerKind: "waterbend"`, lu par `cond.kicked`) ; la part payable en engageant artefacts et créatures est exactement celle de la maîtrise (`waterbendAmount`, `ManaPurpose.waterbend`), selon le kicker et X ;
  - la garde « Ward—Waterbend {4} » (`ward.waterbend`), « à moins de maîtriser l'eau {2} » (`fx.unlessPays(…, { waterbend: true })`) et « vous pouvez maîtriser l'eau » (`fx.mayWaterbend`) ;
  - les cartes liées lancées en maîtrisant l'eau {X}, X étant leur valeur de mana (`castPermission({ linkedCards, linkedWaterbend })`, Hama) ;
  - le contrôle d'un joueur pendant sa seule prochaine phase de combat (`fx.controlNextTurn(who, true)`, `turnControl.combatOnly`), annoncé au journal ;
  - `fx.countersDivided(total, objets, { counter, anyNumber })` : une autre sorte de marqueur (étourdissement), répartie à la résolution entre un nombre quelconque d'objets.
- **Dette :** le contrôle d'un autre joueur (`controlNextTurn`) sert désormais à deux cartes : son entrée est retirée.
- **Version des règles :** 41.
- **Tests :** 9 tests de règles (« lot B1 »).
