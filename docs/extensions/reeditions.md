# Rééditions jouables en « Sans limite » (PLAN-G)

Huit ensembles de rééditions sortis avec les extensions du Standard : Special Guests (SPG), Stellar Sights (EOS),
Enchanting Tales (WOT), Breaking News (OTP), Through the Ages (FCA), Mystical Archive (SOA), Source Material (PZA) et
Jurassic World Collection (REX). Hors Standard, ils servent au format « Sans limite ». Plan : `docs/plans/PLAN-G.md`.

Les scripts sont dans `packages/cards/src/<code>/cards.ts` (aides : `tdm/common.ts`) ; les tests de règles dans
`packages/engine/test/<code>.test.ts` ; la fumée dans `packages/ai/test/smoke/<code>.test.ts`.

## G1 — impressions ✅

Une carte déjà présente dans l'appli et réimprimée par un de ces ensembles reçoit une impression (`CardDef.printings`) :
le deck peut choisir son illustration (51 cartes). Détail dans le suivi du plan.

## G2a — coûts alternatifs et modes ✅

| Mécanique | Forme | Cartes |
|---|---|---|
| Surcharge (702.96) | `altCostMode("Surcharge", coût, normal, surchargé)` : `ModeDef.cost` | Cyclonic Rift, Winds of Abandon (SOA), Mizzix's Mastery (FCA) |
| Fendre (702.148) | `altCostMode("Fendre", …)` | Fierce Retribution (OTP) |
| Escalade (702.120) | `escalate(coût, …modes)` | Collective Defiance (OTP) |
| Ruée (702.109) | déduite du texte : `altCost.via = "dash"`, célérité et retour en main | Ragavan, Nimble Pilferer (FCA) |
| Spectacle (702.137) | déduit du texte : `altCost` si un adversaire a perdu des PV ce tour-ci | Light Up the Stage (FCA), Skewer the Critics (OTP) |

- **Le moteur gagne :** `ModeDef.cost` (un mode lancé pour son propre coût, proposé seulement s'il est payable, jamais
  gratuit ni avec un autre coût alternatif) ; `altCost.via` ; la recherche faite par d'autres joueurs lit son nombre du
  point de vue de chacun (Winds of Abandon surchargé : autant de terrains que de ses créatures exilées).
- **Tests :** `soa.test.ts` (5), `fca.test.ts` (5), `otp.test.ts` (6). Approximations : Ragavan (permission de jouer),
  Winds of Abandon (le propriétaire cherche).
- **Reportés à leur lot :** émergence (Cresting Mosasaurus, REX), folie (Terminal Agony, OTP), réplique (Consign to
  Memory, SPG), retour (Waves of Aggression, PZA) : une seule carte chacune.
