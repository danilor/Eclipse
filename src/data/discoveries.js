import { ANCIENT_PART_IDS } from './parts.js';

// Discovery Tiles (35 tiles; the Ancient Warp Portal belongs to the optional Warp Portal module).
// Reverse side of every tile is worth 2 VP.

export function buildDiscoveryTiles() {
  const tiles = [];
  const add = (count, proto) => {
    for (let i = 0; i < count; i++) tiles.push({ ...proto });
  };
  add(3, { kind: 'resources', gain: { M: 6 }, label: '+6 Materials' });
  add(3, { kind: 'resources', gain: { S: 5 }, label: '+5 Science' });
  add(3, { kind: 'resources', gain: { $: 8 }, label: '+8 Money' });
  add(2, { kind: 'resources', gain: { M: 2, S: 2, $: 3 }, label: '+2 Materials, +2 Science, +3 Money' });
  add(3, { kind: 'ancientTech', label: 'Ancient Tech' });
  add(3, { kind: 'ancientCruiser', label: 'Ancient Cruiser' });
  add(2, { kind: 'ancientOrbital', label: 'Ancient Orbital' });
  add(1, { kind: 'ancientMonolith', label: 'Ancient Monolith' });
  for (const part of ANCIENT_PART_IDS) add(2, { kind: 'ancientPart', part, label: 'Ancient Ship Part' });
  add(1, { kind: 'muon', part: 'muonSource', label: 'Muon Source' });
  return tiles.map((t, i) => ({ id: i + 1, ...t }));
}
