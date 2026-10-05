/**
 * Changement de nom (MTG Mate → Planecircle, 05/10/2026) : les clés « mtgmate.* » du localStorage (réglages, decks,
 * partie en cours, jeton en ligne, tutoriel…) deviennent « planecircle.* ». Importé en premier par main.tsx, avant
 * tout module qui lit ses clés au chargement. Une clé nouvelle déjà présente n'est pas écrasée.
 */
const OLD = "mtgmate.";
const NEW = "planecircle.";

try {
  const old: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(OLD)) old.push(key);
  }
  for (const key of old) {
    const target = NEW + key.slice(OLD.length);
    const value = localStorage.getItem(key);
    if (value !== null && localStorage.getItem(target) === null) localStorage.setItem(target, value);
    localStorage.removeItem(key);
  }
} catch {
  // Stockage bloqué (navigation privée, données refusées) : rien à reprendre.
}

export {};
