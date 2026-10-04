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

## G2b — mots-clés de permanent ✅

| Mécanique | Forme | Cartes |
|---|---|---|
| Exaltation (702.83) | lue dans le texte : `attacksAlone`, +1/+1 | Cathedral of War (EOS) |
| Affinité pour les artefacts (702.41) | lue dans le texte : `costReduction` | Frogmite, Thoughtcast (SPG) |
| Métallurgie | script : deux `fx.when` à la résolution | Galvanic Blast (SPG) |
| Modulaire (702.43) | lu dans le texte : `entersWith` et marqueurs (dernières informations connues) sur une créature-artefact ciblée | Arcbound Ravager (PZA), Power Depot (EOS) |
| Greffe (702.58) | lue dans le texte : `entersWith`, déplacement facultatif d'un marqueur | Cytoplast Manipulator (PZA) |
| Empreinte | `exileFromHandLinked` et mana des couleurs liées | Chrome Mox (SPG) |
| Extorsion (702.101) | lue dans le texte : `castSpell` et `mayPay("{W/B}")` | Blind Obedience (WOT) ; The Kingpin of Crime (MSH) n'écrit plus la sienne |
| Défense totale (702.18) | mot-clé `shroud` | Helix Pinnacle (SPG) |
| Champion (702.72) | aide `champion` (`spg/cards.ts`) : `chooseAmong`, `exileUntilLeaves`, sacrifice sinon | Mistbind Clique, Wanderwine Prophets (SPG) |

- **Tests :** `spg.test.ts` (8), `eos.test.ts` (3), `pza.test.ts` (3), `wot.test.ts` (2) ; fumée EOS, PZA, WOT.
- **Audit :** Mistbind Clique, « quand une Fée est championnée » lu comme une statique (écart voulu, `audit-baseline.json`).
- **Reportés à leur lot (une carte chacun) :** monstruosité et soif de sang (REX), régénération (Swarmyard, G3), vantardise
  (Varragoth, FCA), peuplement (Life Finds a Way, REX), dilemme du conseil (Expropriate, SPG), Dino DNA (REX).

## G2c — déluge ✅

- **Déluge (702.40)** lu dans le texte : `castSelf` puis `copySpell(self, amount.eventAmount)`. Le nombre de sorts lancés
  avant lui ce tour-ci, par tous les joueurs, est figé au lancement (`RulesEvent` `cast.spellsBefore`). Stormscale
  Scion (TDM) n'écrit plus le sien, qui comptait à la résolution et seulement vos sorts.
- **Cartes :** Brain Freeze, Empty the Warrens, Flusterstorm (SOA). Tests : `soa.test.ts` (+2).

## G3a — Stellar Sights, terrains faisables ✅ (35 / 43)

- **Cartes (33) :** Ancient Tomb, Blinkmoth Nexus, Bonders' Enclave, Cascading Cataracts, Celestial Colonnade, Contested
  War Zone, Creeping Tar Pit, Crystal Quarry, Deserted Temple, Dust Bowl, Eldrazi Temple, Endless Sands, Grove of the
  Burnwillows, High Market, Hissing Quagmire, Inventors' Fair, Lavaclaw Reaches, Lotus Field, Lumbering Falls, Mana
  Confluence, Mirrorpool, Mutavault, Mystifying Maze, Needle Spires, Petrified Field, Raging Ravine, Scavenger Grounds,
  Shambling Vent, Stirring Wildwood, Strip Mine, Terrain Generator, Thespian's Stage, Wandering Fumarole.
