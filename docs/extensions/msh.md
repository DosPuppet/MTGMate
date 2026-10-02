# Marvel Super Heroes (MSH, 271 cartes)

Mécaniques et détail des lots.

Extension demandée par l'utilisateur le 02/10/2026, après Avatar: The Last Airbender. 20 cartes étaient déjà gérées depuis la phase méta (lots M1 à M6, `docs/extensions/meta.md`) : montée en puissance (`activated({ powerUp: true })`), travail d'équipe (lu dans le texte, un kicker « engagez des créatures de force totale N »), exploiter (`fx.harness`, `cond.harnessed`), équiper digne, Doombot… L'extension suit les règles d'intégration de CLAUDE.md (dette, R1, R7). Découpage : un sous-lot et un commit par couleur pour le lot A, par mécanique pour le lot B, par famille de cartes uniques ensuite.

| Mécanique | Lot |
|---|---|
| Socle : jetons | 0 |
| Cartes faisables avec le moteur, par couleur | A1 à A6 |
| Mécaniques phares restantes | B |
| Légendaires et cartes uniques | C et suivants |

Les scripts sont dans `packages/cards/src/msh/` : `cards` (cartes du méta), `white`, `blue`, `black`, `red`, `green`, `multi`, `artifacts` (incolores et terrains) et `legends`. Les aides sont dans `msh/common.ts`.

## Sous-lot 0 : socle ✅ (20 / 271)

- **Jetons :** Méchant 2/1 noir avec la menace, Héros 3/2 blanc avec la vigilance, Robot Méchant 2/2 incolore (artefact), Mur 0/4 incolore avec le défenseur, Insecte 1/1 vert, Ondin 1/1 bleu ; Doombot existait ; Soldat, Indice, Trésor et Nourriture viennent des communs.
- **Moteur :** rien de nouveau.
- **Tests :** test de fumée `ai/test/smoke/msh.test.ts`.
