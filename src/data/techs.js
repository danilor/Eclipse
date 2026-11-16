// Technology tiles. `cost` is the printed Science cost, `min` the minimum cost after discounts.
// `count` is the number of copies in the Tech Tile Bag (rare techs exist once).

const t = (id, name, category, cost, min, count, extra = {}) => ({
  id,
  name,
  category, // 'military' | 'grid' | 'nano' | 'rare'
  cost,
  min,
  count,
  rare: category === 'rare',
  ...extra,
});

const list = [
  // Military
  t('neutronBombs', 'Neutron Bombs', 'military', 2, 2, 5, { text: 'Attacking Population destroys every cube in the Sector.' }),
  t('starbase', 'Starbase', 'military', 4, 3, 5, { text: 'You may build Starbases.' }),
  t('plasmaCannon', 'Plasma Cannon', 'military', 6, 4, 5, { part: 'plasmaCannon' }),
  t('phaseShield', 'Phase Shield', 'military', 8, 5, 5, { part: 'phaseShield' }),
  t('advancedMining', 'Advanced Mining', 'military', 10, 6, 4, { text: 'Place cubes on Advanced Materials squares.' }),
  t('tachyonSource', 'Tachyon Source', 'military', 12, 6, 3, { part: 'tachyonSource' }),
  t('gluonComputer', 'Gluon Computer', 'military', 14, 7, 3, { part: 'gluonComputer' }),
  t('plasmaMissile', 'Plasma Missile', 'military', 16, 8, 3, { part: 'plasmaMissile' }),

  // Grid
  t('gaussShield', 'Gauss Shield', 'grid', 2, 2, 5, { part: 'gaussShield' }),
  t('fusionSource', 'Fusion Source', 'grid', 4, 3, 5, { part: 'fusionSource' }),
  t('improvedHull', 'Improved Hull', 'grid', 6, 4, 5, { part: 'improvedHull' }),
  t('positronComputer', 'Positron Computer', 'grid', 8, 5, 5, { part: 'positronComputer' }),
  t('advancedEconomy', 'Advanced Economy', 'grid', 10, 6, 4, { text: 'Place cubes on Advanced Money squares.' }),
  t('tachyonDrive', 'Tachyon Drive', 'grid', 12, 6, 3, { part: 'tachyonDrive' }),
  t('antimatterCannon', 'Antimatter Cannon', 'grid', 14, 7, 3, { part: 'antimatterCannon' }),
  t('quantumGrid', 'Quantum Grid', 'grid', 16, 8, 3, { text: '+2 Influence Discs, placed on your Influence Track.' }),

  // Nano
  t('nanorobots', 'Nanorobots', 'nano', 2, 2, 5, { text: '+1 Activation on every Build Action.' }),
  t('fusionDrive', 'Fusion Drive', 'nano', 4, 3, 5, { part: 'fusionDrive' }),
  t('orbital', 'Orbital', 'nano', 6, 4, 5, { text: 'You may build Orbitals.' }),
  t('advancedRobotics', 'Advanced Robotics', 'nano', 8, 5, 5, { text: '+1 Influence Disc, placed on your Influence Track.' }),
  t('advancedLabs', 'Advanced Labs', 'nano', 10, 6, 4, { text: 'Place cubes on Advanced Science squares.' }),
  t('monolith', 'Monolith', 'nano', 12, 6, 3, { text: 'You may build Monoliths (3 VP each).' }),
  t('wormholeGenerator', 'Wormhole Generator', 'nano', 14, 7, 3, {
    text: 'Explore, Move to and Influence adjacent Sectors if the shared edge has at least one Wormhole.',
  }),
  t('artifactKey', 'Artifact Key', 'nano', 16, 8, 3, { text: 'Gain 5 resources of one type per Artifact on Sectors you control.' }),

  // Rare (one copy each)
  t('antimatterSplitter', 'Antimatter Splitter', 'rare', 5, 5, 1, { text: 'Split Antimatter Cannon damage freely.' }),
  t('conifoldField', 'Conifold Field', 'rare', 5, 5, 1, { part: 'conifoldField' }),
  t('neutronAbsorber', 'Neutron Absorber', 'rare', 5, 5, 1, { text: 'Enemy Neutron Bombs have no effect on you.' }),
  t('absorptionShield', 'Absorption Shield', 'rare', 7, 6, 1, { part: 'absorptionShield' }),
  t('cloakingDevice', 'Cloaking Device', 'rare', 7, 6, 1, { text: 'Two enemy Ships are needed to Pin each of your Ships.' }),
  t('improvedLogistics', 'Improved Logistics', 'rare', 7, 6, 1, { text: '+1 Move Activation on every Move Action.' }),
  t('sentientHull', 'Sentient Hull', 'rare', 7, 6, 1, { part: 'sentientHull' }),
  t('solitonCannon', 'Soliton Cannon', 'rare', 9, 7, 1, { part: 'solitonCannon' }),
  t('transitionDrive', 'Transition Drive', 'rare', 9, 7, 1, { part: 'transitionDrive' }),
  t('fluxMissile', 'Flux Missile', 'rare', 11, 8, 1, { part: 'fluxMissile' }),
  t('picoModulator', 'Pico Modulator', 'rare', 11, 8, 1, { text: '+2 Activations on every Upgrade Action.' }),
  t('ancientLabs', 'Ancient Labs', 'rare', 13, 9, 1, { text: 'Immediately draw and resolve a Discovery Tile.' }),
  t('zeroPointSource', 'Zero-Point Source', 'rare', 15, 10, 1, { part: 'zeroPointSource' }),
  t('metasynthesis', 'Metasynthesis', 'rare', 17, 11, 1, { text: 'Place cubes on any Advanced Population Square.' }),
];

export const TECHS = Object.fromEntries(list.map((x) => [x.id, x]));
export const TECH_LIST = list;

// Tech needed to colonise an advanced square of each kind.
export const ADVANCED_TECH = { M: 'advancedMining', S: 'advancedLabs', $: 'advancedEconomy' };

export const BUILD_TECH = { starbase: 'starbase', orbital: 'orbital', monolith: 'monolith' };
