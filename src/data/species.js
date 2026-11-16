// Playable species (Terran factions and alien species), transcribed from the Species Boards.
//
// Blueprint slots list the pre-printed Ship Parts left to right; `null` is an empty Ship Part Space.
// `init` is the Ship Initiative Bonus; `innate` is anything printed outside the grid.

const STANDARD_COSTS = { interceptor: 3, cruiser: 5, dreadnought: 8, starbase: 3, orbital: 5, monolith: 10 };

const STANDARD_BLUEPRINTS = {
  interceptor: { init: 2, slots: ['ion', 'nuclearSource', 'nuclearDrive', null], innate: {} },
  cruiser: { init: 1, slots: ['electron', 'nuclearSource', 'ion', 'hull', 'nuclearDrive', null], innate: {} },
  dreadnought: {
    init: 0,
    slots: ['electron', 'nuclearSource', 'ion', 'hull', 'ion', 'hull', 'nuclearDrive', null],
    innate: {},
  },
  starbase: { init: 4, slots: ['electron', 'hull', 'ion', 'hull'], innate: { energy: 3 } },
};

const bp = (overrides = {}) => {
  const out = {};
  for (const type of Object.keys(STANDARD_BLUEPRINTS)) {
    out[type] = { ...STANDARD_BLUEPRINTS[type], slots: [...STANDARD_BLUEPRINTS[type].slots], ...(overrides[type] || {}) };
  }
  return out;
};

const terran = (id, name, home, color, bio) => ({
  id,
  name,
  group: 'terran',
  color,
  home,
  start: { M: 4, S: 3, $: 3 },
  colonyShips: 3,
  trade: 2,
  activations: { explore: 1, research: 1, upgrade: 2, build: 2, move: 3, influence: 2 },
  startTechs: { military: ['starbase'], grid: [], nano: [] },
  repSlots: 4,
  discs: 13,
  costs: { ...STANDARD_COSTS },
  blueprints: bp(),
  startShip: 'interceptor',
  traits: {},
  rules: ['3 Move Activations per Move Action.', 'Trade 2:1.'],
  bio,
});

