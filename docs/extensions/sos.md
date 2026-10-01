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

## Sous-lot A4 : cartes rouges ✅ (135 / 262)

- **Cartes :** 25 (sur 27), dont Opus (Thunderdrum Soloist, Pigment Wrangler, Garrison Excavator, Tome Blast…), préparées, Mica (sacrifier un artefact copie le sort), Rubble Rouser (capacité de mana à coût et capacité réflexive), Improvisation Capstone (Paradigme), Archaic's Agony (convergence et blessures en excès), flashback de Duel Tactics et Tome Blast.
- **Restent :** Magmablood Archaic (convergence « arrive avec » ; couleurs dépensées pour le sort déclencheur), Choreographed Sparks (« ce sort ne peut pas être copié » ; copie d'un sort de créature avec la célérité et sacrifiée en fin de tour).
- **Tests :** 31 tests de règles (« lot A — rouge »).

## Sous-lot A5 : cartes vertes ✅ (166 / 262)

- **Cartes :** 31 (sur 32), dont Increment (Ambitious Augmenter, Topiary Lecturer…), préparées (Emeritus of Abundance, Infirmary Healer, Studious First-Year, Vastlands Scavenger), Infusion, Fractales et convergence (Snarl Song), Slumbering Trudge.
- **[règles] Montants et conditions « arrive avec » :** ils savent additionner, opposer et prendre un maximum (Slumbering Trudge : « trois moins X marqueurs d'étourdissement »), compter les couleurs dépensées (convergence), et les conditions voient X (« si X vaut 2 ou moins, elle arrive engagée »). Correctif au passage : Sheriff of Safe Passage (OTJ) arrivait sans marqueur (0/0) ; test ajouté dans `otj.test.ts`. `RULES_VERSION` = 28.
- **Reste :** Wildgrowth Archaic (« ce sort de créature arrive avec X marqueurs, X étant le nombre de couleurs dépensées pour le lancer » : couleurs dépensées pour le sort déclencheur).
- **Tests :** 34 tests de règles (« lot A — vert ») et 1 test OTJ.

## Sous-lot A6 : multicolores, incolores et terrains ✅ (246 / 262)

- **Cartes :** 62 multicolores (sur 69 : les cinq collèges, Repartee, Infusion, Opus, Increment, préparées, convergence, les légendaires Silverquill, Prismari, Witherbloom…, Nita, Forum Conciliator, Molten Note, Fix What's Broken) et 18 incolores et terrains (les cinq Archaic incolores, Diary of Dreams, Page, Loose Leaf, Strixhaven Skycoach, terrains à surveillance et terrains « lents »).
- **Le moteur gagne :**
  - le filtre `maxManaValueColorsSpent` (« de valeur de mana au plus le nombre de couleurs dépensées pour le lancer », Sundering Archaic) ; `manaValueX` sert aussi à `moveAll` (Fix What's Broken : « chaque carte d'artefact et de créature de valeur de mana X ») ;
  - une carte rendue lançable depuis l'exil avec « puis exilez-la » y retourne (`exileAfter`, comme depuis le cimetière : Nita) ;
  - `amount.manaSpent` lit le mana dépensé pour un éphémère ou un rituel qui se résout (Molten Note).
- **[règles]** `RULES_VERSION` = 29.
- **Restent :** Suspend Aggression (« jusqu'à la fin du prochain tour de son propriétaire »), Zaffai and the Tempests (sort gratuit une fois par tour), Geometer's Arthropod et Paradox Surveyor (« carte avec {X} dans son coût »), Fractal Tender (« si vous avez mis un marqueur sur elle ce tour-ci »), Lorehold, the Historian (miracle), Quandrix, the Proof (cascade).
- **Tests :** 59 tests de règles (« lot A — multicolores ») et 19 (« lot A — incolores et terrains »).

## Sous-lot B1 : sorts avec {X} dans leur coût ✅ (249 / 262)

- **Cartes :** Matterbending Mage, Geometer's Arthropod, Paradox Surveyor.
- **Le moteur gagne :** le filtre `hasX` (« un sort / une carte avec {X} dans son coût de mana », lu sur les instantanés et les vues de sorts) et `amount.eventX` (le X du sort déclencheur).
- **Tests :** 3 tests de règles (« lot B1 »).

## Sous-lot B2 : couleurs dépensées pour le sort déclencheur ✅ (251 / 262)

- **Cartes :** Magmablood Archaic, Wildgrowth Archaic.
- **Le moteur gagne :** `amount.eventColorsSpent` (couleurs de mana dépensées pour le sort de l'événement) ; la convergence « arrive avec » passe par `entersWith({ counters: amount.colorsSpent })` (lot A5). Le helper de test `scenario` accepte des marqueurs sur un permanent (`counters`).
- **Dette :** l'entrée `spellArrivalCounters` est retirée (l'opération sert à deux cartes).
- **Tests :** 2 tests de règles (« lot B2 »).

## Sous-lot B3 : coûts ✅ (254 / 262)

- **Cartes :** Group Project, Soaring Stoneglider, Brush Off.
- **Le moteur gagne :**
  - `flashbackCost` (un `AdditionalCost` ajouté au flashback) remplace `flashbackDiscard` : « Flashback—engagez trois créatures dégagées » (Group Project, avec un flashback {0}) ; Twinned Vision devient `{ discard: 1 }` ;
  - « en coût additionnel, exilez N cartes de votre cimetière ou payez [mana] » est lu dans le texte : kicker sans mana `kickerCost.exileGraveyard` (cartes choisies automatiquement, terrains d'abord) et `kickerOrPay`, sur le modèle de « flétrissez N ou payez » ;
  - la réduction propre au sort peut retirer des symboles colorés (`costReduction.colored`, Brush Off : {1}{U}) et sa condition « s'il cible… » reconnaît un sort ciblé sur la pile.
- **Tests :** 3 tests de règles (« lot B3 »).
