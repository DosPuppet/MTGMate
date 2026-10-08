/**
 * Name change (MTG Mate → Planecircle, 2026-10-05): the "mtgmate.*" keys of localStorage (settings, decks, game in
 * progress, online token, tutorial…) become "planecircle.*". Imported first by main.tsx, before any module that reads
 * its keys on load. A new key already present is not overwritten.
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
  // Storage blocked (private browsing, data refused): nothing to carry over.
}

export {};
