# Méta Standard (plan P4, phase 1)

Cartes des decks Standard les plus joués, toutes extensions confondues, avant la couverture complète extension par extension (`PLAN-P4.md`). Les decks relevés sont dans `docs/meta/2026-09-29/`. Chaque lot rend jouables quelques archétypes, deck principal **et** réserve (le BO3 en a besoin).

Vérification d'un lot : `npm run verify -- --set META`. Le fuzz ciblé joue alors les decks du méta déjà jouables les uns contre les autres (`npm run fuzz -- --pool meta`), et le test `cards/test/meta-decks.test.ts` vérifie que les decks des lots faits sont légaux et jouables.

Les scripts vont dans le dossier de leur extension (`packages/cards/src/<ext>/cards.ts`, un fichier par extension tant qu'elle est partielle). Ils seront répartis par couleur quand l'extension sera couverte en entier.

## Lot M1 — Izzet Spellementals et Mono-Green Landfall (28,9 % du méta)

22 cartes : 17 des decks principaux, 5 des réserves. Tests de règles dans `engine/test/meta.test.ts`.

### Moteur

- **Harmonie** (702.180, Tarkir: Dragonstorm) :
  - lue dans le texte (`scryfall.ts`) : le coût d'harmonie est rangé dans `CardDef.flashback`, avec `CardDef.harmonize`. La carte se lance donc depuis le cimetière comme un flashback, puis elle est exilée ;
  - on peut engager une créature dégagée qu'on contrôle pour réduire le générique de sa force : `CastChoices.tap` (au plus une créature), proposé par `additional.tap` de l'option de lancement (`harmonizeOptions`, `stack.ts`) ;
  - sans `tap` dans la décision (IA, automatisme), le choix par défaut s'applique : la plus petite force qui couvre tout le générique, sinon la plus grande ; `tap: []` n'engage rien ;
  - `legalActions` compte la réduction possible pour savoir si le sort est payable.
- **Marchandage** (702.166, Wilds of Eldraine) : lu dans les mots-clés Scryfall, c'est un kicker {0} « sacrifiez un artefact, un enchantement ou un jeton » (`kickerKind: "bargain"`, question « Marchander »).
- **Kicker sans mana choisi par le joueur** (Marchandage, et les kickers de Final Fantasy) : l'option de lancement donne les permanents possibles (`kickerPermanents`, le choix par défaut en premier), et la décision désigne le permanent par `sacrifice`. L'interface demande lequel s'il y a plus d'une possibilité ; sans choix, le moins cher (jeton d'abord).
- **Contempler** (701.63) : la condition `cond.behold(filtre)` remplace `beholdJace` (qui en devient un cas particulier) : un permanent correspondant que vous contrôlez, ou une carte correspondante de votre main.
- **Maîtrise de la terre** (Avatar) : `fx.earthbend(ref, n)`. Le terrain devient une créature 0/0 avec la célérité (toujours un terrain), reçoit N marqueurs +1/+1 et la capacité « quand il meurt ou est exilé, renvoyez-le sur le champ de bataille engagé ».
- **Effet de joueur jusqu'à la fin du tour :** `fx.thisTurn({ … })`, l'effet `playerEffect`. Par exemple `damageUnpreventable` : « les blessures ne peuvent pas être prévenues ce tour-ci ».
- **« Une ou deux cibles » :** `target.between(1, 2, spec)` (`TargetSpec.minCount`, `TargetOption.min`).
- **Déclencheur « devient la cible » étendu aux sorts :** `when.targetedByOpponent(filtre, true)` (« une créature ou un sort de créature que vous contrôlez », Surrak).
- **Filtre `adventure`** (cartes hors du champ de bataille) : « carte avec une Aventure » (Hearth Elemental).
- **Outils :**
  - `tools/meta-decks.ts` lit les decks du méta ;
  - `fuzz --pool meta` joue les decks du méta jouables ;
  - `verify --set META` fait la vérification d'un lot du méta ; `--ci` et `--full` ont chacun un fuzz du méta ;
  - le bac à sable de l'interface (mode dev) accepte des cartes au cimetière (`graveyard`).

### Cartes, par extension

- **Secrets of Strixhaven (SOS) :**
  - Great Hall of the Biblioplex : mana restreint aux éphémères et rituels ; devient une créature Sorcier 2/4 ;
  - Impractical Joke ;
  - Prismari Charm ;
  - Traumatic Critique.
- **Lorwyn Eclipsed (ECL) :**
  - Steam Vents (terrain choc, lu dans le texte) ;
  - Spell Snare ;
  - Sunderflock : coût réduit par la plus grande valeur de mana parmi vos Élémentaux ;
  - Sear ;
  - Sapling Nursery : affinité pour les Forêts, jeton Sylvin 3/4 avec la portée (`ecl/common.ts`).
- **Avatar: The Last Airbender (TLA) :**
  - Ba Sing Se ;
  - Earthbender Ascension.
- **Wilds of Eldraine (WOE) :**
  - Sleight of Hand ;
  - Hearth Elemental // Stoke Genius (aventure) ;
  - Torch the Tower (Marchandage).
- **Tarkir: Dragonstorm (TDM) :**
  - Winternight Stories (Harmonie) ;
  - Surrak, Elusive Hunter.
- **The Hobbit (HOB) :** Elven Passage (contempler un Elfe).
- **Teenage Mutant Ninja Turtles (TMT) :**
  - Escape Tunnel ;
  - Leatherhead, Swamp Stalker : marqueur de défense talismanique.
- **Murders at Karlov Manor (MKM) :** Thundering Falls, terrain à surveillance ; le modèle `surveilLand` sert aussi aux autres terrains de ce cycle.
- **Marvel's Spider-Man (SPM) :**
  - Hydro-Man, Fluid Felon : devient un terrain jusqu'à votre prochain tour ;
  - Sandman, Shifting Scoundrel : revient du cimetière avec une carte de terrain.

## Lot M2 — Dimir Midrange et Jund Sacrifice (cumul 43,7 % du méta)

23 cartes : 15 des decks principaux, 8 des réserves. Tests dans `engine/test/meta.test.ts` (« lot M2 »).

### Moteur

- **Flétrir en coût additionnel facultatif** (« you may blight N », Lorwyn Eclipsed) : lu dans le texte, c'est un kicker {0} qui met N marqueurs -1/-1 sur une créature que vous contrôlez (`kickerCost.blight`, `kickerKind: "blight"`). La créature se choisit comme le permanent du Marchandage (`CastChoices.sacrifice`, `kickerPermanents`). « Si le coût additionnel a été payé » : `cond.kicked`.
- **Travail d'équipe N** (Teamwork, Marvel Super Heroes) : lu dans le texte, c'est un kicker {0} « engagez des créatures de force totale N ou plus » (`kickerCost.tapPower`). L'option de lancement donne `kickerTap` (comme l'équipage), la décision désigne les créatures par `tap` ; sans `tap`, les plus faibles suffisantes.
- **Amasser** (701.47) : `fx.amass(joueur, sous-type, N)`, avec une Armée 0/0 noire créée au besoin, qui devient aussi du sous-type.
- **Déclencheurs :**
  - `when.search("opponent")` : « chaque fois qu'un adversaire cherche dans sa bibliothèque » (événement `search`, émis par l'effet de recherche) ;
  - `when.leaves(filtre)` : « chaque fois qu'une [créature que vous contrôlez avec un marqueur +1/+1] quitte le champ de bataille » ;
  - `when.sacrifice(filtre, false, true)` : sacrifié par un adversaire.
