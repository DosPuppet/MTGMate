# Teenage Mutant Ninja Turtles (TMT, « Les Tortues Ninja », 188 cartes)

Mécaniques et détail des lots.

Extension demandée par l'utilisateur le 02/10/2026, après Marvel's Spider-Man et avant The Hobbit. 12 cartes étaient déjà gérées depuis la phase méta (lots M1 à M6, `docs/extensions/meta.md`) : faufilement (lu dans le texte, coût alternatif en renvoyant un attaquant non bloqué), jetons Mutagène, Classes… L'extension suit les règles d'intégration de CLAUDE.md (dette, R1, R7). Découpage : un sous-lot et un commit par couleur pour le lot A, par mécanique pour le lot B, par famille de cartes uniques ensuite.

| Mécanique | Lot |
|---|---|
| Socle : jetons | 0 |
| Cartes faisables avec le moteur, par couleur | A1 à A6 |
| Mécaniques phares restantes | B |
| Légendaires et cartes uniques | C et suivants |

Les scripts sont dans `packages/cards/src/tmt/` : `cards` (cartes du méta), `white`, `blue`, `black`, `red`, `green`, `multi` et `artifacts` (incolores et terrains). Les aides sont dans `tmt/common.ts`.

## Sous-lot 0 : socle ✅ (12 / 188)

- **Jetons :** Mutant 2/2 rouge, Ninja 1/1 noir, Robot 1/1 incolore (artefact), Insecte Guerrier 1/1 noir, Dinosaure Soldat 2/2 blanc ; Mutagène et Esprit Tortue Ninja existaient ; Rat, Nourriture et Trésor viennent des communs.
- **Moteur :** « si son coût de faufilement a été payé » se lit aussi sur le permanent (`cond.castVia("sneak")`, comme le Web-slinging et le chaos).
- **Tests :** test de fumée `ai/test/smoke/tmt.test.ts`.

## Sous-lot A1 : cartes blanches ✅ (38 / 188)

- **Cartes (26) :** Action News Crew, Agent Bishop,  Man in Black, April O'Neil,  Kunoichi Trainee, Dimensional Exile, East Wind Avatar, Featherbrained Filcher, Grounded for Life, Hamato Guardian Stance, High-Flying Ace, Jennika,  Bad Apple Big Sister, Koya,  Death from Above, Leader's Talent, Leonardo,  Big Brother, Leonardo,  Cutting Edge, Leonardo,  Leader in Blue, Leonardo,  Sewer Samurai, Leonardo's Technique, Lita,  Little Orphan Amphibian, Mighty Mutanimals, Prehistoric Pet, Quintessential Katana, Sally Pride,  Lioness Leader, Triceraton Commander, Turncoat Kunoichi, Turtles Forever, Uneasy Alliance.
- **Moteur :** rien de nouveau.
- **Écart trouvé :** le faufilement n'était pas jouable pour une créature ou un rituel (aucune fenêtre de lancement, pas d'arrivée engagée et attaquante) ; corrigé au sous-lot B1, où les deux tests désactivés (Leonardo, Leader in Blue ; Turncoat Kunoichi) sont réactivés.
- **Tests :** 37 tests de règles (« lot A, blanc ») ; The Ooze : un Mutagène par marqueur +1/+1 d'une créature qui part (la note qui le disait intestable était périmée).
