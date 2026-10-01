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
