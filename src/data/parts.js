// Ship parts. `energy` is positive for sources and negative for consumers.
// `dice` are cannon dice, `missiles` are missile dice (fired once at the start of a battle).
// Ancient parts and the Muon Source have no published stats in the rulebook text, so these are
// approximations (see RoadMap.md).

const part = (id, name, props = {}) => ({
  id,
  name,
  tech: null,
  energy: 0,
  computer: 0,
  shield: 0,
  hull: 0,
  drive: 0,
  init: 0,
  dice: {},
  missiles: {},
  kind: 'basic',
  ...props,
});

const list = [
  // Basic parts: always available.
  part('electron', 'Electron Computer', { computer: 1 }),
  part('hull', 'Hull', { hull: 1 }),
  part('ion', 'Ion Cannon', { dice: { yellow: 1 }, energy: -1 }),
  part('nuclearDrive', 'Nuclear Drive', { drive: 1, energy: -1, init: 1 }),
  part('nuclearSource', 'Nuclear Source', { energy: 3 }),

  // Military techs
  part('plasmaCannon', 'Plasma Cannon', { tech: 'plasmaCannon', kind: 'tech', dice: { orange: 1 }, energy: -2 }),
  part('phaseShield', 'Phase Shield', { tech: 'phaseShield', kind: 'tech', shield: 2, energy: -1 }),
  part('tachyonSource', 'Tachyon Source', { tech: 'tachyonSource', kind: 'tech', energy: 9 }),
  part('gluonComputer', 'Gluon Computer', { tech: 'gluonComputer', kind: 'tech', computer: 3, energy: -2 }),
  part('plasmaMissile', 'Plasma Missile', { tech: 'plasmaMissile', kind: 'tech', missiles: { orange: 2 }, energy: -1 }),

  // Grid techs
  part('gaussShield', 'Gauss Shield', { tech: 'gaussShield', kind: 'tech', shield: 1 }),
  part('fusionSource', 'Fusion Source', { tech: 'fusionSource', kind: 'tech', energy: 6 }),
  part('improvedHull', 'Improved Hull', { tech: 'improvedHull', kind: 'tech', hull: 2 }),
  part('positronComputer', 'Positron Computer', { tech: 'positronComputer', kind: 'tech', computer: 2, energy: -1 }),
  part('tachyonDrive', 'Tachyon Drive', { tech: 'tachyonDrive', kind: 'tech', drive: 3, energy: -3, init: 3 }),
  part('antimatterCannon', 'Antimatter Cannon', { tech: 'antimatterCannon', kind: 'tech', dice: { red: 1 }, energy: -4 }),

  // Nano techs
  part('fusionDrive', 'Fusion Drive', { tech: 'fusionDrive', kind: 'tech', drive: 2, energy: -2, init: 2 }),

  // Rare techs
  part('fluxMissile', 'Flux Missile', { tech: 'fluxMissile', kind: 'rare', missiles: { yellow: 2 } }),
  part('solitonCannon', 'Soliton Cannon', { tech: 'solitonCannon', kind: 'rare', dice: { blue: 1 }, energy: -3 }),
  part('sentientHull', 'Sentient Hull', { tech: 'sentientHull', kind: 'rare', hull: 1, computer: 1 }),
  part('conifoldField', 'Conifold Field', { tech: 'conifoldField', kind: 'rare', hull: 3, energy: -2 }),
  part('absorptionShield', 'Absorption Shield', { tech: 'absorptionShield', kind: 'rare', shield: 1, energy: 4 }),
  part('transitionDrive', 'Transition Drive', { tech: 'transitionDrive', kind: 'rare', drive: 3 }),
  part('zeroPointSource', 'Zero-Point Source', { tech: 'zeroPointSource', kind: 'rare', energy: 12 }),

  // Ancient parts (found on Discovery Tiles; two of each type)
  part('ancientIonTurret', 'Ion Turret', { kind: 'ancient', dice: { yellow: 2 }, energy: -2 }),
  part('ancientPlasmaTurret', 'Plasma Turret', { kind: 'ancient', dice: { orange: 2 }, energy: -3 }),
  part('ancientAxionComputer', 'Axion Computer', { kind: 'ancient', computer: 3, energy: -2, init: 2 }),
  part('ancientHypergridSource', 'Hypergrid Source', { kind: 'ancient', energy: 11 }),
  part('ancientConformalDrive', 'Conformal Drive', { kind: 'ancient', drive: 4, energy: -2, init: 3 }),
  part('ancientFluxShield', 'Flux Shield', { kind: 'ancient', shield: 3, energy: -1 }),
  part('ancientShardHull', 'Shard Hull', { kind: 'ancient', hull: 3 }),

  // Muon Source: placed outside the blueprint grid, never replaceable.
  part('muonSource', 'Muon Source', { kind: 'ancient', energy: 4 }),
];

export const PARTS = Object.fromEntries(list.map((p) => [p.id, p]));
export const ANCIENT_PART_IDS = list.filter((p) => p.kind === 'ancient' && p.id !== 'muonSource').map((p) => p.id);

export function isAncientPart(id) {
  return PARTS[id]?.kind === 'ancient';
}

export function isDrive(id) {
  return !!PARTS[id] && PARTS[id].drive > 0;
}
