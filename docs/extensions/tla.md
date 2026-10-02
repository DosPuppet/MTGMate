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
