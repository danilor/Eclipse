// Small seedable PRNG so games are reproducible (tests, AI-vs-AI simulations, bug reports).
// The generator state lives inside the plain game state (`state.rng`) so it can be cloned.

export function createRng(seed = Date.now()) {
  return { s: (seed >>> 0) || 1 };
}

// mulberry32
export function rngNext(rng) {
  rng.s = (rng.s + 0x6d2b79f5) >>> 0;
  let t = rng.s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function rngInt(rng, n) {
  return Math.floor(rngNext(rng) * n);
}

export function rngD6(rng) {
  return rngInt(rng, 6) + 1;
}

export function rngPick(rng, arr) {
  return arr[rngInt(rng, arr.length)];
}

export function rngShuffle(rng, arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = rngInt(rng, i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