- **Statique `activatedReduction`** (`playerStatic`) : les capacités activées de vos permanents correspondant au filtre coûtent {N} de moins (Mutagen Man : jetons d'artefact).
- **Restriction `damageHealsFirst`** (Wolverine) : de nouvelles blessures guérissent d'abord les précédentes.
- **« VM X ou moins »** pour les effets de masse (`modifyAll`, `destroyAll`) : filtre `maxManaValueX`, avec le X du sort.
- **Jeton Mutagène** (`tmt/common.ts`).

### Cartes, par extension

- **Avatar: The Last Airbender (TLA) :** Callous Inspector, Deadly Precision, Obsessive Pursuit, Wan Shi Tong, Librarian ; en réserve, Day of Black Sun et Raven Eagle.
- **Marvel Super Heroes (MSH), nouvelle extension entamée :** Hidden Lair, The Wondrous Wasp, We Say Thee Nay!, Wolverine, Fierce Fighter.
- **Lorwyn Eclipsed (ECL) :** Blood Crypt et Overgrown Tomb (terrains choc), Requiting Hex (flétrir 1).
- **The Hobbit (HOB) :** Azog, Moria's Ruin (amasser des Gobelins) ; The Sackville-Bagginses.
- **Teenage Mutant Ninja Turtles (TMT) :** Dream Beavers, Mutagen Man, Living Ooze ; en réserve, The Ooze.
- **Secrets of Strixhaven (SOS), réserve :** Professor Dellian Fel, Witherbloom Charm.
- **Wilds of Eldraine (WOE), réserve :** Disdainful Stroke.
- **Tarkir: Dragonstorm (TDM), réserve :** Strategic Betrayal.
- **Murders at Karlov Manor (MKM), réserve :** Vengeful Tracker.
