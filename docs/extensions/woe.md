# Wilds of Eldraine (WOE, « Les friches d'Eldraine », 269 cartes)

Mécaniques et détail des lots.

Extension demandée par l'utilisateur le 01/10/2026, avec Secrets of Strixhaven et Murders at Karlov Manor. 11 cartes étaient déjà gérées depuis la phase méta (lots M1 à M6, `docs/extensions/meta.md`) : Aventures, Marchandage, Song of Totentanz, The End, Restless Cottage… L'extension suit les règles d'intégration de CLAUDE.md (dette, R1, R7). Découpage : un sous-lot et un commit par couleur pour le lot A, par mécanique pour le lot B, par famille de cartes uniques ensuite.

| Mécanique | Lot |
|---|---|
| Socle : Rôles (jetons-Auras, 704.5y), Célébration, jetons | 0 |
| Cartes faisables avec le moteur, par couleur | A1 à A6 |
| Mécaniques phares restantes | B |
| Légendaires et cartes uniques | C et suivants |

Les scripts sont dans `packages/cards/src/woe/` : `cards` (cartes du méta), `white`, `blue`, `black`, `red`, `green`, `multi`, `artifacts` (incolores et terrains) et `legends`. Les aides sont dans `woe/common.ts`.

## Sous-lot 0 : socle ✅ (11 / 269)

- **Rôles (303.7) :** jetons d'enchantement Aura, sous-type Role, « Enchant creature » (`TokenSpec.enchant`, nouveau) : Cursed (la créature est 1/1), Monster (+1/+1, piétinement), Royal (+1/+1, garde {1}), Sorcerer (+1/+1, regard 1 en attaquant), Virtuous (+1/+1 par enchantement que vous contrôlez), Wicked (+1/+1 ; au cimetière, chaque adversaire perd 1 PV), Young Hero (en attaquant avec une endurance de 3 ou moins, un marqueur +1/+1). `createRole(rôle, créature)` crée le jeton attaché, et rien si la créature n'est plus là (303.7b).
- **[règles] 704.5y :** plusieurs Rôles d'un même joueur attachés au même permanent : seul le plus récent reste (`turn.ts`). `RULES_VERSION` = 26.
- **Célébration :** `CELEBRATION`, « deux permanents non-terrain ou plus sont arrivés sous votre contrôle ce tour-ci » (journal du tour, jetons compris).
- **Jetons :** Chevalier 2/2 avec la vigilance, Humain 1/1 ; Rat « ne peut pas bloquer », Nourriture et Trésor viennent des communs.
- **Tests :** 5 tests dans `engine/test/woe.test.ts` (Monster et Cursed, deux joueurs, Wicked, Young Hero, Célébration) ; test de fumée `ai/test/smoke/woe.test.ts`.
