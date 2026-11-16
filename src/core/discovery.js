import { TECHS } from '../data/techs.js';
import { RESOURCES, SHIP_LIMITS, SHIP_TYPES } from '../data/constants.js';
import { addShip } from './setup.js';
import { shipCount } from './queries.js';
import { ancientTechChoices, gainTech, ancientPlacementOptions, applyUpgrade } from './rules.js';

export function discoveryCanUse(s, p, tile, at) {
  switch (tile.kind) {
    case 'ancientTech':
      return ancientTechChoices(s, p).length > 0;
    case 'ancientCruiser':
      return shipCount(s, p.id, 'cruiser') < SHIP_LIMITS.cruiser;
    case 'ancientOrbital':
      return !s.map[at].orbital;
    case 'ancientMonolith':
      return !s.map[at].monolith;
    case 'muon':
      return SHIP_TYPES.some((bp) => !p.blueprints[bp].extras.includes('muonSource'));
    default:
      return true;
  }
}

// Discards or keeps (2 VP) a discovery tile that a player has just claimed.
export function* resolveDiscovery(g, pid, tile, at) {
  const s = g.state;
  const p = s.players[pid];
  g.log(`${p.name} claims a Discovery Tile: ${tile.label}.`);
  g.emit('discovery', { pid, tile, at });

  const options = [{ type: 'keep' }];
  if (discoveryCanUse(s, p, tile, at)) options.unshift({ type: 'use' });
  const cmd = options.length === 1 ? options[0] : yield g.ask(pid, 'discovery', { tile, at }, options);

  if (cmd.type === 'keep') {
    p.vpDisc += 1;
    g.log(`${p.name} keeps the tile for 2 victory points.`);
    return;
  }

  switch (tile.kind) {
    case 'resources':
      for (const r of RESOURCES) p.res[r] += tile.gain[r] || 0;
      break;
    case 'ancientTech': {
      const choices = ancientTechChoices(s, p);
      let tech = choices[0];
      if (choices.length > 1) {
        const pick = yield g.ask(
          pid,
          'chooseTech',
          { reason: 'ancientTech' },
          choices.map((id) => ({ type: 'tech', tech: id }))
        );
        tech = pick.tech;
      }
      gainTech(s, p, tech, TECHS[tech].category);
      g.log(`${p.name} gains ${TECHS[tech].name}.`);
      break;
    }
    case 'ancientCruiser':
      addShip(s, pid, 'cruiser', at);
      break;
    case 'ancientOrbital':
      s.map[at].orbital = true;
      p.res.M += 2;
      break;
    case 'ancientMonolith':
      s.map[at].monolith = true;
      break;
    case 'ancientPart': {
      p.ancientParts.push(tile.part);
      const placements = ancientPlacementOptions(p, tile.part);
      if (placements.length) {
        const pick = yield g.ask(pid, 'ancientPart', { part: tile.part }, [{ type: 'stash' }, ...placements]);
        if (pick.type === 'upgrade') applyUpgrade(p, pick);
      }
      break;
    }
    case 'muon': {
      const free = SHIP_TYPES.filter((bp) => !p.blueprints[bp].extras.includes('muonSource'));
      const pick = free.length === 1 ? { bp: free[0] } : yield g.ask(pid, 'muon', {}, free.map((bp) => ({ type: 'muon', bp })));
      p.blueprints[pick.bp].extras.push('muonSource');
      break;
    }
    default:
      break;
  }
  s.discoveryDiscard.push(tile);
}
