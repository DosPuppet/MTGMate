# Secrets of Strixhaven (SOS, « Les secrets de Strixhaven », 262 cartes)

Mécaniques et détail des lots.

Extension demandée par l'utilisateur le 01/10/2026, après Wilds of Eldraine et avant Murders at Karlov Manor. 27 cartes étaient déjà gérées depuis la phase méta (lots M1 à M6, `docs/extensions/meta.md`) : préparation (Emeritus of Ideation), Opus (Colorstorm Stallion), Infusion (Moseo), Paradigme (Decorum Dissertation), convergence, flashback, terrains bicolores… L'extension suit les règles d'intégration de CLAUDE.md (dette, R1, R7). Découpage : un sous-lot et un commit par couleur pour le lot A, par mécanique pour le lot B, par famille de cartes uniques ensuite.

| Mécanique | Lot |
|---|---|
| Socle : jetons, aides Repartee, Infusion, Opus, Increment | 0 |
| Cartes faisables avec le moteur, par couleur | A1 à A6 |
| Mécaniques phares restantes | B |
| Légendaires et cartes uniques | C et suivants |

Les scripts sont dans `packages/cards/src/sos/` : `cards` (cartes du méta), `white`, `blue`, `black`, `red`, `green`, `multi`, `artifacts` (incolores et terrains) et `legends`. Les aides sont dans `sos/common.ts`.

## Sous-lot 0 : socle ✅ (27 / 262)

- **Jetons :** Nuisible 1/1 noir et vert (« en attaquant, vous gagnez 1 PV »), Inkling 1/1 blanc et noir volant, Esprit 2/2 rouge et blanc, Fractale 0/0 verte et bleue, Élémental 3/3 bleu et rouge volant.
- **Repartee :** `REPARTEE`, « chaque fois que vous lancez un sort d'éphémère ou de rituel qui cible une créature » (`when.castSpell` avec `targeting`).
- **Infusion :** `INFUSION`, « si vous avez gagné des points de vie ce tour-ci ».
- **Opus :** `OPUS` (« chaque fois que vous lancez un sort d'éphémère ou de rituel »), `OPUS_BIG` (cinq mana ou plus dépensés) et `opusInstead(normal, renforcé)` (« … à la place »).
- **Increment :** `INCREMENT`, « chaque fois que vous lancez un sort, si le mana dépensé est supérieur à la force ou à l'endurance de cette créature, un marqueur +1/+1 ».
- **[règles] Conditions « si » des capacités déclenchées :** un montant lu dans une condition voit l'objet de l'événement (`checkAmount`, `amount.eventManaSpent` : le sort lancé). `RULES_VERSION` = 27.
- **Couverture :** `npm run coverage -- --text` affiche aussi le sort d'une carte « préparée » (`prepareFace`).
- **Tests :** 4 tests dans `engine/test/sos.test.ts` (« socle ») ; test de fumée `ai/test/smoke/sos.test.ts`.