export const SPECIES = {
  'terran-federation': terran(
    'terran-federation',
    'Terran Federation',
    '223',
    0x4da3ff,
    'Numerous state systems with similar ideals who work efficiently together in time of need.'
  ),
  'terran-directorate': terran(
    'terran-directorate',
    'Terran Directorate',
    '221',
    0xff5d5d,
    'A strong-handed, well-off civilization led by carefully chosen Directors.'
  ),
  'terran-union': terran(
    'terran-union',
    'Terran Union',
    '225',
    0x4cd964,
    'Stood tall in hard times through strong diplomacy and careful neutrality.'
  ),
  'terran-republic': terran(
    'terran-republic',
    'Terran Republic',
    '227',
    0xffd23f,
    'A democratically ruled society enjoying a stable and prosperous life.'
  ),
  'terran-conglomerate': terran(
    'terran-conglomerate',
    'Terran Conglomerate',
    '229',
    0xc77dff,
    'Backed by corporations eager to invest in deep space colonies.'
  ),
  'terran-alliance': terran(
    'terran-alliance',
    'Terran Alliance',
    '231',
    0xe6e6e6,
    'United against a common enemy, the Alliance holds strong through old treaties.'
  ),

  eridani: {
    id: 'eridani',
    name: 'Eridani Empire',
    group: 'alien',
    color: 0xff9f43,
    home: '222',
    start: { M: 4, S: 2, $: 26 },
    colonyShips: 3,
    trade: 3,
    activations: { explore: 1, research: 1, upgrade: 2, build: 2, move: 2, influence: 2 },
    startTechs: { military: ['plasmaCannon'], grid: ['gaussShield'], nano: ['fusionDrive'] },
    repSlots: 4,
    discs: 11,
    costs: { ...STANDARD_COSTS, orbital: 4 },
    blueprints: bp({
      interceptor: { innate: { energy: 1 } },
      cruiser: { innate: { energy: 1 } },
      dreadnought: { innate: { energy: 1 } },
    }),
    startShip: 'interceptor',
    traits: { startReputation: 2 },
    rules: [
      'Start with two random Reputation Tiles.',
      'Start with two fewer Influence Discs.',
      'Interceptor, Cruiser and Dreadnought Blueprints have +1 Energy.',
      'Starts with 26 Money.',
    ],
    bio: 'The Forever Emperor is gone and the capital system is depleted, but the Heirs have not given up hope.',
  },

  hydran: {
    id: 'hydran',
    name: 'Hydran Progress',
    group: 'alien',
    color: 0x2ec4b6,
    home: '224',
    start: { M: 2, S: 6, $: 2 },
    colonyShips: 3,
    trade: 3,
    activations: { explore: 1, research: 2, upgrade: 2, build: 2, move: 2, influence: 2 },
    startTechs: { military: [], grid: [], nano: ['advancedLabs'] },
    repSlots: 3,
    discs: 13,
    costs: { ...STANDARD_COSTS, orbital: 4 },
    blueprints: bp(),
    startShip: 'interceptor',
    traits: { startPopulation: ['S*'] },
    rules: ['2 Research Activations per Research Action.', 'Starts with a Population Cube on the Advanced Science square.'],
    bio: 'Never satisfied, the Progress are ever striving further; their technological progress is unparalleled.',
  },

  planta: {
    id: 'planta',
    name: 'Planta',
    group: 'alien',
    color: 0x8fd14f,
    home: '226',
    start: { M: 4, S: 3, $: 2 },
    colonyShips: 4,
    trade: 3,
    activations: { explore: 2, research: 1, upgrade: 2, build: 2, move: 2, influence: 2 },
    startTechs: { military: ['starbase'], grid: [], nano: [] },
    repSlots: 3,
    discs: 13,
    costs: { ...STANDARD_COSTS, orbital: 4 },
    blueprints: bp({
      interceptor: { init: 0, slots: ['ion', 'nuclearSource', 'nuclearDrive'], innate: { computer: 1, energy: 2 } },
      cruiser: {
        init: 0,
        slots: ['nuclearSource', 'ion', 'hull', 'nuclearDrive', null],
        innate: { computer: 1, energy: 2 },
      },
      dreadnought: {
        init: 0,
        slots: ['nuclearSource', 'ion', 'hull', 'ion', 'hull', 'nuclearDrive', null],
        innate: { computer: 1, energy: 2 },
      },
      starbase: { init: 2, slots: ['electron', 'ion', 'hull', 'hull'], innate: { computer: 1, energy: 5 } },
    }),
    startShip: 'interceptor',
    traits: { populationVulnerable: true, vpPerSector: 1 },
    rules: [
      '2 Explore Activations per Explore Action; 4 Colony Ships.',
      'Your Population Cubes are destroyed by enemy Ships at the end of the Combat Phase.',
      '+1 VP for each Controlled Sector at the end of the game.',
      'Reduced Initiative, extra Computers and Energy, but one less Ship Part Space.',
    ],
    bio: 'A moss-like species with distributed sentience, the Planta are phenomenal navigators.',
  },

  draco: {
    id: 'draco',
    name: 'Descendants of Draco',
    group: 'alien',
    color: 0xe5484d,
    home: '228',
    start: { M: 3, S: 4, $: 2 },
    colonyShips: 3,
    trade: 3,
    activations: { explore: 1, research: 1, upgrade: 2, build: 2, move: 2, influence: 2 },
    startTechs: { military: [], grid: [], nano: ['fusionDrive'] },
    repSlots: 4,
    discs: 13,
    costs: { ...STANDARD_COSTS, orbital: 4 },
    blueprints: bp(),
    startShip: 'interceptor',
    traits: { exploreDrawTwo: true, vpPerAncient: 1, ancientsFriendly: true },
    rules: [
      'Explore: flip two Sectors per Activation and choose one (or none) to place.',
      '1 VP per Ancient on the game board at the end of the game.',
      'Ships may share Sectors with Ancients without battle, and you may place Influence there.',
      'You cannot collect Discovery Tiles from Sectors containing Ancients.',
    ],
    bio: 'Rumoured to be directly related to the Ancients, the Descendants survive contact with them far better.',
  },

  mechanema: {
    id: 'mechanema',
    name: 'Mechanema',
    group: 'alien',
    color: 0xb0b7c3,
    home: '230',
    start: { M: 4, S: 3, $: 3 },
    colonyShips: 3,
    trade: 3,
    activations: { explore: 1, research: 1, upgrade: 3, build: 3, move: 2, influence: 2 },
    startTechs: { military: [], grid: ['positronComputer'], nano: [] },
    repSlots: 4,
    discs: 13,
    costs: { interceptor: 2, cruiser: 4, dreadnought: 7, starbase: 2, orbital: 3, monolith: 8 },
    blueprints: bp(),
    startShip: 'interceptor',
    traits: {},
    rules: ['3 Upgrade and 3 Build Activations per Action.', 'Cheaper ships and structures.'],
    bio: 'Artificial intelligences of many species, the Mechanema designed the basic ship types used by everyone.',
  },

  orion: {
    id: 'orion',
    name: 'Orion Hegemony',
    group: 'alien',
    color: 0xff6b9d,
    home: '232',
    start: { M: 4, S: 3, $: 3 },
    colonyShips: 3,
    trade: 4,
    activations: { explore: 1, research: 1, upgrade: 2, build: 2, move: 2, influence: 2 },
    startTechs: { military: ['neutronBombs'], grid: ['gaussShield'], nano: [] },
    repSlots: 5,
    discs: 13,
    costs: { ...STANDARD_COSTS },
    blueprints: bp({
      interceptor: { init: 3, slots: ['ion', 'nuclearSource', 'nuclearDrive', 'gaussShield'], innate: { energy: 1 } },
      cruiser: {
        init: 2,
        slots: ['electron', 'nuclearSource', 'ion', 'hull', 'nuclearDrive', 'gaussShield'],
        innate: { energy: 2 },
      },
      dreadnought: {
        init: 1,
        slots: ['electron', 'nuclearSource', 'ion', 'hull', 'ion', 'hull', 'nuclearDrive', 'gaussShield'],
        innate: { energy: 3 },
      },
      starbase: { init: 5, slots: ['electron', 'hull', 'ion', 'gaussShield', 'hull'], innate: { energy: 3 } },
    }),
    startShip: 'cruiser',
    traits: {},
    rules: [
      'Start with a Cruiser instead of an Interceptor.',
      'Increased Initiative; Gauss Shields pre-installed; extra Energy on Blueprints.',
      'Trade 4:1; extra Reputation Track space.',
    ],
    bio: 'A ruthlessly efficient war machine turned benevolent member of the Galactic Council.',
  },
};

export const SPECIES_LIST = Object.values(SPECIES);

export function speciesColor(id) {
  return SPECIES[id].color;
}
