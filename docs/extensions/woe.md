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

## Sous-lot A1 : cartes blanches ✅ (53 / 269)

- **Cartes :** 42 (sur 45), dont 7 Aventures (deux entrées chacune), les Rôles (Betroth the Beast, Charmed Clothier, Cursed Courtier, Unassuming Sage, Spellbook Vendor, Protective Parents, Return Triumphant), la Célébration (Armory Mice, Gallant Pie-Wielder, Tuinvale Guide, Pests of Honor, Lady of Laughter), le Marchandage (Archon's Glory, Kellan's Lightblades), les Sagas The Princess Takes Flight et Three Blind Mice.
- **Restent :** Archon of the Wild Rose et A Tale for the Ages (filtre « créature enchantée »), Solitary Sanctuary (qui engage une créature).
- **Tests :** 38 tests de règles dans `engine/test/woe.test.ts` (« lot A — blanc »).

## Sous-lot A2 : cartes bleues ✅ (88 / 269)

- **Cartes :** 35 (sur 41), dont 11 Aventures (Aquatic Alchemist, Beluna's Gatekeeper, Galvanic Giant, Horned Loch-Whale, Obyra's Attendants, Picklock Prankster, Vantress Transmuter, Virtue of Knowledge, Frolicking Familiar, Threadbind Clique, Twining Twins), Archive Dragon, Chancellor of Tales, Faerie Slumber Party, Gadwick's First Duel, Into the Fae Court, Storyteller Pixie ; jeton Faerie « ne peut bloquer que les créatures volantes » (local à `blue.ts`).
- **Restent :** Ice Out et Johann's Stopgap (réduction « si marchandé »), Asinine Antics (un Rôle par créature adverse), Ingenious Prodigy (furtivité), Elusive Otter (X marqueurs répartis), Extraordinary Journey (« lancée depuis l'exil »).
- **Tests :** 34 tests de règles (« lot A — bleu »).

## Sous-lot A3 : cartes noires ✅ (132 / 269)

- **Cartes :** 44 (sur 48), dont 8 Aventures, Rankle's Prank (« un ou plusieurs » par des modes à {0}), Lich-Knights' Conquest et Malevolent Witchkite (« sacrifiez un nombre quelconque »), Specter of Mortality (capacité réflexive), Beseech the Mirror (lancement gratuit pendant la résolution).
- **Restent :** Ashiok, Wicked Manipulator (payer des PV remplacé par un exil ; valeur de mana totale en exil), Lord Skitter's Blessing (créature enchantée), Tangled Colony (blessures subies, dernières informations), Twisted Sewer-Witch (un Rôle par Rat).
- **Tests :** 45 tests de règles (« lot A — noir »).

## Sous-lot A4 : cartes rouges ✅ (172 / 269)

- **Cartes :** 40 (sur 43), dont des Aventures, la Célébration (Goddric, Redcap Thief…), les Rôles, les Rats, Expensive Taste (cartes adverses exilées et jouables), Become Brutes.
- **Restent :** Imodane, the Pyrohammer (blessures d'un sort à cible unique sur sa cible), Skewer Slinger (l'attaquant bloqué comme objet de l'événement), Kellan, the Fae-Blooded (compter les Auras et Équipements attachés à la source).
- **Tests :** 41 tests de règles (« lot A — rouge »). En route, l'audit des cartes face cachée (`ai/test/hidden-info.test.ts`) comptait comme une fuite une main adverse regardée légitimement (Solve for Disappointment, tiré dans un deck aléatoire) : seul le permanent face cachée y est maintenant audité.
