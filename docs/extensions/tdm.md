# Tarkir: Dragonstorm (TDM, « Tarkir : Tempête draconique », 259 cartes)

Mécaniques et détail des lots.

Phase 2 du plan P4 (`docs/plans/PLAN-P4.md`), demandée par l'utilisateur le 01/10/2026. 25 cartes étaient déjà gérées depuis la phase méta (lots M1 à M6, `docs/extensions/meta.md`) : contempler, mobilisation, harmonie, présage et renouveau y sont nés. L'extension suit les règles d'intégration de PLAN-R (R1 et R7, fin de CLAUDE.md).

| Mécanique | Lot |
|---|---|
| Cartes faisables avec le moteur : Devotees, Dragonstorms, Monuments, terrains, contempler (« Exhale »), mobilisation, harmonie, Sagas | A |
| Endurance (701.64), rafale (Flurry), renouveau, dragons à présage (Omen), Sièges | B |
| Légendaires et cartes uniques | C |
| New Way Forward : boucliers « la prochaine fois que » (615.7), sur le cadre générique des remplacements (R1) | D |

Les scripts sont dans `packages/cards/src/tdm/` : `cards` (cartes du méta, phase 1), `white`, `blue`, `black`, `red`, `green`, `multi` et `artifacts` (artefacts incolores et terrains). Les aides sont dans `tdm/common.ts` :

- jetons : Moine, Guerrier, Esprit blanc 1/1 (X/X avec `createXXToken`), Soldat 2/2, Zombie Druide, Oiseau, Éléphant 5/5, Reliquary Dragon ;
- filtres : `DRAGON_CARD`, `DRAGON_YOU`, `CREATURE_WITH_COUNTER` (« une créature que vous contrôlez avec un marqueur ») ;
- cycles : `devotee(couleurs)`, `dragonstorm()`, `monumentSearch(terrains)`, `entersTappedUnless(terrains)`, `triLand(couleurs)`.

## Lot A ✅ (187 / 259)

