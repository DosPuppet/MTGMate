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

## G4c — Special Guests de TDM, EOE et ECL ✅ (31 cartes ; SPG 98 / 132)

- **Cartes :** les cinq Ultimatums, les cinq terrains « fetch » (Arid Mesa, Marsh Flats, Misty Rainforest, Scalding Tarn,
  Verdant Catacombs), Warping Wail, Deafening Silence, Nexus of Fate, Paradox Haze, Darkness, Magus of the Moon,
  Burgeoning, Green Sun's Zenith, Sliver Overlord, Idyllic Tutor, Kinsbaile Cavalier, Bitterblossom, Faerie Macabre,
  Goblin Chieftain, Goblin Sharpshooter, Heat Shimmer, Devoted Druid, Leaf-Crowned Visionary, Regal Force, Manamorphose,
  Risen Reef.
- **Le moteur gagne :** `castLimit.spellTypes` (Deafening Silence) ; `playLand.whose` (Burgeoning).
- **Tests :** `spg.test.ts` (+13).
- **Approximations :** Eerie Ultimatum (les noms différents ne sont pas imposés) ; Green Sun's Zenith (mélangée dans la
  bibliothèque comme une carte qui ne peut aller au cimetière) ; Magus of the Moon (les terrains non-base perdent tous
  leurs sous-types).
- **Reportée :** Robe of Stars (phasing).

## G4d — Special Guests de SOS et FRA ✅ (16 cartes ; SPG 114 / 132)

- **Cartes :** Dolmen Gate, Door of Destinies, Archaeomancer, Archmage Emeritus, Murmuring Mystic, Dualcaster Mage, Magus
  of the Library, Library of Alexandria, Adrix and Nev, Eye of Ugin, Austere Command, Sublime Epiphany, Consider, Mind
  Twist, Splinter Twin, Root Maze. Aucune forme nouvelle : prévention par remplacement, doublement de jetons, modes
  combinés (« choisissez deux », escalade à {0}), déclencheur `copySpell` (magecraft).
