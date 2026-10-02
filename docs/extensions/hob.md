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