- **Cartes :** 162 nouvelles, dont les cycles des Devotees, des Dragonstorms, des Monuments, les terrains tricolores et les terrains « engagé sauf si », les sorts « Exhale » (contempler un Dragon), les Sagas, Stormscale Scion (déluge : `castSelf` et `copySpell`), Dragonstorm Globe, Breaching Dragonstorm (`castNow` sur la carte exilée).
- **Le moteur gagne :**
  - `fx.addManaChoice(n, couleurs)` : un mana parmi certaines couleurs seulement (Devotees : « {1} : ajoutez {R}, {W} ou {B} ; une fois par tour ») ;
  - `fx.lookAtTop(…, { exact: true })` : prendre exactement N cartes, et non « jusqu'à N » (Sibsig Appraiser, Rakshasa's Bargain, Rediscover the Way) ;
  - `cond.sourceDealtDamage` et `GameObject.dealtDamage` : « tant qu'il n'a pas encore infligé de blessures », de combat ou non (Karakyk Guardian) ;
  - la recherche lit `maxManaValueX` avec le X du sort qui se résout (Nature's Rhythm).
- **Coûts :** les augmentations de coût passent par `costReduction` négatif (Caustic Exhale : {1} de plus sans Dragon à contempler ; Dragon's Prey : {2} de plus s'il cible un Dragon) ; l'affinité pour les créatures et « {1} de moins pour chaque créature attaquante » par un montant.
- **Correctif [règles] :** un « si » intermédiaire sur l'objet de l'événement (`cond.eventObjectMatches` en condition de capacité déclenchée) n'était jamais vrai au déclenchement : Aclazotz, Deepest Betrayal (LCI) ne créait jamais de Chauve-souris quand un adversaire défaussait un terrain. `checkCondition` reçoit l'objet de l'événement, au déclenchement et à la résolution (603.4). `RULES_VERSION` = 20, parties dorées régénérées.
- **Dette :** `damageDivided` sert maintenant à deux cartes (Twin Bolt) : son entrée quitte `debt-baseline.json`.
- **Tests :** `engine/test/tdm.test.ts` (24 tests de règles en plus : Devotees, Dragonstorms, coûts variables, Sunpearl Kirin, Furious Forebear, Karakyk Guardian, déluge, Host of the Hereafter, Monuments, Embermouth Sentinel, Nature's Rhythm, Severance Priest, Flamehold Grappler…), le correctif d'Aclazotz dans `engine/test/lci.test.ts`, le test de fumée `ai/test/smoke/tdm.test.ts` ; un motif de plus dans les attentes de l'Oracle (« Return target card from your graveyard to your hand. »).

## Lot B ✅ (232 / 259)

- **Cartes :** 45 nouvelles : l'endurance (Anafenza, Fortress Kin-Guard, Warden of the Grove…), la rafale (Poised Practitioner, Wingblade Disciple, Cori-Steel Cutter, Devoted Duelist…), le renouveau (Agent of Kotis, Sage of the Fang, Naga Fleshcrafter, Kheru Goldkeeper…), les dragons à présage (Riling Dawnbreaker, Marang River Regent, Scavenger Regent, Bloomvine Regent…) et les cinq Sièges.
- **Le moteur gagne :**
  - l'endurance (701.64) : effet `endure` (`fx.endure(ref, n)`, `ops/counters.ts`). Le contrôleur choisit N marqueurs +1/+1 ou un jeton Esprit blanc N/N ; si le permanent n'est plus sur le champ de bataille, le jeton est créé ; endurer 0 ne fait rien ;
  - le choix d'un mode en arrivant (Sièges, 614.12) : `chooseOnEnter: "mode"` et `enterModes` (script), le mode retenu dans `chosen.mode` (badge sur la carte), lu par `cond.chosenMode("Abzan")` ;
  - `triggerMod.onAttack` (famille G) : « si une créature qui attaque fait se déclencher une capacité d'un permanent que vous contrôlez, elle se déclenche une fois de plus » (Windcrag Siege, mode Mardu : mobilisation comprise) ;
  - le mot-clé décomposition (`decayed`, 702.147 : ne peut pas bloquer ; sacrifiée à la fin du combat après avoir attaqué), et le marqueur du même nom ;
  - `amount.countersOn(ref, "any")` : tous les marqueurs de l'objet (Warden of the Grove).
- **Aides :** `flurry(effets, libellé, cibles)` (rafale : `when.castNthSpell(2)`) et `renew(mana, cibles, effets, libellé)` dans `tdm/common.ts`.
- **Comportement inchangé** pour les cartes déjà gérées (parties dorées identiques) : pas de nouvelle version des règles.
- **Tests :** 13 tests de règles en plus dans `engine/test/tdm.test.ts` (endurance au choix, jeton quand le permanent est parti, Warden of the Grove, rafale au deuxième sort seulement, renouveau de Sage of the Fang, Exude Toxin, Bloomvine Regent, Sièges Barrensteppe, Glacierwood et Windcrag, flash de Whirlwing Stormbrood). Vérifié dans le navigateur par un script Playwright ponctuel (captures dans `test-results/tdm/`) : choix du mode d'un Siège, badge du mode, choix de l'endurance.
- **En route :** `tutorial-smoke` échouait déjà avant ce lot (« action hors guide refusée ») : il cliquait 300 ms après le début de la leçon 2, avant que la partie soit prête. Il attend désormais la priorité du joueur.

## Lot C ✅ (257 / 259)

- **Cartes :** 25 légendaires et cartes uniques, dans `tdm/legends.ts` : Ugin, Eye of the Storms, Elspeth, Storm Slayer, Taigam, Teval, Kotis, Shiko, Ureni, Betor, Narset, Eshki, Felothar, Zurgo, Sidisi, The Sibsig Ceremony, Call the Spirit Dragons, All-Out Assault, Mardu Siegebreaker, Roar of Endless Song, Songcrafter Mage, Stalwart Successor, Hundred-Battle Veteran, Krumar Initiate, Rot-Curse Rakshasa, Dracogenesis, Formation Breaker.
- **Le moteur gagne :**
  - la suspension (702.62) : effet `suspend` (`fx.suspend(ref, n)`) ; le sort quitte la pile sans être contrecarré (ou la carte quitte la main) et va en exil avec N marqueurs de temps. À chaque entretien de son propriétaire, une capacité retire un marqueur (`suspendUpkeep`, `turn.ts`) ; au dernier, il peut lancer la carte sans payer (célérité pour une créature) (Taigam) ;
  - la cave (702.66) accordée aux sorts : `playerStatic({ delveSpells: true })` ; le solveur de mana s'en sert en dernier recours, chaque carte du cimetière exilée payant {1} (Teval) ;
  - un combat supplémentaire après la phase principale, suivi d'une phase principale (`fx.extraCombatAfterMain`, All-Out Assault) ;
  - « ne peut pas être sacrifié » (`cantBeSacrificed`, restriction lue par le sacrifice, ses coûts et ses choix : Zurgo) ;
  - le déclencheur `countersPut(…, firstThisTurn)` (« la première fois ce tour-ci que des marqueurs sont mis sur elle » : Stalwart Successor) ;
  - `fx.doublePT(ref)` : doubler la force et l'endurance de chaque créature désignée (Roar of Endless Song, Dragonclaw Strike) ;
  - l'harmonie accordée (`fx.grantHarmonize`, Songcrafter Mage) ;
  - les montants `counterKindsAmong` (Hundred-Battle Veteran) et `totalToughness` (Betor), la référence `ref.union` (Call the Spirit Dragons), les filtres `cast` (« si vous l'avez lancée » : The Sibsig Ceremony) et `powerBelowSource` (Formation Breaker), `castNow` avec `maxManaValue` (Kotis), `castFromGraveyard.finality` (Hundred-Battle Veteran), `freeFilter` d'une permission de lancer (Dracogenesis), le coût `payLifeX` (Krumar Initiate) et les cibles `countX` (« X créatures ciblées » : Rot-Curse Rakshasa).
- **Correctifs en route :**
  - la décomposition accordée par un marqueur n'avait pas sa capacité déclenchée : le filtre rapide des sources de déclenchement ne connaissait que la prouesse ;
  - le garde-fou de la dette lisait l'union `Keyword` jusqu'au premier « ; », y compris dans un commentaire : il retire désormais les commentaires.
- **Dette :** trois entrées justifiées (`delveSpells`, `cantBeSacrificed`, `suspend`, une carte chacune), deux retirées (`chooseAmong` et `untapAll` servent désormais à plusieurs cartes).
- **Comportement inchangé** pour les cartes déjà gérées (parties dorées identiques).
- **Tests :** 23 tests de règles en plus dans `engine/test/tdm.test.ts`, un par carte au moins (suspension sur quatre tours, cave, combat supplémentaire, victoire de Call the Spirit Dragons…).

## Lot D ✅ (**259 / 259**) — remplacements de blessures (R1)

New Way Forward apporte le premier bouclier « la prochaine fois que » (615.7) et Neriv un nouveau remplacement de blessures (famille E) : comme le demande la règle R1 (fin de CLAUDE.md), le cadre générique est écrit et les drapeaux de la même famille y sont convertis.

- **Le moteur gagne :**
  - `EventReplacement` (`model/cards.ts`) : événement (`damage` ou `lifeLoss`), source (filtre vu du contrôleur), destinataire (`you`, `yourSide`, `opponent`, `opponentSide`, `toFilter`), combat ou non, `modify : { add, times, atLeastSourcePower, prevent }`, `onPrevent` (meule des adversaires, capacité réflexive « quand des blessures sont prévenues ainsi »). Capacité imprimée `eventReplacement(…)` (`EventReplacementAbilityDef`) ; effet de joueur `fx.thisTurn({ replacement })` ;
  - le collecteur `eventReplacements` (`statics.ts`) et l'application dans `dealDamage` et `loseLife` : modifications ordonnées par `chooseReplacementOrder` (616.1) ; une prévention contrôlée par un autre joueur que le blessé passe avant les modifications (The Mindskinner fait meuler le moins), celle du blessé après (New Way Forward renvoie le plus) ;
  - les boucliers (615.7) : `fx.shield(remplacement, choixDeLaSource)`, un effet de joueur à usage unique jusqu'à la fin du tour, retiré quand il s'applique (`consumeReplacement`) ;
  - des blessures prévenues ne comptent plus comme infligées (Ruric Thar, Karakyk Guardian).
- **Conversions :** dix drapeaux de `PlayerStaticAbilityDef` disparaissent (`noncombatDamageBonusAll`, `noncombatDamageBonus`, `noncombatDamageBonusAmount`, `noncombatDamageAtLeastPower`, `damagePlusOneFrom`, `damagePlusOneToOpponents`, `damageTakenDoubled`, `damageToOpponentsMills`, `creaturesDamageImmune`, `doubleOpponentLifeLossYourTurn`), ainsi que les doubleurs de blessures (`damageToOpponents`, `creatureDamage`, `damageFilter`, `noncombatDamage`) et les opérations `doubleDamageTo` et `preventDamageToYourCreatures`. Cartes converties : Tomik, Izzet Sparkmage, Bloodletter of Aclazotz, Ojer Axonil, Artist's Talent, Valley Flamecaller, Far Fortune, The Mindskinner, The Rollercrusher Ride, Twinflame Tyrant, Gratuitous Violence, Trance Kuja, la carte de Marvel Super Heroes qui double les blessures de la créature équipée, Lightning, Army of One, Summon: Alexander et Taii Wakeen.
- **Dette :** un champ générique (`replacement`) et une opération (`shield`, une carte) entrent ; dix drapeaux et deux opérations sortent.
- **[règles] :** `RULES_VERSION` = 21, parties dorées régénérées (elles se rejouaient déjà à l'identique).
- **Tests :** Neriv et New Way Forward dans `engine/test/tdm.test.ts` (3 tests : double blessures, bouclier à usage unique, autre source et fin du tour) ; deux décisions de 616.1 dans `engine/test/rulings.test.ts` (bouclier du blessé après le doubleur adverse, prévention adverse avant) ; les tests existants des cartes converties (`audit`, `rulings`, `player-effects`) passent sans changement de résultat.

## Bilan de l'extension

- 234 cartes ajoutées en quatre lots (25 étaient déjà gérées par la phase méta), 0 écart à l'audit Oracle ↔ script.
- 63 tests de règles dans `engine/test/tdm.test.ts` (en plus des 24 de la phase méta), 2 dans `rulings.test.ts`, 1 dans `lci.test.ts`.
- Écarts trouvés en route et corrigés : condition intercalée sur l'objet de l'événement (Aclazotz), décomposition accordée par un marqueur, angle mort du garde-fou de la dette, délai de `tutorial-smoke`.