- **Tests :** `spg.test.ts` (+9).
- **Sous-lot difficile (18 cartes SPG) :** Underworld Breach (évasion), Mirri (limites d'attaque et de blocage), Notion
  Thief (pioche détournée), Expropriate (vote), Maddening Hex (dé, hôte changeant), Noxious Revival (mana phyrexian),
  Sphinx's Tutelage (meule répétée), Phantasmal Image et Flesh Duplicate (copie à l'arrivée avec capacité ou disparition),
  Robe of Stars (phasing), Painter's Servant (couleur de toutes les cartes), Thousand-Year Elixir (capacités comme avec la
  célérité), Grim Haruspex (mue), Sylvan Library (cartes piochées ce tour-ci), Codie (exil jusqu'à un sort), Library of
  Leng (défausse remplacée), Consign to Memory (réplique), Necrodominance (pioche sautée, vie payée).

## G5 — Enchanting Tales ✅ (48 cartes ; WOT 49 / 55)

- **Cartes :** Dawn of Hope, Grasp of Fate, Greater Auramancy, Griffin Aerie, Intangible Virtue, Knightly Valor, Land
  Tax, Leyline of Sanctity, Smothering Tithe, Compulsion, Copy Enchantment, Curiosity, Forced Fruition, Fraying Sanity,
  Hatching Plans, Intruder Alarm, Kindred Discovery, Leyline of Anticipation, Rhystic Study, Spreading Seas, Dark
  Tutelage, Grave Pact, Oppression, Oversold Cemetery, Polluted Bonds, Sanguine Bond, Stab Wound, Waste Not, Aggravated
  Assault, Blood Moon, Dragon Mantle, Fiery Emancipation, Goblin Bombardment, Leyline of Lightning, Mana Flare, Raid
  Bombardment, Repercussion, Sneak Attack, Defense of the Heart, Hardened Scales, Leyline of Abundance, Nature's Will,
  Parallel Lives, Primal Vigor, Prismatic Omen, Season of Growth, Unnatural Growth, Utopia Sprawl. Aucune forme nouvelle.
- **Tests :** `wot.test.ts` (+21).
- **Audit :** Mana Flare, Leyline of Abundance, Utopia Sprawl : capacités de mana déclenchées modélisées par un
  remplacement de mana (écarts voulus).
- **Approximations :** Grasp of Fate (un seul permanent exilé, même avec plusieurs adversaires) ; Fraying Sanity (les
  cartes comptées sont celles des adversaires du contrôleur) ; Raid Bombardment (la blessure va au joueur défenseur, même
  si la créature attaque un planeswalker).
- **Sous-lot difficile :** Karmic Justice (destruction par un adversaire), Phyrexian Unlife (défaite et infection à 0 PV),
  As Foretold (coût alternatif selon les marqueurs, une fois par tour), Necropotence (pioche sautée, exil face cachée),
  Ground Seal (cartes des cimetières non ciblables), Shared Animosity (créatures qui partagent un type).

## G6 — Breaking News ✅ (47 cartes ; OTP 50 / 61)

- **Cartes :** Journey to Nowhere, Leyline Binding, Pariah, Path to Exile, Archive Trap, Archmage's Charm, Essence
  Capture, Mana Drain, Mindbreak Trap, Repulse, Heartless Pillage, Imp's Mischief, Overwhelming Forces, Reanimate,
  Thoughtseize, Crackle with Power, Electrodominance, Fling, Skullcrack, Clear Shot, Pest Infestation, Primal Command,
  Thornado, Abrupt Decay, Anguished Unmaking, Back for More, Bedevil, Crime // Punishment, Cruel Ultimatum, Decimate,
  Decisive Denial, Detention Sphere, Endless Detour, Hindering Light, Humiliate, Hypothesizzle, Ionize, Oko, Thief of
  Crowns, Savage Smash, Siphon Insight, Tyrant's Scorn, Vanishing Verse, Villainous Wealth, Void Rend, Voidslime,
  Contagion Engine, Mindslaver.
- **Le moteur gagne :** la recherche dans sa bibliothèque au journal du tour (`turnEvents` `search`, Archive Trap).
- **Tests :** `otp.test.ts` (+20).
- **Audit :** Journey to Nowhere et Detention Sphere (exil jusqu'au départ en une seule capacité), Crackle with Power
  (« up to X targets ») : écarts voulus.
- **Approximations :** Hindering Light (un sort qui ne cible que vous n'est pas reconnu) ; Mindbreak Trap (le sort lancé
  par un adversaire est compté par joueur).
- **Sous-lot difficile :** Fell the Mighty (force comparée à une cible), Commandeer (contrôle d'un sort), Surgical
  Extraction (mana phyrexian), Indomitable Creativity (révéler pour chaque permanent détruit), Force of Vigor (coût
  alternatif en exilant une carte de la main), Terminal Agony (folie), Grindstone (meule répétée), Outlaws' Merriment
  (mode au hasard), Fractured Identity (copies pour les autres joueurs), Unlicensed Hearse (F/E égales aux cartes liées),
  Ride Down (créatures bloquées par une créature).

## G7 — Through the Ages ✅ (36 cartes ; FCA 39 / 50)

- **Cartes :** Adeline, Ranger-Captain of Eos, Sram, Counterspell, Urza, Lord High Artificer, Venser, Dark Ritual, Fatal
  Push, Syr Konrad, Yawgmoth, Godo, Purphoros, Azusa, Traxos, Danitha Capashen, Kenrith, Loran of the Third Path,
  Mangara, Wall of Omens, Brainstorm, Cryptic Command, Deadly Dispute, Diabolic Intent, Varragoth, Captain Lannery Storm,
  Lightning Bolt, Najeela, Farseek, Nature's Claim, Primeval Titan, Dovin's Veto, Isshin, Kinnan, Chromatic Lantern,
  Smuggler's Copter, Strixhaven Stadium.
- **Le moteur gagne :** `tapAnother: "artifact"` (Urza : « engagez un artefact dégagé : {U} »).
- **Tests :** `fca.test.ts` (+17).
- **Approximations :** Adeline (les Humains attaquent le premier adversaire) ; Mangara (les attaques contre vous sont
  comptées sur le tour) ; Purphoros (sans dévotion suffisante, c'est un enchantement sans autre type de carte).
- **Sous-lot difficile :** Bolas's Citadel, Jodah, Winota, Nyxbloom Ancient, Laboratory Maniac, Teferi, Mage of Zhalfir,
  Gix, K'rrik (mana phyrexian), Atraxa, Carpet of Flowers, Ancient Copper Dragon (d20).

## G8 — Mystical Archive ✅ (25 cartes ; SOA 30 / 37)

- **Cartes :** Armageddon, Prismatic Ending, Reprieve, Return to the Ranks, Pongify, Preordain, Culling the Weak, Living
  End, Sheoldred's Edict, Smallpox, Vampiric Tutor, Big Score, Brotherhood's End, Pyretic Ritual, Subterranean Tremors,
  Awaken the Woods, Berserk, Crop Rotation, Glimpse of Nature (emblème du tour), Shamanic Revelation, Triumph of the
  Hordes, Bring to Light, Culling Ritual, Expressive Iteration, Fracture. Aucune forme nouvelle.
- **Tests :** `soa.test.ts` (+11).
- **Approximations :** Expressive Iteration (la carte gardée en main est choisie d'abord, parmi les trois ; puis l'exilée
  parmi les deux restantes) ; Prismatic Ending (la valeur de mana est comparée à la résolution, pas au ciblage).
- **Sous-lot difficile :** Angel's Grace (ne pas perdre, PV au moins 1), Daze et Force of Will (coûts alternatifs
  particuliers), Dismember (mana phyrexian), Ad Nauseam (répétition au choix), Veil of Summer (incontrecarrable,
  défense talismanique contre des couleurs), Deflecting Palm (bouclier qui renvoie les blessures).

## G9 — Source Material et Jurassic World Collection ✅ (18 cartes ; PZA 12 / 15, REX 8 / 20)

- **Source Material :** Teleportation Circle, Ashcoat of the Shadow Swarm, Silverclad Ferocidons, Rhythm of the Wild,
  Conqueror's Flail, Metallic Mimic, Shadowspear, Sword of Sinew and Steel, Umezawa's Jitte (les trois modes en trois
  capacités au même coût), All Will Be One.
- **Jurassic World Collection :** Don't Move (emblème jusqu'à votre prochain tour), Spitting Dilophosaurus, Life Finds a
  Way (peuplement), Savage Order, Compy Swarm, Ellie and Alan, Permission Denied, Ravenous Tyrannosaurus (dévorer 3).
- **Tests :** `pza.test.ts` (+6), `rex.test.ts` (7) ; fumée REX.
- **Approximation :** All Will Be One (les marqueurs mis sur un joueur ne comptent pas).
- **Sous-lot difficile :** Trouble in Pairs, Plague of Vermin, Waves of Aggression (retour) ; Cresting Mosasaurus
  (émergence), Hunting Velociraptor (rôder), Welcome to . . . // Jurassic Park, Blue, Loyal Raptor et Owen Grady
  (partenaire avec, marqueurs de mots-clés), Grim Giganotosaurus (monstruosité), Henry Wu (exploitation), Ian Malcolm,
  Indominus Rex, Indoraptor (soif de sang, adversaire au hasard), Swooping Pteranodon, Dino DNA.

## G4e — sous-lot difficile

- **Mana phyrexian ✅ :** `ManaCost.phyrexian`, payé avec le mana disponible d'abord, sinon 2 PV par symbole ; symbole
  Φ dans l'interface. Cartes : Noxious Revival (SPG), Dismember (SOA), K'rrik, Son of Yawgmoth (FCA, statique
  `phyrexianMana`). Tests : `phyrexian.test.ts` (5). Approximation : le joueur ne peut pas choisir de payer des PV quand
  le mana suffit. Surgical Extraction reste à faire (homonymes dans la main et la bibliothèque d'un joueur).
- **Coûts alternatifs à payer autrement ✅ :** `altCost.pay` (PV, cartes de la main exilées, permanent renvoyé, choisis
  automatiquement : les cartes les moins chères, un permanent engagé d'abord). Cartes : Force of Will, Daze (SOA), Force
  of Vigor (OTP). Tests : `altcosts.test.ts` (4).
- **Mots-clés d'une carte ✅ :** Grim Giganotosaurus (monstruosité notée par un marqueur « monstrous », déclencheur
  `countersPut`), Indoraptor (soif de sang : `entersWith` des blessures infligées aux adversaires ce tour-ci ; l'adversaire
  « au hasard » est le premier), Henry Wu (exploitation donnée aux Humains, la pioche et le Trésor dans la même capacité).
  Tests : `rex.test.ts` (+3).
