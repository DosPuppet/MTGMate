# Marvel's Spider-Man (SPM, 188 cartes)

Mécaniques et détail des lots.

Extension demandée par l'utilisateur le 02/10/2026, après Marvel Super Heroes, avec Teenage Mutant Ninja Turtles et The Hobbit. 10 cartes étaient déjà gérées depuis la phase méta (lots M1 à M6, `docs/extensions/meta.md`) : Web-slinging (lu dans le texte, coût alternatif qui renvoie en main une créature engagée), chaos (Mayhem, lu dans le texte : une carte défaussée ce tour-ci se lance depuis le cimetière pour son coût de chaos), Superior Spider-Man (copie d'une carte de cimetière en arrivant)… L'extension suit les règles d'intégration de CLAUDE.md (dette, R1, R7). Découpage : un sous-lot et un commit par couleur pour le lot A, par mécanique pour le lot B, par famille de cartes uniques ensuite.

| Mécanique | Lot |
|---|---|
| Socle : jetons, « modifié » | 0 |
| Cartes faisables avec le moteur, par couleur | A1 à A6 |
| Mécaniques phares restantes | B |
| Légendaires et cartes uniques | C et suivants |

Les scripts sont dans `packages/cards/src/spm/` : `cards` (cartes du méta), `white`, `blue`, `black`, `red`, `green`, `multi` et `artifacts` (incolores et terrains). Les aides sont dans `spm/common.ts`.

## Sous-lot 0 : socle ✅ (10 / 188)

- **Jetons :** Citoyen humain 1/1 vert et blanc, Araignée 2/1 verte avec la portée, Robot 1/1 incolore (artefact) avec le vol, Illusion Méchant 3/3 bleue ; Trésor et Nourriture viennent des communs.
- **Moteur :** filtre `modified` (700.9) : un permanent qui porte un marqueur, est équipé, ou est enchanté par une Aura que son contrôleur contrôle.
- **Tests :** test de fumée `ai/test/smoke/spm.test.ts` ; filtre « modifié » dans `rulings.test.ts`.
