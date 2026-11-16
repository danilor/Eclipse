// User preferences shared by every scene and persisted in localStorage.
const KEY = 'eclipse.settings.v1';

export const SPEEDS = { slow: 900, normal: 450, fast: 120, instant: 0 };

const defaults = { speed: 'normal', skipReactions: false };

function load() {
  try {
    const raw = JSON.parse(globalThis.localStorage?.getItem(KEY) ?? 'null');
    if (raw && SPEEDS[raw.speed] !== undefined) return { ...defaults, ...raw };
  } catch {
    /* ignore corrupt storage */
  }
  return { ...defaults };
}

export const settings = load();

export function saveSettings() {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* storage may be unavailable */
  }
}

export const speedMs = () => SPEEDS[settings.speed] ?? SPEEDS.normal;
