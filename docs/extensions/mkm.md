# Murders at Karlov Manor (MKM, « Meurtres au manoir Karlov », 268 cartes)

Mécaniques et détail des lots.

Extension demandée par l'utilisateur le 01/10/2026, après Wilds of Eldraine et Secrets of Strixhaven. 10 cartes étaient déjà gérées depuis la phase méta (lots M1 à M6, `docs/extensions/meta.md`) : terrains à surveillance, Vengeful Tracker, réunir des preuves (Deadly Cover-Up)… Le déguisement, la cape, les Affaires, réunir des preuves et les Indices existent déjà dans le moteur. L'extension suit les règles d'intégration de CLAUDE.md (dette, R1, R7). Découpage : un sous-lot et un commit par couleur pour le lot A, par mécanique pour le lot B, par famille de cartes uniques ensuite.

| Mécanique | Lot |
|---|---|
| Socle : suspect (701.60), jetons | 0 |
| Cartes faisables avec le moteur, par couleur | A1 à A6 |
| Mécaniques phares restantes | B |
| Légendaires et cartes uniques | C et suivants |

Les scripts sont dans `packages/cards/src/mkm/` : `cards` (cartes du méta), `white`, `blue`, `black`, `red`, `green`, `multi`, `artifacts` (incolores et terrains) et `legends`. Les aides sont dans `mkm/common.ts`.

## Sous-lot 0 : socle ✅ (10 / 268)

- **Suspect (701.60) :** désignation `GameObject.suspected` ; un permanent suspect a la menace et « ne peut pas bloquer » (ajoutés avec les mots-clés des marqueurs, après les effets de couche 6) ; `fx.suspect(ref)` et `fx.suspect(ref, false)` (« il n'est plus suspect ») ; filtre `suspected` (`SUSPECTED` : « créature suspecte ») ; la désignation se perd en quittant le champ de bataille. La vue la montre (`ObjectView.suspected`, pastille « Suspecte »).
- **Jetons :** Détective 2/2 blanc et bleu, Squelette 2/1 noir, Esprit 1/1 blanc et noir volant, Loup 5/5 vert et blanc avec le piétinement, Araignée 2/1 noire et verte (portée, menace), Diablotin 2/2 rouge (« en mourant, 2 blessures à chaque adversaire »), Merfolk 1/1 bleu ; Indice, Thopter, Chien, Humain et Gobelin viennent des communs.
- **Tests :** 2 tests dans `engine/test/mkm.test.ts` (« socle ») ; test de fumée `ai/test/smoke/mkm.test.ts`.
