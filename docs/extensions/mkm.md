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

## Sous-lot A1 : cartes blanches ✅ (37 / 268)

- **Cartes :** 27 (sur 34), dont le suspect, les Affaires (Case of the Pilfered Proof), le déguisement (Perimeter Enforcer, Haazda Vigilante…), les Indices et les Détectives.
- **[règles] Corrections du moteur (trouvées par les agents du lot A) :**
  - une capacité déclenchée « une, deux ou trois cibles » (`target.between`) respecte son minimum : Armament Dragon (TDM) n'avait aucune cible avec moins de trois créatures (test ajouté dans `tdm.test.ts`) ;
  - la condition d'une capacité déclenchée voit l'événement entier (`amount.eventAmount` : « si 3 blessures ou plus ») ;
  - `cond.handAtMost` (« s'il n'a pas de carte en main ») est évaluée hors résolution (« Pour résoudre » d'une Affaire, condition d'un déclencheur) : elle était toujours fausse.
  - `RULES_VERSION` = 33.
- **Dette :** l'opération `suspect` (701.60) entre dans `debt-baseline.json` tant qu'une seule carte l'utilise ; `solveCase` (Affaires) en sort, plusieurs cartes s'en servent.
- **Restent :** Aurelia's Vindicator (X du coût de déguisement), Case File Auditor (« chaque fois que vous résolvez une Affaire »), Case of the Gateway Express (chaque créature inflige 1 blessure), Karlov Watchdog (« ne peuvent pas être retournés face visible »), No Witnesses (« chaque joueur qui contrôle le plus de créatures »), Wojek Investigator (« adversaires qui ont plus de cartes en main »), Tenth District Hero (réunir des preuves en coût de capacité).
- **Tests :** 35 tests de règles (« lot A — blanc »).
