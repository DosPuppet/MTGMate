# Marvel Super Heroes (MSH, 271 cartes)

Mécaniques et détail des lots.

Extension demandée par l'utilisateur le 02/10/2026, après Avatar: The Last Airbender. 20 cartes étaient déjà gérées depuis la phase méta (lots M1 à M6, `docs/extensions/meta.md`) : montée en puissance (`activated({ powerUp: true })`), travail d'équipe (lu dans le texte, un kicker « engagez des créatures de force totale N »), exploiter (`fx.harness`, `cond.harnessed`), équiper digne, Doombot… L'extension suit les règles d'intégration de CLAUDE.md (dette, R1, R7). Découpage : un sous-lot et un commit par couleur pour le lot A, par mécanique pour le lot B, par famille de cartes uniques ensuite.

| Mécanique | Lot |
|---|---|
| Socle : jetons | 0 |
| Cartes faisables avec le moteur, par couleur | A1 à A6 |
| Mécaniques phares restantes | B |
| Légendaires et cartes uniques | C et suivants |

Les scripts sont dans `packages/cards/src/msh/` : `cards` (cartes du méta), `white`, `blue`, `black`, `red`, `green`, `multi`, `artifacts` (incolores et terrains) et `legends`. Les aides sont dans `msh/common.ts`.

## Sous-lot 0 : socle ✅ (20 / 271)

- **Jetons :** Méchant 2/1 noir avec la menace, Héros 3/2 blanc avec la vigilance, Robot Méchant 2/2 incolore (artefact), Mur 0/4 incolore avec le défenseur, Insecte 1/1 vert, Ondin 1/1 bleu ; Doombot existait ; Soldat, Indice, Trésor et Nourriture viennent des communs.
- **Moteur :** rien de nouveau.
- **Tests :** test de fumée `ai/test/smoke/msh.test.ts`.

## Sous-lot A1 : cartes blanches ✅ (52 / 271)

- **Cartes (32) :** Agent 13, Sharon Carter, Agent Phil Coulson, Agents of S.H.I.E.L.D., Avengers Assemble!, Borough Backup, Brave Brawler, Captain America, Wings of Freedom, Captain Mar-Vell, Space-Born, Colleen Wing, Street Samurai, Crowd of True Believers, Helicarrier Strike, Hero in Training, Invisible Woman, Sue Storm, Luke Cage, Power Man, Mockingbird, Ace Agent, Monica Rambeau // Photon, Living Light, Murdock's Crusade, Nick Fury, Agent of S.H.I.E.L.D., Night Nurse, Healer of Heroes, Okoye, Dora Milaje Leader, Origin of the Avengers, Panther Pounce, Patriot, Shield Wielder, Quake, Agent of S.H.I.E.L.D., Raft Security Officer, Red Guardian, Super-Soldier, The Sentry, Golden Guardian (jeton The Void), S.H.I.E.L.D. Spy Kit, Super Villain Lockup, Super-Soldier Serum, Wakandan Drone Flock, White Widow, Free Agent.
- **Moteur :** rien de nouveau (« les deux si le travail d'équipe a été payé » : un mode sous `cond.kicked` ; flash sous condition par `playerStatic({ flashFor })`).
- **Reste pour plus tard :** Agent Maria Hill (engagée pour payer un travail d'équipe), Captain America, Super-Soldier (marqueur de bouclier).
- **Tests :** 35 tests de règles (« lot A, blanc »).
