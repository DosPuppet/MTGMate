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

## Sous-lot A1 : cartes blanches ✅ (54 / 262)

- **Cartes :** 27 (sur 29), dont 6 cartes préparées (Elite Interceptor, Emeritus of Truce, Honorbound Page, Informed Inkwright, Joined Researchers, Spiritcall Enthusiast…), Repartee (Eager Glyphmage, Rehearsed Debater, Stirring Hopesinger…), le flashback d'Antiquities on the Loose et de Dig Site Inventory (écrit dans le script : il n'est pas lu dans le texte).
- **Restent :** Group Project (flashback « engagez trois créatures », coût sans mana), Soaring Stoneglider (« exilez deux cartes de votre cimetière ou payez {1}{W} »).
- **Tests :** 29 tests de règles (« lot A — blanc »).

## Sous-lot A2 : cartes bleues ✅ (82 / 262)

- **Cartes :** 26 (sur 29), dont 7 préparées (Campus Composer, Encouraging Aviator, Harmonized Trio, Jadzi, Landscape Painter, Skycoach Conductor, Spellbook Seeker), Increment (Pensive Professor, Tester of the Tangential, Textbook Tabulator), Opus (Muse Seeker, Divergent Equation…), Fractalize, Mathemagics.
- **Le moteur gagne :**
  - `fx.modify(…, basePT)` : F/E de base fixées à un montant évalué à la résolution (Fractalize : X+1/X+1) ;
  - `fx.removeCounters` prend un montant ; `amount.pow(base, X)` (Mathemagics : 2^X cartes) ;
  - `countX: "upTo"` : « jusqu'à X cibles » (Divergent Equation) ;
  - `fx.reflexive(…, keepVars)` : la capacité réflexive reçoit des valeurs mémorisées (« payez {X}. Quand vous le faites, déplacez X marqueurs », Tester of the Tangential).
- **Dette :** l'entrée `payX` de `debt-baseline.json` est retirée (l'opération sert à deux cartes).
- **Restent :** Brush Off (réduction « s'il cible un sort », colorée), Mana Sculpt (mana dépensé pour le sort ciblé, « au début de votre prochaine phase principale »), Matterbending Mage (« un sort avec {X} dans son coût »).
- **Tests :** 32 tests de règles (« lot A — bleu »).

## Sous-lot A3 : cartes noires ✅ (110 / 262)

- **Cartes :** 28 (sur 29), dont 7 préparées (sorts lancés depuis l'exil, conditions de préparation), Repartee, Infusion (Foolish Fate, Poisoner's Apprentice…), convergence, End of the Hunt, Postmortem Professor, Withering Curse.
- **Correctif :** « répartissez X marqueurs » avec moins de marqueurs que de cibles n'exige plus un marqueur par cible (choix impossible trouvé par le fuzz).
- **Reste :** Pox Plague (montants par joueur : « perdez la moitié de vos PV, arrondie à l'inférieur », « défaussez la moitié de votre main »).
- **Tests :** 30 tests de règles (« lot A — noir »).
