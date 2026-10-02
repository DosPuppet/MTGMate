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
