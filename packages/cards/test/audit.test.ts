/** Audit Oracle ↔ script (`src/audit.ts`) : pas de nouvel écart, et la liste des écarts connus reste à jour. */
import { describe, expect, it } from "vitest";
import baseline from "../data/audit-baseline.json";
import { auditCard, effectNumbers, issueKey, paragraphs } from "../src/audit";
import { implementedCards } from "../src/index";

describe("audit Oracle ↔ script", () => {
  it("découpe le texte Oracle en paragraphes classés", () => {
    const kinds = (text: string, spell = false) => paragraphs(text, spell).map((p) => p.kind);
    expect(kinds("Flying, vigilance\nWhenever this creature attacks, draw a card.\n{2}, {T}: Add {G}.")).toEqual([
      "keywords",
      "triggered",
      "activated",
    ]);
    // Texte de rappel et mot d'aptitude retirés ; capacité citée : statique.
    expect(kinds("Landfall — Whenever a land you control enters, you gain 1 life.")).toEqual(["triggered"]);
    expect(kinds('Enchanted land has "{T}: Add {C}."')).toEqual(["static"]);
    // Un rituel ne décrit pas de capacité déclenchée.
    expect(kinds("When you next cast an instant spell this turn, copy it.", true)).toEqual(["spell"]);
    expect(kinds("+1: Draw a card.\n−3: Destroy target creature.")).toEqual(["activated", "activated"]);
    // Mots d'aptitude à chiffre ou à ponctuation (Descend 4, « No One Dies! ») : la capacité reste déclenchée.
    expect(
      kinds("Descend 4 — When this creature enters, if there are four or more permanent cards in your graveyard, draw a card."),
    ).toEqual(["triggered"]);
    expect(kinds("No One Dies! — When Spider-Man enters, you may tap him.")).toEqual(["triggered"]);
    // Les modes appartiennent au paragraphe qui les annonce.
    expect(kinds("When this creature enters, choose one —\n• Draw a card.\n• Scry 2.")).toEqual(["triggered", "mode", "mode"]);
    expect(kinds("Firebending 2\nBasic landcycling {2}")).toEqual(["keywords", "keywords"]);
  });

  it("compte les statiques portées par le script (capacités, champs, effets distincts d'une capacité)", () => {
    const base = implementedCards().find((c) => c.name === "Frenzied Baloth");
    expect(base && auditCard(base).filter((i) => i.kind === "static")).toEqual([]);
    if (!base) return;
    // Sans son champ « ne peut pas être contrecarré », une statique du texte n'est plus portée.
    const { cantBeCountered: _c, ...stripped } = base;
    expect(auditCard(stripped as typeof base).map((i) => i.kind)).toContain("static");
  });

  it("repère les nombres d'effet", () => {
    expect(effectNumbers("It deals 3 damage to any target. Draw two cards.")).toEqual([3, 2]);
    expect(effectNumbers("Put two +1/+1 counters on target creature.")).toEqual([2]);
    expect(effectNumbers("Target creature gets +3/+0 until end of turn.")).toEqual([3]);
  });

  it("aucune carte gérée n'a d'écart hors de la liste des écarts connus (data/audit-baseline.json)", () => {
    const known = baseline as Record<string, string>;
    const found = implementedCards()
      .filter((c) => !c.isToken)
      .flatMap(auditCard)
      .map(issueKey);
    expect(found.filter((k) => !(k in known))).toEqual([]);
    // Un écart corrigé doit sortir de la liste.
    expect(Object.keys(known).filter((k) => !found.includes(k))).toEqual([]);
  });
});
