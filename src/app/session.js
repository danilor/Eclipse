import { SPECIES } from '../data/species.js';

const SAVE_KEY = 'eclipse.save.v1';

// Configuration of a match: the human seat first, then one seat per computer opponent. Every opponent
// names the AI (see ai/registry.js) that plays it, so a match can mix different opponents. The rules
// engine currently ships the two-player galaxy layout only, so the menu offers exactly one opponent.
export function matchConfig({ seed = Date.now() % 1000000, human, opponents, events = true }) {
  const players = [
    { species: human, name: SPECIES[human].name, kind: 'human' },
    ...opponents.map((o) => ({ species: o.species, name: SPECIES[o.species].name, kind: 'ai', ai: o.ai ?? 'heuristic' })),
  ];
  return { seed, players, options: { events } };
}

export function saveGame(game) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(game.serialize()));
  } catch {
    // Storage may be unavailable or full; the game simply cannot be resumed then.
  }
}

export function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return data?.config && Array.isArray(data.cmdLog) ? data : null;
  } catch {
    return null;
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // ignore
  }
}

// Short description of a saved game for the menu ("Terran Federation vs Planta").
export function describeSave(data) {
  const names = data.config.players.map((p) => SPECIES[p.species]?.name ?? p.species);
  return `${names.join(' vs ')} \u00b7 ${data.cmdLog.length} moves`;
}

export function urlOptions() {
  const q = new URLSearchParams(window.location.search);
  return {
    autoplay: q.has('autoplay'),
    quick: q.has('quick') || q.has('autoplay'),
    seed: q.has('seed') ? Number(q.get('seed')) : null,
    speed: q.get('speed'),
    species: q.get('species'),
    versus: q.get('versus'),
    ai: q.get('ai'),
  };
}
