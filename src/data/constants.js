// Shared numeric tables and enumerations for the rules engine.

export const ROUNDS = 8;

// Civilization upkeep revealed on the Influence Track when N discs are off the track (N = 1..13).
export const UPKEEP = [0, 0, 1, 2, 3, 5, 7, 10, 13, 17, 21, 25, 30];

// Printed values of the 13 spaces of a Population Track (left to right).
// Cubes sit on the rightmost spaces; production is the highest exposed number.
export const POP_TRACK = [2, 2, 3, 4, 6, 8, 10, 12, 15, 18, 21, 24, 28];
export const POP_TRACK_SIZE = POP_TRACK.length;
export const POP_CUBES_PER_TRACK = 11;

// Science discount by the number of techs already on a Tech Track (0..6).
export const TECH_DISCOUNT = [0, 1, 2, 3, 4, 6, 8];
export const TECH_TRACK_SIZE = 7;
// End-game VP by number of techs on a Tech Track (0..7).
export const TECH_TRACK_VP = [0, 0, 0, 0, 1, 2, 3, 5];

export const ACTIONS = ['explore', 'research', 'upgrade', 'build', 'move', 'influence'];
export const REACTIONS = ['upgrade', 'build', 'move'];

// Resource / population track keys. '$' is Money, 'S' is Science, 'M' is Materials.
export const RESOURCES = ['M', 'S', '$'];
export const RESOURCE_NAMES = { M: 'Materials', S: 'Science', $: 'Money' };

export const SHIP_TYPES = ['interceptor', 'cruiser', 'dreadnought', 'starbase'];
export const SHIP_NAMES = {
  interceptor: 'Interceptor',
  cruiser: 'Cruiser',
  dreadnought: 'Dreadnought',
  starbase: 'Starbase',
  ancient: 'Ancient',
  guardian: 'Guardian',
  gcds: 'GC Defense System',
};
// Relative value used to prioritise targets and for reputation draws.
export const SHIP_SIZE = { interceptor: 1, starbase: 1, cruiser: 2, dreadnought: 3, ancient: 1, guardian: 2, gcds: 3 };
export const SHIP_LIMITS = { interceptor: 8, cruiser: 4, dreadnought: 2, starbase: 4 };

export const NPC = -1; // owner id used for non-player ships

export const TECH_CATEGORIES = ['military', 'grid', 'nano'];

export const DIE_DAMAGE = { yellow: 1, orange: 2, blue: 3, red: 4 };

export const MAX_REPUTATION_DRAW = 5;
export const BASE_INFLUENCE_DISCS = 13;
export const PASS_BONUS_MONEY = 2;