- **Formes :** aide `manland` (terrains-créatures Élémentaux de Worldwake et d'Oath of the Gatewatch) ; contrepartie
  d'une capacité de mana (`drawback`, nouveau) ; Thespian's Stage garde sa capacité (`becomeCopy`, `keepAbilities`) ;
  Wandering Fumarole est la première carte à échanger F/E (`switchPT`, 613.4d).
- **Tests :** `eos.test.ts` (+12).
- **Approximation :** Eldrazi Temple, le mana restreint vaut pour tout sort ou capacité d'Eldrazi (incolore ou non).

## G3b — Stellar Sights, terrains qui demandaient du moteur ✅ (43 / 43)

| Carte | Forme nouvelle |
|---|---|
| Inkmoth Nexus | mot-clé infection (702.90) |
| Swarmyard | régénération (701.19) : `fx.regenerate`, bouclier consommé par `destroy`, retiré au nettoyage |
| Meteor Crater, Plaza of Heroes | mana des couleurs de vos permanents (`colorsOf`) |
| Reflecting Pool | mana des types que vos autres terrains pourraient produire (`likeLands`) |
| Blast Zone | filtre `manaValueSourceCounters` (valeur de mana égale aux marqueurs de la source, dernière information après le sacrifice) |
| Nesting Grounds | effet `moveCounter` (sorte au choix) |
| Gemstone Caverns | `leyline` conditionnelle : si vous ne commencez pas, avec un marqueur de chance, une carte de la main exilée |

- **Tests :** `eos.test.ts` (+8).
- **Approximations :** Gemstone Caverns exile automatiquement la carte non-terrain de plus petite valeur de mana ;
  Reflecting Pool ne voit pas ce que produiraient d'autres Reflecting Pools.

## G4a — Special Guests de LCI, MKM et OTJ ✅ (31 cartes ; SPG 38 / 132)

- **Cartes :** Lord of Atlantis, Bridge from Below, Mephidross Vampire, Pitiless Plunderer, Rampaging Ferocidon, Carnage
  Tyrant, Polyraptor, Kalamax, the Stormsire, Lord Windgrace, Mana Crypt, Star Compass, Ghostly Prison, Fabricate, Show
  and Tell, Tragic Slip, Victimize, Gamble, Crashing Footfalls, Tireless Tracker, Drown in the Loch, Field of the Dead,
  Stoneforge Mystic, Brazen Borrower // Petty Theft, Desertion, Morbid Opportunist, Port Razer, Scapeshift, Mystic
  Snake, Desert, Prismatic Vista.
- **Le moteur gagne :** traversée de terrain (`BlockRule.unblockableIfDefenderControls`, `block.landwalk`) ;
  `block.notSameDefenderTwice` (Port Razer, sans quoi ses combats supplémentaires ne finiraient pas) ; statiques de
  joueur `affects` ; déclencheur `copySpell` ; suspension lue dans le texte (action spéciale) ; `counter` mémorise la
  carte contrecarrée où qu'elle aille (Desertion) ; `likeLands` prend un filtre (Star Compass : terrains de base).
- **Tests :** `spg.test.ts` (+19).
- **Approximations :** Drown in the Loch (la condition est vérifiée à la résolution, non au ciblage) ; Mephidross Vampire
  (« blesse une créature » : toute blessure qui n'est pas infligée à un joueur) ; Bridge from Below (le cimetière est lu
  comme celui du dernier contrôleur de la créature).
- **Reportées (sous-lot difficile) :** Underworld Breach (évasion), Mirri, Weatherlight Duelist (limites d'attaquants et
  de bloqueurs), Notion Thief (pioche détournée).

## G4b — Special Guests de BLB, DSK, FDN et DFT ✅ (29 cartes ; SPG 67 / 132)

- **Cartes :** Swords to Plowshares, Ledger Shredder, Rat Colony, Relentless Rats, Kindred Charge, Sylvan Tutor, Toski,
  Bearer of Secrets, Sword of Fire and Ice, Hallowed Haunting, Soul Warden, Damnation, Sacrifice, Unholy Heat, Collected
  Company, Condemn, Grim Tutor, Embercleave, Goblin Bushwhacker, Paradise Druid, Akroma's Memorial, Temporal
  Manipulation, Fiend Artisan, Cavalier of Dawn, Whir of Invention, Bone Miser, Lord of the Undead, Chandra's Ignition,
  Pathbreaker Ibex, Skysovereign, Consul Flagship.
- **Le moteur gagne :** `destroy` sans régénération (`noRegenerate`).
- **Tests :** `spg.test.ts` (+17).
- **Reportées (sous-lot difficile) :** Expropriate (dilemme du conseil), Maddening Hex (dé, Aura de joueur qui change
  d'hôte), Noxious Revival (mana phyrexian), Sphinx's Tutelage (meule répétée), Phantasmal Image (copie à l'arrivée avec
  une capacité ajoutée).
